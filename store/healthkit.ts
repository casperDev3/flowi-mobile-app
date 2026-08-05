import { Platform } from 'react-native';

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
  distanceKm: number | null;
  sleepMinutes: number | null;
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

function quantityValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'quantity' in value) {
    const quantity = (value as { quantity?: unknown }).quantity;
    return typeof quantity === 'number' ? quantity : 0;
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
): Promise<number> {
  try {
    const HealthKit = sdk.default ?? sdk;
    const result = await HealthKit.queryStatisticsForQuantity(
      identifier,
      ['cumulativeSum'],
      { ...dateFilter(from, to), unit },
    );
    return Math.round(quantityValue(result?.sumQuantity));
  } catch {
    return 0;
  }
}

async function queryEnergySum(sdk: any, identifier: string, from: Date, to: Date): Promise<number> {
  return querySum(sdk, identifier, from, to, 'kcal');
}

async function queryQuantitySamples(
  sdk: any,
  identifier: string,
  from: Date,
  to: Date,
  limit = 500,
  unit?: string,
): Promise<any[]> {
  try {
    const HealthKit = sdk.default ?? sdk;
    return await HealthKit.queryQuantitySamples(identifier, {
      ...dateFilter(from, to), limit, ascending: false, ...(unit ? { unit } : {}),
    }) ?? [];
  } catch {
    return [];
  }
}

async function queryCategorySamples(
  sdk: any,
  identifier: string,
  from: Date,
  to: Date,
  limit = 500,
): Promise<any[]> {
  try {
    const HealthKit = sdk.default ?? sdk;
    return await HealthKit.queryCategorySamples(identifier, {
      ...dateFilter(from, to), limit, ascending: false,
    }) ?? [];
  } catch {
    return [];
  }
}

async function queryMostRecent(sdk: any, identifier: string, unit?: string): Promise<any | null> {
  try {
    const HealthKit = sdk.default ?? sdk;
    return await HealthKit.getMostRecentQuantitySample(identifier, unit) ?? null;
  } catch {
    return null;
  }
}

async function queryDistance(sdk: any, from: Date, to: Date): Promise<number | null> {
  try {
    const meters = await querySum(sdk, HK_QUANTITY.distance, from, to, 'm');
    return meters > 0 ? Math.round(meters / 100) / 10 : null;
  } catch {
    return null;
  }
}

// ─── Today ────────────────────────────────────────────────────────────────────

export async function fetchTodayData(): Promise<HKDayData> {
  const empty: HKDayData = {
    steps: 0, activeCalories: 0,
    heartRateAvg: null, heartRateMin: null, heartRateMax: null,
    restingHeartRate: null, weight: null, distanceKm: null, sleepMinutes: null,
  };
  const sdk = getSDK();
  if (!sdk) return empty;

  const from = startOfDay();
  const to = new Date();

  const [steps, cal, hrSamples, restHRSample, weightSample, dist, sleepSamples] =
    await Promise.all([
      querySum(sdk, HK_QUANTITY.steps, from, to),
      queryEnergySum(sdk, HK_QUANTITY.activeEnergy, from, to),
      queryQuantitySamples(sdk, HK_QUANTITY.heartRate, from, to, 500, 'count/min'),
      queryMostRecent(sdk, HK_QUANTITY.restingHeartRate, 'count/min'),
      queryMostRecent(sdk, HK_QUANTITY.bodyMass, 'kg'),
      queryDistance(sdk, from, to),
      queryCategorySamples(sdk, HK_SLEEP, startOfDay(new Date(Date.now() - 86400000)), to),
    ]);

  const hrValues = hrSamples
    .map((sample: any) => Math.round(quantityValue(sample?.quantity)))
    .filter((value: number) => value > 30 && value < 300);

  const hrAvg = hrValues.length ? Math.round(hrValues.reduce((a: number, b: number) => a + b, 0) / hrValues.length) : null;
  const hrMin = hrValues.length ? Math.min(...hrValues) : null;
  const hrMax = hrValues.length ? Math.max(...hrValues) : null;

  let restHR: number | null = null;
  if (restHRSample) {
    restHR = Math.round(quantityValue(restHRSample.quantity));
  }

  let weight: number | null = null;
  if (weightSample) {
    weight = Math.round(quantityValue(weightSample.quantity) * 10) / 10;
  }

  // Sleep — sum ASLEEP categories
  const sleepMins = sleepSamples
    .filter((s: any) => {
      const v = s.value ?? s.categoryValue;
      return v === 1 || v === 3 || v === 4 || v === 5;
    })
    .reduce((sum: number, s: any) => {
      const ms = new Date(s.endDate).getTime() - new Date(s.startDate).getTime();
      return sum + ms / 60000;
    }, 0);

  return {
    steps,
    activeCalories: cal,
    heartRateAvg: hrAvg,
    heartRateMin: hrMin,
    heartRateMax: hrMax,
    restingHeartRate: restHR,
    weight,
    distanceKm: dist,
    sleepMinutes: sleepMins > 0 ? Math.round(sleepMins) : null,
  };
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
      date: day.toISOString().slice(0, 10),
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
