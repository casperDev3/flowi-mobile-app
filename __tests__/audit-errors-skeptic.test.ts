/**
 * __tests__/audit-errors-skeptic.test.ts — перевірка знахідок аудиту
 * «Помилки і крайові стани» (фаза спостереження, нічого не виправляє).
 */

const mockStore = new Map<string, string>();
let mockFailGet = new Set<string>();
let mockFailSet = new Set<string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (mockFailGet.has(k)) throw new Error('CursorWindow: Row too big');
    return mockStore.has(k) ? mockStore.get(k)! : null;
  }),
  setItem: jest.fn(async (k: string, v: string) => {
    if (mockFailSet.has(k)) throw new Error('SQLITE_FULL');
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

import { loadData } from '@/store/storage';
import { saveSynced, updateSynced, type OutboxItem } from '@/store/synced-storage';

interface Med { id: string; name: string }

function outbox(): OutboxItem[] {
  const raw = mockStore.get('sync_outbox');
  return raw === undefined ? [] : (JSON.parse(raw) as OutboxItem[]);
}

beforeEach(() => { mockStore.clear(); mockFailGet = new Set(); mockFailSet = new Set(); });

describe('ERR-01: читання впало → ефект-дзеркало затирає ключ', () => {
  it('зіпсований JSON: екран бачить [], і назад у сховище лягає []', async () => {
    mockStore.set('health_meds', '{{{ не JSON');
    const seen = await loadData<Med[]>('health_meds', []);
    expect(seen).toEqual([]); // помилку проковтнуто

    // ефект-дзеркало екрана: saveSynced(KEY, meds) зі щойно прочитаним []
    await saveSynced<Med>('health_meds', seen);
    expect(mockStore.get('health_meds')).toBe('[]'); // байти знищено
    expect(outbox()).toEqual([]);                    // сервер про це не знає
  });

  it('getItem кидає: те саме, ключ перезаписано порожнім масивом', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'a', name: 'Аспірин' }]));
    mockFailGet.add('health_meds');
    const seen = await loadData<Med[]>('health_meds', []);
    mockFailGet.clear();               // збій одноразовий — запис проходить
    await saveSynced<Med>('health_meds', seen);
    expect(JSON.parse(mockStore.get('health_meds')!)).toEqual([]);
  });
});

describe('ERR-07: чи справді updateSynced кидає на збої запису', () => {
  it('setItem падає — updateSynced НЕ кидає, catch у екранів не спрацьовує', async () => {
    mockFailSet.add('tasks');
    await expect(
      updateSynced<Med>('tasks', fresh => [{ id: 'x', name: 'нова' }, ...fresh]),
    ).resolves.toBeDefined(); // жодного throw — гілка catch недосяжна
    expect(mockStore.has('tasks')).toBe(false); // а даних немає
  });

  it('кидає лише коли в ключі лежить не масив', async () => {
    mockStore.set('tasks', JSON.stringify({ oops: true }));
    await expect(
      updateSynced<Med>('tasks', fresh => [{ id: 'x', name: 'нова' }, ...fresh]),
    ).rejects.toThrow('unexpected storage shape');
  });
});
