import { isSameDay, isSameMonth } from './dateUtils';

export type EntryType =
  | 'water'
  | 'sleep'
  | 'mood'
  | 'weight'
  | 'calories'      // спожиті калорії (їжа)
  | 'calories_out'  // спалені калорії (активність / HealthKit)
  | 'steps'
  | 'pulse'
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
  type: EntryType;
  value: number;
  note?: string;
  date: string;
  // Макронутрієнти — лише для записів їжі (type === 'calories'), у грамах
  protein?: number;
  fat?: number;
  carbs?: number;
}

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

// ─── Вибірки записів ─────────────────────────────────────────────────────────

export function getMonthEntries(entries: HealthEntry[], month: Date): HealthEntry[] {
  return entries.filter(e => isSameMonth(new Date(e.date), month));
}

/** Сума значень типу за конкретний день (water/calories/steps) */
export function sumForDay(entries: HealthEntry[], type: EntryType, day: Date): number {
  return entries
    .filter(e => e.type === type && isSameDay(new Date(e.date), day))
    .reduce((s, e) => s + e.value, 0);
}

/**
 * Останнє записане значення типу за день. Масив зберігається newest-first
 * (addEntry/HK-sync роблять prepend), тож найсвіжіше — це pool[0].
 */
export function lastForDay(entries: HealthEntry[], type: EntryType, day: Date): number | null {
  const pool = entries.filter(e => e.type === type && isSameDay(new Date(e.date), day));
  return pool.length ? pool[0].value : null;
}

/** Останнє значення типу серед усіх записів (newest-first → [0]) */
export function latestValue(entries: HealthEntry[], type: EntryType): number | null {
  const pool = entries.filter(e => e.type === type);
  return pool.length ? pool[0].value : null;
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
