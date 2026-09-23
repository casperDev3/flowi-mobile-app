/**
 * api/feedback.ts — подання ідей і багів через СВІЙ сервер
 * (flowi-server-app/docs/specs/feedback-inbox.md §4, §10.5, §11).
 *
 * Три шари, як у api/notifications.ts:
 *  1. REST над `/api/feedback/reports/…` — форми рівно ті, що віддає
 *     `core/feedback/views.py`.
 *  2. Локальний реєстр файлів вкладень (`feedback_files_v1`): шлях до файлу
 *     живе ТУТ, а не в тілі запису, тож синк його не бачить (§3.1).
 *  3. Клієнтська черга подання (`feedback_queue_v1`) з повторами й backoff —
 *     окрема від sync-outbox: outbox шле мутації колекцій, а подання — це
 *     REST-виклик із файлами (§11.2).
 *
 * Головне правило (§10.5): запис отримує `submitState: 'sent'` ЛИШЕ після 2xx
 * від сервера. Жодної проковтнутої помилки і жодного оптимістичного «Надіслано».
 * До Apps Script клієнт більше не ходить узагалі (§12.3).
 */
import { AppState } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

import {
  ApiError,
  OfflineError,
  apiFetch,
  getAccessToken,
  getFreshAccessToken,
} from '@/store/api';
import { CLIENT_HEADER_VALUE, getApiBase } from '@/store/api-config';
import { isOnlineMode, subscribeOnlineMode } from '@/store/app-mode';
import { loadData, saveData } from '@/store/storage';
import { withStorageLock } from '@/store/storage-lock';
import { updateSynced } from '@/store/synced-storage';
import {
  COLLECTION_FOR_KIND,
  EXT_BY_MIME,
  attachmentKindFor,
  backoffMs,
  buildSubmitPayload,
  classifyError,
  filesToEvict,
  statusKey,
  type AttachmentCandidate,
  type FeedbackAttachment,
  type FeedbackEntry,
  type FeedbackKind,
  type FeedbackRecord,
  type ServerFeedbackStatus,
} from '@/components/feedback/model';

// ─── Ключі сховища (лише цей пристрій, не синкаються) ────────────────────────

export const FEEDBACK_QUEUE_KEY = 'feedback_queue_v1';
export const FEEDBACK_FILES_KEY = 'feedback_files_v1';
export const FEEDBACK_STATUS_CACHE_KEY = 'feedback_status_cache_v1';

// ─── REST (§4) ───────────────────────────────────────────────────────────────

export interface SubmitResponse {
  report_uid: string;
  delivery_state: string;
  attachments: { client_uid: string; upload_url: string; max_bytes: number; state?: string }[];
}

interface ReportOut {
  report_uid: string;
  kind: string;
  collection: string;
  local_id: string;
  delivery_state: string;
  status: string;
  status_comment: string;
  duplicate_of: string | null;
  task_linked: boolean;
  status_updated_at: string | null;
}

export interface ReportsListResponse {
  forwarding_configured: boolean;
  reports: ReportOut[];
}

export function submitFeedbackReport(entry: FeedbackEntry, uploadable: ReadonlySet<string>): Promise<SubmitResponse> {
  return apiFetch<SubmitResponse>('/feedback/reports/', {
    method: 'POST',
    body: buildSubmitPayload(entry, uploadable),
  });
}

export function retryFeedbackReport(reportUid: string): Promise<SubmitResponse> {
  return apiFetch<SubmitResponse>(`/feedback/reports/${encodeURIComponent(reportUid)}/retry/`, { method: 'POST' });
}

export function listFeedbackReports(): Promise<ReportsListResponse> {
  return apiFetch<ReportsListResponse>('/feedback/reports/');
}

/**
 * `upload_url` сервер віддає від кореня сайту (`/api/feedback/…`), а
 * `getApiBase()` уже закінчується на `/api`. Абсолютну адресу не приймаємо
 * взагалі: файл із телефона має піти лише на сервер воркспейсу.
 */
export function resolveUploadUrl(apiBase: string, uploadUrl: string): string | null {
  if (!uploadUrl.startsWith('/')) return null;
  const base = apiBase.replace(/\/+$/, '');
  const origin = base.replace(/\/api$/, '');
  return `${origin}${uploadUrl}`;
}

