/**
 * store/workspace.ts — вибір і перевірка адреси workspace (§2 плану, контракт §2.1–2.3).
 *
 * Низькорівневий кеш і геттери (`getApiBase`/`getWsBase`, заголовок клієнта)
 * живуть у `store/api-config.ts` навмисно окремо — той файл не тягне
 * AsyncStorage, а цей тягне (персистентність `workspace_config`). Дивись
 * коментар на початку `api-config.ts`.
 *
 * Дані одного сервера НІКОЛИ не потрапляють на інший (контракт §2.3): зміна
 * workspace — це вихід (див. `store/auth.tsx` switchWorkspace), а не просте
 * переписування адреси.
 */

import {
  CLIENT_VERSION,
  DEFAULT_WORKSPACE_ORIGIN,
  getCachedWorkspace,
  getWorkspaceIncompatibility,
  isFirstCompatCheckPending,
  setCachedWorkspace,
  setFirstCompatCheckPending,
  setWorkspaceIncompatibility,
  subscribeFirstCompatCheckPending,
  subscribeWorkspaceIncompatibility,
  type WorkspaceConfig,
  type WorkspaceIncompatibility,
} from './api-config';
import { loadData, saveData } from './storage';
import { SYNC_CONTRACT_VERSION } from './sync-contract';

export type { WorkspaceConfig, WorkspaceIncompatibility };
export {
  getWorkspaceIncompatibility,
  isFirstCompatCheckPending,
  subscribeFirstCompatCheckPending,
  subscribeWorkspaceIncompatibility,
};

const WORKSPACE_PROTOCOL = 1;

// ─── Типи ────────────────────────────────────────────────────────────────────
export interface WorkspaceInfo {
  workspace_protocol: number;
  workspace_id: string;
  name: string;
  color: string;
  logo_url: string | null;
  registration_mode: 'open' | 'approval';
  has_users: boolean;
  sync_contract_version: number;
  min_client_version: { mobile: string; web: string };
  ws_url: string;
  web_url?: string | null;
  server_version?: string;
  features?: string[];
}

export type WorkspaceCheckErrorCode =
  | 'invalid_url'
  | 'insecure_url'
  | 'network'
  | 'not_workspace'
  | 'server_unavailable'
  | 'update_app'
  | 'update_server'
  | 'update_app_to'
  | 'workspace_changed';

export interface WorkspaceCheckError {
  ok: false;
  code: WorkspaceCheckErrorCode;
  /** Лише для 'update_app_to' — версія, до якої треба оновитись. */
  minVersion?: string;
  /**
   * Схему ми домислили самі (користувач її не писав). Тоді 'network' може
   * означати не «сервера немає», а «ми постукали не туди» — екран додає
   * підказку про схему замість глухого «не вдалося з'єднатися».
   */
  schemeAssumed?: boolean;
}

export interface WorkspaceCheckSuccess {
  ok: true;
  origin: string;
  info: WorkspaceInfo;
}

// ─── Нормалізація адреси (контракт §2.2.1) ───────────────────────────────────
const LOCAL_HOST_RE =
  /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|.+\.local)$/i;

/** Хост із адреси БЕЗ схеми: `192.168.0.5:8000/api` → `192.168.0.5`. */
function bareHost(input: string): string {
  const authority = input.split('/')[0];
  const hostAndPort = authority.split('@').pop() ?? authority;
  return hostAndPort.replace(/:\d+$/, '');
}

