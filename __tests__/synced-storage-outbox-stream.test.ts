/**
 * __tests__/synced-storage-outbox-stream.test.ts — маршрутизація outbox
 * (`OutboxItem.stream`, WORKSPACE_PROJECTS_CONTRACT §3.5) через резолвер, що
 * встановлює `store/project-sync.ts`.
 *
 * Без резолвера (setOutboxStreamResolver(null)) — точна стара поведінка:
 * `stream` лишається undefined ('personal'), жоден наявний тест на outbox
 * цього не бачить.
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
  OutboxItem,
  resolveOutboxStreamForRecord,
  saveSynced,
  setOutboxStreamResolver,
  updateSynced,
} from '@/store/synced-storage';

interface TaskRow { id: string; title: string; projectId?: string; }

function outbox(): OutboxItem[] {
  const raw = mockStore.get('sync_outbox');
  return raw === undefined ? [] : (JSON.parse(raw) as OutboxItem[]);
}

beforeEach(() => {
  mockStore.clear();
  setOutboxStreamResolver(null);
});

afterEach(() => {
  setOutboxStreamResolver(null);
});

describe('outbox stream resolver — off (default, no store/project-sync.ts mounted)', () => {
  it('leaves stream undefined, exactly like before project streams existed', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    const [item] = outbox();
    expect(item.stream).toBeUndefined();
  });
});

describe('outbox stream resolver — on', () => {
  beforeEach(() => {
    setOutboxStreamResolver(async (_collection, _localId, record) => {
      const projectId = typeof record?.projectId === 'string' ? record.projectId : undefined;
      return projectId === 'p-1' ? 'project:p-1' : 'personal';
    });
  });

  it('tags a new record with its project stream', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    const [item] = outbox();
    expect(item.stream).toBe('project:p-1');
  });

  it('a personal record keeps stream undefined (compact form)', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A' }]);
    const [item] = outbox();
    expect(item.stream).toBeUndefined();
  });

  it('deleting a record routes by what it WAS, not by the now-missing data', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    await updateSynced<TaskRow>('tasks', rows => rows.filter(r => r.id !== 't-1'));
    const deleteItem = outbox().find(i => i.deleted);
    expect(deleteItem?.stream).toBe('project:p-1');
  });

  it('resolveOutboxStreamForRecord is the same function generateFullOutbox calls', async () => {
    await expect(resolveOutboxStreamForRecord('tasks', 't-1', { projectId: 'p-1' })).resolves.toBe('project:p-1');
    await expect(resolveOutboxStreamForRecord('tasks', 't-1', {})).resolves.toBeUndefined();
  });

  it('a resolver that throws degrades to personal instead of failing the save', async () => {
    setOutboxStreamResolver(async () => { throw new Error('boom'); });
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    const [item] = outbox();
    expect(item.stream).toBeUndefined();
  });
});

describe('outbox stream resolver — moving a record between streams (contract §3.5)', () => {
  beforeEach(() => {
    setOutboxStreamResolver(async (_collection, _localId, record) => {
      const projectId = typeof record?.projectId === 'string' ? record.projectId : undefined;
      if (projectId === 'p-1') return 'project:p-1';
      if (projectId === 'p-2') return 'project:p-2';
      return 'personal';
    });
  });

  it('reassigning a task from personal to a project queues delete(personal) + upsert(project) — not just one', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A' }]);
    // saveSynced дало один upsert 'personal' — прибираємо його з чергою, аби
    // рахувати рівно те, що дає переміщення.
    mockStore.set('sync_outbox', JSON.stringify([]));

    await updateSynced<TaskRow>('tasks', rows => rows.map(r => (r.id === 't-1' ? { ...r, projectId: 'p-1' } : r)));

    const items = outbox().filter(i => i.local_id === 't-1');
    expect(items).toHaveLength(2);
    const upsert = items.find(i => !i.deleted);
    const del = items.find(i => i.deleted);
    expect(upsert?.stream).toBe('project:p-1');
    expect(del?.stream).toBeUndefined(); // 'personal' — компактна форма
  });

  it('reassigning a task between two projects queues delete(old project) + upsert(new project)', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    mockStore.set('sync_outbox', JSON.stringify([]));

    await updateSynced<TaskRow>('tasks', rows => rows.map(r => (r.id === 't-1' ? { ...r, projectId: 'p-2' } : r)));

    const items = outbox().filter(i => i.local_id === 't-1');
    expect(items).toHaveLength(2);
    expect(items.find(i => !i.deleted)?.stream).toBe('project:p-2');
    expect(items.find(i => i.deleted)?.stream).toBe('project:p-1');
  });

  it('editing a field WITHOUT changing projectId queues only the one expected upsert', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    mockStore.set('sync_outbox', JSON.stringify([]));

    await updateSynced<TaskRow>('tasks', rows => rows.map(r => (r.id === 't-1' ? { ...r, title: 'B' } : r)));

    const items = outbox().filter(i => i.local_id === 't-1');
    expect(items).toHaveLength(1);
    expect(items[0].deleted).toBe(false);
    expect(items[0].stream).toBe('project:p-1');
  });

  it('a brand-new record never gets a spurious delete (no "before" to move away from)', async () => {
    await saveSynced<TaskRow>('tasks', [{ id: 't-1', title: 'A', projectId: 'p-1' }]);
    const items = outbox().filter(i => i.local_id === 't-1');
    expect(items).toHaveLength(1);
    expect(items[0].deleted).toBe(false);
  });
});
