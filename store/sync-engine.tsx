/** Revision-based server synchronization for Flowi mobile. */

import { AppState, AppStateStatus } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { apiFetch, ApiError, getAccessToken, OfflineError } from './api';
import { WS_BASE } from './api-config';
import { isOnlineMode } from './app-mode';
import { loadData, saveData } from './storage';
import { appendConflicts, loadConflicts } from './sync-conflicts';
import {
  recordAppState,
  recordDebounceArmed,
  recordDebounceCancelled,
  recordDebounceFired,
  recordRetryArmed,
  recordSyncAttempt,
  recordSyncOutcome,
  recordWs,
  type GateReason,
  type ScheduleCaller,
  type SyncTrigger,
} from './sync-diagnostics';
import { assertCompatibleSyncContract } from './sync-contract';
import {
  SYNC_ARRAY_KEYS,
  SYNC_SINGLETON_KEYS,
  OutboxItem,
  applyPullItems,
  createMutationId,
  deduplicateOutbox,
  loadOutbox,
  markDirty,
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
  /** Час правки на клієнті — основа авто-LWW (фаза 9). */
  client_updated_at: string | null;
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

/** Запис, який сервер стабільно відмовляється приймати. */
export interface SyncRejection {
  status: 'rejected';
  mutation_id: string;
  collection: string;
  local_id: string;
  reason: string;
  detail?: string;
  /** Проставляє клієнт при карантині — вік запису в UI. */
  quarantined_at?: number;
}

interface SyncResponse {
  contract_version?: number;
  protocol_version: 2;
  cursor: number;
  changes: SyncResponseItem[];
  acknowledged: SyncAcknowledgement[];
  conflicts: SyncConflictServer[];
  /** Додано у фазі 8. Старіші сервери поля не повертають. */
  rejected?: SyncRejection[];
  next_cursor: number | null;
}

export type SyncRevisionMap = Record<string, number>;

const SERVER_CURSOR_KEY = 'server_change_cursor_v2';
const SERVER_REVISIONS_KEY = 'server_record_revisions_v2';
const LAST_SYNC_AT_KEY = 'last_server_sync_completed_at';
const LAST_SYNC_ERROR_KEY = 'last_server_sync_error_v2';
const REJECTED_KEY = 'sync_rejected_v2';

export async function loadRejected(): Promise<SyncRejection[]> {
  return loadData<SyncRejection[]>(REJECTED_KEY, []);
}

/** Дедуп за collection:local_id — повторне відхилення оновлює причину. */
export async function quarantineRejections(items: SyncRejection[]): Promise<SyncRejection[]> {
  if (!items.length) return loadRejected();
  const existing = await loadRejected();
  const byRecord = new Map(existing.map(item => [syncRecordKey(item.collection, item.local_id), item]));
  for (const item of items) {
    const key = syncRecordKey(item.collection, item.local_id);
    byRecord.set(key, { ...item, quarantined_at: byRecord.get(key)?.quarantined_at ?? Date.now() });
  }
  const next = Array.from(byRecord.values());
  await saveData(REJECTED_KEY, next);
  return next;
}

/** Прибирає запис із карантину — «спробувати ще» або «відкинути» в UI. */
export async function releaseFromQuarantine(collection: string, localId: string): Promise<void> {
  const key = syncRecordKey(collection, localId);
  const next = (await loadRejected()).filter(
    item => syncRecordKey(item.collection, item.local_id) !== key,
  );
  await saveData(REJECTED_KEY, next);
  updateRejectedCount(next.length);
}

export const syncRecordKey = (collection: string, localId: string): string =>
  `${collection}:${localId}`;

export function normalizeSyncLocalId(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value);
  return normalized.length >= 1 && normalized.length <= 64 ? normalized : null;
}

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
    void doSync('retry');
  }, delay);
  recordRetryArmed(delay, _retryAttempt);
  if (__DEV__) console.log(`[sync-engine] retry in ${delay / 1000}s (attempt ${_retryAttempt})`);
}

export function isRetryableSyncError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

