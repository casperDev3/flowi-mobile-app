/**
 * store/sync-engine.ts — серверна синхронізація Flowi.
 *
 * Схема:
 *  - Outbox 'sync_outbox': записи, що очікують push на сервер.
 *  - 'last_server_sync_at' (ms): позначка останнього успішного серверного синку.
 *    НЕ плутати з 'last_sync_timestamp' (P2P).
 *  - syncNow():
 *      1. Гейт: isOnlineMode() && _isAuthed
 *      2. Push: читає outbox, збирає свіжі дані, надсилає чанками по 500.
 *      3. Pull: застосовує items з відповіді (dirty-wins).
 *      4. Конфлікти → appendConflicts().
 *      5. next_cursor → наступна сторінка pull.
 *  - Перший синк (last_server_sync_at === 0): генерує повний outbox з усіх колекцій.
 *  - Тригери: AppState→active; setInterval 5 хв; debounce 5 с після markDirty.
 *  - SyncProvider — підключається в app/_layout.tsx всередині AuthProvider.
 */

import { AppState, AppStateStatus } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { apiFetch, OfflineError } from './api';
import { isOnlineMode } from './app-mode';
import { loadData, saveData } from './storage';
import { appendConflicts } from './sync-conflicts';
import {
  OUTBOX_KEY,
  SYNC_ARRAY_KEYS,
  SYNC_SINGLETON_KEYS,
  Tombstones,
  OutboxItem,
  applyPullItems,
  deduplicateOutbox,
  loadOutbox,
  loadTombstones,
  removeFromOutbox,
  setSyncScheduler,
} from './synced-storage';

// ─── Типи ─────────────────────────────────────────────────────────────────────

interface SyncPushItem {
  collection: string;
  local_id: string;
  data: unknown;
  deleted: boolean;
  client_updated_at: string;
  force?: boolean;
}

interface SyncResponseItem {
  collection: string;
  local_id: string;
  data: any;
  deleted: boolean;
  client_updated_at: string;
  updated_at: string;
}

interface SyncConflictServer {
  collection: string;
  local_id: string;
  server: { data: any; deleted: boolean; [key: string]: any };
  client: { data: any; [key: string]: any };
}

interface SyncResponse {
  server_time: number;
  items: SyncResponseItem[];
  conflicts: SyncConflictServer[];
  next_cursor: number | null;
  applied: number;
}

// ─── Модульний стан auth ──────────────────────────────────────────────────────

let _isAuthed = false;

export function setIsAuthed(v: boolean): void {
  _isAuthed = v;
  if (!v) {
    // Вийшли з акаунта — скасовуємо автоматичні повторні спроби
    clearRetryTimer();
    _retryAttempt = 0;
  }
}

// ─── Ключ останнього серверного синку ─────────────────────────────────────────

const LAST_SERVER_SYNC_KEY = 'last_server_sync_at';

async function getLastServerSync(): Promise<number> {
  return loadData<number>(LAST_SERVER_SYNC_KEY, 0);
}

async function setLastServerSync(t: number): Promise<void> {
  await saveData(LAST_SERVER_SYNC_KEY, t);
}

// ─── Auto-retry backoff при помилці синхронізації ────────────────────────────

/** Затримки повторних спроб: 30с → 2хв → 5хв (cap) */
const RETRY_DELAYS = [30_000, 2 * 60_000, 5 * 60_000] as const;

let _retryAttempt = 0;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetryTimer(): void {
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

function scheduleRetry(): void {
  clearRetryTimer();
  const delay = RETRY_DELAYS[Math.min(_retryAttempt, RETRY_DELAYS.length - 1)];
  _retryAttempt++;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    void doSync();
  }, delay);
  if (__DEV__) console.log(`[sync-engine] retry scheduled in ${delay / 1000}s (attempt ${_retryAttempt})`);
}

// ─── Debounce sync ────────────────────────────────────────────────────────────

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSync(debounceMs = 5000): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    void doSync();
  }, debounceMs);
}

// ─── React context ────────────────────────────────────────────────────────────

type SyncState = 'idle' | 'syncing' | 'error';

