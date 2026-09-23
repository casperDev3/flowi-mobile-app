/**
 * React-хуки над станом центру сповіщень (`api/notifications.ts`).
 *
 * Стан живе поза React — у модулі, — тож бейдж у таб-барі, екран інбоксу й
 * екран налаштувань бачать ОДИН і той самий інбокс без контексту-провайдера.
 * Хуки лише підписуються на нього і тримають живим «життєвий цикл»:
 * повернення застосунку з фону й перемикання онлайн-режиму підтягують
 * лічильник, поки змонтований хоч один споживач.
 */
import { useEffect, useMemo, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  type InboxState,
  type PreferencesState,
  getInboxState,
  getPreferencesState,
  hydrateNotificationCenter,
  refreshPreferences,
  refreshUnreadCount,
  subscribeInbox,
  subscribePreferences,
  visibleInboxItems,
  visibleUnreadCount,
} from '@/api/notifications';
import { subscribeOnlineMode } from '@/store/app-mode';
import { useUiModules } from '@/store/ui-preferences';

// ─── Життєвий цикл (один на процес, скільки б споживачів не було) ─────────────

const FOREGROUND_THROTTLE_MS = 30_000;
let consumers = 0;
let detach: (() => void) | null = null;
let lastForegroundRefresh = 0;

function attachLifecycle(): void {
  let appState: AppStateStatus = AppState.currentState;
  const appSub = AppState.addEventListener('change', next => {
    const cameBack = appState !== 'active' && next === 'active';
    appState = next;
    if (!cameBack) return;
    const now = Date.now();
    if (now - lastForegroundRefresh < FOREGROUND_THROTTLE_MS) return;
    lastForegroundRefresh = now;
    void refreshUnreadCount();
  });
  const offOnline = subscribeOnlineMode(online => {
    if (online) void refreshUnreadCount();
  });
  detach = () => {
    appSub.remove();
    offOnline();
  };
}

function retainLifecycle(): () => void {
  consumers += 1;
  if (consumers === 1) {
    attachLifecycle();
    lastForegroundRefresh = Date.now();
    void refreshUnreadCount();
  }
  return () => {
    consumers -= 1;
    if (consumers === 0 && detach) {
      detach();
      detach = null;
    }
  };
}

// ─── Хуки ───────────────────────────────────────────────────────────────────

/** Сирий стан інбоксу (усі записи кешу, без фільтра модулів). */
export function useInboxState(): InboxState {
  const [state, setState] = useState<InboxState>(getInboxState);
  useEffect(() => {
    const off = subscribeInbox(setState);
    // Між першим рендером і підпискою стан міг змінитись.
    setState(getInboxState());
    void hydrateNotificationCenter();
    const release = retainLifecycle();
    return () => {
      off();
      release();
    };
  }, []);
  return state;
}

/** Інбокс, як його бачить людина: без подій вимкнених модулів. */
export function useNotificationInbox(): InboxState & { visibleItems: InboxState['items']; hiddenByModules: boolean } {
  const state = useInboxState();
  const { disabledModules } = useUiModules();
  return useMemo(() => {
    const visibleItems = visibleInboxItems(state.items, disabledModules);
    return { ...state, visibleItems, hiddenByModules: visibleItems.length !== state.items.length };
  }, [state, disabledModules]);
}

/** Число на бейджі: непрочитані без подій вимкнених модулів. */
export function useUnreadNotificationsCount(): number {
  const state = useInboxState();
  const { disabledModules } = useUiModules();
  return useMemo(
    () => visibleUnreadCount(state.serverUnread, state.items, disabledModules),
    [state.serverUnread, state.items, disabledModules],
  );
}

export function useNotificationPreferences(): PreferencesState {
  const [state, setState] = useState<PreferencesState>(getPreferencesState);
  useEffect(() => {
    const off = subscribePreferences(setState);
    setState(getPreferencesState());
    void refreshPreferences();
    return off;
  }, []);
  return state;
}