export function describeSyncError(error: unknown): unknown {
  if (!(error instanceof ApiError)) {
    // Не-ApiError — це баг у самому рушії, а не відмова мережі. Без стеку
    // такий звіт марний: `[TypeError: ...]` не каже, де саме воно впало.
    if (error instanceof Error) {
      return { name: error.name, message: error.message, stack: error.stack };
    }
    return error;
  }
  const invalid = error.details?.invalid;
  return {
    status: error.status,
    code: error.code,
    message: error.message,
    ...(invalid !== undefined ? { invalid } : {}),
  };
}

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * `caller` — тільки для журналу. Слот `_debounceTimer` один на всі джерела
 * (запис в outbox, сигнал сокета, повний синк, відкат курсора), і кожен новий
 * виклик гасить попередній таймер незалежно від того, хто його ставив; без
 * імені викликача в журналі не видно, чий саме тік з'їли.
 */
function scheduleSync(debounceMs = 5000, caller: ScheduleCaller = 'outbox'): void {
  const replacedArmed = _debounceTimer != null;
  if (_debounceTimer) clearTimeout(_debounceTimer);
  recordDebounceArmed(debounceMs, caller, replacedArmed);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    recordDebounceFired();
    void doSync('debounce');
  }, debounceMs);
}

export type ConflictResolution = 'local' | 'server' | 'manual';

/**
 * Хто перемагає в конфлікті — рішення приймає КЛІЄНТ, не сервер.
 *
 * Це особисті дані одного користувача на кількох пристроях: розбіжність там
 * майже завжди означає офлайн, а не спір намірів. Тягнути користувача в
 * модалку з двома JSON-об'єктами на кожен такий випадок не масштабується.
 *
 * Правила:
 *  - пізніший `updatedAt` перемагає;
 *  - нічия → сервер, бо це детерміновано: обидва клієнти порівнюють ті самі
 *    два значення й доходять того самого висновку, тож стан збігається.
 *    Штамп має мілісекундну роздільність, і нічия між пристроями реальна;
 *  - delete проти edit → 'manual'. Це справжня неоднозначність наміру
 *    («видалив на телефоні, дописав на планшеті»), і тут питання до
 *    користувача виправдане;
 *  - немає жодного штампа → 'manual', бо порівнювати нічим.
 */
export function resolveConflictSide(
  localUpdatedAt: unknown,
  serverUpdatedAt: unknown,
  options: { localDeleted?: boolean; serverMissing?: boolean } = {},
): ConflictResolution {
  if (options.localDeleted || options.serverMissing) return 'manual';

  const local = typeof localUpdatedAt === 'string' ? Date.parse(localUpdatedAt) : NaN;
  const server = typeof serverUpdatedAt === 'string' ? Date.parse(serverUpdatedAt) : NaN;
  if (Number.isNaN(local) && Number.isNaN(server)) return 'manual';
  if (Number.isNaN(local)) return 'server';
  if (Number.isNaN(server)) return 'local';

  return local > server ? 'local' : 'server';
}

/** Те, що осідає в LAST_SYNC_ERROR_KEY після невдалого обміну. */
export interface SyncErrorInfo {
  at: number;
  error: unknown;
}

/** Читабельний опис помилки для UI. */
export function formatSyncError(info: SyncErrorInfo | null): string | null {
  if (!info) return null;
  const { error } = info;
  if (error && typeof error === 'object') {
    const shaped = error as { status?: number; code?: string; message?: string };
    const parts = [
      shaped.status != null ? `HTTP ${shaped.status}` : null,
      shaped.code && shaped.code !== 'unknown' ? shaped.code : null,
      shaped.message,
    ].filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }
  return String((error as { message?: string })?.message ?? error);
}

/** Найстаріший `queued_at` в outbox — вік застряглої черги. */
export function oldestQueuedAt(items: OutboxItem[]): number | null {
  let oldest: number | null = null;
  for (const item of items) {
    if (typeof item.queued_at !== 'number') continue;
    if (oldest == null || item.queued_at < oldest) oldest = item.queued_at;
  }
  return oldest;
}

