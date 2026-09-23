/**
 * __tests__/project-sync-cursor-recovery.test.ts — пункт 7: нові дані проєкту
 * мусять доходити до пристрою навіть після того, як курсор розійшовся.
 *
 *  1. Сервер повернув курсор, менший за збережений (потік перезібрано) —
 *     наступний обмін іде з 0, а не «змін нема» назавжди.
 *  2. Запис pull-рядків у сховище провалився — курсор проєкту НЕ зсувається,
 *     інакше ці рядки більше ніколи не приїхали б.
 */

const mockStore = new Map<string, string>();
const mockFailingKeys = new Set<string>();

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
  // Справжній saveData ковтає помилку setItem — так само і тут.
  saveData: jest.fn(async (key: string, data: unknown) => {
    if (mockFailingKeys.has(key)) return;
    mockStore.set(key, JSON.stringify(data));
  }),
  saveDataChecked: jest.fn(async (key: string, data: unknown) => {
    if (mockFailingKeys.has(key)) throw new Error(`setItem(${key}) failed`);
    mockStore.set(key, JSON.stringify(data));
  }),
  notifyStorageChanged: jest.fn(),
  subscribeToStorage: jest.fn(() => () => {}),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: () => true,
  subscribeOnlineMode: () => () => {},
}));

const mockApiFetch = jest.fn();

jest.mock('@/store/api', () => ({
  ...jest.requireActual('@/store/api'),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { getProjectSyncState, syncProject } from '@/store/project-sync';

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

function projectResponse(cursor: number, changes: unknown[] = []) {
  return {
    contract_version: 2, protocol_version: 2, project_id: 'p1', role: 'owner', cursor,
    changes, acknowledged: [], conflicts: [], rejected: [], next_cursor: null,
  };
}

function taskChange(id: string, seq: number) {
  return {
    collection: 'tasks', local_id: id, deleted: false, client_updated_at: null,
    updated_at: seq, revision: 1, change_seq: seq,
    data: { id, title: id, projectId: 'p1' },
  };
}

function syncBodies(): { cursor: number }[] {
  return mockApiFetch.mock.calls
    .filter(([path]) => path === '/projects/p1/sync/')
    .map(([, opts]) => (opts as { body: { cursor: number } }).body);
}

beforeEach(() => {
  mockStore.clear();
  mockFailingKeys.clear();
  mockApiFetch.mockReset();
  seed('projects', [{ id: 'p1', name: 'P1', color: '#000' }]);
  seed('workspace_projects', [{ id: 'p1', name: 'P1', cursor: 10 }]);
});

describe('runProjectSync — курсор сервера відкотився', () => {
  it('збережений курсор 50, сервер 10 → повторний обмін з 0 і нові задачі доїжджають', async () => {
    seed('project_sync_state_v1', {
      p1: { cursor: 50, revisions: { 'tasks:old': 3 }, role: 'owner', lastSyncedAt: 1 },
    });
    mockApiFetch.mockImplementation(async (path: string, opts: { body: { cursor: number } }) => {
      if (path !== '/projects/p1/sync/') throw new Error(`unexpected ${path}`);
      // З курсором 50 сервер «нічого нового» не має; з 0 — віддає задачу.
      return opts.body.cursor === 0
        ? projectResponse(10, [taskChange('t-new', 10)])
        : projectResponse(10);
    });

    await syncProject('p1');

    expect(syncBodies().map(b => b.cursor)).toEqual([50, 0]);
    expect(read<{ id: string }[]>('tasks', []).map(t => t.id)).toEqual(['t-new']);
    const state = (await getProjectSyncState()).p1;
    expect(state.cursor).toBe(10);
    expect(state.revisions).toEqual({ 'tasks:t-new': 1 });
  });

  it('курсор сервера попереду мого — звичайний один обмін', async () => {
    seed('project_sync_state_v1', { p1: { cursor: 5, revisions: {}, role: 'owner', lastSyncedAt: 1 } });
    mockApiFetch.mockResolvedValue(projectResponse(10, [taskChange('t2', 10)]));

    await syncProject('p1');

    expect(syncBodies().map(b => b.cursor)).toEqual([5]);
    expect((await getProjectSyncState()).p1.cursor).toBe(10);
  });
});

describe('applyProjectPull — помилка запису не зсуває курсор', () => {
  it('setItem для tasks кидає → курсор проєкту лишається 5', async () => {
    seed('project_sync_state_v1', { p1: { cursor: 5, revisions: {}, role: 'owner', lastSyncedAt: 1 } });
    mockFailingKeys.add('tasks');
    mockApiFetch.mockResolvedValue(projectResponse(10, [taskChange('t-lost', 10)]));

    await syncProject('p1');

    expect((await getProjectSyncState()).p1.cursor).toBe(5);
  });
});
