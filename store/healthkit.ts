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
    const { default: HealthKit, HKQuantityTypeIdentifier, HKCategoryTypeIdentifier } = sdk as any;
    const available = await HealthKit.isHealthDataAvailable();
    if (!available) return false;
    await HealthKit.requestAuthorization(
      [],
      [
        HKQuantityTypeIdentifier.stepCount,
        HKQuantityTypeIdentifier.heartRate,
        HKQuantityTypeIdentifier.restingHeartRate,
        HKQuantityTypeIdentifier.activeEnergyBurned,
        HKQuantityTypeIdentifier.bodyMass,
        HKQuantityTypeIdentifier.distanceWalkingRunning,
        HKQuantityTypeIdentifier.flightsClimbed,
        HKQuantityTypeIdentifier.oxygenSaturation,
        HKCategoryTypeIdentifier.sleepAnalysis,
      ],
    );
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

async function querySum(sdk: any, identifier: string, from: Date, to: Date): Promise<number> {
  try {
    const { default: HealthKit, HKStatisticsOptions, HKUnit } = sdk;
    const result = await HealthKit.queryStatisticsForQuantity(
      identifier,
      { from, to },
      [HKStatisticsOptions.cumulativeSum],
    );
    return Math.round(result?.sumQuantity?.doubleValue(HKUnit.count()) ?? 0);
  } catch {
    return 0;
  }
}

async function queryEnergySum(sdk: any, identifier: string, from: Date, to: Date): Promise<number> {
  try {
    const { default: HealthKit, HKStatisticsOptions, HKUnit } = sdk;
    const result = await HealthKit.queryStatisticsForQuantity(
      identifier,
      { from, to },
      [HKStatisticsOptions.cumulativeSum],
    );
    return Math.round(result?.sumQuantity?.doubleValue(HKUnit.kilocalorie()) ?? 0);
  } catch {
    return 0;
  }
}

async function querySamples(sdk: any, identifier: string, from: Date, to: Date, limit = 500): Promise<any[]> {
  try {
    const { default: HealthKit } = sdk;
    return await HealthKit.querySamples(identifier, { from, to, limit }) ?? [];
  } catch {
    return [];
  }
}

async function queryMostRecent(sdk: any, identifier: string): Promise<any | null> {
  try {
    const { default: HealthKit } = sdk;
    return await HealthKit.getMostRecentQuantitySample(identifier) ?? null;
  } catch {
    return null;
  }
}

async function queryDistance(sdk: any, from: Date, to: Date): Promise<number | null> {
  try {
    const { default: HealthKit, HKStatisticsOptions, HKUnit, HKQuantityTypeIdentifier } = sdk;
    const result = await HealthKit.queryStatisticsForQuantity(
      HKQuantityTypeIdentifier.distanceWalkingRunning,
      { from, to },
      [HKStatisticsOptions.cumulativeSum],
    );
    const meters = result?.sumQuantity?.doubleValue(HKUnit.meter()) ?? 0;
    return meters > 0 ? Math.round(meters / 100) / 10 : null;
  } catch {
    return null;
  }
}