type SyncState = 'idle' | 'syncing' | 'error';
interface SyncCtx {
  state: SyncState;
  lastSyncAt: number | null;
  pendingCount: number;
  conflictsCount: number;
  /** Причина останнього провалу; null — останній обмін пройшов чисто. */
  lastError: SyncErrorInfo | null;
  /** Коли поставлено в чергу найстаріший непроведений запис. */
  oldestPendingAt: number | null;
  /** Скільки записів сервер відмовився приймати (фаза 8). */
  rejectedCount: number;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncCtx>({
  state: 'idle', lastSyncAt: null, pendingCount: 0, conflictsCount: 0,
  lastError: null, oldestPendingAt: null, rejectedCount: 0,
  syncNow: async () => {},
});

let _setState: ((state: SyncState) => void) | null = null;
let _setLastSyncAt: ((timestamp: number) => void) | null = null;
let _setPendingCount: ((count: number) => void) | null = null;
let _setConflictsCount: ((count: number) => void) | null = null;
let _setLastError: ((info: SyncErrorInfo | null) => void) | null = null;
let _setOldestPendingAt: ((timestamp: number | null) => void) | null = null;
let _setRejectedCount: ((count: number) => void) | null = null;

const updateSyncState = (state: SyncState) => _setState?.(state);
const updateLastSyncAt = (timestamp: number) => _setLastSyncAt?.(timestamp);
const updateConflictsCount = (count: number) => _setConflictsCount?.(count);
const updateLastError = (info: SyncErrorInfo | null) => _setLastError?.(info);
const updateRejectedCount = (count: number) => _setRejectedCount?.(count);

/** Тримає лічильник і вік черги узгодженими — обидва рахуються з того самого outbox. */
function updatePendingFrom(items: OutboxItem[]): void {
  _setPendingCount?.(items.length);
  _setOldestPendingAt?.(oldestQueuedAt(items));
}

/** collection → (local_id → запис). Будується раз на синк. */
type CollectionCache = Map<string, Map<string, Record<string, unknown>>>;

/**
 * Читає кожну потрібну колекцію рівно один раз.
 *
 * Без цього buildMutation робив loadData(collection) на КОЖЕН запис outbox, а
 * loadData — це AsyncStorage.getItem + повний JSON.parse. Для N записів однієї
 * колекції виходило N парсів масиву на N елементів, тобто O(n²) — і саме на
 * першому синку, коли записів найбільше.
 */
async function buildCollectionCache(items: OutboxItem[]): Promise<CollectionCache> {
  const cache: CollectionCache = new Map();

  // Дедуп через звичайний масив, а не Set: цикл нижче — async з await у тілі,
  // і `for...of` по Set/Map у такому контексті транспілюється інакше, ніж по
  // масиву. Масив тут дає ту саму семантику без залежності від того, як саме
  // рушій розгорнув ітератор.
  const needed: string[] = [];
  const seen: Record<string, boolean> = {};
  for (const item of items) {
    const { collection } = item;
    if (item.deleted) continue;
    if ((SYNC_SINGLETON_KEYS as readonly string[]).includes(collection)) continue;
    if (seen[collection]) continue;
    seen[collection] = true;
    needed.push(collection);
  }

  for (const collection of needed) {
    const stored = await loadData<unknown>(collection, []);
    const byId = new Map<string, Record<string, unknown>>();
    // Та сама причина, що й у generateFullOutbox: форма в сховищі може бути
    // застарілою, а ітерація по не-масиву валить синк цілком.
    const rows = Array.isArray(stored) ? (stored as Record<string, unknown>[]) : [];
    for (const row of rows) {
      const id = normalizeSyncLocalId(row.id);
      if (id) byId.set(id, row);
    }
    cache.set(collection, byId);
  }
  return cache;
}

async function buildMutation(
  outboxItem: OutboxItem,
  revisions: SyncRevisionMap,
  cache: CollectionCache,
): Promise<SyncMutation | null> {
  const { collection, local_id, deleted, force } = outboxItem;
  const normalizedLocalId = normalizeSyncLocalId(local_id);
  if (!normalizedLocalId) return null;
  const isSingleton = (SYNC_SINGLETON_KEYS as readonly string[]).includes(collection);
  let data: Record<string, unknown>;

  if (deleted) {
    data = {};
  } else if (isSingleton) {
    const value = await loadData<unknown>(collection, null);
    data = { value };
  } else {
    const item = cache.get(collection)?.get(normalizedLocalId);
    if (!item) return null;
    data = item;
  }

  const clientUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : null;

  return {
    mutation_id: outboxItem.mutation_id ?? createMutationId(),
    collection,
    local_id: normalizedLocalId,
    operation: deleted ? 'delete' : 'upsert',
    data,
    base_revision: revisions[syncRecordKey(collection, normalizedLocalId)] ?? null,
    // Для видалень і singleton штампа немає — сервер тоді покладається на
    // власний час прибуття.
    client_updated_at: clientUpdatedAt,
    ...(force ? { force: true } : {}),
  };
}

async function generateFullOutbox(): Promise<void> {
  const now = Date.now();
  const generated: OutboxItem[] = [];

  for (const key of SYNC_ARRAY_KEYS) {
    const stored = await loadData<unknown>(key, []);
    // Ключ може тримати НЕ масив: `categories` і `finance_balance_adjustments`
    // до нормалізації були об'єктами, і на пристрої, де міграція не
    // відпрацювала, вони такими й лишились. `for...of` по звичайному об'єкту
    // кидає TypeError і валить увесь синк — назавжди, бо генерація повного
    // outbox виконується на кожному синку з нульовим курсором.
    if (!Array.isArray(stored)) {
      if (__DEV__) {
        console.warn(`[sync-engine] '${key}' у сховищі не масив (${typeof stored}) — пропущено`);
      }
      continue;
    }
    const items = stored as { id: string }[];
    for (const item of items) {
      const localId = normalizeSyncLocalId(item.id);
      if (localId) {
        generated.push({ collection: key, local_id: localId, deleted: false, queued_at: now });
      }
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

  // Групування у звичайний об'єкт із окремим списком порядку — з тієї ж
  // причини, що й у buildCollectionCache: цикл нижче async, і ітерація по
  // Map у ньому залежить від способу транспіляції.
  const byCollection: Record<string, SyncResponseItem[]> = {};
  const order: string[] = [];
  for (const item of serverItems) {
    if (!byCollection[item.collection]) {
      byCollection[item.collection] = [];
      order.push(item.collection);
    }
    byCollection[item.collection].push(item);
  }

  for (const collection of order) {
    const items = byCollection[collection];
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
    const storedLocal = await loadData<unknown>(collection, []);
    const local = Array.isArray(storedLocal) ? (storedLocal as { id: string }[]) : [];
    await saveData(collection, applyPullItems(local, items, dirtySet, collection));
  }
}

interface ExchangeResult {
  cursor: number;
  /** Курсор сервера як є, без Math.max — потрібен, щоб помітити відкат. */
  serverCursor: number;
  revisions: SyncRevisionMap;
  conflicts: SyncConflictServer[];
}

async function exchangeV2(
  initialCursor: number,
  mutations: SyncMutation[],
  initialRevisions: SyncRevisionMap,
  /** Якщо передано — накопичує `collection:local_id` живих серверних записів. */
  seenKeys?: Set<string>,
): Promise<ExchangeResult> {
  let pageCursor = initialCursor;
  let finalCursor = initialCursor;
  let serverCursor = initialCursor;
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

    const rejections = response.rejected ?? [];
    // Відхилений запис прибирається з outbox і йде в карантин. Інакше він
    // висів би вічно: сервер стабільно його не приймає, а поки він в outbox,
    // клієнт ще й ігнорує серверні зміни для цього запису.
    if (rejections.length) {
      const quarantined = await quarantineRejections(rejections);
      updateRejectedCount(quarantined.length);
      if (__DEV__) {
        console.warn('[sync-engine] відхилено сервером:', rejections.map(r => `${r.collection}:${r.local_id} (${r.reason})`));
      }
    }

    const finishedIds = new Set([
      ...response.acknowledged.map(item => item.mutation_id),
      ...response.conflicts.map(item => item.mutation_id),
      ...rejections.map(item => item.mutation_id),
    ]);
    await removeMutationsFromOutbox(finishedIds);

    if (seenKeys) {
      for (const change of response.changes) {
        if (change.deleted) seenKeys.delete(syncRecordKey(change.collection, change.local_id));
        else seenKeys.add(syncRecordKey(change.collection, change.local_id));
      }
    }

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
    serverCursor = response.cursor;

    if (response.next_cursor == null) {
      return { cursor: finalCursor, serverCursor, revisions, conflicts };
    }
    if (response.next_cursor <= pageCursor) {
      throw new Error('Server returned a non-advancing sync cursor');
    }
    pageCursor = response.next_cursor;
  }
  throw new Error('Sync page limit exceeded');
}

let _syncing = false;
/** Початок поточного обміну — потрібен лише журналу тривалості. */
let _syncStartedAt = 0;

/**
 * Гейт не змінено: ті самі три перевірки в тому самому порядку. Різниця лише в
 * тому, що тепер він має ім'я — інакше кожен мовчазний вихід звідси
 * невідрізненний від «синк узагалі не викликали», а це рівно та розвилка, яку
 * доводиться розплутувати, коли автоматика не їде, а кнопка їде.
 */
function currentGate(): GateReason | null {
  if (!isOnlineMode()) return 'offline';
  if (!_isAuthed) return 'notAuthed';
  if (_syncing) return 'busy';
  return null;
}

async function doSync(trigger: SyncTrigger): Promise<void> {
  const gate = currentGate();
  recordSyncAttempt(gate, trigger);
  if (gate) return;
  _syncing = true;
  _syncStartedAt = Date.now();
  updateSyncState('syncing');

  try {
    let cursor = await getServerCursor();
    let revisions = await getRevisionMap();

    if (cursor === 0) await generateFullOutbox();

    const outbox = await loadOutbox();
    updatePendingFrom(outbox);
    const cache = await buildCollectionCache(outbox);
    const allConflicts: SyncConflictServer[] = [];
    const chunkCount = Math.max(1, Math.ceil(outbox.length / 500));

    for (let index = 0; index < chunkCount; index++) {
      const sourceChunk = outbox.slice(index * 500, (index + 1) * 500);
      const mutations: SyncMutation[] = [];
      const staleMutationIds = new Set<string>();
      for (const item of sourceChunk) {
        const mutation = await buildMutation(item, revisions, cache);
        if (mutation) mutations.push(mutation);
        else if (item.mutation_id) staleMutationIds.add(item.mutation_id);
      }
      await removeMutationsFromOutbox(staleMutationIds);

      const result = await exchangeV2(cursor, mutations, revisions);

      // Курсор сервера, що поїхав НАЗАД, може означати лише одне: серверний
      // стан обнулили. Без цієї перевірки клієнт надсилав би свій старий
      // курсор, отримував порожній список змін і вирішував, що все гаразд —
      // а його дані на сервер уже не повернулись би: outbox порожній, а
      // generateFullOutbox спрацьовує тільки при cursor === 0.
      if (cursor > 0 && result.serverCursor < cursor) {
        if (__DEV__) console.log('[sync-engine] курсор сервера відкотився — повний перезалив');
        await setServerCursor(0);
        await setRevisionMap({});
        await generateFullOutbox();
        updatePendingFrom(await loadOutbox());
        updateSyncState('idle');
        scheduleSync(500, 'rollback');
        return;
      }

      cursor = result.cursor;
      revisions = result.revisions;
      allConflicts.push(...result.conflicts);
      await setRevisionMap(revisions);
      await setServerCursor(cursor);
      updatePendingFrom(await loadOutbox());
    }

    if (allConflicts.length) {
      const needsUser: SyncConflictServer[] = [];
      // exchangeV2 навмисно тримає конфліктні рядки «брудними», щоб локальна
      // версія лишалась видимою до вирішення. Тобто серверні дані НЕ
      // застосовані — якщо перемагає сервер, їх треба покласти явно.
      const serverWins: SyncResponseItem[] = [];

      for (const conflict of allConflicts) {
        const side = resolveConflictSide(
          conflict.client.data?.updatedAt,
          conflict.server?.client_updated_at,
          { localDeleted: conflict.client.deleted, serverMissing: !conflict.server },
        );

        if (side === 'manual') {
          needsUser.push(conflict);
        } else if (side === 'local') {
          // Локальна правка новіша — перештовхуємо її з force, інакше сервер
          // відхилить за OCC вдруге, і так по колу.
          await markDirty(conflict.collection, conflict.local_id, conflict.client.deleted, true);
        } else if (conflict.server) {
          serverWins.push(conflict.server);
        }
      }

      if (serverWins.length) await applyPullResponse(serverWins, []);

      if (__DEV__ && allConflicts.length !== needsUser.length) {
        console.log(
          `[sync-engine] авторозв'язано конфліктів: ${allConflicts.length - needsUser.length}, `
          + `лишилось користувачу: ${needsUser.length}`,
        );
      }

      if (needsUser.length) {
        await appendConflicts(needsUser.map(conflict => ({
          id: syncRecordKey(conflict.collection, conflict.local_id),
          dataKey: conflict.collection,
          local: { id: conflict.local_id, ...(conflict.client.data ?? {}) },
          remote: conflict.server
            ? { id: conflict.local_id, ...(conflict.server.data ?? {}) }
            : { id: conflict.local_id, _deleted: true },
        })));
      }
    }

    const completedAt = Date.now();
    await saveData(LAST_SYNC_AT_KEY, completedAt);
    await saveData(LAST_SYNC_ERROR_KEY, null);
    updateLastSyncAt(completedAt);
    updateLastError(null);
    updateConflictsCount((await loadConflicts()).length);
    clearRetryTimer();
    _retryAttempt = 0;
    updateSyncState('idle');
    recordSyncOutcome('ok', Date.now() - _syncStartedAt);
  } catch (error) {
    if (error instanceof OfflineError) {
      clearRetryTimer();
      updateSyncState('idle');
      recordSyncOutcome('offline', Date.now() - _syncStartedAt);
    } else {
      const description = describeSyncError(error);
      if (__DEV__) console.warn('[sync-engine] syncNow error:', description);
      const info: SyncErrorInfo = { at: Date.now(), error: description };
      await saveData(LAST_SYNC_ERROR_KEY, info);
      updateLastError(info);
      updateSyncState('error');
      recordSyncOutcome('error', Date.now() - _syncStartedAt);
      if (isRetryableSyncError(error)) scheduleRetry();
      else clearRetryTimer();
    }
  } finally {
    _syncing = false;
  }
}

/**
 * Скасовує дебаунс і стартує синк негайно — для згортання застосунку.
 *
 * На відміну від syncNow() не чіпає лічильник retry: згортання не є ознакою
 * того, що попередня помилка минула.
 */
export async function flushPendingSync(): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    recordDebounceCancelled('flush');
  }
  await doSync('flush');
}

