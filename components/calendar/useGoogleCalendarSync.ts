/**
 * components/calendar/useGoogleCalendarSync.ts — Google Calendar через
 * серверний OAuth (/api/integrations/google/…), спільний з вебом.
 *
 * Замінив клієнтський PKCE-імпорт (useGoogleCalendar.ts): жодних Client ID,
 * токенів Google чи запитів до googleapis на телефоні. Сервер тримає доступ,
 * тягне зміни раз на 15 хв і одразу штовхає правки зустрічей Flowi в Google.
 * Результат приходить звичайним особистим синком (`meetings` + сигнал
 * WebSocket), тож екран просто перечитує сховище; `syncNow` рушія тут лише
 * підстраховує після ручних дій.
 *
 * Помилки показуються текстом каталогу (utils/integrationErrors.ts), сирий
 * «HTTP 400» людина не бачить.
 */
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isOnlineMode } from '@/store/app-mode';
import { ApiError, apiFetch } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { useSync } from '@/store/sync-engine';
import {
  canAutoSync, GCAL_RETURN_URL, parseGcalReturn, selectionFromCalendars,
  type GcalCalendar, type GcalCalendarsResponse, type GcalConflict, type GcalSelection, type GcalStatus,
} from '@/utils/googleCalendar';
import { integrationCodeMessage, integrationErrorMessage } from '@/utils/integrationErrors';

const PULL_AFTER_MS = 4000;

export interface GoogleCalendarSync {
  status: GcalStatus | null;
  loaded: boolean;
  /** Назва дії, що виконується ('' — нічого). */
  busy: string;
  /** Тихий синк при відкритті календаря. */
  syncing: boolean;
  error: string;
  notice: string;
  calendars: GcalCalendar[] | null;
  selection: GcalSelection;
  savedSelection: GcalSelection;
  setSelection: (next: GcalSelection) => void;
  conflicts: GcalConflict[] | null;
  refresh: () => Promise<GcalStatus | null>;
  /** Статус + тихий `sync` (на фокусі екрана календаря). */
  syncOnOpen: () => void;
  connect: () => Promise<void>;
  loadCalendars: () => Promise<void>;
  closeCalendars: () => void;
  saveCalendars: () => Promise<void>;
  syncNow: () => Promise<void>;
  loadConflicts: () => Promise<void>;
  closeConflicts: () => void;
  resolve: (conflict: GcalConflict, choice: 'local' | 'remote') => Promise<void>;
  /** Відновити зустріч із кошика через сервер (зустріч пов'язана з Google). */
  restore: (meetingId: string) => Promise<void>;
  disconnect: () => Promise<void>;
  clearMessages: () => void;
}

