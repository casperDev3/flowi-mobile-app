/**
 * __tests__/audit-perf-skeptic.test.ts — перевірка знахідок аудиту
 * «Продуктивність RN» (фаза спостереження, нічого не виправляє).
 */

const mockStore = new Map<string, string>();
const getCalls: string[] = [];
const setCalls: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => { getCalls.push(k); return mockStore.has(k) ? mockStore.get(k)! : null; }),
  setItem: jest.fn(async (k: string, v: string) => { setCalls.push(k); mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  getAllKeys: jest.fn(async () => { getCalls.push('@@getAllKeys'); return [...mockStore.keys()]; }),
  multiRemove: jest.fn(async (keys: string[]) => { for (const k of keys) mockStore.delete(k); }),
}));

import { saveSynced, resolveOutboxStreamForRecord, type OutboxItem } from '@/store/synced-storage';
import { installOutboxStreamResolver } from '@/store/project-sync';
import { runStorageMigrations } from '@/store/migrations';

interface Row { id: string; name: string }

function outbox(): OutboxItem[] {
  const raw = mockStore.get('sync_outbox');
  return raw === undefined ? [] : (JSON.parse(raw) as OutboxItem[]);
}

beforeEach(() => { mockStore.clear(); getCalls.length = 0; setCalls.length = 0; });

describe('PERF-6: ефект-дзеркало пише назад те саме, що щойно прочитав', () => {
  it('однаковий вміст, інша ідентичність масиву → запис усе одно відбувається', async () => {
    const stored: Row[] = [{ id: 'a', name: 'Коробка' }, { id: 'b', name: 'Ще одна' }];
    mockStore.set('containers', JSON.stringify(stored));

    // Те, що робить екран: loadData → setState → ефект → saveSynced(state)
    const fromState = JSON.parse(mockStore.get('containers')!) as Row[];
    setCalls.length = 0;
    await saveSynced<Row>('containers', fromState);

    // Якби ранній вихід `items === existing` спрацьовував — setItem не було б.
    expect(setCalls).toContain('containers');
    // І при цьому в outbox нічого немає: запис справді холостий.
    expect(outbox()).toEqual([]);
  });
});

describe('PERF-1: резолвер потоку outbox читає сховище на КОЖЕН запис', () => {
  it('один виклик резолвера = 4 читання AsyncStorage, без кешу між викликами', async () => {
    mockStore.set('projects', JSON.stringify([{ id: 'p1' }]));
    mockStore.set('workspace_projects_v1', JSON.stringify([{ id: 'p1' }]));
    const uninstall = installOutboxStreamResolver();
    try {
      getCalls.length = 0;
      await resolveOutboxStreamForRecord('tasks', 't1', { id: 't1', projectId: 'p1' });
      const first = getCalls.length;
      expect(first).toBe(4);

      getCalls.length = 0;
      for (let i = 0; i < 10; i++) {
        await resolveOutboxStreamForRecord('tasks', `t${i}`, { id: `t${i}`, projectId: 'p1' });
      }
      expect(getCalls.length).toBe(40); // жодного кешу: 4 × N
    } finally {
      uninstall();
    }
  });
});

describe('PERF-5: журнал застосованих міграцій не гейтить жодного кроку', () => {
  it('другий холодний старт читає стільки ж ключів, скільки перший', async () => {
    mockStore.set('tasks', JSON.stringify([{ id: 't1', title: 'a', timeEntries: [] }]));
    mockStore.set('transactions', JSON.stringify([{ id: 'x1', currency: 'UAH' }]));
    mockStore.set('auth_user', JSON.stringify({ id: 'u1' }));

    getCalls.length = 0;
    await runStorageMigrations();
    const firstRun = [...getCalls];

    getCalls.length = 0;
    await runStorageMigrations();
    const secondRun = [...getCalls];

    // Журнал MIGRATIONS_KEY прочитано — але нічого не пропущено.
    expect(firstRun).toContain('storage_migrations_applied');
    expect(secondRun.length).toBe(15); // сталий стан: 15 звернень до сховища на КОЖНОМУ старті
    console.log('ЧИТАНЬ 1-й старт:', firstRun.length, firstRun.join(','));
    console.log('ЧИТАНЬ 2-й старт:', secondRun.length, secondRun.join(','));
    // 'tasks' парситься двічі за один прохід (migrateOpenTaskTimers + backfill)
    expect(secondRun.filter(k => k === 'tasks').length).toBe(2);
  });
});