export async function syncNow(): Promise<void> {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
    recordDebounceCancelled('syncNow');
  }
  clearRetryTimer();
  _retryAttempt = 0;
  await doSync('button');
}

/** Повний синк із нуля: викликається після логіну/реєстрації (store/auth.tsx). */
export async function triggerFullSync(): Promise<void> {
  await setServerCursor(0);
  await setRevisionMap({});
  scheduleSync(500, 'fullSync');
}

/**
 * «Відправити все на сервер» — локальний стан стає істиною.
 *
 * Кожна мутація йде з `force: true`, тож сервер не відхиляє її за OCC. Без
 * цього кнопка означала «спробувати відправити все, якщо сервер дозволить», і
 * мовчки лишала частину записів позаду.
 */
export async function pushAllToServer(): Promise<void> {
  await generateFullOutbox();
  const outbox = await loadOutbox();
  await saveOutbox(outbox.map(item => ({ ...item, force: true })));
  updatePendingFrom(await loadOutbox());
  await syncNow();
}

/**
 * Прибирає локальні записи синхронізованих колекцій, яких сервер не надіслав.
 *
 * Потрібно, щоб «витягнути все» справді означало «зробити цей пристрій таким,
 * як сервер», а не «долити серверне поверх локального». Singleton-ключі не
 * чіпаємо: їх відсутність на сервері означає «ще не задано», а не «видалено»,
 * і обнуління зламало б дефолти в UI.
 */
