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
  getAllKeys: jest.fn(async () => []),
  multiRemove: jest.fn(async () => {}),
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

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ActiveTimer } from '@/utils/activeTimers';
import type { Account } from '@/utils/accounts';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import {
  balanceAdjustmentsToMap,
  balanceAdjustmentsToRows,
  buildAccountsFromLegacyFinance,
  categoryMapToRows,
  categoryRowsToMap,
  currencyAccountId,
  jarAccountId,
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

describe('categories: вкладений Record → пласкі рядки', () => {
  const DEFAULTS = {
    expense: [{ name: 'Їжа', icon: 'cart' }],
    income: [{ name: 'Зарплата', icon: 'banknote' }],
  };

  test('міграція розкладає мапу в рядки з похідними id', async () => {
    seed('categories', {
      expense: [{ name: 'Кава', icon: 'cup' }],
      income: [{ name: 'Фріланс', icon: 'laptop' }],
    });

    await runStorageMigrations();

    // Наступний крок (categories:group_cost, finance-revamp.md §4.5.2) дописує
    // групу й ознаку — форма рядка й id від цього не змінюються.
    expect(read('categories', [])).toEqual([
      expect.objectContaining({ id: 'expense:Кава', type: 'expense', name: 'Кава', icon: 'cup', group: 'other', cost: 'variable' }),
      expect.objectContaining({ id: 'income:Фріланс', type: 'income', name: 'Фріланс', icon: 'laptop', group: 'business' }),
    ]);
  });

  test('та сама категорія на різних пристроях дає той самий id', () => {
    const a = categoryMapToRows({ expense: [{ name: 'Кава', icon: 'cup' }] });
    const b = categoryMapToRows({ expense: [{ name: 'Кава', icon: 'mug' }] });
    expect(a[0].id).toBe(b[0].id);
  });

  test('однакова назва в різних типах — різні записи', () => {
    const rows = categoryMapToRows({
      expense: [{ name: 'Інше', icon: 'a' }],
      income: [{ name: 'Інше', icon: 'b' }],
    });
    expect(new Set(rows.map(r => r.id)).size).toBe(2);
  });

  test('перетворення туди й назад зберігає склад', () => {
    const original = {
      expense: [{ name: 'Кава', icon: 'cup' }, { name: 'Таксі', icon: 'car' }],
      income: [{ name: 'Фріланс', icon: 'laptop' }],
    };
    expect(categoryRowsToMap(categoryMapToRows(original), DEFAULTS)).toEqual(original);
  });

  test('тип без збережених рядків повертає дефолти, а не порожній список', () => {
    const rows = categoryMapToRows({ expense: [{ name: 'Кава', icon: 'cup' }] });
    const restored = categoryRowsToMap(rows, DEFAULTS);
    expect(restored.expense).toEqual([{ name: 'Кава', icon: 'cup' }]);
    expect(restored.income).toEqual(DEFAULTS.income);
  });

  test('порожнє сховище повертає повний набір дефолтів', () => {
    expect(categoryRowsToMap([], DEFAULTS)).toEqual(DEFAULTS);
  });

  test('записи без назви відкидаються', () => {
    const rows = categoryMapToRows({
      expense: [{ name: 'Кава', icon: 'cup' }, { name: '', icon: 'x' }],
    });
    expect(rows).toHaveLength(1);
  });
});

describe('ідемпотентність', () => {
  test('повторний запуск нічого не змінює', async () => {
    seed('finance_currencies', [{ code: 'USD', symbol: '$' }]);
    seed('budget_limits', [{ category: 'Їжа', limit: 100 }]);
    seed('finance_balance_adjustments', { UAH: 50 });
    seed('categories', { expense: [{ name: 'Кава', icon: 'cup' }] });

    await runStorageMigrations();
    const snapshot = {
      currencies: read('finance_currencies', []),
      budgets: read('budget_limits', []),
      adjustments: read('finance_balance_adjustments', []),
      categories: read('categories', []),
    };

    const secondRun = await runStorageMigrations();

    expect(secondRun).toEqual([]);
    expect(read('finance_currencies', [])).toEqual(snapshot.currencies);
    expect(read('budget_limits', [])).toEqual(snapshot.budgets);
    expect(read('finance_balance_adjustments', [])).toEqual(snapshot.adjustments);
    // Найризикованіша: Record → масив. Повторний запуск на вже пласкому масиві
    // не має розкласти його вдруге чи знищити.
    expect(read('categories', [])).toEqual(snapshot.categories);
  });

  test('порожнє сховище — no-op', async () => {
    expect(await runStorageMigrations()).toEqual([]);
  });
});

describe('відкриті сесії таймера', () => {
  const open = { id: 'e1', startedAt: '2026-08-29T20:00:00.000Z', duration: 0 };

  test('переносяться у active_timers і зникають із завдання', async () => {
    seed('tasks', [{ id: 't-1', title: 'Звіт', timeEntries: [open] }]);

    await runStorageMigrations();

    expect(read<ActiveTimer[]>('active_timers', [])).toEqual([
      expect.objectContaining({ id: 'task:t-1', taskId: 't-1', label: 'Звіт', startedAt: open.startedAt }),
    ]);
    expect(read<{ timeEntries: unknown[] }[]>('tasks', [])[0].timeEntries).toEqual([]);
  });

  test('повторний запуск нічого не дублює', async () => {
    seed('tasks', [{ id: 't-1', title: 'Звіт', timeEntries: [open] }]);

    await runStorageMigrations();
    const afterFirst = read<ActiveTimer[]>('active_timers', []);
    const done = await runStorageMigrations();

    expect(done).not.toContain('active_timers:from_open_entries');
    expect(read<ActiveTimer[]>('active_timers', [])).toEqual(afterFirst);
  });
});

// ─── Рахунки з валют транзакцій ───────────────────────────────────────────────

describe('buildAccountsFromLegacyFinance', () => {
  const base = {
    transactions: [] as Record<string, unknown>[],
    jars: [] as Record<string, unknown>[],
    adjustments: {} as Record<string, number>,
    primaryCurrency: 'UAH',
    now: '2026-08-29T00:00:00.000Z',
  };

  test('порожні дані — жодного рахунку', () => {
    const result = buildAccountsFromLegacyFinance(base);
    expect(result.accounts).toEqual([]);
    expect(result.transactionsChanged).toBe(false);
  });

  test('валюта з самою лише ручною поправкою теж отримує рахунок', () => {
    // Ці гроші існують — користувач сам їх записав. Без рахунку вони зникли б
    // із застосунку: поправки після міграції ніхто більше не читає.
    const { accounts } = buildAccountsFromLegacyFinance({
      ...base,
      adjustments: { USD: 300 },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ id: 'acct-usd', currency: 'USD', openingBalance: 300 });
  });

  test('нульова поправка рахунку не породжує', () => {
    // Нуль — це «нічого не коригували», а не «є рахунок із порожнім балансом».
    const { accounts } = buildAccountsFromLegacyFinance({ ...base, adjustments: { EUR: 0 } });
    expect(accounts).toEqual([]);
  });

  test('поправка й операції в одній валюті дають ОДИН рахунок', () => {
    const { accounts } = buildAccountsFromLegacyFinance({
      ...base,
      transactions: [{ id: '1', currency: 'USD', amount: 50, type: 'expense' }],
      adjustments: { USD: 300 },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0].openingBalance).toBe(300);
  });

  test('на непорожньому списку рахунків поправка рахунку не воскрешає', () => {
    // Те саме правило, що й для скарбничок: відсутність рахунку на цьому етапі
    // означає, що його свідомо позбулися.
    const { accounts } = buildAccountsFromLegacyFinance({
      ...base,
      existing: [{
        id: 'my-card', name: 'Картка', kind: 'card', currency: 'UAH',
        openingBalance: 0, createdAt: base.now,
      }],
      adjustments: { USD: 300 },
    });
    expect(accounts.map(a => a.id)).toEqual(['my-card']);
  });

  test('одна валюта — один рахунок без коду в назві', () => {
    const { accounts, transactions } = buildAccountsFromLegacyFinance({
      ...base,
      transactions: [
        { id: '1', currency: 'UAH', amount: 100 },
        { id: '2', amount: 50 }, // без currency — теж гривня
      ],
    });
    expect(accounts).toEqual([
      expect.objectContaining({
        id: 'acct-uah', name: 'Основний', kind: 'cash', currency: 'UAH', openingBalance: 0,
      }),
    ]);
    expect(transactions.map(t => t.accountId)).toEqual(['acct-uah', 'acct-uah']);
  });

  test('кілька валют — рахунок на кожну, код у назві', () => {
    const { accounts, transactions } = buildAccountsFromLegacyFinance({
      ...base,
      transactions: [
        { id: '1', currency: 'UAH' },
        { id: '2', currency: 'USD' },
        { id: '3', currency: 'USD' },
        { id: '4', currency: 'BTC' },
      ],
    });
    expect(accounts.map(a => [a.id, a.name, a.currency])).toEqual([
      ['acct-uah', 'Основний UAH', 'UAH'],
      ['acct-usd', 'Основний USD', 'USD'],
      ['acct-btc', 'Основний BTC', 'BTC'],
    ]);
    expect(transactions.map(t => t.accountId)).toEqual([
      'acct-uah', 'acct-usd', 'acct-usd', 'acct-btc',
    ]);
  });

  test('ручна поправка балансу стає початковим залишком', () => {
    const { accounts } = buildAccountsFromLegacyFinance({
      ...base,
      transactions: [{ id: '1', currency: 'UAH' }, { id: '2', currency: 'USD' }],
      adjustments: { UAH: 12000, EUR: 999 },
    });
    expect(accounts.find(a => a.id === 'acct-uah')?.openingBalance).toBe(12000);
    // USD поправки не мав — нуль, а не undefined.
    expect(accounts.find(a => a.id === 'acct-usd')?.openingBalance).toBe(0);
    // Валюта без жодної транзакції рахунок ОТРИМУЄ: поправка — це теж гроші,
    // і без рахунку вони зникли б разом із самим ключем поправок.
    expect(accounts.find(a => a.currency === 'EUR')?.openingBalance).toBe(999);
  });

  test('скарбнички стають рахунками kind=savings в основній валюті', () => {
    const { accounts } = buildAccountsFromLegacyFinance({
      ...base,
      primaryCurrency: 'USD',
      jars: [
        { id: 'j1', name: 'Відпустка', goal: 50000, saved: 12000, icon: 'airplane', color: '#0EA5E9' },
        { id: 'j2', name: 'Подушка', goal: 0, saved: 0 },
      ],
    });
    expect(accounts).toEqual([
      expect.objectContaining({
        id: jarAccountId('j1'), name: 'Відпустка', kind: 'savings', currency: 'USD',
        openingBalance: 12000, goal: 50000, icon: 'airplane', color: '#0EA5E9',
      }),
      expect.objectContaining({
        id: jarAccountId('j2'), name: 'Подушка', kind: 'savings', openingBalance: 0,
      }),
    ]);
    // Ціль 0 — це «цілі немає», а не ціль нуль.
    expect(accounts[1].goal).toBeUndefined();
  });

  test('вже проставлений accountId не перезаписується', () => {
    const { transactions, transactionsChanged } = buildAccountsFromLegacyFinance({
      ...base,
      transactions: [{ id: '1', currency: 'UAH', accountId: 'acct-jar-j1' }],
    });
    expect(transactions[0].accountId).toBe('acct-jar-j1');
    expect(transactionsChanged).toBe(false);
  });

  test('id рахунку похідний від коду валюти — двоє пристроїв зійдуться', () => {
    expect(currencyAccountId('USD')).toBe('acct-usd');
    expect(currencyAccountId('uah')).toBe(currencyAccountId('UAH'));
  });
});

describe('міграція рахунків у сховищі', () => {
  test('заводить рахунки й розставляє accountId транзакціям', async () => {
    seed('transactions', [
      { id: '1', currency: 'UAH', type: 'expense', amount: 100 },
      { id: '2', currency: 'USD', type: 'income', amount: 20 },
    ]);
    seed('finance_balance_adjustments', { UAH: 500 });
    seed('savings_jars', [{ id: 'j1', name: 'Відпустка', goal: 1000, saved: 300 }]);

    const done = await runStorageMigrations();

    expect(done).toContain('accounts:from_currencies');
    const accounts = read<Account[]>('accounts', []);
    expect(accounts.map(a => a.id)).toEqual(['acct-uah', 'acct-usd', jarAccountId('j1')]);
    // Поправку читаємо вже після нормалізації в рядки — форма не має значення.
    expect(accounts[0].openingBalance).toBe(500);
    expect(read<{ accountId: string }[]>('transactions', []).map(t => t.accountId))
      .toEqual(['acct-uah', 'acct-usd']);
    // Скарбнички лишаються на місці: старі збірки досі в них пишуть.
    expect(read<unknown[]>('savings_jars', [])).toHaveLength(1);
    expect(read<unknown[]>('finance_balance_adjustments', [])).toHaveLength(1);
  });

  test('повторний запуск нічого не змінює', async () => {
    seed('transactions', [{ id: '1', currency: 'UAH', amount: 10 }]);

    await runStorageMigrations();
    const first = read<Account[]>('accounts', []);
    const second = await runStorageMigrations();

    expect(second).not.toContain('accounts:from_currencies');
    expect(read<Account[]>('accounts', [])).toEqual(first);
  });

  test('легасі-операції, залиті ПІСЛЯ появи рахунків, теж отримують рахунок', async () => {
    // Сценарій: користувач завів свою «Картку», а потім через «Дані →
    // Завантажити» залив старий експорт. Ті операції прийшли без accountId і
    // без ремонту назавжди лишилися б поза балансом будь-якого рахунку —
    // при тому що в оборот місяця вони входять.
    seed('accounts', [
      { id: 'acct-mine', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 0,
        createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    seed('transactions', [
      { id: '1', currency: 'UAH', type: 'expense', amount: 40000 },
      { id: '2', currency: 'UAH', type: 'expense', amount: 100, accountId: 'acct-mine' },
    ]);

    const done = await runStorageMigrations();

    expect(done).toContain('accounts:from_currencies');
    // Рахунок користувача лишається при своєму: 40 000 не осідають на ньому
    // мовчки, а їдуть на окремий легасі-рахунок.
    const accounts = read<Account[]>('accounts', []);
    expect(accounts.map(a => a.id)).toEqual(['acct-mine', 'acct-uah']);
    expect(accounts[0]).toMatchObject({ name: 'Картка', openingBalance: 0 });
    expect(read<{ accountId: string }[]>('transactions', []).map(t => t.accountId))
      .toEqual(['acct-uah', 'acct-mine']);
  });

  test('операція з рахунком не перевішується, навіть коли рахунків уже повно', async () => {
    seed('accounts', [
      { id: 'acct-mine', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 0,
        createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    seed('transactions', [{ id: '1', currency: 'UAH', amount: 10, accountId: 'acct-mine' }]);

    const done = await runStorageMigrations();

    expect(done).not.toContain('accounts:from_currencies');
    expect(read<Account[]>('accounts', [])).toHaveLength(1);
  });

  test('скарбнички не воскресають, коли рахунки вже є', async () => {
    seed('accounts', [
      { id: 'acct-mine', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 0,
        createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    seed('savings_jars', [{ id: 'j1', name: 'Відпустка', goal: 1000, saved: 300 }]);

    await runStorageMigrations();

    expect(read<Account[]>('accounts', []).map(a => a.id)).toEqual(['acct-mine']);
  });

  test('рахунки й проставлені accountId стають у чергу на відправку', async () => {
    // Без outbox запис лишався б лише на цьому пристрої: повний перезалив
    // робиться тільки при нульовому курсорі, тож для вже синхронізованого
    // телефона нові рахунки не поїхали б на сервер НІКОЛИ.
    seed('transactions', [{ id: '1', currency: 'UAH', type: 'expense', amount: 100 }]);
    seed('savings_jars', [{ id: 'j1', name: 'Відпустка', goal: 1000, saved: 300 }]);

    await runStorageMigrations();

    const outbox = read<{ collection: string; local_id: string; deleted: boolean }[]>(
      'sync_outbox', [],
    );
    expect(outbox.filter(i => i.collection === 'accounts').map(i => i.local_id).sort())
      .toEqual(['acct-jar-j1', 'acct-uah']);
    expect(outbox.filter(i => i.collection === 'transactions'))
      .toEqual([expect.objectContaining({ local_id: '1', deleted: false })]);
    // Жодних тумбстоунів: міграція нічого не видаляє.
    expect(outbox.some(i => i.deleted)).toBe(false);
  });

  test('порожні фінанси — міграція не пише порожній масив рахунків', async () => {
    expect(await runStorageMigrations()).toEqual([]);
    expect(read<Account[] | null>('accounts', null)).toBeNull();
  });
});

describe('«Спільне» прибрано (§4 плану, §6.3 контракту)', () => {
  beforeEach(() => {
    (AsyncStorage.getAllKeys as jest.Mock).mockReset().mockResolvedValue([]);
    (AsyncStorage.multiRemove as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  test('прибирає точні й динамічні ключі «Спільне», лишає решту', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue([
      'shared_device_id', 'shared_groups_list', 'shared_group', 'shared_section_counts',
      'shared_items_abc', 'shared_items_def', 'tasks', 'workspace_config',
    ]);

    const done = await runStorageMigrations();

    expect(done).toContain('shared:removed');
    expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
      'shared_device_id', 'shared_groups_list', 'shared_group', 'shared_section_counts',
      'shared_items_abc', 'shared_items_def',
    ]);
  });

  test('нема ключів «Спільне» — no-op, multiRemove не викликається', async () => {
    (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValue(['tasks', 'workspace_config']);

    const done = await runStorageMigrations();

    expect(done).not.toContain('shared:removed');
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
  });
});

describe('явний `type` в особистих статусах (§3.3 контракту, мінор з ревʼю)', () => {
  test('дописує похідний type особистій колонці, якій його бракує', async () => {
    seed('task_statuses', [
      // Особиста, без type — легасі-запис до появи поля.
      { id: 'status-active', name: 'До роботи', color: '#6366F1', position: 0, isDone: false },
      // Проєктна — не чіпаємо, навіть якщо теж без type (мали б отримати його
      // ще при seedProjectStatusColumns; захист про всяк випадок тут нижче).
      { id: 'st-1', name: 'Проєктна', color: '#000', position: 0, isDone: false, projectId: 'p1' },
      // Уже з явним type — не чіпаємо.
      { id: 'status-done', name: 'Готово', color: '#10B981', position: 1, isDone: true, type: 'done' },
    ]);

    const done = await runStorageMigrations();

    expect(done).toContain('task_statuses:explicit_type');
    const byId = new Map(read<TaskStatusColumn[]>('task_statuses', []).map(c => [c.id, c]));
    expect(byId.get('status-active')?.type).toBe('todo');
    expect(byId.get('st-1')?.type).toBeUndefined(); // проєктна — не наша турбота тут
    expect(byId.get('status-done')?.type).toBe('done');
  });

  test('надсилає дописаний type в outbox — зміну бачать і інші пристрої', async () => {
    seed('task_statuses', [
      { id: 'status-in-progress', name: 'У процесі', color: '#F59E0B', position: 1, isDone: false },
    ]);

    await runStorageMigrations();

    const outbox = read<{ collection: string; local_id: string }[]>('sync_outbox', []);
    expect(outbox.some(i => i.collection === 'task_statuses' && i.local_id === 'status-in-progress')).toBe(true);
  });

  test('усі колонки вже з явним type — no-op, ідемпотентно', async () => {
    seed('task_statuses', [
      { id: 'status-active', name: 'До роботи', color: '#6366F1', position: 0, isDone: false, type: 'todo' },
    ]);

    expect(await runStorageMigrations()).not.toContain('task_statuses:explicit_type');
    // Другий прохід так само no-op.
    expect(await runStorageMigrations()).not.toContain('task_statuses:explicit_type');
  });

  test('порожній/відсутній task_statuses — no-op', async () => {
    expect(await runStorageMigrations()).not.toContain('task_statuses:explicit_type');
  });
});

describe('бекфіл `createdBy` для проєктних задач без автора (major з ревʼю §3.7)', () => {
  test('дописує createdBy=я лише задачам МОГО (owner) проєкту', async () => {
    seed('auth_user', { id: 'u1', email: 'a@b.c', name: 'A' });
    seed('workspace_projects', [
      { id: 'p-own', role: 'owner' },
      { id: 'p-member', role: 'member' },
    ]);
    seed('tasks', [
      // Соло-проєкт до появи createdBy (моя роль — owner) — отримує автора.
      { id: 't1', title: 'моя стара', projectId: 'p-own' },
      // Уже з автором — не чіпаємо.
      { id: 't2', title: 'вже підписана', projectId: 'p-own', createdBy: 'u2' },
      // Особиста (без projectId) — не наша турбота тут.
      { id: 't3', title: 'особиста' },
      // Проєкт, де я лише member — чужа задача без автора лишається як є.
      { id: 't4', title: 'чужа команди', projectId: 'p-member' },
    ]);

    const done = await runStorageMigrations();

    expect(done).toContain('tasks:createdBy_backfill');
    const byId = new Map(read<{ id: string; createdBy?: string }[]>('tasks', []).map(t => [t.id, t]));
    expect(byId.get('t1')?.createdBy).toBe('u1');
    expect(byId.get('t2')?.createdBy).toBe('u2');
    expect(byId.get('t3')?.createdBy).toBeUndefined();
    expect(byId.get('t4')?.createdBy).toBeUndefined();
  });

  test('project_sync_state_v1 перекриває устарілий кеш workspace_projects', async () => {
    seed('auth_user', { id: 'u1' });
    // Кеш GET /projects/ ще каже 'member', але свіжіший стан синку
    // проєкту вже знає про підвищення до owner.
    seed('workspace_projects', [{ id: 'p1', role: 'member' }]);
    seed('project_sync_state_v1', { p1: { role: 'owner' } });
    seed('tasks', [{ id: 't1', title: 'x', projectId: 'p1' }]);

    await runStorageMigrations();

    expect(read<{ id: string; createdBy?: string }[]>('tasks', []).find(t => t.id === 't1')?.createdBy).toBe('u1');
  });

  test('невідомий проєкт (жодної ролі ще не кешовано) — фолбек owner, як і скрізь у клієнті', async () => {
    seed('auth_user', { id: 'u1' });
    seed('tasks', [{ id: 't1', title: 'соло-проєкт до першого GET /projects/', projectId: 'p-brand-new' }]);

    await runStorageMigrations();

    expect(read<{ id: string; createdBy?: string }[]>('tasks', []).find(t => t.id === 't1')?.createdBy).toBe('u1');
  });

  test('без сесії (auth_user відсутній) — no-op, повторить спробу наступного старту', async () => {
    seed('tasks', [{ id: 't1', title: 'x', projectId: 'p1' }]);

    expect(await runStorageMigrations()).not.toContain('tasks:createdBy_backfill');
    expect(read<{ id: string; createdBy?: string }[]>('tasks', []).find(t => t.id === 't1')?.createdBy).toBeUndefined();
  });

  test('немає задач без createdBy — no-op, ідемпотентно', async () => {
    seed('auth_user', { id: 'u1' });
    seed('workspace_projects', [{ id: 'p1', role: 'owner' }]);
    seed('tasks', [{ id: 't1', title: 'x', projectId: 'p1', createdBy: 'u1' }]);

    expect(await runStorageMigrations()).not.toContain('tasks:createdBy_backfill');
    expect(await runStorageMigrations()).not.toContain('tasks:createdBy_backfill');
  });
});
