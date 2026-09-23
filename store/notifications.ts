import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { BUILTIN_CURRENCIES, type Currency } from '@/utils/financeUtils';
import {
  SUBSCRIPTION_NOTIFICATION_PREFIX,
  formatDateKey,
  formatSubscriptionMoney,
  limitSubscriptionReminders,
  normalizeSubscriptions,
  subscriptionReminderBudget,
  subscriptionReminderPlan,
  type Subscription,
} from '@/utils/subscriptions';

import type { ModuleId } from '@/constants/nav';
import { modulesForEvent } from '@/utils/pushLink';

import { loadData, saveData, subscribeToStorage } from './storage';
import { allTranslations, type Lang, type Translations } from './translations';
import { ensurePushTokenRegistered, isForCurrentWorkspace, type PushPayloadData } from './push';
import { UI_PREFERENCES_KEY, isModuleEnabled, loadDisabledModules } from './ui-preferences';

const SUPPRESSED = {
  shouldShowAlert: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
} as const;

Notifications.setNotificationHandler({
  handleNotification: async notification => {
    // Контракт §7: push для ІНШОГО workspace, ніж активний зараз, ігноруємо —
    // токен на сервері старого workspace знімається лише при виході/зміні
    // workspace (§2.3/§2.8), тож пуш звідти теоретично ще може долетіти.
    const data = (notification.request.content.data ?? {}) as PushPayloadData;
    if (!isForCurrentWorkspace(data)) return SUPPRESSED;
    // Подія вимкненого модуля (ui_preferences) не показується поверх
    // відкритого застосунку — так само, як її немає і в центрі сповіщень.
    if (typeof data.event_type === 'string' && data.event_type) {
      try {
        const disabled = await loadDisabledModules();
        if (!modulesForEvent(data.event_type).every(module => isModuleEnabled(disabled, module))) return SUPPRESSED;
      } catch {
        // Налаштування не прочитались — показуємо: зайве краще за втрачене.
      }
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * I18N-05: цей модуль живе поза React і не має доступу до `useI18n()`, тож
 * мову локальних нагадувань читає з того самого ключа, у який її пише
 * `I18nProvider` (`store/i18n.tsx` — `lang_option_v1`). Читаємо на кожному
 * плануванні, а не кешуємо: нагадування планують рідко, а кеш пережив би
 * перемикання мови і заголовок лишився б старою мовою до перезапуску.
 */
const LANG_STORAGE_KEY = 'lang_option_v1';

export async function notificationTr(): Promise<Translations> {
  const saved = await loadData<Lang>(LANG_STORAGE_KEY, 'uk');
  return allTranslations[saved === 'en' ? 'en' : 'uk'];
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Device.isDevice) {
    // Simulator — pretend granted so UI works during dev
    return true;
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return false;
  if (Platform.OS === 'android') {
    // Ім'я каналу видно в системних налаштуваннях телефону; Android дозволяє
    // оновити його для вже створеного каналу, тож зміна мови доходить і сюди.
    const trCh = await notificationTr();
    await Notifications.setNotificationChannelAsync('flowi-reminders', {
      name: trCh.notifChannelReminders,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
    });
  }
  // Контракт §2.8: дозвіл міг щойно з'явитись не при вході, а тут-таки —
  // наприклад, користувач вмикає нагадування в Налаштуваннях. Без цього
  // токен реєструвався б лише на наступному холодному старті/вході.
  void ensurePushTokenRegistered();
  return true;
}

export interface ReminderMeta {
  type: 'task' | 'subtask';
  taskId: string;
  subtaskId?: string;
  title: string;
}

// Notification identifier is always `reminder_<taskId>` or `reminder_<taskId>_<subtaskId>`
export function reminderId(taskId: string, subtaskId?: string): string {
  return subtaskId ? `reminder_${taskId}_${subtaskId}` : `reminder_${taskId}`;
}

/** Returns false when the global notifications toggle is disabled. */
async function isNotificationsEnabled(): Promise<boolean> {
  return loadData<boolean>('notificationsEnabled', true);
}

// ─── Серверні нагадування замість локальних (notifications-module.md §10.3) ──
//
// Дедлайни/нагадування задач, зустрічі й день оплати підписки тепер шле
// сервер. Щоб не було подвійних сповіщень, відповідні локальні нагадування
// більше не плануються, а вже заплановані скасовуються один раз при переході.
// Рішення «які саме» ухвалює `store/push.ts` після реєстрації пристрою (сервер
// оголосив подію в `server_reminders`, збірка не нижча за поріг сервера,
// пристрій справді зареєстрований для push) і кладе у сховище; тут його лише
// читають. Нема рішення (офлайн-режим, гість, старий сервер, немає дозволу
// на push) — усе планується локально, як раніше.
//
// Ліки й звички лишаються локальними назавжди — це вимога роботи офлайн.

/** Той самий літерал, що `SERVER_REMINDERS_KEY` в `api/notifications.ts` (імпорт звідти тягнув би HTTP-клієнт). */
export const SERVER_REMINDERS_KEY = 'notifications_server_reminders_v1';
/** Які події вже прибрано з локального розкладу — щоб скасування йшло один раз на подію. */
export const LOCAL_REMINDERS_MIGRATED_KEY = 'local_reminders_migrated_v1';

export type ServerReminderEvent = 'task.reminder' | 'meeting.reminder' | 'subscription.due_today';

/** Події, які зараз шле сервер. Помилка читання — «жодних»: краще дубль, ніж тиша. */
export async function loadServerHandledReminders(): Promise<Set<string>> {
  try {
    const record = await loadData<{ events?: unknown } | null>(SERVER_REMINDERS_KEY, null);
    const events = Array.isArray(record?.events) ? record.events : [];
    return new Set(events.filter((e): e is string => typeof e === 'string'));
  } catch {
    return new Set();
  }
}

interface ScheduledLike {
  identifier?: unknown;
  content?: { data?: Record<string, unknown> | null } | null;
}

/**
 * Чи є заплановане локальне нагадування дублем серверного. Чиста функція від
 * ідентифікатора і `data`, щоб її можна було перевірити без ОС.
 *
 * - `reminder_<taskId>` — нагадування ЗАВДАННЯ; нагадування ПІДЗАВДАННЯ
 *   (`data.subtaskId`) сервер не індексує, тож воно лишається локальним;
 * - `meeting_<id>` — нагадування про зустріч;
 * - `sub_<id>_due` — лише день оплати: «за N днів», «прострочено» і «кінець»
 *   у першій фазі лишаються локальними (§5.2).
 */
export function isServerReplacedReminder(item: ScheduledLike, events: ReadonlySet<string>): boolean {
  const id = typeof item.identifier === 'string' ? item.identifier : '';
  if (!id) return false;
  const data = item.content?.data ?? {};
  if (events.has('task.reminder') && id.startsWith('reminder_')) {
    return !data.subtaskId;
  }
  if (events.has('meeting.reminder') && id.startsWith('meeting_')) return true;
  if (events.has('subscription.due_today') && id.startsWith(SUBSCRIPTION_NOTIFICATION_PREFIX)) {
    return data.kind === 'due' || /_due$/.test(id);
  }
  return false;
}

let serverMigrationQueue: Promise<void> = Promise.resolve();

/**
 * Одноразовий перехід: скасувати вже заплановані локальні дублі серверних
 * нагадувань. `local_reminders_migrated_v1` пам'ятає, для яких подій це вже
 * зроблено; коли рішення знято (вихід з акаунта), позначку теж знято —
 * наступний перехід знову прибере дублі.
 */
export function migrateLocalRemindersToServer(): Promise<void> {
  const run = async () => {
    const events = await loadServerHandledReminders();
    const done = await loadData<{ events?: string[] } | null>(LOCAL_REMINDERS_MIGRATED_KEY, null);
    const doneEvents = new Set(Array.isArray(done?.events) ? done.events : []);
    if (!events.size) {
      if (done) await saveData(LOCAL_REMINDERS_MIGRATED_KEY, null);
      return;
    }
    const pending = new Set([...events].filter(e => !doneEvents.has(e)));
    if (!pending.size) return;
    let scheduled: ScheduledLike[] = [];
    try {
      scheduled = await Notifications.getAllScheduledNotificationsAsync() as unknown as ScheduledLike[];
    } catch {
      return;
    }
    const stale = scheduled.filter(item => isServerReplacedReminder(item, pending));
    await Promise.all(stale.map(item =>
      Notifications.cancelScheduledNotificationAsync(item.identifier as string).catch(() => {})));
    await saveData(LOCAL_REMINDERS_MIGRATED_KEY, {
      events: [...events],
      at: new Date().toISOString(),
    });
  };
  serverMigrationQueue = serverMigrationQueue.then(run, run);
  return serverMigrationQueue;
}

export async function scheduleReminder(
  meta: ReminderMeta,
  date: Date,
): Promise<boolean> {
  if (date <= new Date()) return false;

  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleReminder: globally disabled');
    return false;
  }
  const taskRemindersEnabled = await loadData<boolean>('pref_task_reminders', true);
  if (!taskRemindersEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleReminder: task reminders disabled');
    return false;
  }

  const id = reminderId(meta.taskId, meta.subtaskId);
  if (!(await moduleAllowsReminder(id))) {
    if (__DEV__) console.warn('[notifications] scheduleReminder: module disabled');
    return false;
  }
  // Нагадування ЗАВДАННЯ шле сервер (`task.reminder`, з `reminderAt`, що
  // приїде синком); підзавдання сервер не індексує — лишається локальним.
  if (!meta.subtaskId && (await loadServerHandledReminders()).has('task.reminder')) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    return false;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  // Cancel existing before re-scheduling
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  const tr = await notificationTr();
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: meta.type === 'task' ? tr.notifTaskTitle : tr.notifSubtaskTitle,
      body: meta.title,
      data: { taskId: meta.taskId, subtaskId: meta.subtaskId ?? null },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
  return true;
}

export async function cancelReminder(taskId: string, subtaskId?: string): Promise<void> {
  const id = reminderId(taskId, subtaskId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}


export async function getAllScheduledNotifications() {
  return Notifications.getAllScheduledNotificationsAsync();
}

// ─── Щоденні нагадування (вода / сон тощо) ──────────────────────────────────

/** Стабільний id для щоденного нагадування за ключем */
export function dailyReminderId(key: string): string {
  return `daily_${key}`;
}

/**
 * Планує щоденне повторюване нагадування о вказаній годині/хвилині.
 * Якщо вже існує нагадування з таким ключем — перепланує його.
 */
export async function scheduleDailyReminder(
  key: string,
  hour: number,
  minute: number,
  title: string,
  body: string,
): Promise<boolean> {
  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleDailyReminder: globally disabled');
    return false;
  }
  const id = dailyReminderId(key);
  if (!(await moduleAllowsReminder(id))) {
    if (__DEV__) console.warn('[notifications] scheduleDailyReminder: module disabled', key);
    return false;
  }
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: true, data: { dailyKey: key } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
  return true;
}

export async function cancelDailyReminder(key: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(dailyReminderId(key)).catch(() => {});
}

/**
 * Щотижневе нагадування. weekday: 1=неділя … 7=субота (формат expo-notifications).
 * Використовує той самий id, що й dailyReminderId(key) — тож cancelDailyReminder() його скасовує.
 */
export async function scheduleWeeklyReminder(
  key: string,
  weekday: number,
  hour: number,
  minute: number,
  title: string,
  body: string,
): Promise<boolean> {
  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleWeeklyReminder: globally disabled');
    return false;
  }
  const id = dailyReminderId(key);
  if (!(await moduleAllowsReminder(id))) {
    if (__DEV__) console.warn('[notifications] scheduleWeeklyReminder: module disabled', key);
    return false;
  }
  const granted = await requestNotificationPermissions();
  if (!granted) return false;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: true, data: { weeklyKey: key } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute },
  });
  return true;
}