export function useGoogleCalendarSync(): GoogleCalendarSync {
  const { tr } = useI18n();
  const { syncNow: pullNow } = useSync();
  const [status, setStatus] = useState<GcalStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [calendars, setCalendars] = useState<GcalCalendar[] | null>(null);
  const [selection, setSelection] = useState<GcalSelection>({ import: [], export: null });
  const [savedSelection, setSavedSelection] = useState<GcalSelection>({ import: [], export: null });
  const [conflicts, setConflicts] = useState<GcalConflict[] | null>(null);
  const mounted = useRef(true);
  const pullTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSyncInFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pullTimer.current) clearTimeout(pullTimer.current);
    };
  }, []);

  const schedulePull = useCallback(() => {
    void pullNow().catch(() => {});
    if (pullTimer.current) clearTimeout(pullTimer.current);
    pullTimer.current = setTimeout(() => { void pullNow().catch(() => {}); }, PULL_AFTER_MS);
  }, [pullNow]);

  const run = useCallback(async (name: string, action: () => Promise<void>) => {
    setBusy(name); setError(''); setNotice('');
    try { await action(); } catch (e) {
      if (mounted.current) setError(integrationErrorMessage(e, tr, 'google'));
    } finally { if (mounted.current) setBusy(''); }
  }, [tr]);

  const refresh = useCallback(async (): Promise<GcalStatus | null> => {
    if (!isOnlineMode()) { setLoaded(true); return null; }
    try {
      const next = await apiFetch<GcalStatus>('/integrations/google/');
      // Захист від неочікуваної форми (старий сервер): без `connection` — не підключено.
      const safe: GcalStatus = { configured: !!next?.configured, connected: !!next?.connected, connection: next?.connection ?? null };
      if (mounted.current) setStatus(safe);
      return safe;
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }, []);

  const syncOnOpen = useCallback(() => {
    if (!isOnlineMode() || openSyncInFlight.current) return;
    openSyncInFlight.current = true;
    void (async () => {
      try {
        const s = await refresh();
        if (!canAutoSync(s)) return;
        if (mounted.current) setSyncing(true);
        const res = await apiFetch<{ state: string }>('/integrations/google/sync/', { method: 'POST', body: {} });
        if (res?.state === 'queued') schedulePull();
      } catch (e) {
        if (__DEV__) console.warn('[gcal] sync on open:', e);
      } finally {
        openSyncInFlight.current = false;
        if (mounted.current) setSyncing(false);
      }
    })();
  }, [refresh, schedulePull]);

  const loadCalendars = useCallback(() => run('calendars', async () => {
    const res = await apiFetch<GcalCalendarsResponse>('/integrations/google/calendars/');
    setCalendars(res.calendars ?? []);
    setSelection(selectionFromCalendars({ calendars: res.calendars ?? [], export_calendar: res.export_calendar, import_calendars: res.import_calendars ?? [] }));
    setSavedSelection({ import: res.import_calendars ?? [], export: res.export_calendar ?? null });
  }), [run]);

  const connect = useCallback(() => run('connect', async () => {
    if (!isOnlineMode()) { setError(tr.gcalOfflineBody); return; }
    const { url } = await apiFetch<{ url: string }>('/integrations/google/connect/', {
      method: 'POST', body: { return_to: GCAL_RETURN_URL },
    });
    const result = await WebBrowser.openAuthSessionAsync(url, GCAL_RETURN_URL);
    const back = result.type === 'success' ? parseGcalReturn(result.url) : null;
    // Android інколи віддає «dismiss», хоча вхід завершено: статус читаємо завжди.
    const s = await refresh();
    if (!mounted.current) return;
    if (back?.result === 'error') { setError(integrationCodeMessage(back.code || 'generic', tr, 'google')); return; }
    if (back?.result === 'cancelled') { setNotice(tr.gcalCancelledNotice); return; }
    if (s?.connection && (back?.result === 'connected' || s.connected)) {
      if (s.connection.needs_setup) {
        const res = await apiFetch<GcalCalendarsResponse>('/integrations/google/calendars/');
        setCalendars(res.calendars ?? []);
        setSelection(selectionFromCalendars({ calendars: res.calendars ?? [], export_calendar: res.export_calendar, import_calendars: res.import_calendars ?? [] }));
        setSavedSelection({ import: res.import_calendars ?? [], export: res.export_calendar ?? null });
      } else {
        schedulePull();
      }
      if (back?.result === 'connected') setNotice(tr.gcalConnectedNotice);
    }
  }), [run, refresh, schedulePull, tr]);

  const saveCalendars = useCallback(() => run('save', async () => {
    const next = await apiFetch<GcalStatus>('/integrations/google/calendars/', {
      method: 'PUT', body: { import: selection.import, export: selection.export },
    });
    setStatus(next);
    setCalendars(null);
    setNotice(tr.gcalSavedCalendars);
    schedulePull();
  }), [run, selection, schedulePull, tr]);

  const syncNow = useCallback(() => run('sync', async () => {
    const res = await apiFetch<{ state: string }>('/integrations/google/sync/', { method: 'POST', body: { force: true } });
    setNotice(res?.state === 'fresh' ? tr.gcalSyncFresh : tr.gcalSyncQueued);
    schedulePull();
    await refresh().catch(() => null);
  }), [run, schedulePull, refresh, tr]);

  const loadConflicts = useCallback(() => run('conflicts', async () => {
    const res = await apiFetch<{ conflicts: GcalConflict[] }>('/integrations/google/conflicts/');
    setConflicts(res.conflicts ?? []);
  }), [run]);

  const resolve = useCallback(async (conflict: GcalConflict, choice: 'local' | 'remote') => {
    setBusy(`resolve:${conflict.id}`); setError(''); setNotice('');
    try {
      await apiFetch(`/integrations/google/conflicts/${encodeURIComponent(conflict.id)}/resolve/`, { method: 'POST', body: { choice } });
      if (!mounted.current) return;
      setConflicts(list => (list ?? []).filter(c => c.id !== conflict.id));
      schedulePull();
      await refresh().catch(() => null);
    } catch (e) {
      if (!mounted.current) return;
      // 409 conflict_changed: Google змінив подію ще раз — показуємо нову версію.
      const details = e instanceof ApiError ? (e as ApiError & { details?: unknown }).details as { conflict?: GcalConflict } | undefined : undefined;
      const fresh = e instanceof ApiError && e.status === 409 ? details?.conflict : undefined;
      if (fresh) setConflicts(list => (list ?? []).map(c => (c.id === conflict.id ? fresh : c)));
      else if (e instanceof ApiError && e.status === 404) setConflicts(list => (list ?? []).filter(c => c.id !== conflict.id));
      setError(integrationErrorMessage(e, tr, 'google'));
    } finally {
      if (mounted.current) setBusy('');
    }
  }, [refresh, schedulePull, tr]);

  const restore = useCallback((meetingId: string) => run(`restore:${meetingId}`, async () => {
    await apiFetch(`/integrations/google/meetings/${encodeURIComponent(meetingId)}/restore/`, { method: 'POST' });
    setNotice(tr.gcalRestored);
    schedulePull();
  }), [run, schedulePull, tr]);

  const disconnect = useCallback(() => run('disconnect', async () => {
    await apiFetch('/integrations/google/', { method: 'DELETE' });
    setCalendars(null); setConflicts(null);
    await refresh();
    setNotice(tr.gcalDisconnectedNotice);
  }), [run, refresh, tr]);

  return {
    status, loaded, busy, syncing, error, notice, calendars, selection, savedSelection, setSelection, conflicts,
    refresh, syncOnOpen, connect, loadCalendars, closeCalendars: useCallback(() => setCalendars(null), []), saveCalendars,
    syncNow, loadConflicts, closeConflicts: useCallback(() => setConflicts(null), []), resolve, restore, disconnect,
    clearMessages: useCallback(() => { setError(''); setNotice(''); }, []),
  };
}
