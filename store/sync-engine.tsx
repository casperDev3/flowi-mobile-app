/** Revision-based server synchronization for Flowi mobile. */

import { AppState, AppStateStatus } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { apiFetch, OfflineError } from './api';
import { isOnlineMode } from './app-mode';
import { loadData, saveData } from './storage';
import { appendConflicts } from './sync-conflicts';
import { assertCompatibleSyncContract } from './sync-contract';
import {
  SYNC_ARRAY_KEYS,
  SYNC_SINGLETON_KEYS,
  OutboxItem,
  applyPullItems,
  createMutationId,
  deduplicateOutbox,
  loadOutbox,
  removeMutationsFromOutbox,
  saveOutbox,
  setSyncScheduler,
} from './synced-storage';

interface SyncMutation {
  mutation_id: string;
  collection: string;
  local_id: string;
  operation: 'upsert' | 'delete';
  data: Record<string, unknown>;
  base_revision: number | null;
  force?: boolean;
}

interface SyncResponseItem {
  collection: string;
  local_id: string;
  data: any;
  deleted: boolean;
  client_updated_at: string | null;
  updated_at: number;
  revision: number;
  change_seq: number;
}

interface SyncAcknowledgement {
  status: 'applied';
  mutation_id: string;
  collection: string;
  local_id: string;
  revision: number;
  change_seq: number;
}

interface SyncConflictServer {
  status: 'conflict';
  mutation_id: string;
  collection: string;
  local_id: string;
  server: SyncResponseItem | null;
  client: { data: any; deleted: boolean; base_revision: number | null };
}

interface SyncResponse {
  contract_version?: number;
  protocol_version: 2;
  cursor: number;
  changes: SyncResponseItem[];
  acknowledged: SyncAcknowledgement[];
  conflicts: SyncConflictServer[];
  next_cursor: number | null;
}

export type SyncRevisionMap = Record<string, number>;

const SERVER_CURSOR_KEY = 'server_change_cursor_v2';
const SERVER_REVISIONS_KEY = 'server_record_revisions_v2';
const LAST_SYNC_AT_KEY = 'last_server_sync_completed_at';

export const syncRecordKey = (collection: string, localId: string): string =>
  `${collection}:${localId}`;

export function applyRevisionUpdates(
  current: SyncRevisionMap,
  changes: Pick<SyncResponseItem, 'collection' | 'local_id' | 'revision'>[],
  acknowledgements: Pick<SyncAcknowledgement, 'collection' | 'local_id' | 'revision'>[] = [],
): SyncRevisionMap {
  const next = { ...current };
  for (const item of [...changes, ...acknowledgements]) {
    next[syncRecordKey(item.collection, item.local_id)] = item.revision;
  }
  return next;
}

async function getServerCursor(): Promise<number> {
  return loadData<number>(SERVER_CURSOR_KEY, 0);
}

async function setServerCursor(cursor: number): Promise<void> {
  await saveData(SERVER_CURSOR_KEY, cursor);
}

async function getRevisionMap(): Promise<SyncRevisionMap> {
  return loadData<SyncRevisionMap>(SERVER_REVISIONS_KEY, {});
}

async function setRevisionMap(revisions: SyncRevisionMap): Promise<void> {
  await saveData(SERVER_REVISIONS_KEY, revisions);
}

let _isAuthed = false;

export function setIsAuthed(value: boolean): void {
  _isAuthed = value;
  if (!value) {
    clearRetryTimer();
    _retryAttempt = 0;
  }
}

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
  if (__DEV__) console.log(`[sync-engine] retry in ${delay / 1000}s (attempt ${_retryAttempt})`);
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSync(debounceMs = 5000): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    void doSync();
  }, debounceMs);
}

