/**
 * __tests__/server-reminders-migration.test.ts — локальні нагадування
 * поступаються серверним (docs/specs/notifications-module.md §10.3).
 *
 * Дедлайни/нагадування задач, зустрічі й день оплати шле сервер; ліки й
 * звички лишаються локальними (офлайн). Доводиться:
 *  - з рішенням «шле сервер» дублі не плануються, а вже заплановані
 *    скасовуються один раз;
 *  - те, чого сервер не індексує (підзавдання, «за N днів» підписки, ліки,
 *    звички), не зачіпається;
 *  - без рішення (гість, офлайн, старий сервер) усе як раніше.
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

import {
  LOCAL_REMINDERS_MIGRATED_KEY,
  SERVER_REMINDERS_KEY,
  isServerReplacedReminder,
  migrateLocalRemindersToServer,
  scheduleMeetingNotification,
  scheduleReminder,
  syncSubscriptionReminders,
} from '@/store/notifications';
import { normalizeSubscriptions } from '@/utils/subscriptions';

function setServerEvents(events: string[] | null) {
  mockStore.set(SERVER_REMINDERS_KEY, JSON.stringify(events ? { origin: 'o', userId: '1', events, appVersion: '1.2.0', at: 'x' } : null));
}

function seed(id: string, data: Record<string, unknown> = {}) {
  mockScheduled.set(id, { content: { title: id, body: '', data }, trigger: { type: 'date', value: 0 } });
}

const future = () => new Date(Date.now() + 3 * 24 * 3600 * 1000);

beforeEach(() => {
  mockStore.clear();
  mockScheduled.clear();
});

describe('isServerReplacedReminder', () => {
  const all = new Set(['task.reminder', 'meeting.reminder', 'subscription.due_today']);
  it('задача, зустріч і день оплати — так; підзавдання, «за N днів», ліки, звички — ні', () => {
    expect(isServerReplacedReminder({ identifier: 'reminder_t1', content: { data: { taskId: 't1', subtaskId: null } } }, all)).toBe(true);
    expect(isServerReplacedReminder({ identifier: 'reminder_t1_s1', content: { data: { taskId: 't1', subtaskId: 's1' } } }, all)).toBe(false);
    expect(isServerReplacedReminder({ identifier: 'meeting_m1' }, all)).toBe(true);
    expect(isServerReplacedReminder({ identifier: 'sub_s1_due', content: { data: { kind: 'due' } } }, all)).toBe(true);
    expect(isServerReplacedReminder({ identifier: 'sub_s1_before', content: { data: { kind: 'before' } } }, all)).toBe(false);
    expect(isServerReplacedReminder({ identifier: 'med_x_0' }, all)).toBe(false);
    expect(isServerReplacedReminder({ identifier: 'daily_habit_h1' }, all)).toBe(false);
  });

  it('подія, яку сервер НЕ оголосив, лишається локальною', () => {
    expect(isServerReplacedReminder({ identifier: 'meeting_m1' }, new Set(['task.reminder']))).toBe(false);
  });
});

describe('планування з рішенням «шле сервер»', () => {
  it('нагадування завдання не планується і знімає старе; підзавдання — планується', async () => {
    setServerEvents(['task.reminder']);
    seed('reminder_t1', { taskId: 't1', subtaskId: null });
    expect(await scheduleReminder({ type: 'task', taskId: 't1', title: 'A' }, future())).toBe(false);
    expect(mockScheduled.has('reminder_t1')).toBe(false);
    expect(await scheduleReminder({ type: 'subtask', taskId: 't1', subtaskId: 's1', title: 'B' }, future())).toBe(true);
    expect(mockScheduled.has('reminder_t1_s1')).toBe(true);
  });

  it('зустріч не планується', async () => {
    setServerEvents(['meeting.reminder']);
    const d = future();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(await scheduleMeetingNotification('m1', 'Демо', date, '10:00')).toBe(false);
    expect(mockScheduled.has('meeting_m1')).toBe(false);
  });

  it('без рішення все як раніше', async () => {
    expect(await scheduleReminder({ type: 'task', taskId: 't2', title: 'A' }, future())).toBe(true);
    expect(mockScheduled.has('reminder_t2')).toBe(true);
  });

  it('підписка: день оплати не планується (і знімається), «за N днів» лишається', async () => {
    setServerEvents(['subscription.due_today']);
    seed('sub_s1_due', { subscriptionId: 's1', kind: 'due' });
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5);
    const key = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    const subs = normalizeSubscriptions([{
      id: 's1', name: 'Music', amount: 5, currency: 'USD', period: { unit: 'month', every: 1 },
      nextPaymentDate: key, reminderDaysBefore: 1,
    }]);
    expect(subs).toHaveLength(1);
    await syncSubscriptionReminders(subs, {
      texts: {
        beforeTitle: 'b', beforeBody: 'b', dueTitle: 'd', dueBody: 'd',
        overdueTitle: 'o', overdueBody: 'o', endTitle: 'e', endBody: 'e',
      },
      formatAmount: () => '$5',
      formatDate: k => k,
    });
    const ids = [...mockScheduled.keys()];
    expect(ids.some(id => id.endsWith('_due'))).toBe(false);
    expect(ids.some(id => id.startsWith('sub_s1_before'))).toBe(true);
  });
});

describe('migrateLocalRemindersToServer — одноразове скасування', () => {
  it('знімає лише дублі серверних і запам’ятовує, що зроблено', async () => {
    seed('reminder_t1', { taskId: 't1', subtaskId: null });
    seed('reminder_t1_s1', { taskId: 't1', subtaskId: 's1' });
    seed('meeting_m1', { meetingId: 'm1' });
    seed('sub_s1_due', { kind: 'due' });
    seed('sub_s1_before', { kind: 'before' });
    seed('med_x_0', { medId: 'x' });
    seed('daily_habit_h1', { habitId: 'h1' });
    setServerEvents(['task.reminder', 'meeting.reminder', 'subscription.due_today']);

    await migrateLocalRemindersToServer();

    expect([...mockScheduled.keys()].sort()).toEqual(['daily_habit_h1', 'med_x_0', 'reminder_t1_s1', 'sub_s1_before']);
    expect(JSON.parse(mockStore.get(LOCAL_REMINDERS_MIGRATED_KEY)!).events)
      .toEqual(['task.reminder', 'meeting.reminder', 'subscription.due_today']);

    // Повторний прохід нічого не робить: подія вже перенесена.
    seed('meeting_m2', { meetingId: 'm2' });
    await migrateLocalRemindersToServer();
    expect(mockScheduled.has('meeting_m2')).toBe(true);
  });

  it('рішення знято (вихід) — позначку знято, наступний перехід знову прибере дублі', async () => {
    setServerEvents(['meeting.reminder']);
    await migrateLocalRemindersToServer();
    setServerEvents(null);
    await migrateLocalRemindersToServer();
    expect(JSON.parse(mockStore.get(LOCAL_REMINDERS_MIGRATED_KEY)!)).toBeNull();
    seed('meeting_m3', {});
    setServerEvents(['meeting.reminder']);
    await migrateLocalRemindersToServer();
    expect(mockScheduled.has('meeting_m3')).toBe(false);
  });
});
