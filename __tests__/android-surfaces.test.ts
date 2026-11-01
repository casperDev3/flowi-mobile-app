/**
 * store/android-surfaces.ts — склейка JS ↔ віджети/сповіщення Android (spec §10).
 * Нативний модуль, applyDeviceActions, знімок і контексти замокано.
 */
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockNative = {
  isAvailable: jest.fn(() => true),
  setWidgetSnapshot: jest.fn((_json: string) => true),
  showTimerNotification: jest.fn((_p: unknown) => true),
  clearTimerNotification: jest.fn(),
  canPostNotifications: jest.fn(() => true),
  readPendingActions: jest.fn(() => '[]'),
  removePendingActions: jest.fn(),
  clearPendingActions: jest.fn(),
  setDeviceActionOwner: jest.fn(),
  addPendingActionsListener: jest.fn((_cb: () => void) => ({ remove: jest.fn() })),
  addTimerNotificationDismissedListener: jest.fn((_cb: () => void) => ({ remove: jest.fn() })),
};
jest.mock('@/modules/flowi-android', () => mockNative);

const mockAppStateListeners: ((s: string) => void)[] = [];
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: {
    addEventListener: jest.fn((_e: string, cb: (s: string) => void) => {
      mockAppStateListeners.push(cb);
      return { remove: jest.fn() };
    }),
  },
}));

const mockApply = jest.fn();
jest.mock('@/store/device-actions', () => ({ applyDeviceActions: (...a: unknown[]) => mockApply(...a) }));

const mockCallOrder: string[] = [];
const mockMigrations = jest.fn(async () => { mockCallOrder.push('migrations'); return []; });
jest.mock('@/store/migrations', () => ({ ensureStorageMigrations: () => mockMigrations() }));

const mockCompute = jest.fn();
jest.mock('@/store/widget-sync', () => ({
  WIDGET_SOURCE_KEYS: ['tasks', 'active_timers'],
  computeWidgetSnapshot: (...a: unknown[]) => mockCompute(...a),
}));

const mockStorageListeners: ((key: string) => void)[] = [];
jest.mock('@/store/storage', () => ({
  subscribeToStorage: (cb: (key: string) => void) => {
    mockStorageListeners.push(cb);
    return () => {};
  },
}));

let mockAuthState: { status: string; user: { id: number } | null } = { status: 'authed', user: { id: 7 } };
jest.mock('@/store/auth', () => ({ useAuth: () => mockAuthState }));

let mockTimerState: { activeTimers: unknown[]; timersReady: boolean } = { activeTimers: [], timersReady: true };
jest.mock('@/store/timer-context', () => ({ useTimerContext: () => mockTimerState }));

const mockStrings = {
  timerNotifTitle: 'Таймер іде',
  timerNotifStop: 'Зупинити',
  timerNotifChannel: 'Таймер',
  timerNotifMore: '+{n} ще',
};
jest.mock('@/store/i18n', () => ({ useI18n: () => ({ lang: 'uk', tr: mockStrings }) }));

// Модуль під тестом — після моків (фабрики читають змінні mock*).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const surfaces = require('@/store/android-surfaces') as typeof import('@/store/android-surfaces');
const {
  ANDROID_SNAPSHOT_KEYS,
  __resetAndroidSurfacesForTests,
  drainAndroidPendingActions,
  excludedTimerIds,
  parsePendingActions,
  pendingStopTimerIds,
  timerNotificationFor,
  useAndroidSurfaces,
  writeAndroidWidgetSnapshot,
} = surfaces;

const stopAction = (id: string, timerId: string, userId: string | null = '7') => ({
  id,
  ...(userId === null ? {} : { userId }),
  type: 'timer_stop',
  at: '2026-10-18T09:00:00.000Z',
  source: 'android_notification',
  payload: { timerId },
});

