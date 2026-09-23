/**
 * __tests__/wave-tails.test.ts — зведення хвостів після паралельних агентів:
 *
 *  - «серія під загрозою» тренувань планується з `training_sessions` (§9);
 *  - `?open=` нарад знаходить екземпляр повторюваної наради;
 *  - живі статуси звернень із синку (`feedback_status`) накладаються на кеш;
 *  - сокет групи тренувань розбирає лише свої типи повідомлень.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));

const mockScheduled = new Map<string, any>();
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  scheduleNotificationAsync: jest.fn(async (req: any) => { mockScheduled.set(req.identifier, req); return req.identifier; }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => { mockScheduled.delete(id); }),
  getAllScheduledNotificationsAsync: jest.fn(async () =>
    [...mockScheduled.entries()].map(([identifier, request]) => ({ identifier, ...request }))),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('@/store/push', () => ({
  ensurePushTokenRegistered: jest.fn(async () => {}),
  isForCurrentWorkspace: () => true,
}));

import { mergeStatuses, statusesFromSyncRows } from '@/api/feedback';
import {
  TRAINING_STREAK_HOUR,
  reminderModulesFor,
  rescheduleTrainingRemindersFromStorage,
  trainingReminderPlan,
  trainingStreakReminderId,
} from '@/store/notifications';
import { parseTrainingSocketMessage } from '@/store/training-socket';
import { allTranslations } from '@/store/translations';
import { UI_PREFERENCES_KEY } from '@/store/ui-preferences';
import { pickMeetingInstanceToOpen } from '@/utils/meetings';

const tr = allTranslations.uk;
const NOW = new Date(2026, 8, 23, 10, 0); // 23.09.2026, 10:00

const session = (id: string, date: string, status = 'planned', title = 'Ноги') =>
  ({ id, groupId: 'g1', date, status, title, plannedExercises: [] });

describe('«серія під загрозою» тренувань', () => {
  test('лише заплановані сесії, о 21:00 дня сесії, не в минулому', () => {
    const plan = trainingReminderPlan([
      session('s-today', '2026-09-23'),
      session('s-done', '2026-09-24', 'completed'),
      session('s-past', '2026-09-22'),
      session('s-next', '2026-09-25'),
      { junk: true },
    ], NOW, tr);
    expect(plan.map(p => p.id)).toEqual([trainingStreakReminderId('s-today'), trainingStreakReminderId('s-next')]);
    expect(plan[0].date).toEqual(new Date(2026, 8, 23, TRAINING_STREAK_HOUR, 0));
    expect(plan[0].body).toContain('Ноги');
    expect(plan[0].data.url).toBe('ftrackingapp://training/session/s-today');
  });

  test('сьогоднішня сесія після 21:00 уже не планується; далі за 2 тижні — теж', () => {
    const late = new Date(2026, 8, 23, 21, 30);
    expect(trainingReminderPlan([session('a', '2026-09-23')], late, tr)).toEqual([]);
    expect(trainingReminderPlan([session('b', '2026-10-20')], NOW, tr)).toEqual([]);
  });

  test('належить модулю «Групи тренувань»', () => {
    expect(reminderModulesFor(trainingStreakReminderId('x'))).toEqual(['training']);
  });

  test('звірка зі сховищем: виконана сесія знімає нагадування, вимкнений модуль — усі', async () => {
    mockStore.clear();
    mockScheduled.clear();
    mockStore.set('training_sessions', JSON.stringify([session('s1', '2026-09-24'), session('s2', '2026-09-25')]));
    await rescheduleTrainingRemindersFromStorage(tr, { now: NOW });
    expect([...mockScheduled.keys()].sort()).toEqual(['training_streak_s1', 'training_streak_s2']);

    mockStore.set('training_sessions', JSON.stringify([session('s1', '2026-09-24', 'completed'), session('s2', '2026-09-25')]));
    await rescheduleTrainingRemindersFromStorage(tr, { now: NOW });
    expect([...mockScheduled.keys()]).toEqual(['training_streak_s2']);

    mockStore.set(UI_PREFERENCES_KEY, JSON.stringify({ version: 1, disabledModules: ['training'], updatedAt: NOW.toISOString() }));
    await rescheduleTrainingRemindersFromStorage(tr, { now: NOW });
    expect([...mockScheduled.keys()]).toEqual([]);
  });
});

describe('?open= нарад', () => {
  const expanded = [
    { id: 'm1', date: '2026-09-10' },
    { id: 'r1_2026-09-16', _origId: 'r1', date: '2026-09-16' },
    { id: 'r1_2026-09-23', _origId: 'r1', date: '2026-09-23' },
    { id: 'r1_2026-09-30', _origId: 'r1', date: '2026-09-30' },
    { id: 'r2_2026-09-01', _origId: 'r2', date: '2026-09-01' },
    { id: 'r2_2026-09-08', _origId: 'r2', date: '2026-09-08' },
  ];
  test('точний id — він і є', () => {
    expect(pickMeetingInstanceToOpen(expanded, 'm1', '2026-09-23')?.id).toBe('m1');
  });
  test('id повторюваної — найближчий екземпляр від сьогодні', () => {
    expect(pickMeetingInstanceToOpen(expanded, 'r1', '2026-09-23')?.id).toBe('r1_2026-09-23');
  });
  test('усі в минулому — останній', () => {
    expect(pickMeetingInstanceToOpen(expanded, 'r2', '2026-09-23')?.id).toBe('r2_2026-09-08');
  });
  test('невідомий id — нічого', () => {
    expect(pickMeetingInstanceToOpen(expanded, 'nope', '2026-09-23')).toBeNull();
  });
});

describe('статуси звернень із синку', () => {
  const rows = [
    { id: 'idea:i1', report_uid: 'R1', status: 'in_progress', comment: 'Беремо', duplicate_of: null, task_linked: true, updated_at: '2026-09-23T10:00:00Z', delivery_state: 'delivered' },
    { id: 'bogus', status: 'done' },
    null,
  ];
  test('рядки синку → той самий вигляд, що й кеш', () => {
    expect(statusesFromSyncRows(rows)).toEqual({
      'idea:i1': {
        reportUid: 'R1', deliveryState: 'delivered', status: 'in_progress', comment: 'Беремо',
        duplicateOf: null, taskLinked: true, updatedAt: '2026-09-23T10:00:00Z',
      },
    });
    expect(statusesFromSyncRows('not-an-array')).toEqual({});
  });
  test('пізніший час перемагає; старіший синк не затирає свіжий кеш', () => {
    const cached = {
      'idea:i1': { reportUid: 'R1', deliveryState: 'delivered', status: 'done', comment: '', duplicateOf: null, taskLinked: false, updatedAt: '2026-09-24T00:00:00Z' },
    };
    expect(mergeStatuses(cached, statusesFromSyncRows(rows))['idea:i1'].status).toBe('done');
    const older = { 'idea:i1': { ...cached['idea:i1'], updatedAt: '2026-09-01T00:00:00Z' } };
    expect(mergeStatuses(older, statusesFromSyncRows(rows))['idea:i1'].status).toBe('in_progress');
  });
});

describe('сокет групи тренувань', () => {
  test('сигнали синку й «групи більше немає»', () => {
    expect(parseTrainingSocketMessage('g', JSON.stringify({ type: 'sync_changed', cursor: 3 }))).toEqual({ type: 'sync_changed', groupId: 'g' });
    expect(parseTrainingSocketMessage('g', JSON.stringify({ type: 'xp_changed' }))?.type).toBe('xp_changed');
    expect(parseTrainingSocketMessage('g', JSON.stringify({ type: 'access_revoked' }))).toEqual({ type: 'gone', groupId: 'g', reason: 'access_revoked' });
    expect(parseTrainingSocketMessage('g', JSON.stringify({ type: 'group_deleted' }))?.type).toBe('gone');
  });
  test('чуже й сміття — нічого', () => {
    expect(parseTrainingSocketMessage('g', JSON.stringify({ type: 'projects_changed' }))).toBeNull();
    expect(parseTrainingSocketMessage('g', 'not json')).toBeNull();
    expect(parseTrainingSocketMessage('g', { type: 'sync_changed' })).toBeNull();
  });
});

describe('міграція груп категорій (finance-revamp.md §4.5.2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { withCategoryGroupCost } = require('@/store/migrations') as typeof import('@/store/migrations');
  test('пише лише відсутні поля; id і наявні значення не чіпає', () => {
    const rows = [
      { id: 'expense:Оренда', type: 'expense', name: 'Оренда', icon: 'house' },
      { id: 'expense:Кава', type: 'expense', name: 'Кава', icon: 'cup', group: 'food', cost: 'fixed' },
      { id: 'income:Зарплата', type: 'income', name: 'Зарплата', icon: 'briefcase' },
      { id: 'expense:Netflix', type: 'expense', name: 'Netflix', icon: 'tv' },
    ];
    const next = withCategoryGroupCost(rows, [{ category: 'Netflix' }]);
    expect(next.map(r => r.id)).toEqual(rows.map(r => r.id));
    expect(next[1]).toBe(rows[1]);
    expect(next[0]).toMatchObject({ group: expect.any(String), cost: expect.stringMatching(/fixed|variable/) });
    expect(next[2]).toMatchObject({ group: expect.any(String) });
    expect((next[2] as { cost?: string }).cost).toBeUndefined();
    expect((next[3] as { cost?: string }).cost).toBe('fixed');
  });
  test('нічого змінювати — той самий масив', () => {
    const rows = [{ id: 'expense:Кава', type: 'expense', name: 'Кава', group: 'food', cost: 'variable' }];
    expect(withCategoryGroupCost(rows)).toBe(rows);
  });
});
