/**
 * store/health-connect.ts — Android Health Connect, той самий контракт, що й
 * store/healthkit.ts (`HealthSourceApi` з utils/healthUtils.ts).
 *
 * Специфікація: flowi-server-app/docs/specs/health-auto-data.md §5, §9.2.
 *
 * Модуль `react-native-health-connect` підвантажується ЛІНИВО й опційно
 * (require у try/catch — Metro трактує його як optional dependency): збірка
 * без пакета не падає, а джерело чесно каже `unavailable`, а не малює нулі.
 *
 * Тільки читання. Дозволи просимо НЕ на старті, а коли людина натиснула
 * «Підключити дані» (`requestAccess`) — інакше діалог без контексту
 * відхиляють. Часткова згода — нормальний стан: читаємо те, що дали.
 */
import { Linking, Platform } from 'react-native';

import { localDateKey } from '@/utils/dateUtils';
import {
  type AutoDayRead,
  type HealthAccess,
  type HealthReadOutcome,
  type HealthSourceApi,
  type SleepInterval,
  type WeightSample,
  aggregateSleep,
  hcSleepStage,
  median,
  sleepWindow,
  spo2Percent,
} from '@/utils/healthUtils';

export const HC_AVAILABLE = Platform.OS === 'android';

/** Пакет провайдера — для посилання на встановлення (Android 13 і нижче). */
export const HC_PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';

/** Рівно ті типи, які читаємо (§9.2): зайвий дозвіл = відмова в Google Play. */
export const HC_RECORD_TYPES = [
  'Steps',
  'HeartRate',
  'RestingHeartRate',
  'ActiveCaloriesBurned',
  'Distance',
  'SleepSession',
  'Weight',
  'OxygenSaturation',
] as const;

type HCRecordType = typeof HC_RECORD_TYPES[number];

// SdkAvailabilityStatus
const SDK_UNAVAILABLE = 1;
const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;
const SDK_AVAILABLE = 3;

let _sdk: any | null | undefined;

function getSDK(): any | null {
  if (_sdk !== undefined) return _sdk;
  if (!HC_AVAILABLE) { _sdk = null; return null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sdk = require('react-native-health-connect');
  } catch {
    _sdk = null;
  }
  return _sdk;
}

/** Тільки для тестів: скинути кеш модуля. */
export function __resetHealthConnectForTests(): void {
  _sdk = undefined;
  _initialized = false;
}

let _initialized = false;

async function ensureInitialized(sdk: any): Promise<boolean> {
  if (_initialized) return true;
  try {
    if (typeof sdk.getSdkStatus === 'function') {
      const status = await sdk.getSdkStatus();
      if (status !== SDK_AVAILABLE) return false;
    }
    if (typeof sdk.initialize === 'function') {
      _initialized = !!(await sdk.initialize());
    } else {
      _initialized = true;
    }
    return _initialized;
  } catch (e) {
    if (__DEV__) console.warn('[HealthConnect] initialize failed:', e);
    return false;
  }
}

/**
 * Health Connect відсутній або застарів — екран має показати пояснення й
 * посилання на встановлення, а не порожні нулі.
 */
