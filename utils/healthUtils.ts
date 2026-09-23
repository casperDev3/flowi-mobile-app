import { isSameDay, isSameMonth, localDateKey } from './dateUtils';

export type EntryType =
  | 'water'
  | 'sleep'
  | 'mood'
  | 'weight'
  | 'calories'      // спожиті калорії (їжа)
  | 'calories_out'  // спалені калорії (активність / HealthKit)
  | 'steps'
  | 'pulse'         // пульс СЕРЕДНІЙ за добу
  // ─── Автоматичні метрики (HealthKit / Health Connect; вручну — теж можна) ───
  | 'pulse_rest'    // пульс спокою, уд/хв — окремо від середнього
  | 'spo2'          // сатурація, %
  | 'distance'      // дистанція, км (1 знак)
  | 'sleep_deep'    // хв глибокого сну
  | 'sleep_rem'     // хв REM
  | 'sleep_light'   // хв поверхневого сну
  | 'sleep_awake'   // хв пробуджень усередині ночі
  // ─── Заміри тіла (см; bodyfat — у %) ───
  | 'chest'
  | 'waist'
  | 'hips'
  | 'thigh'
  | 'biceps'
  | 'neck'
  | 'calf'
  | 'bodyfat';

export type MeasurementType = 'chest' | 'waist' | 'hips' | 'thigh' | 'biceps' | 'neck' | 'calf' | 'bodyfat';

/** Перелік вимірів тіла (без ваги — вона окремий тип) для форми/списку */
export const MEASUREMENT_TYPES: MeasurementType[] = ['waist', 'hips', 'chest', 'biceps', 'thigh', 'neck', 'calf', 'bodyfat'];

export interface HealthEntry {
  id: string;
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
  type: EntryType;
  value: number;
  note?: string;
  date: string;
  // Макронутрієнти — лише для записів їжі (type === 'calories'), у грамах
  protein?: number;
  fat?: number;
  carbs?: number;
  // Джерело запису: 'healthkit' — Apple Health, 'healthconnect' — Health Connect
  // (Android), 'manual'/відсутнє — ручний ввід.
  source?: EntrySource;
  /** Фактичний час заміру з джерела; для добових сум — кінець доби (або «зараз» для сьогодні). */
  measuredAt?: string;
  /** Стабільний ключ семпла в джерелі — для дедуплікації без перестворення записів. */
  sourceKey?: string;
}

export type AutoSource = 'healthkit' | 'healthconnect';
export type EntrySource = 'manual' | AutoSource;

// ─── Дефолтні (запасні) цілі, якщо профіль не заповнено ──────────────────────
export const WATER_GOAL  = 2000;
export const CAL_GOAL    = 2200;
export const STEPS_GOAL  = 10000;
export const SLEEP_GOAL  = 480; // хв (8 год)
export const FALLBACK_WEIGHT = 70; // кг — коли вага ще не записана

// ─── Профіль користувача ─────────────────────────────────────────────────────
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type FitnessGoal = 'lose' | 'maintain' | 'gain';

export interface HealthProfile {
  sex: Sex;
  age: number;
  heightCm: number;
  activity: ActivityLevel;
  goal: FitnessGoal;
}

export const PROFILE_KEY = 'health_profile';

export const DEFAULT_PROFILE: HealthProfile = {
  sex: 'male',
  age: 30,
  heightCm: 175,
  activity: 'moderate',
  goal: 'maintain',
};

// Коефіцієнти активності (множник до BMR для розрахунку TDEE)
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,    // майже без руху
  light: 1.375,      // легкі тренування 1–3/тиж
  moderate: 1.55,    // помірні 3–5/тиж
  active: 1.725,     // інтенсивні 6–7/тиж
  very_active: 1.9,  // важка фіз. праця / 2 рази на день
};

// ─── Розрахунки ──────────────────────────────────────────────────────────────

/** BMR за формулою Mifflin-St Jeor */
export function calcBMR(profile: HealthProfile, weightKg: number): number {
  const base = 10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age;
  return profile.sex === 'male' ? base + 5 : base - 161;
}

/** TDEE — добові витрати енергії */
export function calcTDEE(profile: HealthProfile, weightKg: number): number {
  return Math.round(calcBMR(profile, weightKg) * ACTIVITY_FACTORS[profile.activity]);
}

/** Цільова калорійність з урахуванням цілі (дефіцит / профіцит) */
export function calcCalorieTarget(profile: HealthProfile, weightKg: number): number {
  const tdee = calcTDEE(profile, weightKg);
  if (profile.goal === 'lose') return Math.max(1200, tdee - 500);
  if (profile.goal === 'gain') return tdee + 300;
  return tdee;
}

/** Цільовий білок, г/добу (1.6–2.0 г/кг залежно від цілі) */
export function calcProteinTarget(profile: HealthProfile, weightKg: number): number {
  const f = profile.goal === 'lose' ? 2.0 : profile.goal === 'gain' ? 1.8 : 1.6;
  return Math.round(weightKg * f);
}

