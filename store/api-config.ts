/**
 * store/api-config.ts — найнижчий шар адреси активного workspace.
 *
 * Навмисно без залежності від AsyncStorage (`./storage`): це той самий модуль,
 * що й `store/api.ts` та `store/sync-engine.tsx` тягнуть на КОЖЕН запит/сокет,
 * і купа тестів (`api.test.ts`, `api-refresh.test.ts`, …) мокає лише
 * `expo-secure-store`/`fetch`, не AsyncStorage. Персистентність, мережеву
 * перевірку `/api/workspace/` і нормалізацію адреси робить `store/workspace.ts`
 * — він імпортує звідси кеш і пише в нього через `setCachedWorkspace`.
 *
 * Раніше тут лежали хардкоджені `API_BASE`/`WS_BASE`; тепер адреса — рантайм
 * вибір користувача на екрані «Адреса workspace» (контракт §0.1/§2).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Flowi Cloud (rc1, 2026-11-22): API живе на api.flowi.com.ua. Self-host /
 * стенд перевизначає адресу на етапі збірки через EXPO_PUBLIC_FLOWI_API_ORIGIN
 * (Metro вбудовує EXPO_PUBLIC_* у бандл) — без правки коду.
 */
export const FLOWI_CLOUD_ORIGIN = 'https://api.flowi.com.ua';

/**
 * Попередні адреси того самого Flowi Cloud. Сервер на них і далі відповідає
 * (Caddy проксіює /api, /ws для N-1 клієнтів), тож це ТОЙ САМИЙ workspace —
 * див. docs/release-rc1/identity-signing-domains.md, таблиця хостів.
 */
export const LEGACY_CLOUD_ORIGINS: readonly string[] = ['https://api.flowi.casperdev.site'];

function envOrigin(): string | null {
  const raw = (process.env.EXPO_PUBLIC_FLOWI_API_ORIGIN ?? '').trim().replace(/\/+$/, '').replace(/\/api$/i, '');
  return /^https?:\/\/[^\s/]+$/i.test(raw) ? raw : null;
}

export const DEFAULT_WORKSPACE_ORIGIN: string = envOrigin() ?? FLOWI_CLOUD_ORIGIN;

/** Стара адреса Flowi Cloud → нова; будь-яка інша лишається як є. */
export function canonicalCloudOrigin(origin: string): string {
  const o = origin.replace(/\/+$/, '');
  return LEGACY_CLOUD_ORIGINS.some((l) => l.toLowerCase() === o.toLowerCase()) ? FLOWI_CLOUD_ORIGIN : o;
}

export const CLIENT_VERSION: string =
  (Constants.expoConfig?.version as string | undefined) ?? '1.4.0';

/** Контракт §0.4 знає лише 'ios' | 'android' для мобільного заголовка. */
export const CLIENT_PLATFORM: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';

/** `X-Flowi-Client` — надсилається на кожен запит `store/api.ts`. */
export const CLIENT_HEADER_VALUE = `mobile/${CLIENT_VERSION} (${CLIENT_PLATFORM})`;

/** Персистована форма — контракт §9.1 (див. `store/workspace.ts`). */
export interface WorkspaceConfig {
  origin: string;
  apiBase: string;
  wsBase: string;
  workspaceId: string;
  name: string;
  color: string;
  logoUrl: string | null;
  registrationMode: 'open' | 'approval';
  webUrl: string | null;
  fetchedAt: number;
}

// ─── Кеш у пам'яті ────────────────────────────────────────────────────────────
let _cached: WorkspaceConfig | null = null;

export function getCachedWorkspace(): WorkspaceConfig | null {
  return _cached;
}

/** Пише лише `store/workspace.ts` — після читання/оновлення AsyncStorage. */
export function setCachedWorkspace(config: WorkspaceConfig | null): void {
  _cached = config;
}

function defaultApiBase(): string {
  return `${DEFAULT_WORKSPACE_ORIGIN}/api`;
}

function defaultWsBase(): string {
  return `${DEFAULT_WORKSPACE_ORIGIN.replace(/^https/, 'wss').replace(/^http:/, 'ws:')}/ws`;
}

/** Читає `store/api.ts` на кожен запит — має лишатися дешевою синхронною функцією. */
export function getApiBase(): string {
  return _cached?.apiBase ?? defaultApiBase();
}

/** Читає `store/sync-engine.tsx` при відкритті сокета. */
export function getWsBase(): string {
  return _cached?.wsBase ?? defaultWsBase();
}