function snapshot(extra: Record<string, unknown> = {}) {
  return {
    v: 1, generatedAt: new Date().toISOString(), day: '2026-10-18', lang: 'uk', authed: true,
    finance: { currency: 'UAH', symbol: '₴', decimals: 2, income: 0, expense: 0 },
    steps: { value: 0, goal: 10000 }, tasks: { done: 1, total: 3 },
    time: { trackedSec: 0, running: null }, next: { meeting: null, task: null },
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetAndroidSurfacesForTests();
  mockNative.isAvailable.mockReturnValue(true);
  mockNative.readPendingActions.mockReturnValue('[]');
  mockNative.setWidgetSnapshot.mockReturnValue(true);
  mockNative.showTimerNotification.mockReturnValue(true);
  mockCallOrder.length = 0;
  mockAppStateListeners.length = 0;
  mockStorageListeners.length = 0;
  mockAuthState = { status: 'authed', user: { id: 7 } };
  mockTimerState = { activeTimers: [], timersReady: true };
  mockCompute.mockImplementation(async () => snapshot());
  mockApply.mockImplementation(async (actions: { id: string }[]) => {
    mockCallOrder.push('apply');
    return actions.map(a => ({ id: a.id, status: 'applied' }));
  });
});

describe('parsePendingActions / pendingStopTimerIds', () => {
  it('терпить биті дані й відкидає записи без id', () => {
    expect(parsePendingActions('')).toEqual([]);
    expect(parsePendingActions('not json')).toEqual([]);
    expect(parsePendingActions('{"id":"x"}')).toEqual([]);
    const parsed = parsePendingActions(JSON.stringify([stopAction('a', 'task:1'), { type: 'timer_stop' }, null, { id: '' }]));
    expect(parsed.map(a => a.id)).toEqual(['a']);
  });

  it('збирає id таймерів з timer_stop', () => {
    const ids = pendingStopTimerIds(parsePendingActions(JSON.stringify([
      stopAction('a', 'task:1'),
      { id: 'b', type: 'note_create', at: 'x', payload: { text: 'hi' } },
      stopAction('c', 'adhoc:z'),
    ])));
    expect([...ids].sort()).toEqual(['adhoc:z', 'task:1']);
  });
});

describe('timerNotificationFor', () => {
  const timers = [
    { id: 'task:1', taskId: '1', label: 'Старе', startedAt: '2026-10-18T08:00:00.000Z' },
    { id: 'adhoc:2', label: 'Нове', startedAt: '2026-10-18T09:30:00.000Z' },
    { id: 'meeting:3', meetingId: '3', label: 'Нарада', startedAt: '2026-10-18T09:00:00.000Z' },
  ];

  it('немає таймерів → null', () => {
    expect(timerNotificationFor([], mockStrings)).toBeNull();
  });

  it('показує найсвіжіший таймер і «+N ще» для решти', () => {
    const p = timerNotificationFor(timers, mockStrings)!;
    expect(p).toEqual({
      timerId: 'adhoc:2',
      label: 'Нове',
      startedAtMs: Date.parse('2026-10-18T09:30:00.000Z'),
      otherCount: 2,
      title: 'Таймер іде',
      stopLabel: 'Зупинити',
      channelName: 'Таймер',
      moreLabel: '+2 ще',
    });
  });

  it('пропускає таймери з уже поставленим Stop і биті мітки', () => {
    const p = timerNotificationFor(
      [...timers, { id: 'bad', label: 'x', startedAt: 'nope' }],
      mockStrings,
      new Set(['adhoc:2', 'meeting:3']),
    )!;
    expect(p.timerId).toBe('task:1');
    expect(p.otherCount).toBe(0);
    expect(p.moreLabel).toBe('');
  });
});

