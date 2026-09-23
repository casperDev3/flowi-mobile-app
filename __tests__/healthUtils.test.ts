import {
  HealthEntry, HealthProfile, WorkoutCalorieRecord,
  bmiCategory, burnedForDay, calcBMI, calcBMR, calcCalorieDay, calcCalorieTarget, calcProteinTarget, calcTDEE, calcWaterTarget,
  clampProfileRanges, computeGoals, estimateBodyFatNavy, getWeeklyInsights, hasHealthKitBurn, lastForDay, latestValue,
  leanMass, maxHR, stepsToKm, sumForDay, workoutCaloriesForDay,
  waistToHeightRatio, waistToHipRatio, whrHealthy, whtrCategory,
} from '@/utils/healthUtils';

const maleProfile: HealthProfile = { sex: 'male', age: 30, heightCm: 180, activity: 'moderate', goal: 'maintain' };
const femaleProfile: HealthProfile = { ...maleProfile, sex: 'female' };

const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

describe('healthUtils — розрахунки', () => {
  test('calcBMR (Mifflin-St Jeor)', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(calcBMR(maleProfile, 80)).toBe(1780);
    // жінки: -161 замість +5 → 1614
    expect(calcBMR(femaleProfile, 80)).toBe(1614);
  });

  test('calcTDEE та цілі калорій', () => {
    expect(calcTDEE(maleProfile, 80)).toBe(Math.round(1780 * 1.55)); // 2759
    expect(calcCalorieTarget(maleProfile, 80)).toBe(2759); // maintain
    expect(calcCalorieTarget({ ...maleProfile, goal: 'lose' }, 80)).toBe(2259);
    expect(calcCalorieTarget({ ...maleProfile, goal: 'gain' }, 80)).toBe(3059);
  });

  test('білок / вода', () => {
    expect(calcProteinTarget({ ...maleProfile, goal: 'maintain' }, 80)).toBe(128);
    expect(calcProteinTarget({ ...maleProfile, goal: 'lose' }, 80)).toBe(160);
    expect(calcWaterTarget(70)).toBe(2450);
    expect(calcWaterTarget(80)).toBe(2800);
  });

  test('ІМТ і категорії', () => {
    expect(calcBMI(80, 200)).toBeCloseTo(20, 5);
    expect(bmiCategory(17)).toBe('underweight');
    expect(bmiCategory(22)).toBe('normal');
    expect(bmiCategory(27)).toBe('overweight');
    expect(bmiCategory(32)).toBe('obese');
  });

  test('maxHR та дистанція кроків', () => {
    expect(maxHR(30)).toBe(190);
    expect(stepsToKm(1000, 175)).toBeCloseTo(0.7245, 3);
  });

  test('computeGoals — fallback без профілю', () => {
    const g = computeGoals(null, 70);
    expect(g.calories).toBe(2200);
    expect(g.protein).toBe(112);
    expect(g.water).toBe(2000);
    expect(g.steps).toBe(10000);
    expect(g.sleep).toBe(480);
  });

  test('computeGoals — з профілем', () => {
    const g = computeGoals(maleProfile, 80);
    expect(g.calories).toBe(2759);
    expect(g.protein).toBe(128);
    expect(g.water).toBe(2800);
  });
});

describe('healthUtils — агрегати', () => {
  const today = new Date();
  // newest-first (як зберігає addEntry): найсвіжіша вага 79.5 — перша
  const entries: HealthEntry[] = [
    { id: '4', type: 'weight', value: 79.5, date: today.toISOString() },
    { id: '3', type: 'weight', value: 80, date: today.toISOString() },
    { id: '1', type: 'water', value: 250, date: today.toISOString() },
    { id: '2', type: 'water', value: 500, date: today.toISOString() },
    { id: '5', type: 'water', value: 999, date: daysAgoIso(3) },
  ];

  test('sumForDay підсумовує лише сьогодні', () => {
    expect(sumForDay(entries, 'water', today)).toBe(750);
  });

  test('lastForDay повертає найсвіжіше значення дня', () => {
    expect(lastForDay(entries, 'weight', today)).toBe(79.5);
    expect(lastForDay(entries, 'pulse', today)).toBeNull();
  });
});

