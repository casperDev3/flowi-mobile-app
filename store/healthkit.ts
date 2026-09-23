import { Platform } from 'react-native';

import { localDateKey } from '@/utils/dateUtils';
import {
  type AutoDayRead,
  type HealthAccess,
  type HealthSourceApi,
  type SleepInterval,
  type SleepNight,
  type WeightSample,
  aggregateSleep,
  hkSleepStage,
  median,
  sleepWindow,
  spo2Percent,
} from '@/utils/healthUtils';

export const HK_AVAILABLE = Platform.OS === 'ios';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HKDayData {
  steps: number;
  activeCalories: number;
  heartRateAvg: number | null;
  heartRateMin: number | null;
  heartRateMax: number | null;
  restingHeartRate: number | null;
  weight: number | null;
  /** Коли зважувались (ISO) — вага не обовʼязково сьогоднішня. */
  weightAt?: string | null;
  distanceKm: number | null;
  sleepMinutes: number | null;
  /** Ніч з фазами (якщо джерело їх дає). */
  sleep?: SleepNight | null;
  flightsClimbed?: number | null;
  hrv?: number | null;
  spo2?: number | null;
}

export interface HKWeekDay {
  date: string;
  steps: number;
  activeCalories: number;
  heartRateAvg: number | null;
  distanceKm: number | null;
}

export interface HKWorkout {
  activityId: number;
  activityName: string;
  calories: number;
  distance: number;
  duration: number;
  startDate: string;
  endDate: string;
  sourceName: string;
}

export interface HKHeartRateSample {
  value: number;
  startDate: string;
}

/**
 * ERR-14. Стан доступу до HealthKit. «Порожньо» і «немає доступу» — різні
 * речі: нуль кроків означає, що людина сьогодні не ходила, а відмова в
 * доступі означає, що застосунок не знає нічого. До цього обидва малювались
 * однаково («Кроки 0», «≈ 0.0 км») під підписом «Синхронізується з HealthKit».
 *
 * `denied` тут — точне твердження: iOS каже, що діалог авторизації ще НЕ
 * показували або на нього не відповіли (`shouldRequest`), тобто не надано
 * нічого. `unknown` — діалог був, але Apple за дизайном не повідомляє, які
 * саме типи дозволено на читання; тоді єдина ознака — чи повертають запити
 * хоч щось і чи не падають вони (див. HKReadOutcome).
 */
export type HKAccess = HealthAccess;

/** Підсумок пачки запитів: скільки зроблено і скільки з них упало. */
export interface HKReadOutcome {
  /** false — ЖОДЕН запит не вдався; нулі на екрані малювати не можна. */
  ok: boolean;
  queries: number;
  failures: number;
}

export interface HKTodayResult {
  data: HKDayData;
  outcome: HKReadOutcome;
}

/** Лічильник провалів для однієї пачки запитів. */
interface HKStats { queries: number; failures: number }

function newStats(): HKStats { return { queries: 0, failures: 0 }; }

function outcomeOf(stats: HKStats): HKReadOutcome {
  return {
    // Усі запити впали — це відмова, а не «даних немає».
    ok: stats.queries === 0 || stats.failures < stats.queries,
    queries: stats.queries,
    failures: stats.failures,
  };
}

// ─── Module lazy-load ─────────────────────────────────────────────────────────

let _sdk: typeof import('@kingstinct/react-native-healthkit') | null = null;

const HK_QUANTITY = {
  steps: 'HKQuantityTypeIdentifierStepCount',
  heartRate: 'HKQuantityTypeIdentifierHeartRate',
  restingHeartRate: 'HKQuantityTypeIdentifierRestingHeartRate',
  activeEnergy: 'HKQuantityTypeIdentifierActiveEnergyBurned',
  bodyMass: 'HKQuantityTypeIdentifierBodyMass',
  distance: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  flights: 'HKQuantityTypeIdentifierFlightsClimbed',
  oxygenSaturation: 'HKQuantityTypeIdentifierOxygenSaturation',
} as const;

