/** Revision-based server synchronization for Flowi mobile. */

import { AppState, AppStateStatus } from 'react-native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { apiFetch, ApiError, getFreshAccessToken, OfflineError, refreshSession } from './api';
import { getWsBase, getWorkspaceIncompatibility, subscribeWorkspaceIncompatibility } from './api-config';
import { isOnlineMode, subscribeOnlineMode } from './app-mode';
import { loadData, saveData } from './storage';
import { withStorageLock } from './storage-lock';
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
import { EMPTY_LOCAL_ONLY, findLocalOnly, type LocalOnlyReport } from '@/utils/syncDivergence';
import {
  SYNC_ARRAY_KEYS,
  SYNC_SINGLETON_KEYS,
  OUTBOX_KEY,
  OutboxItem,
  applyPullItems,
  createMutationId,
  deduplicateOutbox,
  loadOutbox,
  markDirty,
  removeMutationsFromOutbox,
  resolveOutboxStreamForRecord,
  saveOutbox,
  setSyncScheduler,
} from './synced-storage';
import {
  computeMyProjectIds,
  isProjectCollection,
  isProjectStream,
  PERSONAL_STREAM,
  PROJECT_ID_CONFLICTS_KEY,
  resolveOutboxStream,
} from '@/utils/projectStream';

/** Особистий обмін бере лише 'personal' (undefined) рядки — проєктні пуше `store/project-sync.ts`. */
function isPersonalOutboxItem(item: OutboxItem): boolean {
  return !isProjectStream(item.stream);
}

/**
 * Викликається на WS `ws/user/` `{"type":"projects_changed"}` (контракт §5.2:
 * я доданий/видалений/роль/проєкт видалено/створено на іншому пристрої).
 * Реєструється `store/project-sync.ts` (`ProjectSyncProvider`), а не
 * викликається звідси напряму — той самий цикл-імпорт, через який
 * `loadMyProjectIdsForPull` продубльований вище, замість імпорту. Без цього
 * major з ревʼю лишався б наполовину виправленим: `syncAllMyProjects()` тепер
 * і сам робить `GET /projects/` щоцикл (5 хв / 60 с поллінг), але сигнал
 * призначений саме для того, щоб не чекати цей такт.
 */
let _projectsChangedHandler: (() => void) | null = null;
export function setProjectsChangedHandler(handler: (() => void) | null): void {
  _projectsChangedHandler = handler;
}

/**
 * «Мої проєкти» для перевірки §3.5 нижче (`foreignStreamIds`) — той самий
 * розрахунок, що й `getMyProjectIds()` у `store/project-sync.ts`, продубльований
 * тут напряму через `loadData`, а не імпортом того модуля: `project-sync.ts`
 * імпортує звідси (`applyRevisionUpdates`, `resolveConflictSide`, …), і
 * зустрічний імпорт замкнув би цикл.
 *
 * Виключає `project_id_conflicts_v1` так само, як `getMyProjectIds()` —
 * інакше легасі-проєкт із колізією id (маршрутизується в 'personal',
 * `resolveOutboxStream`) тут і далі вважався б проєктним, і особистий pull
 * пропускав би серверні оновлення його записів назавжди (мінор із ревʼю).
 */
async function loadMyProjectIdsForPull(): Promise<ReadonlySet<string>> {
  const [workspaceProjects, localProjects, conflictedIds] = await Promise.all([
    loadData<{ id: string }[]>('workspace_projects', []),
    loadData<{ id: string }[]>('projects', []),
    loadData<string[]>(PROJECT_ID_CONFLICTS_KEY, []),
  ]);
  const conflicted = new Set(Array.isArray(conflictedIds) ? conflictedIds : []);
  const localIds = Array.isArray(localProjects)
    ? localProjects.map(p => p.id).filter(id => !conflicted.has(id))
    : [];
  return computeMyProjectIds(
    Array.isArray(workspaceProjects) ? workspaceProjects.map(p => p.id) : [],
    localIds,
  );
}

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
/**
 * Колекції контракту, які знала збірка, що востаннє успішно синхронізувалась.
 * Локальний службовий ключ (не синхронізується, не бекапиться).
 */
const KNOWN_COLLECTIONS_KEY = 'sync_known_collections_v2';
/**
 * Чого НЕ знала 1.0.1 — остання збірка, що синхронізувалась без маркера вище.
 * Якщо маркера немає, а курсор > 0, вважаємо, що курсор рухала саме вона.
 */
const COLLECTIONS_UNKNOWN_TO_1_0_1: readonly string[] = ['subscriptions', 'timer_dial_prefs'];

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

/** Усі колекції поточного контракту (масиви + singleton). */
export function currentSyncCollections(): string[] {
  return [...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS];
}