interface SyncCtx {
  state: SyncState;
  lastSyncAt: number | null;
  pendingCount: number;
  conflictsCount: number;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncCtx>({
  state: 'idle',
  lastSyncAt: null,
  pendingCount: 0,
  conflictsCount: 0,
  syncNow: async () => {},
});

// Оновлення React-стану ззовні (для doSync)
let _setState: ((s: SyncState) => void) | null = null;
let _setLastSyncAt: ((t: number) => void) | null = null;
let _setPendingCount: ((n: number) => void) | null = null;
let _setConflictsCount: ((n: number) => void) | null = null;

function updateSyncState(s: SyncState): void {
  _setState?.(s);
}

function updateLastSyncAt(t: number): void {
  _setLastSyncAt?.(t);
}

function updatePendingCount(n: number): void {
  _setPendingCount?.(n);
}

function updateConflictsCount(n: number): void {
  _setConflictsCount?.(n);
}

// ─── Збір свіжих даних для push ──────────────────────────────────────────────

async function buildPushItem(
  outboxItem: OutboxItem,
  tombstones: Tombstones,
): Promise<SyncPushItem | null> {
  const { collection, local_id, deleted, force } = outboxItem;

  const isSingleton = (SYNC_SINGLETON_KEYS as readonly string[]).includes(collection);

  let data: unknown;
  let client_updated_at: string;

  if (deleted) {
    // Дані для видаленого — лише {id}
    data = { id: local_id };
    const tombAt = tombstones[collection]?.[local_id];
    client_updated_at = tombAt ?? new Date().toISOString();
  } else if (isSingleton) {
    // Singleton — читаємо поточне значення
    const val = await loadData<unknown>(collection, null);
    data = { value: val };
    client_updated_at = new Date().toISOString();
  } else {
    // Масив — знаходимо елемент за id
    const arr = await loadData<{ id: string; updatedAt?: string; createdAt?: string }[]>(
      collection,
      [],
    );
    const item = arr.find(i => i.id === local_id);
    if (!item) return null; // вже видалено без тумбстоуна — пропускаємо
    data = item;
    client_updated_at =
      item.updatedAt ?? item.createdAt ?? new Date().toISOString();
  }

  return {
    collection,
    local_id,
    data,
    deleted,
    client_updated_at,
    ...(force ? { force: true } : {}),
  };
}

// ─── Генерація повного outbox (перший синк) ───────────────────────────────────

async function generateFullOutbox(): Promise<void> {
  const now = Date.now();
  const items: OutboxItem[] = [];

  for (const key of SYNC_ARRAY_KEYS) {
    const arr = await loadData<{ id: string }[]>(key, []);
    for (const item of arr) {
      items.push({ collection: key, local_id: item.id, deleted: false, queued_at: now });
    }
  }

  for (const key of SYNC_SINGLETON_KEYS) {
    items.push({ collection: key, local_id: key, deleted: false, queued_at: now });
  }

  if (items.length > 0) {
    // Перезаписуємо весь outbox (повний синк)
    await saveData(OUTBOX_KEY, deduplicateOutbox(items));
  }
}

// ─── Основна логіка syncNow ──────────────────────────────────────────────────

let _syncing = false;

async function doSync(): Promise<void> {
  if (!isOnlineMode() || !_isAuthed) return;
  if (_syncing) return;
  _syncing = true;
  updateSyncState('syncing');

  try {
    const lastSyncAt = await getLastServerSync();

    // Перший синк — генеруємо повний outbox
    if (lastSyncAt === 0) {
      await generateFullOutbox();
    }

    const tombstones = await loadTombstones();

    // ── Push ──────────────────────────────────────────────────────────────────
    const outbox = await loadOutbox();
    updatePendingCount(outbox.length);

    const CHUNK_SIZE = 500;
    const applied: Set<string> = new Set();
    const conflictsFromServer: SyncConflictServer[] = [];
    let pullCursor = lastSyncAt;

    // Збираємо push-items
    const pushItems: SyncPushItem[] = [];
    for (const item of outbox) {
      const pi = await buildPushItem(item, tombstones);
      if (pi) pushItems.push(pi);
    }

    // Чанкуємо по 500
    for (let i = 0; i < Math.max(1, Math.ceil(pushItems.length / CHUNK_SIZE)); i++) {
      const chunk = pushItems.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const since = i === 0 ? lastSyncAt : pullCursor;

      const res = await apiFetch<SyncResponse>('/sync/user/', {
        method: 'POST',
        body: { since, items: chunk },
      });

      pullCursor = res.server_time;

      // Обробляємо успішно застосовані
      for (const item of chunk) {
        applied.add(`${item.collection}:${item.local_id}`);
      }

      // Конфлікти — прибираємо з outbox, зберігаємо для обробки
      for (const conflict of res.conflicts) {
        applied.add(`${conflict.collection}:${conflict.local_id}`);
        conflictsFromServer.push(conflict);
      }

      // Pull — обробляємо відразу
      await applyPullResponse(res.items, outbox);

      // Пагінація pull
      let cursor = res.next_cursor;
      while (cursor !== null) {
        const pullRes = await apiFetch<SyncResponse>('/sync/user/', {
          method: 'POST',
          body: { since: cursor, items: [] },
        });
        await applyPullResponse(pullRes.items, outbox);
        cursor = pullRes.next_cursor;
        pullCursor = pullRes.server_time;
      }
    }

    // Прибираємо успішно надіслані з outbox
    if (applied.size > 0) {
      await removeFromOutbox(applied);
      updatePendingCount((await loadOutbox()).length);
    }

    // Конфлікти → appendConflicts (формат sync-conflicts.ts)
    if (conflictsFromServer.length > 0) {
      const formatted = conflictsFromServer.map(c => ({
        id: `${c.collection}:${c.local_id}`,
        dataKey: c.collection,
        local: c.client.data,
        remote: c.server.data,
      }));
      await appendConflicts(formatted);
    }

    // Оновлюємо позначку часу
    await setLastServerSync(pullCursor);
    updateLastSyncAt(pullCursor);

    // Оновлюємо лічильник конфліктів
    const { loadConflicts } = await import('./sync-conflicts');
    const allConflicts = await loadConflicts();
    updateConflictsCount(allConflicts.length);

    clearRetryTimer();
    _retryAttempt = 0;
    updateSyncState('idle');
  } catch (e) {
    if (e instanceof OfflineError) {
      // Тихо переходимо в idle — пристрій офлайн, retry не плануємо
      clearRetryTimer();
      updateSyncState('idle');
    } else {
      if (__DEV__) console.warn('[sync-engine] syncNow error:', e);
      updateSyncState('error');
      scheduleRetry();
    }
  } finally {
    _syncing = false;
  }
}

// ─── Застосування pull-відповіді ──────────────────────────────────────────────

async function applyPullResponse(
  serverItems: SyncResponseItem[],
  currentOutbox: OutboxItem[],
): Promise<void> {
  if (!serverItems.length) return;

  // Набір dirty ключів (локально змінено — dirty-wins)
  const dirtySet = new Set(currentOutbox.map(i => `${i.collection}:${i.local_id}`));

  // Групуємо items за колекцією
  const byCollection = new Map<string, SyncResponseItem[]>();
  for (const si of serverItems) {
    const list = byCollection.get(si.collection) ?? [];
    list.push(si);
    byCollection.set(si.collection, list);
  }

  for (const [collection, items] of byCollection) {
    const isSingleton = (SYNC_SINGLETON_KEYS as readonly string[]).includes(collection);

    if (isSingleton) {
      // Singleton — skip if dirty
      const fullKey = `${collection}:${collection}`;
      if (dirtySet.has(fullKey)) continue;
      const serverItem = items[items.length - 1]; // остання версія
      if (!serverItem.deleted && serverItem.data?.value !== undefined) {
        await saveData(collection, serverItem.data.value);
      }
      continue;
    }

    // Масив — upsert/delete за id
    if (!(SYNC_ARRAY_KEYS as readonly string[]).includes(collection)) continue;

    const local = await loadData<{ id: string }[]>(collection, []);
    const updated = applyPullItems(local, items, dirtySet, collection);
    // Зберігаємо через saveData (НЕ saveSynced — уникаємо петлі!)
    await saveData(collection, updated);
  }
}

// ─── Публічна функція syncNow ─────────────────────────────────────────────────

export async function syncNow(): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  // Ручний тригер — скидаємо backoff
  clearRetryTimer();
  _retryAttempt = 0;
  await doSync();
}

