/**
 * api/notifications.ts — клієнт центру сповіщень
 * (flowi-server-app/docs/specs/notifications-module.md §6, §11).
 *
 * Три шари в одному файлі, бо жоден з них не має сенсу окремо:
 *  1. REST-обгортки над `/api/notifications/…` — рівно ті форми, що віддає
 *     `core/notifications/views.py`.
 *  2. Чисті функції (злиття сторінок інбоксу, фільтр за вимкненими модулями,
 *     бейдж, оптимістичне застосування правки налаштувань) — без React і без
 *     нативних модулів, тож тестуються напряму.
 *  3. Стан центру поза React: кеш інбоксу й налаштувань в AsyncStorage,
 *     підписники, реакція на WS-сигнал `notifications_changed`. React-хуки
 *     над ним — `components/notifications/use-notification-center.ts`.
 *
 * Чого тут навмисно НЕМАЄ: локальних нагадувань ОС (це `store/notifications.ts`)
 * і реєстрації пристрою (`store/push.ts`). Цей модуль не імпортує
 * `expo-notifications`, тому його можна тягнути з будь-якого місця, зокрема з
 * рушія синку, не зачіпаючи обробник нотифікацій.
 *
 * Тексти сповіщень приходять із сервера вже відрендереними (§11) — клієнт їх
 * не перекладає. Перекладаються лише підписи категорій і подій у матриці
 * налаштувань (`components/notifications/labels.ts`).
 */
import { apiFetch } from '@/store/api';
import { getApiBase } from '@/store/api-config';
import { isOnlineMode } from '@/store/app-mode';
import { loadData, saveData } from '@/store/storage';
import { isModuleEnabled } from '@/store/ui-preferences';
import { modulesForEvent } from '@/utils/pushLink';

export { modulesForEvent };

// ─── Контракт ────────────────────────────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'push' | 'email';
export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['in_app', 'push', 'email'];

export type NotificationCategory = 'tasks_projects' | 'meetings_finance' | 'training_health' | 'system';

export interface InboxItem {
  id: string;
  seq: number;
  category: string;
  event_type: string;
  severity: string;
  title: string;
  body: string;
  actor: { id: number | string; name: string } | null;
  project: { id: string; name: string; color: string } | null;
  collection: string;
  local_id: string;
  payload: { url?: string; web_url?: string; vars?: Record<string, unknown> } & Record<string, unknown>;
  collapse_count: number;
  created_at: string;
  read_at: string | null;
}

export interface InboxPage {
  cursor: number;
  unread_count: number;
  items: InboxItem[];
  next_before: number | null;
  has_more: boolean;
}

export interface CountResponse {
  unread_count: number;
  cursor: number;
}

export type ChannelFlags = Record<NotificationChannel, boolean>;

export interface PreferenceEvent {
  key: string;
  label: string;
  channels: ChannelFlags;
  default_channels?: ChannelFlags;
  overridden: boolean;
}

export interface PreferenceCategory {
  key: string;
  label: string;
  channels: ChannelFlags;
  events: PreferenceEvent[];
}

export interface PreferencesDoc {
  revision: number;
  enabled: boolean;
  push_enabled: boolean;
  email_enabled: boolean;
  quiet_hours: { enabled: boolean; start: string | null; end: string | null };
  digest: { enabled: boolean; hour: number };
  timezone: string;
  timezone_pinned?: boolean;
  lang: string;
  lang_pinned?: boolean;
  meeting_lead_minutes: number;
  channels: NotificationChannel[];
  available_channels?: Partial<Record<'in_app' | 'push_expo' | 'push_web' | 'email', boolean>>;
  categories: PreferenceCategory[];
}

/** Часткове тіло `PATCH /notifications/preferences/` (§6.3). */
export interface PreferencesPatch {
  enabled?: boolean;
  push_enabled?: boolean;
  email_enabled?: boolean;
  quiet_hours?: { enabled?: boolean; start?: string; end?: string };
  digest?: { enabled?: boolean; hour?: number };
  meeting_lead_minutes?: number;
  categories?: Record<string, Partial<Record<NotificationChannel, boolean | null>> | null>;
  events?: Record<string, Partial<Record<NotificationChannel, boolean | null>> | null>;
}

export interface DeviceRegistrationBody {
  kind: 'expo';
  token: string;
  platform: 'ios' | 'android';
  device_name?: string;
  app_version?: string;
  lang?: string;
  timezone?: string;
}