/**
 * Колекції, яких не знала збірка, що рухала курсор востаннє.
 *
 * Стара збірка отримує рядки невідомих їй колекцій, записує їхні ревізії
 * (applyRevisionUpdates не фільтрує колекції), але самі дані відкидає
 * (applyPullResponse їх пропускає) — і курсор іде далі. Після оновлення
 * новий клієнт цих рядків уже ніколи не отримає, а записана ревізія дозволяє
 * «сліпий» запис поверх серверного значення без жодного конфлікту.
 *
 * `stored` — вміст KNOWN_COLLECTIONS_KEY; немає маркера → збірка 1.0.1.
 */
export function collectionsAddedSince(stored: unknown): string[] {
  const current = currentSyncCollections();
  const known = Array.isArray(stored) && stored.every(item => typeof item === 'string')
    ? (stored as string[])
    : current.filter(collection => !COLLECTIONS_UNKNOWN_TO_1_0_1.includes(collection));
  return current.filter(collection => !known.includes(collection));
}

/**
 * Прибирає з мапи ревізій УСІ записи вказаних колекцій. Ревізії туди поклала
 * збірка, яка даних цих колекцій не зберігала, тож вони не підтверджують
 * жодної локальної копії. Без ревізії запис іде з base_revision null і
 * сервер відповідає конфліктом замість мовчазного перезапису.
 */
export function dropRevisionsForCollections(
  revisions: SyncRevisionMap,
  collections: readonly string[],
): SyncRevisionMap {
  const prefixes = collections.map(collection => `${collection}:`);
  const next: SyncRevisionMap = {};
  for (const key of Object.keys(revisions)) {
    if (prefixes.some(prefix => key.startsWith(prefix))) continue;
    next[key] = revisions[key];
  }
  return next;
}

async function saveKnownCollections(): Promise<void> {
  await saveData(KNOWN_COLLECTIONS_KEY, currentSyncCollections());
}

async function getServerCursor(): Promise<number> {
  return loadData<number>(SERVER_CURSOR_KEY, 0);
}

/**
 * Чи вже тягнув цей пристрій особистий синк цього акаунта хоч раз (курсор > 0).
 *
 * Використовується `store/auth.tsx` (refreshProfile): легасі-сесія, кешована
 * ДО появи `resolveDataOwnership` (чи з переходу на цей реліз), уже отримала
 * СВОЇ дані з акаунта звичайним синком — `data_owner` в неї просто ніколи не
 * виставлявся. Без цієї перевірки reconcileDataOwnership бачить «дані нічиї» +
 * «локальні дані є» + «в акаунті є дані» (це ж її власні дані) і показує
 * діалог «об'єднати/використати дані акаунта» на порожньому місці — вибір
 * «використати дані акаунта» там стирає непровштовхнутий outbox мовчки.
 */
