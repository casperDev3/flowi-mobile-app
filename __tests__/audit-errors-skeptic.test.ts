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

import {
  hasStorageReadFailure,
  loadData,
  loadDataResult,
  retryStorageRead,
  StorageWriteBlockedError,
} from '@/store/storage';
import {
  resetSyncedKnownIds,
  saveSynced,
  updateSynced,
  type OutboxItem,
} from '@/store/synced-storage';

interface Med { id: string; name: string }

function outbox(): OutboxItem[] {
  const raw = mockStore.get('sync_outbox');
  return raw === undefined ? [] : (JSON.parse(raw) as OutboxItem[]);
}

beforeEach(() => {
  mockStore.clear();
  mockFailGet = new Set();
  mockFailSet = new Set();
  resetSyncedKnownIds();
});

describe('ERR-01: читання впало → запис у ключ заблоковано (ВИПРАВЛЕНО)', () => {
  it('зіпсований JSON: loadData і далі віддає [], але ключ позначено як непрочитаний', async () => {
    mockStore.set('health_meds', '{{{ не JSON');
    const seen = await loadData<Med[]>('health_meds', []);
    expect(seen).toEqual([]);                          // сумісність збережено
    expect(hasStorageReadFailure('health_meds')).toBe(true);

    // ефект-дзеркало екрана: saveSynced(KEY, meds) зі щойно прочитаним []
    await expect(saveSynced<Med>('health_meds', seen)).rejects.toBeInstanceOf(StorageWriteBlockedError);
    expect(mockStore.get('health_meds')).toBe('{{{ не JSON'); // байти цілі
    expect(outbox()).toEqual([]);                             // тумбстоунів немає
  });

  it('getItem кидає: блокування ТРИМАЄТЬСЯ і після того, як збій минув', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'a', name: 'Аспірин' }]));
    mockFailGet.add('health_meds');
    const seen = await loadData<Med[]>('health_meds', []);
    mockFailGet.clear(); // збій одноразовий — саме читання вже проходить

    // Ключове: всередині updateSynced читання ТЕПЕР вдається, але писати
    // порожній масив, порахований із проваленого читання, однаково не можна.
    await expect(saveSynced<Med>('health_meds', seen)).rejects.toBeInstanceOf(StorageWriteBlockedError);
    expect(JSON.parse(mockStore.get('health_meds')!)).toEqual([{ id: 'a', name: 'Аспірин' }]);
  });

  it('після retryStorageRead ключ знову пишеться', async () => {
    mockStore.set('health_meds', JSON.stringify([{ id: 'a', name: 'Аспірин' }]));
    mockFailGet.add('health_meds');
    await loadData<Med[]>('health_meds', []);
    mockFailGet.clear();

    const retried = await retryStorageRead<Med[]>('health_meds', []);
    expect(retried).toEqual({ ok: true, found: true, value: [{ id: 'a', name: 'Аспірин' }] });
    expect(hasStorageReadFailure('health_meds')).toBe(false);

    await saveSynced<Med>('health_meds', [{ id: 'a', name: 'Аспірин 2' }]);
    expect(JSON.parse(mockStore.get('health_meds')!)[0].name).toBe('Аспірин 2');
  });

  it('loadDataResult розрізняє «ключа немає» і «не прочиталось»', async () => {
    const missing = await loadDataResult<Med[]>('health_meds', []);
    expect(missing).toEqual({ ok: true, found: false, value: [] });

    mockStore.set('health_meds', '{{{ не JSON');
    const broken = await loadDataResult<Med[]>('health_meds', []);
    expect(broken.ok).toBe(false);
    expect(broken.value).toEqual([]); // fallback віддається, але з ok:false
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