// ─── Профілактика: ліки (кілька разів/день) ─────────────────────────────────

/**
 * Планує щоденні нагадування для ліків на кожен час прийому.
 * Повертає масив id запланованих нотифікацій (зберегти у med.notifIds).
 */
export async function scheduleMedReminders(
  medId: string,
  times: string[],          // ["08:00","20:00"]
  title: string,
  body: string,
): Promise<string[]> {
  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleMedReminders: globally disabled');
    return [];
  }
  // Усі часи одного запису мають спільний префікс id, тож модуль питаємо раз.
  if (!(await moduleAllowsReminder(medReminderId(medId, 0)))) {
    if (__DEV__) console.warn('[notifications] scheduleMedReminders: module disabled');
    return [];
  }
  const granted = await requestNotificationPermissions();
  if (!granted) return [];
  const ids: string[] = [];
  for (let i = 0; i < times.length; i++) {
    const m = times[i].match(/^(\d{1,2}):(\d{2})$/);
    if (!m) continue;
    const hour = parseInt(m[1], 10), minute = parseInt(m[2], 10);
    const id = `med_${medId}_${i}`;
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body, sound: true, data: { medId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
    });
    ids.push(id);
  }
  return ids;
}

export async function cancelMedReminders(ids?: string[]): Promise<void> {
  if (!ids) return;
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

// ─── Профілактика: разові нагадування (огляди/щеплення) ──────────────────────

export async function scheduleDateReminder(
  id: string,
  date: Date,
  title: string,
  body: string,
): Promise<string | null> {
  if (date <= new Date()) return null;
  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleDateReminder: globally disabled');
    return null;
  }
  if (!(await moduleAllowsReminder(id))) {
    if (__DEV__) console.warn('[notifications] scheduleDateReminder: module disabled', id);
    return null;
  }
  const granted = await requestNotificationPermissions();
  if (!granted) return null;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
  });
  return id;
}

