/**
 * __tests__/project-sync-state.test.ts — локальний стан рушія проєктного
 * синку (`store/project-sync.ts`): кеш `workspace_projects`, `recent_projects`,
 * і `getMyProjectIds()` (WORKSPACE_PROJECTS_CONTRACT §9.1, §3.5).
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

import {
  addRecentProject,
  forgetRecentProject,
  getMyProjectIds,
  getRecentProjects,
  getWorkspaceProjects,
  setWorkspaceProjects,
  type ProjectSummary,
} from '@/store/project-sync';

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function summary(id: string, cursor = 0): ProjectSummary {
  return {
    id, name: id, color: '#7C3AED', template: 'work', role: 'owner', member_count: 1,
    cursor, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null,
  };
}

beforeEach(() => {
  mockStore.clear();
});

describe('getMyProjectIds', () => {
  it('is empty with no cache and no local projects', async () => {
    expect((await getMyProjectIds()).size).toBe(0);
  });

  it('includes locally-known projects even before any GET /projects/ cache exists', async () => {
    seed('projects', [{ id: 'p-1', name: 'Solo', color: '#000', createdAt: new Date().toISOString() }]);
    expect([...(await getMyProjectIds())]).toEqual(['p-1']);
  });

  it('unions the workspace_projects cache with local projects', async () => {
    await setWorkspaceProjects([summary('p-1'), summary('p-2')]);
    seed('projects', [{ id: 'p-2', name: 'X', color: '#000', createdAt: new Date().toISOString() }, { id: 'p-3', name: 'Y', color: '#000', createdAt: new Date().toISOString() }]);
    const ids = [...(await getMyProjectIds())].sort();
    expect(ids).toEqual(['p-1', 'p-2', 'p-3']);
  });
});

describe('recent projects', () => {
  it('starts empty and accumulates most-recent-first', async () => {
    expect(await getRecentProjects()).toEqual([]);
    await addRecentProject('p-1');
    await addRecentProject('p-2');
    expect(await getRecentProjects()).toEqual(['p-2', 'p-1']);
  });

  it('re-adding an existing project moves it to the front without duplicating', async () => {
    await addRecentProject('p-1');
    await addRecentProject('p-2');
    await addRecentProject('p-1');
    expect(await getRecentProjects()).toEqual(['p-1', 'p-2']);
  });

  it('forgetting a project removes it (§9.4 leaving/losing access)', async () => {
    await addRecentProject('p-1');
    await addRecentProject('p-2');
    await forgetRecentProject('p-1');
    expect(await getRecentProjects()).toEqual(['p-2']);
  });
});

describe('workspace_projects cache', () => {
  it('round-trips through storage', async () => {
    expect(await getWorkspaceProjects()).toEqual([]);
    const list = [summary('p-1', 5)];
    await setWorkspaceProjects(list);
    expect(await getWorkspaceProjects()).toEqual(list);
  });
});
