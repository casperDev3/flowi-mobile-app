/**
 * components/feedback/model.ts — чиста модель екрана «Ідеї та баги»
 * (flowi-server-app/docs/specs/feedback-inbox.md §3.1, §7.1, §10).
 *
 * Жодних React-імпортів і нативних модулів: сюди винесено все, що має бути
 * перевірене юніт-тестом без рендера — нормалізацію легасі-записів, поля
 * форми й обов'язковість, ліміти вкладень, зібраний контекст, тіло
 * `POST /api/feedback/reports/`, розв'язання підпису стану (§10.5) і backoff
 * клієнтської черги (§11.2).
 *
 * `bugs` і `ideas` лишаються ДВОМА колекціями (§3.1, §14 п. 9): спільний тут
 * лише погляд над ними. Нові поля — необовʼязкові, старі записи читаються як є.
 */
import { NAV_GROUPS, type ModuleId } from '@/constants/nav';

// ─── Типи записів ────────────────────────────────────────────────────────────

export type FeedbackKind = 'idea' | 'bug';
export type BugSeverity = 'critical' | 'major' | 'minor';
export type IdeaPriority = 'high' | 'medium' | 'low';
/** 'planned' — застарілий статус зі старих записів, читається як 'idea'. */
export type IdeaStatus = 'idea' | 'done' | 'planned';

export type AttachmentKind = 'image' | 'video';
export type AttachmentState = 'local' | 'uploaded' | 'failed';

/**
 * Метадані вкладення в тілі запису (§3.1). `localUri` сюди НЕ потрапляє
 * ніколи: шлях до файлу живе лише в локальному реєстрі файлів пристрою
 * (api/feedback.ts), тож синк його не бачить і старіший клієнт його не зітре.
 */
export interface FeedbackAttachment {
  uid: string;
  kind: AttachmentKind;
  name: string;
  bytes: number;
  mime?: string;
  state: AttachmentState;
}

export interface FeedbackContext {
  platform: 'mobile' | 'web';
  deviceType: 'phone' | 'tablet' | 'desktop';
  appVersion: string;
  screen: string;
  osVersion?: string;
  locale?: string;
  /** Лише для показу автору; на сервер не йде — SOURCE і так знає свій воркспейс. */
  workspace?: string;
}

/**
 * 'draft' — створено, не надіслано; 'queued' — чекає мережі в клієнтській
 * черзі; 'sent' — сервер відповів 2xx (§10.5 «Надіслано»); 'failed' — сервер
 * відхилив подання (4xx), повтор без правки нічого не дасть.
 */
export type SubmitState = 'draft' | 'queued' | 'sent' | 'failed';

/**
 * Яких платформ стосується звернення — обирає автор, можна кілька. Не плутати
 * з `context.platform` (звідки надіслано). Канонічний порядок — як у сервера
 * (core/feedback/validation.py) і вебу (lib/feedback.ts).
 */
export type AffectedPlatform = 'mobile' | 'tablet' | 'web';
export const FEEDBACK_PLATFORMS: readonly AffectedPlatform[] = ['mobile', 'tablet', 'web'];