type SyncState = 'idle' | 'syncing' | 'error';
interface SyncCtx {
  state: SyncState;
  lastSyncAt: number | null;
  pendingCount: number;
  conflictsCount: number;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncCtx>({
  state: 'idle', lastSyncAt: null, pendingCount: 0, conflictsCount: 0,
  syncNow: async () => {},
});

let _setState: ((state: SyncState) => void) | null = null;
let _setLastSyncAt: ((timestamp: number) => void) | null = null;
let _setPendingCount: ((count: number) => void) | null = null;
let _setConflictsCount: ((count: number) => void) | null = null;

const updateSyncState = (state: SyncState) => _setState?.(state);
const updateLastSyncAt = (timestamp: number) => _setLastSyncAt?.(timestamp);
const updatePendingCount = (count: number) => _setPendingCount?.(count);
const updateConflictsCount = (count: number) => _setConflictsCount?.(count);

async function buildMutation(
  outboxItem: OutboxItem,
  revisions: SyncRevisionMap,
): Promise<SyncMutation | null> {
  const { collection, local_id, deleted, force } = outboxItem;
  const isSingleton = (SYNC_SINGLETON_KEYS as readonly string[]).includes(collection);
  let data: Record<string, unknown>;

  if (deleted) {
    data = {};
  } else if (isSingleton) {
    const value = await loadData<unknown>(collection, null);
    data = { value };
  } else {
    const items = await loadData<Record<string, unknown>[]>(collection, []);
    const item = items.find(candidate => candidate.id === local_id);
    if (!item) return null;
    data = item;
  }

  return {
    mutation_id: outboxItem.mutation_id ?? createMutationId(),
    collection,
    local_id,
    operation: deleted ? 'delete' : 'upsert',
    data,
    base_revision: revisions[syncRecordKey(collection, local_id)] ?? null,
    ...(force ? { force: true } : {}),
  };
}

async function generateFullOutbox(): Promise<void> {
  const now = Date.now();
  const generated: OutboxItem[] = [];

  for (const key of SYNC_ARRAY_KEYS) {
    const items = await loadData<{ id: string }[]>(key, []);
    for (const item of items) {
      generated.push({ collection: key, local_id: item.id, deleted: false, queued_at: now });
    }
  }
  for (const key of SYNC_SINGLETON_KEYS) {
    const value = await loadData<unknown | undefined>(key, undefined);
    if (value !== undefined) {
      generated.push({ collection: key, local_id: key, deleted: false, queued_at: now });
    }
  }

  const existing = await loadOutbox();
  await saveOutbox(deduplicateOutbox([...existing, ...generated]));
}

async function applyPullResponse(
  serverItems: SyncResponseItem[],
  currentOutbox: OutboxItem[],
): Promise<void> {
  if (!serverItems.length) return;
  const dirtySet = new Set(currentOutbox.map(item => syncRecordKey(item.collection, item.local_id)));
  const byCollection = new Map<string, SyncResponseItem[]>();
  for (const item of serverItems) {
    const list = byCollection.get(item.collection) ?? [];
    list.push(item);
    byCollection.set(item.collection, list);
  }

  for (const [collection, items] of byCollection) {
    const isSingleton = (SYNC_SINGLETON_KEYS as readonly string[]).includes(collection);
    if (isSingleton) {
      if (dirtySet.has(syncRecordKey(collection, collection))) continue;
      const serverItem = items[items.length - 1];
      await saveData(
        collection,
        serverItem.deleted ? null : (serverItem.data?.value ?? serverItem.data),
      );
      continue;
    }
    if (!(SYNC_ARRAY_KEYS as readonly string[]).includes(collection)) continue;
    const local = await loadData<{ id: string }[]>(collection, []);
    await saveData(collection, applyPullItems(local, items, dirtySet, collection));
  }
}

interface ExchangeResult {
  cursor: number;
  revisions: SyncRevisionMap;
  conflicts: SyncConflictServer[];
}

async function exchangeV2(
  initialCursor: number,
  mutations: SyncMutation[],
  initialRevisions: SyncRevisionMap,
): Promise<ExchangeResult> {
  let pageCursor = initialCursor;
  let finalCursor = initialCursor;
  let revisions = initialRevisions;
  const conflicts: SyncConflictServer[] = [];

  for (let page = 0; page < 200; page++) {
    const response = await apiFetch<SyncResponse>('/sync/user/v2/', {
      method: 'POST',
      body: { cursor: pageCursor, mutations: page === 0 ? mutations : [] },
    });
    assertCompatibleSyncContract(response.contract_version);
    if (response.protocol_version !== 2) {
      throw new Error(`Unsupported sync protocol ${String(response.protocol_version)}`);
    }

    const finishedIds = new Set([
      ...response.acknowledged.map(item => item.mutation_id),
      ...response.conflicts.map(item => item.mutation_id),
    ]);
    await removeMutationsFromOutbox(finishedIds);

    const conflictRows = response.conflicts.flatMap(item => item.server ? [item.server] : []);
    const currentOutbox = await loadOutbox();
    // Keep the local candidate visible until the user resolves the conflict.
    // The synthetic dirty rows only affect local application; the real outbox
    // mutation has already been removed by mutation_id above.
    const conflictDirtyRows: OutboxItem[] = response.conflicts.map(item => ({
      collection: item.collection,
      local_id: item.local_id,
      deleted: item.client.deleted,
      queued_at: Date.now(),
    }));
    await applyPullResponse(
      [...response.changes, ...conflictRows],
      [...currentOutbox, ...conflictDirtyRows],
    );
    revisions = applyRevisionUpdates(
      revisions,
      [...response.changes, ...conflictRows],
      response.acknowledged,
    );
    conflicts.push(...response.conflicts);
    finalCursor = Math.max(finalCursor, response.cursor);

    if (response.next_cursor == null) {
      return { cursor: finalCursor, revisions, conflicts };
    }
    if (response.next_cursor <= pageCursor) {
      throw new Error('Server returned a non-advancing sync cursor');
    }
    pageCursor = response.next_cursor;
  }
  throw new Error('Sync page limit exceeded');
}

let _syncing = false;

async function doSync(): Promise<void> {
  if (!isOnlineMode() || !_isAuthed || _syncing) return;
  _syncing = true;
  updateSyncState('syncing');

  try {
    let cursor = await getServerCursor();
    let revisions = await getRevisionMap();
    if (cursor === 0) await generateFullOutbox();

    const outbox = await loadOutbox();
    updatePendingCount(outbox.length);
    const allConflicts: SyncConflictServer[] = [];
    const chunkCount = Math.max(1, Math.ceil(outbox.length / 500));

    for (let index = 0; index < chunkCount; index++) {
      const sourceChunk = outbox.slice(index * 500, (index + 1) * 500);
      const mutations: SyncMutation[] = [];
      const staleMutationIds = new Set<string>();
      for (const item of sourceChunk) {
        const mutation = await buildMutation(item, revisions);
        if (mutation) mutations.push(mutation);
        else if (item.mutation_id) staleMutationIds.add(item.mutation_id);
      }
      await removeMutationsFromOutbox(staleMutationIds);

      const result = await exchangeV2(cursor, mutations, revisions);
      cursor = result.cursor;
      revisions = result.revisions;
      allConflicts.push(...result.conflicts);
      await setRevisionMap(revisions);
      await setServerCursor(cursor);
      updatePendingCount((await loadOutbox()).length);
    }

    if (allConflicts.length) {
      await appendConflicts(allConflicts.map(conflict => ({
        id: syncRecordKey(conflict.collection, conflict.local_id),
        dataKey: conflict.collection,
        local: { id: conflict.local_id, ...(conflict.client.data ?? {}) },
        remote: conflict.server
          ? { id: conflict.local_id, ...(conflict.server.data ?? {}) }
          : { id: conflict.local_id, _deleted: true },
      })));
    }

    const completedAt = Date.now();
    await saveData(LAST_SYNC_AT_KEY, completedAt);
    updateLastSyncAt(completedAt);
    const { loadConflicts } = await import('./sync-conflicts');
    updateConflictsCount((await loadConflicts()).length);
    clearRetryTimer();
    _retryAttempt = 0;
    updateSyncState('idle');
  } catch (error) {
    if (error instanceof OfflineError) {
      clearRetryTimer();
      updateSyncState('idle');
    } else {
      if (__DEV__) console.warn('[sync-engine] syncNow error:', error);
      updateSyncState('error');
      scheduleRetry();
    }
  } finally {
    _syncing = false;
  }
}

export async function syncNow(): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
  clearRetryTimer();
  _retryAttempt = 0;
  await doSync();
}

