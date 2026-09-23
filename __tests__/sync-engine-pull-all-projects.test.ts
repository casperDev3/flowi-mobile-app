/**
 * __tests__/sync-engine-pull-all-projects.test.ts — пункт 7: «витягнути все з
 * сервера» (`pullAllFromServer`) не мусить стирати дані проєктів.
 *
 * Особистий потік (`/sync/user/v2/`) не несе записів проєктів — вони живуть у
 * `/projects/{id}/sync/`. Раніше `pruneRecordsMissingOnServer` вважав їх
 * «відсутніми на сервері» й видаляв, а курсори проєктів лишались попереду, тож
 * задачі проєктів більше ніколи не поверталися на пристрій.
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

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: () => true,
}));

const mockApiFetch = jest.fn();
const mockActualApi = jest.requireActual('@/store/api');

jest.mock('@/store/api', () => ({
  ApiError: mockActualApi.ApiError,
  OfflineError: mockActualApi.OfflineError,
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { SYNC_ARRAY_KEYS, SYNC_SERVER_OWNED_KEYS, SYNC_SINGLETON_KEYS } from '@/store/sync-contract';

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

function v2(over: Partial<Record<string, unknown>> = {}) {
  return {
    contract_version: 2, protocol_version: 2, cursor: 9,
    changes: [], acknowledged: [], conflicts: [], next_cursor: null,
    ...over,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockStore.clear();
  mockApiFetch.mockReset();
  seed('server_change_cursor_v2', 5);
  seed('sync_known_collections_v2', [...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS, ...SYNC_SERVER_OWNED_KEYS]);
  seed('data_owner', { workspaceId: 'w-test', userId: 'u-test' });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('pullAllFromServer — дані проєктів (пункт 7)', () => {
  test('задачі з projectId лишаються, особисті-лише-локальні прибираються', async () => {
    seed('workspace_projects', [{ id: 'p1', name: 'P1', cursor: 20 }]);
    seed('projects', [{ id: 'p1', name: 'P1', color: '#000' }]);
    seed('tasks', [
      { id: 't-personal-server', title: 'є на сервері' },
      { id: 't-personal-local', title: 'сервер не знає' },
      { id: 't-project', title: 'задача проєкту', projectId: 'p1' },
    ]);
    mockApiFetch.mockResolvedValue(v2({
      changes: [{
        collection: 'tasks', local_id: 't-personal-server', deleted: false, client_updated_at: null,
        updated_at: 1, revision: 1, change_seq: 1, data: { id: 't-personal-server', title: 'є на сервері' },
      }],
    }));

    await loadEngine().pullAllFromServer();

    expect(read<{ id: string }[]>('tasks', []).map(t => t.id).sort()).toEqual(['t-personal-server', 't-project']);
    // Сам проєкт (колекція 'projects') — теж потік проєкту, не особистий.
    expect(read<{ id: string }[]>('projects', []).map(p => p.id)).toEqual(['p1']);
  });

  test('скидає курсори/ревізії проєктів і запускає їхній синк', async () => {
    seed('projects', [{ id: 'p1', name: 'P1', color: '#000' }]);
    seed('project_sync_state_v1', {
      p1: { cursor: 20, revisions: { 'tasks:t-project': 4 }, role: 'member', lastSyncedAt: 123 },
    });
    mockApiFetch.mockResolvedValue(v2());
    const engine = loadEngine();
    const handler = jest.fn();
    engine.setProjectsChangedHandler(handler);

    await engine.pullAllFromServer();

    expect(read('project_sync_state_v1', {})).toEqual({
      p1: { cursor: 0, revisions: {}, role: 'member', lastSyncedAt: 123 },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('чекає на обміни проєктів, що вже йдуть, і лише потім скидає курсори', async () => {
    seed('projects', [{ id: 'p1', name: 'P1', color: '#000' }]);
    seed('project_sync_state_v1', {
      p1: { cursor: 20, revisions: { 'tasks:t-project': 4 }, role: 'member', lastSyncedAt: 123 },
    });
    mockApiFetch.mockResolvedValue(v2());
    const engine = loadEngine();
    // Обмін проєкту, що стартував ДО «витягнути все»: наприкінці він пише свій
    // старий курсор. Без очікування цей запис лягав поверх скинутого нуля.
    engine.setProjectSyncsIdleWaiter(async () => {
      seed('project_sync_state_v1', {
        p1: { cursor: 21, revisions: { 'tasks:t-project': 5 }, role: 'member', lastSyncedAt: 456 },
      });
    });

    await engine.pullAllFromServer();

    expect(read('project_sync_state_v1', {})).toEqual({
      p1: { cursor: 0, revisions: {}, role: 'member', lastSyncedAt: 456 },
    });
    engine.setProjectSyncsIdleWaiter(null);
  });

  test('задача проєкту з колізією id (лишається особистою) і далі прибирається', async () => {
    seed('projects', [{ id: 'p-clash', name: 'Clash', color: '#000' }]);
    seed('project_id_conflicts_v1', ['p-clash']);
    seed('tasks', [{ id: 't1', projectId: 'p-clash', title: 'особисте насправді' }]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().pullAllFromServer();

    expect(read('tasks', [])).toEqual([]);
  });
});