async function pruneRecordsMissingOnServer(seenKeys: Set<string>): Promise<void> {
  for (const collection of SYNC_ARRAY_KEYS) {
    const storedLocal = await loadData<unknown>(collection, []);
    if (!Array.isArray(storedLocal)) continue;
    const local = storedLocal as { id: string }[];
    if (!local.length) continue;
    const kept = local.filter(item => {
      const id = normalizeSyncLocalId(item.id);
      return id != null && seenKeys.has(syncRecordKey(collection, id));
    });
    if (kept.length !== local.length) await saveData(collection, kept);
  }
}

/**
 * «Витягнути все з сервера» — серверний стан стає істиною.
 *
 * Спершу скидаємо outbox, мапу ревізій і курсор. Без скидання outbox
 * `applyPullResponse` пропускав саме ті записи, що локально розійшлися
 * (dirty-wins), тобто кнопка не витягувала рівно те, заради чого її тиснуть.
 *
 * Операція деструктивна: незапушені локальні зміни втрачаються свідомо.
 */
export async function pullAllFromServer(): Promise<void> {
  if (!isOnlineMode() || !_isAuthed || _syncing) return;
  _syncing = true;
  // Той самий штамп, що й у doSync: інакше панель показувала б тривалість
  // попереднього обміну, поки триває цей.
  _syncStartedAt = Date.now();
  updateSyncState('syncing');
  try {
    await saveOutbox([]);
    updatePendingFrom([]);
    await setRevisionMap({});
    await setServerCursor(0);

    const seenKeys = new Set<string>();
    const result = await exchangeV2(0, [], {}, seenKeys);
    await pruneRecordsMissingOnServer(seenKeys);
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
      if (__DEV__) console.warn('[sync-engine] pullAllFromServer error:', describeSyncError(error));
      updateSyncState('error');
    }
  } finally {
    _syncing = false;
  }
}

