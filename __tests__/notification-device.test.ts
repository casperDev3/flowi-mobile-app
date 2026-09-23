/**
 * __tests__/notification-device.test.ts — реєстрація пристрою в
 * `DeviceRegistration` замість старого `PushToken`
 * (docs/specs/notifications-module.md §6.4, §6.6, §10.1, §10.3) і маршрути
 * центру сповіщень із deep link сервера (§11).
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
  subscribeToStorage: jest.fn(() => () => {}),
}));

let mockClientVersion = '1.2.0';
jest.mock('@/store/api-config', () => ({
  getApiBase: jest.fn(() => 'https://a.example.com/api'),
  get CLIENT_VERSION() { return mockClientVersion; },
}));
jest.mock('@/store/workspace', () => ({ cachedWorkspaceConfig: jest.fn(() => null) }));
jest.mock('@/store/app-mode', () => ({ isOnlineMode: () => true, subscribeOnlineMode: () => () => {} }));
jest.mock('@/store/synced-storage', () => ({ saveSyncedValue: jest.fn(async () => {}) }));

type Opts = { method?: string; body?: Record<string, unknown>; auth?: boolean };
const mockApiFetch = jest.fn(async (_path: string, _opts?: Opts): Promise<unknown> => ({}));
jest.mock('@/store/api', () => ({
  apiFetch: (path: string, opts?: Opts) => mockApiFetch(path, opts),
}));

jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'iPad Pro', modelName: 'iPad' }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[abc]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'proj-1' } } }, easConfig: null },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import { SERVER_REMINDERS_KEY } from '@/api/notifications';
import { registerPushToken, unregisterPushToken } from '@/store/push';
import { deepLinkRoute, notificationRoute } from '@/utils/pushLink';

const REGISTERED_KEY = 'push_token_registered';
const WORKSPACE_WITH_REMINDERS = {
  notifications: { protocol: 1, channels: ['in_app', 'push_expo'], server_reminders: ['task.reminder', 'meeting.reminder'] },
};

function read<T>(key: string): T | undefined {
  const raw = mockStore.get(key);
  return raw === undefined ? undefined : (JSON.parse(raw) as T);
}

beforeEach(() => {
  mockStore.clear();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => (path === '/workspace/' ? WORKSPACE_WITH_REMINDERS : {}));
  mockClientVersion = '1.2.0';
});

describe('registerPushToken → DeviceRegistration', () => {
  it('реєструє пристрій з версією, мовою, поясом і назвою', async () => {
    mockStore.set('lang_option_v1', JSON.stringify('en'));
    await registerPushToken('u-1', 'ws-1');
    const post = mockApiFetch.mock.calls.find(([path, opts]) => path === '/notifications/devices/' && opts?.method === 'POST');
    expect(post?.[1]?.body).toMatchObject({
      kind: 'expo',
      token: 'ExponentPushToken[abc]',
      app_version: '1.2.0',
      lang: 'en',
      device_name: 'iPad Pro',
    });
    expect(typeof post?.[1]?.body?.timezone).toBe('string');
    expect(read<Record<string, unknown>>(REGISTERED_KEY)).toMatchObject({ endpoint: 'devices', appVersion: '1.2.0' });
  });

  it('легасі-запис без endpoint перереєстровується (сервер переніс його без версії)', async () => {
    mockStore.set(REGISTERED_KEY, JSON.stringify({ token: 'ExponentPushToken[abc]', userId: 'u-1', workspaceId: 'ws-1' }));
    await registerPushToken('u-1', 'ws-1');
    expect(mockApiFetch.mock.calls.some(([path]) => path === '/notifications/devices/')).toBe(true);
  });

  it('сервер без модуля (404) — легасі /push/tokens/, серверних нагадувань немає', async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/notifications/devices/') throw Object.assign(new Error('nf'), { status: 404 });
      return {};
    });
    await registerPushToken('u-1', 'ws-1');
    expect(mockApiFetch.mock.calls.some(([path, opts]) => path === '/push/tokens/' && opts?.method === 'POST')).toBe(true);
    expect(read(REGISTERED_KEY)).toMatchObject({ endpoint: 'legacy' });
    expect(read(SERVER_REMINDERS_KEY) ?? null).toBeNull();
  });

  it('записує, які нагадування вже шле сервер', async () => {
    await registerPushToken('u-1', 'ws-1');
    expect(read(SERVER_REMINDERS_KEY)).toMatchObject({
      userId: 'u-1',
      events: ['task.reminder', 'meeting.reminder'],
      appVersion: '1.2.0',
    });
  });

  it('збірка нижче порогу сервера — локальні нагадування лишаються', async () => {
    mockClientVersion = '1.1.0';
    await registerPushToken('u-1', 'ws-1');
    expect(read(SERVER_REMINDERS_KEY) ?? null).toBeNull();
  });
});

describe('unregisterPushToken', () => {
  it('знімає пристрій новим ендпоінтом і скидає рішення про серверні нагадування', async () => {
    mockStore.set(REGISTERED_KEY, JSON.stringify({ token: 'tok-1', userId: 'u-1', workspaceId: 'ws-1', endpoint: 'devices' }));
    mockStore.set(SERVER_REMINDERS_KEY, JSON.stringify({ events: ['task.reminder'] }));
    await unregisterPushToken();
    const del = mockApiFetch.mock.calls.find(([, opts]) => opts?.method === 'DELETE');
    expect(del?.[0]).toBe('/notifications/devices/');
    expect(del?.[1]?.body).toEqual({ token: 'tok-1' });
    expect(read(SERVER_REMINDERS_KEY)).toBeNull();
  });
});

describe('deep link сервера → маршрут', () => {
  it.each([
    ['ftrackingapp://project/p-1/task/t-1', '/(tabs)?open=t-1'],
    ['ftrackingapp://project/p-1/meeting/m-1', '/project/p-1/meetings?open=m-1'],
    ['ftrackingapp://project/p-1/sprint/s-1', '/project/p-1/sprints?sprint=s-1'],
    ['ftrackingapp://project/p-1', '/project/p-1/overview'],
    ['ftrackingapp://task/t-9', '/(tabs)?open=t-9'],
    ['ftrackingapp://meeting/m-9', '/meetings?open=m-9'],
    ['ftrackingapp://feedback?open=idea%3Ai-1', '/feedback?open=idea%3Ai-1'],
    ['ftrackingapp://feedback', '/feedback'],
    ['ftrackingapp://ideas', '/feedback'],
    ['ftrackingapp://training/g-1', '/training/g-1'],
    ['ftrackingapp://training/g-1/program/pr-1', '/training/g-1/program/pr-1'],
    ['ftrackingapp://training/g-1/member/7', '/training/g-1/member/7'],
    ['ftrackingapp://training/g-1/quest/q-1', '/training/g-1/quest/q-1'],
    ['ftrackingapp://training/g-1/log/l-1', '/training/g-1/log/l-1'],
    ['ftrackingapp://training/g-1/leaderboard', '/training/g-1/leaderboard'],
    ['ftrackingapp://training/session/s-1', '/training/session/s-1'],
    ['ftrackingapp://subscriptions', '/subscriptions'],
    ['ftrackingapp://finance', '/(tabs)/explore'],
    ['ftrackingapp://admin/requests', '/admin-workspace'],
  ])('%s → %s', (url, route) => {
    expect(deepLinkRoute(url)).toBe(route);
  });

  it('чужа схема чи невідома форма — нікуди', () => {
    expect(deepLinkRoute('https://evil.example/task/1')).toBeNull();
    expect(deepLinkRoute('ftrackingapp://unknown/x')).toBeNull();
    expect(deepLinkRoute(null)).toBeNull();
  });

  it('deep link має пріоритет, легасі-тип — запасний шлях', () => {
    expect(notificationRoute({ event_type: 'task.assigned', url: 'ftrackingapp://project/p/meeting/m' }))
      .toBe('/project/p/meetings?open=m');
    expect(notificationRoute({ type: 'assigned', project_id: 'p', local_id: 't' })).toBe('/(tabs)?open=t');
    expect(notificationRoute({ event_type: 'registration.requested' })).toBe('/admin-workspace');
  });
});