/** Зведення GET-відповіді до кешу статусів за ключем `<kind>:<local_id>`. */
export function statusesFromReports(reports: readonly ReportOut[]): Record<string, ServerFeedbackStatus> {
  const out: Record<string, ServerFeedbackStatus> = {};
  for (const r of reports) {
    const kind: FeedbackKind | null = r.kind === 'bug' || r.kind === 'idea' ? r.kind : null;
    if (!kind || !r.local_id) continue;
    out[statusKey(kind, r.local_id)] = {
      reportUid: r.report_uid,
      deliveryState: r.delivery_state,
      status: r.status,
      comment: r.status_comment ?? '',
      duplicateOf: r.duplicate_of ?? null,
      taskLinked: !!r.task_linked,
      updatedAt: r.status_updated_at ?? null,
    };
  }
  return out;
}

/** Ключ синхронізованої серверної колекції статусів (store/sync-contract.ts, SYNC_SERVER_OWNED_KEYS). */
export const FEEDBACK_STATUS_SYNC_KEY = 'feedback_status';

/**
 * Рядки `feedback_status` зі сховища (pull синку кладе `{id: '<kind>:<id>', ...data}`)
 * → той самий вигляд, що й кеш GET-відповіді. Биті рядки пропускаються.
 */
export function statusesFromSyncRows(rows: unknown): Record<string, ServerFeedbackStatus> {
  const out: Record<string, ServerFeedbackStatus> = {};
  if (!Array.isArray(rows)) return out;
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : null;
    if (!id || !/^(idea|bug):.+/.test(id)) continue;
    out[id] = {
      reportUid: typeof r.report_uid === 'string' ? r.report_uid : '',
      deliveryState: typeof r.delivery_state === 'string' ? r.delivery_state : '',
      status: typeof r.status === 'string' ? r.status : '',
      comment: typeof r.comment === 'string' ? r.comment : '',
      duplicateOf: typeof r.duplicate_of === 'string' ? r.duplicate_of : null,
      taskLinked: !!r.task_linked,
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    };
  }
  return out;
}

/**
 * Статуси з двох джерел: кеш GET-відповіді і живий синк `feedback_status`.
 * На ключ перемагає пізніший `updatedAt`; без мітки — синк (він приходить
 * сигналом одразу після зміни, а кеш — лише на відкритті екрана).
 */
export function mergeStatuses(
  cached: Record<string, ServerFeedbackStatus>,
  synced: Record<string, ServerFeedbackStatus>,
): Record<string, ServerFeedbackStatus> {
  const out: Record<string, ServerFeedbackStatus> = { ...cached };
  for (const [key, live] of Object.entries(synced)) {
    const prev = out[key];
    if (!prev || !prev.updatedAt || !live.updatedAt || live.updatedAt >= prev.updatedAt) {
      out[key] = { ...live, reportUid: live.reportUid || prev?.reportUid || '' };
    }
  }
  return out;
}

export async function loadSyncedStatuses(): Promise<Record<string, ServerFeedbackStatus>> {
  return statusesFromSyncRows(await loadData<unknown>(FEEDBACK_STATUS_SYNC_KEY, []));
}

export interface StatusCache {
  fetchedAt: string | null;
  /** null — ще жодного разу не питали сервер. */
  forwardingConfigured: boolean | null;
  byKey: Record<string, ServerFeedbackStatus>;
}

const EMPTY_CACHE: StatusCache = { fetchedAt: null, forwardingConfigured: null, byKey: {} };

export async function loadStatusCache(): Promise<StatusCache> {
  const raw = await loadData<StatusCache | null>(FEEDBACK_STATUS_CACHE_KEY, null);
  if (!raw || typeof raw !== 'object' || typeof raw.byKey !== 'object' || !raw.byKey) return EMPTY_CACHE;
  return raw;
}

/**
 * Оновити статуси з сервера. Статус НЕ пишеться в тіло bugs[]/ideas[] (§3.2):
 * запис належить клієнту й переписується цілком, і правка опису відкотила б
 * статус, поставлений власником. Тому — окремий локальний кеш.
 * Без мережі чи без акаунта повертає те, що вже є, без помилки.
 */
export async function refreshStatusCache(): Promise<StatusCache> {
  const cached = await loadStatusCache();
  if (!isOnlineMode() || !(await getAccessToken())) return cached;
  const res = await listFeedbackReports();
  const next: StatusCache = {
    fetchedAt: new Date().toISOString(),
    forwardingConfigured: !!res.forwarding_configured,
    byKey: statusesFromReports(res.reports ?? []),
  };
  await saveData(FEEDBACK_STATUS_CACHE_KEY, next);
  return next;
}