/**
 * Підписка на особистий канал realtime.
 *
 * Сокет несе ЛИШЕ сигнал «курсор зрушив», без даних: у відповідь робимо
 * звичайний обмін. Тому він не є джерелом істини — якщо впав або не
 * підключився, лишається поллінг (5 хв) і синк на foreground, і нічого не
 * губиться. Це навмисно: realtime тут прискорює, а не забезпечує коректність.
 *
 * Токен іде субпротоколом, а не в query — query потрапляє в access-логи nginx.
 */
function useUserSyncSocket(isAuthed: boolean): void {
  useEffect(() => {
    if (!isAuthed) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let cancelled = false;

    const open = async () => {
      if (cancelled || !isOnlineMode()) return;
      const token = await getAccessToken();
      if (cancelled || !token) return;

      try {
        recordWs('connecting');
        socket = new WebSocket(`${WS_BASE}/user/`, ['flowi-jwt', token]);
      } catch (error) {
        if (__DEV__) console.warn('[sync-engine] ws open failed:', error);
        recordWs('failed');
        scheduleReconnect();
        return;
      }

      socket.onopen = () => { attempt = 0; recordWs('open'); };
      socket.onmessage = () => {
        // Дебаунс, а не миттєвий синк: сервер може прислати кілька сигналів
        // поспіль (наприклад, клієнт запушив батч), і кожен піднімав би
        // окремий обмін.
        scheduleSync(800, 'ws');
      };
      socket.onerror = () => { /* onclose однаково спрацює */ };
      socket.onclose = () => {
        socket = null;
        recordWs('closed');
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      // Максимум 30 с: сокет опортуністичний, агресивно перепідключатись
      // немає сенсу — поллінг усе одно підстрахує.
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void open();
      }, delay);
    };

    void open();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [isAuthed]);
}