// ─── Несумісність версій (контракт §0.4, §2.2) ───────────────────────────────
export interface WorkspaceIncompatibility {
  /**
   * `'workspace_changed'` — не про версії: та сама адреса відповіла ІНШИМ
   * `workspace_id` (контракт §2.3, «дані одного сервера ніколи не потрапляють
   * на інший») — сервер на тому самому origin перевстановили/замінили. Блокує
   * так само, як несумісність версій: без явного проходження `/workspace`
   * (де вже є перевірка `isRealChange` і повний `switchWorkspace()`) старі
   * токени й локальні дані тихо лишились би прив'язаними до вже неіснуючого
   * акаунта на новому сервері.
   */
  code: 'update_app' | 'update_server' | 'update_app_to' | 'workspace_changed';
  minVersion?: string;
  /**
   * rc1 (docs/release-rc1/compat-n1.md): посилання на НОВИЙ застосунок у
   * сторі — з тіла 426 (`store_url`) або з `store_urls` payload-у
   * `/api/workspace/`. Порожньо — екран оновлення без кнопки (fallback з
   * `expo.extra.storeUrls`, див. app/update-required.tsx).
   */
  storeUrl?: string;
}

let _incompatibility: WorkspaceIncompatibility | null = null;
type IncompatListener = (v: WorkspaceIncompatibility | null) => void;
const _incompatListeners = new Set<IncompatListener>();

export function getWorkspaceIncompatibility(): WorkspaceIncompatibility | null {
  return _incompatibility;
}

export function subscribeWorkspaceIncompatibility(fn: IncompatListener): () => void {
  _incompatListeners.add(fn);
  return () => { _incompatListeners.delete(fn); };
}

export function setWorkspaceIncompatibility(v: WorkspaceIncompatibility | null): void {
  _incompatibility = v;
  for (const fn of [..._incompatListeners]) {
    try { fn(v); } catch (e) { if (__DEV__) console.warn('[api-config] слухач впав:', e); }
  }
}

/**
 * Викликає `store/api.ts` на будь-якій відповіді `426 client_outdated`
 * (контракт §0.4) — блокує UI негайно, а не лише на холодному старті.
 */
export function reportClientOutdated(minVersion?: string, storeUrl?: string): void {
  setWorkspaceIncompatibility({
    code: 'update_app_to',
    minVersion,
    ...(storeUrl ? { storeUrl } : {}),
  });
}

/** Екран оновлення (app/update-required.tsx) — для кодів, що лікуються оновленням застосунку. */
export function needsAppUpdate(v: WorkspaceIncompatibility | null): boolean {
  return v !== null && (v.code === 'update_app' || v.code === 'update_app_to');
}

// ─── Гейт «перша перевірка сумісності цієї сесії ще не завершилась» ──────────
/**
 * Мінор із ревʼю: `refreshWorkspaceCompatibility()` (store/workspace.ts) —
 * окремий мережевий виклик, який `AuthGate` (app/_layout.tsx) запускає ПІСЛЯ
 * того, як він же прочитав кешований `workspace_config`; тим часом
 * `SyncProvider`/`ProjectSyncProvider` бачать вже `authed` (кешований
 * користувач з `store/auth.tsx`) і одразу стартують `doSync('coldStart')` і
 * WebSocket — ЩЕ ДО того, як перевірка встигла підтвердити, що активний
 * origin і досі той самий workspace/акаунт. Сценарій з ревʼю: self-host
 * сервер переінстальовано з тим самим SECRET_KEY, але свіжою БД — старий JWT
 * лишається валідним для випадково того самого user id вже НОВОГО акаунта, і
 * без затримки outbox устиг би піти (а pull — прийти) в чужий акаунт раніше,
 * ніж `getWorkspaceIncompatibility()` взагалі побачив розбіжність.
 *
 * За замовчуванням `true`: до першого виклику `refreshWorkspaceCompatibility()`
 * (чи до підтвердження, що перевіряти нема чого — конфіга ще нема) гейт
 * тримає перший обмін/сокет на паузі. Читає й перемикає лише `SyncGate`
 * (app/_layout.tsx) — на модульний гейт `doSync()`/`useUserSyncSocket` це
 * НЕ впливає (нижче, `getWorkspaceIncompatibility()`), тож юніт-тести
 * рушія синку, які викликають `doSync`/`SyncProvider` напряму, минаючи
 * дерево компонентів, залишаються незалежними від цього прапорця.
 */
let _firstCompatCheckPending = true;
type PendingListener = (v: boolean) => void;
const _pendingListeners = new Set<PendingListener>();

export function isFirstCompatCheckPending(): boolean {
  return _firstCompatCheckPending;
}

export function subscribeFirstCompatCheckPending(fn: PendingListener): () => void {
  _pendingListeners.add(fn);
  return () => { _pendingListeners.delete(fn); };
}

export function setFirstCompatCheckPending(v: boolean): void {
  _firstCompatCheckPending = v;
  for (const fn of [..._pendingListeners]) {
    try { fn(v); } catch (e) { if (__DEV__) console.warn('[api-config] слухач впав:', e); }
  }
}