/** Норма води, мл (≈35 мл/кг, округлення до 50) */
export function calcWaterTarget(weightKg: number): number {
  return Math.round((weightKg * 35) / 50) * 50;
}

/** Індекс маси тіла */
export function calcBMI(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  if (m <= 0) return 0;
  return weightKg / (m * m);
}

export type BMICategory = 'underweight' | 'normal' | 'overweight' | 'obese';
export function bmiCategory(bmi: number): BMICategory {
  if (bmi < 18.5) return 'underweight';
  if (bmi < 25) return 'normal';
  if (bmi < 30) return 'overweight';
  return 'obese';
}

/** Максимальна ЧСС (220 − вік) */
export function maxHR(age: number): number {
  return 220 - age;
}

/** Довжина кроку від зросту (≈0.414·зріст) → дистанція в км */
export function stepsToKm(steps: number, heightCm: number): number {
  const strideM = (heightCm * 0.414) / 100;
  return (steps * strideM) / 1000;
}

export interface HealthGoals {
  calories: number; // ліміт спожитих кк
  protein: number;  // г
  water: number;    // мл
  steps: number;
  sleep: number;    // хв
}

/** Усі персональні цілі. weightKg — поточна вага (або FALLBACK_WEIGHT). */
export function computeGoals(profile: HealthProfile | null, weightKg: number): HealthGoals {
  if (!profile) {
    return { calories: CAL_GOAL, protein: Math.round(weightKg * 1.6), water: WATER_GOAL, steps: STEPS_GOAL, sleep: SLEEP_GOAL };
  }
  return {
    calories: calcCalorieTarget(profile, weightKg),
    protein: calcProteinTarget(profile, weightKg),
    water: calcWaterTarget(weightKg),
    steps: STEPS_GOAL,
    sleep: SLEEP_GOAL,
  };
}

// ─── Калорії доби ────────────────────────────────────────────────────────────
//
// Тут колись жила `calcNetCalories(consumed, burned)` — |з'їдено − спалено|,
// що порівнювалось із лімітом ЇЖІ. Модуль ховав знак, тож день без жодного
// запису їжі й із 500 спаленими калоріями показував «500 з'їдених» і з'їдав
// чверть кільця прогресу. Її замінили три незалежні числа (`calcCalorieDay`),
// а сама функція лишалась у файлі лише тому, що її тримав живою власний блок
// тестів. Знята разом із ним.

/** Позначка, якою синк Apple Health мітить свої записи (див. hooks/use-health-entries). */
export const HK_NOTE = '__hk__';

/**
 * Чи прийшов запис з Apple Health.
 *
 * Дивимось і на `source`, і на стару нотатку `__hk__`: міграція в хуку
 * переписує лише тип запису, тож записи, створені до появи поля `source`,
 * упізнаються виключно за нотаткою.
 */
export function isHealthKitEntry(entry: HealthEntry): boolean {
  return isAutoSource(entry.source) || entry.note === HK_NOTE;
}

/**
 * Чи це автоматичне джерело (Apple Health або Health Connect).
 *
 * Обидва джерела дають ПОВНИЙ добовий агрегат, тож усі правила «авто vs
 * ручне» (MAX для кумулятивних, MAX для «HealthKit + тренування») мусять
 * однаково поводитись на iPhone і на Android — інакше та сама людина з
 * тим самим днем отримала б різні числа залежно від телефона.
 */
export function isAutoSource(source: HealthEntry['source']): source is AutoSource {
  return source === 'healthkit' || source === 'healthconnect';
}

/**
 * Мінімум полів тренування, потрібний для калорій.
 *
 * Свідомо структурний тип, а не імпорт `Workout` з екрана тренувань: утиліти
 * здоров'я не мусять знати про вправи, програми й нагадування, а колекція
 * `workouts` однаково приїжджає синком у вигляді голого JSON.
 */
export interface WorkoutCalorieRecord {
  /** Спалені калорії; поле необов'язкове — тренування можна записати й без них. */
  calories?: number;
  date: string;
}