export async function cancelById(id?: string | null): Promise<void> {
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

// ─── Зустрічі: нагадування за 15 хв до початку ───────────────────────────────

/** Стабільний id нотифікації для зустрічі */
export function meetingNotifId(meetingId: string): string {
  return `meeting_${meetingId}`;
}

/**
 * Планує одноразове нагадування за 15 хвилин до зустрічі.
 * Якщо зустріч уже пройшла (або до неї ≤15 хв) — не планує.
 * Безпечно викликати повторно при редагуванні: скасовує стару нотифікацію.
 */
export async function scheduleMeetingNotification(
  meetingId: string,
  title: string,
  dateStr: string,  // 'YYYY-MM-DD'
  timeStr: string,  // 'HH:MM'
): Promise<boolean> {
  const dt = new Date(`${dateStr}T${timeStr || '00:00'}`);
  const fireAt = new Date(dt.getTime() - 15 * 60 * 1000);
  if (fireAt <= new Date()) return false;

  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) {
    if (__DEV__) console.warn('[notifications] scheduleMeetingNotification: globally disabled');
    return false;
  }

  const id = meetingNotifId(meetingId);
  if (!(await moduleAllowsReminder(id))) {
    if (__DEV__) console.warn('[notifications] scheduleMeetingNotification: module disabled');
    return false;
  }
  // Нагадування про зустріч шле сервер (`meeting.reminder`, з урахуванням
  // повторів і «за скільки хвилин» із налаштувань сповіщень).
  if ((await loadServerHandledReminders()).has('meeting.reminder')) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    return false;
  }

  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  const tr = await notificationTr();
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: tr.notifMeetingTitle,
      body: title,
      sound: true,
      data: { meetingId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
  return true;
}

