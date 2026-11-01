/**
 * store/android-surfaces.ts — склейка JS ↔ поверхні Android (spec §10).
 *
 *   • знімок для віджетів: той самий `computeWidgetSnapshot`, що для iOS, —
 *     на старті, при змінах ключів-джерел (з дебаунсом) і при зміні AppState;
 *   • постійне сповіщення таймера: найсвіжіший із `activeTimers`, «+N ще» для
 *     решти; немає таймерів — сповіщення геть;
 *   • черга дій поза застосунком (Stop у сповіщенні): на старті, при
 *     поверненні в застосунок і за подією модуля → міграції сховища →
 *     `applyDeviceActions` → прибрати з черги все, що не `retry`;
 *   • власник черги (NATIVE CONTRACT): нативний ресивер штампує кожну дію
 *     `userId` поточного власника; дії без нього чи чужого користувача
 *     відкидаються, не застосовуючись. Вихід — власник null і черга порожня.
 *
 * На iOS і вебі — no-op (iOS має власні widget-sync / live-activity).
 * Монтується один раз у корені через components/shared/DeviceSurfaces.tsx
 * (його рендерить app/_layout.tsx; власник — mobile_js).
 */
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import * as FlowiAndroid from '@/modules/flowi-android';
import type { TimerNotificationParams } from '@/modules/flowi-android';
import { useAuth } from '@/store/auth';
import { applyDeviceActions } from '@/store/device-actions';
import { useI18n } from '@/store/i18n';
import { ensureStorageMigrations } from '@/store/migrations';
import { subscribeToStorage } from '@/store/storage';
import { useTimerContext } from '@/store/timer-context';
import { WIDGET_SOURCE_KEYS, computeWidgetSnapshot } from '@/store/widget-sync';
import type { ActiveTimer } from '@/utils/activeTimers';
import type { ActionResult, DeviceAction } from '@/utils/deviceActions';

/** Ключі сховища, від яких залежить знімок (+ зустрічі для `next`, §8.1). */
export const ANDROID_SNAPSHOT_KEYS: readonly string[] = Array.from(
  new Set<string>([...(WIDGET_SOURCE_KEYS as readonly string[]), 'meetings']),
);

const DEBOUNCE_MS = 1500;

function isAndroid(): boolean {
  return Platform.OS === 'android';
}

// MARK: - Pending queue

/** Терплячий розбір нативної черги: биті записи (без рядкового id) відкидаються. */
export function parsePendingActions(json: string | null | undefined): DeviceAction[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is DeviceAction =>
      !!a && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string'
      && (a as { id: string }).id.length > 0,
  );
}

/** Дія належить користувачу `ownerId` (штамп `userId` від нативного ресивера). */
export function isOwnedAction(action: DeviceAction, ownerId: string | null | undefined): boolean {
  if (!ownerId) return false;
  const userId = (action as { userId?: unknown }).userId;
  return typeof userId === 'string' && userId === ownerId;
}

/** id таймерів, для яких у черзі вже лежить `timer_stop` — їх не показуємо знову. */
export function pendingStopTimerIds(actions: readonly DeviceAction[]): Set<string> {
  const ids = new Set<string>();
  for (const a of actions) {
    if (a.type !== 'timer_stop') continue;
    const timerId = (a.payload as { timerId?: unknown } | undefined)?.timerId;
    if (typeof timerId === 'string' && timerId) ids.add(timerId);
  }
  return ids;
}

let draining: Promise<void> | null = null;
let drainAgain = false;
let drainOwner: string | null = null;

/**
 * Таймери, Stop яких щойно застосовано з черги. Черга вже порожня, а
 * TimerProvider ще не перечитав сховище: без цього ефект сповіщення на
 * холодному старті на мить показав би зупинений таймер знову (A6).
 * Скидається, щойно контекст таймерів віддасть новий масив.
 */
let recentStops: { ids: Set<string>; timers: unknown } | null = null;
/** Останній масив activeTimers, який бачив хук (для recentStops.timers). */
let lastSeenTimers: unknown = undefined;

