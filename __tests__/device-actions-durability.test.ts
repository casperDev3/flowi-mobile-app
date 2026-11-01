/**
 * store/device-actions.ts — надійність дій пристроїв (ревʼю 2026-10-18):
 *   H1 — збій запису в сховище дає `retry`, а не «applied»; зупинка таймера
 *        повторювана: повтор дописує те, чого бракує, без дублів;
 *   M3 — повтор ad-hoc `timer_start`, уже зупиненого деінде, не воскрешає таймер;
 *   M4 — черга App Group застосовує лише дії поточного користувача; вихід
 *        чистить черги, власника й журнал.
 */
const mockStore = new Map<string, string>();
const mockFail = new Map<string, number>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    const left = mockFail.get(k) ?? 0;
    if (left > 0) {
      mockFail.set(k, left - 1);
      throw new Error('disk full');
    }
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}));

import * as FlowiAndroid from '@/modules/flowi-android';
import * as IosBridge from '@/modules/flowi-ios-bridge';
import {
  APPLIED_LOG_KEY,
  applyDeviceActions,
  drainIosPendingActions,
  isActionOwnedBy,
  resetDeviceActions,
} from '@/store/device-actions';
import type { DeviceAction } from '@/utils/deviceActions';

type Rec = Record<string, any>;
const read = <T = Rec[]>(key: string): T => JSON.parse(mockStore.get(key) ?? 'null') as T;
const seed = (key: string, value: unknown) => mockStore.set(key, JSON.stringify(value));

let seq = 500;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
function action(type: DeviceAction['type'], payload: Record<string, unknown>, agoSec = 5): DeviceAction {
  return { id: uuid(), type, at: new Date(Date.now() - agoSec * 1000).toISOString(), tz: 'Europe/Kyiv', source: 'watch', payload };
}

const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

beforeEach(() => {
  mockStore.clear();
  mockFail.clear();
});

afterAll(() => warn.mockRestore());

describe('H1: збій запису → retry', () => {
  it('expense_create: transactions не записано — retry, без запису в журнал; повтор застосовує', async () => {
    seed('accounts', [{ id: 'acc', name: 'A', currency: 'UAH' }]);
    seed('transactions', []);
    mockFail.set('transactions', 1);
    const a = action('expense_create', { amount: 10, category: 'Food', accountId: 'acc' });

    const [first] = await applyDeviceActions([a]);
    expect(first.status).toBe('retry');
    expect(read('transactions')).toEqual([]);
    expect(read(APPLIED_LOG_KEY)).toBeNull();

    const [second] = await applyDeviceActions([a]);
    expect(second.status).toBe('applied');
    expect(read('transactions')).toEqual([expect.objectContaining({ id: a.id })]);
  });

  it('збій outbox теж не дає «applied»', async () => {
    mockFail.set('sync_outbox', 1);
    const a = action('note_create', { text: 'Hi' });
    expect((await applyDeviceActions([a]))[0].status).toBe('retry');
  });

  it('timer_stop: збій запису tasks — таймер лишається, повтор дописує сесію без дублів', async () => {
    const startedAt = new Date(Date.now() - 3600_000).toISOString();
    seed('tasks', [{ id: 't1', title: 'X', status: 'active', subtasks: [], createdAt: startedAt, history: [] }]);
    seed('active_timers', [{ id: 'task:t1', taskId: 't1', label: 'X', startedAt }]);
    const a = action('timer_stop', { timerId: 'task:t1' });

    mockFail.set('tasks', 1);
    expect((await applyDeviceActions([a]))[0].status).toBe('retry');
    expect(read('active_timers')).toEqual([expect.objectContaining({ id: 'task:t1' })]);

    expect((await applyDeviceActions([a]))[0].status).toBe('applied');
    const task = read('tasks')[0];
    expect(task.timeEntries).toEqual([expect.objectContaining({ id: `wa-${a.id}`, startedAt, endedAt: a.at })]);
    expect(task.history.filter((e: Rec) => e.id === `wa-${a.id}-s`)).toHaveLength(1);
    expect(read('time_entries')).toEqual([expect.objectContaining({ id: `wa-${a.id}`, taskId: 't1' })]);
    expect(read('active_timers')).toEqual([]);

    expect((await applyDeviceActions([a]))[0].status).toBe('duplicate');
  });

  it('timer_stop: збій реєстру після запису сесії — повтор лише прибирає таймер', async () => {
    const startedAt = new Date(Date.now() - 3600_000).toISOString();
    seed('tasks', [{ id: 't1', title: 'X', status: 'active', subtasks: [], createdAt: startedAt, history: [] }]);
    seed('active_timers', [{ id: 'task:t1', taskId: 't1', label: 'X', startedAt }]);
    const a = action('timer_stop', { timerId: 'task:t1' });

    mockFail.set('active_timers', 1);
    expect((await applyDeviceActions([a]))[0].status).toBe('retry');
    expect((await applyDeviceActions([a]))[0].status).toBe('applied');
    expect(read('tasks')[0].timeEntries).toHaveLength(1);
    expect(read('tasks')[0].history).toHaveLength(1);
    expect(read('time_entries')).toHaveLength(1);
    expect(read('active_timers')).toEqual([]);
  });

  it('task_complete: збій зупинки таймера — повтор зупиняє його (duplicate для задачі)', async () => {
    const startedAt = new Date(Date.now() - 600_000).toISOString();
    seed('tasks', [{ id: 't1', title: 'X', status: 'active', subtasks: [], createdAt: startedAt, history: [] }]);
    seed('active_timers', [{ id: 'task:t1', taskId: 't1', label: 'X', startedAt }]);
    const a = action('task_complete', { taskId: 't1' });

    mockFail.set('time_entries', 1);
    expect((await applyDeviceActions([a]))[0].status).toBe('retry');
    expect(read('tasks')[0].status).toBe('done');
    expect(read('active_timers')).toHaveLength(1);

    expect((await applyDeviceActions([a]))[0].status).toBe('duplicate');
    expect(read('active_timers')).toEqual([]);
    expect(read('time_entries')).toEqual([expect.objectContaining({ id: `wa-${a.id}` })]);
    expect(read('tasks')[0].timeEntries).toHaveLength(1);
  });

  it('timer_start задачі: збій історії — повтор дописує подію старту', async () => {
    seed('tasks', [{ id: 't1', title: 'X', status: 'active', subtasks: [], createdAt: new Date().toISOString(), history: [] }]);
    seed('active_timers', []);
    const a = action('timer_start', { kind: 'task', taskId: 't1' });

    mockFail.set('tasks', 1);
    expect((await applyDeviceActions([a]))[0].status).toBe('retry');
    expect(read('active_timers')).toHaveLength(1);
    expect((await applyDeviceActions([a]))[0].status).toBe('duplicate');
    expect(read('tasks')[0].history).toEqual([expect.objectContaining({ id: `wa-${a.id}`, type: 'timer_start' })]);
    expect(read('active_timers')).toHaveLength(1);
  });
});