const HK_SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis' as const;

function getSDK() {
  if (_sdk !== null) return _sdk;
  if (Platform.OS !== 'ios') return null;
  try {
    _sdk = require('@kingstinct/react-native-healthkit');
  } catch {
    _sdk = null;
  }
  return _sdk;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function initHealthKit(): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk) return false;
  try {
    const HealthKit = (sdk as any).default ?? sdk;
    if (
      typeof HealthKit.isHealthDataAvailable !== 'function'
      || typeof HealthKit.requestAuthorization !== 'function'
    ) return false;
    const available = await Promise.resolve(HealthKit.isHealthDataAvailable());
    if (!available) return false;
    await HealthKit.requestAuthorization({
      toRead: [...Object.values(HK_QUANTITY), HK_SLEEP],
    });
    return true;
  } catch (e) {
    console.warn('[HealthKit] initHealthKit error:', e);
    return false;
  }
}

/**
 * ERR-14. Стан доступу, на який можна спиратись в інтерфейсі.
 *
 * Apple за дизайном НЕ повідомляє, які типи дозволено читати (інакше сам факт
 * відмови був би медичною інформацією). Єдине, що система каже чесно, —
 * `getRequestStatusForAuthorization`: `shouldRequest` (1) означає, що діалог
 * ще не показували або на нього не відповіли, тобто не надано нічого;
 * `unnecessary` (2) — діалог був, а що саме дозволено, невідомо.
 *
 * Тому: 'denied' — тверде «доступу немає, є сенс показати кнопку запиту»,
 * 'unknown' — «питали, далі судимо за тим, чи працюють запити».
 */
