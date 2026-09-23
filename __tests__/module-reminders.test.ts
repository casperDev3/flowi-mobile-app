/**
 * __tests__/module-reminders.test.ts
 *
 * Вимкнений модуль не лише зникає з меню й дашборда — він перестає БУДИТИ
 * телефон. Тут доводиться саме це:
 *
 *  - нагадування вимкненого модуля не планується взагалі;
 *  - вже заплановане скасовується, щойно модуль вимкнули;
 *  - сусідні модулі при цьому не страждають — ні планування, ні скасування;
 *  - увімкнули назад — те, що можна відбудувати зі сховища, повертається.
 *
 * Кожен блок падав би ДО правки: гейта за модулем не існувало взагалі, і
 * вимкнені «Фінанси» далі надсилали нагадування про оплату підписки.
 *
 * Сховище й expo-notifications — заглушки (той самий набір, що й в
 * `audit-i18n-notifications.test.ts`): перевіряються правила, а не нативні
 * модулі.
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
  reminderAllowed,
  reminderModulesFor,
  rescheduleHealthRemindersFromStorage,
  scheduleDateReminder,
  scheduleMedReminders,
  scheduleMeetingNotification,
  scheduleReminder,
  syncRemindersWithModules,
} from '@/store/notifications';
import { UI_PREFERENCES_KEY } from '@/store/ui-preferences';

/** Записати список вимкнених модулів так, як його бачить сховище. */
function setDisabledModules(disabled: string[]) {
  mockStore.set(UI_PREFERENCES_KEY, JSON.stringify({ version: 1, disabledModules: disabled }));
}

const HEALTH_TR = { takeNow: 'Прийняти', habits: 'Звички' };

beforeEach(() => {
  mockStore.clear();
  mockScheduled.clear();
  setDisabledModules([]);
});

describe('reminderModulesFor', () => {
  it('знає, кому належить кожен префікс', () => {
    expect(reminderModulesFor('reminder_t1')).toEqual(['tasks']);
    expect(reminderModulesFor('meeting_m1')).toEqual(['meetings']);
    expect(reminderModulesFor('sub_s1_before')).toEqual(['subscriptions']);
    expect(reminderModulesFor('med_m1_0')).toEqual(['health', 'prevention']);
    expect(reminderModulesFor('checkup_c1')).toEqual(['health', 'prevention']);
    expect(reminderModulesFor('vaccine_v1')).toEqual(['health', 'prevention']);
  });

  it('звички читаються як профілактика, а не як загальне здоров\'я', () => {
    // 'daily_habit_' мусить збігтися РАНІШЕ за 'daily_', інакше звички
    // переживали б вимкнення «Профілактики».
    expect(reminderModulesFor('daily_habit_h1')).toEqual(['health', 'prevention']);
    expect(reminderModulesFor('daily_water')).toEqual(['health']);
  });

  it('чуже нагадування не чіпаємо', () => {
    // Порожній список — «нічого не вимагає»: мовчки скасувати нагадування,
    // яке запланував хтось інший, гірше, ніж показати зайве.
    expect(reminderModulesFor('xyz_42')).toEqual([]);
    expect(reminderAllowed('xyz_42', ['tasks', 'health'])).toBe(true);
  });

  it('вимагає ВСІ свої модулі', () => {
    expect(reminderAllowed('med_m1_0', [])).toBe(true);
    expect(reminderAllowed('med_m1_0', ['health'])).toBe(false);
    expect(reminderAllowed('med_m1_0', ['prevention'])).toBe(false);
  });
});

describe('планування з вимкненим модулем', () => {
  const soon = () => new Date(Date.now() + 60 * 60 * 1000);

  it('задача вимкненого модуля не планується', async () => {
    setDisabledModules(['tasks']);
    const ok = await scheduleReminder({ type: 'task', taskId: 't1', title: 'Зробити' }, soon());
    expect(ok).toBe(false);
    expect(mockScheduled.size).toBe(0);
  });

  it('сусідній модуль не страждає', async () => {
    setDisabledModules(['tasks']);
    const ok = await scheduleMeetingNotification('m1', 'Планерка', '2999-01-01', '10:00');
    expect(ok).toBe(true);
    expect([...mockScheduled.keys()]).toEqual(['meeting_m1']);
  });

  it('ліки й огляди тримаються за «Профілактику»', async () => {
    setDisabledModules(['prevention']);
    expect(await scheduleMedReminders('m1', ['08:00'], '💊', 'Прийняти')).toEqual([]);
    expect(await scheduleDateReminder('checkup_c1', soon(), '🩺', 'Огляд')).toBeNull();
    expect(mockScheduled.size).toBe(0);
  });

  it('увімкнений модуль планується як і раніше', async () => {
    expect(await scheduleMedReminders('m1', ['08:00', '20:00'], '💊', 'Прийняти'))
      .toEqual(['med_m1_0', 'med_m1_1']);
  });
});

describe('syncRemindersWithModules', () => {
  it('скасовує заплановане вимкненого модуля і лишає решту', async () => {
    mockScheduled.set('reminder_t1', {});
    mockScheduled.set('meeting_m1', {});
    mockScheduled.set('med_m1_0', {});
    mockScheduled.set('чуже_нагадування', {});

    setDisabledModules(['tasks', 'prevention']);
    await syncRemindersWithModules();

    expect([...mockScheduled.keys()].sort()).toEqual(['meeting_m1', 'чуже_нагадування']);
  });

  it('нічого не вимкнено — нічого не скасовує', async () => {
    // Навмисно без 'sub_…' і 'med_…': ці два префікси має власний
    // переплановувач, і він звіряє ОС зі сховищем (порожнім у цьому тесті),
    // тобто прибрав би їх як сирітські — за сиротами, а не за модулем.
    mockScheduled.set('reminder_t1', {});
    mockScheduled.set('meeting_m1', {});
    await syncRemindersWithModules();
    expect([...mockScheduled.keys()].sort()).toEqual(['meeting_m1', 'reminder_t1']);
  });

  it('увімкнули назад — нагадування здоров\'я повертаються зі сховища', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'm1', name: 'Вітамін D', times: ['09:00'] }]));
    mockStore.set('health_habits', JSON.stringify([{ id: 'h1', title: 'Зарядка', reminderAt: '07:30' }]));

    setDisabledModules(['health']);
    await syncRemindersWithModules();
    expect(mockScheduled.size).toBe(0);

    setDisabledModules([]);
    await syncRemindersWithModules();
    expect([...mockScheduled.keys()].sort()).toEqual(['daily_habit_h1', 'med_m1_0']);
  });
});

describe('rescheduleHealthRemindersFromStorage', () => {
  it('вимкнений модуль прибирає заплановане й не планує нове', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'm1', name: 'Вітамін D', times: ['09:00'] }]));
    mockStore.set('health_habits', JSON.stringify([]));
    mockScheduled.set('med_m1_0', {});

    setDisabledModules(['prevention']);
    await rescheduleHealthRemindersFromStorage(HEALTH_TR);

    expect(mockScheduled.size).toBe(0);
  });

  it('увімкнений — планує з детермінованим id', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'm1', name: 'Вітамін D', times: ['09:00'] }]));
    mockStore.set('health_habits', JSON.stringify([]));
    await rescheduleHealthRemindersFromStorage(HEALTH_TR);
    expect([...mockScheduled.keys()]).toEqual(['med_m1_0']);
  });
});
