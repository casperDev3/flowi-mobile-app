/**
 * __tests__/health-auto-sync.test.ts — рушій автосинку (readAutoHealth):
 * бекфіл 7 діб, тротлінг 30 хв, стан пристрою, провал читання ≠ нулі.
 * Той самий рушій використовує і фонова задача (§10).
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
jest.mock('expo-router', () => ({ useFocusEffect: () => {}, usePathname: () => '/' }));

import { AUTO_STATE_KEY, AUTO_SUPPRESSED_KEY, __resetAutoHealthForTests, pickHealthSource, readAutoHealth } from '@/hooks/use-health-entries';
import type { AutoDayRead, HealthSourceApi } from '@/utils/healthUtils';

function fakeSource(opts: { fail?: boolean } = {}) {
  const readDay = jest.fn(async (day: Date) => {
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    const read: AutoDayRead = {
      day: key, steps: 1000, activeCalories: 100, heartRateAvg: 70, restingHeartRate: 55,
      spo2: null, distanceKm: 1.2, sleep: null,
    };
    return { read, outcome: { ok: !opts.fail, queries: 5, failures: opts.fail ? 5 : 0 } };
  });
  const readWeights = jest.fn(async () => ({
    samples: [{ value: 80, measuredAt: new Date(2026, 8, 20, 7).toISOString(), sourceKey: 'w1' }],
    outcome: { ok: !opts.fail, queries: 1, failures: opts.fail ? 1 : 0 },
  }));
  const src: HealthSourceApi = {
    source: 'healthconnect', label: 'Health Connect', isAvailable: true,
    requestAccess: async () => true, getAccess: async () => 'granted', readDay, readWeights,
  };
  return { src, readDay, readWeights };
}

beforeEach(() => { mockStore.clear(); __resetAutoHealthForTests(); });

const now = new Date(2026, 8, 23, 10);

test('перший запуск: 7 діб, потім вага; стан пристрою записано', async () => {
  const { src, readDay } = fakeSource();
  const res = await readAutoHealth({ source: src, now, pauseMs: 0, force: true });
  expect(res?.ok).toBe(true);
  expect(readDay).toHaveBeenCalledTimes(7);
  expect(res!.entries.some(e => e.id === 'hk:pulse_rest:2026-09-17')).toBe(true);
  expect(res!.entries.some(e => e.type === 'weight' && e.date === new Date(2026, 8, 20, 7).toISOString())).toBe(true);
  const state = JSON.parse(mockStore.get(AUTO_STATE_KEY)!);
  expect(state).toMatchObject({ lastSyncedDay: '2026-09-23', lastError: null, platform: 'healthconnect' });
});

test('без force — не частіше ніж раз на 30 хв', async () => {
  const { src, readDay } = fakeSource();
  await readAutoHealth({ source: src, now, pauseMs: 0, force: true });
  readDay.mockClear();
  expect(await readAutoHealth({ source: src, now: new Date(now.getTime() + 10 * 60000), pauseMs: 0 })).toBeNull();
  expect(readDay).not.toHaveBeenCalled();
  const later = await readAutoHealth({ source: src, now: new Date(now.getTime() + 31 * 60000), pauseMs: 0 });
  // Уже синкали сьогодні — лише вчора й сьогодні.
  expect(readDay).toHaveBeenCalledTimes(2);
  expect(later?.days).toEqual(['2026-09-22', '2026-09-23']);
});

test('провал читання — ok:false і жодного запису (не нулі)', async () => {
  const { src } = fakeSource({ fail: true });
  const res = await readAutoHealth({ source: src, now, pauseMs: 0, force: true });
  expect(res).toEqual(expect.objectContaining({ ok: false, entries: [] }));
  expect(JSON.parse(mockStore.get(AUTO_STATE_KEY)!).lastError).toBe('read_failed');
});

test('тумбстоуни видалених записів повертаються для злиття', async () => {
  mockStore.set(AUTO_SUPPRESSED_KEY, JSON.stringify(['hk:steps:2026-09-23']));
  const { src } = fakeSource();
  const res = await readAutoHealth({ source: src, now, pauseMs: 0, force: true });
  expect(res!.suppressed.has('hk:steps:2026-09-23')).toBe(true);
});

test('джерело за платформою', () => {
  expect(pickHealthSource('ios')?.source).toBe('healthkit');
  expect(pickHealthSource('android')?.source).toBe('healthconnect');
  expect(pickHealthSource('web')).toBeNull();
});