describe('drainAndroidPendingActions', () => {
  it('застосовує чергу й прибирає все, крім retry', async () => {
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 't1'), stopAction('b', 't2'), stopAction('c', 't3')]));
    mockApply.mockResolvedValue([
      { id: 'a', status: 'applied' },
      { id: 'b', status: 'retry', reason: 'not_found' },
      { id: 'c', status: 'rejected', reason: 'not_found' },
    ]);
    await drainAndroidPendingActions('7');
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0][0].map((a: { id: string }) => a.id)).toEqual(['a', 'b', 'c']);
    expect(mockNative.removePendingActions).toHaveBeenCalledWith(['a', 'c']);
  });

  it('порожня черга — applyDeviceActions не кличеться', async () => {
    await drainAndroidPendingActions('7');
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockNative.removePendingActions).not.toHaveBeenCalled();
  });

  it('збій застосування — нічого не прибирає', async () => {
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 't1')]));
    mockApply.mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await drainAndroidPendingActions('7');
    warn.mockRestore();
    expect(mockNative.removePendingActions).not.toHaveBeenCalled();
  });

  it('паралельні виклики зливаються; подія під час застосування — ще одне коло', async () => {
    let release!: () => void;
    mockNative.readPendingActions
      .mockReturnValueOnce(JSON.stringify([stopAction('a', 't1')]))
      .mockReturnValueOnce(JSON.stringify([stopAction('b', 't2')]))
      .mockReturnValue('[]');
    mockApply
      .mockImplementationOnce(
        (actions: { id: string }[]) =>
          new Promise(resolve => { release = () => resolve(actions.map(a => ({ id: a.id, status: 'applied' }))); }),
      );
    const first = drainAndroidPendingActions('7');
    const second = drainAndroidPendingActions('7');
    await Promise.resolve();
    release();
    await Promise.all([first, second]);
    expect(mockApply).toHaveBeenCalledTimes(2);
    expect(mockNative.removePendingActions).toHaveBeenNthCalledWith(1, ['a']);
    expect(mockNative.removePendingActions).toHaveBeenNthCalledWith(2, ['b']);
  });

  it('без нативного модуля — no-op', async () => {
    mockNative.isAvailable.mockReturnValue(false);
    await drainAndroidPendingActions('7');
    expect(mockNative.readPendingActions).not.toHaveBeenCalled();
  });
});

describe('черга: власник і міграції (NATIVE CONTRACT, A7, A8)', () => {
  it('міграції сховища — до застосування', async () => {
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 't1')]));
    await drainAndroidPendingActions('7');
    expect(mockCallOrder).toEqual(['migrations', 'apply']);
  });

  it('дії без userId чи чужого користувача прибираються без застосування', async () => {
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([
      stopAction('mine', 't1'),
      stopAction('legacy', 't2', null),
      stopAction('other', 't3', '8'),
    ]));
    await drainAndroidPendingActions('7');
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0][0].map((a: { id: string }) => a.id)).toEqual(['mine']);
    expect(mockNative.removePendingActions).toHaveBeenCalledWith(['legacy', 'other']);
    expect(mockNative.removePendingActions).toHaveBeenCalledWith(['mine']);
  });

  it('без власника — нічого не застосовує', async () => {
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 't1')]));
    await drainAndroidPendingActions(null);
    expect(mockNative.readPendingActions).not.toHaveBeenCalled();
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('чужий Stop у черзі не ховає таймер поточного користувача', () => {
    const queue = JSON.stringify([stopAction('a', 'task:1', '8'), stopAction('b', 'task:2')]);
    expect([...excludedTimerIds(queue, '7', [])]).toEqual(['task:2']);
  });
});

describe('writeAndroidWidgetSnapshot', () => {
  it('невдалий запис не запамʼятовується — наступна спроба пише знову (A5)', async () => {
    mockNative.setWidgetSnapshot.mockReturnValueOnce(false);
    expect(await writeAndroidWidgetSnapshot({ authed: true, myUserId: '7' })).toBe(false);
    expect(await writeAndroidWidgetSnapshot({ authed: true, myUserId: '7' })).toBe(true);
    expect(mockNative.setWidgetSnapshot).toHaveBeenCalledTimes(2);
  });

  it('пише знімок і пропускає незмінний (generatedAt не рахується)', async () => {
    expect(await writeAndroidWidgetSnapshot({ authed: true, myUserId: '7' })).toBe(true);
    expect(mockCompute).toHaveBeenCalledWith({ authed: true, myUserId: '7' }, expect.any(Date));
    expect(mockNative.setWidgetSnapshot).toHaveBeenCalledTimes(1);
    const written = JSON.parse(mockNative.setWidgetSnapshot.mock.calls[0][0]);
    expect(written.tasks).toEqual({ done: 1, total: 3 });

    expect(await writeAndroidWidgetSnapshot({ authed: true, myUserId: '7' })).toBe(false);
    expect(mockNative.setWidgetSnapshot).toHaveBeenCalledTimes(1);

    mockCompute.mockImplementation(async () => snapshot({ tasks: { done: 2, total: 3 } }));
    expect(await writeAndroidWidgetSnapshot({ authed: true, myUserId: '7' })).toBe(true);
    expect(mockNative.setWidgetSnapshot).toHaveBeenCalledTimes(2);
  });

  it('знімок слухає й зустрічі (next.meeting)', () => {
    expect(ANDROID_SNAPSHOT_KEYS).toEqual(expect.arrayContaining(['tasks', 'active_timers', 'meetings']));
  });
});