/** Лише відомі значення, без дублів, у канонічному порядку. */
export function normalizePlatforms(raw: unknown): AffectedPlatform[] {
  const list: unknown[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const picked = new Set(list.map(value => String(value).trim().toLowerCase()));
  return FEEDBACK_PLATFORMS.filter(value => picked.has(value));
}

interface FeedbackExtras {
  module?: string;
  platforms?: AffectedPlatform[];
  attachments?: FeedbackAttachment[];
  context?: FeedbackContext;
  reportUid?: string;
  submitState?: SubmitState;
  /** Причина відмови сервера, коли submitState === 'failed'. */
  submitError?: string;
  /** Легасі (Apps Script) — не видаляється, новий шлях ним не користується. */
  sentToDev?: boolean;
  updatedAt?: string;
}

export interface Idea extends FeedbackExtras {
  id: string;
  title: string;
  description: string;
  priority: IdeaPriority;
  status: IdeaStatus;
  createdAt: string;
}

export interface Bug extends FeedbackExtras {
  id: string;
  title: string;
  description: string;
  severity: BugSeverity;
  fixed: boolean;
  createdAt: string;
  steps?: string;
  expected?: string;
  actual?: string;
}

export type FeedbackRecord = Idea | Bug;

export const COLLECTION_FOR_KIND: Record<FeedbackKind, 'ideas' | 'bugs'> = { idea: 'ideas', bug: 'bugs' };

/** Уніфікований рядок списку: вид + сам запис своєї колекції. */
export type FeedbackEntry =
  | { kind: 'idea'; item: Idea }
  | { kind: 'bug'; item: Bug };

// ─── Ліміти (§7.1, §10.2) ────────────────────────────────────────────────────

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 4000;
export const STEPS_MAX = 2000;

export const MAX_ATTACHMENTS = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
/** Стеля локального кешу ненадісланих вкладень (§11.2). */
export const LOCAL_CACHE_MAX_BYTES = 200 * 1024 * 1024;

/** Закритий список (§7.1). SVG — навмисно ні: це документ зі скриптом. */
export const ALLOWED_MIMES: readonly string[] = [
  'image/png', 'image/jpeg', 'image/heic', 'image/webp', 'video/mp4', 'video/quicktime',
];

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', heic: 'image/heic',
  webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', qt: 'video/quicktime',
};

export const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/heic': 'heic', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
};

/** MIME із заявленого пікером, а коли його немає — з розширення імені. */
export function mimeFor(name: string, declared?: string | null): string {
  const clean = (declared ?? '').toLowerCase().split(';')[0].trim();
  if (clean === 'image/jpg') return 'image/jpeg';
  if (clean && clean !== 'application/octet-stream') return clean;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? clean;
}

export function attachmentKindFor(mime: string): AttachmentKind | null {
  if (!ALLOWED_MIMES.includes(mime)) return null;
  return mime.startsWith('video/') ? 'video' : 'image';
}

export function maxBytesFor(kind: AttachmentKind): number {
  return kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
}

export interface AttachmentCandidate {
  name: string;
  mime: string;
  bytes: number;
}

export type AttachmentRejection = 'too_many' | 'bad_type' | 'too_big' | 'total';

/**
 * Які з обраних файлів можна прикласти до звернення, а які ні і чому.
 * Перевіряється тут, до копіювання файлу: сервер відхилив би те саме, але
 * вже після того, як людина натиснула «Надіслати» і пішла.
 */
export function checkAttachments<T extends AttachmentCandidate>(
  existing: readonly Pick<FeedbackAttachment, 'bytes'>[],
  candidates: readonly T[],
): { accepted: T[]; rejected: { candidate: T; reason: AttachmentRejection }[] } {
  const accepted: T[] = [];
  const rejected: { candidate: T; reason: AttachmentRejection }[] = [];
  let count = existing.length;
  let total = existing.reduce((sum, a) => sum + (Number.isFinite(a.bytes) ? a.bytes : 0), 0);
  for (const candidate of candidates) {
    const kind = attachmentKindFor(candidate.mime);
    let reason: AttachmentRejection | null = null;
    if (count >= MAX_ATTACHMENTS) reason = 'too_many';
    else if (!kind) reason = 'bad_type';
    else if (!(candidate.bytes >= 0) || candidate.bytes > maxBytesFor(kind)) reason = 'too_big';
    else if (total + candidate.bytes > MAX_TOTAL_BYTES) reason = 'total';
    if (reason) {
      rejected.push({ candidate, reason });
      continue;
    }
    accepted.push(candidate);
    count += 1;
    total += candidate.bytes;
  }
  return { accepted, rejected };
}

export interface CachedFileInfo {
  uid: string;
  bytes: number;
  addedAt: string;
}

/**
 * Які локальні файли прибрати, щоб кеш ненадісланих вкладень не перевищив
 * стелю (§11.2): найстаріші першими. Мовчки з'їсти пам'ять телефона гірше,
 * ніж втратити скрін тижневої давнини — UI про це попереджає.
 */