export async function getHealthKitAccess(): Promise<HKAccess> {
  const sdk = getSDK();
  if (!sdk) return 'unavailable';
  try {
    const HealthKit = (sdk as any).default ?? sdk;
    if (typeof HealthKit.isHealthDataAvailable !== 'function') return 'unavailable';
    const available = await Promise.resolve(HealthKit.isHealthDataAvailable());
    if (!available) return 'unavailable';
    if (typeof HealthKit.getRequestStatusForAuthorization !== 'function') return 'unknown';
    const status = await HealthKit.getRequestStatusForAuthorization({
      toShare: [],
      toRead: [...Object.values(HK_QUANTITY), HK_SLEEP],
    });
    // SDK віддає або число HKAuthorizationRequestStatus, або рядок.
    if (status === 1 || status === 'shouldRequest') return 'denied';
    if (status === 2 || status === 'unnecessary') return 'unknown';
    return 'unknown';
  } catch (e) {
    console.warn('[HealthKit] getHealthKitAccess error:', e);
    return 'unknown';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d = new Date()) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function endOfDay(d = new Date()) {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

/**
 * Дістає число з HealthKit-семпла і повертає його МОДУЛЬ.
 *
 * Apple інколи віддає кількісні величини зі знаком мінус — спостережено на
 * активних калоріях. Усе, що проходить через цю функцію, є фізичною
 * величиною, яка не може бути відʼємною: кроки, спалена енергія, дистанція,
 * пульс, вага, тривалість. Тобто мінус тут — завжди помилка знаку, а не дані.
 *
 * Симптом був подвійним: екран «Apple Health» показував число як є, тобто з
 * мінусом, а в журнал `calories_out` воно не потрапляло взагалі — там стоїть
 * фільтр `> 0`. Те саме з дистанцією (`queryDistance` віддає null для <= 0) і
 * з пульсом (фільтр діапазону 30–300).
 *
 * Модуль береться саме тут, бо це єдина точка вилучення числа з семпла —
 * інакше довелося б дублювати захист у девʼяти місцях.
 */
function quantityValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.abs(value) : 0;
  if (value && typeof value === 'object' && 'quantity' in value) {
    const quantity = (value as { quantity?: unknown }).quantity;
    return typeof quantity === 'number' && Number.isFinite(quantity) ? Math.abs(quantity) : 0;
  }
  return 0;
}

function dateFilter(from: Date, to: Date) {
  return { filter: { date: { startDate: from, endDate: to } } };
}

async function querySum(
  sdk: any,
  identifier: string,
  from: Date,
  to: Date,
  unit = 'count',
  stats?: HKStats,
): Promise<number> {
  if (stats) stats.queries++;
  try {
    const HealthKit = sdk.default ?? sdk;
    const result = await HealthKit.queryStatisticsForQuantity(
      identifier,
      ['cumulativeSum'],
      { ...dateFilter(from, to), unit },
    );
    return Math.round(quantityValue(result?.sumQuantity));
  } catch (e) {
    // ERR-14: нуль лишається заради сумісності викликачів, але сам факт
    // збою більше не зникає — він їде в stats і далі в HKReadOutcome.
    if (stats) stats.failures++;
    if (__DEV__) console.warn('[HealthKit] querySum failed:', identifier, e);
    return 0;
  }
}

async function queryEnergySum(sdk: any, identifier: string, from: Date, to: Date, stats?: HKStats): Promise<number> {
  return querySum(sdk, identifier, from, to, 'kcal', stats);
}

async function queryQuantitySamples(
  sdk: any,
  identifier: string,
  from: Date,
  to: Date,
  limit = 500,
  unit?: string,
  stats?: HKStats,
): Promise<any[]> {
  if (stats) stats.queries++;
  try {
    const HealthKit = sdk.default ?? sdk;
    return await HealthKit.queryQuantitySamples(identifier, {
      ...dateFilter(from, to), limit, ascending: false, ...(unit ? { unit } : {}),
    }) ?? [];
  } catch (e) {
    if (stats) stats.failures++;
    if (__DEV__) console.warn('[HealthKit] queryQuantitySamples failed:', identifier, e);
    return [];
  }
}

async function queryCategorySamples(
  sdk: any,
  identifier: string,
  from: Date,
  to: Date,
  limit = 500,
  stats?: HKStats,
): Promise<any[]> {
  if (stats) stats.queries++;
  try {
    const HealthKit = sdk.default ?? sdk;
    return await HealthKit.queryCategorySamples(identifier, {
      ...dateFilter(from, to), limit, ascending: false,
    }) ?? [];
  } catch (e) {
    if (stats) stats.failures++;
    if (__DEV__) console.warn('[HealthKit] queryCategorySamples failed:', identifier, e);
    return [];
  }
}

async function queryMostRecent(sdk: any, identifier: string, unit?: string, stats?: HKStats): Promise<any | null> {
  if (stats) stats.queries++;
  try {
    const HealthKit = sdk.default ?? sdk;
    return await HealthKit.getMostRecentQuantitySample(identifier, unit) ?? null;
  } catch (e) {
    if (stats) stats.failures++;
    if (__DEV__) console.warn('[HealthKit] getMostRecentQuantitySample failed:', identifier, e);
    return null;
  }
}

async function queryDistance(sdk: any, from: Date, to: Date, stats?: HKStats): Promise<number | null> {
  try {
    const meters = await querySum(sdk, HK_QUANTITY.distance, from, to, 'm', stats);
    return meters > 0 ? Math.round(meters / 100) / 10 : null;
  } catch {
    return null;
  }
}

// ─── Одна доба (спільний контракт з Health Connect) ──────────────────────────

/** Вибрати значення зі семпла, де б SDK його не поклав. */
function sampleValue(sample: any): number {
  return quantityValue(sample?.quantity ?? sample);
}

function sampleTime(sample: any, field: 'startDate' | 'endDate' = 'startDate'): number {
  const raw = sample?.[field];
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/** Інтервали сну з категорійних семплів HealthKit (inBed відкидається). */
export function hkSleepIntervals(samples: readonly any[]): SleepInterval[] {
  const out: SleepInterval[] = [];
  for (const s of samples) {
    const stage = hkSleepStage(s?.value ?? s?.categoryValue);
    if (!stage) continue;
    const start = sampleTime(s, 'startDate');
    const end = sampleTime(s, 'endDate');
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end, stage });
  }
  return out;
}