describe('healthUtils — тижневі інсайти', () => {
  test('виявляє зростання кроків тиждень-до-тижня', () => {
    const entries: HealthEntry[] = [];
    // поточний тиждень: 10000 кроків/день
    for (let i = 0; i < 7; i++) entries.push({ id: `c${i}`, type: 'steps', value: 10000, date: daysAgoIso(i) });
    // попередній тиждень: 8000 кроків/день
    for (let i = 7; i < 14; i++) entries.push({ id: `p${i}`, type: 'steps', value: 8000, date: daysAgoIso(i) });

    const insights = getWeeklyInsights(entries);
    const steps = insights.find(i => i.type === 'steps');
    expect(steps).toBeDefined();
    expect(steps!.deltaPct).toBe(25); // (10000-8000)/8000 = +25%
    expect(steps!.good).toBe(true);   // більше кроків — добре
  });

  test('ігнорує зміни < 5%', () => {
    const entries: HealthEntry[] = [];
    for (let i = 0; i < 7; i++) entries.push({ id: `c${i}`, type: 'water', value: 2050, date: daysAgoIso(i) });
    for (let i = 7; i < 14; i++) entries.push({ id: `p${i}`, type: 'water', value: 2000, date: daysAgoIso(i) });
    expect(getWeeklyInsights(entries).find(i => i.type === 'water')).toBeUndefined();
  });
});

describe('healthUtils — заміри тіла', () => {
  test('WHtR і категорія', () => {
    expect(waistToHeightRatio(85, 170)).toBeCloseTo(0.5, 5);
    expect(waistToHeightRatio(null, 170)).toBeNull();
    expect(whtrCategory(0.45)).toBe('healthy');
    expect(whtrCategory(0.55)).toBe('increased');
    expect(whtrCategory(0.65)).toBe('high');
  });

  test('WHR і норма за статтю', () => {
    expect(waistToHipRatio(85, 100)).toBeCloseTo(0.85, 5);
    expect(waistToHipRatio(85, null)).toBeNull();
    expect(whrHealthy(0.85, 'male')).toBe(true);    // < 0.9
    expect(whrHealthy(0.85, 'female')).toBe(false); // не < 0.85
  });

  test('суха маса', () => {
    expect(leanMass(80, 20)).toBeCloseTo(64, 5);
  });

  test('оцінка % жиру US Navy (ч)', () => {
    const bf = estimateBodyFatNavy('male', 180, 38, 85, null);
    expect(bf).not.toBeNull();
    expect(bf!).toBeGreaterThan(13);
    expect(bf!).toBeLessThan(19);
  });

  test('US Navy повертає null за браку даних / нелогічних обводів', () => {
    expect(estimateBodyFatNavy('male', 180, null, 85, null)).toBeNull();
    expect(estimateBodyFatNavy('male', 180, 90, 85, null)).toBeNull(); // шия ≥ талія
    expect(estimateBodyFatNavy('female', 170, 34, 70, null)).toBeNull(); // ж без стегон
  });
});

// ─── Калорії доби ────────────────────────────────────────────────────────────
//
// Замінили `calcNetCalories` (|з'їдено − спалене| проти ліміту ЇЖІ). Модуль
// ховав знак: день без жодного запису їжі й із 500 спаленими показував «500
// з'їдених» і з'їдав чверть кільця. Тепер три незалежні числа, і саме це
// нижче й перевіряється — спалене НЕ підмішується в кільце прогресу.