/** Скасовує нагадування для зустрічі (при видаленні або зміні). */
export async function cancelMeetingNotification(meetingId: string): Promise<void> {
  const id = meetingNotifId(meetingId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

// ─── Підписки: нагадування про оплату ────────────────────────────────────────

/**
 * Тексти нагадувань підписок. Приходять ззовні (з tr), бо цей модуль поза
 * React і не знає мови інтерфейсу. Плейсхолдери: {name} {amount} {date}.
 */
export interface SubscriptionReminderTexts {
  beforeTitle: string;
  beforeBody: string;
  dueTitle: string;
  dueBody: string;
  overdueTitle: string;
  overdueBody: string;
  endTitle: string;
  endBody: string;
}

export interface SyncSubscriptionRemindersOptions {
  texts: SubscriptionReminderTexts;
  /** Сума підписки, уже відформатована з валютою. */
  formatAmount: (sub: Subscription) => string;
  /** Дата 'YYYY-MM-DD' у людському вигляді. */
  formatDate: (dateKey: string) => string;
  /**
   * Чи можна ПОПРОСИТИ дозвіл. Фонова синхронізація (старт, повернення в
   * застосунок, запис синку) не має права раптом показувати системний запит —
   * лише явна дія користувача на екрані підписок.
   */
  requestPermission?: boolean;
  now?: Date;
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

async function hasNotificationPermission(request: boolean): Promise<boolean> {
  if (request) return requestNotificationPermissions();
  if (!Device.isDevice) return true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

let subscriptionRemindersQueue: Promise<void> = Promise.resolve();

/**
 * Приводить заплановані ОС-нагадування підписок у відповідність до даних.
 *
 * Планує все з subscriptionReminderPlan і скасовує будь-який запланований
 * ідентифікатор `sub_…`, якого в плані немає (підписку продовжили, архівували,
 * видалили). Скасовуються ЛИШЕ локальні нотифікації — самі дані не чіпаються.
 * Виклики серіалізуються: старт, синк і повернення в застосунок можуть збігтися.
 */
export function syncSubscriptionReminders(
  subs: Subscription[],
  options: SyncSubscriptionRemindersOptions,
): Promise<void> {
  const run = async () => {
    const now = options.now ?? new Date();
    let scheduledIds: string[] = [];
    /** Заплановані НЕ підписками (задачі, зустрічі, здоровʼя…); null — невідомо. */
    let othersPending: number | null = null;
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      scheduledIds = scheduled
        .map(n => n.identifier)
        .filter(id => typeof id === 'string' && id.startsWith(SUBSCRIPTION_NOTIFICATION_PREFIX));
      othersPending = scheduled.length - scheduledIds.length;
    } catch {
      scheduledIds = [];
    }

    const enabled = await isNotificationsEnabled();
    // Вимкнений модуль «Підписки» діє тут рівно як глобальне вимкнення
    // нотифікацій: план порожній, а все вже заплановане — скасовується.
    // Самі підписки при цьому лишаються у сховищі недоторканими.
    const moduleOn = isModuleEnabled(await loadDisabledModules(), 'subscriptions');
    if (!enabled || !moduleOn) {
      await Promise.all(scheduledIds.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      return;
    }
    const granted = await hasNotificationPermission(!!options.requestPermission);
    if (!granted) return;

    // Обʼєднаний план усіх підписок, обмежений вікном і бюджетом: iOS тримає лише
    // 64 найближчі локальні нотифікації, і підписки не мають витісняти
    // нагадування задач/зустрічей/здоровʼя — бюджет рахується від уже
    // запланованих чужих (subscriptionReminderBudget). Дальші доплануються пізніше.
    type Entry = ReturnType<typeof subscriptionReminderPlan>[number] & { sub: Subscription };
    const all: Entry[] = [];
    for (const sub of subs) {
      for (const spec of subscriptionReminderPlan(sub, now)) all.push({ ...spec, sub });
    }
    // День оплати шле сервер (`subscription.due_today`) — локальний `due` не
    // плануємо, а вже запланований піде в `stale` нижче і скасується.
    const serverEvents = await loadServerHandledReminders();
    const localOnly = serverEvents.has('subscription.due_today') ? all.filter(spec => spec.kind !== 'due') : all;
    const limited = limitSubscriptionReminders(localOnly, now, {
      max: subscriptionReminderBudget(Platform.OS, othersPending),
    });

    const planned = new Set<string>();
    for (const spec of limited) {
      const sub = spec.sub;
      const values = {
        name: sub.name,
        amount: options.formatAmount(sub),
        date: options.formatDate(sub.nextPaymentDate),
      };
      planned.add(spec.id);
      const t = options.texts;
      const [title, body] = spec.kind === 'before'
        ? [t.beforeTitle, t.beforeBody]
        : spec.kind === 'due'
          ? [t.dueTitle, t.dueBody]
          : spec.kind === 'overdue'
            ? [t.overdueTitle, t.overdueBody]
            : [t.endTitle, t.endBody];
      const content = {
        title,
        body: fillTemplate(body, spec.kind === 'end'
          ? { ...values, date: sub.endDate ? options.formatDate(sub.endDate) : values.date }
          : values),
        sound: true,
        data: { subscriptionId: sub.id, kind: spec.kind },
      };
      try {
        await Notifications.cancelScheduledNotificationAsync(spec.id).catch(() => {});
        if (spec.daily) {
          await Notifications.scheduleNotificationAsync({
            identifier: spec.id,
            content,
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: spec.daily.hour,
              minute: spec.daily.minute,
            },
          });
        } else if (spec.fireAt && spec.fireAt.getTime() > Date.now()) {
          await Notifications.scheduleNotificationAsync({
            identifier: spec.id,
            content,
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: spec.fireAt },
          });
        }
      } catch (e) {
        if (__DEV__) console.warn('[notifications] subscription reminder failed:', spec.id, e);
      }
    }

    const stale = scheduledIds.filter(id => !planned.has(id));
    await Promise.all(stale.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  };
  subscriptionRemindersQueue = subscriptionRemindersQueue.then(run, run);
  return subscriptionRemindersQueue;
}

/**
 * Перепланувати нагадування підписок зі свіжого сховища. Спільна точка для
 * кореневого ефекту (без запиту дозволу) і екрана підписок (після явної дії
 * користувача — із запитом дозволу).
 */
export async function rescheduleSubscriptionRemindersFromStorage(
  tr: Pick<Translations,
    'subNotifBeforeTitle' | 'subNotifBeforeBody' | 'subNotifDueTitle' | 'subNotifDueBody'
    | 'subNotifOverdueTitle' | 'subNotifOverdueBody' | 'subNotifEndTitle' | 'subNotifEndBody'>,
  lang: string,
  opts: { requestPermission?: boolean } = {},
): Promise<void> {
  const [raw, custom] = await Promise.all([
    loadData<unknown>('subscriptions', []),
    loadData<Currency[]>('finance_currencies', []),
  ]);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const currencies = [...BUILTIN_CURRENCIES, ...(Array.isArray(custom) ? custom : [])];
  await syncSubscriptionReminders(normalizeSubscriptions(raw), {
    texts: {
      beforeTitle: tr.subNotifBeforeTitle,
      beforeBody: tr.subNotifBeforeBody,
      dueTitle: tr.subNotifDueTitle,
      dueBody: tr.subNotifDueBody,
      overdueTitle: tr.subNotifOverdueTitle,
      overdueBody: tr.subNotifOverdueBody,
      endTitle: tr.subNotifEndTitle,
      endBody: tr.subNotifEndBody,
    },
    formatAmount: sub => formatSubscriptionMoney(sub.amount, sub.currency, currencies, locale),
    formatDate: key => formatDateKey(key, locale),
    requestPermission: opts.requestPermission,
  });
}

// ─── Здоров'я: нагадування ліків і звичок переживають синхронізацію ──────────

/** Префікси локальних id, якими володіє переплановувач здоров'я. */
export const MED_NOTIFICATION_PREFIX = 'med_';
export const HABIT_NOTIFICATION_PREFIX = 'daily_habit_';

/** Детермінований id: той самий запис → той самий ідентифікатор на будь-якому пристрої. */
export function medReminderId(medId: string, index: number): string {
  return `med_${medId}_${index}`;
}
export function habitReminderId(habitId: string): string {
  return dailyReminderId(`habit_${habitId}`);
}

interface HealthReminderSpec {
  id: string;
  hour: number;
  minute: number;
  title: string;
  body: string;
  data: Record<string, string>;
}

interface MedLike { id: string; name: string; times?: string[]; active?: boolean }
interface HabitLike { id: string; title: string; reminderAt?: string }

function parseHm(value: string | undefined): { hour: number; minute: number } | null {
  const m = (value ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10), minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/**
 * План нагадувань здоров'я зі сховища — чиста функція, щоб її можна було
 * перевірити без expo-notifications.
 */
export function healthReminderPlan(
  meds: MedLike[],
  habits: HabitLike[],
  tr: Pick<Translations, 'takeNow' | 'habits'>,
): HealthReminderSpec[] {
  const out: HealthReminderSpec[] = [];
  for (const med of meds) {
    if (!med || !med.id || med.active === false) continue;
    const times = Array.isArray(med.times) ? med.times : [];
    times.forEach((t, i) => {
      const hm = parseHm(t);
      if (!hm) return;
      out.push({
        id: medReminderId(med.id, i),
        ...hm,
        title: `💊 ${med.name}`,
        body: tr.takeNow,
        data: { medId: med.id },
      });
    });
  }
  for (const habit of habits) {
    if (!habit || !habit.id) continue;
    const hm = parseHm(habit.reminderAt);
    if (!hm) continue;
    out.push({
      id: habitReminderId(habit.id),
      ...hm,
      title: habit.title,
      body: tr.habits,
      data: { habitId: habit.id },
    });
  }
  return out;
}

let healthRemindersQueue: Promise<void> = Promise.resolve();

/**
 * DI-05: запис, що приїхав синком з іншого пристрою, має дані нагадування,
 * але не має самої нотифікації в ОС — ніхто її тут не планував. Дзеркально:
 * видалений на іншому пристрої запис лишав би нагадування назавжди.
 *
 * Тому єдине джерело правди — список запланованого в ОС проти сховища, а не
 * поле `notifIds`/`notifId` у записі (воно локальне для пристрою і з чужого
 * пристрою приходить порожнім — див. `store/synced-storage.ts`). Звірка йде
 * за ДЕТЕРМІНОВАНИМИ id (`med_<id>_<i>`, `daily_habit_<id>`), тож повторний
 * виклик нічого не дублює. Зразок — `rescheduleSubscriptionRemindersFromStorage`.
 *
 * Викликати з кореневого ефекту і на сигнал сховища по `health_meds` /
 * `health_habits` (див. `app/_layout.tsx`, де вже так зроблено для підписок).
 */
export function rescheduleHealthRemindersFromStorage(
  tr: Pick<Translations, 'takeNow' | 'habits'>,
  opts: { requestPermission?: boolean } = {},
): Promise<void> {
  const run = async () => {
    const [medsRaw, habitsRaw] = await Promise.all([
      loadData<MedLike[]>('health_meds', []),
      loadData<HabitLike[]>('health_habits', []),
    ]);
    const meds = Array.isArray(medsRaw) ? medsRaw : [];
    const habits = Array.isArray(habitsRaw) ? habitsRaw : [];

    let ours: string[] = [];
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      ours = scheduled
        .map(n => n.identifier)
        .filter(id => typeof id === 'string'
          && (id.startsWith(MED_NOTIFICATION_PREFIX) || id.startsWith(HABIT_NOTIFICATION_PREFIX)));
    } catch {
      ours = [];
    }

    const enabled = await isNotificationsEnabled();
    if (!enabled) {
      await Promise.all(ours.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
      return;
    }

    // Фільтр модулів — ДО звірки, тож нагадування вимкненого модуля просто
    // не потрапляє в план і тим самим потрапляє в `stale`: скасування
    // вже запланованого виходить із того самого проходу, без окремої гілки.
    const disabledModules = await loadDisabledModules();
    const plan = healthReminderPlan(meds, habits, tr)
      .filter(spec => reminderAllowed(spec.id, disabledModules));
    const stale = ours.filter(id => !plan.some(spec => spec.id === id));
    await Promise.all(stale.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));

    const missing = plan.filter(spec => !ours.includes(spec.id));
    if (!missing.length) return;

    // Дозвіл питаємо лише за явної дії користувача — фоновий старт не має
    // права раптом показувати системний діалог (те саме правило, що й у підписок).
    const granted = await hasNotificationPermission(!!opts.requestPermission);
    if (!granted) return;

    for (const spec of missing) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: spec.id,
          content: { title: spec.title, body: spec.body, sound: true, data: spec.data },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: spec.hour,
            minute: spec.minute,
          },
        });
      } catch (e) {
        if (__DEV__) console.warn('[notifications] health reminder failed:', spec.id, e);
      }
    }
  };
  healthRemindersQueue = healthRemindersQueue.then(run, run);
  return healthRemindersQueue;
}