describe('useAndroidSurfaces', () => {
  function Probe() {
    useAndroidSurfaces();
    return null;
  }

  async function mount(): Promise<ReactTestRenderer> {
    let r!: ReactTestRenderer;
    await act(async () => { r = create(React.createElement(Probe)); });
    return r;
  }

  it('на старті: пише знімок, забирає чергу, підписується на подію', async () => {
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 'task:1')]));
    const r = await mount();
    expect(mockNative.setWidgetSnapshot).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockNative.addPendingActionsListener).toHaveBeenCalledTimes(1);
    expect(mockNative.removePendingActions).toHaveBeenCalledWith(['a']);
    await act(async () => { r.unmount(); });
  });

  it('подія модуля запускає повторне застосування', async () => {
    const r = await mount();
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('z', 'adhoc:1')]));
    const listener = mockNative.addPendingActionsListener.mock.calls[0][0];
    await act(async () => { listener(); });
    expect(mockApply).toHaveBeenCalledWith([expect.objectContaining({ id: 'z' })]);
    await act(async () => { r.unmount(); });
  });

  it('показує сповіщення найсвіжішого таймера, гасить, коли таймерів нема', async () => {
    mockTimerState = {
      activeTimers: [
        { id: 'task:1', taskId: '1', label: 'Звіт', startedAt: '2026-10-18T08:00:00.000Z' },
        { id: 'adhoc:2', label: 'Дзвінок', startedAt: '2026-10-18T09:00:00.000Z' },
      ],
      timersReady: true,
    };
    const r = await mount();
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(1);
    expect(mockNative.showTimerNotification.mock.calls[0][0]).toMatchObject({
      timerId: 'adhoc:2', label: 'Дзвінок', otherCount: 1, moreLabel: '+1 ще', stopLabel: 'Зупинити',
    });

    // Той самий стан — повторного виклику немає.
    mockTimerState = { ...mockTimerState, activeTimers: [...mockTimerState.activeTimers] };
    await act(async () => { r.update(React.createElement(Probe)); });
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(1);

    mockTimerState = { activeTimers: [], timersReady: true };
    await act(async () => { r.update(React.createElement(Probe)); });
    expect(mockNative.clearTimerNotification).toHaveBeenCalledTimes(1);
    await act(async () => { r.unmount(); });
  });

  it('не показує таймер, для якого Stop уже в черзі', async () => {
    // Черга не застосовується (retry), тож Stop лишається в ній.
    mockApply.mockResolvedValue([{ id: 'a', status: 'retry', reason: 'not_found' }]);
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 'task:1')]));
    mockTimerState = {
      activeTimers: [{ id: 'task:1', taskId: '1', label: 'Звіт', startedAt: '2026-10-18T08:00:00.000Z' }],
      timersReady: true,
    };
    const r = await mount();
    expect(mockNative.showTimerNotification).not.toHaveBeenCalled();
    expect(mockNative.clearTimerNotification).toHaveBeenCalledTimes(1);
    await act(async () => { r.unmount(); });
  });

  it('доки таймери не прочитані — сповіщення не чіпає', async () => {
    mockTimerState = { activeTimers: [], timersReady: false };
    const r = await mount();
    expect(mockNative.showTimerNotification).not.toHaveBeenCalled();
    expect(mockNative.clearTimerNotification).not.toHaveBeenCalled();
    await act(async () => { r.unmount(); });
  });

  it('вихід з акаунта: черга не застосовується, сповіщення гасне', async () => {
    mockAuthState = { status: 'guest', user: null };
    mockNative.readPendingActions.mockReturnValue(JSON.stringify([stopAction('a', 'task:1')]));
    mockTimerState = {
      activeTimers: [{ id: 'adhoc:1', label: 'x', startedAt: '2026-10-18T08:00:00.000Z' }],
      timersReady: true,
    };
    const r = await mount();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockNative.showTimerNotification).not.toHaveBeenCalled();
    expect(mockNative.clearTimerNotification).toHaveBeenCalledTimes(1);
    expect(mockCompute).toHaveBeenCalledWith({ authed: false, myUserId: undefined }, expect.any(Date));
    await act(async () => { r.unmount(); });
  });

  it('статус «loading» — нічого не робить', async () => {
    mockAuthState = { status: 'loading', user: null };
    const r = await mount();
    expect(mockNative.setWidgetSnapshot).not.toHaveBeenCalled();
    expect(mockNative.showTimerNotification).not.toHaveBeenCalled();
    expect(mockNative.clearTimerNotification).not.toHaveBeenCalled();
    await act(async () => { r.unmount(); });
  });

  it('власник черги: вхід — userId, вихід — null і порожня черга', async () => {
    const r = await mount();
    expect(mockNative.setDeviceActionOwner).toHaveBeenLastCalledWith('7');
    expect(mockNative.clearPendingActions).not.toHaveBeenCalled();
    mockAuthState = { status: 'guest', user: null };
    await act(async () => { r.update(React.createElement(Probe)); });
    expect(mockNative.setDeviceActionOwner).toHaveBeenLastCalledWith(null);
    expect(mockNative.clearPendingActions).toHaveBeenCalledTimes(1);
    await act(async () => { r.unmount(); });
  });

  it('немає дозволу на сповіщення — не кешує; після повернення в застосунок показує (A2)', async () => {
    mockTimerState = {
      activeTimers: [{ id: 'adhoc:1', label: 'x', startedAt: '2026-10-18T08:00:00.000Z' }],
      timersReady: true,
    };
    mockNative.showTimerNotification.mockReturnValueOnce(false);
    const r = await mount();
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(1);
    // Той самий стан, але показ не вдався — повтор на ре-рендері.
    mockTimerState = { ...mockTimerState, activeTimers: [...mockTimerState.activeTimers] };
    await act(async () => { r.update(React.createElement(Probe)); });
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(2);
    // Показано й закешовано; повернення в застосунок скидає кеш і показує знову.
    await act(async () => { for (const l of [...mockAppStateListeners]) l('active'); });
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(3);
    await act(async () => { r.unmount(); });
  });

  it('змахнуте сповіщення: кеш скинуто, наступна зміна показує знову', async () => {
    const timers = [{ id: 'adhoc:1', label: 'x', startedAt: '2026-10-18T08:00:00.000Z' }];
    mockTimerState = { activeTimers: timers, timersReady: true };
    const r = await mount();
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(1);
    const dismissed = mockNative.addTimerNotificationDismissedListener.mock.calls[0][0];
    await act(async () => { dismissed(); });
    mockTimerState = { activeTimers: [...timers], timersReady: true };
    await act(async () => { r.update(React.createElement(Probe)); });
    expect(mockNative.showTimerNotification).toHaveBeenCalledTimes(2);
    await act(async () => { r.unmount(); });
  });

  it('щойно застосований Stop не показується знову, доки таймери не перечитано (A6)', async () => {
    const timers = [{ id: 'task:1', taskId: '1', label: 'Звіт', startedAt: '2026-10-18T08:00:00.000Z' }];
    mockTimerState = { activeTimers: timers, timersReady: true };
    // Справжня черга: Stop лежить, доки його не прибере drain.
    let queue = JSON.stringify([stopAction('a', 'task:1')]);
    mockNative.readPendingActions.mockImplementation(() => queue);
    mockNative.removePendingActions.mockImplementation(() => { queue = '[]'; });
    const r = await mount();
    expect(mockNative.removePendingActions).toHaveBeenCalledWith(['a']);
    // Ре-рендер зі старим масивом (контекст ще не перечитав сховище): черга
    // порожня, але таймер щойно зупинено — не показуємо.
    await act(async () => { for (const l of [...mockAppStateListeners]) l('active'); });
    expect(mockNative.showTimerNotification).not.toHaveBeenCalled();
    // Контекст оновився (новий масив без таймера) — гасимо, памʼять скинуто.
    mockTimerState = { activeTimers: [], timersReady: true };
    await act(async () => { r.update(React.createElement(Probe)); });
    expect(mockNative.showTimerNotification).not.toHaveBeenCalled();
    await act(async () => { r.unmount(); });
  });
});