describe('burnedForDay — два джерела спаленого без подвійного рахунку', () => {
  const DAY = new Date(2026, 8, 3, 12, 0, 0);
  const at = (hour: number, dayOffset = 0) => new Date(2026, 8, 3 + dayOffset, hour, 0, 0).toISOString();

  const out = (over: Partial<HealthEntry> & { id: string; value: number }): HealthEntry =>
    ({ type: 'calories_out', date: at(10), ...over });
  const workout = (calories: number | undefined, dayOffset = 0): WorkoutCalorieRecord =>
    ({ calories, date: at(9, dayOffset) });

  test('без HealthKit джерела незалежні — ручний запис і тренування СКЛАДАЮТЬСЯ', () => {
    // Ручний ввід «спалив 300» і журнал тренувань — різні події: людина
    // записала пробіжку в трекер і окремо відмітила активність.
    const entries = [out({ id: 'm', value: 300, source: 'manual' })];
    expect(burnedForDay(entries, [workout(250)], DAY)).toBe(550);
  });

  test('HealthKit-запис + тренування — МАКСИМУМ, а не сума', () => {
    // Apple Health віддає повний добовий агрегат активних калорій, і та сама
    // пробіжка вже сидить у ньому. Сума порахувала б її двічі й роздула
    // «залишок» на пів вечері.
    const entries = [out({ id: 'hk', value: 600, source: 'healthkit' })];
    expect(burnedForDay(entries, [workout(250)], DAY)).toBe(600);
  });

  test('максимум береться в обидва боки: тренування більше за агрегат HealthKit', () => {
    const entries = [out({ id: 'hk', value: 180, source: 'healthkit' })];
    expect(burnedForDay(entries, [workout(400)], DAY)).toBe(400);
  });

  test('легасі-запис HealthKit упізнається за нотаткою __hk__, а не лише за source', () => {
    // Записи, створені до появи поля `source`, мають тільки нотатку. Якби
    // вони рахувались «ручними», тренування додалось би згори — подвоєння.
    const entries = [out({ id: 'old', value: 500, note: '__hk__' })];
    expect(hasHealthKitBurn(entries, DAY)).toBe(true);
    expect(burnedForDay(entries, [workout(300)], DAY)).toBe(500);
  });

  test('без тренувань — просто сума записів дня, HealthKit там чи ні', () => {
    expect(burnedForDay([out({ id: 'hk', value: 600, source: 'healthkit' })], [], DAY)).toBe(600);
    expect(burnedForDay([out({ id: 'm', value: 120, source: 'manual' })], [], DAY)).toBe(120);
  });

  test('без жодного джерела — нуль, а не NaN', () => {
    expect(burnedForDay([], [], DAY)).toBe(0);
    expect(hasHealthKitBurn([], DAY)).toBe(false);
  });

  test('тренування без калорій і тренування ІНШОГО дня в зачіт не йдуть', () => {
    const entries = [out({ id: 'm', value: 100, source: 'manual' })];
    const workouts = [workout(undefined), workout(0), workout(Number.NaN), workout(500, 1)];
    expect(workoutCaloriesForDay(workouts, DAY)).toBe(0);
    // Жодних калорій із тренувань → шлях «максимум/сума» не вмикається взагалі.
    expect(burnedForDay(entries, workouts, DAY)).toBe(100);
  });

  test('тренування дня підсумовуються між собою', () => {
    expect(workoutCaloriesForDay([workout(200), workout(150), workout(999, -1)], DAY)).toBe(350);
  });

  test('записи calories_out іншого дня не течуть у сьогодні', () => {
    const entries = [out({ id: 'y', value: 900, source: 'manual', date: at(10, -1) })];
    expect(burnedForDay(entries, [], DAY)).toBe(0);
  });
});

