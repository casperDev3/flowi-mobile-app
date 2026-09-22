/**
 * ERR-02: чи справді тимчасова відмова /auth/refresh/ (5xx) вбиває живу сесію
 * в apiFetch, хоч performRefresh повертає 'retry'.
 */

jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { store[key] = value; }),
    deleteItemAsync: jest.fn(async (key: string) => { delete store[key]; }),
  };
});

jest.mock('@/store/app-mode', () => ({ isOnlineMode: jest.fn(() => true) }));

type ApiModule = typeof import('@/store/api');

function loadApi(): { api: ApiModule; store: Record<string, string> } {
  jest.resetModules();
  const secure = require('expo-secure-store') as { __store: Record<string, string> };
  secure.__store.flowi_access = 'access-old';
  secure.__store.flowi_refresh = 'refresh-live';
  const api = require('@/store/api') as ApiModule;
  return { api, store: secure.__store };
}

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

it('ERR-02: 401 на запиті + 503 на /auth/refresh/ → токени стерто, session-expired', async () => {
  const { api, store } = loadApi();
  global.fetch = (async (url: string) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
    if (path === '/auth/refresh/') return json({ detail: 'service unavailable' }, 503);
    return json({ detail: 'token_not_valid' }, 401);
  }) as unknown as typeof fetch;

  let expired = false;
  const off = api.onSessionExpired(() => { expired = true; });
  await expect(api.apiFetch('/tasks/')).rejects.toMatchObject({ code: 'session_expired' });
  off();

  // Живий refresh-токен знищено через тимчасову відмову сервера:
  expect(store.flowi_refresh).toBeUndefined();
  expect(store.flowi_access).toBeUndefined();
  expect(expired).toBe(true);
});

it('контрольний зразок: refreshSession на 503 токени НЕ чіпає', async () => {
  const { api, store } = loadApi();
  global.fetch = (async () => json({}, 503)) as unknown as typeof fetch;
  expect(await api.refreshSession()).toBe('retry');
  expect(store.flowi_refresh).toBe('refresh-live');
});