export async function triggerFullSync(): Promise<void> {
  await setServerCursor(0);
  await setRevisionMap({});
  scheduleSync(500);
}

export async function pushAllToServer(): Promise<void> {
  await generateFullOutbox();
  updatePendingCount((await loadOutbox()).length);
  await syncNow();
}

export async function pullAllFromServer(): Promise<void> {
  if (!isOnlineMode() || !_isAuthed || _syncing) return;
  _syncing = true;
  updateSyncState('syncing');
  try {
    const result = await exchangeV2(0, [], await getRevisionMap());
    await setRevisionMap(result.revisions);
    await setServerCursor(result.cursor);
    const completedAt = Date.now();
    await saveData(LAST_SYNC_AT_KEY, completedAt);
    updateLastSyncAt(completedAt);
    clearRetryTimer();
    _retryAttempt = 0;
    updateSyncState('idle');
  } catch (error) {
    if (error instanceof OfflineError) updateSyncState('idle');
    else {
      if (__DEV__) console.warn('[sync-engine] pullAllFromServer error:', error);
      updateSyncState('error');
    }
  } finally {
    _syncing = false;
  }
}

export function SyncProvider({ children, isAuthed }: { children: React.ReactNode; isAuthed: boolean }) {
  const [state, setState] = useState<SyncState>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);

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

  useEffect(() => setIsAuthed(isAuthed), [isAuthed]);
  useEffect(() => () => clearRetryTimer(), []);
  useEffect(() => {
    setSyncScheduler(scheduleSync);
    return () => setSyncScheduler(() => {});
  }, []);
  useEffect(() => {
    async function init() {
      const timestamp = await loadData<number>(LAST_SYNC_AT_KEY, 0);
      if (timestamp > 0) setLastSyncAt(timestamp);
      setPendingCount((await loadOutbox()).length);
      const { loadConflicts } = await import('./sync-conflicts');
      setConflictsCount((await loadConflicts()).length);
    }
    void init();
  }, []);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appStateRef.current !== 'active' && next === 'active') void doSync();
      appStateRef.current = next;
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const id = setInterval(() => void doSync(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const syncNowCallback = useCallback(async () => syncNow(), []);
  return (
    <Ctx.Provider value={{ state, lastSyncAt, pendingCount, conflictsCount, syncNow: syncNowCallback }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSync(): SyncCtx {
  return useContext(Ctx);
}