export function filesToEvict(files: readonly CachedFileInfo[], cap: number = LOCAL_CACHE_MAX_BYTES): string[] {
  let total = files.reduce((sum, f) => sum + Math.max(0, f.bytes || 0), 0);
  if (total <= cap) return [];
  const oldestFirst = [...files].sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const evict: string[] = [];
  for (const file of oldestFirst) {
    if (total <= cap) break;
    evict.push(file.uid);
    total -= Math.max(0, file.bytes || 0);
  }
  return evict;
}

// ─── Модулі (§10.2) ──────────────────────────────────────────────────────────

/** Службові ключі поверх `ModuleId`: те, що не є розділом меню, але ламається. */
export type ServiceModule = 'other' | 'sync' | 'auth';
export type FeedbackModule = ModuleId | ServiceModule;

/**
 * Список модулів — ВИВЕДЕНИЙ із NAV_GROUPS, а не записаний поруч (§10.2):
 * два переліки розійшлися б на першому ж новому розділі. `bugs` — мертвий
 * після злиття екранів ідентифікатор (§10.1), у списку його немає.
 */
export function feedbackModules(): FeedbackModule[] {
  const seen = new Set<string>();
  const out: FeedbackModule[] = [];
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (!item.module || item.module === 'bugs' || seen.has(item.module)) continue;
      seen.add(item.module);
      out.push(item.module);
    }
  }
  return [...out, 'sync', 'auth', 'other'];
}

// ─── Нормалізація і поля ─────────────────────────────────────────────────────

export const DEFAULT_SEVERITY: BugSeverity = 'major';
export const DEFAULT_PRIORITY: IdeaPriority = 'medium';

const SEVERITIES: readonly BugSeverity[] = ['critical', 'major', 'minor'];
const PRIORITIES: readonly IdeaPriority[] = ['high', 'medium', 'low'];

export function normalizeSeverity(raw: unknown): BugSeverity {
  return SEVERITIES.includes(raw as BugSeverity) ? (raw as BugSeverity) : DEFAULT_SEVERITY;
}

export function normalizePriority(raw: unknown): IdeaPriority {
  return PRIORITIES.includes(raw as IdeaPriority) ? (raw as IdeaPriority) : DEFAULT_PRIORITY;
}

export function weightOf(entry: FeedbackEntry): BugSeverity | IdeaPriority {
  return entry.kind === 'bug' ? normalizeSeverity(entry.item.severity) : normalizePriority(entry.item.priority);
}

/** 0 — найважливіше; і для критичності, і для пріоритету. */
export function weightRank(entry: FeedbackEntry): number {
  return entry.kind === 'bug'
    ? SEVERITIES.indexOf(normalizeSeverity(entry.item.severity))
    : PRIORITIES.indexOf(normalizePriority(entry.item.priority));
}

export function isDone(entry: FeedbackEntry): boolean {
  return entry.kind === 'bug' ? !!entry.item.fixed : entry.item.status === 'done';
}

/** Ключ запису в `feedback_status` і кеші статусів (§3.2): `<kind>:<id>`. */
export function statusKey(kind: FeedbackKind, id: string): string {
  return `${kind}:${id}`;
}

export type RequiredField = 'title' | 'description' | 'steps' | 'expected' | 'actual';

export interface FeedbackDraft {
  kind: FeedbackKind;
  title: string;
  description: string;
  module: string;
  platforms: AffectedPlatform[];
  weight: BugSeverity | IdeaPriority;
  steps: string;
  expected: string;
  actual: string;
  attachments: FeedbackAttachment[];
}

export function emptyDraft(kind: FeedbackKind): FeedbackDraft {
  return {
    kind,
    title: '',
    description: '',
    module: '',
    platforms: [],
    weight: kind === 'bug' ? DEFAULT_SEVERITY : DEFAULT_PRIORITY,
    steps: '',
    expected: '',
    actual: '',
    attachments: [],
  };
}

export function draftFromEntry(entry: FeedbackEntry): FeedbackDraft {
  const base = {
    kind: entry.kind,
    title: entry.item.title ?? '',
    description: entry.item.description ?? '',
    module: entry.item.module ?? '',
    platforms: normalizePlatforms(entry.item.platforms),
    attachments: entry.item.attachments ?? [],
  };
  if (entry.kind === 'bug') {
    return {
      ...base,
      weight: normalizeSeverity(entry.item.severity),
      steps: entry.item.steps ?? '',
      expected: entry.item.expected ?? '',
      actual: entry.item.actual ?? '',
    };
  }
  return { ...base, weight: normalizePriority(entry.item.priority), steps: '', expected: '', actual: '' };
}

