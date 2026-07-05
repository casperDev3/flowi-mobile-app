import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { loadData } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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
    await Notifications.setNotificationChannelAsync('flowi-reminders', {
      name: 'Нагадування',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED',
    });
  }
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

  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  const id = reminderId(meta.taskId, meta.subtaskId);
  // Cancel existing before re-scheduling
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});

  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: meta.type === 'task' ? '📋 Завдання' : '✅ Підзавдання',
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
  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  const id = dailyReminderId(key);
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
  const granted = await requestNotificationPermissions();
  if (!granted) return false;
  const id = dailyReminderId(key);
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

  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  const id = meetingNotifId(meetingId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: '📅 Зустріч через 15 хв',
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
