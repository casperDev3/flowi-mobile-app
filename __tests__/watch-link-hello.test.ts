/**
 * store/watch-link.ts — `hello` (watch-lockscreen-v1.md §6.4): відкликаний
 * годинник не отримує нову сесію автоматично, навіть якщо після `signout`
 * він представився з reason none/expired. Лише ручне «Підключити знову».
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}));
jest.mock('@/store/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@/store/i18n', () => ({ useI18n: jest.fn() }));
const mockUpdateContext = jest.fn();
jest.mock('@/modules/flowi-ios-bridge', () => ({
  getWatchState: () => ({ supported: true, paired: true, installed: true, reachable: false }),
  transferToWatch: jest.fn(),
  sendToWatch: jest.fn(),
  updateWatchContext: (...args: unknown[]) => mockUpdateContext(...args),
}));
jest.mock('@/store/app-mode', () => ({ isOnlineMode: () => true }));
const mockProvision = jest.fn();
jest.mock('@/store/sessions-api', () => ({
  provisionWatchSession: (...args: unknown[]) => mockProvision(...args),
  revokeSession: jest.fn(async () => undefined),
}));
jest.mock('@/store/api-config', () => ({ getApiBase: () => 'https://test.invalid/api' }));

import { __resetWatchLinkForTests, handleWatchHello, pushWatchContext, WATCH_LINK_KEY } from '@/store/watch-link';

const session = { authed: true, userId: '7', userName: 'Me', lang: 'uk' as const };

beforeEach(() => {
  mockStore.clear();
  mockProvision.mockReset();
  mockProvision.mockResolvedValue({
    session: { id: 's-new', kind: 'watch', platform: 'watchos', name: 'Apple Watch', app_version: '',
      created_at: '', last_seen_at: '', current: false },
    access: 'a', refresh: 'r',
  });
  __resetWatchLinkForTests();
  mockUpdateContext.mockReset();
});

it('після відкликання не видає нову сесію на hello reason none/expired', async () => {
  mockStore.set(WATCH_LINK_KEY, JSON.stringify({ watchId: 'w1', sessionId: null, provisionedAt: null, state: 'revoked' }));
  for (const reason of ['none', 'expired'] as const) {
    await handleWatchHello({ watchId: 'w1', hasToken: false, sessionId: null, reason }, session);
  }
  expect(mockProvision).not.toHaveBeenCalled();
});

it('новий (не відкликаний) годинник без токена отримує сесію', async () => {
  await handleWatchHello({ watchId: 'w2', hasToken: false, sessionId: null, reason: 'none' }, session);
  expect(mockProvision).toHaveBeenCalledWith('w2', 'Apple Watch');
  expect(JSON.parse(mockStore.get(WATCH_LINK_KEY) ?? '{}').state).toBe('connected');
});

it('hello hasToken від відкликаного годинника не повертає «Підключено» (SW1)', async () => {
  mockStore.set(WATCH_LINK_KEY, JSON.stringify({ watchId: 'w1', sessionId: null, provisionedAt: null, state: 'revoked' }));
  await handleWatchHello({ watchId: 'w1', hasToken: true, sessionId: 's-old', reason: 'none' }, session);
  expect(JSON.parse(mockStore.get(WATCH_LINK_KEY) ?? '{}').state).toBe('revoked');
  expect(mockProvision).not.toHaveBeenCalled();
});

it('контекст відкликаному годиннику — authed "0" без знімка (SW1)', async () => {
  mockStore.set(WATCH_LINK_KEY, JSON.stringify({ watchId: 'w1', sessionId: null, provisionedAt: null, state: 'revoked' }));
  expect(await pushWatchContext(session)).toBe(true);
  const ctx = mockUpdateContext.mock.calls[0][0] as Record<string, string>;
  expect(ctx.authed).toBe('0');
  expect(ctx.reason).toBe('revoked');
  expect(ctx.snapshot).toBeUndefined();
});