export async function hasSyncedBefore(): Promise<boolean> {
  return (await getServerCursor()) > 0;
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

/**
 * Скидає курсор і мапу ревізій персонального синку до «ще нічого не тягнули».
 *
 * Використовується і власним `triggerFullSync()`, і `store/data-ownership.ts`
 * при стиранні даних попереднього акаунта на цьому пристрої (контракт §9.2/
 * §9.3): без цього наступний pull пішов би з курсора чужого акаунта, а
 * конфлікти рахувались би від його ревізій.
 */
export async function resetPersonalSyncState(): Promise<void> {
  await setServerCursor(0);
  await setRevisionMap({});
}

/**
 * Чи визначено власника локальних синхронізованих даних (`store/data-ownership.ts`,
 * ключ `'data_owner'`) — читаємо ключ напряму, а не імпортуємо той модуль:
 * він сам імпортує `generateFullOutbox`/`resetPersonalSyncState` звідси, і
 * зустрічний імпорт замкнув би цикл.
 *
 * Використовується лише щоб НЕ штовхати автоматичний full-outbox у першому
 * (курсор 0) обміні, коли власника ще не визначено (`reconcileDataOwnership()`
 * повернула `'retry_later'` — мережа не дала звірити стан акаунта при вході,
 * і `data_owner` свідомо лишили `null`, щоб нічого не вивантажувати без
 * діалогу злиття). Explicit-виклики (`pushAllToServer()`, сама
 * `uploadLocalDataToAccount()`) цю перевірку не проходять — вони й не мають:
 * там або явна дія користувача, або власник щойно встановлюється поруч.
 */
async function isDataOwnershipResolved(): Promise<boolean> {
  const owner = await loadData<{ workspaceId: string; userId: string } | null>('data_owner', null);
  return owner !== null;
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
/** Коли спрацює взведений таймер (Date.now()-мілісекунди); null — не взведено. */
let _debounceDeadline: number | null = null;

function clearDebounce(): boolean {
  if (!_debounceTimer) return false;
  clearTimeout(_debounceTimer);
  _debounceTimer = null;
  _debounceDeadline = null;
  return true;
}

/**
 * Слот `_debounceTimer` один на всі джерела (запис в outbox, сигнал сокета,
 * повний синк, відкат курсора). Тримається НАЙРАНІШИЙ дедлайн: якщо вже
 * взведений таймер спрацює не пізніше за новий, новий виклик його не чіпає.
 *
 * Доти кожен виклик гасив попередній таймер: сигнал сокета «на вебі щось
 * змінили» (800 мс) з'їдався наступним локальним записом (5 с), а серія
 * записів відсувала синк без кінця. Тепер пул за сигналом сокета стартує
 * вчасно незалежно від того, що локально пишеться в outbox, — один обмін
 * однаково і відправляє outbox, і тягне зміни.
 *
 * `caller` — тільки для журналу.
 */
export function scheduleSync(debounceMs = 5000, caller: ScheduleCaller = 'outbox'): void {
  const deadline = Date.now() + debounceMs;
  if (_debounceTimer && _debounceDeadline != null && _debounceDeadline <= deadline) {
    // Уже взведений таймер спрацює раніше — він і забере цей тригер.
    recordDebounceArmed(debounceMs, caller, false);
    return;
  }
  const replacedArmed = clearDebounce();
  recordDebounceArmed(debounceMs, caller, replacedArmed);
  _debounceDeadline = deadline;
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    _debounceDeadline = null;
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

/**
 * Ставить в outbox ЦІЛКОМ увесь локальний стан синхронізованих колекцій — не
 * лише те, що вже позначено «брудним».
 *
 * Використовується `pushAllToServer()` (кнопка «Відправити все») і, з
 * `store/data-ownership.ts`, міграцією офлайн-даних в акаунт (контракт §9.2):
 * легасі-записи, створені до появи outbox, чи записи, покладені напряму через
 * `saveData` в обхід `saveSynced`, інакше ніколи туди не потрапили б.
 */
export async function generateFullOutbox(): Promise<void> {
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
        // Запис із projectId, що належить проєкту в workspace_projects, іде в
        // проєктний потік — інакше повний перезалив штовхнув би його на
        // особистий ендпоінт (контракт §3.5). До міграції/appearance
        // workspace_projects резолвер повертає undefined ('personal') — той
        // самий результат, що й раніше.
        const stream = await resolveOutboxStreamForRecord(key, localId, item as unknown as Record<string, unknown>);
        generated.push({ collection: key, local_id: localId, deleted: false, queued_at: now, stream });
      }
    }
  }
  for (const key of SYNC_SINGLETON_KEYS) {
    const value = await loadData<unknown | undefined>(key, undefined);
    if (value !== undefined) {
      generated.push({ collection: key, local_id: key, deleted: false, queued_at: now });
    }
  }

  await withStorageLock(OUTBOX_KEY, async () => {
    const existing = await loadOutbox();
    await saveOutbox(deduplicateOutbox([...existing, ...generated]));
  });
}

/**
 * Застосовує серверні рядки до сховища, пропускаючи «брудні» (dirty-wins).
 *
 * `pinnedKeys` — ключі, що тримаються локальними штучно (OCC-конфлікт у цьому
 * ж обміні: локальна версія лишається видимою до вирішення), хоча в outbox
 * їх уже немає.
 *
 * Повертає ключі, пропущені через РЕАЛЬНИЙ outbox — включно з тим, що встиг
 * лягти в outbox під час обміну (див. перечитування під блокуванням нижче).
 * Ревізію таких записів рухати не можна: дані сервера не застосовано, і
 * локальна правка поїхала б із base_revision, якої клієнт ніколи не бачив, —
 * сервер прийняв би її без OCC-конфлікту й затер би чужі поля цілим записом.
 * Зі старою ревізією наступний push отримує конфлікт і проходить звичайне
 * LWW-вирішення.
 */