/** `{"ids": [...]}` | `{"all": true}` | `{"before_seq": n}` — як у `_parse_selector`. */
export type InboxSelector = { ids: string[] } | { all: true } | { before_seq: number };

/** Поле `notifications` у `GET /api/workspace/` (§6.6). */
export interface NotificationsCapability {
  protocol: number;
  channels: string[];
  server_reminders: string[];
}

// ─── REST ────────────────────────────────────────────────────────────────────

const BASE = '/notifications';

function query(params: Record<string, string | number | undefined | null>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function fetchInboxPage(
  params: { after?: number; before?: number; limit?: number; unread?: boolean; category?: string } = {},
): Promise<InboxPage> {
  return apiFetch<InboxPage>(`${BASE}/${query({
    after: params.after,
    before: params.before,
    limit: params.limit,
    unread: params.unread ? 1 : undefined,
    category: params.category,
  })}`);
}

export function postMarkRead(selector: InboxSelector): Promise<CountResponse> {
  return apiFetch<CountResponse>(`${BASE}/read/`, { method: 'POST', body: selector });
}

export function postArchive(selector: InboxSelector): Promise<CountResponse> {
  return apiFetch<CountResponse>(`${BASE}/archive/`, { method: 'POST', body: selector });
}

export function fetchUnreadCount(): Promise<CountResponse> {
  return apiFetch<CountResponse>(`${BASE}/unread-count/`);
}

export function fetchPreferences(): Promise<PreferencesDoc> {
  return apiFetch<PreferencesDoc>(`${BASE}/preferences/`);
}

/**
 * `If-Match: <revision>` (§6.3): сервер відхиляє правку поверх застарілої
 * ревізії як `409 stale_preferences`. Тіло завжди ЧАСТКОВЕ — лише те поле,
 * яке людина щойно змінила, — тож після 409 `updatePreferences` перечитує
 * документ і повторює ту саму правку поверх свіжої ревізії.
 * Без `revision` заголовок не шлеться, і сервер застосовує правку як є.
 */
export function patchPreferences(patch: PreferencesPatch, revision?: number): Promise<PreferencesDoc> {
  return apiFetch<PreferencesDoc>(`${BASE}/preferences/`, {
    method: 'PATCH',
    body: patch,
    ...(typeof revision === 'number' ? { headers: { 'If-Match': String(revision) } } : {}),
  });
}

/** 409 `stale_preferences` — документ змінили на іншому пристрої. */
export function isStalePreferences(error: unknown): boolean {
  // Структурна перевірка замість instanceof ApiError: так само розпізнає
  // помилку й там, де store/api підмінено (тести).
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: unknown; code?: unknown };
  return e.status === 409 && e.code === 'stale_preferences';
}

