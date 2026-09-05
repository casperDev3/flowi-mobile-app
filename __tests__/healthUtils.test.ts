import {
  HealthEntry, HealthProfile,
  bmiCategory, calcBMI, calcBMR, calcCalorieTarget, calcNetCalories, calcProteinTarget, calcTDEE, calcWaterTarget,
  clampProfileRanges, computeGoals, estimateBodyFatNavy, getWeeklyInsights, lastForDay, latestValue,
  leanMass, maxHR, stepsToKm, sumForDay,
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

// ─── Чисті калорії ───────────────────────────────────────────────────────────

describe('calcNetCalories', () => {
  // Спалені калорії приходять з Apple Health автоматично, а їжу користувач
  // вносить руками, тож різниця часто відʼємна. Показуємо МОДУЛЬ — свідоме
  // рішення: екран показує розмір розбіжності з нормою, а не «скільки з'їдено».

  test('спожито більше за спалене — звичайна різниця', () => {
    expect(calcNetCalories(1800, 400)).toBe(1400);
  });

  test('спалено більше за спожите — модуль, а не нуль і не мінус', () => {
    expect(calcNetCalories(400, 444)).toBe(44);
    expect(calcNetCalories(0, 437)).toBe(437);
  });

  test('рівність дає нуль', () => {
    expect(calcNetCalories(500, 500)).toBe(0);
  });

  test('дефіцит і профіцит однакового розміру виглядають однаково', () => {
    // Наслідок модуля, прийнятий свідомо: знак втрачається.
    expect(calcNetCalories(456, 500)).toBe(calcNetCalories(544, 500));
  });

  test('нечислові значення не дають NaN', () => {
    expect(calcNetCalories(Number.NaN, 100)).toBe(100);
    expect(calcNetCalories(500, Number.NaN)).toBe(500);
  });

  test('результат цілий', () => {
    expect(Number.isInteger(calcNetCalories(1800.6, 400.2))).toBe(true);
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