// ─── Реєстр локальних файлів (§11.2) ─────────────────────────────────────────

export interface LocalFile {
  uri: string;
  mime: string;
  bytes: number;
  addedAt: string;
}

export type LocalFiles = Record<string, LocalFile>;

export async function loadLocalFiles(): Promise<LocalFiles> {
  const raw = await loadData<LocalFiles | null>(FEEDBACK_FILES_KEY, null);
  return raw && typeof raw === 'object' ? raw : {};
}

function deleteFileQuietly(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (e) {
    if (__DEV__) console.warn('[feedback] не вдалося видалити файл вкладення:', e);
  }
}

/** Прибрати файли з пристрою і з реєстру — після `stored` або видалення запису. */
export async function discardLocalFiles(uids: readonly string[]): Promise<void> {
  if (!uids.length) return;
  await withStorageLock(FEEDBACK_FILES_KEY, async () => {
    const files = await loadLocalFiles();
    let changed = false;
    for (const uid of uids) {
      const file = files[uid];
      if (!file) continue;
      deleteFileQuietly(file.uri);
      delete files[uid];
      changed = true;
    }
    if (changed) await saveData(FEEDBACK_FILES_KEY, files);
  });
}

function newUid(): string {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

/** Розмір файлу, коли пікер його не повідомив; -1 — не вдалося прочитати. */
export function fileSizeOf(uri: string): number {
  try {
    const size = new File(uri).size;
    return typeof size === 'number' && size >= 0 ? size : -1;
  } catch {
    return -1;
  }
}

export interface PickedAsset extends AttachmentCandidate {
  uri: string;
}

/**
 * Скопіювати обрані файли в `documentDirectory/feedback/` (кеш пікера ОС
 * можуть почистити раніше, ніж з'явиться мережа) і записати в реєстр.
 * `evicted` — скільки найстаріших ненадісланих файлів довелося прибрати,
 * щоб не перевищити стелю 200 МБ; UI про це попереджає.
 */
export async function importPickedFiles(
  assets: readonly PickedAsset[],
): Promise<{ attachments: FeedbackAttachment[]; evicted: string[] }> {
  const dir = new Directory(Paths.document, 'feedback');
  if (!dir.exists) dir.create({ intermediates: true });
  const attachments: FeedbackAttachment[] = [];
  const added: Record<string, LocalFile> = {};
  const now = new Date().toISOString();
  for (const asset of assets) {
    const kind = attachmentKindFor(asset.mime);
    if (!kind) continue;
    const uid = newUid();
    const target = new File(dir, `${uid}.${EXT_BY_MIME[asset.mime] ?? 'bin'}`);
    new File(asset.uri).copy(target);
    added[uid] = { uri: target.uri, mime: asset.mime, bytes: asset.bytes, addedAt: now };
    attachments.push({ uid, kind, name: asset.name || target.name, bytes: asset.bytes, mime: asset.mime, state: 'local' });
  }
  const evicted = await withStorageLock(FEEDBACK_FILES_KEY, async () => {
    const files = { ...(await loadLocalFiles()), ...added };
    const drop = filesToEvict(
      Object.entries(files)
        .filter(([uid]) => !added[uid])
        .map(([uid, f]) => ({ uid, bytes: f.bytes, addedAt: f.addedAt }))
        .concat(Object.entries(added).map(([uid, f]) => ({ uid, bytes: f.bytes, addedAt: '9999' }))),
    );
    for (const uid of drop) {
      const file = files[uid];
      if (file) deleteFileQuietly(file.uri);
      delete files[uid];
    }
    await saveData(FEEDBACK_FILES_KEY, files);
    return drop;
  });
  return { attachments: attachments.filter(a => !evicted.includes(a.uid)), evicted };
}

// ─── Черга подання (§11.2) ───────────────────────────────────────────────────

export interface QueueEntry {
  kind: FeedbackKind;
  itemId: string;
  enqueuedAt: string;
  attempts: number;
  /** ms since epoch; 0 — можна одразу. */
  nextAttemptAt: number;
  lastError?: string;
}

async function loadQueue(): Promise<QueueEntry[]> {
  const raw = await loadData<QueueEntry[]>(FEEDBACK_QUEUE_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

async function updateRecord(kind: FeedbackKind, id: string, patch: (item: FeedbackRecord) => FeedbackRecord): Promise<void> {
  await updateSynced<FeedbackRecord>(COLLECTION_FOR_KIND[kind], fresh => {
    let hit = false;
    const next = fresh.map(item => {
      if (item.id !== id) return item;
      hit = true;
      return patch(item);
    });
    return hit ? next : fresh;
  });
}

/**
 * Поставити звернення в чергу й одразу спробувати надіслати. Запис уже
 * мусить лежати в сховищі (форма зберігає його перед викликом). Стан
 * `queued` ставиться тут, а не на екрані — щоб ніхто, крім черги, не
 * вирішував, що «Надіслано».
 */
export async function enqueueFeedback(kind: FeedbackKind, itemId: string, context: FeedbackRecord['context']): Promise<void> {
  await updateRecord(kind, itemId, item => ({
    ...item,
    context: context ?? item.context,
    submitState: 'queued',
    submitError: undefined,
  }));
  await withStorageLock(FEEDBACK_QUEUE_KEY, async () => {
    const queue = await loadQueue();
    const rest = queue.filter(e => !(e.kind === kind && e.itemId === itemId));
    rest.push({ kind, itemId, enqueuedAt: new Date().toISOString(), attempts: 0, nextAttemptAt: 0 });
    await saveData(FEEDBACK_QUEUE_KEY, rest);
  });
  void processFeedbackQueue();
}

/** Прибрати запис із черги (запис видалили). */
export async function dropFromQueue(kind: FeedbackKind, itemId: string): Promise<void> {
  await withStorageLock(FEEDBACK_QUEUE_KEY, async () => {
    const queue = await loadQueue();
    const next = queue.filter(e => !(e.kind === kind && e.itemId === itemId));
    if (next.length !== queue.length) await saveData(FEEDBACK_QUEUE_KEY, next);
  });
}

async function findRecord(kind: FeedbackKind, id: string): Promise<FeedbackEntry | null> {
  const list = await loadData<FeedbackRecord[]>(COLLECTION_FOR_KIND[kind], []);
  const item = Array.isArray(list) ? list.find(r => r.id === id) : undefined;
  if (!item) return null;
  return { kind, item } as FeedbackEntry;
}

type UploadOutcome = 'stored' | 'retry' | 'fail';

async function uploadFile(uploadUrl: string, file: LocalFile, name: string): Promise<UploadOutcome> {
  const url = resolveUploadUrl(getApiBase(), uploadUrl);
  if (!url) return 'fail';
  const token = await getFreshAccessToken();
  if (!token) return 'retry';
  const form = new FormData();
  // RN FormData приймає {uri, name, type} — файл стрімиться з диска, а не
  // вантажиться в памʼять JS цілком (відео до 50 МБ).
  form.append('file', { uri: file.uri, name, type: file.mime } as unknown as Blob);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'X-Flowi-Client': CLIENT_HEADER_VALUE },
      body: form,
      signal: controller.signal,
    });
    if (res.ok) return 'stored';
    return classifyError(res.status) === 'retry' ? 'retry' : 'fail';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
}