async function drainOnce(ownerId: string): Promise<void> {
  const all = parsePendingActions(FlowiAndroid.readPendingActions());
  if (all.length === 0) return;
  // Чужі / без власника — геть, не застосовуючи (NATIVE CONTRACT).
  const foreign = all.filter(a => !isOwnedAction(a, ownerId)).map(a => a.id);
  if (foreign.length) FlowiAndroid.removePendingActions(foreign);
  const actions = all.filter(a => isOwnedAction(a, ownerId));
  if (actions.length === 0) return;
  let results: ActionResult[];
  try {
    // Як на iOS: застосувальник читає колекції в їхній поточній (мігрованій) формі.
    await ensureStorageMigrations();
    results = await applyDeviceActions(actions);
  } catch (e) {
    // Застосування впало цілком — нічого не прибираємо, спробуємо наступного разу.
    if (__DEV__) console.warn('[android-surfaces] applyDeviceActions впав:', e);
    return;
  }
  const processed = new Set(results.filter(r => r && r.status !== 'retry').map(r => r.id));
  if (processed.size === 0) return;
  FlowiAndroid.removePendingActions([...processed]);
  const stopped = pendingStopTimerIds(actions.filter(a => processed.has(a.id)));
  if (stopped.size) {
    const ids = new Set([...(recentStops?.ids ?? []), ...stopped]);
    recentStops = { ids, timers: lastSeenTimers };
  }
}

/**
 * Забрати й застосувати чергу користувача `ownerId`. Паралельні виклики
 * зливаються: подія, що прийшла під час застосування, запускає ще одне коло.
 * Без власника (вихід) — нічого не застосовується.
 */