describe('M3: повтор ad-hoc timer_start', () => {
  const variants: [string, (a: DeviceAction) => Rec][] = [
    ['timerId', a => ({ id: 'x', timerId: `adhoc:${a.id}`, task: 'Run', startedAt: a.at, duration: 30 })],
    ['id дзеркала вебу', a => ({ id: `mirror-adhoc:${a.id}-abc`, task: 'Run', startedAt: a.at, duration: 30 })],
    ['той самий старт і назва', a => ({ id: 'timer_x', task: 'Run', startedAt: a.at, duration: 30 })],
  ];
  it.each(variants)('уже зупинену сесію (%s) не воскрешає', async (_name, entry) => {
    const a = action('timer_start', { kind: 'adhoc', label: 'Run' }, 60);
    seed('active_timers', []);
    seed('time_entries', [entry(a)]);
    const [r] = await applyDeviceActions([a]);
    expect(r.status).toBe('duplicate');
    expect(read('active_timers')).toEqual([]);
  });

  it('сесія іншого таймера не заважає старту', async () => {
    const a = action('timer_start', { kind: 'adhoc', label: 'Run' }, 60);
    seed('active_timers', []);
    seed('time_entries', [{ id: 'y', task: 'Run', taskId: 't9', startedAt: a.at, duration: 30 }]);
    expect((await applyDeviceActions([a]))[0].status).toBe('applied');
    expect(read('active_timers')).toEqual([expect.objectContaining({ id: `adhoc:${a.id}` })]);
  });
});

describe('M4: власник черги', () => {
  it('isActionOwnedBy: лише непорожній збіг', () => {
    expect(isActionOwnedBy({ userId: '7' }, '7')).toBe(true);
    expect(isActionOwnedBy({ userId: '8' }, '7')).toBe(false);
    expect(isActionOwnedBy({}, '7')).toBe(false);
    expect(isActionOwnedBy({ userId: '' }, '')).toBe(false);
    expect(isActionOwnedBy({ userId: '7' }, null)).toBe(false);
  });

  it('drain iOS застосовує лише дії поточного користувача, чужі й непідписані прибирає', async () => {
    const mine = { ...action('note_create', { text: 'mine' }), userId: '7' };
    const foreign = { ...action('note_create', { text: 'foreign' }), userId: '8' };
    const legacy = action('note_create', { text: 'legacy' });
    const removed: string[][] = [];
    IosBridge.__setIosBridgeForTests({
      readPendingActions: () => JSON.stringify([mine, foreign, legacy]),
      removePendingActions: (ids: string[]) => removed.push(ids),
    });
    try {
      await drainIosPendingActions('7');
    } finally {
      IosBridge.__setIosBridgeForTests(undefined);
    }
    expect(read('notes').map((n: Rec) => n.id)).toEqual([mine.id]);
    expect(removed.flat().sort()).toEqual([mine.id, foreign.id, legacy.id].sort());
  });

  it('drain без власника нічого не читає', async () => {
    const readPending = jest.fn(() => '[]');
    IosBridge.__setIosBridgeForTests({ readPendingActions: readPending, removePendingActions: jest.fn() });
    try {
      await drainIosPendingActions(null);
    } finally {
      IosBridge.__setIosBridgeForTests(undefined);
    }
    expect(readPending).not.toHaveBeenCalled();
  });

  it('resetDeviceActions: власник null, обидві черги порожні, журнал стерто', async () => {
    seed(APPLIED_LOG_KEY, [{ id: 'x', status: 'applied', at: Date.now() }]);
    const ios = { setDeviceActionOwner: jest.fn(), clearPendingActions: jest.fn() };
    const android = { setDeviceActionOwner: jest.fn(), clearPendingActions: jest.fn() };
    IosBridge.__setIosBridgeForTests(ios);
    FlowiAndroid.__setFlowiAndroidNativeForTests(android as never);
    try {
      await resetDeviceActions();
    } finally {
      IosBridge.__setIosBridgeForTests(undefined);
      FlowiAndroid.__setFlowiAndroidNativeForTests(undefined);
    }
    expect(ios.setDeviceActionOwner).toHaveBeenCalledWith(null);
    expect(ios.clearPendingActions).toHaveBeenCalled();
    expect(android.setDeviceActionOwner).toHaveBeenCalledWith(null);
    expect(android.clearPendingActions).toHaveBeenCalled();
    expect(mockStore.has(APPLIED_LOG_KEY)).toBe(false);
  });
});
