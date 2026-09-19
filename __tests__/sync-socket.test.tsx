/**
 * __tests__/sync-socket.test.tsx — realtime-сокет рушія синку.
 *
 *  - 4401 (сервер відхилив токен) → оновлення токена, потім перепідключення з
 *    НОВИМ токеном, а не коло відмов із кешованим;
 *  - онлайн-режим, увімкнений пізніше, відкриває сокет (доти open() мовчки
 *    виходив і більше ніхто його не кликав);
 *  - повідомлення сокета запускає пул за ~1 с.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));

const mockApiFetch = jest.fn();
const mockGetFreshAccessToken = jest.fn();
const mockRefreshSession = jest.fn();

// Фабрика викликається під час hoisted-імпорту — до ініціалізації констант
// файлу, тож справжній модуль береться прямо в ній.
jest.mock('@/store/api', () => ({
  ApiError: jest.requireActual('@/store/api').ApiError,
  OfflineError: jest.requireActual('@/store/api').OfflineError,
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  getFreshAccessToken: () => mockGetFreshAccessToken(),
  refreshSession: () => mockRefreshSession(),
}));

import React from 'react';

import { setOnlineImperative } from '@/store/app-mode';
import { setProjectsChangedHandler, SyncProvider } from '@/store/sync-engine';
import { SYNC_ARRAY_KEYS, SYNC_SINGLETON_KEYS } from '@/store/sync-contract';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  closed = false;
  constructor(public url: string, public protocols: string[]) {
    FakeSocket.instances.push(this);
  }
  close() { this.closed = true; }
}

const v2 = () => ({
  contract_version: 2, protocol_version: 2, cursor: 9,
  changes: [], acknowledged: [], conflicts: [], next_cursor: null,
});

async function tick(ms = 0): Promise<void> {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
}

let renderer: any;

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  mockStore.set('server_change_cursor_v2', '5');
  mockStore.set('sync_known_collections_v2', JSON.stringify([...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS]));
  FakeSocket.instances = [];
  (global as any).WebSocket = FakeSocket;
  mockApiFetch.mockReset().mockResolvedValue(v2());
  mockGetFreshAccessToken.mockReset().mockResolvedValue('token-1');
  mockRefreshSession.mockReset();
  setOnlineImperative(true);
});

afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = null;
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function mount(): Promise<void> {
  await act(async () => { renderer = create(<SyncProvider isAuthed>{null}</SyncProvider>); });
  await tick();
}

test('4401 → оновлення токена → перепідключення з новим токеном', async () => {
  await mount();
  expect(FakeSocket.instances).toHaveLength(1);
  expect(FakeSocket.instances[0].protocols).toEqual(['flowi-jwt', 'token-1']);

  mockRefreshSession.mockResolvedValue('ok');
  mockGetFreshAccessToken.mockResolvedValue('token-2');
  await act(async () => { FakeSocket.instances[0].onclose?.({ code: 4401 }); });
  await tick(1_100);

  expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  expect(FakeSocket.instances).toHaveLength(2);
  expect(FakeSocket.instances[1].protocols).toEqual(['flowi-jwt', 'token-2']);
});

test('4401 з мертвою сесією — більше не стукаємо', async () => {
  await mount();
  mockRefreshSession.mockResolvedValue('invalid');
  await act(async () => { FakeSocket.instances[0].onclose?.({ code: 4401 }); });
  await tick(60_000);
  expect(FakeSocket.instances).toHaveLength(1);
});

test('онлайн-режим, увімкнений пізніше, відкриває сокет', async () => {
  setOnlineImperative(false);
  await mount();
  expect(FakeSocket.instances).toHaveLength(0);

  await act(async () => { setOnlineImperative(true); });
  await tick();
  expect(FakeSocket.instances).toHaveLength(1);
});

test('вимкнення онлайн-режиму закриває сокет', async () => {
  await mount();
  await act(async () => { setOnlineImperative(false); });
  expect(FakeSocket.instances[0].closed).toBe(true);
});

test('повідомлення сокета тягне зміни за ~1 с', async () => {
  await mount();
  await tick(2_000); // cold-start синк відпрацював
  mockApiFetch.mockClear();

  await act(async () => { FakeSocket.instances[0].onmessage?.(); });
  await tick(1_000);
  expect(mockApiFetch).toHaveBeenCalledTimes(1);
});

describe('projects_changed (§5.2, major з ревʼю: ws/user/ раніше лише планував особистий синк)', () => {
  afterEach(() => setProjectsChangedHandler(null));

  test('{"type":"projects_changed"} викликає зареєстрований обробник (store/project-sync.ts)', async () => {
    const handler = jest.fn();
    setProjectsChangedHandler(handler);
    await mount();

    await act(async () => {
      (FakeSocket.instances[0].onmessage as unknown as (e: { data: string }) => void)?.(
        { data: JSON.stringify({ type: 'projects_changed' }) },
      );
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('звичайний сигнал (sync_changed / без type) обробник НЕ чіпає', async () => {
    const handler = jest.fn();
    setProjectsChangedHandler(handler);
    await mount();

    await act(async () => {
      (FakeSocket.instances[0].onmessage as unknown as (e: { data: string }) => void)?.(
        { data: JSON.stringify({ type: 'sync_changed' }) },
      );
    });
    await act(async () => {
      (FakeSocket.instances[0].onmessage as unknown as (e?: { data?: string }) => void)?.();
    });

    expect(handler).not.toHaveBeenCalled();
  });
});