export async function getHealthConnectStatus(): Promise<'available' | 'not_installed' | 'update_required' | 'unsupported'> {
  const sdk = getSDK();
  if (!sdk) return 'unsupported';
  try {
    if (typeof sdk.getSdkStatus !== 'function') return 'available';
    const status = await sdk.getSdkStatus();
    if (status === SDK_AVAILABLE) return 'available';
    if (status === SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'update_required';
    if (status === SDK_UNAVAILABLE) return 'not_installed';
    return 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** Відкрити Health Connect у Play Store (встановлення / оновлення). */
export async function openHealthConnectInstall(): Promise<void> {
  const market = `market://details?id=${HC_PROVIDER_PACKAGE}`;
  const web = `https://play.google.com/store/apps/details?id=${HC_PROVIDER_PACKAGE}`;
  try { await Linking.openURL(market); } catch { await Linking.openURL(web).catch(() => {}); }
}

/** Відкрити налаштування Health Connect (там людина керує дозволами). */
export async function openHealthConnectSettings(): Promise<void> {
  const sdk = getSDK();
  try {
    if (sdk && typeof sdk.openHealthConnectSettings === 'function') { sdk.openHealthConnectSettings(); return; }
  } catch { /* впадемо в загальні налаштування */ }
  await Linking.openSettings().catch(() => {});
}

const READ_PERMISSIONS = HC_RECORD_TYPES.map(recordType => ({ accessType: 'read', recordType }));

export async function requestHealthConnectAccess(): Promise<boolean> {
  const sdk = getSDK();
  if (!sdk || !(await ensureInitialized(sdk))) return false;
  try {
    const granted = await sdk.requestPermission(READ_PERMISSIONS);
    return Array.isArray(granted) ? granted.length > 0 : !!granted;
  } catch (e) {
    if (__DEV__) console.warn('[HealthConnect] requestPermission failed:', e);
    return false;
  }
}

/** Які типи дозволено. Порожня множина — не дали нічого. */
async function grantedTypes(sdk: any): Promise<Set<string> | null> {
  try {
    if (typeof sdk.getGrantedPermissions !== 'function') return null;
    const list = await sdk.getGrantedPermissions();
    return new Set((Array.isArray(list) ? list : [])
      .filter((p: any) => p?.accessType === 'read')
      .map((p: any) => String(p.recordType)));
  } catch {
    return null;
  }
}

/**
 * На відміну від Apple, Health Connect ЧЕСНО каже, що дозволено.
 * Жодного дозволу → `denied` (показати кнопку), бодай один → `granted`.
 */
export async function getHealthConnectAccess(): Promise<HealthAccess> {
  const sdk = getSDK();
  if (!sdk) return 'unavailable';
  if (!(await ensureInitialized(sdk))) return 'unavailable';
  const granted = await grantedTypes(sdk);
  if (granted === null) return 'unknown';
  return granted.size > 0 ? 'granted' : 'denied';
}

// ─── Читання ────────────────────────────────────────────────────────────────

interface Stats { queries: number; failures: number }

function outcomeOf(stats: Stats): HealthReadOutcome {
  return { ok: stats.queries === 0 || stats.failures < stats.queries, queries: stats.queries, failures: stats.failures };
}

function between(from: Date, to: Date) {
  return { operator: 'between', startTime: from.toISOString(), endTime: to.toISOString() };
}

/** Фізичні величини: мінус — завжди помилка знаку (як quantityValue у healthkit.ts). */
function abs(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** Усі записи типу за період, з пагінацією. Кидає — викликач рахує провал. */
async function readAll(sdk: any, recordType: HCRecordType, from: Date, to: Date, maxPages = 10): Promise<any[]> {
  const out: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const res = await sdk.readRecords(recordType, {
      timeRangeFilter: between(from, to),
      ...(pageToken ? { pageToken } : {}),
    });
    // v1 пакета віддавав масив, v2+ — { records, pageToken }.
    const records = Array.isArray(res) ? res : (res?.records ?? []);
    out.push(...records);
    pageToken = Array.isArray(res) ? undefined : res?.pageToken;
    if (!pageToken) break;
  }
  return out;
}

async function tracked<T>(stats: Stats, allowed: Set<string> | null, type: HCRecordType, fallback: T, run: () => Promise<T>): Promise<T> {
  // Тип без дозволу — «немає доступу», не провал і не нуль: запит не робимо.
  if (allowed && !allowed.has(type)) return fallback;
  stats.queries++;
  try {
    return await run();
  } catch (e) {
    stats.failures++;
    if (__DEV__) console.warn('[HealthConnect] read failed:', type, e);
    return fallback;
  }
}

async function aggregate(sdk: any, recordType: HCRecordType, from: Date, to: Date): Promise<any> {
  return sdk.aggregateRecord({ recordType, timeRangeFilter: between(from, to) });
}

function timeOf(value: unknown): number {
  const t = new Date(value as string).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Інтервали сну з сесій Health Connect. Сесія з фазами розкладається по
 * фазах; сесія БЕЗ жодної відомої фази (часто — дешеві трекери й ручний
 * запис) дає один інтервал `asleep`: лише загальна тривалість.
 */
export function hcSleepIntervals(sessions: readonly any[]): SleepInterval[] {
  const out: SleepInterval[] = [];
  for (const session of sessions) {
    const stages = Array.isArray(session?.stages) ? session.stages : [];
    const mapped: SleepInterval[] = [];
    for (const st of stages) {
      const stage = hcSleepStage(st?.stage);
      const start = timeOf(st?.startTime);
      const end = timeOf(st?.endTime);
      if (stage && Number.isFinite(start) && Number.isFinite(end) && end > start) mapped.push({ start, end, stage });
    }
    if (mapped.length) { out.push(...mapped); continue; }
    const start = timeOf(session?.startTime);
    const end = timeOf(session?.endTime);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) out.push({ start, end, stage: 'asleep' });
  }
  return out;
}

function startOfDay(d: Date): Date { const s = new Date(d); s.setHours(0, 0, 0, 0); return s; }
function endOfDay(d: Date): Date { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; }

export async function readHealthConnectDay(day: Date, now: Date = new Date()): Promise<{ read: AutoDayRead; outcome: HealthReadOutcome }> {
  const read: AutoDayRead = {
    day: localDateKey(day), steps: null, activeCalories: null, heartRateAvg: null,
    heartRateMin: null, heartRateMax: null, restingHeartRate: null, spo2: null, distanceKm: null, sleep: null,
  };
  const sdk = getSDK();
  if (!sdk || !(await ensureInitialized(sdk))) return { read, outcome: { ok: false, queries: 0, failures: 0 } };

  const from = startOfDay(day);
  const dayEnd = endOfDay(day);
  const to = dayEnd.getTime() > now.getTime() ? now : dayEnd;
  const win = sleepWindow(day, now);
  const stats: Stats = { queries: 0, failures: 0 };
  const allowed = await grantedTypes(sdk);

  const [steps, cal, hr, rest, spo2, dist, sleep] = await Promise.all([
    tracked(stats, allowed, 'Steps', null as number | null, async () => {
      const r = await aggregate(sdk, 'Steps', from, to);
      return Math.round(abs(r?.COUNT_TOTAL));
    }),
    tracked(stats, allowed, 'ActiveCaloriesBurned', null as number | null, async () => {
      const r = await aggregate(sdk, 'ActiveCaloriesBurned', from, to);
      return Math.round(abs(r?.ACTIVE_CALORIES_TOTAL?.inKilocalories));
    }),
    tracked(stats, allowed, 'HeartRate', null as { avg: number; min: number; max: number } | null, async () => {
      const records = await readAll(sdk, 'HeartRate', from, to);
      const values: number[] = [];
      for (const rec of records) {
        for (const s of rec?.samples ?? []) {
          const v = Math.round(abs(s?.beatsPerMinute));
          if (v > 30 && v < 300) values.push(v);
        }
      }
      if (!values.length) return null;
      return {
        avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
        min: Math.min(...values),
        max: Math.max(...values),
      };
    }),
    tracked(stats, allowed, 'RestingHeartRate', null as number | null, async () => {
      const records = await readAll(sdk, 'RestingHeartRate', from, to);
      const latest = records
        .map((r: any) => ({ t: timeOf(r?.time), v: Math.round(abs(r?.beatsPerMinute)) }))
        .filter(x => x.v > 20 && x.v < 250)
        .sort((a, b) => (b.t || 0) - (a.t || 0))[0];
      return latest ? latest.v : null;
    }),
    tracked(stats, allowed, 'OxygenSaturation', null as number | null, async () => {
      const records = await readAll(sdk, 'OxygenSaturation', from, to);
      // Health Connect віддає ВІДСОТОК (0..100) — множити не треба.
      return spo2Percent(median(records.map((r: any) => abs(r?.percentage)).filter(v => v > 0)));
    }),
    tracked(stats, allowed, 'Distance', null as number | null, async () => {
      const r = await aggregate(sdk, 'Distance', from, to);
      const meters = abs(r?.DISTANCE?.inMeters);
      return meters > 0 ? Math.round(meters / 100) / 10 : null;
    }),
    tracked(stats, allowed, 'SleepSession', [] as any[], () => readAll(sdk, 'SleepSession', win.from, win.to)),
  ]);

  read.steps = steps;
  read.activeCalories = cal;
  if (hr) { read.heartRateAvg = hr.avg; read.heartRateMin = hr.min; read.heartRateMax = hr.max; }
  read.restingHeartRate = rest;
  read.spo2 = spo2;
  read.distanceKm = dist;
  read.sleep = aggregateSleep(hcSleepIntervals(sleep), win);
  return { read, outcome: outcomeOf(stats) };
}

export async function readHealthConnectWeights(from: Date, to: Date): Promise<{ samples: WeightSample[]; outcome: HealthReadOutcome }> {
  const sdk = getSDK();
  if (!sdk || !(await ensureInitialized(sdk))) return { samples: [], outcome: { ok: false, queries: 0, failures: 0 } };
  const stats: Stats = { queries: 0, failures: 0 };
  const allowed = await grantedTypes(sdk);
  const records = await tracked(stats, allowed, 'Weight', [] as any[], () => readAll(sdk, 'Weight', from, to));
  const samples: WeightSample[] = [];
  for (const r of records) {
    const t = timeOf(r?.time);
    const value = abs(r?.weight?.inKilograms);
    if (!Number.isFinite(t) || !(value > 0)) continue;
    const measuredAt = new Date(t).toISOString();
    const id = r?.metadata?.id;
    samples.push({ value, measuredAt, sourceKey: typeof id === 'string' && id ? id : `${measuredAt}:${Math.round(value * 10)}` });
  }
  return { samples, outcome: outcomeOf(stats) };
}

export const healthConnectSource: HealthSourceApi = {
  source: 'healthconnect',
  label: 'Health Connect',
  isAvailable: HC_AVAILABLE,
  requestAccess: requestHealthConnectAccess,
  getAccess: getHealthConnectAccess,
  readDay: readHealthConnectDay,
  readWeights: readHealthConnectWeights,
};
