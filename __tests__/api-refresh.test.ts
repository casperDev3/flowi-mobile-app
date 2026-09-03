/**
 * __tests__/api-refresh.test.ts
 *
 * Регресія на випадкові вилогінювання: сервер ротує refresh-токени і кладе
 * старий у блокліст (ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION). Тому
 * два паралельні /auth/refresh/ з одним і тим самим токеном — це не «зайвий
 * запит», а знищена сесія: другий отримає 401 на вже заблоклистований токен і
 * зітре щойно видану валідну пару. Перевіряємо, що пачка запитів синку дає
 * рівно одне оновлення і що всі, хто чекав, беруть СВІЖИЙ токен.
 */

// ─── Моки ────────────────────────────────────────────────────────────────────

// SecureStore з реальним станом: тест перевіряє саме те, який токен звідти
// прочитають, тож заглушка з фіксованою відповіддю тут нічого б не довела.
jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store[key] ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { store[key] = value; }),
    deleteItemAsync: jest.fn(async (key: string) => { delete store[key]; }),
  };
});

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: jest.fn(() => true),
}));

// ─── Оточення ────────────────────────────────────────────────────────────────

type ApiModule = typeof import('@/store/api');

interface Call { path: string; auth: string | undefined }

/**
 * Свіжий інстанс store/api на кожен тест.
 *
 * Модуль тримає access-токен у пам'яті (і сам single-flight — теж модульний
 * стан), тож без resetModules другий тест стартував би з уже оновленим токеном
 * і 401 просто не настав би.
 */
function loadApi(): { api: ApiModule; store: Record<string, string> } {
  jest.resetModules();
  const secure = require('expo-secure-store') as { __store: Record<string, string> };
  secure.__store.flowi_access = 'access-old';
  secure.__store.flowi_refresh = 'refresh-old';
  const api = require('@/store/api') as ApiModule;
  return { api, store: secure.__store };
}

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/**
 * Мережа, у якій протухлі токени зі `expired` дають 401, а /auth/refresh/
 * відповідає з паузою — щоб паралельні запити гарантовано зустрілись у польоті.
 */
function installFetch(expired: Set<string>) {
  const calls: Call[] = [];
  let issued = 0;
  global.fetch = (async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/^\/api/, '');
    const auth = (init.headers as Record<string, string> | undefined)?.['Authorization'];
    calls.push({ path, auth });

    if (path === '/auth/refresh/') {
      await new Promise(resolve => setTimeout(resolve, 10));
      issued += 1;
      return json({ access: `access-${issued}`, refresh: `refresh-${issued}` });
    }
    const token = auth?.replace('Bearer ', '') ?? '';
    return expired.has(token) ? json({ detail: 'token_not_valid' }, 401) : json({ ok: true });
  }) as unknown as typeof fetch;
  return calls;
}

// ─── Тести ───────────────────────────────────────────────────────────────────

describe('apiFetch — single-flight оновлення токена', () => {
  it('два паралельні 401 дають рівно один /auth/refresh/, обидва запити успішні', async () => {
    const { api } = loadApi();
    const calls = installFetch(new Set(['access-old']));

    const results = await Promise.all([
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
    ]);

    expect(calls.filter(c => c.path === '/auth/refresh/')).toHaveLength(1);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
  });

  it('той, хто лише чекав на чуже оновлення, повторює запит зі свіжим токеном', async () => {
    const { api, store } = loadApi();
    const calls = installFetch(new Set(['access-old']));

    await Promise.all([
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
    ]);

    // Перші два звернення пішли зі старим токеном і впіймали 401; обидва
    // повтори мусять піти вже з новим, а не з тим, що прочитали до очікування.
    const retries = calls.filter(c => c.path === '/sync/user/v2/').slice(2);
    expect(retries).toHaveLength(2);
    expect(retries.map(c => c.auth)).toEqual(['Bearer access-1', 'Bearer access-1']);

    expect(await api.getAccessToken()).toBe('access-1');
    expect(store.flowi_refresh).toBe('refresh-1');
  });

  it('паралельний 401 не стирає сесію', async () => {
    const { api, store } = loadApi();
    installFetch(new Set(['access-old']));

    let expired = false;
    api.onSessionExpired(() => { expired = true; });

    await Promise.all([
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
      api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} }),
    ]);

    expect(expired).toBe(false);
    expect(store.flowi_refresh).toBe('refresh-1');
  });

  it('після завершення польоту наступний 401 знову оновлює токен', async () => {
    const { api } = loadApi();
    const expiredTokens = new Set(['access-old']);
    const calls = installFetch(expiredTokens);

    await api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} });

    // Минув тиждень, виданий токен теж протух: гейт не має лишитись замкненим
    // на промісі, що вже розв'язався, інакше сесія помре на першому ж 401.
    expiredTokens.add('access-1');
    await api.apiFetch('/sync/user/v2/', { method: 'POST', body: {} });

    expect(calls.filter(c => c.path === '/auth/refresh/')).toHaveLength(2);
  });
});
