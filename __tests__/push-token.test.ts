/**
 * __tests__/push-token.test.ts — черга відкладеного зняття push-токена
 * (store/push.ts, WORKSPACE_PROJECTS_CONTRACT.md §2.3/§2.8).
 *
 * Два мінори з ревʼю:
 * 1. `flushPendingUnregister()` викликався через `void` і DELETE того самого
 *    токена, що POST реєструє кількома рядками нижче, міг дістатись сервера
 *    ПІСЛЯ POST і зняти щойно зареєстрований запис — пуші новому користувачу
 *    більше не приходили б без ручного relogin.
 * 2. Токен, знятий офлайн у workspace A, дожимався проти origin workspace B
 *    після зміни workspace — сервер B про такий токен не знає, а прив'язка
 *    на сервері A лишається назавжди.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  }),
  saveData: jest.fn(async (key: string, data: unknown) => {
    mockStore.set(key, JSON.stringify(data));
  }),
}));

// Активний origin — контрольований тестом, а не реальний кеш workspace.
// Ім'я з префіксом `mock` — jest дозволяє посилатись на такі змінні з
// module factory (hoisting-виняток), звичайне ім'я кидало б ReferenceError.
let mockOrigin = 'https://a.example.com/api';
jest.mock('@/store/api-config', () => ({
  getApiBase: jest.fn(() => mockOrigin),
}));

jest.mock('@/store/workspace', () => ({
  cachedWorkspaceConfig: jest.fn(() => null),
}));

interface ApiFetchOpts {
  method?: string;
  body?: { token?: string };
}
type ApiFetchMock = jest.Mock<Promise<unknown>, [string, ApiFetchOpts?]>;
const mockApiFetch: ApiFetchMock = jest.fn(async (_path: string, _opts?: ApiFetchOpts) => ({}));
jest.mock('@/store/api', () => ({
  apiFetch: (path: string, opts?: ApiFetchOpts) => mockApiFetch(path, opts),
}));

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'token-new' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } }, easConfig: null },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { registerPushToken, unregisterPushToken } from '@/store/push';

const PENDING_KEY = 'push_pending_unregister';
const REGISTERED_KEY = 'push_token_registered';

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}
function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

beforeEach(() => {
  mockStore.clear();
  mockApiFetch.mockClear();
  mockApiFetch.mockImplementation(async () => ({}));
  mockOrigin = 'https://a.example.com/api';
});

describe('flushPendingUnregister через registerPushToken', () => {
  it('не DELETE-ить токен, який сам от-от POST-не (інакше DELETE-після-POST знімає щойно зареєстрований запис)', async () => {
    // Легасі-запис без origin (до появи поля) з тим самим токеном, що видасть
    // getExpoPushTokenAsync нижче ('token-new') — має бути пропущений, а не
    // знятий, інакше POST реєстрації одразу ж скасовується DELETE-ом.
    seed(PENDING_KEY, ['token-new']);

    await registerPushToken('u-1', 'ws-1');

    const deleteCalls = mockApiFetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
    expect(deleteCalls).toHaveLength(0);

    const postCalls = mockApiFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
    expect(postCalls).toHaveLength(1);

    // Запис лишається в черзі (не був оброблений, бо збігається зі skipToken).
    expect(read<unknown[]>(PENDING_KEY, [])).toEqual(['token-new']);
  });

  it('дожимає DELETE лише для запису з АКТИВНИМ зараз origin, інший лишає в черзі', async () => {
    seed(PENDING_KEY, [
      { token: 'stale-a', origin: 'https://a.example.com/api' },
      { token: 'stale-b', origin: 'https://b.example.com/api' },
    ]);

    await registerPushToken('u-1', 'ws-1');

    const deleteTokens = mockApiFetch.mock.calls
      .filter(([, opts]) => opts?.method === 'DELETE')
      .map(([, opts]) => opts?.body?.token);
    expect(deleteTokens).toEqual(['stale-a']);

    // Запис іншого workspace (origin='b') лишається — дожмуться, коли
    // користувач повернеться саме туди.
    expect(read<{ token: string; origin: string }[]>(PENDING_KEY, [])).toEqual([
      { token: 'stale-b', origin: 'https://b.example.com/api' },
    ]);
  });

  it('чекає на flush ПЕРЕД POST (await, не void) — порядок викликів DELETE, потім POST', async () => {
    seed(PENDING_KEY, [{ token: 'stale-a', origin: 'https://a.example.com/api' }]);
    const order: string[] = [];
    mockApiFetch.mockImplementation(async (_path, opts) => {
      // GET можливостей workspace (серверні нагадування) до порядку
      // зняття/реєстрації токена не належить.
      if (opts?.method === 'DELETE' || opts?.method === 'POST') order.push(opts.method);
      return {};
    });

    await registerPushToken('u-1', 'ws-1');

    expect(order).toEqual(['DELETE', 'POST']);
  });
});

describe('unregisterPushToken — постановка в чергу з origin', () => {
  it('при мережевій помилці ставить запис з АКТИВНИМ origin, не голим токеном', async () => {
    seed(REGISTERED_KEY, { token: 'reg-1', userId: 'u-1', workspaceId: 'ws-1' });
    mockApiFetch.mockImplementation(async () => { throw new Error('offline'); });

    await unregisterPushToken();

    expect(read<{ token: string; origin: string }[]>(PENDING_KEY, [])).toEqual([
      { token: 'reg-1', origin: 'https://a.example.com/api' },
    ]);
  });
});
