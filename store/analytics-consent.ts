/**
 * store/analytics-consent.ts — «Ділитися анонімною статистикою» (rc1,
 * docs/release-rc1/analytics.md §4).
 *
 * Згода живе полем `shareAnonymousStats` у синхронізованому singleton
 * 'ui_preferences' (store/ui-preferences.ts) — тож вимикач спільний для
 * застосунку й вебу, а сервер (analytics/emit.py::consent_given) читає його
 * з того самого запису і НЕ пише подій користувача, що відмовився.
 *
 * Дефолт — увімкнено: поле відсутнє (легасі-запис, свіжий акаунт) = згода.
 * Невідомі поля ui_preferences зберігаються (parseUiPreferences копіює raw).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { loadData, subscribeToStorage } from './storage';
import { saveSyncedValue } from './synced-storage';
import {
  UI_PREFERENCES_KEY,
  UI_PREFERENCES_VERSION,
  parseUiPreferences,
  type StoredUiPreferences,
} from './ui-preferences';

export const SHARE_STATS_FIELD = 'shareAnonymousStats';

export function isStatsSharingEnabled(prefs: StoredUiPreferences): boolean {
  return prefs[SHARE_STATS_FIELD] !== false;
}

export function withStatsSharing(
  current: StoredUiPreferences,
  enabled: boolean,
  now: Date = new Date(),
): StoredUiPreferences {
  return {
    ...current,
    version: UI_PREFERENCES_VERSION,
    [SHARE_STATS_FIELD]: enabled,
    updatedAt: now.toISOString(),
  };
}

export function useStatsSharing(): { enabled: boolean; ready: boolean; setEnabled: (v: boolean) => void } {
  const [enabled, setEnabledState] = useState(true);
  const [ready, setReady] = useState(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    const read = async () => {
      try {
        const prefs = parseUiPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null));
        if (!alive) return;
        setEnabledState(isStatsSharingEnabled(prefs));
        setReady(true);
      } catch (e) {
        if (__DEV__) console.warn('[analytics-consent] не прочиталось:', e);
      }
    };
    void read();
    const off = subscribeToStorage(key => { if (key === UI_PREFERENCES_KEY) void read(); });
    return () => { alive = false; off(); };
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    // Read-modify-write від ЗБЕРЕЖЕНОГО стану: вибір модулів, що приїхав
    // синком секунду тому, не затирається.
    queue.current = queue.current
      .then(async () => {
        const current = parseUiPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null));
        await saveSyncedValue(UI_PREFERENCES_KEY, withStatsSharing(current, value));
      })
      .catch(e => { if (__DEV__) console.warn('[analytics-consent] не збереглось:', e); });
  }, []);

  return { enabled, ready, setEnabled };
}
