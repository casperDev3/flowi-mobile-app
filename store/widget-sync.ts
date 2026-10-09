/**
 * store/widget-sync.ts — запис знімка для iOS-віджета в App Group.
 *
 * Знімок рахує utils/widgetSnapshot.ts; тут лише «коли» і «куди»:
 *   • на старті і щоразу, коли змінився один із ключів, з яких знімок
 *     складається (синк, екрани, таймер) — з дебаунсом, бо синк пише пачками;
 *   • миттєво при переході застосунку у фон (останнє, що побачить віджет);
 *   • при поверненні з фону (могла змінитись доба).
 * Після запису — WidgetCenter.reloadAllTimelines (ExtensionStorage.reloadWidget).
 *
 * Android і веб — no-op: нативний модуль @bacons/apple-targets існує лише на
 * iOS, і навіть `require` пакета там не виконується.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/store/auth';
import { loadData, subscribeToStorage } from '@/store/storage';
import {
  WIDGET_APP_GROUP,
  WIDGET_SNAPSHOT_KEY,
  buildWidgetSnapshot,
  widgetRoleMap,
  widgetSnapshotSignature,
} from '@/utils/widgetSnapshot';

/** Ключі сховища, від яких залежить знімок. */
export const WIDGET_SOURCE_KEYS = [
  'tasks',
  'task_statuses',
  'transactions',
  'accounts',
  'finance_currencies',
  'finance_primary_currency',
  'time_entries',
  'active_timers',
  'health_entries_v2',
  'project_sync_state_v1',
  'workspace_projects',
  'lang_option_v1',
] as const;

const DEBOUNCE_MS = 1500;

interface WidgetBridge {
  write(json: string): void;
  reload(): void;
}

let bridge: WidgetBridge | null | undefined;

/** Нативний міст — лише iOS; будь-яка помилка завантаження = «віджета нема». */
function widgetBridge(): WidgetBridge | null {
  if (bridge !== undefined) return bridge;
  bridge = null;
  if (Platform.OS !== 'ios') return bridge;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ExtensionStorage } = require('@bacons/apple-targets') as typeof import('@bacons/apple-targets');
    const storage = new ExtensionStorage(WIDGET_APP_GROUP);
    bridge = {
      write: json => storage.set(WIDGET_SNAPSHOT_KEY, json),
      reload: () => ExtensionStorage.reloadWidget(),
    };
  } catch (e) {
    if (__DEV__) console.warn('[widget] ExtensionStorage недоступний:', e);
  }
  return bridge;
}

/** Для тестів: підмінити міст (null — вимкнути). */
export function __setWidgetBridgeForTests(next: WidgetBridge | null | undefined): void {
  bridge = next;
  lastSignature = null;
}

let lastSignature: string | null = null;

/**
 * Перерахувати знімок і, якщо він змінився, записати й перезавантажити віджет.
 * Повертає true, коли запис відбувся.
 */
export async function writeWidgetSnapshot(session: {
  authed: boolean;
  myUserId?: string | null;
}, now: Date = new Date()): Promise<boolean> {
  const target = widgetBridge();
  if (!target) return false;
  const [
    tasks, taskStatuses, transactions, accounts, currencies, primaryCurrency,
    timeEntries, activeTimers, healthEntries, syncState, summaries, lang,
  ] = await Promise.all([
    loadData<unknown>('tasks', []),
    loadData<unknown>('task_statuses', []),
    loadData<unknown>('transactions', []),
    loadData<unknown>('accounts', []),
    loadData<unknown>('finance_currencies', []),
    loadData<unknown>('finance_primary_currency', 'UAH'),
    loadData<unknown>('time_entries', []),
    loadData<unknown>('active_timers', []),
    loadData<unknown>('health_entries_v2', []),
    loadData<unknown>('project_sync_state_v1', {}),
    loadData<unknown>('workspace_projects', []),
    loadData<unknown>('lang_option_v1', 'uk'),
  ]);
  const snapshot = buildWidgetSnapshot({
    now,
    lang,
    authed: session.authed,
    myUserId: session.myUserId,
    projectRoles: widgetRoleMap(syncState, summaries),
    tasks, taskStatuses, transactions, accounts, currencies, primaryCurrency,
    timeEntries, activeTimers, healthEntries,
  });
  const signature = widgetSnapshotSignature(snapshot);
  if (signature === lastSignature) return false;
  target.write(JSON.stringify(snapshot));
  target.reload();
  lastSignature = signature;
  return true;
}

/**
 * Монтується один раз у корені (app/_layout.tsx). Нічого не рендерить.
 */
export function useWidgetSnapshotWriter(): void {
  const { status, user } = useAuth();
  const authed = status === 'authed';
  const rawId = user?.id;
  const myUserId = rawId === undefined || rawId === null ? undefined : String(rawId);
  const sessionRef = useRef({ authed, myUserId });
  sessionRef.current = { authed, myUserId };

  useEffect(() => {
    if (Platform.OS !== 'ios' || status === 'loading') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (cancelled) return;
      void writeWidgetSnapshot(sessionRef.current).catch(e => {
        if (__DEV__) console.warn('[widget] запис знімка не вдався:', e);
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    };
    flush();
    const keys: readonly string[] = WIDGET_SOURCE_KEYS;
    const unsubscribe = subscribeToStorage(key => { if (keys.includes(key)) schedule(); });
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
}