type EntryOutcome = { done: true } | { done: false; error: string; retryAfter?: number };

async function processEntry(entry: QueueEntry): Promise<EntryOutcome> {
  const found = await findRecord(entry.kind, entry.itemId);
  // Запис видалили — надсилати нічого.
  if (!found) return { done: true };

  const files = await loadLocalFiles();
  const uploadable = new Set(Object.keys(files));
  let response: SubmitResponse;
  try {
    response = await submitFeedbackReport(found, uploadable);
  } catch (e) {
    if (e instanceof OfflineError) return { done: false, error: 'offline' };
    const status = e instanceof ApiError ? e.status : 0;
    const message = e instanceof ApiError ? e.message : String(e);
    if (classifyError(status) === 'retry') return { done: false, error: message };
    await updateRecord(entry.kind, entry.itemId, item => ({ ...item, submitState: 'failed', submitError: message }));
    return { done: true };
  }

  // 2xx — і тільки тепер «Надіслано».
  const serverStates = new Map(response.attachments.map(a => [a.client_uid, a]));
  const settled = new Map<string, FeedbackAttachment['state']>();
  let pendingRetry = false;
  for (const att of found.item.attachments ?? []) {
    const server = serverStates.get(att.uid);
    if (!server) {
      // Файла на цьому пристрої немає (або його вже відхилили) — сервер
      // про нього не знає, і чекати на нього нічого.
      if (att.state === 'local') settled.set(att.uid, 'failed');
      continue;
    }
    if (server.state === 'stored' || server.state === 'delivered') {
      settled.set(att.uid, 'uploaded');
      continue;
    }
    if (server.state === 'rejected') {
      settled.set(att.uid, 'failed');
      continue;
    }
    const file = files[att.uid];
    if (!file) {
      settled.set(att.uid, 'failed');
      continue;
    }
    const outcome = await uploadFile(server.upload_url, file, att.name);
    if (outcome === 'stored') settled.set(att.uid, 'uploaded');
    else if (outcome === 'fail') settled.set(att.uid, 'failed');
    else pendingRetry = true;
  }

  await updateRecord(entry.kind, entry.itemId, item => ({
    ...item,
    reportUid: response.report_uid,
    submitState: 'sent',
    submitError: undefined,
    attachments: item.attachments?.map(a => (settled.has(a.uid) ? { ...a, state: settled.get(a.uid)! } : a)),
  }));
  await discardLocalFiles([...settled.keys()]);
  return pendingRetry ? { done: false, error: 'attachments' } : { done: true };
}

