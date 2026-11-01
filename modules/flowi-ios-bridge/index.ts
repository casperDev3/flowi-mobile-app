/**
 * modules/flowi-ios-bridge — нативний міст iOS (docs/specs/watch-lockscreen-v1.md §7.1).
 *
 *   • WatchConnectivity: стан годинника, applicationContext, userInfo,
 *     повідомлення з відповіддю (відповідь тримає нативна сторона ≤2.5 с);
 *   • Live Activity таймера (ActivityKit, iOS ≥ 17);
 *   • черга дій поза застосунком (кнопка «Стоп» у Live Activity пише її в
 *     App Group і будить застосунок Darwin-нотифікацією).
 *
 * Поза iOS і без зібраного нативного модуля (Expo Go, тести) усі виклики —
 * тихі no-op, а читання повертають «нічого немає»: застосунок не має права
 * падати через годинник чи Live Activity.
 */
import { Platform } from 'react-native';

export interface WatchState {
  supported: boolean;
  paired: boolean;
  installed: boolean;
  reachable: boolean;
  activated: boolean;
}

export interface LiveActivityState {
  timerId: string;
  label: string;
  startedAtMs: number;
  projectName: string | null;
  colorHex: string | null;
  otherCount: number;
  lang: 'uk' | 'en';
}

export interface Subscription {
  remove(): void;
}

export interface WatchMessageEvent {
  requestId: string;
  message: Record<string, string>;
}

export interface WatchUserInfoEvent {
  info: Record<string, string>;
}

const EVENTS = {
  message: 'onWatchMessage',
  userInfo: 'onWatchUserInfo',
  state: 'onWatchState',
  pending: 'onPendingActions',
} as const;

interface FlowiIosBridgeNative {
  getWatchState(): WatchState;
  updateWatchContext(ctx: Record<string, string>): void;
  transferToWatch(info: Record<string, string>): void;
  sendToWatch(info: Record<string, string>): void;
  replyToWatch(requestId: string, reply: Record<string, string>): void;
  liveActivitiesEnabled(): boolean;
  liveActivitySync(state: LiveActivityState | null): void;
  readPendingActions(): string;
  removePendingActions(ids: string[]): void;
  clearPendingActions?(): void;
  setDeviceActionOwner?(userId: string | null): void;
  addListener(event: string, listener: (payload: never) => void): Subscription;
}

const NO_WATCH: WatchState = { supported: false, paired: false, installed: false, reachable: false, activated: false };
const NOOP_SUBSCRIPTION: Subscription = { remove: () => {} };

let native: FlowiIosBridgeNative | null | undefined;

function mod(): FlowiIosBridgeNative | null {
  if (native !== undefined) return native;
  native = null;
  if (Platform.OS !== 'ios') return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require('expo') as typeof import('expo');
    native = requireOptionalNativeModule<FlowiIosBridgeNative>('FlowiIosBridge');
  } catch (e) {
    if (__DEV__) console.warn('[ios-bridge] нативний модуль недоступний:', e);
  }
  return native;
}

/** Для тестів: підмінити нативний модуль (null — «модуля немає»). */
export function __setIosBridgeForTests(next: unknown): void {
  native = next as FlowiIosBridgeNative | null | undefined;
}

function call<T>(fn: (m: FlowiIosBridgeNative) => T, fallback: T): T {
  const m = mod();
  if (!m) return fallback;
  try {
    return fn(m);
  } catch (e) {
    if (__DEV__) console.warn('[ios-bridge] виклик не вдався:', e);
    return fallback;
  }
}

function listen<P>(event: string, cb: (payload: P) => void): Subscription {
  return call(m => m.addListener(event, cb as (payload: never) => void), NOOP_SUBSCRIPTION);
}

// ─── WatchConnectivity ───────────────────────────────────────────────────────

export function getWatchState(): WatchState {
  return call(m => ({ ...NO_WATCH, ...m.getWatchState() }), NO_WATCH);
}

export function updateWatchContext(ctx: Record<string, string>): void {
  call(m => m.updateWatchContext(ctx), undefined);
}

export function transferToWatch(info: Record<string, string>): void {
  call(m => m.transferToWatch(info), undefined);
}

/** Best-effort sendMessage без відповіді (лише коли годинник досяжний). */
export function sendToWatch(info: Record<string, string>): void {
  call(m => m.sendToWatch(info), undefined);
}

export function replyToWatch(requestId: string, reply: Record<string, string>): void {
  call(m => m.replyToWatch(requestId, reply), undefined);
}

export function addWatchMessageListener(cb: (e: WatchMessageEvent) => void): Subscription {
  return listen(EVENTS.message, cb);
}

export function addWatchUserInfoListener(cb: (e: WatchUserInfoEvent) => void): Subscription {
  return listen(EVENTS.userInfo, cb);
}

export function addWatchStateListener(cb: (s: WatchState) => void): Subscription {
  return listen<WatchState>(EVENTS.state, s => cb({ ...NO_WATCH, ...s }));
}

// ─── Live Activity ───────────────────────────────────────────────────────────

/** iOS ≥ 17 і користувач не вимкнув Live Activities для застосунку. */
export function liveActivitiesEnabled(): boolean {
  return call(m => m.liveActivitiesEnabled() === true, false);
}

/** null — завершити всі; інакше запустити або оновити єдину активність. */
export function liveActivitySync(state: LiveActivityState | null): void {
  call(m => m.liveActivitySync(state), undefined);
}

// ─── Черга дій поза застосунком (§7.3) ────────────────────────────────────────

/** JSON-масив DeviceAction з App Group (`[]`, коли нічого немає). */
export function readPendingActions(): string {
  return call(m => m.readPendingActions() || '[]', '[]');
}

export function removePendingActions(ids: string[]): void {
  if (!ids.length) return;
  call(m => m.removePendingActions(ids), undefined);
}

/** Прибрати всю чергу (вихід, зміна акаунта чи простору). */
export function clearPendingActions(): void {
  call(m => m.clearPendingActions?.(), undefined);
}

/**
 * Власник черги (App Group `flowi_device_action_owner_v1`): інтент «Стоп»
 * штампує його як `userId` у кожну дію; null — ніхто не увійшов, і дії не ставляться.
 */
export function setDeviceActionOwner(userId: string | null): void {
  call(m => m.setDeviceActionOwner?.(userId && userId.length ? userId : null), undefined);
}

export function addPendingActionsListener(cb: () => void): Subscription {
  return listen(EVENTS.pending, () => cb());
}