export function postDevice(body: DeviceRegistrationBody): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/devices/`, { method: 'POST', body });
}

export function deleteDevice(token: string): Promise<unknown> {
  return apiFetch<unknown>(`${BASE}/devices/`, { method: 'DELETE', body: { token } });
}

/**
 * `notifications` з `GET /api/workspace/` — публічний ендпоінт, тож без
 * авторизації. `null` — сервер модуля не має (старий сервер) або поле
 * некоректне: тоді клієнт поводиться як раніше і планує все локально.
 */
export async function fetchNotificationsCapability(): Promise<NotificationsCapability | null> {
  const info = await apiFetch<{ notifications?: unknown }>('/workspace/', { auth: false });
  return parseCapability(info?.notifications);
}

export function parseCapability(raw: unknown): NotificationsCapability | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const reminders = Array.isArray(source.server_reminders)
    ? source.server_reminders.filter((item): item is string => typeof item === 'string')
    : [];
  const channels = Array.isArray(source.channels)
    ? source.channels.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    protocol: typeof source.protocol === 'number' ? source.protocol : 1,
    channels,
    server_reminders: reminders,
  };
}

/** 404/405 — на цьому сервері модуля сповіщень ще немає. */
export function isModuleMissing(error: unknown): boolean {
  // Качина типізація замість `instanceof ApiError`: помилку міг кинути мок
  // чи інша копія модуля, а важить лише HTTP-статус.
  const status = (error as { status?: unknown } | null)?.status;
  return status === 404 || status === 405;
}

function isOffline(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'OfflineError';
}

// ─── Серверні нагадування замість локальних (§10.3) ─────────────────────────

/**
 * Ключ, у якому лежить рішення «які нагадування вже шле сервер». Його
 * читає `store/notifications.ts` (там той самий літерал — імпорт звідси
 * потягнув би в планувальник локальних нагадувань увесь HTTP-клієнт).
 */
export const SERVER_REMINDERS_KEY = 'notifications_server_reminders_v1';

/**
 * Перша збірка, на яку сервер шле серверні нагадування
 * (`core/notifications/registry.py::MIN_VERSION_SERVER_REMINDERS`). Нижчій
 * версії сервер нагадувань не шле взагалі (другий запобіжник §10.3), тож
 * вимикати на ній локальні означало б лишити людину без жодного.
 */
export const MIN_VERSION_SERVER_REMINDERS = '1.2.0';

/** Події, які вміє замінити саме цей клієнт (інші коди зі списку ігноруються). */
export const REPLACEABLE_LOCAL_REMINDERS = ['task.reminder', 'meeting.reminder', 'subscription.due_today'] as const;

export interface ServerRemindersRecord {
  origin: string;
  userId: string;
  events: string[];
  appVersion: string;
  at: string;
}

export function compareVersions(a: string, b: string): number {
  const parse = (raw: string) => {
    const parts = String(raw || '').split('.').slice(0, 3).map(chunk => {
      const digits = chunk.replace(/\D/g, '');
      return digits ? parseInt(digits, 10) : 0;
    });
    while (parts.length < 3) parts.push(0);
    return parts;
  };
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Які локальні нагадування цьому пристрою вже НЕ треба планувати.
 *
 * Порожньо, якщо хоч одна умова не виконана: сервер не оголосив подію,
 * збірка нижча за поріг сервера, або пристрій не зареєстрований для push
 * (`deviceRegistered=false` — сервер фізично не має куди надіслати, і
 * локальне нагадування лишається єдиним).
 */
export function serverReminderEvents(input: {
  capability: NotificationsCapability | null;
  appVersion: string;
  deviceRegistered: boolean;
}): string[] {
  if (!input.capability || !input.deviceRegistered) return [];
  if (compareVersions(input.appVersion, MIN_VERSION_SERVER_REMINDERS) < 0) return [];
  const announced = new Set(input.capability.server_reminders);
  return REPLACEABLE_LOCAL_REMINDERS.filter(code => announced.has(code));
}

export async function saveServerRemindersRecord(record: ServerRemindersRecord | null): Promise<void> {
  const prev = await loadData<ServerRemindersRecord | null>(SERVER_REMINDERS_KEY, null);
  if (JSON.stringify(prev) === JSON.stringify(record)) return;
  await saveData(SERVER_REMINDERS_KEY, record);
}

// ─── Модулі інтерфейсу (ui_preferences) ─────────────────────────────────────

export function isEventVisible(eventType: string, disabledModules: readonly string[]): boolean {
  return modulesForEvent(eventType).every(module => isModuleEnabled(disabledModules, module));
}

/**
 * Призначення на НАРАДУ приходить тим самим `task.assigned` (варіант
 * `meeting`) — його модуль «Наради», а не «Проєкти».
 */
export function isInboxItemVisible(item: Pick<InboxItem, 'event_type' | 'collection'>, disabled: readonly string[]): boolean {
  if (item.collection === 'meetings' && !isModuleEnabled(disabled, 'meetings')) return false;
  return isEventVisible(item.event_type, disabled);
}

export function visibleInboxItems(items: readonly InboxItem[], disabled: readonly string[]): InboxItem[] {
  if (!disabled.length) return items as InboxItem[];
  return items.filter(item => isInboxItemVisible(item, disabled));
}

/**
 * Бейдж = серверний лічильник мінус непрочитані події вимкнених модулів.
 *
 * Сервер про `ui_preferences` не знає і рахує все. Відняти можна лише те,
 * що лежить у кеші (останні 100) — приховані непрочитані глибше в історії
 * бейдж ще врахує, але це межа, а не звична ситуація.
 */
export function visibleUnreadCount(
  serverUnread: number,
  items: readonly InboxItem[],
  disabled: readonly string[],
): number {
  if (!disabled.length) return Math.max(0, serverUnread);
  const hidden = items.filter(item => !item.read_at && !isInboxItemVisible(item, disabled)).length;
  return Math.max(0, serverUnread - hidden);
}

// ─── Злиття інбоксу ─────────────────────────────────────────────────────────

export const INBOX_CACHE_LIMIT = 100;

/**
 * Нові записи поверх наявних: той самий `id` — замінюється (злиття подій
 * піднімає `seq` і міняє текст того самого запису), порядок — `seq` спадно.
 */
export function mergeInboxItems(
  existing: readonly InboxItem[],
  incoming: readonly InboxItem[],
  limit: number = INBOX_CACHE_LIMIT,
): InboxItem[] {
  const byId = new Map<string, InboxItem>();
  for (const item of existing) byId.set(item.id, item);
  for (const item of incoming) {
    if (item && typeof item.id === 'string') byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => b.seq - a.seq).slice(0, limit);
}

/**
 * Верхня сторінка — повна правда про свій діапазон `seq`: запис, що був у кеші
 * в цьому діапазоні, а в сторінці відсутній, заархівували (чи приглушили) на
 * іншому пристрої. Старші за сторінку записи не чіпаються.
 */
export function applyTopPage(existing: readonly InboxItem[], page: InboxPage, limit = INBOX_CACHE_LIMIT): InboxItem[] {
  const items = Array.isArray(page.items) ? page.items : [];
  if (!items.length) return page.has_more ? mergeInboxItems(existing, [], limit) : [];
  const floor = page.has_more ? items[items.length - 1].seq : -Infinity;
  const kept = existing.filter(item => item.seq < floor);
  return mergeInboxItems(kept, items, limit);
}

export function markItemsRead(items: readonly InboxItem[], ids: ReadonlySet<string> | 'all', now: string): InboxItem[] {
  return items.map(item => {
    if (item.read_at) return item;
    if (ids !== 'all' && !ids.has(item.id)) return item;
    return { ...item, read_at: now };
  });
}

// ─── Налаштування: оптимістична правка ──────────────────────────────────────

/**
 * Застосувати часткову правку до документа так, як її застосує сервер —
 * щоб перемикач зреагував у тому ж кадрі. Відповідь сервера потім замінює
 * документ цілком, тож тут досить збігтися з ним у звичайному випадку.
 */
export function applyPreferencesPatch(doc: PreferencesDoc, patch: PreferencesPatch): PreferencesDoc {
  const next: PreferencesDoc = {
    ...doc,
    quiet_hours: { ...doc.quiet_hours },
    digest: { ...doc.digest },
    categories: doc.categories.map(category => ({
      ...category,
      channels: { ...category.channels },
      events: category.events.map(event => ({ ...event, channels: { ...event.channels } })),
    })),
  };
  if (typeof patch.enabled === 'boolean') next.enabled = patch.enabled;
  if (typeof patch.push_enabled === 'boolean') next.push_enabled = patch.push_enabled;
  if (typeof patch.email_enabled === 'boolean') next.email_enabled = patch.email_enabled;
  if (patch.quiet_hours) {
    const q = patch.quiet_hours;
    if (typeof q.enabled === 'boolean') next.quiet_hours.enabled = q.enabled;
    if (typeof q.start === 'string') next.quiet_hours.start = q.start;
    if (typeof q.end === 'string') next.quiet_hours.end = q.end;
  }
  if (patch.digest) {
    if (typeof patch.digest.enabled === 'boolean') next.digest.enabled = patch.digest.enabled;
    if (typeof patch.digest.hour === 'number') next.digest.hour = patch.digest.hour;
  }
  if (typeof patch.meeting_lead_minutes === 'number') next.meeting_lead_minutes = patch.meeting_lead_minutes;

  for (const [categoryKey, channels] of Object.entries(patch.categories ?? {})) {
    const category = next.categories.find(c => c.key === categoryKey);
    if (!category || !channels) continue;
    for (const [channel, value] of Object.entries(channels) as [NotificationChannel, boolean | null][]) {
      if (typeof value !== 'boolean') continue;
      category.channels[channel] = value;
      // Рядок категорії діє на події БЕЗ власного вибору (§4.4, резолюція).
      for (const event of category.events) {
        if (!event.overridden) event.channels[channel] = value;
      }
    }
  }
  for (const [eventKey, channels] of Object.entries(patch.events ?? {})) {
    for (const category of next.categories) {
      const event = category.events.find(e => e.key === eventKey);
      if (!event) continue;
      if (channels === null) {
        // Скинути до типового: канали події знову беруться з категорії.
        event.overridden = false;
        event.channels = { ...category.channels };
        continue;
      }
      for (const [channel, value] of Object.entries(channels) as [NotificationChannel, boolean | null][]) {
        if (typeof value === 'boolean') {
          event.channels[channel] = value;
          event.overridden = true;
        }
      }
    }
  }
  return next;
}

/** Правка «весь канал категорії»: скидає й окремі вибори подій цієї категорії, щоб рядок категорії справді діяв на всі. */
export function categoryChannelPatch(
  doc: PreferencesDoc,
  categoryKey: string,
  channel: NotificationChannel,
  value: boolean,
): PreferencesPatch {
  const category = doc.categories.find(c => c.key === categoryKey);
  const events: NonNullable<PreferencesPatch['events']> = {};
  for (const event of category?.events ?? []) {
    if (event.overridden && event.channels[channel] !== value) events[event.key] = { [channel]: null };
  }
  const patch: PreferencesPatch = { categories: { [categoryKey]: { [channel]: value } } };
  if (Object.keys(events).length) patch.events = events;
  return patch;
}

/** 'HH:MM' → хвилини від півночі; некоректне → null. */
export function parseHm(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const hour = parseInt(m[1], 10), minute = parseInt(m[2], 10);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Хвилини → 'HH:MM', з обгортанням через північ (крок назад від 00:00 — 23:30). */
export function formatHm(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(wrapped / 60), minute = wrapped % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// ─── Стан центру (поза React) ───────────────────────────────────────────────

export const INBOX_CACHE_KEY = 'notifications_inbox_v1';
export const PREFERENCES_CACHE_KEY = 'notification_prefs_v1';
/** Дублює `store/auth.tsx` `USER_CACHE_KEY` — імпорт звідти замкнув би цикл через `store/push.ts`. */
const AUTH_USER_CACHE_KEY = 'auth_user';

export type CenterStatus = 'idle' | 'loading' | 'ready' | 'error' | 'offline' | 'unavailable';

export interface InboxState {
  items: InboxItem[];
  cursor: number;
  serverUnread: number;
  nextBefore: number | null;
  hasMore: boolean;
  status: CenterStatus;
  loadingMore: boolean;
  /** Коли востаннє вдалося отримати сторінку з сервера (мс). */
  syncedAt: number | null;
}

export interface PreferencesState {
  doc: PreferencesDoc | null;
  status: CenterStatus;
  saving: boolean;
  error: string | null;
}

interface CacheOwner { origin: string; userId: string }
interface InboxCache extends CacheOwner {
  items: InboxItem[];
  cursor: number;
  serverUnread: number;
  nextBefore: number | null;
  hasMore: boolean;
  syncedAt: number | null;
}
interface PreferencesCache extends CacheOwner { doc: PreferencesDoc }

const emptyInbox: InboxState = {
  items: [],
  cursor: 0,
  serverUnread: 0,
  nextBefore: null,
  hasMore: false,
  status: 'idle',
  loadingMore: false,
  syncedAt: null,
};

let inbox: InboxState = emptyInbox;
let prefs: PreferencesState = { doc: null, status: 'idle', saving: false, error: null };
let hydrated: Promise<void> | null = null;

const inboxListeners = new Set<(state: InboxState) => void>();
const prefsListeners = new Set<(state: PreferencesState) => void>();

export function getInboxState(): InboxState { return inbox; }
export function getPreferencesState(): PreferencesState { return prefs; }

export function subscribeInbox(listener: (state: InboxState) => void): () => void {
  inboxListeners.add(listener);
  return () => { inboxListeners.delete(listener); };
}

export function subscribePreferences(listener: (state: PreferencesState) => void): () => void {
  prefsListeners.add(listener);
  return () => { prefsListeners.delete(listener); };
}

function setInbox(next: Partial<InboxState>): void {
  inbox = { ...inbox, ...next };
  for (const listener of [...inboxListeners]) listener(inbox);
}

function setPrefs(next: Partial<PreferencesState>): void {
  prefs = { ...prefs, ...next };
  for (const listener of [...prefsListeners]) listener(prefs);
}

async function currentOwner(): Promise<CacheOwner | null> {
  const user = await loadData<{ id?: string | number } | null>(AUTH_USER_CACHE_KEY, null);
  if (!user?.id) return null;
  return { origin: getApiBase(), userId: String(user.id) };
}

/**
 * Мережу чіпаємо лише онлайн і з акаунтом: запит гостя дав би 401, а
 * `apiFetch` на 401 оголошує «сесія закінчилась» — зайвий вихід на рівному місці.
 */
async function canReachServer(): Promise<boolean> {
  return isOnlineMode() && (await currentOwner()) !== null;
}

function sameOwner(a: CacheOwner | null, b: CacheOwner | null): boolean {
  return !!a && !!b && a.origin === b.origin && a.userId === b.userId;
}

/**
 * Кеш читається один раз за процес і лише свій: сповіщення іншого акаунта чи
 * іншого workspace на цьому пристрої не показуються навіть на мить.
 */
export function hydrateNotificationCenter(): Promise<void> {
  if (hydrated) return hydrated;
  hydrated = (async () => {
    const owner = await currentOwner();
    const [cachedInbox, cachedPrefs] = await Promise.all([
      loadData<InboxCache | null>(INBOX_CACHE_KEY, null),
      loadData<PreferencesCache | null>(PREFERENCES_CACHE_KEY, null),
    ]);
    if (cachedInbox && sameOwner(owner, cachedInbox) && Array.isArray(cachedInbox.items)) {
      setInbox({
        items: cachedInbox.items,
        cursor: cachedInbox.cursor ?? 0,
        serverUnread: cachedInbox.serverUnread ?? 0,
        nextBefore: cachedInbox.nextBefore ?? null,
        hasMore: !!cachedInbox.hasMore,
        syncedAt: cachedInbox.syncedAt ?? null,
      });
    }
    if (cachedPrefs && sameOwner(owner, cachedPrefs) && cachedPrefs.doc) {
      setPrefs({ doc: cachedPrefs.doc });
    }
  })().catch(e => {
    if (__DEV__) console.warn('[notification-center] кеш не прочитався:', e);
  });
  return hydrated;
}

async function persistInbox(): Promise<void> {
  const owner = await currentOwner();
  if (!owner) return;
  const cache: InboxCache = {
    ...owner,
    items: inbox.items.slice(0, INBOX_CACHE_LIMIT),
    cursor: inbox.cursor,
    serverUnread: inbox.serverUnread,
    nextBefore: inbox.nextBefore,
    hasMore: inbox.hasMore,
    syncedAt: inbox.syncedAt,
  };
  try {
    await saveData(INBOX_CACHE_KEY, cache);
  } catch (e) {
    if (__DEV__) console.warn('[notification-center] кеш інбоксу не записався:', e);
  }
}

async function persistPreferences(): Promise<void> {
  const owner = await currentOwner();
  if (!owner || !prefs.doc) return;
  try {
    await saveData(PREFERENCES_CACHE_KEY, { ...owner, doc: prefs.doc } satisfies PreferencesCache);
  } catch (e) {
    if (__DEV__) console.warn('[notification-center] кеш налаштувань не записався:', e);
  }
}

function statusForError(error: unknown): CenterStatus {
  if (isOffline(error)) return 'offline';
  if (isModuleMissing(error)) return 'unavailable';
  return 'error';
}

let inboxInFlight: Promise<void> | null = null;

/**
 * Підтягнути верхню сторінку інбоксу. Одна сторінка, а не `?after=cursor`:
 * вона ж приносить і прочитаність/архів, змінені на іншому пристрої, —
 * інкрементальний pull бачив би лише нові `seq`.
 * Паралельні виклики (фокус екрана + WS-сигнал) зливаються в один запит.
 */
export function refreshInbox(): Promise<void> {
  if (inboxInFlight) return inboxInFlight;
  inboxInFlight = (async () => {
    await hydrateNotificationCenter();
    if (!(await canReachServer())) {
      setInbox({ status: 'offline' });
      return;
    }
    if (inbox.status !== 'ready') setInbox({ status: 'loading' });
    try {
      const page = await fetchInboxPage({ limit: 50 });
      const items = applyTopPage(inbox.items, page);
      const keepTail = page.has_more && inbox.items.length > page.items.length;
      setInbox({
        items,
        cursor: page.cursor,
        serverUnread: page.unread_count,
        nextBefore: keepTail ? (inbox.nextBefore ?? page.next_before) : page.next_before,
        hasMore: page.has_more,
        status: 'ready',
        syncedAt: Date.now(),
      });
      await persistInbox();
    } catch (e) {
      const status = statusForError(e);
      setInbox({ status });
      if (__DEV__ && status === 'error') console.warn('[notification-center] інбокс не оновився:', e);
    }
  })().finally(() => { inboxInFlight = null; });
  return inboxInFlight;
}

export async function loadMoreInbox(): Promise<void> {
  if (!inbox.hasMore || inbox.loadingMore || inbox.nextBefore === null) return;
  setInbox({ loadingMore: true });
  try {
    const page = await fetchInboxPage({ before: inbox.nextBefore, limit: 50 });
    setInbox({
      items: mergeInboxItems(inbox.items, page.items, Number.MAX_SAFE_INTEGER),
      nextBefore: page.next_before,
      hasMore: page.has_more,
      serverUnread: page.unread_count,
      loadingMore: false,
    });
  } catch (e) {
    setInbox({ loadingMore: false });
    if (__DEV__) console.warn('[notification-center] наступна сторінка не завантажилась:', e);
  }
}

/** Оптимістично: бейдж і картка реагують одразу, відповідь сервера лише уточнює лічильник. */
export async function markNotificationsRead(ids: string[]): Promise<void> {
  const unique = new Set(ids);
  if (!unique.size) return;
  const known = inbox.items.filter(item => unique.has(item.id));
  const newlyRead = known.filter(item => !item.read_at).length;
  // Усі вже в кеші й прочитані — нема чого слати. Невідомий кешу id (тап
  // по пушу на холодному старті) — шлемо: сервер знає його краще за нас.
  if (known.length === unique.size && !newlyRead) return;
  setInbox({
    items: markItemsRead(inbox.items, unique, new Date().toISOString()),
    serverUnread: Math.max(0, inbox.serverUnread - newlyRead),
  });
  try {
    const res = await postMarkRead({ ids: [...unique] });
    setInbox({ serverUnread: res.unread_count, cursor: Math.max(inbox.cursor, res.cursor) });
    await persistInbox();
  } catch (e) {
    if (__DEV__) console.warn('[notification-center] позначка «прочитано» не дійшла:', e);
    void refreshInbox();
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  setInbox({ items: markItemsRead(inbox.items, 'all', new Date().toISOString()), serverUnread: 0 });
  try {
    // `before_seq` замість `all`: сповіщення, що прилетіло вже після того, як
    // людина натиснула кнопку, не має стати прочитаним непобаченим.
    const res = await postMarkRead(inbox.cursor > 0 ? { before_seq: inbox.cursor } : { all: true });
    setInbox({ serverUnread: res.unread_count });
    await persistInbox();
  } catch (e) {
    if (__DEV__) console.warn('[notification-center] «прочитати всі» не дійшло:', e);
    void refreshInbox();
  }
}

export async function archiveNotifications(ids: string[]): Promise<void> {
  const unique = new Set(ids);
  const removedUnread = inbox.items.filter(item => unique.has(item.id) && !item.read_at).length;
  setInbox({
    items: inbox.items.filter(item => !unique.has(item.id)),
    serverUnread: Math.max(0, inbox.serverUnread - removedUnread),
  });
  try {
    const res = await postArchive({ ids: [...unique] });
    setInbox({ serverUnread: res.unread_count });
    await persistInbox();
  } catch (e) {
    if (__DEV__) console.warn('[notification-center] архівування не дійшло:', e);
    void refreshInbox();
  }
}

/** Найдешевший запит — для бейджа на холодному старті й поверненні з фону. */
export async function refreshUnreadCount(): Promise<void> {
  await hydrateNotificationCenter();
  if (!(await canReachServer())) return;
  try {
    const res = await fetchUnreadCount();
    const moved = res.cursor !== inbox.cursor || res.unread_count !== inbox.serverUnread;
    setInbox({ serverUnread: res.unread_count });
    if (moved || inbox.syncedAt === null) {
      await refreshInbox();
    } else {
      await persistInbox();
    }
  } catch (e) {
    if (isModuleMissing(e)) setInbox({ status: 'unavailable' });
  }
}

let prefsInFlight: Promise<void> | null = null;

export function refreshPreferences(): Promise<void> {
  if (prefsInFlight) return prefsInFlight;
  prefsInFlight = (async () => {
    await hydrateNotificationCenter();
    if (!(await canReachServer())) {
      setPrefs({ status: 'offline' });
      return;
    }
    if (!prefs.doc) setPrefs({ status: 'loading' });
    try {
      const doc = await fetchPreferences();
      setPrefs({ doc, status: 'ready', error: null });
      await persistPreferences();
    } catch (e) {
      setPrefs({ status: statusForError(e) });
    }
  })().finally(() => { prefsInFlight = null; });
  return prefsInFlight;
}

let patchQueue: Promise<void> = Promise.resolve();

/**
 * Правка налаштувань: оптимістично в стан, потім PATCH по черзі (два швидкі
 * перемикачі поспіль не мають обігнати один одного в мережі). Відповідь —
 * повний документ із новою ревізією — замінює локальний; помилка повертає
 * серверну правду і кидає далі, щоб екран показав, що не збереглось.
 */
export function updatePreferences(patch: PreferencesPatch): Promise<void> {
  if (prefs.doc) setPrefs({ doc: applyPreferencesPatch(prefs.doc, patch), saving: true, error: null });
  const run = async () => {
    try {
      let doc: PreferencesDoc;
      try {
        doc = await patchPreferences(patch, prefs.doc?.revision);
      } catch (e) {
        if (!isStalePreferences(e)) throw e;
        // Хтось змінив налаштування паралельно: беремо свіжу ревізію і
        // повторюємо ту саму часткову правку один раз.
        const fresh = await fetchPreferences();
        setPrefs({ doc: applyPreferencesPatch(fresh, patch) });
        doc = await patchPreferences(patch, fresh.revision);
      }
      setPrefs({ doc, status: 'ready', saving: false, error: null });
      await persistPreferences();
    } catch (e) {
      setPrefs({ saving: false, error: e instanceof Error ? e.message : String(e) });
      await refreshPreferences();
      throw e;
    }
  };
  const result = patchQueue.then(run, run);
  patchQueue = result.catch(() => {});
  return result;
}

let signalTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * WS-сигнал `notifications_changed` (§6.2). Даних сповіщення він не несе:
 * `unread` одразу йде в бейдж, а по список — REST (з дебаунсом, бо батч
 * сервера може прислати кілька сигналів поспіль). `settings_revision` новіша
 * за нашу — налаштування змінили на іншому пристрої, перечитуємо.
 */
export function handleNotificationsSignal(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false;
  const msg = message as { type?: unknown; cursor?: unknown; unread?: unknown; settings_revision?: unknown };
  if (msg.type !== 'notifications_changed') return false;

  if (typeof msg.settings_revision === 'number') {
    if (!prefs.doc || msg.settings_revision > prefs.doc.revision) void refreshPreferences();
  }
  if (typeof msg.unread === 'number') setInbox({ serverUnread: msg.unread });
  const cursorMoved = typeof msg.cursor === 'number' && msg.cursor !== inbox.cursor;
  const unreadDiffers = typeof msg.unread === 'number';
  if (cursorMoved || unreadDiffers) {
    if (signalTimer) clearTimeout(signalTimer);
    signalTimer = setTimeout(() => {
      signalTimer = null;
      void refreshInbox();
    }, 300);
  }
  return true;
}

/** Сире повідомлення сокета (рядок JSON) — для `store/sync-engine.tsx`. */
export function handleNotificationsSocketData(data: unknown): boolean {
  if (typeof data !== 'string') return handleNotificationsSignal(data);
  try {
    return handleNotificationsSignal(JSON.parse(data));
  } catch {
    return false;
  }
}

/** Вихід / зміна workspace: у пам'яті й на диску не лишається чужих сповіщень. */
export async function resetNotificationCenter(): Promise<void> {
  if (signalTimer) {
    clearTimeout(signalTimer);
    signalTimer = null;
  }
  setInbox({ ...emptyInbox });
  setPrefs({ doc: null, status: 'idle', saving: false, error: null });
  await Promise.all([
    saveData(INBOX_CACHE_KEY, null).catch(() => {}),
    saveData(PREFERENCES_CACHE_KEY, null).catch(() => {}),
    saveData(SERVER_REMINDERS_KEY, null).catch(() => {}),
  ]);
  // Наступний вхід мусить прочитати кеш (порожній) і мережу заново.
  hydrated = null;
}