export function drainAndroidPendingActions(ownerId: string | null | undefined): Promise<void> {
  if (!isAndroid() || !FlowiAndroid.isAvailable() || !ownerId) return Promise.resolve();
  drainOwner = ownerId;
  if (draining) {
    drainAgain = true;
    return draining;
  }
  draining = (async () => {
    try {
      do {
        drainAgain = false;
        if (drainOwner) await drainOnce(drainOwner);
      } while (drainAgain);
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/**
 * Таймери, які не треба показувати у сповіщенні: Stop ще в черзі (лише дії
 * поточного власника) або щойно застосований, а контекст ще не оновився.
 */
export function excludedTimerIds(
  queueJson: string | null | undefined,
  ownerId: string | null | undefined,
  activeTimers: unknown,
): Set<string> {
  const ids = pendingStopTimerIds(parsePendingActions(queueJson).filter(a => isOwnedAction(a, ownerId)));
  if (recentStops) {
    if (recentStops.timers !== activeTimers) recentStops = null;
    else for (const id of recentStops.ids) ids.add(id);
  }
  return ids;
}

// MARK: - Timer notification

export interface TimerNotifStrings {
  timerNotifTitle: string;
  timerNotifStop: string;
  timerNotifChannel: string;
  timerNotifMore: string;
}

function startedMs(t: ActiveTimer): number {
  const ms = Date.parse(t.startedAt);
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Що показати у сповіщенні: найсвіжіший таймер (max startedAt) і кількість
 * решти. Таймери з уже поставленим у чергу Stop не рахуються. null — нічого.
 */
export function timerNotificationFor(
  timers: readonly ActiveTimer[],
  strings: TimerNotifStrings,
  exclude: ReadonlySet<string> = new Set(),
): TimerNotificationParams | null {
  const live = timers.filter(t => t?.id && !exclude.has(t.id) && Number.isFinite(startedMs(t)));
  if (live.length === 0) return null;
  const newest = live.reduce((best, t) => (startedMs(t) > startedMs(best) ? t : best));
  const otherCount = live.length - 1;
  return {
    timerId: newest.id,
    label: newest.label ?? '',
    startedAtMs: startedMs(newest),
    otherCount,
    title: strings.timerNotifTitle,
    stopLabel: strings.timerNotifStop,
    channelName: strings.timerNotifChannel,
    moreLabel: otherCount > 0 ? strings.timerNotifMore.replace('{n}', String(otherCount)) : '',
  };
}

// MARK: - Widget snapshot

let lastSnapshotSignature: string | null = null;

/** Для тестів: скинути памʼять модуля. */
export function __resetAndroidSurfacesForTests(): void {
  lastSnapshotSignature = null;
  draining = null;
  drainAgain = false;
  drainOwner = null;
  recentStops = null;
  lastSeenTimers = undefined;
}

/** Перерахувати знімок і, якщо він змінився (крім generatedAt), віддати віджетам. */
export async function writeAndroidWidgetSnapshot(
  session: { authed: boolean; myUserId?: string | null },
  now: Date = new Date(),
): Promise<boolean> {
  if (!isAndroid() || !FlowiAndroid.isAvailable()) return false;
  const snapshot = await computeWidgetSnapshot(session, now);
  const signature = JSON.stringify({ ...snapshot, generatedAt: '' });
  if (signature === lastSnapshotSignature) return false;
  // Запис не вдався — підпис не запамʼятовуємо: наступна спроба запише знову.
  if (!FlowiAndroid.setWidgetSnapshot(JSON.stringify(snapshot))) return false;
  lastSnapshotSignature = signature;
  return true;
}

// MARK: - Hook

export function useAndroidSurfaces(): void {
  const { status, user } = useAuth();
  const { activeTimers, timersReady } = useTimerContext();
  const { tr } = useI18n();
  const authed = status === 'authed';
  const rawId = user?.id;
  const myUserId = rawId === undefined || rawId === null ? undefined : String(rawId);
  const sessionRef = useRef({ authed, myUserId });
  sessionRef.current = { authed, myUserId };
  lastSeenTimers = activeTimers;

  // 0. Власник черги дій (NATIVE CONTRACT): ресивер «Зупинити» штампує ним
  //    дії; вийшли — власника немає, чужа черга геть.
  const ownerId = authed && myUserId ? myUserId : null;
  useEffect(() => {
    if (!isAndroid() || status === 'loading' || !FlowiAndroid.isAvailable()) return;
    FlowiAndroid.setDeviceActionOwner(ownerId);
    if (!ownerId) FlowiAndroid.clearPendingActions();
  }, [status, ownerId]);

  // 1. Знімок віджетів.
  useEffect(() => {
    if (!isAndroid() || status === 'loading' || !FlowiAndroid.isAvailable()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (cancelled) return;
      void writeAndroidWidgetSnapshot(sessionRef.current).catch(e => {
        if (__DEV__) console.warn('[android-surfaces] запис знімка не вдався:', e);
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };
    flush();
    const unsubscribe = subscribeToStorage(key => { if (ANDROID_SNAPSHOT_KEYS.includes(key)) schedule(); });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive' || state === 'active') flush();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
    };
  }, [status, authed, myUserId]);

  // 2. Черга дій поза застосунком.
  useEffect(() => {
    if (!isAndroid() || !ownerId || !FlowiAndroid.isAvailable()) return;
    const drain = () => {
      void drainAndroidPendingActions(ownerId).catch(e => {
        if (__DEV__) console.warn('[android-surfaces] черга не застосована:', e);
      });
    };
    drain();
    const sub = FlowiAndroid.addPendingActionsListener(drain);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') drain();
    });
    return () => {
      sub.remove();
      appState.remove();
    };
  }, [ownerId]);

  // 3. Сповіщення таймера.
  // Кеш останнього показаного стану. undefined — «невідомо»: показати знову.
  // Скидається, коли користувач змахнув сповіщення, і при поверненні в
  // застосунок (міг дати дозвіл на сповіщення / змахнути, поки нас не було).
  const lastNotifRef = useRef<string | null | undefined>(undefined);
  const [notifEpoch, setNotifEpoch] = useState(0);
  useEffect(() => {
    if (!isAndroid() || !FlowiAndroid.isAvailable()) return;
    const dismissed = FlowiAndroid.addTimerNotificationDismissedListener(() => {
      lastNotifRef.current = undefined;
    });
    const appState = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      lastNotifRef.current = undefined;
      setNotifEpoch(n => n + 1);
    });
    return () => {
      dismissed.remove();
      appState.remove();
    };
  }, []);
  const strings: TimerNotifStrings = {
    timerNotifTitle: tr.timerNotifTitle,
    timerNotifStop: tr.timerNotifStop,
    timerNotifChannel: tr.timerNotifChannel,
    timerNotifMore: tr.timerNotifMore,
  };
  const stringsKey = JSON.stringify(strings);
  useEffect(() => {
    if (!isAndroid() || status === 'loading' || !FlowiAndroid.isAvailable()) return;
    // До першого читання сховища «таймерів немає» — неправда: не гасимо
    // сповіщення, яке переживе холодний старт.
    if (!timersReady && authed) return;
    const excluded = excludedTimerIds(FlowiAndroid.readPendingActions(), ownerId, activeTimers);
    const params = authed
      ? timerNotificationFor(activeTimers, JSON.parse(stringsKey) as TimerNotifStrings, excluded)
      : null;
    const signature = params ? JSON.stringify(params) : null;
    if (signature === lastNotifRef.current) return;
    if (params) {
      // Немає дозволу / збій — не кешуємо, щоб показати, щойно стане можна.
      lastNotifRef.current = FlowiAndroid.showTimerNotification(params) ? signature : undefined;
    } else {
      lastNotifRef.current = null;
      FlowiAndroid.clearTimerNotification();
    }
  }, [activeTimers, timersReady, status, authed, ownerId, stringsKey, notifEpoch]);
}
