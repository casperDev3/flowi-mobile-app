/**
 * modules/flowi-android — нативні поверхні Android (WATCH_LOCKSCREEN v1 §10).
 *
 *   • віджети головного екрана (великий: 4 кільця + 4 дії, середній: 4 дії,
 *     малий: 1 дія на вибір, «показник»: 1 кільце на вибір) — читають знімок
 *     `flowi_widget_snapshot_v1`, який застосунок кладе сюди;
 *   • постійне сповіщення таймера з живим часом і кнопкою «Зупинити» —
 *     аналог Live Activity;
 *   • черга дій, які натиснуто поза застосунком (Stop у сповіщенні), —
 *     JS забирає її й застосовує через applyDeviceActions.
 *
 * Поза Android (iOS, веб) і без зібраного нативного модуля (Expo Go) усі
 * виклики — тихі no-op: застосунок не має права падати через віджет.
 */
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface TimerNotificationParams {
  timerId: string;
  /** Назва завдання/наради або введений текст — заголовок сповіщення. */
  label: string;
  /** Мітка старту (мс) — сповіщення само рахує час (chronometer). */
  startedAtMs: number;
  /** Скільки ще таймерів іде, окрім показаного. */
  otherCount: number;
  /** «Таймер іде» — підзаголовок (і заголовок, коли label порожній). */
  title: string;
  /** Підпис кнопки «Зупинити». */
  stopLabel: string;
  /** Назва каналу сповіщень у налаштуваннях системи. */
  channelName: string;
  /** Готовий підпис «+N ще» (показується, лише коли otherCount > 0). */
  moreLabel: string;
}

export interface Subscription {
  remove(): void;
}

/** Подія нативного модуля: у черзі зʼявились нові дії. */
export const PENDING_ACTIONS_EVENT = 'onPendingActions';
/** Подія нативного модуля: користувач змахнув сповіщення таймера. */
export const TIMER_DISMISSED_EVENT = 'onTimerNotificationDismissed';

interface FlowiAndroidNative {
  setWidgetSnapshot(json: string): void;
  /** true — сповіщення віддано системі. */
  showTimerNotification(params: TimerNotificationParams): boolean;
  clearTimerNotification(): void;
  canPostNotifications(): boolean;
  readPendingActions(): string;
  removePendingActions(ids: string[]): void;
  clearPendingActions(): void;
  setDeviceActionOwner(userId: string | null): void;
  addListener(
    event: typeof PENDING_ACTIONS_EVENT | typeof TIMER_DISMISSED_EVENT,
    listener: () => void,
  ): Subscription;
}

let native: FlowiAndroidNative | null | undefined;

function mod(): FlowiAndroidNative | null {
  if (native !== undefined) return native;
  native = null;
  if (Platform.OS !== 'android') return native;
  try {
    native = requireOptionalNativeModule<FlowiAndroidNative>('FlowiAndroid');
  } catch (e) {
    if (__DEV__) console.warn('[flowi-android] нативний модуль недоступний:', e);
    native = null;
  }
  return native;
}

function guard<T>(what: string, fallback: T, run: (m: FlowiAndroidNative) => T): T {
  const m = mod();
  if (!m) return fallback;
  try {
    return run(m);
  } catch (e) {
    if (__DEV__) console.warn(`[flowi-android] ${what} не вдалося:`, e);
    return fallback;
  }
}

/** true — модуль зібрано й ми на Android. */
export function isAvailable(): boolean {
  return mod() !== null;
}

/**
 * Зберегти знімок (той самий JSON, що для iOS) і перемалювати всі віджети Flowi.
 * false — модуля немає або запис упав (тоді знімок треба повторити).
 */
export function setWidgetSnapshot(json: string): boolean {
  return guard('setWidgetSnapshot', false, m => {
    m.setWidgetSnapshot(json);
    return true;
  });
}

/**
 * Показати/оновити постійне сповіщення таймера (id 7301, канал flowi_timer).
 * true — показано; false — немає дозволу на сповіщення, модуля чи збій.
 */
export function showTimerNotification(params: TimerNotificationParams): boolean {
  return guard('showTimerNotification', false, m => m.showTimerNotification(params) === true);
}

/** Чи дозволено застосунку показувати сповіщення; без модуля — false. */
export function canPostNotifications(): boolean {
  return guard('canPostNotifications', false, m => m.canPostNotifications() === true);
}

export function clearTimerNotification(): void {
  guard('clearTimerNotification', undefined, m => m.clearTimerNotification());
}

/** JSON-рядок `DeviceAction[]` з нативної черги; без модуля — `"[]"`. */
export function readPendingActions(): string {
  return guard('readPendingActions', '[]', m => m.readPendingActions() || '[]');
}

/** Прибрати з черги оброблені дії (лише ці id — нові, що прийшли тим часом, лишаються). */
export function removePendingActions(ids: string[]): void {
  if (ids.length === 0) return;
  guard('removePendingActions', undefined, m => m.removePendingActions(ids));
}

/** Прибрати з черги все (вихід / зміна акаунта чи простору). */
export function clearPendingActions(): void {
  guard('clearPendingActions', undefined, m => m.clearPendingActions());
}

/**
 * Власник дій поза застосунком (NATIVE CONTRACT): ресивер «Зупинити» штампує
 * ним кожну дію; null — ніхто не увійшов, дії не ставляться в чергу.
 */
export function setDeviceActionOwner(userId: string | null): void {
  const id = typeof userId === 'string' && userId.length > 0 ? userId : null;
  guard('setDeviceActionOwner', undefined, m => m.setDeviceActionOwner(id));
}

export function addTimerNotificationDismissedListener(listener: () => void): Subscription {
  return guard<Subscription>('addTimerNotificationDismissedListener', { remove() {} }, m =>
    m.addListener(TIMER_DISMISSED_EVENT, () => listener()),
  );
}

export function addPendingActionsListener(listener: () => void): Subscription {
  return guard<Subscription>('addPendingActionsListener', { remove() {} }, m =>
    m.addListener(PENDING_ACTIONS_EVENT, () => listener()),
  );
}

/** Для тестів: підмінити нативний модуль (undefined — знову шукати). */
export function __setFlowiAndroidNativeForTests(next: FlowiAndroidNative | null | undefined): void {
  native = next;
}