// ─── Тренування: «серія під загрозою» (training-module.md §9) ────────────────
//
// `training_streak_at_risk` на мобільному — ЛОКАЛЬНЕ сповіщення: плановий день,
// за 3 години до кінця доби, сесія ще `planned`. План будується з
// персонального ключа `training_sessions` (його розгортає сервер), звірка —
// за детермінованими id, як у здоров'я: запис, що приїхав синком, отримує
// нагадування, а виконана/видалена сесія — втрачає.
//
// `training_session_reminder` («за reminderOffsetMin до сесії») тут НЕ
// плануємо: у сесії немає ні часу початку, ні зсуву — лише дата. Потрібне
// рішення власника, о котрій нагадувати (див. followups).

export const TRAINING_STREAK_PREFIX = 'training_streak_';
/** 3 години до кінця доби (§9): 21:00 місцевого часу. */
export const TRAINING_STREAK_HOUR = 21;
/** Не більше двох тижнів наперед: iOS тримає лише 64 заплановані сповіщення на застосунок. */
const TRAINING_STREAK_HORIZON_DAYS = 14;

export function trainingStreakReminderId(sessionId: string): string {
  return `${TRAINING_STREAK_PREFIX}${sessionId}`;
}

interface TrainingSessionLike { id?: unknown; date?: unknown; status?: unknown; title?: unknown; programName?: unknown }

