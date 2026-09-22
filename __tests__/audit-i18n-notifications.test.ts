/**
 * __tests__/audit-i18n-notifications.test.ts — зона «мови і нотифікації».
 *
 * Тут доводяться правки, що не потребують пристрою:
 *  - I18N-05: заголовки локальних нагадувань і ім'я Android-каналу більше не
 *    зашиті українською (нативний звіт: «на реальному пристрої з дозволом
 *    заголовок буде саме '📋 Завдання'» — незалежно від мови інтерфейсу);
 *  - DI-05: нагадування ліків і звичок переживають синхронізацію — джерелом
 *    правди стає список запланованого в ОС проти сховища, а не поле `notifIds`
 *    у записі (воно локальне для пристрою і з чужого не приїжджає);
 *  - ERR-03: 429 від throttle має власний текст, а не «Невірний email
 *    або пароль».
 *
 * Кожен блок падав би ДО правки: перший — на літералах у store/notifications.ts,
 * другий — бо переплановування не існувало взагалі, третій — бо гілки 429
 * не було в жодному з чотирьох екранів.
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

import * as Notifications from 'expo-notifications';

import {
  habitReminderId,
  healthReminderPlan,
  medReminderId,
  rescheduleHealthRemindersFromStorage,
  scheduleMeetingNotification,
  scheduleReminder,
} from '@/store/notifications';
import { throttleMessage, throttleRetrySeconds } from '@/store/auth-throttle';
import { allTranslations } from '@/store/translations';

const CYR = /[Ѐ-ӿ]/;
const LANG_KEY = 'lang_option_v1';

function setLang(lang: 'uk' | 'en') {
  mockStore.set(LANG_KEY, JSON.stringify(lang));
}

beforeEach(() => {
  mockStore.clear();
  mockScheduled.clear();
  jest.clearAllMocks();
});

// ─── I18N-05 ─────────────────────────────────────────────────────────────────

describe('I18N-05: локальні нагадування йдуть мовою інтерфейсу', () => {
  const soon = () => new Date(Date.now() + 60 * 60 * 1000);

  it('нагадування про завдання англійською, коли мова en', async () => {
    setLang('en');
    await scheduleReminder({ type: 'task', taskId: 't1', title: 'Pay rent' }, soon());
    const req = mockScheduled.get('reminder_t1');
    expect(req.content.title).toBe(allTranslations.en.notifTaskTitle);
    expect(CYR.test(req.content.title)).toBe(false);
  });

  it('підзавдання — теж (окремий ключ, не той самий рядок)', async () => {
    setLang('en');
    await scheduleReminder({ type: 'subtask', taskId: 't1', subtaskId: 's1', title: 'Sub' }, soon());
    expect(mockScheduled.get('reminder_t1_s1').content.title).toBe(allTranslations.en.notifSubtaskTitle);
  });

  it('нагадування про зустріч англійською', async () => {
    setLang('en');
    const at = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
    const timeStr = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    await scheduleMeetingNotification('m1', 'Standup', dateStr, timeStr);
    const req = mockScheduled.get('meeting_m1');
    expect(req.content.title).toBe(allTranslations.en.notifMeetingTitle);
    expect(CYR.test(req.content.title)).toBe(false);
  });

  it('українська лишається за замовчуванням і без збереженої мови', async () => {
    await scheduleReminder({ type: 'task', taskId: 't2', title: 'Оплатити' }, soon());
    expect(mockScheduled.get('reminder_t2').content.title).toBe(allTranslations.uk.notifTaskTitle);
  });

  it('у store/notifications.ts не лишилось кириличних літералів UI', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs'), path = require('path');
    const src: string = fs.readFileSync(path.join(__dirname, '..', 'store', 'notifications.ts'), 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')       // блокові коментарі
      .replace(/^[ \t]*\/\/.*$/gm, '');       // рядкові коментарі
    const literals = code.match(/(['"`])(?:(?!\1)[^\\]|\\.)*\1/g) ?? [];
    expect(literals.filter(l => CYR.test(l))).toEqual([]);
  });
});

// ─── DI-05 ───────────────────────────────────────────────────────────────────

describe('DI-05: нагадування ліків і звичок переживають синхронізацію', () => {
  const tr = { takeNow: allTranslations.uk.takeNow, habits: allTranslations.uk.habits };

  it('план будується з даних, а не з поля notifIds запису', () => {
    const plan = healthReminderPlan(
      [{ id: 'm1', name: 'Вітамін D', times: ['08:00', '20:00'], active: true }],
      [{ id: 'h1', title: 'Зарядка', reminderAt: '07:30' }],
      tr,
    );
    expect(plan.map(p => p.id)).toEqual([
      medReminderId('m1', 0), medReminderId('m1', 1), habitReminderId('h1'),
    ]);
    expect(plan[0]).toMatchObject({ hour: 8, minute: 0 });
    expect(plan[2]).toMatchObject({ hour: 7, minute: 30 });
  });

  it('id звички має префікс daily_ — саме такий планувальник ставить в ОС', () => {
    // Нативний звіт: екран пише в запис `habit_<id>`, а cancelDailyReminder()
    // і scheduleDailyReminder() працюють з `daily_habit_<id>`. Поле запису
    // більше нічого не вирішує — id рахується тут.
    expect(habitReminderId('h1')).toBe('daily_habit_h1');
  });

  it('неактивні ліки й звички без часу в план не потрапляють', () => {
    const plan = healthReminderPlan(
      [{ id: 'm1', name: 'Стара', times: ['08:00'], active: false }],
      [{ id: 'h1', title: 'Без нагадування' }, { id: 'h2', title: 'Сміття', reminderAt: '99:99' }],
      tr,
    );
    expect(plan).toEqual([]);
  });

  it('запис, що приїхав синком, ДІСТАЄ нотифікацію в ОС', async () => {
    // Саме це і є дефект: на цьому пристрої ніхто нічого не планував, бо
    // планування живе в екрані створення, а запис прийшов повз нього.
    mockStore.set('health_meds', JSON.stringify([
      { id: 'm1', name: 'Вітамін D', times: ['08:00'], active: true, notifIds: ['med_m1_0'] },
    ]));
    mockStore.set('health_habits', JSON.stringify([{ id: 'h1', title: 'Зарядка', reminderAt: '07:30' }]));

    expect(mockScheduled.size).toBe(0);
    await rescheduleHealthRemindersFromStorage(tr);

    expect([...mockScheduled.keys()].sort()).toEqual(['daily_habit_h1', 'med_m1_0']);
    expect(mockScheduled.get('med_m1_0').trigger).toMatchObject({ hour: 8, minute: 0 });
  });

  it('видалений на іншому пристрої запис не лишає нагадування назавжди', async () => {
    mockScheduled.set('med_gone_0', { identifier: 'med_gone_0' });
    mockScheduled.set('daily_habit_gone', { identifier: 'daily_habit_gone' });
    mockStore.set('health_meds', JSON.stringify([]));
    mockStore.set('health_habits', JSON.stringify([]));

    await rescheduleHealthRemindersFromStorage(tr);
    expect(mockScheduled.size).toBe(0);
  });

  it('повторний виклик нічого не дублює — id детерміновані', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'm1', name: 'D', times: ['08:00'], active: true }]));
    mockStore.set('health_habits', JSON.stringify([]));

    await rescheduleHealthRemindersFromStorage(tr);
    await rescheduleHealthRemindersFromStorage(tr);
    expect(mockScheduled.size).toBe(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('чужі нагадування (підписки, задачі) не чіпає', async () => {
    mockScheduled.set('sub_x_due', { identifier: 'sub_x_due' });
    mockScheduled.set('reminder_t1', { identifier: 'reminder_t1' });
    mockStore.set('health_meds', JSON.stringify([]));
    mockStore.set('health_habits', JSON.stringify([]));

    await rescheduleHealthRemindersFromStorage(tr);
    expect([...mockScheduled.keys()].sort()).toEqual(['reminder_t1', 'sub_x_due']);
  });

  it('глобальний тумблер вимкнено — знімає свої й нічого не планує', async () => {
    mockScheduled.set('med_m1_0', { identifier: 'med_m1_0' });
    mockStore.set('notificationsEnabled', JSON.stringify(false));
    mockStore.set('health_meds', JSON.stringify([{ id: 'm1', name: 'D', times: ['08:00'], active: true }]));

    await rescheduleHealthRemindersFromStorage(tr);
    expect(mockScheduled.size).toBe(0);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

// ─── ERR-03 ──────────────────────────────────────────────────────────────────

describe('ERR-03: 429 від throttle має власний текст', () => {
  const tr = allTranslations.uk;

  it('дістає секунди з тіла DRF', () => {
    expect(throttleRetrySeconds({
      status: 429,
      details: { detail: 'Request was throttled. Expected available in 59 seconds.' },
      message: 'Request was throttled. Expected available in 59 seconds.',
    })).toBe(59);
  });

  it('розуміє числовий retry_after', () => {
    expect(throttleRetrySeconds({ status: 429, details: { retry_after: 120 } })).toBe(120);
  });

  it('без часу — загальний текст, не «невірний пароль»', () => {
    const msg = throttleMessage(tr, { status: 429, message: 'HTTP 429' });
    expect(msg).toBe(tr.authTooManyAttempts);
    expect(msg).not.toBe(tr.authInvalidCreds);
  });

  it('округлює вгору і ніколи не каже «за 0 хв»', () => {
    expect(throttleMessage(tr, { status: 429, details: { retry_after: 1 } })).toBe(
      tr.authTooManyAttemptsIn.replace('{n}', '1'));
    expect(throttleMessage(tr, { status: 429, details: { retry_after: 61 } })).toBe(
      tr.authTooManyAttemptsIn.replace('{n}', '2'));
  });

  it('англійський варіант існує і не містить кирилиці', () => {
    const en = allTranslations.en;
    expect(CYR.test(en.authTooManyAttemptsIn)).toBe(false);
    expect(en.authTooManyAttemptsIn).toContain('{n}');
  });
});
