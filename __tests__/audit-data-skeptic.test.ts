/**
 * __tests__/audit-data-skeptic.test.ts — перевірка знахідок аудиту (тимчасовий
 * файл фази спостереження). Нічого не виправляє, лише доводить/спростовує.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => (mockStore.has(k) ? mockStore.get(k)! : null)),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

import { loadData, saveData } from '@/store/storage';
import { OutboxItem, resetSyncedKnownIds, saveSynced } from '@/store/synced-storage';
import { categoryRowsToMap } from '@/store/migrations';

function outbox(): OutboxItem[] {
  const raw = mockStore.get('sync_outbox');
  return raw === undefined ? [] : (JSON.parse(raw) as OutboxItem[]);
}

beforeEach(() => { mockStore.clear(); resetSyncedKnownIds(); });

interface Med { id: string; name: string }

describe('DI-01: saveSynced зі СТАРОГО React-стану (ВИПРАВЛЕНО)', () => {
  it('НЕ ставить тумбстоун на запис, що приїхав синком повз екран', async () => {
    // 1. екран змонтувався: у сховищі один запис, ефект-дзеркало його зберіг
    await saveSynced<Med>('health_meds', [{ id: 'a', name: 'Аспірин' }]);
    mockStore.set('sync_outbox', '[]');

    // React-стан екрана: [a]
    const screenState: Med[] = [{ id: 'a', name: 'Аспірин' }];

    // 2. синк поклав у сховище чужий запис b (екран про нього не знає)
    const stored = await loadData<Med[]>('health_meds', []);
    await saveData('health_meds', [...stored, { id: 'b', name: 'Вітамін D' }]);

    // 3. користувач править a на екрані → ефект пише ВЕСЬ стан
    await saveSynced<Med>('health_meds', screenState.map(m => ({ ...m, name: 'Аспірин 2' })));

    const afterStorage = await loadData<Med[]>('health_meds', []);
    expect(afterStorage.map(m => m.id)).toEqual(['a', 'b']);        // b на місці
    expect(afterStorage.find(m => m.id === 'a')!.name).toBe('Аспірин 2'); // правка застосована
    expect(outbox().filter(i => i.deleted)).toEqual([]);            // тумбстоунів немає
    expect(outbox().map(i => i.local_id)).toEqual(['a']);           // на сервер їде лише a
  });

  it('справжнє видалення того, що екран бачив, і далі дає тумбстоун', async () => {
    await saveSynced<Med>('health_meds', [
      { id: 'a', name: 'Аспірин' },
      { id: 'b', name: 'Вітамін D' },
    ]);
    mockStore.set('sync_outbox', '[]');

    // користувач видалив b на екрані
    await saveSynced<Med>('health_meds', [{ id: 'a', name: 'Аспірин' }]);

    expect((await loadData<Med[]>('health_meds', [])).map(m => m.id)).toEqual(['a']);
    expect(outbox().filter(i => i.deleted).map(i => i.local_id)).toEqual(['b']);
  });

  it('ПЕРШИЙ запис у ключ (відновлення з копії, міграція) і далі заміщає масив цілком', async () => {
    // Жодного saveSynced по цьому ключу в цьому запуску ще не було, тож масив
    // викликача — повна правда: інакше «відновити з копії» лишало б чуже.
    mockStore.set('notes', JSON.stringify([{ id: 'стара', name: 'з пристрою' }]));

    await saveSynced<Med>('notes', [{ id: 'з-копії', name: 'бекап' }]);

    expect((await loadData<Med[]>('notes', [])).map(m => m.id)).toEqual(['з-копії']);
    expect(outbox().filter(i => i.deleted).map(i => i.local_id)).toEqual(['стара']);
  });
});

describe('DI-08: категорії відроджуються дефолтами', () => {
  it('порожній список типу підміняється фолбеком навіть коли інший тип має рядки', () => {
    const rows = [{ id: 'expense:Кафе', type: 'expense', name: 'Кафе', icon: 'cup' }];
    const fallback = {
      expense: [{ name: 'Їжа', icon: 'fork' }],
      income: [{ name: 'Зарплата', icon: 'wallet' }],
    };
    const map = categoryRowsToMap(rows as never, fallback);
    expect(map.expense.map(c => c.name)).toEqual(['Кафе']);
    expect(map.income.map(c => c.name)).toEqual(['Зарплата']); // видалене повернулось
  });
});

describe('DI-09: saveData(key, null) у singleton-ключ', () => {
  it('loadData віддає null замість fallback', async () => {
    await saveData('finance_primary_currency', null);
    expect(mockStore.get('finance_primary_currency')).toBe('null');
    await expect(loadData<string>('finance_primary_currency', 'UAH')).resolves.toBeNull();
  });
});

describe('DI-03: розбір id конфлікту по ":"', () => {
  it('губить хвіст похідного id категорії', () => {
    const id = 'categories:expense:Кафе';
    const [collection, local_id] = id.split(':');
    expect(collection).toBe('categories');
    expect(local_id).toBe('expense'); // а мало б бути 'expense:Кафе'
  });
});

describe('DI-04: ключ дня в календарі завдань', () => {
  it('на схід від UTC toISOString() дає ПОПЕРЕДНЮ добу', () => {
    const d = new Date(2026, 8, 20); // 20 вересня, локальна північ
    const localKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(localKey).toBe('2026-09-20');
    // getTimezoneOffset() < 0 — це UTC+X (Київ: -120/-180)
    if (d.getTimezoneOffset() < 0) {
      expect(d.toISOString().slice(0, 10)).toBe('2026-09-19');
    } else {
      expect(d.toISOString().slice(0, 10)).not.toBe('');
    }
  });
});