export interface TrainingReminderSpec {
  id: string;
  date: Date;
  title: string;
  body: string;
  data: Record<string, string>;
}

function localDateFromKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** План «серії під загрозою» — чиста функція (перевіряється без expo-notifications). */
export function trainingReminderPlan(
  sessions: readonly unknown[],
  now: Date,
  tr: Pick<Translations, 'tlTrainingStreakTitle' | 'tlTrainingStreakBody'>,
): TrainingReminderSpec[] {
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + TRAINING_STREAK_HORIZON_DAYS);
  const out: TrainingReminderSpec[] = [];
  for (const raw of sessions) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as TrainingSessionLike;
    if (typeof s.id !== 'string' || !s.id || s.status !== 'planned' || typeof s.date !== 'string') continue;
    const day = localDateFromKey(s.date);
    if (!day) continue;
    const fireAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), TRAINING_STREAK_HOUR, 0, 0, 0);
    if (fireAt.getTime() <= now.getTime() || fireAt.getTime() > horizon.getTime()) continue;
    const name = (typeof s.title === 'string' && s.title.trim())
      || (typeof s.programName === 'string' && s.programName.trim())
      || '';
    out.push({
      id: trainingStreakReminderId(s.id),
      date: fireAt,
      title: tr.tlTrainingStreakTitle,
      body: fillTemplate(tr.tlTrainingStreakBody, { title: name || tr.tlTrainingStreakTitle }),
      data: { sessionId: s.id, url: `ftrackingapp://training/session/${encodeURIComponent(s.id)}` },
    });
  }
  return out;
}