export function normalizeWorkspaceOrigin(
  input: string,
): { ok: true; origin: string; schemeAssumed?: boolean }
  | { ok: false; code: 'invalid_url' | 'insecure_url' } {
  let s = (input ?? '').trim();
  if (!s) return { ok: false, code: 'invalid_url' };

  s = s.replace(/\/+$/, '').replace(/\/api$/i, '');
  let schemeAssumed = false;
  if (!/^[a-zA-Z]+:\/\//.test(s)) {
    // Домислити https БУДЬ-ЧОМУ означало зробити локальний сервер і сервер
    // без TLS недосяжним: `https://127.0.0.1:8000` просто не відповідає, а
    // екран казав лише «не вдалося з'єднатися». Для адрес, яким http дозволено
    // нижче (LOCAL_HOST_RE), домислюємо саме http — це той самий перелік, тож
    // друга перевірка вже не відкине те, що ми щойно побудували.
    const scheme = LOCAL_HOST_RE.test(bareHost(s)) ? 'http' : 'https';
    s = `${scheme}://${s}`;
    schemeAssumed = true;
  }

  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, code: 'invalid_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'invalid_url' };
  }
  if (url.protocol === 'http:' && !LOCAL_HOST_RE.test(url.hostname)) {
    return { ok: false, code: 'insecure_url' };
  }

  const origin = `${url.protocol}//${url.host}${url.pathname}`
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');
  return schemeAssumed ? { ok: true, origin, schemeAssumed: true } : { ok: true, origin };
}

// ─── Перевірка сумісності (контракт §2.2.3) ──────────────────────────────────

/** Просте порівняння `major.minor.patch`: <0 якщо `a` менший за `b`. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function checkWorkspaceCompatibility(
  info: WorkspaceInfo,
): { ok: true } | WorkspaceCheckError {
  if (info.workspace_protocol !== WORKSPACE_PROTOCOL) {
    return { ok: false, code: info.workspace_protocol > WORKSPACE_PROTOCOL ? 'update_app' : 'update_server' };
  }
  if (info.sync_contract_version !== SYNC_CONTRACT_VERSION) {
    return {
      ok: false,
      code: info.sync_contract_version > SYNC_CONTRACT_VERSION ? 'update_app' : 'update_server',
    };
  }
  const minVersion = info.min_client_version?.mobile;
  if (minVersion && compareSemver(CLIENT_VERSION, minVersion) < 0) {
    return { ok: false, code: 'update_app_to', minVersion };
  }
  return { ok: true };
}

// ─── Мережевий виклик `GET /api/workspace/` ──────────────────────────────────
async function rawFetchWorkspaceInfo(origin: string): Promise<WorkspaceInfo> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${origin}/api/workspace/`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    // ERR-04: 502/503 під час деплою, 500 від Django і 429 від throttle — це
    // «сервер зараз не відповідає», а не «тут не Flowi, оновіть сервер».
    // `not_workspace` лишається для 404, не-JSON і відповіді без протоколу.
    if (res.status >= 500 || res.status === 429) throw new Error('server_unavailable');
    if (!res.ok) throw new Error('not_workspace');
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new Error('not_workspace');
    }
    if (!data || typeof data !== 'object' || typeof (data as any).workspace_protocol !== 'number') {
      throw new Error('not_workspace');
    }
    return data as WorkspaceInfo;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Повний потік перевірки адреси: нормалізація → запит → сумісність.
 * Використовується екраном «Адреса workspace».
 */
export async function checkWorkspace(
  inputOrigin: string,
): Promise<WorkspaceCheckSuccess | WorkspaceCheckError> {
  const normalized = normalizeWorkspaceOrigin(inputOrigin);
  if (!normalized.ok) return normalized;

  let info: WorkspaceInfo;
  try {
    info = await rawFetchWorkspaceInfo(normalized.origin);
  } catch (e) {
    if (e instanceof Error && e.message === 'not_workspace') {
      return { ok: false, code: 'not_workspace' };
    }
    if (e instanceof Error && e.message === 'server_unavailable') {
      return { ok: false, code: 'server_unavailable' };
    }
    return normalized.schemeAssumed
      ? { ok: false, code: 'network', schemeAssumed: true }
      : { ok: false, code: 'network' };
  }

  const compat = checkWorkspaceCompatibility(info);
  if (!compat.ok) return compat;

  return { ok: true, origin: normalized.origin, info };
}

/** Персистована форма з результату успішної перевірки. */
export function buildWorkspaceConfig(origin: string, info: WorkspaceInfo): WorkspaceConfig {
  return {
    origin,
    apiBase: `${origin}/api`,
    wsBase: info.ws_url,
    workspaceId: info.workspace_id,
    name: info.name,
    color: info.color,
    logoUrl: info.logo_url ?? null,
    registrationMode: info.registration_mode,
    webUrl: info.web_url ?? null,
    fetchedAt: Date.now(),
  };
}