export interface HKDayReadResult {
  read: AutoDayRead;
  outcome: HKReadOutcome;
}

/**
 * Одна доба з HealthKit: суми за [00:00, 23:59] (або до «зараз»), пульс
 * спокою — останній семпл ЦІЄЇ доби, SpO2 — медіана доби, сон — вікно ночі
 * [D-1 18:00, D 12:00] з об'єднанням інтервалів (ВАДА-1).
 */
export async function readHealthKitDay(day: Date, now: Date = new Date()): Promise<HKDayReadResult> {
  const read: AutoDayRead = {
    day: localDateKey(day), steps: null, activeCalories: null, heartRateAvg: null,
    heartRateMin: null, heartRateMax: null, restingHeartRate: null, spo2: null, distanceKm: null, sleep: null,
  };
  const sdk = getSDK();
  if (!sdk) return { read, outcome: { ok: false, queries: 0, failures: 0 } };

  const from = startOfDay(day);
  const dayEnd = endOfDay(day);
  const to = dayEnd.getTime() > now.getTime() ? now : dayEnd;
  const win = sleepWindow(day, now);
  const stats = newStats();

  const [steps, cal, hrSamples, restSamples, spo2Samples, dist, sleepSamples] = await Promise.all([
    querySum(sdk, HK_QUANTITY.steps, from, to, 'count', stats),
    queryEnergySum(sdk, HK_QUANTITY.activeEnergy, from, to, stats),
    queryQuantitySamples(sdk, HK_QUANTITY.heartRate, from, to, 1000, 'count/min', stats),
    queryQuantitySamples(sdk, HK_QUANTITY.restingHeartRate, from, to, 20, 'count/min', stats),
    queryQuantitySamples(sdk, HK_QUANTITY.oxygenSaturation, from, to, 500, '%', stats),
    queryDistance(sdk, from, to, stats),
    queryCategorySamples(sdk, HK_SLEEP, win.from, win.to, 500, stats),
  ]);

  const hrValues = hrSamples
    .map((sample: any) => Math.round(sampleValue(sample)))
    .filter((value: number) => value > 30 && value < 300);
  if (hrValues.length) {
    read.heartRateAvg = Math.round(hrValues.reduce((a: number, b: number) => a + b, 0) / hrValues.length);
    read.heartRateMin = Math.min(...hrValues);
    read.heartRateMax = Math.max(...hrValues);
  }

  // Останній семпл ДОБИ, а не «останній узагалі».
  const rest = restSamples
    .map((s: any) => ({ t: sampleTime(s), v: Math.round(sampleValue(s)) }))
    .filter((x: { t: number; v: number }) => x.v > 20 && x.v < 250)
    .sort((a: { t: number }, b: { t: number }) => (b.t || 0) - (a.t || 0));
  read.restingHeartRate = rest.length ? rest[0].v : null;

  read.spo2 = spo2Percent(median(spo2Samples.map((s: any) => sampleValue(s)).filter((v: number) => v > 0)));
  read.steps = steps > 0 ? steps : 0;
  read.activeCalories = cal > 0 ? cal : 0;
  read.distanceKm = dist;
  read.sleep = aggregateSleep(hkSleepIntervals(sleepSamples), win);

  return { read, outcome: outcomeOf(stats) };
}

/**
 * Заміри ваги за період — КОЖЕН семпл зі своєю датою (ВАДА-2). Раніше
 * брався «останній будь-коли» і щодня писався сьогоднішньою датою.
 */
