/**
 * __tests__/sync-upgrade-catchup.test.ts — оновлення зі збірки 1.0.1.
 *
 * 1.0.1 не знала колекцій `subscriptions` і `timer_dial_prefs`: на pull вона
 * записувала їхні ревізії, відкидала дані й рухала курсор далі. Нова збірка
 * мусить (а) довантажити ці рядки, не рухаючи головного курсора, і
 * (б) не перезаписати серверне значення «сліпо» зі старою ревізією.
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

jest.mock('@/store/app-mode', () => ({ isOnlineMode: () => true }));

const mockApiFetch = jest.fn();
const mockActualApi = jest.requireActual('@/store/api');
jest.mock('@/store/api', () => ({
  ApiError: mockActualApi.ApiError,
  OfflineError: mockActualApi.OfflineError,
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { SYNC_ARRAY_KEYS, SYNC_SINGLETON_KEYS } from '@/store/sync-contract';

type Engine = typeof import('@/store/sync-engine');

function loadEngine(): Engine {
  let engine!: Engine;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules працює лише з require
    engine = require('@/store/sync-engine');
  });
  engine.setIsAuthed(true);
  return engine;
}

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

interface Row {
  collection: string;
  local_id: string;
  data: unknown;
  deleted: boolean;
  client_updated_at: string | null;
  updated_at: number;
  revision: number;
  change_seq: number;
}

/** Мінімальний сервер: віддає рядки з change_seq > cursor, OCC за base_revision. */
function fakeServer(rows: Row[], serverCursor = 50) {
  return async (_path: string, init: { body: { cursor: number; mutations: any[] } }) => {
    const { cursor, mutations } = init.body;
    const acknowledged: unknown[] = [];
    const conflicts: unknown[] = [];
    for (const m of mutations) {
      const existing = rows.find(r => r.collection === m.collection && r.local_id === m.local_id);
      if (existing && m.base_revision !== existing.revision && !m.force) {
        conflicts.push({
          status: 'conflict', mutation_id: m.mutation_id, collection: m.collection, local_id: m.local_id,
          server: existing, client: { data: m.data, deleted: m.operation === 'delete', base_revision: m.base_revision },
        });
        continue;
      }
      acknowledged.push({
        status: 'applied', mutation_id: m.mutation_id, collection: m.collection, local_id: m.local_id,
        revision: (existing?.revision ?? 0) + 1, change_seq: serverCursor + 1,
      });
    }
    return {
      contract_version: 2,
      protocol_version: 2,
      cursor: serverCursor,
      changes: rows.filter(r => r.change_seq > cursor),
      acknowledged,
      conflicts,
      rejected: [],
      next_cursor: null,
    };
  };
}

const WEB_SUB: Row = {
  collection: 'subscriptions', local_id: 'web-sub-1',
  data: { id: 'web-sub-1', name: 'Netflix', nextPaymentDate: '2026-10-01', updatedAt: '2026-09-01T00:00:00Z' },
  deleted: false, client_updated_at: '2026-09-01T00:00:00Z', updated_at: 1, revision: 1, change_seq: 40,
};
const WEB_DIALS: Row = {
  collection: 'timer_dial_prefs', local_id: 'timer_dial_prefs',
  data: { value: { version: 1, defaultDial: 'rings', timers: { 'task:1': 'flip' } } },
  deleted: false, client_updated_at: null, updated_at: 1, revision: 3, change_seq: 41,
};
const OLD_TASK: Row = {
  collection: 'tasks', local_id: 't1',
  data: { id: 't1', title: 'стара версія з сервера' },
  deleted: false, client_updated_at: null, updated_at: 1, revision: 1, change_seq: 10,
};

/** Сховище, яке лишила 1.0.1 після pull цих рядків. */
function seedStorageOf101(): void {
  seed('server_change_cursor_v2', 50);
  seed('server_record_revisions_v2', {
    'tasks:t1': 2,
    'subscriptions:web-sub-1': 1,
    'timer_dial_prefs:timer_dial_prefs': 3,
  });
  seed('tasks', [{ id: 't1', title: 'локальна новіша версія' }]);
}

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  mockApiFetch.mockReset();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('collectionsAddedSince', () => {
  test('без маркера — колекції, яких не знала 1.0.1', () => {
    const engine = loadEngine();
    expect(engine.collectionsAddedSince(null).sort()).toEqual(['subscriptions', 'timer_dial_prefs']);
  });

  test('маркер поточної збірки — нічого не додано', () => {
    const engine = loadEngine();
    expect(engine.collectionsAddedSince([...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS])).toEqual([]);
  });

  test('майбутня адитивна колекція теж підхоплюється', () => {
    const engine = loadEngine();
    const stored = engine.currentSyncCollections().filter(c => c !== 'sprints');
    expect(engine.collectionsAddedSince(stored)).toEqual(['sprints']);
  });

  test('dropRevisionsForCollections прибирає лише точний префікс колекції', () => {
    const engine = loadEngine();
    expect(engine.dropRevisionsForCollections(
      { 'subscriptions:a': 1, 'tasks:subscriptions:x': 2, 'active_timers:task:1': 3 },
      ['subscriptions'],
    )).toEqual({ 'tasks:subscriptions:x': 2, 'active_timers:task:1': 3 });
  });
});

