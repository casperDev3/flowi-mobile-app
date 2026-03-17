import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

export async function scheduleReminder(
  meta: ReminderMeta,
  date: Date,
): Promise<boolean> {
  if (date <= new Date()) return false;
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