export async function readHealthKitWeights(from: Date, to: Date): Promise<{ samples: WeightSample[]; outcome: HKReadOutcome }> {
  const sdk = getSDK();
  if (!sdk) return { samples: [], outcome: { ok: false, queries: 0, failures: 0 } };
  const stats = newStats();
  const raw = await queryQuantitySamples(sdk, HK_QUANTITY.bodyMass, from, to, 200, 'kg', stats);
  const samples: WeightSample[] = [];
  for (const s of raw) {
    const t = sampleTime(s);
    const value = sampleValue(s);
    if (!Number.isFinite(t) || !(value > 0)) continue;
    const measuredAt = new Date(t).toISOString();
    samples.push({
      value,
      measuredAt,
      sourceKey: typeof s?.uuid === 'string' && s.uuid ? s.uuid : `${measuredAt}:${Math.round(value * 10)}`,
    });
  }
  return { samples, outcome: outcomeOf(stats) };
}

/**
 * Фонова доставка HealthKit (§9.1): кроки, сон, вага — раз на годину.
 * Колбек викликається, коли в Health зʼявились нові дані; він сам вирішує,
 * чи варто синкати (м'ютекс і тротлінг — у хуку). Гарантій від iOS немає.
 */
export async function enableHealthKitBackground(onChange: () => void): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk) return false;
  const HealthKit = (sdk as any).default ?? sdk;
  const types = [HK_QUANTITY.steps, HK_QUANTITY.bodyMass, HK_SLEEP];
  let any = false;
  for (const id of types) {
    try {
      if (typeof HealthKit.enableBackgroundDelivery === 'function') {
        // 2 = HKUpdateFrequency.hourly
        await HealthKit.enableBackgroundDelivery(id, 2);
      }
      if (typeof HealthKit.subscribeToChanges === 'function') {
        HealthKit.subscribeToChanges(id, () => { onChange(); });
        any = true;
      }
    } catch (e) {
      if (__DEV__) console.warn('[HealthKit] background delivery failed:', id, e);
    }
  }
  return any;
}

// ─── Today ────────────────────────────────────────────────────────────────────

/**
 * Дані за сьогодні РАЗОМ із підсумком, чи вдалися запити (ERR-14).
 * Екран мусить малювати нулі лише тоді, коли `outcome.ok` — інакше це не
 * «нуль кроків», а «ми нічого не знаємо».
 *
 * Сон — лише ніч, що закінчилась сьогодні (вікно з sleepWindow), вага —
 * останній замір РАЗОМ з його датою (`weightAt`): екран показує, коли саме
 * зважувались, а в журнал вона йде лише через readHealthKitWeights.
 */
export async function fetchTodayDataResult(): Promise<HKTodayResult> {
  const empty: HKDayData = {
    steps: 0, activeCalories: 0,
    heartRateAvg: null, heartRateMin: null, heartRateMax: null,
    restingHeartRate: null, weight: null, distanceKm: null, sleepMinutes: null,
  };
  const sdk = getSDK();
  if (!sdk) return { data: empty, outcome: { ok: false, queries: 0, failures: 0 } };

  const now = new Date();
  const stats = newStats();
  const [day, weightSample, flights] = await Promise.all([
    readHealthKitDay(now, now),
    queryMostRecent(sdk, HK_QUANTITY.bodyMass, 'kg', stats),
    querySum(sdk, HK_QUANTITY.flights, startOfDay(now), now, 'count', stats),
  ]);
  stats.queries += day.outcome.queries;
  stats.failures += day.outcome.failures;

  const r = day.read;
  const weightTime = weightSample ? sampleTime(weightSample) : NaN;
  return {
    data: {
      steps: r.steps ?? 0,
      activeCalories: r.activeCalories ?? 0,
      heartRateAvg: r.heartRateAvg,
      heartRateMin: r.heartRateMin ?? null,
      heartRateMax: r.heartRateMax ?? null,
      restingHeartRate: r.restingHeartRate,
      weight: weightSample ? Math.round(sampleValue(weightSample) * 10) / 10 : null,
      weightAt: Number.isFinite(weightTime) ? new Date(weightTime).toISOString() : null,
      distanceKm: r.distanceKm,
      sleepMinutes: r.sleep?.total ?? null,
      sleep: r.sleep,
      flightsClimbed: flights > 0 ? flights : null,
      spo2: r.spo2,
    },
    outcome: outcomeOf(stats),
  };
}