let running: Promise<void> | null = null;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleWake(queue: readonly QueueEntry[]): void {
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
  if (!queue.length) return;
  const soonest = Math.min(...queue.map(e => e.nextAttemptAt));
  const delay = Math.max(1_000, soonest - Date.now());
  wakeTimer = setTimeout(() => { void processFeedbackQueue(); }, Math.min(delay, 60 * 60_000));
}

/**
 * Прогнати чергу: кожен запис, чий час настав. Один прогін за раз — другий
 * виклик під час першого повертає той самий проміс.
 */
export function processFeedbackQueue(): Promise<void> {
  if (running) return running;
  const run = (async () => {
    if (!isOnlineMode() || !(await getAccessToken())) return;
    const snapshot = await loadQueue();
    const now = Date.now();
    const results = new Map<string, EntryOutcome>();
    for (const entry of snapshot) {
      if (entry.nextAttemptAt > now) continue;
      if (!isOnlineMode()) break;
      try {
        results.set(statusKey(entry.kind, entry.itemId), await processEntry(entry));
      } catch (e) {
        results.set(statusKey(entry.kind, entry.itemId), { done: false, error: String(e) });
      }
    }
    // Під блокуванням і від СВІЖОЇ черги: поки йшли запити, екран міг
    // поставити нове звернення, і знімок вище про нього не знає.
    const remaining = await withStorageLock(FEEDBACK_QUEUE_KEY, async () => {
      const fresh = await loadQueue();
      const next: QueueEntry[] = [];
      for (const entry of fresh) {
        const result = results.get(statusKey(entry.kind, entry.itemId));
        // Перепоставлене під час прогону (новіший enqueuedAt) — не чіпаємо.
        const original = snapshot.find(e => e.kind === entry.kind && e.itemId === entry.itemId);
        if (!result || !original || original.enqueuedAt !== entry.enqueuedAt) {
          next.push(entry);
          continue;
        }
        if (result.done) continue;
        const offline = result.error === 'offline';
        const attempts = offline ? entry.attempts : entry.attempts + 1;
        next.push({
          ...entry,
          attempts,
          nextAttemptAt: offline ? 0 : Date.now() + backoffMs(attempts, result.retryAfter),
          lastError: result.error.slice(0, 300),
        });
      }
      await saveData(FEEDBACK_QUEUE_KEY, next);
      return next;
    });
    scheduleWake(remaining);
  })();
  // Скидаємо ПІСЛЯ присвоєння: гілка «офлайн» завершує тіло синхронно, і
  // finally всередині виконався б раніше, ніж `running` отримав би проміс, —
  // черга назавжди лишилась би «зайнятою» вже виконаним прогоном.
  const tracked: Promise<void> = run.finally(() => {
    if (running === tracked) running = null;
  });
  running = tracked;
  return tracked;
}

let started = false;

/**
 * Тригери черги (§11.2): перехід offline → online, повернення застосунку на
 * передній план і сам виклик (старт застосунку / відкриття екрана).
 * Ідемпотентно — повторний виклик лише ще раз проганяє чергу.
 */
export function startFeedbackQueue(): void {
  if (!started) {
    started = true;
    subscribeOnlineMode(online => { if (online) void processFeedbackQueue(); });
    AppState.addEventListener('change', state => { if (state === 'active') void processFeedbackQueue(); });
  }
  void processFeedbackQueue();
}

/** Лише для тестів. */
export function __resetFeedbackQueueForTests(): void {
  running = null;
  if (wakeTimer) clearTimeout(wakeTimer);
  wakeTimer = null;
}