let trainingRemindersQueue: Promise<void> = Promise.resolve();

/**
 * Звірити заплановані «серія під загрозою» з `training_sessions`. Ідемпотентно;
 * дозвіл питає лише за `requestPermission` (фоновий старт діалогів не показує).
 */
export function rescheduleTrainingRemindersFromStorage(
  tr: Pick<Translations, 'tlTrainingStreakTitle' | 'tlTrainingStreakBody'>,
  opts: { requestPermission?: boolean; now?: Date } = {},
): Promise<void> {
  const run = async () => {
    const raw = await loadData<unknown[]>('training_sessions', []);
    const sessions = Array.isArray(raw) ? raw : [];

    let ours: string[] = [];
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      ours = scheduled
        .map(n => n.identifier)
        .filter((id): id is string => typeof id === 'string' && id.startsWith(TRAINING_STREAK_PREFIX));
    } catch {
      ours = [];
    }

    const enabled = await isNotificationsEnabled();
    const disabledModules = await loadDisabledModules();
    const plan = enabled
      ? trainingReminderPlan(sessions, opts.now ?? new Date(), tr).filter(spec => reminderAllowed(spec.id, disabledModules))
      : [];
    const stale = ours.filter(id => !plan.some(spec => spec.id === id));
    await Promise.all(stale.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));

    const missing = plan.filter(spec => !ours.includes(spec.id));
    if (!missing.length) return;
    const granted = await hasNotificationPermission(!!opts.requestPermission);
    if (!granted) return;

    for (const spec of missing) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: spec.id,
          content: { title: spec.title, body: spec.body, sound: true, data: spec.data },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: spec.date },
        });
      } catch (e) {
        if (__DEV__) console.warn('[notifications] training reminder failed:', spec.id, e);
      }
    }
  };
  trainingRemindersQueue = trainingRemindersQueue.then(run, run);
  return trainingRemindersQueue;
}

// ─── Вимкнені модулі: чого не планувати взагалі ──────────────────────────────
//
// Вимкнення модуля (store/ui-preferences.ts) ховає ВХІД: пункт меню, вкладку,
// секцію дашборда. Нагадування — теж вхід, ба навіть настирливіший: розділ,
// якого користувач у себе вимкнув, не має будити його телефон о восьмій ранку.
//
// Звірка йде за ІДЕНТИФІКАТОРОМ нотифікації, а не за місцем виклику, і це
// свідомо. По-перше, планувальників багато (шість екранів плюс два фонові
// переплановувачі), і правило, розкладене по них, розійшлося б на першому ж
// новому. По-друге, тільки id відомий про ВЖЕ ЗАПЛАНОВАНЕ: коли модуль
// вимикають, у системі вже лежать нагадування, і скасувати треба саме їх, а
// код, що їх створив, давно відпрацював. Ідентифікатори й так детерміновані
// (`med_<id>_<i>`, `daily_habit_<id>`, `reminder_<taskId>`) — тут це просто
// використано вдруге.

/**
 * Префікс ідентифікатора → модулі, БЕЗ яких нагадування не існує.
 *
 * Порядок важливий: перше збіжне правило виграє, тож `daily_habit_` мусить
 * стояти вище за `daily_` — інакше звички потрапили б у загальне «Здоров'я»
 * і переживали б вимкнення «Профілактики».
 *
 * Ліки, огляди, щеплення і звички вимагають ДВОХ модулів: на вебі
 * «Профілактика» — окремий розділ із власним перемикачем, а на мобільному це
 * вкладка хаба «Здоров'я». Вимкнули будь-який із двох — нагадувань немає, бо
 * немає жодного екрана, де їх було б видно.
 *
 * Чого тут НЕМАЄ — те не фільтрується: нагадування тренувань
 * (`app/workouts.tsx`) планує сам expo без сталого identifier, тож зіставити
 * його з модулем за id неможливо (див. followups).
 */