function hrFromSamples(sdk: any, samples: any[]): number | null {
  if (!samples.length) return null;
  const { HKUnit } = sdk;
  const values = samples.map(s => s.quantity?.doubleValue(HKUnit.hertz()) ?? s.quantity?.doubleValue('count/min') ?? 0).filter(v => v > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
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

  const { HKQuantityTypeIdentifier, HKCategoryTypeIdentifier, HKUnit } = sdk as any;
  const from = startOfDay();
  const to = new Date();

  const [steps, cal, hrSamples, restHRSample, weightSample, dist, sleepSamples] =
    await Promise.all([
      querySum(sdk, HKQuantityTypeIdentifier.stepCount, from, to),
      queryEnergySum(sdk, HKQuantityTypeIdentifier.activeEnergyBurned, from, to),
      querySamples(sdk, HKQuantityTypeIdentifier.heartRate, from, to),
      queryMostRecent(sdk, HKQuantityTypeIdentifier.restingHeartRate),
      queryMostRecent(sdk, HKQuantityTypeIdentifier.bodyMass),
      queryDistance(sdk, from, to),
      querySamples(sdk, HKCategoryTypeIdentifier.sleepAnalysis, startOfDay(new Date(Date.now() - 86400000)), to),
    ]);

  // HR values — react-native-healthkit returns BPM directly in doubleValue(count/min)
  const hrValues = hrSamples.map((s: any) => {
    try { return Math.round(s.quantity.doubleValue(HKUnit.hertz()) * 60); } catch {}
    try { return Math.round(s.quantity.doubleValue('count/min')); } catch {}
    return 0;
  }).filter((v: number) => v > 30 && v < 300);

  const hrAvg = hrValues.length ? Math.round(hrValues.reduce((a: number, b: number) => a + b, 0) / hrValues.length) : null;
  const hrMin = hrValues.length ? Math.min(...hrValues) : null;
  const hrMax = hrValues.length ? Math.max(...hrValues) : null;

  let restHR: number | null = null;
  if (restHRSample) {
    try { restHR = Math.round(restHRSample.quantity.doubleValue('count/min')); } catch {}
  }

  let weight: number | null = null;
  if (weightSample) {
    try { weight = Math.round(weightSample.quantity.doubleValue(HKUnit.gramUnit(1)) / 100) / 10; } catch {}
    try { weight = Math.round(weightSample.quantity.doubleValue('kg') * 10) / 10; } catch {}
  }

  // Sleep — sum ASLEEP categories
  const sleepMins = sleepSamples
    .filter((s: any) => {
      const v = s.value ?? s.categoryValue;
      return v === 0 || v === 1 || v === 5 || v === 6 || v === 7; // in bed or asleep variants
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
  const { HKQuantityTypeIdentifier, HKUnit } = sdk as any;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;
  });

  return Promise.all(days.map(async day => {
    const from = startOfDay(day);
    const to = endOfDay(day);
    const [steps, cal, hrSamples, dist] = await Promise.all([
      querySum(sdk, HKQuantityTypeIdentifier.stepCount, from, to),
      queryEnergySum(sdk, HKQuantityTypeIdentifier.activeEnergyBurned, from, to),
      querySamples(sdk, HKQuantityTypeIdentifier.heartRate, from, to, 50),
      queryDistance(sdk, from, to),
    ]);

    const hrValues = hrSamples.map((s: any) => {
      try { return Math.round(s.quantity.doubleValue(HKUnit.hertz()) * 60); } catch {}
      try { return Math.round(s.quantity.doubleValue('count/min')); } catch {}
      return 0;
    }).filter((v: number) => v > 30 && v < 300);

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
  const { HKQuantityTypeIdentifier, HKUnit } = sdk as any;
  const from = new Date(Date.now() - hoursBack * 3600000);
  const samples = await querySamples(sdk, HKQuantityTypeIdentifier.heartRate, from, new Date(), 200);
  return samples.map((s: any) => {
    let value = 0;
    try { value = Math.round(s.quantity.doubleValue(HKUnit.hertz()) * 60); } catch {}
    if (!value) try { value = Math.round(s.quantity.doubleValue('count/min')); } catch {}
    return { value, startDate: s.startDate };
  }).filter(s => s.value > 30 && s.value < 300);
}

// ─── Workouts ─────────────────────────────────────────────────────────────────

export async function fetchWorkouts(limit = 20): Promise<HKWorkout[]> {
  const sdk = getSDK();
  if (!sdk) return [];
  try {
    const { default: HealthKit } = sdk as any;
    const from = new Date(Date.now() - 30 * 86400000);
    const results = await HealthKit.queryWorkoutSamples({ from, to: new Date(), limit }) ?? [];
    return results.map((w: any) => ({
      activityId: w.workoutActivityType ?? 0,
      activityName: w.workoutActivityType ?? 'Тренування',
      calories: Math.round(w.totalEnergyBurned?.doubleValue('kcal') ?? 0),
      distance: Math.round((w.totalDistance?.doubleValue('m') ?? 0)),
      duration: Math.round(w.duration ?? 0),
      startDate: w.startDate,
      endDate: w.endDate,
      sourceName: w.sourceRevision?.source?.name ?? '',
    }));
  } catch {
    return [];
  }
}
