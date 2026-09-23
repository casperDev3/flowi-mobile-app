/**
 * store/api.ts — fetch-обгортка для REST-API Flowi.
 *
 * Гарантії:
 *  - Офлайн-гейт: якщо !isOnlineMode() → OfflineError, без мережевих викликів.
 *  - Токени: access/refresh зберігаються в expo-secure-store.
 *  - 401 → одна спроба /auth/refresh/ → повтор; якщо знову 401 → clear tokens +
 *    подія 'session-expired'.
 *  - Оновлення токена — single-flight: скільки б запитів одночасно не впіймали
 *    401, у мережу піде РІВНО одне /auth/refresh/ (сервер ротує refresh і кладе
 *    старий у блокліст, тож другий паралельний запит убив би живу сесію).
 *  - Таймаут ~15 с через AbortController.
 */

import * as SecureStore from 'expo-secure-store';

import { CLIENT_HEADER_VALUE, getApiBase, reportClientOutdated } from './api-config';
import { isOnlineMode } from './app-mode';

// ─── Ключі SecureStore ────────────────────────────────────────────────────────
const ACCESS_KEY = 'flowi_access';
export const REFRESH_SECURE_KEY = 'flowi_refresh';

// ─── Кеш access-токена в пам'яті ────────────────────────────────────────────
let _accessCache: string | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (_accessCache) return _accessCache;
  const t = await SecureStore.getItemAsync(ACCESS_KEY);
  _accessCache = t;
  return t;
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  _accessCache = access;
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_SECURE_KEY, refresh);
}

export async function clearTokens(): Promise<void> {
  _accessCache = null;
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_SECURE_KEY);
}

// ─── Простий emitter для session-expired ────────────────────────────────────
type Listener = () => void;
const _listeners: Listener[] = [];

/** Підписатися на подію «сесія закінчилась»; повертає unsub-функцію. */
export function onSessionExpired(fn: Listener): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

function emitSessionExpired(): void {
  _listeners.forEach(fn => fn());
}

// ─── Типи помилок ────────────────────────────────────────────────────────────
export class OfflineError extends Error {
  constructor() {
    super('App is in offline mode');
    this.name = 'OfflineError';
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ─── Внутрішні хелпери ───────────────────────────────────────────────────────
async function doFetch(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${getApiBase()}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    // Нормалізуємо мережеві помилки в ApiError з розпізнаваним кодом
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new ApiError(0, 'timeout', 'Request timed out');
    }
    if (e instanceof TypeError) {
      throw new ApiError(0, 'network', 'Network request failed');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildHeaders(auth: boolean): Promise<Record<string, string>> {
  // Контракт §0.4: на КОЖЕН запит — сервер порівнює з min_client_version і
  // відповідає 426, коли клієнт застарів (крім /workspace/, /health/, /auth/*).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Flowi-Client': CLIENT_HEADER_VALUE,
  };
  if (auth) {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  let code = 'unknown';
  let message = `HTTP ${res.status}`;
  let details: Record<string, unknown> | undefined;
  try {
    const body = (await res.json()) as unknown;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      details = body as Record<string, unknown>;
      // Django validation errors in this project use `error`, while DRF and
      // auth endpoints typically use `detail`/`code`. Preserve all three so a
      // rejected sync request remains actionable on the device.
      code = String(details.code ?? details.error ?? details.detail ?? code);
      message = String(details.message ?? details.error ?? details.detail ?? message);
    }
  } catch {
    // не вдалося розпарсити тіло помилки — лишаємо дефолти
  }
  return new ApiError(res.status, code, message, details);
}

/**
 * Результат оновлення токена.
 * `invalid` — сервер відхилив сам refresh (або його немає): сесія мертва.
 * `retry`   — тимчасова перешкода (мережа, 429, 5xx); токени чіпати НЕ можна.
 */
export type RefreshOutcome = 'ok' | 'invalid' | 'retry';

/** Спроба оновити access-токен через /auth/refresh/. */
async function performRefresh(): Promise<RefreshOutcome> {
  try {
    const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
    if (!refresh) return 'invalid';

    let res: Response;
    try {
      res = await doFetch('/auth/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Flowi-Client': CLIENT_HEADER_VALUE },
        body: JSON.stringify({ refresh }),
      });
    } catch {
      return 'retry';
    }
    if (!res.ok) return res.status === 401 || res.status === 400 ? 'invalid' : 'retry';

    const data = (await res.json()) as { access: string; refresh: string };
    await setTokens(data.access, data.refresh);
    return 'ok';
  } catch {
    return 'retry';
  }
}