/** Сума калорій із тренувань Flowi за конкретний день. */
export function workoutCaloriesForDay(workouts: WorkoutCalorieRecord[], day: Date): number {
  return workouts.reduce((sum, w) => {
    if (!isSameDay(new Date(w.date), day)) return sum;
    const value = Number(w.calories);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
}

/** Чи є за день бодай один запис `calories_out`, що приїхав з Apple Health. */
export function hasHealthKitBurn(entries: HealthEntry[], day: Date): boolean {
  return entries.some(e => e.type === 'calories_out' && isSameDay(new Date(e.date), day) && isHealthKitEntry(e));
}

/**
 * Спалено за день: записи `calories_out` плюс калорії тренувань Flowi.
 *
 * Складати ці два джерела можна НЕ завжди. Apple Health віддає повний добовий
 * агрегат активних калорій — і пробіжка, записана у Flowi, уже сидить у ньому.
 * Тому якщо за цей день є хоч один `calories_out` із позначкою HealthKit,
 * беремо БІЛЬШЕ з двох джерел, а не суму: інакше одна й та сама пробіжка
 * рахується двічі й «залишок» роздувається на пів вечері.
 *
 * Без HealthKit джерела незалежні (ручний ввід і журнал тренувань — різні
 * події), тож там сума коректна.
 */
export function burnedForDay(entries: HealthEntry[], workouts: WorkoutCalorieRecord[], day: Date): number {
  const fromEntries = sumForDay(entries, 'calories_out', day);
  const fromWorkouts = workoutCaloriesForDay(workouts, day);
  if (fromWorkouts === 0) return fromEntries;
  return hasHealthKitBurn(entries, day)
    ? Math.max(fromEntries, fromWorkouts)
    : fromEntries + fromWorkouts;
}

export interface CalorieDay {
  /** З'їдено за добу (записи `calories`). */
  consumed: number;
  /** Спалено за добу: активність + тренування, без подвоєння з Apple Health. */
  burned: number;
  /** Ліміт їжі з профілю. */
  limit: number;
  /** Скільки ще можна з'їсти: ліміт − з'їдено + спалено. Відʼємне — перевищення. */
  remaining: number;
  /** Частка ліміту в [0, 1] — рахується ЛИШЕ від з'їденого. */
  pct: number;
  /** З'їдено більше ліміту: кільце заповнене, потрібен бейдж. */
  over: boolean;
}

/**
 * Три незалежні числа доби замість одного «чистого».
 *
 * Ключове: кільце прогресу міряє з'їдене проти ліміту ЇЖІ й нічого більше —
 * спалене на нього не впливає взагалі. Спалене показується окремим числом, а
 * вплив тренувань видно в залишку, який єдиний зводить обидва джерела разом і
 * має право бути відʼємним.
 *
 * Мобільний і веб рахують це однаково (див. lib/health-today.ts:calorieDay) —
 * будь-яка правка тут мусить статись і там.
 */
export function calcCalorieDay(limit: number, consumed: number, burned: number): CalorieDay {
  const safe = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const eaten = safe(consumed);
  const out = safe(burned);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.round(limit) : 0;
  return {
    consumed: eaten,
    burned: out,
    limit: cap,
    remaining: cap - eaten + out,
    pct: cap > 0 ? Math.max(0, Math.min(1, eaten / cap)) : 0,
    over: cap > 0 && eaten > cap,
  };
}

// ─── Вибірки записів ─────────────────────────────────────────────────────────

export function getMonthEntries(entries: HealthEntry[], month: Date): HealthEntry[] {
  return entries.filter(e => isSameMonth(new Date(e.date), month));
}

/**
 * Сума значень типу за конкретний день (water/calories/steps/calories_out).
 *
 * Дедуплікація для кумулятивних типів (steps, calories_out):
 *   якщо за день є записи і від HealthKit, і ручні — використовується MAX(hk-сума, manual-сума),
 *   бо HealthKit уже містить повний добовий агрегат і складати їх не можна.
 * Для некумулятивних (вага, пульс, сон) використовується lastForDay, ця функція не застосовується.
 */
export function sumForDay(entries: HealthEntry[], type: EntryType, day: Date): number {
  const pool = entries.filter(e => e.type === type && isSameDay(new Date(e.date), day));
  if (pool.length === 0) return 0;

  // «Авто» — і Apple Health, і Health Connect: обидва дають повний добовий агрегат.
  const hasHk     = pool.some(e => isAutoSource(e.source));
  const hasManual = pool.some(e => !isAutoSource(e.source));
  if (hasHk && hasManual) {
    const hkSum     = pool.filter(e => isAutoSource(e.source)).reduce((s, e) => s + e.value, 0);
    const manualSum = pool.filter(e => !isAutoSource(e.source)).reduce((s, e) => s + e.value, 0);
    return Math.max(hkSum, manualSum);
  }
  return pool.reduce((s, e) => s + e.value, 0);
}

/**
 * Найсвіжіший запис пулу — за ДАТОЮ, а не за позицією в масиві.
 *
 * Раніше обидві функції нижче брали pool[0], спираючись на те, що масив
 * newest-first: addEntry і HK-синк роблять prepend. Але порядок після
 * ЗВИЧАЙНОГО синку не гарантує ніхто — у store немає жодного сортування
 * health_entries_v2, і записи приїжджають у порядку сервера. Тобто інваріант
 * тримався лише доти, доки записи створювались на цьому ж пристрої.
 *
 * Ціна помилки тут не косметична: з ваги рахуються TDEE, ліміт калорій, норма
 * білка й води. Взяти «якесь» зважування замість останнього — це показати
 * користувачу неправильні числа, не сказавши, що вони неправильні.
 */
function newestValue(pool: HealthEntry[]): number | null {
  let best: HealthEntry | null = null;
  let bestAt = -Infinity;
  for (const entry of pool) {
    const at = new Date(entry.date).getTime();
    // Запис із побитою датою не має перемагати справний: NaN у порівнянні
    // завжди дає false, тож він програє будь-якому, але лишається кандидатом,
    // якщо справних немає взагалі.
    if (best === null || at > bestAt) {
      best = entry;
      bestAt = at;
    }
  }
  return best ? best.value : null;
}

/** Останнє записане значення типу за день. */
export function lastForDay(entries: HealthEntry[], type: EntryType, day: Date): number | null {
  return newestValue(entries.filter(e => e.type === type && isSameDay(new Date(e.date), day)));
}

/** Останнє значення типу серед усіх записів. */
export function latestValue(entries: HealthEntry[], type: EntryType): number | null {
  return newestValue(entries.filter(e => e.type === type));
}

/** Межі полів профілю. Живуть поруч із розрахунками, бо саме вони їх і споживають. */
export const PROFILE_RANGES = {
  age: { min: 10, max: 120 },
  heightCm: { min: 100, max: 250 },
} as const;

/**
 * Затиснути числові поля профілю в допустимі межі.
 *
 * Викликається на КОМІТІ (blur і збереження), а не на кожен натиск: нижню межу
 * не можна застосовувати під час набору, бо поле прив'язане до значення
 * профілю, і вік «17» став би неможливим — після першої «1» поле стрибнуло б
 * на 10. Тому набір лише обмежує зверху, а нижню межу застосовує цей виклик.
 */
export function clampProfileRanges<T extends { age: number; heightCm: number }>(profile: T): T {
  const clamp = (value: number, { min, max }: { min: number; max: number }) =>
    Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min;
  return {
    ...profile,
    age: clamp(profile.age, PROFILE_RANGES.age),
    heightCm: clamp(profile.heightCm, PROFILE_RANGES.heightCm),
  };
}

// ─── Тижневі інсайти (тиждень-до-тижня) ───────────────────────────────────────
export interface WeeklyInsight {
  type: 'steps' | 'sleep' | 'water' | 'calories';
  deltaPct: number;     // зміна середнього за день, %
  thisAvg: number;      // середнє за день поточного тижня
  good: boolean;        // чи позитивна зміна (для кольору)
}

/** Середнє за день за 7-денне вікно (weekOffset 0 = поточний тиждень, 1 = попередній); порожні дні ігноруються */
function weekAvg(entries: HealthEntry[], type: EntryType, agg: 'sum' | 'last', weekOffset: number): number {
  const vals: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (i + weekOffset * 7));
    const v = agg === 'sum' ? sumForDay(entries, type, d) : lastForDay(entries, type, d);
    if (v != null && v > 0) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

/** Найпомітніші зміни тиждень-до-тижня (|Δ| ≥ 5%), відсортовані за величиною */
export function getWeeklyInsights(entries: HealthEntry[]): WeeklyInsight[] {
  const metrics: { type: WeeklyInsight['type']; agg: 'sum' | 'last'; upIsGood: boolean }[] = [
    { type: 'steps',    agg: 'sum',  upIsGood: true },
    { type: 'sleep',    agg: 'last', upIsGood: true },
    { type: 'water',    agg: 'sum',  upIsGood: true },
    { type: 'calories', agg: 'sum',  upIsGood: false },
  ];
  const out: WeeklyInsight[] = [];
  for (const m of metrics) {
    const cur = weekAvg(entries, m.type, m.agg, 0);
    const prev = weekAvg(entries, m.type, m.agg, 1);
    if (prev > 0 && cur > 0) {
      const deltaPct = Math.round(((cur - prev) / prev) * 100);
      if (Math.abs(deltaPct) >= 5) {
        out.push({ type: m.type, deltaPct, thisAvg: cur, good: deltaPct > 0 === m.upIsGood });
      }
    }
  }
  out.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return out;
}

// ─── Заміри тіла: похідні метрики ─────────────────────────────────────────────

/** Талія/зріст (WHtR). < 0.5 — здорово; 0.5–0.6 — підвищений; ≥ 0.6 — високий ризик */
export function waistToHeightRatio(waistCm: number | null, heightCm: number): number | null {
  return waistCm && heightCm ? waistCm / heightCm : null;
}
export type WHtRCategory = 'healthy' | 'increased' | 'high';
export function whtrCategory(whtr: number): WHtRCategory {
  if (whtr < 0.5) return 'healthy';
  if (whtr < 0.6) return 'increased';
  return 'high';
}

/** Талія/стегна (WHR). Норма: ч < 0.9, ж < 0.85 */
export function waistToHipRatio(waistCm: number | null, hipsCm: number | null): number | null {
  return waistCm && hipsCm ? waistCm / hipsCm : null;
}
export function whrHealthy(whr: number, sex: Sex): boolean {
  return sex === 'male' ? whr < 0.9 : whr < 0.85;
}

/** Суха (безжирова) маса, кг */
export function leanMass(weightKg: number, bodyfatPct: number): number {
  return weightKg * (1 - bodyfatPct / 100);
}

/**
 * Оцінка % жиру за методом US Navy з обводів (см). Працює без терезів.
 * Ч: 495 / (1.0324 − 0.19077·log10(талія−шия) + 0.15456·log10(зріст)) − 450
 * Ж: 495 / (1.29579 − 0.35004·log10(талія+стегна−шия) + 0.22100·log10(зріст)) − 450
 */
export function estimateBodyFatNavy(
  sex: Sex, heightCm: number, neck: number | null, waist: number | null, hips: number | null,
): number | null {
  if (!heightCm || !neck || !waist) return null;
  const log10 = (x: number) => Math.log10(x);
  let v: number;
  if (sex === 'male') {
    if (waist - neck <= 0) return null;
    v = 495 / (1.0324 - 0.19077 * log10(waist - neck) + 0.15456 * log10(heightCm)) - 450;
  } else {
    if (!hips || waist + hips - neck <= 0) return null;
    v = 495 / (1.29579 - 0.35004 * log10(waist + hips - neck) + 0.22100 * log10(heightCm)) - 450;
  }
  return v > 0 && v < 70 ? Math.round(v * 10) / 10 : null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Автоматичні дані здоровʼя (HealthKit + Health Connect)
// Специфікація: flowi-server-app/docs/specs/health-auto-data.md
//
// Усе нижче — ЧИСТІ функції: читання з ОС живе в store/healthkit.ts і
// store/health-connect.ts, а тут лише правила, однакові для обох платформ
// (вікно сну, об'єднання інтервалів, похідні id, злиття зі сховищем).
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Вікно ночі для доби D: [D-1 18:00, D 12:00] за локальним часом.
 * Ніч належить даті ПРОБУДЖЕННЯ. Ті самі числа мусять жити у вебі
 * (flowi-web-app/lib/health-sleep.ts) — двох різних екземплярів бути не може.
 */
export const SLEEP_WINDOW_START_HOUR = 18;
export const SLEEP_WINDOW_END_HOUR = 12;
/** Менше за це у вікні — ночі не було (денна дрімота не стає «сном за добу»). */
export const MIN_NIGHT_SLEEP_MIN = 45;
/** Глибина бекфілу: 7 діб доступні в Health Connect без READ_HEALTH_DATA_HISTORY. */
export const AUTO_BACKFILL_DAYS = 7;
/** Префікс похідних id автоматичних записів — однаковий для iOS і Android (§8). */
export const AUTO_ID_PREFIX = 'hk:';

/** Вікно вибірки сну для доби `day`; кінець не пізніше «зараз». */
export function sleepWindow(day: Date, now: Date = new Date()): { from: Date; to: Date } {
  const from = new Date(day);
  from.setDate(from.getDate() - 1);
  from.setHours(SLEEP_WINDOW_START_HOUR, 0, 0, 0);
  const end = new Date(day);
  end.setHours(SLEEP_WINDOW_END_HOUR, 0, 0, 0);
  const to = end.getTime() > now.getTime() ? new Date(now) : end;
  return { from, to };
}

/**
 * Фаза інтервалу сну. `asleep` — сон без деталізації (сесія без фаз):
 * рахується в загальну тривалість, але не в жодну фазу.
 */
export type SleepStage = 'deep' | 'rem' | 'light' | 'awake' | 'asleep';

export interface SleepInterval {
  /** мс epoch */
  start: number;
  end: number;
  stage: SleepStage;
}

/** Ніч у хвилинах. Фази null — джерело їх не дало (рахуємо лише тривалість). */
export interface SleepNight {
  total: number;
  deep: number | null;
  rem: number | null;
  light: number | null;
  awake: number | null;
}

/**
 * Довжина ОБ'ЄДНАННЯ інтервалів у хвилинах (не сума!). Та сама ніч, записана
 * годинником і сторонньою програмою, рахується один раз.
 */
export function unionMinutes(intervals: readonly { start: number; end: number }[]): number {
  const sorted = intervals
    .filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .map(i => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = NaN;
  let curEnd = NaN;
  for (const i of sorted) {
    if (Number.isNaN(curStart)) { curStart = i.start; curEnd = i.end; continue; }
    if (i.start <= curEnd) { if (i.end > curEnd) curEnd = i.end; continue; }
    total += curEnd - curStart;
    curStart = i.start; curEnd = i.end;
  }
  if (!Number.isNaN(curStart)) total += curEnd - curStart;
  return total / 60000;
}

/**
 * Ніч із сирих інтервалів (лікує ВАДА-1).
 *
 * 1. Беремо лише інтервали, що перетинають вікно, і обрізаємо їх по ньому.
 * 2. `sleep` = union усіх інтервалів сну без `awake`.
 * 3. Кожна фаза — окремий union.
 * 4. Менше MIN_NIGHT_SLEEP_MIN — ночі не було → null.
 * 5. Фази вважаються відомими, лише коли є бодай глибокий або REM: джерело,
 *    що пише тільки «спав» (старі iPhone, дешеві трекери), не має
 *    видаватись за ніч без глибокого сну.
 */
export function aggregateSleep(
  intervals: readonly SleepInterval[],
  window: { from: Date; to: Date },
): SleepNight | null {
  const from = window.from.getTime();
  const to = window.to.getTime();
  if (!(to > from)) return null;
  const clipped = intervals
    .filter(i => i.end > from && i.start < to)
    .map(i => ({ ...i, start: Math.max(i.start, from), end: Math.min(i.end, to) }))
    .filter(i => i.end > i.start);

  const total = Math.round(unionMinutes(clipped.filter(i => i.stage !== 'awake')));
  if (total < MIN_NIGHT_SLEEP_MIN) return null;

  const of = (stage: SleepStage) => Math.round(unionMinutes(clipped.filter(i => i.stage === stage)));
  const hasPhases = clipped.some(i => i.stage === 'deep' || i.stage === 'rem');
  if (!hasPhases) return { total, deep: null, rem: null, light: null, awake: null };
  return { total, deep: of('deep'), rem: of('rem'), light: of('light'), awake: of('awake') };
}

/**
 * HealthKit `HKCategoryValueSleepAnalysis` → фаза.
 * 0 inBed — не сон (ігнор), 1 asleepUnspecified → light, 2 awake,
 * 3 asleepCore → light, 4 asleepDeep → deep, 5 asleepREM → rem.
 */
export function hkSleepStage(value: unknown): SleepStage | null {
  switch (Number(value)) {
    case 1: case 3: return 'light';
    case 2: return 'awake';
    case 4: return 'deep';
    case 5: return 'rem';
    default: return null;
  }
}

/**
 * Health Connect `SleepSessionRecord.Stage.type` → фаза.
 * 1 AWAKE / 7 AWAKE_IN_BED → awake, 2 SLEEPING / 4 LIGHT → light,
 * 3 OUT_OF_BED — ігнор, 5 DEEP, 6 REM, 0 UNKNOWN — ігнор (сесія без
 * відомих фаз рахується цілком як `asleep`, див. health-connect.ts).
 */
export function hcSleepStage(value: unknown): SleepStage | null {
  switch (Number(value)) {
    case 1: case 7: return 'awake';
    case 2: case 4: return 'light';
    case 5: return 'deep';
    case 6: return 'rem';
    default: return null;
  }
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

function bell(x: number, ideal: number, tol: number): number {
  return clamp01(1 - Math.abs(x - ideal) / tol) * 100;
}

export interface SleepQuality {
  /** 0..100 */
  score: number;
  /** true — фаз немає, оцінка лише за тривалістю (бейдж мусить це казати). */
  byDurationOnly: boolean;
}

/**
 * Якість сну з фаз (§6.2). Однакова формула мусить бути у вебі
 * (flowi-web-app/lib/health-sleep.ts). Не зберігається — рахується на льоту.
 */
export function sleepQuality(
  total: number | null,
  deep: number | null,
  rem: number | null,
  awake: number | null,
  goalMinutes: number,
): SleepQuality | null {
  if (total == null || !(total > 0)) return null;
  const goal = goalMinutes > 0 ? goalMinutes : SLEEP_GOAL;
  const durationScore = clamp01(total / goal) * 100;
  if (deep == null || rem == null) return { score: Math.round(durationScore), byDurationOnly: true };
  const deepScore = bell(deep / total, 0.18, 0.09);
  const remScore = bell(rem / total, 0.22, 0.10);
  const continuityScore = clamp01(1 - (awake ?? 0) / 60) * 100;
  return {
    score: Math.round(0.45 * durationScore + 0.25 * deepScore + 0.20 * remScore + 0.10 * continuityScore),
    byDurationOnly: false,
  };
}

/** Ніч доби з уже збережених записів (sleep + фази, по одному запису кожного). */
export function sleepNightForDay(entries: HealthEntry[], day: Date): SleepNight | null {
  const total = lastForDay(entries, 'sleep', day);
  if (total == null) return null;
  return {
    total,
    deep: lastForDay(entries, 'sleep_deep', day),
    rem: lastForDay(entries, 'sleep_rem', day),
    light: lastForDay(entries, 'sleep_light', day),
    awake: lastForDay(entries, 'sleep_awake', day),
  };
}

// ─── Похідні id (лікує ВАДА-3) ───────────────────────────────────────────────

/** FNV-1a 32-bit → base36. Стабільний між запусками і платформами. */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** `hk:<type>:<yyyy-mm-dd>` — той самий id на iOS і Android (§8). */
export function autoEntryId(type: EntryType, dayKey: string): string {
  return `${AUTO_ID_PREFIX}${type}:${dayKey}`;
}

/** `hk:weight:<yyyy-mm-dd>:<hash(sourceKey)>` — кожен замір окремо (§7). */
export function weightEntryId(dayKey: string, sourceKey: string): string {
  return `${AUTO_ID_PREFIX}weight:${dayKey}:${stableHash(sourceKey)}`;
}

export function isDerivedAutoId(id: string): boolean {
  return typeof id === 'string' && id.startsWith(AUTO_ID_PREFIX);
}

// ─── Прочитане з джерела ─────────────────────────────────────────────────────

/** Результат читання однієї доби з джерела. null — «немає даних», не нуль. */
export interface AutoDayRead {
  /** yyyy-mm-dd, локальна доба */
  day: string;
  steps: number | null;
  activeCalories: number | null;
  heartRateAvg: number | null;
  heartRateMin?: number | null;
  heartRateMax?: number | null;
  restingHeartRate: number | null;
  spo2: number | null;
  distanceKm: number | null;
  sleep: SleepNight | null;
}

export interface WeightSample {
  value: number;
  /** точний ISO заміру */
  measuredAt: string;
  sourceKey: string;
}

/** Медіана (для SpO2 за добу). */
export function median(values: readonly number[]): number | null {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * SpO2 → цілий відсоток. HealthKit віддає ЧАСТКУ (0.97), Health Connect —
 * відсоток (97). Частка множиться на 100, інакше на екрані «1%».
 */
export function spo2Percent(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  const pct = raw <= 1 ? raw * 100 : raw;
  return pct > 100 ? null : Math.round(pct);
}

function endOfLocalDay(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
}

/**
 * Записи за одну прочитану добу — з похідними id.
 * Дата: для сьогодні — «зараз», для минулих діб — кінець доби.
 */
export function buildAutoDayEntries(read: AutoDayRead, source: AutoSource, now: Date = new Date()): HealthEntry[] {
  const end = endOfLocalDay(read.day);
  const at = (end.getTime() > now.getTime() ? now : end).toISOString();
  const out: HealthEntry[] = [];
  const push = (type: EntryType, value: number | null | undefined, keepZero = false) => {
    if (value == null || !Number.isFinite(value)) return;
    if (!keepZero && !(value > 0)) return;
    out.push({ id: autoEntryId(type, read.day), type, value, date: at, measuredAt: at, source });
  };
  push('steps', read.steps);
  push('calories_out', read.activeCalories);
  push('pulse', read.heartRateAvg);
  push('pulse_rest', read.restingHeartRate);
  push('spo2', read.spo2);
  push('distance', read.distanceKm);
  if (read.sleep) {
    push('sleep', read.sleep.total);
    // Фази, коли відомі, пишуться й з нулем: «0 хв глибокого» — це факт.
    const phases = read.sleep.deep != null;
    push('sleep_deep', read.sleep.deep, phases);
    push('sleep_rem', read.sleep.rem, phases);
    push('sleep_light', read.sleep.light, phases);
    push('sleep_awake', read.sleep.awake, phases);
  }
  return out;
}

/** Кожен замір ваги — окремий запис за ДАТОЮ ЗАМІРУ (лікує ВАДА-2). */
export function buildWeightEntries(samples: readonly WeightSample[], source: AutoSource): HealthEntry[] {
  const out: HealthEntry[] = [];
  const seen = new Set<string>();
  for (const s of samples) {
    const at = new Date(s.measuredAt);
    if (Number.isNaN(at.getTime()) || !(s.value > 0)) continue;
    const id = weightEntryId(localDateKey(at), s.sourceKey);
    if (seen.has(id)) continue;
    seen.add(id);
    const value = Math.round(s.value * 10) / 10;
    out.push({ id, type: 'weight', value, date: at.toISOString(), measuredAt: at.toISOString(), sourceKey: s.sourceKey, source });
  }
  return out;
}

/**
 * Які доби читати: від останньої синхронізованої (включно — вона могла бути
 * неповною) до сьогодні, не глибше AUTO_BACKFILL_DAYS. Учора читається
 * завжди: ніч, що закінчилась сьогодні вранці, могла дописатись пізніше.
 * Порядок — від найстарішої до найновішої.
 */
export function daysToSync(lastSyncedDay: string | null | undefined, now: Date = new Date()): string[] {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const oldest = new Date(today); oldest.setDate(oldest.getDate() - (AUTO_BACKFILL_DAYS - 1));
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  let start = oldest;
  if (lastSyncedDay && /^\d{4}-\d{2}-\d{2}$/.test(lastSyncedDay)) {
    const [y, m, d] = lastSyncedDay.split('-').map(Number);
    const last = new Date(y, m - 1, d);
    const candidate = last.getTime() < yesterday.getTime() ? last : yesterday;
    start = candidate.getTime() > oldest.getTime() ? candidate : oldest;
  }
  const out: string[] = [];
  for (const d = new Date(start); d.getTime() <= today.getTime(); d.setDate(d.getDate() + 1)) {
    out.push(localDateKey(d));
  }
  return out;
}

function sameAutoValue(a: HealthEntry, b: HealthEntry): boolean {
  return a.type === b.type && a.value === b.value && a.source === b.source && (a.sourceKey ?? null) === (b.sourceKey ?? null);
}

/**
 * Злиття свіжо прочитаних автоматичних записів із наявними.
 *
 * - Той самий похідний id → запис перезаписується собою; якщо значення не
 *   змінилось — лишається НАЯВНИЙ об'єкт (нуль мутацій у outbox).
 * - Старі записи синку (`__hk__`, випадкові id) того ж типу за ту саму добу,
 *   для якої є свіжий запис, прибираються: інакше backfill склав би
 *   старе й нове (кроки ×2).
 * - Id, які користувач видалив (`suppressed`), не відтворюються.
 * - Нічого іншого не видаляється: провалене читання не має стирати дані.
 * - Ручні записи не чіпаються ніколи.
 *
 * Повертає той самий масив, якщо змін немає.
 */
export function mergeAutoEntries(
  prev: HealthEntry[],
  fresh: readonly HealthEntry[],
  suppressed: ReadonlySet<string> = new Set(),
): HealthEntry[] {
  const freshById = new Map<string, HealthEntry>();
  const freshTypeDay = new Set<string>();
  for (const e of fresh) {
    if (suppressed.has(e.id)) continue;
    freshById.set(e.id, e);
    freshTypeDay.add(`${e.type}|${localDateKey(new Date(e.date))}`);
  }
  let changed = false;
  const kept: HealthEntry[] = [];
  for (const e of prev) {
    const f = freshById.get(e.id);
    if (f) {
      freshById.delete(e.id);
      if (sameAutoValue(e, f)) kept.push(e);
      else { kept.push({ ...e, ...f }); changed = true; }
      continue;
    }
    if (!isDerivedAutoId(e.id) && isHealthKitEntry(e)) {
      const d = new Date(e.date);
      if (!Number.isNaN(d.getTime()) && freshTypeDay.has(`${e.type}|${localDateKey(d)}`)) { changed = true; continue; }
    }
    kept.push(e);
  }
  if (freshById.size) changed = true;
  return changed ? [...freshById.values(), ...kept] : prev;
}

/**
 * Одноразове прибирання ваги, яку старий синк щодня переклеював на
 * сьогоднішню дату (ВАДА-2). Лише `source === 'healthkit'` зі старими
 * (не похідними) id; у ланцюжку записів поспіль з ОДНАКОВИМ значенням
 * лишається найраніший. Ручні записи не чіпаються ніколи.
 */
export function collapseStaleHkWeights(entries: HealthEntry[]): { entries: HealthEntry[]; removed: number } {
  const legacy = entries
    .filter(e => e.type === 'weight' && e.source === 'healthkit' && !isDerivedAutoId(e.id))
    .filter(e => !Number.isNaN(new Date(e.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const drop = new Set<string>();
  let prevValue: number | null = null;
  for (const e of legacy) {
    if (prevValue !== null && e.value === prevValue) drop.add(e.id);
    prevValue = e.value;
  }
  if (!drop.size) return { entries, removed: 0 };
  return { entries: entries.filter(e => !drop.has(e.id)), removed: drop.size };
}

// ─── Спільний контракт джерел (HealthKit / Health Connect) ───────────────────

/**
 * Стан доступу. `denied` — точне «не надано нічого» (є сенс показати кнопку),
 * `unknown` — питали, а що дозволено, ОС не каже (Apple) → судимо за
 * результатами запитів (ERR-14). Семантика однакова для обох платформ.
 */
export type HealthAccess = 'unavailable' | 'granted' | 'denied' | 'unknown';

/** Підсумок пачки запитів: false — ЖОДЕН не вдався, нулі малювати не можна. */
export interface HealthReadOutcome {
  ok: boolean;
  queries: number;
  failures: number;
}

/** Реалізація джерела для платформи — той самий контракт на iOS і Android. */
export interface HealthSourceApi {
  source: AutoSource;
  /** Назва сервісу — не перекладається. */
  label: string;
  /** Платформа підходить (модуль може все одно бути відсутнім у збірці). */
  isAvailable: boolean;
  /** Запит дозволів (діалог ОС). true — запит пройшов. */
  requestAccess(): Promise<boolean>;
  getAccess(): Promise<HealthAccess>;
  readDay(day: Date, now: Date): Promise<{ read: AutoDayRead; outcome: HealthReadOutcome }>;
  readWeights(from: Date, to: Date): Promise<{ samples: WeightSample[]; outcome: HealthReadOutcome }>;
}