describe('calcCalorieDay — кільце міряє ЇЖУ, спалене живе окремо', () => {
  test('залишок = ліміт − з\'їдено + спалено', () => {
    const day = calcCalorieDay(2000, 1800, 400);
    expect(day).toMatchObject({ limit: 2000, consumed: 1800, burned: 400, remaining: 600, over: false });
  });

  test('спалене НЕ впливає на кільце прогресу — лише з\'їдене', () => {
    // Рівно той дефект, через який знято calcNetCalories: 500 спалених і
    // жодного запису їжі давали чверть заповненого кільця.
    const empty = calcCalorieDay(2000, 0, 500);
    expect(empty.pct).toBe(0);
    expect(empty.over).toBe(false);
    expect(empty.remaining).toBe(2500);
    // І навпаки: те саме з'їдене дає ту саму частку за будь-якого спаленого.
    expect(calcCalorieDay(2000, 1000, 0).pct).toBe(calcCalorieDay(2000, 1000, 900).pct);
  });

  test('перевищення ліміту: pct упирається в 1, over вмикається, залишок відʼємний', () => {
    const day = calcCalorieDay(2000, 2600, 100);
    expect(day.pct).toBe(1);
    expect(day.over).toBe(true);
    expect(day.remaining).toBe(-500);
  });

  test('рівно ліміт — ще не перевищення', () => {
    const day = calcCalorieDay(2000, 2000, 0);
    expect(day.pct).toBe(1);
    expect(day.over).toBe(false);
    expect(day.remaining).toBe(0);
  });

  test('ліміту немає (профіль не заповнено) — pct 0, over false, а не ділення на нуль', () => {
    for (const limit of [0, -100, Number.NaN]) {
      const day = calcCalorieDay(limit, 1500, 200);
      expect(day.limit).toBe(0);
      expect(day.pct).toBe(0);
      expect(day.over).toBe(false);
      expect(day.remaining).toBe(-1300);
    }
  });

  test('сміття на вході не протікає в числа екрана', () => {
    const day = calcCalorieDay(2000, Number.NaN, -300);
    expect(day.consumed).toBe(0);
    expect(day.burned).toBe(0); // відʼємне спалене — це не «борг», це помилка запису
    expect(day.remaining).toBe(2000);
  });

  test('усі числа цілі — дробові калорії не течуть у підпис', () => {
    const day = calcCalorieDay(2000.4, 1800.6, 400.2);
    expect(Number.isInteger(day.limit)).toBe(true);
    expect(Number.isInteger(day.consumed)).toBe(true);
    expect(Number.isInteger(day.burned)).toBe(true);
    expect(Number.isInteger(day.remaining)).toBe(true);
  });

  test('зв\'язка з burnedForDay: тренування видно в залишку, але не в кільці', () => {
    const DAY = new Date(2026, 8, 3, 12, 0, 0);
    const entries: HealthEntry[] = [
      { id: 'f', type: 'calories', value: 1500, date: new Date(2026, 8, 3, 13).toISOString() },
    ];
    const burned = burnedForDay(entries, [{ calories: 450, date: new Date(2026, 8, 3, 9).toISOString() }], DAY);
    const day = calcCalorieDay(2000, sumForDay(entries, 'calories', DAY), burned);
    expect(day.burned).toBe(450);
    expect(day.remaining).toBe(950);   // 2000 − 1500 + 450
    expect(day.pct).toBeCloseTo(0.75); // 1500 / 2000 — тренування сюди не лізе
  });
});

describe('найсвіжіший запис не залежить від порядку в масиві', () => {
  // Порядок health_entries_v2 нічим не гарантований: prepend роблять лише
  // addEntry і HK-синк, а звичайний синк приносить записи в порядку сервера.
  // Тому обидві функції мусять давати ту саму відповідь на перевернутому
  // масиві — інакше з ваги порахуються чужі норми.
  const iso = (daysAgo: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const newestFirst: HealthEntry[] = [
    { id: '3', type: 'weight', value: 78, date: iso(0, 20) },
    { id: '2', type: 'weight', value: 80, date: iso(0, 8) },
    { id: '1', type: 'weight', value: 85, date: iso(30, 9) },
  ];
  const oldestFirst = [...newestFirst].reverse();

  test('latestValue бере найновіше зважування в обох порядках', () => {
    expect(latestValue(newestFirst, 'weight')).toBe(78);
    expect(latestValue(oldestFirst, 'weight')).toBe(78);
  });

  test('lastForDay бере останнє за добу в обох порядках', () => {
    const today = new Date();
    expect(lastForDay(newestFirst, 'weight', today)).toBe(78);
    expect(lastForDay(oldestFirst, 'weight', today)).toBe(78);
  });

  test('порожній пул — null, а не помилка', () => {
    expect(latestValue([], 'weight')).toBeNull();
    expect(latestValue(newestFirst, 'pulse')).toBeNull();
  });
});

describe('межі профілю застосовуються на коміті', () => {
  const base = { sex: 'male', age: 30, heightCm: 175, activity: 'moderate', goal: 'maintain' } as HealthProfile;

  test('нижня межа підтягує занизьке значення', () => {
    expect(clampProfileRanges({ ...base, age: 0, heightCm: 0 })).toMatchObject({ age: 10, heightCm: 100 });
  });

  test('верхня межа обрізає завелике', () => {
    expect(clampProfileRanges({ ...base, age: 999, heightCm: 999 })).toMatchObject({ age: 120, heightCm: 250 });
  });

  test('коректні значення не чіпаються', () => {
    expect(clampProfileRanges({ ...base, age: 41, heightCm: 183 })).toMatchObject({ age: 41, heightCm: 183 });
  });

  test('NaN дає мінімум, а не NaN у BMR', () => {
    expect(clampProfileRanges({ ...base, age: NaN, heightCm: NaN })).toMatchObject({ age: 10, heightCm: 100 });
  });
});