const REMINDER_MODULE_RULES: { prefix: string; modules: readonly ModuleId[] }[] = [
  { prefix: 'reminder_',                    modules: ['tasks'] },
  { prefix: 'meeting_',                     modules: ['meetings'] },
  { prefix: SUBSCRIPTION_NOTIFICATION_PREFIX, modules: ['subscriptions'] },
  { prefix: HABIT_NOTIFICATION_PREFIX,      modules: ['health', 'prevention'] },
  { prefix: MED_NOTIFICATION_PREFIX,        modules: ['health', 'prevention'] },
  { prefix: 'checkup_',                     modules: ['health', 'prevention'] },
  { prefix: 'vaccine_',                     modules: ['health', 'prevention'] },
  { prefix: TRAINING_STREAK_PREFIX,         modules: ['training'] },
  // Решта щоденних/тижневих (вода, сон, вага, виміри — hooks/use-health-entries).
  { prefix: 'daily_',                       modules: ['health'] },
];

/**
 * Модулі, від яких залежить нагадування з таким id. Порожній список — id не
 * наш або нічого не вимагає, тобто нагадування лишається за будь-яких
 * налаштувань: мовчки скасувати чуже нагадування гірше, ніж показати зайве.
 */
export function reminderModulesFor(id: string): readonly ModuleId[] {
  const rule = REMINDER_MODULE_RULES.find(candidate => id.startsWith(candidate.prefix));
  return rule ? rule.modules : [];
}

/** Чи дозволяють поточні налаштування модулів мати таке нагадування. */
export function reminderAllowed(id: string, disabled: readonly string[]): boolean {
  return reminderModulesFor(id).every(module => isModuleEnabled(disabled, module));
}

/**
 * Те саме, але зі сховища. Помилка читання трактується як «дозволено»:
 * зіпсований ключ налаштувань не має тихо залишити користувача без
 * нагадувань про ліки — це рівно той бік помилки, який коштує дорожче.
 */
async function moduleAllowsReminder(id: string): Promise<boolean> {
  try {
    return reminderAllowed(id, await loadDisabledModules());
  } catch {
    return true;
  }
}

let moduleSyncQueue: Promise<void> = Promise.resolve();

/**
 * Привести вже заплановане у відповідність до вимкнених модулів.
 *
 * Скасовує нагадування вимкнених модулів і — дзеркально — повертає те, що
 * можна відновити зі сховища, коли модуль увімкнули назад (здоров'я й
 * підписки мають повні переплановувачі; задачі, зустрічі, огляди та щеплення
 * лежать датами в самих записах і відновлюються при наступному їх
 * редагуванні — див. followups).
 *
 * Викликається з підписки на ключ налаштувань нижче, тож спрацьовує і на
 * перемикач у цьому застосунку, і на вибір, що приїхав синком з іншого
 * пристрою. Виклики серіалізуються: перемикнути два модулі поспіль — звичайна
 * справа, а два одночасні проходи по списку запланованого гасили б одне одного.
 */
export function syncRemindersWithModules(): Promise<void> {
  const run = async () => {
    const disabled = await loadDisabledModules();

    let scheduledIds: string[] = [];
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      scheduledIds = scheduled
        .map(n => n.identifier)
        .filter((id): id is string => typeof id === 'string');
    } catch {
      scheduledIds = [];
    }
    const stale = scheduledIds.filter(id => !reminderAllowed(id, disabled));
    await Promise.all(stale.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));

    // Увімкнули назад — повертаємо те, що вміємо відбудувати зі сховища.
    // Обидва переплановувачі ідемпотентні (звіряють ОС зі сховищем за
    // детермінованими id), тож зайвий виклик нічого не дублює.
    const tr = await notificationTr();
    const lang = await loadData<Lang>(LANG_STORAGE_KEY, 'uk');
    if (isModuleEnabled(disabled, 'health') && isModuleEnabled(disabled, 'prevention')) {
      await rescheduleHealthRemindersFromStorage(tr);
    }
    if (isModuleEnabled(disabled, 'subscriptions')) {
      await rescheduleSubscriptionRemindersFromStorage(tr, lang === 'en' ? 'en' : 'uk');
    }
    if (isModuleEnabled(disabled, 'training')) {
      await rescheduleTrainingRemindersFromStorage(tr);
    }
  };
  moduleSyncQueue = moduleSyncQueue.then(run, run);
  return moduleSyncQueue;
}

// Ключ налаштувань пишуть у трьох місцях: екран модулів, pull синку з іншого
// пристрою і «очистити всі дані». Підписка тут — єдина точка, що бачить усі
// три; окремий виклик з екрана модулів пропустив би два інші.
subscribeToStorage(key => {
  if (key === UI_PREFERENCES_KEY) void syncRemindersWithModules();
  // Рішення «нагадування шле сервер» пише `store/push.ts` після реєстрації
  // пристрою — підписка тут ловить і перший перехід, і появу нової події.
  if (key === SERVER_REMINDERS_KEY) void migrateLocalRemindersToServer();
});
