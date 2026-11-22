/**
 * __tests__/push-native.test.ts — rc1: реєстрація НАТИВНОГО токена
 * (store/push.ts, docs/release-rc1/push.md «Протокол пристрою»).
 *
 * - тіло `{kind:'apns'|'fcm', token, platform, app_version, bundle_id}`;
 * - зміна токена ОС → `previous_token`;
 * - сервер N-1 (400 на `kind`) → запасний Expo-токен;
 * - незмінний токен не POST-иться частіше ніж раз на тиждень;
 * - вихід знімає нативний токен.
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

jest.mock('@/store/api-config', () => ({
  canonicalCloudOrigin: (o: string) => o.replace(/\/+$/, '').replace(/^https:\/\/api\.flowi\.casperdev\.site$/i, 'https://api.flowi.com.ua'),
  getApiBase: jest.fn(() => 'https://api.flowi.com.ua/api'),
  CLIENT_VERSION: '1.4.0',
}));

jest.mock('@/store/workspace', () => ({
  cachedWorkspaceConfig: jest.fn(() => ({ workspaceId: 'ws-1' })),
}));

interface ApiFetchOpts {
  method?: string;
  body?: Record<string, unknown>;
  auth?: boolean;
}
type ApiFetchMock = jest.Mock<Promise<unknown>, [string, ApiFetchOpts?]>;
const mockApiFetch: ApiFetchMock = jest.fn(async (_path: string, _opts?: ApiFetchOpts) => ({}));
jest.mock('@/store/api', () => ({
  apiFetch: (path: string, opts?: ApiFetchOpts) => mockApiFetch(path, opts),
}));

let mockDeviceToken: { type: string; data: string } = { type: 'ios', data: 'a1'.repeat(32) };
let mockTokenListener: ((token: { type: string; data: string }) => void) | null = null;
jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'iPhone тест' }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[fallback]' })),
  getDevicePushTokenAsync: jest.fn(async () => mockDeviceToken),
  addPushTokenListener: jest.fn((listener: (token: { type: string; data: string }) => void) => {
    mockTokenListener = listener;
    return { remove: jest.fn() };
  }),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      ios: { bundleIdentifier: 'app.flowi.mobile' },
      android: { package: 'app.flowi.mobile' },
      extra: { eas: { projectId: 'proj-1' } },
    },
    easConfig: null,
  },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

import {
  getRegistrationPushToken,
  nativeTokenFrom,
  registerPushToken,
  setupPushInteractionHandlers,
  unregisterPushToken,
} from '@/store/push';

const REGISTERED_KEY = 'push_token_registered';
const APNS = 'a1'.repeat(32);

function posts(): [string, ApiFetchOpts?][] {
  return mockApiFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
}
function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

beforeEach(() => {
  mockStore.clear();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async () => ({}));
  mockDeviceToken = { type: 'ios', data: APNS };
});

describe('nativeTokenFrom', () => {
  it('мапить тип токена ОС на kind/platform', () => {
    expect(nativeTokenFrom({ type: 'ios', data: 'ab' })).toEqual({ kind: 'apns', token: 'ab', platform: 'ios' });
    expect(nativeTokenFrom({ type: 'android', data: 'f1' })).toEqual({ kind: 'fcm', token: 'f1', platform: 'android' });
    expect(nativeTokenFrom({ type: 'web', data: 'x' })).toBeNull();
    expect(nativeTokenFrom({ type: 'ios', data: '' })).toBeNull();
    expect(nativeTokenFrom(null)).toBeNull();
  });
});

describe('registerPushToken — нативний токен', () => {
  it('POST /notifications/devices/ з kind=apns, app_version і bundle_id', async () => {
    await registerPushToken('u-1', 'ws-1');
    const calls = posts();
    expect(calls).toHaveLength(1);
    const [path, opts] = calls[0];
    expect(path).toBe('/notifications/devices/');
    expect(opts?.body).toMatchObject({
      kind: 'apns', token: APNS, platform: 'ios', app_version: '1.4.0', bundle_id: 'app.flowi.mobile',
    });
    expect(opts?.body).not.toHaveProperty('previous_token');
    expect(read<{ kind: string; token: string } | null>(REGISTERED_KEY, null)).toMatchObject({ kind: 'apns', token: APNS });
  });

  it('незмінний токен не POST-иться вдруге, але перереєструється через тиждень', async () => {
    await registerPushToken('u-1', 'ws-1');
    await registerPushToken('u-1', 'ws-1');
    expect(posts()).toHaveLength(1);

    const record = read<Record<string, unknown>>(REGISTERED_KEY, {});
    mockStore.set(REGISTERED_KEY, JSON.stringify({ ...record, at: new Date(Date.now() - 8 * 86400_000).toISOString() }));
    await registerPushToken('u-1', 'ws-1');
    expect(posts()).toHaveLength(2);
  });

  it('новий токен ОС → previous_token зі старим', async () => {
    await registerPushToken('u-1', 'ws-1');
    mockDeviceToken = { type: 'ios', data: 'b2'.repeat(32) };
    await registerPushToken('u-1', 'ws-1');
    const last = posts()[1][1]?.body;
    expect(last).toMatchObject({ token: 'b2'.repeat(32), previous_token: APNS });
  });

  it('інший користувач на тому ж пристрої — без previous_token (чужий рядок сервер не чіпає)', async () => {
    await registerPushToken('u-1', 'ws-1');
    mockDeviceToken = { type: 'ios', data: 'b2'.repeat(32) };
    await registerPushToken('u-2', 'ws-1');
    expect(posts()[1][1]?.body).not.toHaveProperty('previous_token');
  });

  it('Android → kind=fcm', async () => {
    mockDeviceToken = { type: 'android', data: 'fcm-token-123' };
    await registerPushToken('u-1', 'ws-1');
    // Platform.OS у jest-expo — ios, тож bundle_id береться з ios-конфігу; важить kind/platform.
    expect(posts()[0][1]?.body).toMatchObject({ kind: 'fcm', token: 'fcm-token-123', platform: 'android' });
  });

  it('сервер N-1 (400 на kind) → запасний Expo-токен', async () => {
    mockApiFetch.mockImplementation(async (path, opts) => {
      if (opts?.method === 'POST' && (opts.body as { kind?: string })?.kind === 'apns') {
        throw Object.assign(new Error('bad'), { status: 400, details: { code: 'invalid_request', fields: { kind: ['x'] } } });
      }
      return {};
    });
    await registerPushToken('u-1', 'ws-1');
    const bodies = posts().map(([, opts]) => opts?.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ kind: 'expo', token: 'ExponentPushToken[fallback]' });
    expect(read<{ kind: string } | null>(REGISTERED_KEY, null)).toMatchObject({ kind: 'expo' });
  });

  it('інша 400 (напр. bundle_id) — без фолбеку і без запису «зареєстровано»', async () => {
    mockApiFetch.mockImplementation(async (_path, opts) => {
      if (opts?.method === 'POST') {
        throw Object.assign(new Error('bad'), { status: 400, details: { fields: { bundle_id: ['x'] } } });
      }
      return {};
    });
    await registerPushToken('u-1', 'ws-1');
    expect(posts()).toHaveLength(1);
    expect(read(REGISTERED_KEY, null)).toBeNull();
  });
});

describe('оновлення токена і вихід', () => {
  it('addPushTokenListener перереєструє з previous_token', async () => {
    mockStore.set('auth_user', JSON.stringify({ id: 'u-1' }));
    await registerPushToken('u-1', 'ws-1');
    const stop = setupPushInteractionHandlers();
    expect(mockTokenListener).not.toBeNull();
    mockTokenListener?.({ type: 'ios', data: 'c3'.repeat(32) });
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    const last = posts().at(-1)?.[1]?.body;
    expect(last).toMatchObject({ token: 'c3'.repeat(32), previous_token: APNS, kind: 'apns' });
    stop();
  });

  it('unregisterPushToken знімає нативний токен', async () => {
    await registerPushToken('u-1', 'ws-1');
    await unregisterPushToken();
    const deletes = mockApiFetch.mock.calls.filter(([, opts]) => opts?.method === 'DELETE');
    expect(deletes.map(([path, opts]) => [path, opts?.body?.token])).toEqual([['/notifications/devices/', APNS]]);
    expect(read(REGISTERED_KEY, null)).toBeNull();
  });
});

describe('getRegistrationPushToken — нативний токен для заявки (rc1)', () => {
  const Notifications = jest.requireMock('expo-notifications') as {
    getExpoPushTokenAsync: jest.Mock; getPermissionsAsync: jest.Mock;
  };
  const Constants = (jest.requireMock('expo-constants') as { default: { expoConfig: { extra: unknown } } }).default;

  it('iOS → {kind:apns, token, platform:ios}; Expo-токен не запитується', async () => {
    Notifications.getExpoPushTokenAsync.mockClear();
    mockDeviceToken = { type: 'ios', data: 'beef' };
    await expect(getRegistrationPushToken()).resolves.toEqual({ kind: 'apns', token: 'beef', platform: 'ios' });
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('Android → {kind:fcm}', async () => {
    mockDeviceToken = { type: 'android', data: 'fcm-1' };
    await expect(getRegistrationPushToken()).resolves.toEqual({ kind: 'fcm', token: 'fcm-1', platform: 'android' });
  });

  it('не потребує EAS projectId', async () => {
    const extra = Constants.expoConfig.extra;
    Constants.expoConfig.extra = {};
    try {
      mockDeviceToken = { type: 'ios', data: 'c0de' };
      await expect(getRegistrationPushToken()).resolves.toMatchObject({ kind: 'apns', token: 'c0de' });
    } finally {
      Constants.expoConfig.extra = extra;
    }
  });

  it('без дозволу — null', async () => {
    Notifications.getPermissionsAsync.mockImplementationOnce(async () => ({ status: 'denied' }));
    await expect(getRegistrationPushToken()).resolves.toBeNull();
  });
});
