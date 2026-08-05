/**
 * __tests__/migrations.test.ts — нормалізація фінансових singleton-блобів
 * (фаза 7 плану синхронізації).
 *
 * Ключова вимога: id мусить бути ПОХІДНИМ від природного ключа. Випадкові id
 * зламали б саму мету фази — два пристрої, що офлайн додали ту саму валюту,
 * згенерували б різні id і після синку отримали б дублікат замість злиття.
 *
 * Друга вимога: ідемпотентність. Міграції виконуються на кожному старті.
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
  balanceAdjustmentsToMap,
  balanceAdjustmentsToRows,
  runStorageMigrations,
} from '@/store/migrations';

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

beforeEach(() => {
  mockStore.clear();
});

describe('похідні id', () => {
  test('валюти отримують id з коду', async () => {
    seed('finance_currencies', [
      { code: 'USD', symbol: '$', kind: 'fiat', decimals: 2 },
      { code: 'BTC', symbol: '₿', kind: 'crypto', decimals: 8 },
    ]);

    await runStorageMigrations();

    expect(read<{ id: string; code: string }[]>('finance_currencies', [])).toEqual([
      { id: 'USD', code: 'USD', symbol: '$', kind: 'fiat', decimals: 2 },
      { id: 'BTC', code: 'BTC', symbol: '₿', kind: 'crypto', decimals: 8 },
    ]);
  });

  test('той самий код на різних пристроях дає той самий id — злиття, не дублікат', async () => {
    seed('finance_currencies', [{ code: 'PLN', symbol: 'zł' }]);
    await runStorageMigrations();
    const deviceA = read<{ id: string }[]>('finance_currencies', [])[0].id;

    mockStore.clear();
    seed('finance_currencies', [{ code: 'PLN', symbol: 'zł' }]);
    await runStorageMigrations();
    const deviceB = read<{ id: string }[]>('finance_currencies', [])[0].id;

    expect(deviceA).toBe(deviceB);
  });

  test('ліміти бюджету отримують id з назви категорії', async () => {
    seed('budget_limits', [{ category: 'Їжа', icon: 'cart', limit: 5000 }]);

    await runStorageMigrations();

    expect(read<{ id: string }[]>('budget_limits', [])[0].id).toBe('Їжа');
  });

  test('записи без придатного природного ключа відкидаються', async () => {
    seed('finance_currencies', [{ code: 'USD' }, { symbol: 'без коду' }]);

    await runStorageMigrations();

    expect(read<unknown[]>('finance_currencies', [])).toHaveLength(1);
  });
});

describe('finance_balance_adjustments: мапа → рядки', () => {
  test('перетворює на масив із кодом валюти як id', async () => {
    seed('finance_balance_adjustments', { UAH: 1500, USD: -20 });

    await runStorageMigrations();

    expect(read('finance_balance_adjustments', [])).toEqual([
      { id: 'UAH', amount: 1500 },
      { id: 'USD', amount: -20 },
    ]);
  });

  test('перетворення туди й назад зберігає значення', () => {
    const original = { UAH: 1500, USD: -20, BTC: 0.5 };
    expect(balanceAdjustmentsToMap(balanceAdjustmentsToRows(original))).toEqual(original);
  });

  test('зіпсовані рядки не потрапляють у мапу', () => {
    expect(
      balanceAdjustmentsToMap([
        { id: 'UAH', amount: 100 },
        { id: '', amount: 5 },
        { id: 'USD', amount: 'не число' as never },
      ]),
    ).toEqual({ UAH: 100 });
  });
});

describe('ідемпотентність', () => {
  test('повторний запуск нічого не змінює', async () => {
    seed('finance_currencies', [{ code: 'USD', symbol: '$' }]);
    seed('budget_limits', [{ category: 'Їжа', limit: 100 }]);
    seed('finance_balance_adjustments', { UAH: 50 });

    await runStorageMigrations();
    const snapshot = {
      currencies: read('finance_currencies', []),
      budgets: read('budget_limits', []),
      adjustments: read('finance_balance_adjustments', []),
    };

    const secondRun = await runStorageMigrations();

    expect(secondRun).toEqual([]);
    expect(read('finance_currencies', [])).toEqual(snapshot.currencies);
    expect(read('budget_limits', [])).toEqual(snapshot.budgets);
    expect(read('finance_balance_adjustments', [])).toEqual(snapshot.adjustments);
  });

  test('порожнє сховище — no-op', async () => {
    expect(await runStorageMigrations()).toEqual([]);
  });
});