// ─── Зберігання (AsyncStorage + кеш у store/api-config.ts) ───────────────────
const CONFIG_KEY = 'workspace_config';

// `undefined` — ще не читали зі сховища цього процесу.
let _loaded = false;

export function cachedWorkspaceConfig(): WorkspaceConfig | null {
  return getCachedWorkspace();
}

export async function loadWorkspaceConfig(): Promise<WorkspaceConfig | null> {
  if (_loaded) return getCachedWorkspace();
  const stored = await loadData<WorkspaceConfig | null>(CONFIG_KEY, null);
  setCachedWorkspace(stored);
  _loaded = true;
  return stored;
}

export async function setWorkspaceConfig(config: WorkspaceConfig): Promise<void> {
  setCachedWorkspace(config);
  _loaded = true;
  await saveData(CONFIG_KEY, config);
}

/** Використовується лише виходом/зміною workspace — див. store/auth.tsx. */
export async function clearWorkspaceConfig(): Promise<void> {
  setCachedWorkspace(null);
  _loaded = true;
  await saveData(CONFIG_KEY, null);
}

/** `{origin}/api` для запиту, ще не збереженого як активний workspace. */
export function apiBaseForOrigin(origin: string): string {
  return `${origin}/api`;
}

export { DEFAULT_WORKSPACE_ORIGIN };

// ─── Фонова перевірка сумісності на холодному старті (контракт §2.2.4) ───────

/**
 * Перевіряє поточний workspace без блокування UI (контракт §2.2.4). Помилка
 * мережі ігнорується мовчки (це не означає несумісність — просто немає
 * зв'язку), а несумісність версій виставляє прапорець з `store/api-config.ts`,
 * який `AuthGate` (`app/_layout.tsx`) перетворює на блокувальний екран
 * `/workspace`.
 */
export async function refreshWorkspaceCompatibility(): Promise<void> {
  const config = await loadWorkspaceConfig();
  // Нема що перевіряти — нема й на що чекати (мінор із ревʼю, `SyncGate`
  // тримає перший обмін на паузі, доки цей прапорець не спаде).
  if (!config) {
    setFirstCompatCheckPending(false);
    return;
  }
  try {
    const result = await checkWorkspace(config.origin);
    if (result.ok) {
      // Контракт §2.3: «дані одного сервера ніколи не потрапляють на інший».
      // Той самий origin, але ІНШИЙ workspace_id — сервер перевстановили чи
      // замінили; мовчки переписати конфіг тут означало б лишити старі токени
      // й локальні дані прив'язаними до вже неіснуючого акаунта на новому
      // сервері (нове має бути валідне, старе — витерте, а вирішує це саме
      // `switchWorkspace()`). Блокуємо так само, як несумісність версій —
      // AuthGate поверне на /workspace, де handleContinue() сам побачить
      // мисматч workspaceId і пройде через isRealChange → runSwitch().
      if (result.info.workspace_id !== config.workspaceId) {
        setWorkspaceIncompatibility({ code: 'workspace_changed' });
        return;
      }
      setWorkspaceIncompatibility(null);
      // Оновлюємо кеш назви/кольору — сервер міг змінити брендинг.
      await setWorkspaceConfig(buildWorkspaceConfig(result.origin, result.info));
      return;
    }
    if (result.code === 'update_app' || result.code === 'update_server' || result.code === 'update_app_to') {
      setWorkspaceIncompatibility({ code: result.code, minVersion: result.minVersion });
    }
    // 'network' / 'server_unavailable' / 'not_workspace' / 'invalid_url' /
    // 'insecure_url' — тимчасове
    // або малоймовірне (адреса вже пройшла перевірку раніше); не блокуємо UI.
  } finally {
    // `finally`, а не хвіст щасливого шляху (мінор із ревʼю): офлайн холодний
    // старт («мережа впала» — 'network' вище) інакше НАЗАВЖДИ лишав би
    // `SyncGate` на паузі — `currentGate()`/`isOnlineMode()` і так не пустять
    // жоден обмін без мережі, тож знімати паузу тут безпечно за будь-яким
    // результатом.
    setFirstCompatCheckPending(false);
  }
}