/** Сумісна обгортка для викликачів, яким підсумок не потрібен. */
export async function fetchTodayData(): Promise<HKDayData> {
  return (await fetchTodayDataResult()).data;
}

// ─── Week ─────────────────────────────────────────────────────────────────────

export async function fetchWeekData(): Promise<HKWeekDay[]> {
  const sdk = getSDK();
  if (!sdk) return [];
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;
  });

  return Promise.all(days.map(async day => {
    const from = startOfDay(day);
    const to = endOfDay(day);
    const [steps, cal, hrSamples, dist] = await Promise.all([
      querySum(sdk, HK_QUANTITY.steps, from, to),
      queryEnergySum(sdk, HK_QUANTITY.activeEnergy, from, to),
      queryQuantitySamples(sdk, HK_QUANTITY.heartRate, from, to, 50, 'count/min'),
      queryDistance(sdk, from, to),
    ]);

    const hrValues = hrSamples
      .map((sample: any) => Math.round(quantityValue(sample?.quantity)))
      .filter((value: number) => value > 30 && value < 300);

    return {
      date: localDateKey(day),
      steps,
      activeCalories: cal,
      heartRateAvg: hrValues.length
        ? Math.round(hrValues.reduce((a: number, b: number) => a + b, 0) / hrValues.length)
        : null,
      distanceKm: dist,
    };
  }));
}

// ─── Heart rate samples (sparkline) ──────────────────────────────────────────

export async function fetchHeartRateSamples(hoursBack = 24): Promise<HKHeartRateSample[]> {
  const sdk = getSDK();
  if (!sdk) return [];
  const from = new Date(Date.now() - hoursBack * 3600000);
  const samples = await queryQuantitySamples(
    sdk, HK_QUANTITY.heartRate, from, new Date(), 200, 'count/min',
  );
  return samples.map((s: any) => {
    const value = Math.round(quantityValue(s.quantity));
    return { value, startDate: s.startDate };
  }).filter(s => s.value > 30 && s.value < 300);
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function fetchWorkouts(limit = 20): Promise<HKWorkout[]> {
  const sdk = getSDK();
  if (!sdk) return [];
  try {
    const HealthKit = (sdk as any).default ?? sdk;
    const from = new Date(Date.now() - 30 * 86400000);
    const results = await HealthKit.queryWorkoutSamples({
      filter: { date: { startDate: from, endDate: new Date() } },
      limit,
      ascending: false,
    }) ?? [];
    return results.map((w: any) => ({
      activityId: w.workoutActivityType ?? 0,
      activityName: String(w.workoutActivityType ?? 'Тренування'),
      calories: Math.round(quantityValue(w.totalEnergyBurned)),
      distance: Math.round(quantityValue(w.totalDistance)),
      duration: Math.round(quantityValue(w.duration)),
      startDate: w.startDate instanceof Date ? w.startDate.toISOString() : String(w.startDate),
      endDate: w.endDate instanceof Date ? w.endDate.toISOString() : String(w.endDate),
      sourceName: w.sourceRevision?.source?.name ?? '',
    }));
  } catch {
    return [];
  }
}

// ─── Реалізація спільного контракту ─────────────────────────────────────────

export const healthKitSource: HealthSourceApi = {
  source: 'healthkit',
  label: 'Apple Health',
  isAvailable: HK_AVAILABLE,
  requestAccess: initHealthKit,
  getAccess: getHealthKitAccess,
  readDay: readHealthKitDay,
  readWeights: readHealthKitWeights,
};