/** Викликається з auth.tsx після login/register для повного синку. */
export async function triggerFullSync(): Promise<void> {
  await setLastServerSync(0); // скидаємо позначку → повний outbox
  scheduleSync(500); // коротший debounce
}

// ─── SyncProvider ─────────────────────────────────────────────────────────────

export function SyncProvider({ children, isAuthed }: { children: React.ReactNode; isAuthed: boolean }) {
  const [state, setState] = useState<SyncState>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);

  // Прив'язуємо модульні сеттери до React-стану
  useEffect(() => {
    _setState = setState;
    _setLastSyncAt = setLastSyncAt;
    _setPendingCount = setPendingCount;
    _setConflictsCount = setConflictsCount;
    return () => {
      _setState = null;
      _setLastSyncAt = null;
      _setPendingCount = null;
      _setConflictsCount = null;
    };
  }, []);

  // Синхронізуємо auth-стан у модульну змінну + очищуємо retry при деавторизації
  useEffect(() => {
    setIsAuthed(isAuthed);
  }, [isAuthed]);

  // Очищуємо retry-таймер при unmount
  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, []);

  // Реєструємо scheduleSync у synced-storage
  useEffect(() => {
    setSyncScheduler(scheduleSync);
    return () => setSyncScheduler(() => {});
  }, []);

  // Ініціалізація: завантажуємо початкові значення
  useEffect(() => {
    async function init() {
      const t = await getLastServerSync();
      if (t > 0) setLastSyncAt(t);
      const outbox = await loadOutbox();
      setPendingCount(outbox.length);
      const { loadConflicts } = await import('./sync-conflicts');
      const conflicts = await loadConflicts();
      setConflictsCount(conflicts.length);
    }
    void init();
  }, []);

  // AppState → active
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') {
        void doSync();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // Інтервал 5 хв
  useEffect(() => {
    const id = setInterval(() => void doSync(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const syncNowCallback = useCallback(async () => {
    await syncNow();
  }, []);

  return (
    <Ctx.Provider value={{ state, lastSyncAt, pendingCount, conflictsCount, syncNow: syncNowCallback }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSync(): SyncCtx {
  return useContext(Ctx);
}