async function applyPullResponse(
  serverItems: SyncResponseItem[],
  currentOutbox: OutboxItem[],
  pinnedKeys: ReadonlySet<string> = new Set(),
): Promise<Set<string>> {
  const skipped = new Set<string>();
  if (!serverItems.length) return skipped;
  const dirtySet = new Set(currentOutbox.map(item => syncRecordKey(item.collection, item.local_id)));
  // §3.5: цей pull несе особистий (`personal`) потік — лише для колекцій, що
  // взагалі можуть належати проєкту, обчислюємо myProjectIds один раз.
  const needsForeignCheck = serverItems.some(item => isProjectCollection(item.collection));
  const myProjectIds = needsForeignCheck ? await loadMyProjectIdsForPull() : null;
  const markSkipped = (collection: string, items: SyncResponseItem[], dirty: ReadonlySet<string>) => {
    for (const item of items) {
      const key = syncRecordKey(collection, item.local_id);
      if (dirty.has(key)) skipped.add(key);
    }
  };

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
      const singletonKey = syncRecordKey(collection, collection);
      if (dirtySet.has(singletonKey)) {
        skipped.add(singletonKey);
        continue;
      }
      if (pinnedKeys.has(singletonKey)) continue;
      const serverItem = items[items.length - 1];
      await saveData(
        collection,
        serverItem.deleted ? null : (serverItem.data?.value ?? serverItem.data),
      );
      continue;
    }
    if (!(SYNC_ARRAY_KEYS as readonly string[]).includes(collection)) continue;
    // Під блокуванням ключа: екран (saveSynced/saveSyncedChanges) пише той
    // самий масив read-modify-write, і без черги пізніший запис затирав би
    // ранній — або серверні зміни, або щойно зроблену локальну правку.
    //
    // Outbox перечитується вже ПІД блокуванням: екран ставить свої записи в
    // outbox, не відпускаючи блокування колекції, тож правка, що встигла лягти
    // в сховище після початку обміну, тут уже видна як dirty і не затирається.
    await withStorageLock(collection, async () => {
      const dirty = new Set(dirtySet);
      for (const item of await loadOutbox()) dirty.add(syncRecordKey(item.collection, item.local_id));
      const storedLocal = await loadData<unknown>(collection, []);
      const local = Array.isArray(storedLocal) ? (storedLocal as Record<string, unknown>[]) : [];
      // §3.5 «застосування pull: зміна з потоку S не видаляє/не перезаписує
      // локальний запис, який зараз належить іншому потоку» — тут S =
      // 'personal'. Рядок пропускаємо (як dirty), якщо ЛОКАЛЬНИЙ запис із тим
      // самим id зараз маршрутизується (за власним routing-правилом
      // `resolveOutboxStream`) у проєктний потік: інший, паралельний
      // особистому, обмін (`store/project-sync.ts`) міг щойно вставити його
      // туди з `projectId`, і тумбстоун/застаріла версія особистого рядка не
      // мають його стирати чи затирати назад у 'personal'.
      // review finding (major, симетрично до `store/project-sync.ts`
      // `applyProjectPull`): порівняння лише проти ІСНУЮЧОГО локального рядка
      // блокувало й ЛЕГІТИМНЕ переміщення НАЗАД в особисте (P→Personal) —
      // §3.5 «переміщення = delete у старому потоці + upsert у новому»: доки
      // цей upsert (без projectId) не приїхав, local-рядок ще маршрутизувався
      // на проєкт, і guard блокував саме той upsert, що мав завершити
      // переміщення сюди. Якщо особистий pull прийшов ПЕРШИМ (порядок
      // WS/дебаунсу двох потоків недетермінований), а потім проєктний pull
      // приносить тумбстоун (delete) — запис губився назавжди. Тепер:
      // upsert, чиї ВЛАСНІ дані маршрутизуються саме в 'personal', завжди
      // застосовується — він і є завершенням переміщення.
      if (myProjectIds && isProjectCollection(collection)) {
        const localById = new Map(local.map(row => [String(row.id), row]));
        for (const item of items) {
          const existing = localById.get(item.local_id);
          if (!existing) continue;
          const currentStream = resolveOutboxStream(collection, item.local_id, existing, myProjectIds);
          if (currentStream === PERSONAL_STREAM) continue;
          if (!item.deleted) {
            const incomingStream = resolveOutboxStream(collection, item.local_id, item.data, myProjectIds);
            if (incomingStream === PERSONAL_STREAM) continue; // завершує переміщення назад в особисте — не блокувати
          }
          dirty.add(syncRecordKey(collection, item.local_id));
        }
      }
      markSkipped(collection, items, dirty);
      for (const key of pinnedKeys) dirty.add(key);
      await saveData(collection, applyPullItems(local as { id: string }[], items, dirty, collection));
    });
  }
  return skipped;
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
    const conflictKeys = new Set(
      response.conflicts.map(item => syncRecordKey(item.collection, item.local_id)),
    );
    const pulled = [...response.changes, ...conflictRows];
    const skippedDirty = await applyPullResponse(pulled, currentOutbox, conflictKeys);
    // Рядок, пропущений через локальну незапушену правку, лишає стару ревізію
    // (див. applyPullResponse). Конфліктні рядки ревізію отримують: їх вирішує
    // гілка конфліктів нижче за потоком. Підтвердження — завжди: це наш запис.
    revisions = applyRevisionUpdates(
      revisions,
      pulled.filter(change => !skippedDirty.has(syncRecordKey(change.collection, change.local_id))),
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

/**
 * Одноразове довантаження колекцій, доданих після збірки, що рухала курсор.
 *
 * Сторінкує /sync/user/v2/ з курсора 0 БЕЗ мутацій і застосовує лише рядки
 * доданих колекцій (dirty-wins, як звичайний pull). Головний курсор не
 * рухається, рядки відомих колекцій не чіпаються — повторне застосування
 * старих версій туди не потрапляє. Нічого не видаляє: applyPullItems лише
 * доливає серверний стан у записи без локальних незапушених правок.
 *
 * Ревізії доданих колекцій спершу прибираються повністю, а назад
 * записуються тільки для рядків, чиї дані реально лягли в сховище (не dirty).
 * Для локально зміненого запису ревізія лишається порожньою: його мутація
 * отримає OCC-конфлікт і пройде звичайне LWW-вирішення замість перезапису.
 *
 * Маркер зберігається лише після повного проходу; обірваний обмін
 * повториться на наступному синку (операція ідемпотентна).
 */
async function catchUpAddedCollections(
  mainCursor: number,
  revisions: SyncRevisionMap,
): Promise<SyncRevisionMap> {
  const added = collectionsAddedSince(await loadData<unknown>(KNOWN_COLLECTIONS_KEY, null));
  if (!added.length) return revisions;
  const addedSet = new Set(added);
  let next = dropRevisionsForCollections(revisions, added);
  let pageCursor = 0;

  for (let page = 0; page < 200; page++) {
    const response = await apiFetch<SyncResponse>('/sync/user/v2/', {
      method: 'POST',
      body: { cursor: pageCursor, mutations: [] },
    });
    assertCompatibleSyncContract(response.contract_version);
    if (response.protocol_version !== 2) {
      throw new Error(`Unsupported sync protocol ${String(response.protocol_version)}`);
    }
    // Курсор сервера нижчий за наш — сервер обнулили. Нічого не застосовуємо:
    // головний обмін нижче помітить відкат і запустить повний перезалив.
    if (page === 0 && response.cursor < mainCursor) return revisions;

    const relevant = response.changes.filter(change => addedSet.has(change.collection));
    if (relevant.length) {
      const currentOutbox = await loadOutbox();
      const skippedDirty = await applyPullResponse(relevant, currentOutbox);
      next = applyRevisionUpdates(
        next,
        relevant.filter(change => !skippedDirty.has(syncRecordKey(change.collection, change.local_id))),
      );
    }

    if (response.next_cursor == null) {
      await setRevisionMap(next);
      await saveKnownCollections();
      if (__DEV__) console.log('[sync-engine] довантажено нові колекції:', added);
      return next;
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
const _syncIdleWaiters = new Set<() => void>();

/**
 * Дочекатись завершення обміну, що вже йде (якщо йде) — major з ревʼю:
 * `logout()`/`switchWorkspace()` (store/auth.tsx) ставлять `setIsAuthed(false)`
 * ПЕРЕД витиранням локальних даних, але сам гейт (`currentGate`) захищає лише
 * СТАРТ нового обміну — обмін, що вже стартував ДО цього виклику (наприклад,
 * від WS `sync_changed`, 5-хвилинного поллінгу чи повернення з фону), про
 * прапорець не знає і продовжує йти зі старими токенами. Без очікування він
 * дописав би курсор/ревізії/пул-записи ЦЬОГО (уже покинутого) акаунта в
 * щойно витерте сховище — рівно те, що контракт §2.3 забороняє.
 */
export function waitForSyncIdle(): Promise<void> {
  if (!_syncing) return Promise.resolve();
  return new Promise(resolve => { _syncIdleWaiters.add(resolve); });
}

/** Спільний `finally` для `doSync`/`pullAllFromServer` — обидві ділять `_syncing`. */
function markSyncIdle(): void {
  _syncing = false;
  for (const resolve of [..._syncIdleWaiters]) resolve();
  _syncIdleWaiters.clear();
}

/**
 * Гейт не змінено: ті самі три перевірки в тому самому порядку. Різниця лише в
 * тому, що тепер він має ім'я — інакше кожен мовчазний вихід звідси
 * невідрізненний від «синк узагалі не викликали», а це рівно та розвилка, яку
 * доводиться розплутувати, коли автоматика не їде, а кнопка їде.
 */
function currentGate(): GateReason | null {
  if (!isOnlineMode()) return 'offline';
  if (!_isAuthed) return 'notAuthed';
  // Мінор із ревʼю: `workspace_changed`/несумісна версія лишень
  // ПЕРЕНАПРАВЛЯЛИ UI на /workspace — сам обмін (і WS, окремо в
  // useUserSyncSocket) продовжував іти зі старими токенами проти того самого
  // origin. Сценарій: self-host сервер переінстальовано з тим самим
  // SECRET_KEY, але свіжою БД — старий JWT лишається валідним для випадково
  // того самого user id вже ІНШОГО акаунта, і без цього гейта outbox
  // продовжував би штовхатись (а pull — приходити) у чужий акаунт, поки
  // користувач не дійде до екрана /workspace вручну.
  if (getWorkspaceIncompatibility()) return 'incompatible';
  if (_syncing) return 'busy';
  return null;
}

async function doSync(trigger: SyncTrigger): Promise<void> {
  const gate = currentGate();
  recordSyncAttempt(gate, trigger);
  if (gate) {
    // Закритий гейт СПАЛЮВАВ тригер, а не відкладав його. scheduleSync гасить
    // свій таймер ще до виклику (див. вище), тож вихід звідси нічого не
    // переозброював: мутація лишалась в outbox до наступної випадкової
    // причини синхронізуватись — поллінгу через 5 хв, повернення з фону або
    // кнопки. Найгірший випадок 'busy': інший обмін уже йде, тобто мережа й
    // токен справні, а свіжий запис усе одно нікуди не їде.
    //
    // Переозброюємо тільки на 'busy'. Для 'offline' і 'notAuthed' крутити
    // таймер марно — там стан міняється ззовні, і на зміну вже підписані свої
    // шляхи (ефект авторизації, повернення з фону, перемикач режиму).
    if (gate === 'busy') scheduleSync(1500, 'retryGate');
    return;
  }
  _syncing = true;
  _syncStartedAt = Date.now();
  updateSyncState('syncing');

  try {
    let cursor = await getServerCursor();
    let revisions = await getRevisionMap();

    // Власника ще не визначено (retry_later — обидві мережеві спроби звірити
    // стан акаунта при вході не вдались, і `reconcileDataOwnership()` свідомо
    // лишила `data_owner == null`) — фіксуємо це ДО обміну: нижче курсор і
    // мапу ревізій, які поверне exchangeV2, свідомо НЕ персистимо (major з
    // ревʼю). Якщо персистити — курсор стає >0 без жодного вивантаження
    // (generateFullOutbox нижче теж не спрацював), і `hasSyncedBefore()`
    // (store/auth.tsx, refreshProfile) на наступному холодному старті
    // помилково читає це як «легасі-сесія вже синхронізувалась із цим
    // акаунтом» — виставляє власника МОВЧКИ, без діалогу злиття, а
    // невивантажені легасі-дані назавжди лишаються без власника і без шансу
    // піти в акаунт. Лишаючи курсор на 0, ми змушуємо КОЖЕН наступний обмін
    // (і, головне, `refreshProfile` на наступному вході) знову побачити
    // «ще не звіряли» й повторити `resolveDataOwnership`.
    const ownerUnresolvedAtStart = cursor === 0 && !(await isDataOwnershipResolved());

    if (cursor === 0) {
      // §9.2: доки власника локальних даних не визначено — НЕ штовхаємо тут
      // геть усе локальне в акаунт автоматично. Без цієї перевірки будь-який
      // наступний фоновий обмін (coldStart, WS-сигнал, повернення з фону) з
      // курсором 0 однаково зробив би це мовчки — саме те, що знайдено в
      // ревʼю: completeSession() усе одно кличе triggerFullSync() незалежно
      // від результату reconcile. Пул (нижче, тим самим обміном) лишаємо як
      // є — це вже наявна dirty-wins модель синку, а не нова поведінка.
      if (!ownerUnresolvedAtStart) await generateFullOutbox();
    } else {
      // До buildMutation: мутації мають іти вже з очищеними ревізіями.
      revisions = await catchUpAddedCollections(cursor, revisions);
    }

    const fullOutbox = await loadOutbox();
    // Лічильник — по ВСІХ потоках (особистий + кожен проєкт): користувачу
    // важливо «скільки взагалі не відправлено», а не лише особисте. Сам обмін
    // нижче бере тільки 'personal' — проєктні рядки пуше store/project-sync.ts
    // власним обміном на /projects/{id}/sync/.
    updatePendingFrom(fullOutbox);
    // minor з ревʼю: `ownerUnresolvedAtStart` вище вимикав лише `generateFullOutbox`
    // (повний дамп), але ЛЕГАСІ-рядки, що вже лежали в outbox ДО цього обміну
    // (наприклад, непровштовхнуті правки до-релізного офлайн-користувача),
    // усе одно потрапляли б у `mutations` нижче й ішли на сервер раніше, ніж
    // §9.2-діалог «злити/використати акаунт» узагалі показаний — точнісінько
    // той рейс, від якого захищає `ownerUnresolvedAtStart` в іншому місці.
    // Доки власника не визначено, обмін лишається чистим пулом (mutations=[]).
    const outbox = ownerUnresolvedAtStart ? [] : fullOutbox.filter(isPersonalOutboxItem);
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
      // Локальні змінні `cursor`/`revisions` оновлюємо завжди (потрібні для
      // коректності протоколу всередині ЦЬОГО обміну, якщо чанків кілька) —
      // а ось персистимо в сховище, лише коли власника вже було визначено на
      // старті. Інакше цей обмін лишає слід, який наступний холодний старт
      // прочитає як «вже синхронізувались» (див. коментар вище).
      if (!ownerUnresolvedAtStart) {
        await setRevisionMap(revisions);
        await setServerCursor(cursor);
      }
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

    // Обмін пройшов повністю — ця збірка бачила всі свої колекції.
    await saveKnownCollections();
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

    // Outbox читається ОДИН раз на початку обміну. Усе, що користувач записав,
    // поки обмін ішов, у цю відправку не потрапило, а власний scheduleSync
    // такого запису застав _syncing = true й до цієї правки згорав на гейті.
    // Умова саме «queued_at пізніший за початок обміну», а не «outbox не
    // порожній»: інакше запис, який сервер стабільно відхиляє, крутив би
    // цикл вічно.
    const afterExchange = await loadOutbox();
    if (afterExchange.some(item => item.queued_at > _syncStartedAt)) {
      scheduleSync(1500, 'drain');
    }
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
    markSyncIdle();
  }
}

/**
 * Скасовує дебаунс і стартує синк негайно — для згортання застосунку.
 *
 * На відміну від syncNow() не чіпає лічильник retry: згортання не є ознакою
 * того, що попередня помилка минула.
 */
export async function flushPendingSync(): Promise<void> {
  if (clearDebounce()) recordDebounceCancelled('flush');
  await doSync('flush');
}

export async function syncNow(): Promise<void> {
  if (clearDebounce()) recordDebounceCancelled('syncNow');
  clearRetryTimer();
  _retryAttempt = 0;
  await doSync('button');
}

/** Повний синк із нуля: викликається після логіну/реєстрації (store/auth.tsx). */
export async function triggerFullSync(): Promise<void> {
  await resetPersonalSyncState();
  scheduleSync(500, 'fullSync');
}

/**
 * «Відправити все на сервер» — локальний стан стає істиною.
 *
 * Кожна мутація йде з `force: true`, тож сервер не відхиляє її за OCC. Без
 * цього кнопка означала «спробувати відправити все, якщо сервер дозволить», і
 * мовчки лишала частину записів позаду.
 */
/**
 * Чи є записи, яких сервер ніколи не бачив.
 *
 * Читає сховище, а не мережу: питання не «що на сервері», а «чи все локальне
 * бодай раз туди доїхало». Відповідь дає мапа ревізій — див. шапку
 * utils/syncDivergence.ts, там же й привід, чому ця перевірка існує.
 *
 * Для гостя й у локальному режимі повертає порожньо: там «лише на пристрої» —
 * це не аварія, а сам задум, і попередження було б шумом.
 */
export async function scanLocalOnlyRecords(): Promise<LocalOnlyReport> {
  if (!isOnlineMode() || !_isAuthed) return EMPTY_LOCAL_ONLY;

  const revisions = await getRevisionMap();
  const outbox = await loadOutbox();
  const known = new Set<string>(Object.keys(revisions));
  for (const item of outbox) known.add(syncRecordKey(item.collection, item.local_id));

  const entries: { collection: string; keys: string[] }[] = [];
  for (const collection of SYNC_ARRAY_KEYS) {
    const stored = await loadData<unknown>(collection, []);
    if (!Array.isArray(stored)) continue;
    const keys: string[] = [];
    for (const record of stored) {
      const id = normalizeSyncLocalId((record as { id?: unknown })?.id);
      if (id != null) keys.push(syncRecordKey(collection, id));
    }
    if (keys.length) entries.push({ collection, keys });
  }

  return findLocalOnly(entries, known);
}

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
    await saveKnownCollections();
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
    markSyncIdle();
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
    /** open() уже чекає токен — другий паралельний виклик не потрібен. */
    let opening = false;

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const open = async () => {
      // Мінор із ревʼю: той самий гейт, що й у doSync()/currentGate() — сокет
      // не має права піднятись зі старими токенами проти origin, чий
      // workspace_id вже розійшовся з тим, на який ці токени видані (self-host
      // сервер переінстальовано з тим самим SECRET_KEY, свіжою БД).
      if (cancelled || socket || opening || !isOnlineMode() || getWorkspaceIncompatibility()) return;
      opening = true;
      let token: string | null;
      try {
        // Не кешований токен як є: протухлий дав би 4401 на кожній спробі.
        token = await getFreshAccessToken();
      } finally {
        opening = false;
      }
      if (cancelled || socket || !token || !isOnlineMode()) return;

      let ws: WebSocket;
      try {
        recordWs('connecting');
        ws = new WebSocket(`${getWsBase()}/user/`, ['flowi-jwt', token]);
      } catch (error) {
        if (__DEV__) console.warn('[sync-engine] ws open failed:', error);
        recordWs('failed');
        scheduleReconnect();
        return;
      }
      socket = ws;

      ws.onopen = () => {
        attempt = 0;
        recordWs('open');
        // Поки сокета не було, сигнали про чужі зміни губились — підтягуємо.
        scheduleSync(800, 'ws');
      };
      ws.onmessage = (event: { data?: unknown }) => {
        // Дебаунс, а не миттєвий синк: сервер може прислати кілька сигналів
        // поспіль (наприклад, клієнт запушив батч), і кожен піднімав би
        // окремий обмін. scheduleSync тримає найраніший дедлайн, тож локальний
        // запис в outbox цей тригер уже не відсуває. §5.2: старий сервер чи
        // повідомлення без розпізнаного `type` (у т.ч. наявний `sync_changed`
        // — форма НЕ змінюється) так само штовхає особистий синк, як і зараз.
        scheduleSync(800, 'ws');
        // §5.2 (адитивно): `projects_changed` — я доданий/видалений з
        // проєкту, роль змінилась, проєкт видалено чи створено деінде.
        // Особистий синк вище цього не покриває — проєкти йдуть окремим
        // потоком (`store/project-sync.ts`).
        if (typeof event?.data === 'string') {
          try {
            const msg: unknown = JSON.parse(event.data);
            if (msg && typeof msg === 'object' && (msg as { type?: unknown }).type === 'projects_changed') {
              _projectsChangedHandler?.();
            }
          } catch {
            // не JSON / не той формат — ігноруємо, особистий синк вище й так запланований
          }
        }
      };
      ws.onerror = () => { /* onclose однаково спрацює */ };
      ws.onclose = (event: { code?: number }) => {
        if (socket === ws) socket = null;
        recordWs('closed');
        if (cancelled) return;
        // 4401 — сервер відхилив саме токен (як на вебі, lib/data-context.tsx).
        // Оновлюємо його ПЕРЕД наступною спробою, інакше повторюватимемо ту
        // саму відмову з кешованим токеном.
        if (event?.code === 4401) {
          void refreshSession().then(outcome => {
            if (cancelled) return;
            // `invalid` — сесії справді немає: session-expired уже надіслано,
            // застосунок іде на екран входу. Стукати далі нема з чим.
            if (outcome === 'invalid') return;
            if (outcome === 'ok') attempt = 0;
            scheduleReconnect();
          });
          return;
        }
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

    /** Підключитись негайно, без очікування backoff, — якщо сокета немає. */
    const reconnectNow = () => {
      if (cancelled || socket) return;
      clearReconnect();
      attempt = 0;
      void open();
    };

    const closeSocket = () => {
      clearReconnect();
      if (socket) {
        const ws = socket;
        socket = null;
        ws.onclose = null;
        ws.close();
        recordWs('closed');
      }
    };

    void open();

    // Онлайн-режим увімкнули пізніше — доти open() мовчки виходив і більше
    // ніхто його не кликав. Вимкнули — сокет закриваємо.
    const unsubscribeMode = subscribeOnlineMode(online => {
      if (online) reconnectNow();
      else closeSocket();
    });

    // Несумісність workspace виявили ПОКИ сокет уже відкритий (мінор із
    // ревʼю) — закриваємо негайно, не чекаючи природного onclose/backoff:
    // інакше сесія продовжила б приймати `sync_changed`-сигнали зі старого
    // origin і тягнути звідти дані ще секунди чи хвилини, поки TCP сам не
    // порветься. Знята несумісність (користувач пройшов /workspace і
    // підтвердив/перепідʼєднав workspace) — пробуємо піднятись знову.
    const unsubscribeIncompatible = subscribeWorkspaceIncompatibility(v => {
      if (v) closeSocket();
      else reconnectNow();
    });

    // iOS/Android рвуть сокет у фоні, а backoff міг відкласти спробу до 30 с.
    // Повернення в застосунок — саме той момент, коли людина чекає свіжих даних.
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') reconnectNow();
    });

    return () => {
      cancelled = true;
      unsubscribeMode();
      unsubscribeIncompatible();
      appStateSub.remove();
      closeSocket();
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