describe('doSync після оновлення з 1.0.1', () => {
  test('довантажує підписки й циферблати, не чіпаючи відомих колекцій і головного курсора', async () => {
    seedStorageOf101();
    mockApiFetch.mockImplementation(fakeServer([OLD_TASK, WEB_SUB, WEB_DIALS]));

    await loadEngine().syncNow();

    expect(read<any[]>('subscriptions', [])).toEqual([WEB_SUB.data]);
    expect(read<any>('timer_dial_prefs', null)).toEqual((WEB_DIALS.data as any).value);
    // Відома колекція не перезаписана старою версією з курсора 0.
    expect(read<any[]>('tasks', [])).toEqual([{ id: 't1', title: 'локальна новіша версія' }]);
    expect(read('server_change_cursor_v2', 0)).toBe(50);
    const revisions = read<Record<string, number>>('server_record_revisions_v2', {});
    expect(revisions['tasks:t1']).toBe(2);
    expect(revisions['subscriptions:web-sub-1']).toBe(1);
    expect(read<string[]>('sync_known_collections_v2', []).sort())
      .toEqual([...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS].sort());
    // Перший запит — довантаження з курсора 0 без мутацій, далі звичайний обмін.
    expect(mockApiFetch.mock.calls[0][1].body).toEqual({ cursor: 0, mutations: [] });
    expect(mockApiFetch.mock.calls[1][1].body.cursor).toBe(50);
    expect(read('last_server_sync_error_v2', null)).toBeNull();
  });

  test('локальний вибір циферблата до першого синку не перезаписує серверний «сліпо»', async () => {
    seedStorageOf101();
    // Нова збірка: користувач обрав циферблат ще до першого синку.
    seed('timer_dial_prefs', { version: 1, defaultDial: 'digits', timers: { 'task:2': 'arc' } });
    seed('sync_outbox', [
      { mutation_id: 'm-dial', collection: 'timer_dial_prefs', local_id: 'timer_dial_prefs', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockImplementation(fakeServer([WEB_SUB, WEB_DIALS]));

    await loadEngine().syncNow();

    const sent = mockApiFetch.mock.calls.flatMap(call => call[1].body.mutations as any[]);
    const dial = sent.find(m => m.collection === 'timer_dial_prefs');
    // Без старої ревізії сервер відповідає конфліктом, а не приймає перезапис.
    expect(dial.base_revision).toBeNull();
    expect(read<any[]>('subscriptions', [])).toEqual([WEB_SUB.data]);
  });

  test('повторний синк довантаження не повторює', async () => {
    seedStorageOf101();
    mockApiFetch.mockImplementation(fakeServer([WEB_SUB, WEB_DIALS]));
    const engine = loadEngine();
    await engine.syncNow();
    mockApiFetch.mockClear();

    await engine.syncNow();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][1].body.cursor).toBe(50);
  });

  test('обірване довантаження не зберігає маркер і нічого не видаляє', async () => {
    seedStorageOf101();
    seed('subscriptions', [{ id: 'local-sub', name: 'Spotify' }]);
    mockApiFetch.mockRejectedValue(new mockActualApi.ApiError(503, 'unavailable', 'Unavailable'));

    await loadEngine().syncNow();

    expect(read('sync_known_collections_v2', null)).toBeNull();
    expect(read<any[]>('subscriptions', [])).toEqual([{ id: 'local-sub', name: 'Spotify' }]);
    expect(read<Record<string, number>>('server_record_revisions_v2', {})['subscriptions:web-sub-1']).toBe(1);
    expect(read('server_change_cursor_v2', 0)).toBe(50);
  });

  test('курсор 0 (перший синк) — довантаження не потрібне, маркер ставиться після обміну', async () => {
    mockApiFetch.mockImplementation(fakeServer([WEB_SUB], 40));

    await loadEngine().syncNow();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(read<any[]>('subscriptions', [])).toEqual([WEB_SUB.data]);
    expect(read<string[]>('sync_known_collections_v2', []).length)
      .toBe(SYNC_ARRAY_KEYS.length + SYNC_SINGLETON_KEYS.length);
  });
});