/**
 * Обов'язкові для НАДСИЛАННЯ поля (§10.2). Чернетку можна зберегти з самою
 * назвою — інакше думку, яку не встигли дописати, довелося б просто викинути.
 */
export function missingForSubmit(draft: Pick<FeedbackDraft, 'kind' | 'title' | 'description' | 'steps' | 'expected' | 'actual'>): RequiredField[] {
  const missing: RequiredField[] = [];
  if (!draft.title.trim()) missing.push('title');
  if (draft.kind === 'idea') {
    if (!draft.description.trim()) missing.push('description');
  } else {
    if (!draft.steps.trim()) missing.push('steps');
    if (!draft.expected.trim()) missing.push('expected');
    if (!draft.actual.trim()) missing.push('actual');
  }
  return missing;
}

/** Нова / оновлена версія запису з форми. Тип наявного запису не змінюється (§10.2). */
export function applyDraft(entry: FeedbackEntry | null, draft: FeedbackDraft, id: string, now: string): FeedbackEntry {
  const common = {
    title: draft.title.trim().slice(0, TITLE_MAX),
    description: draft.description.trim().slice(0, DESCRIPTION_MAX),
    module: draft.module || undefined,
    platforms: draft.platforms.length ? normalizePlatforms(draft.platforms) : undefined,
    attachments: draft.attachments.length ? draft.attachments : undefined,
  };
  if (draft.kind === 'bug') {
    const prev = entry?.kind === 'bug' ? entry.item : null;
    const item: Bug = {
      ...(prev ?? { id, fixed: false, createdAt: now }),
      ...common,
      severity: normalizeSeverity(draft.weight),
      steps: draft.steps.trim().slice(0, STEPS_MAX) || undefined,
      expected: draft.expected.trim().slice(0, STEPS_MAX) || undefined,
      actual: draft.actual.trim().slice(0, STEPS_MAX) || undefined,
    } as Bug;
    return { kind: 'bug', item: dropUndefined(item) };
  }
  const prev = entry?.kind === 'idea' ? entry.item : null;
  const item: Idea = {
    ...(prev ?? { id, status: 'idea' as IdeaStatus, createdAt: now }),
    ...common,
    priority: normalizePriority(draft.weight),
  } as Idea;
  return { kind: 'idea', item: dropUndefined(item) };
}

function dropUndefined<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return out as T;
}

// ─── Контекст (§10.3) ────────────────────────────────────────────────────────

const PHONE_MAX_WIDTH = 600; // Breakpoints.medium — див. constants/tokens.ts

/**
 * Шаблон маршруту без параметрів (§8.2): `/project/p-9f3/tasks?open=17` →
 * `/project/[id]/tasks`. id проєкту чи задачі — це вже дані клієнта.
 */