let _refreshInFlight: Promise<RefreshOutcome> | null = null;

function tryRefresh(): Promise<RefreshOutcome> {
  if (_refreshInFlight) return _refreshInFlight;
  const run = performRefresh().finally(() => {
    // Порівняння з run, а не безумовне обнулення: інакше запізніла відповідь
    // старого польоту скинула б посилання на вже наступний, живий refresh.
    if (_refreshInFlight === run) _refreshInFlight = null;
  });
  _refreshInFlight = run;
  return run;
}

/**
 * Оновити токен ззовні — для WebSocket, який отримав відмову 4401 (як на вебі,
 * lib/api.ts refreshSession). Мертва сесія прибирається так само, як в apiFetch.
 */
export async function refreshSession(): Promise<RefreshOutcome> {
  const outcome = await tryRefresh();
  if (outcome === 'invalid') {
    await clearTokens();
    emitSessionExpired();
  }
  return outcome;
}

/** Мілісекунди claim'а `exp` JWT без перевірки підпису (це робить сервер). */
export function jwtExpiresAtMs(token: string): number | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Скільки лишається до `exp`, коли вже варто оновити токен наперед. */
const RENEW_FLOOR_MS = 60_000;

/**
 * Свіжий access-токен для з'єднань, які НЕ йдуть через apiFetch (WebSocket).
 *
 * apiFetch сам переживає 401 (оновлює й повторює), а сокет — ні: сервер
 * закриває його з кодом 4401, і перепідключення з тим самим кешованим токеном
 * крутилось би по колу. Тому перед відкриттям перевіряємо `exp` і за потреби
 * оновлюємо; якщо не вдалось — віддаємо що є (відмова 4401 обробиться окремо).
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const expiresAt = jwtExpiresAtMs(token);
  if (expiresAt !== null && expiresAt - Date.now() < RENEW_FLOOR_MS) {
    await tryRefresh();
    return getAccessToken();
  }
  return token;
}

// ─── Публічний apiFetch ──────────────────────────────────────────────────────
export async function apiFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    allowOffline?: boolean;
    /**
     * Додаткові заголовки запиту (наприклад, `If-Match: <revision>` для
     * налаштувань сповіщень, notifications-module.md §6.3). Не можуть
     * перевизначити `Authorization` — його ставить сам клієнт.
     */
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true, allowOffline = false, headers: extraHeaders } = options;

  // Офлайн-гейт — жодного мережевого виклику.
  // Виняток (allowOffline): автентифікація — інакше з офлайну неможливо
  // увійти в акаунт, щоб увімкнути онлайн (глухий кут).
  if (!isOnlineMode() && !allowOffline) throw new OfflineError();

  const headers = await buildHeaders(auth);
  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) {
      if (name.toLowerCase() === 'authorization') continue;
      (headers as Record<string, string>)[name] = value;
    }
  }
  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let res = await doFetch(path, init);

  // 401 + auth → одна спроба refresh (спільна на всі паралельні запити) → повтор
  if (res.status === 401 && auth) {
    const refreshed = (await tryRefresh()) === 'ok';
    if (refreshed) {
      // Читаємо токен саме ТУТ, після await: якщо оновлення робив хтось інший,
      // у headers лежить уже мертвий токен, з яким повтор дасть 401 і вихід.
      const newToken = await getAccessToken();
      if (newToken) (headers as Record<string, string>)['Authorization'] = `Bearer ${newToken}`;
      res = await doFetch(path, { ...init, headers });
    }
  }

  // Після другої спроби все ще 401 → сесія мертва
  if (res.status === 401 && auth) {
    await clearTokens();
    emitSessionExpired();
    throw new ApiError(401, 'session_expired', 'Session expired');
  }

  if (!res.ok) {
    const err = await parseErrorBody(res);
    // Контракт §0.4: 426 на будь-якому ендпоінті (крім /workspace/, /health/,
    // /auth/*, куди й так не ставимо заголовок клієнта) означає, що збірка
    // застаріла для активного workspace — блокуємо UI екраном оновлення,
    // а не просто показуємо помилку на конкретному екрані.
    if (res.status === 426) {
      reportClientOutdated(typeof err.details?.min_version === 'string' ? err.details.min_version : undefined);
    }
    throw err;
  }

  // 204 No Content / 205 Reset Content — повертаємо undefined
  if (res.status === 204 || res.status === 205) return undefined as unknown as T;

  return res.json() as Promise<T>;
}
