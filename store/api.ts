/**
 * store/api.ts — fetch-обгортка для REST-API Flowi.
 *
 * Гарантії:
 *  - Офлайн-гейт: якщо !isOnlineMode() → OfflineError, без мережевих викликів.
 *  - Токени: access/refresh зберігаються в expo-secure-store.
 *  - 401 → одна спроба /auth/refresh/ → повтор; якщо знову 401 → clear tokens +
 *    подія 'session-expired'.
 *  - Таймаут ~15 с через AbortController.
 */

import * as SecureStore from 'expo-secure-store';

import { API_BASE } from './api-config';
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
    return await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildHeaders(auth: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  let code = 'unknown';
  let message = `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as Record<string, unknown>;
    code = String(body.code ?? body.detail ?? code);
    message = String(body.message ?? body.detail ?? message);
  } catch {
    // не вдалося розпарсити тіло помилки — лишаємо дефолти
  }
  return new ApiError(res.status, code, message);
}

/** Спроба оновити access-токен через /auth/refresh/. Повертає true якщо успішно. */
async function tryRefresh(): Promise<boolean> {
  try {
    const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
    if (!refresh) return false;

    const res = await doFetch('/auth/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { access: string; refresh: string };
    await setTokens(data.access, data.refresh);
    return true;
  } catch {
    return false;
  }
}

// ─── Публічний apiFetch ──────────────────────────────────────────────────────
export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  // Офлайн-гейт — жодного мережевого виклику
  if (!isOnlineMode()) throw new OfflineError();

  const headers = await buildHeaders(auth);
  const init: RequestInit = {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let res = await doFetch(path, init);

  // 401 + auth → одна спроба refresh → повтор
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Оновлюємо заголовок свіжим токеном
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

  if (!res.ok) throw await parseErrorBody(res);

  // 204 No Content / 205 Reset Content — повертаємо undefined
  if (res.status === 204 || res.status === 205) return undefined as unknown as T;

  return res.json() as Promise<T>;
}