export function routeTemplate(path: string | null | undefined): string {
  const clean = String(path ?? '').split(/[?#]/)[0].trim();
  if (!clean) return '/';
  const parts = clean.split('/').filter(Boolean);
  const out = parts.map((part, index) => {
    if (/^\[.+\]$/.test(part)) return part;
    if (index > 0 && parts[index - 1] === 'project') return '[id]';
    if (/^\d{4,}$/.test(part)) return '[id]';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) return '[id]';
    return part;
  });
  return `/${out.join('/')}`.slice(0, 120);
}

export function buildContext(input: {
  windowWidth: number;
  appVersion: string;
  screen: string | null | undefined;
  osName?: string | null;
  osVersion?: string | null;
  locale?: string | null;
  workspace?: string | null;
}): FeedbackContext {
  const os = [input.osName, input.osVersion].filter(Boolean).join(' ').trim();
  const ctx: FeedbackContext = {
    platform: 'mobile',
    // За шириною вікна, не за Device.deviceType: у Split View на iPad застосунок
    // поводиться як телефон, і баг там — баг телефонної розкладки (§10.3).
    deviceType: input.windowWidth >= PHONE_MAX_WIDTH ? 'tablet' : 'phone',
    appVersion: input.appVersion,
    screen: routeTemplate(input.screen),
  };
  if (os) ctx.osVersion = os;
  if (input.locale) ctx.locale = input.locale;
  if (input.workspace) ctx.workspace = input.workspace;
  return ctx;
}

// ─── Тіло POST /api/feedback/reports/ (§4.1) ─────────────────────────────────

export interface SubmitPayload {
  kind: FeedbackKind;
  collection: 'ideas' | 'bugs';
  local_id: string;
  title: string;
  description: string;
  module: string;
  platforms: AffectedPlatform[];
  weight: string;
  steps?: string;
  expected?: string;
  actual?: string;
  context: Record<string, string>;
  attachments: { client_uid: string; kind: AttachmentKind; name: string; bytes: number; mime: string }[];
}

/**
 * Лише перелічені ключі контексту (§8.1): воркспейс, id пристрою, email — ні.
 * Вкладення — ті, для яких на цьому пристрої є файл (`uploadable`): метадані
 * без файлу сервер чекав би вічно.
 */
export function buildSubmitPayload(entry: FeedbackEntry, uploadable: ReadonlySet<string>): SubmitPayload {
  const { item } = entry;
  const ctx = item.context;
  const context: Record<string, string> = {};
  if (ctx) {
    context.platform = ctx.platform;
    context.device_type = ctx.deviceType;
    context.app_version = ctx.appVersion;
    context.screen = routeTemplate(ctx.screen);
    if (ctx.osVersion) context.os_version = ctx.osVersion;
    if (ctx.locale) context.locale = ctx.locale;
  }
  const attachments = (item.attachments ?? [])
    .filter(a => uploadable.has(a.uid) && a.state !== 'failed')
    .slice(0, MAX_ATTACHMENTS)
    .map(a => ({
      client_uid: a.uid,
      kind: a.kind,
      name: a.name.slice(0, 120),
      bytes: a.bytes,
      mime: a.mime ?? mimeFor(a.name),
    }));
  const payload: SubmitPayload = {
    kind: entry.kind,
    collection: COLLECTION_FOR_KIND[entry.kind],
    local_id: item.id,
    title: (item.title ?? '').slice(0, TITLE_MAX),
    description: (item.description ?? '').slice(0, DESCRIPTION_MAX),
    module: item.module ?? '',
    platforms: normalizePlatforms(item.platforms),
    weight: weightOf(entry),
    context,
    attachments,
  };
  if (entry.kind === 'bug') {
    payload.steps = (entry.item.steps ?? '').slice(0, STEPS_MAX);
    payload.expected = (entry.item.expected ?? '').slice(0, STEPS_MAX);
    payload.actual = (entry.item.actual ?? '').slice(0, STEPS_MAX);
  }
  return payload;
}

// ─── Стан звернення (§10.5) ──────────────────────────────────────────────────

/** Стан звернення на сервері (GET /api/feedback/reports/ або feedback_status). */
export interface ServerFeedbackStatus {
  reportUid: string;
  deliveryState: string;
  status: string;
  comment: string;
  duplicateOf: string | null;
  taskLinked: boolean;
  updatedAt: string | null;
}

export type FeedbackStateKey =
  | 'draft' | 'queued' | 'sent' | 'sentNew' | 'inProgress' | 'done' | 'rejected'
  | 'failed' | 'undelivered' | 'localOnly' | 'legacy';

export interface FeedbackStateView {
  key: FeedbackStateKey;
  /** Коментар власника продукту (§6.3) — показується під підписом стану. */
  comment: string;
  duplicate: boolean;
  taskLinked: boolean;
  /** Чи є сенс у кнопці «Спробувати ще». */
  retry: 'none' | 'client' | 'server';
  /** Чи можна (ще) надіслати: чернетка або клієнтська відмова. */
  canSend: boolean;
}

/**
 * Підпис стану. Головне правило (§10.5): «Надіслано» — лише після 2xx від
 * сервера. Серверний стан (якщо відомий) важливіший за локальний, бо він
 * пізніший: після 2xx усе, що відбувається далі, знає тільки сервер.
 */
export function resolveState(item: FeedbackRecord, server: ServerFeedbackStatus | null | undefined): FeedbackStateView {
  const base = { comment: '', duplicate: false, taskLinked: false, retry: 'none' as const, canSend: false };
  if (server) {
    const extras = {
      comment: server.comment ?? '',
      duplicate: !!server.duplicateOf,
      taskLinked: !!server.taskLinked,
    };
    if (server.status === 'in_progress') return { ...base, ...extras, key: 'inProgress' };
    if (server.status === 'done') return { ...base, ...extras, key: 'done' };
    if (server.status === 'rejected') return { ...base, ...extras, key: 'rejected' };
    switch (server.deliveryState) {
      case 'delivered': return { ...base, ...extras, key: 'sentNew' };
      case 'failed': return { ...base, ...extras, key: 'undelivered', retry: 'server' };
      case 'rejected': return { ...base, ...extras, key: 'undelivered' };
      case 'local_only': return { ...base, ...extras, key: 'localOnly' };
      case 'legacy_sent': return { ...base, ...extras, key: 'legacy' };
      default: return { ...base, ...extras, key: 'sent' };
    }
  }
  switch (item.submitState) {
    case 'queued': return { ...base, key: 'queued' };
    case 'sent': return { ...base, key: 'sent' };
    case 'failed': return { ...base, key: 'failed', comment: item.submitError ?? '', retry: 'client', canSend: true };
    default:
      break;
  }
  if (item.reportUid) return { ...base, key: 'sent' };
  if (item.sentToDev) return { ...base, key: 'legacy' };
  return { ...base, key: 'draft', canSend: true };
}

/** Чи вважається звернення «надісланим» для фільтра й лічильника. */
export function isSubmitted(view: FeedbackStateView): boolean {
  return view.key !== 'draft' && view.key !== 'failed' && view.key !== 'queued';
}

// ─── Черга (§11.2) ───────────────────────────────────────────────────────────

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60_000;

/** Затримка перед наступною спробою: 30 с, 1 хв, 2 хв … не більше години. */
export function backoffMs(attempts: number, retryAfterSeconds?: number | null): number {
  const exp = BACKOFF_BASE_MS * 2 ** Math.max(0, Math.min(attempts - 1, 10));
  const fromHeader = retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0;
  return Math.min(Math.max(exp, fromHeader), BACKOFF_MAX_MS);
}

/**
 * Що робити з помилкою мережевого виклику: `retry` — тимчасова (мережа,
 * таймаут, 408/429/5xx, 401 до оновлення сесії); `fail` — сервер відхилив
 * саме тіло, повтор без правки лише спалить ліміт (§14 п. 7).
 */
export function classifyError(status: number): 'retry' | 'fail' {
  if (status === 0 || status === 401 || status === 408 || status === 425 || status === 429) return 'retry';
  if (status >= 500) return 'retry';
  return 'fail';
}

// ─── Список ─────────────────────────────────────────────────────────────────

export type FeedbackFilter = 'all' | 'open' | 'done' | 'sent';
export type FeedbackSort = 'newest' | 'oldest' | 'weight';

export function combineEntries(ideas: readonly Idea[], bugs: readonly Bug[]): FeedbackEntry[] {
  return [
    ...ideas.map(item => ({ kind: 'idea' as const, item })),
    ...bugs.map(item => ({ kind: 'bug' as const, item })),
  ];
}

function createdMs(entry: FeedbackEntry): number {
  const ms = new Date(entry.item.createdAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function filterAndSort(
  entries: readonly FeedbackEntry[],
  filter: FeedbackFilter,
  sort: FeedbackSort,
  stateOf: (entry: FeedbackEntry) => FeedbackStateView,
): FeedbackEntry[] {
  const filtered = entries.filter(entry => {
    if (filter === 'open') return !isDone(entry);
    if (filter === 'done') return isDone(entry);
    if (filter === 'sent') return isSubmitted(stateOf(entry));
    return true;
  });
  return filtered.sort((a, b) => {
    if (sort === 'oldest') return createdMs(a) - createdMs(b);
    if (sort === 'weight') return weightRank(a) - weightRank(b) || createdMs(b) - createdMs(a);
    return createdMs(b) - createdMs(a);
  });
}