export function SyncProvider({ children, isAuthed }: { children: React.ReactNode; isAuthed: boolean }) {
  const [state, setState] = useState<SyncState>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [lastError, setLastError] = useState<SyncErrorInfo | null>(null);
  const [oldestPendingAt, setOldestPendingAt] = useState<number | null>(null);
  const [rejectedCount, setRejectedCount] = useState(0);

  useEffect(() => {
    _setState = setState;
    _setLastSyncAt = setLastSyncAt;
    _setPendingCount = setPendingCount;
    _setConflictsCount = setConflictsCount;
    _setLastError = setLastError;
    _setOldestPendingAt = setOldestPendingAt;
    _setRejectedCount = setRejectedCount;
    return () => {
      _setState = null;
      _setLastSyncAt = null;
      _setPendingCount = null;
      _setConflictsCount = null;
      _setLastError = null;
      _setOldestPendingAt = null;
      _setRejectedCount = null;
    };
  }, []);

  useEffect(() => {
    setIsAuthed(isAuthed);
    // A cold app launch starts in the active AppState, so the foreground
    // listener below does not fire. Sync immediately once auth is restored.
    if (isAuthed) void doSync('coldStart');
  }, [isAuthed]);
  useEffect(() => () => clearRetryTimer(), []);
  useEffect(() => {
    setSyncScheduler(scheduleSync);
    return () => setSyncScheduler(() => {}, 'noop');
  }, []);
  useEffect(() => {
    async function init() {
      const timestamp = await loadData<number>(LAST_SYNC_AT_KEY, 0);
      if (timestamp > 0) setLastSyncAt(timestamp);
      const outbox = await loadOutbox();
      setPendingCount(outbox.length);
      setOldestPendingAt(oldestQueuedAt(outbox));
      setConflictsCount((await loadConflicts()).length);
      setRejectedCount((await loadRejected()).length);
      // Помилка переживає перезапуск: якщо з моменту останнього провалу нічого
      // не вдалося, стан має лишатись 'error', а не показувати чисте 'idle'.
      const storedError = await loadData<SyncErrorInfo | null>(LAST_SYNC_ERROR_KEY, null);
      if (storedError) {
        setLastError(storedError);
        setState(current => (current === 'idle' ? 'error' : current));
      }
    }
    void init();
  }, []);

  useUserSyncSocket(isAuthed);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      recordAppState(previous, next);
      if (previous !== 'active' && next === 'active') {
        void doSync('foreground');
        return;
      }
      // Згортання: scheduleSync — це setTimeout на 5 с, а iOS призупиняє JS-
      // таймери у фоні. Без флешу найтиповіший сценарій «швидко записав і
      // закрив» лишає мутацію в outbox, і решта клієнтів тягне застарілі дані.
      if (previous === 'active' && next !== 'active') void flushPendingSync();
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const id = setInterval(() => void doSync('poll'), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const syncNowCallback = useCallback(async () => syncNow(), []);
  return (
    <Ctx.Provider value={{
      state, lastSyncAt, pendingCount, conflictsCount,
      lastError, oldestPendingAt, rejectedCount, syncNow: syncNowCallback,
    }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * Живі значення гейта — саме модульні, не їхні React-двійники.
 *
 * Екран синхронізації досі судив про них за `online` з контексту, `authStatus`
 * і `state`, а doSync питає геть інші змінні. Розбіжність між парами і є
 * відповіддю на «кнопка ж активна, чому не їде».
 */
export interface SyncEngineFlags {
  online: boolean;
  isAuthed: boolean;
  syncing: boolean;
  /** Скільки триває поточний обмін; 0 — обміну немає. */
  syncingForMs: number;
  debounceArmed: boolean;
  retryArmed: boolean;
  retryAttempt: number;
}

export function getSyncEngineFlags(): SyncEngineFlags {
  return {
    online: isOnlineMode(),
    isAuthed: _isAuthed,
    syncing: _syncing,
    syncingForMs: _syncing && _syncStartedAt > 0 ? Date.now() - _syncStartedAt : 0,
    debounceArmed: _debounceTimer != null,
    retryArmed: _retryTimer != null,
    retryAttempt: _retryAttempt,
  };
}

export function useSync(): SyncCtx {
  return useContext(Ctx);
}
