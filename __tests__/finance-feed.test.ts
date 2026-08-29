/**
 * __tests__/finance-feed.test.ts — стрічка фінансів мусить показувати ВСІ
 * актуальні операції.
 *
 * Скарга: «на екрані фінанси не отримуються всі актуальні операції». Причин
 * виявилось дві, і обидві стосуються операцій, що потрапили у сховище ПОВЗ
 * екран — синхронізацією з іншого пристрою, поповненням скарбнички,
 * відновленням бекапу:
 *
 *  1. Порядок. groupTransactions віддавала денні групи в порядку ПОЯВИ в
 *     масиві, а applyPullItems дописує прилетілі записи в КІНЕЦЬ. Сьогоднішня
 *     операція з іншого пристрою опинялася під усіма старішими днями — для
 *     користувача це «її немає».
 *
 *  2. Збереження. Екран писав `saveSynced('transactions', txs)` просто зі
 *     свого стану. Усе, що з'явилося у сховищі після завантаження, цей запис
 *     читав як «видалено» — і стирав локально, і ставив тумбстоун в outbox.
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

import { saveSynced } from '@/store/synced-storage';
import {
  groupTransactions,
  mergeTransactionsForSave,
  resolveAccountFilter,
  type Transaction,
} from '@/utils/financeUtils';

function tx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    category: 'catOther',
    amount: 100,
    note: '',
    date: '2026-08-10T12:00:00.000Z',
    accountId: 'acct-uah',
    ...over,
  };
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

beforeEach(() => {
  mockStore.clear();
});

describe('groupTransactions — порядок стрічки', () => {
  test('дні йдуть від найновішого, хоч би як лежав масив', () => {
    // Саме така форма масиву виходить після applyPullItems: локальні записи
    // спереду, прилетілий сьогоднішній — дописаний у кінець.
    const txs = [
      tx({ id: 'старий', date: '2026-08-01T09:00:00.000Z' }),
      tx({ id: 'середній', date: '2026-08-05T09:00:00.000Z' }),
      tx({ id: 'прилетів-сьогодні', date: '2026-08-10T09:00:00.000Z' }),
    ];

    const groups = groupTransactions(txs, '', '', 'uk-UA');

    expect(groups.map(g => g.items[0].id)).toEqual([
      'прилетів-сьогодні', 'середній', 'старий',
    ]);
  });

  test('усередині дня операції теж від найновішої', () => {
    // Без «Z» навмисно: рядок читається як місцевий час, тож усі три
    // лишаються одним днем у будь-якому часовому поясі тестового прогону.
    const txs = [
      tx({ id: 'ранок', date: '2026-08-10T08:00:00' }),
      tx({ id: 'вечір', date: '2026-08-10T21:00:00' }),
      tx({ id: 'обід', date: '2026-08-10T13:00:00' }),
    ];

    const [group] = groupTransactions(txs, '', '', 'uk-UA');

    expect(group.items.map(t => t.id)).toEqual(['вечір', 'обід', 'ранок']);
  });

  test('операція з битою датою лишається у стрічці, а не зникає мовчки', () => {
    const txs = [
      tx({ id: 'нормальна', date: '2026-08-10T12:00:00.000Z' }),
      tx({ id: 'бита', date: 'не-дата' }),
    ];

    const groups = groupTransactions(txs, '', '', 'uk-UA');

    expect(groups.flatMap(g => g.items.map(t => t.id)).sort())
      .toEqual(['бита', 'нормальна']);
  });
});

describe('mergeTransactionsForSave — запис зі стану екрана', () => {
  const own = tx({ id: 'своя' });
  const pulled = tx({ id: 'прилетіла' });

  test('операція, що з’явилась у сховищі після завантаження, лишається', () => {
    const merged = mergeTransactionsForSave([own, pulled], [own], new Set(['своя']));
    expect(merged.map(t => t.id)).toEqual(['своя', 'прилетіла']);
  });

  test('операція, яку користувач видалив, назад не воскресає', () => {
    // Обидві екран бачив — отже, відсутність у стані означає саме видалення.
    const merged = mergeTransactionsForSave(
      [own, pulled], [own], new Set(['своя', 'прилетіла']),
    );
    expect(merged.map(t => t.id)).toEqual(['своя']);
  });
});

describe('saveSynced зі стану екрана', () => {
  const own = tx({ id: 'своя' });
  const pulled = tx({ id: 'прилетіла' });

  test('без доливання прилетіла операція гине з тумбстоуном', async () => {
    mockStore.set('transactions', JSON.stringify([own, pulled]));

    await saveSynced('transactions', [own]);

    expect(read<Transaction[]>('transactions', []).map(t => t.id)).toEqual(['своя']);
    expect(read<{ local_id: string; deleted: boolean }[]>('sync_outbox', []))
      .toContainEqual(expect.objectContaining({ local_id: 'прилетіла', deleted: true }));
  });

  test('після доливання — і запис на місці, і тумбстоуна немає', async () => {
    mockStore.set('transactions', JSON.stringify([own, pulled]));

    const stored = read<Transaction[]>('transactions', []);
    await saveSynced('transactions', mergeTransactionsForSave(stored, [own], new Set(['своя'])));

    expect(read<Transaction[]>('transactions', []).map(t => t.id))
      .toEqual(['своя', 'прилетіла']);
    expect(read<{ deleted: boolean }[]>('sync_outbox', []).some(i => i.deleted)).toBe(false);
  });
});

describe('resolveAccountFilter — фільтр по рахунку, якого вже не видно', () => {
  test('обраний рахунок ще у стрічці — фільтр лишається', () => {
    expect(resolveAccountFilter('acct-uah', ['acct-uah', 'acct-usd'])).toBe('acct-uah');
  });

  test('рахунок зник зі стрічки (архівували на іншому пристрої) — фільтр знімається', () => {
    // Інакше стрічка й далі показує операції одного рахунку, але жодна картка
    // не підсвічена: для користувача це «фінанси загубили операції».
    expect(resolveAccountFilter('acct-usd', ['acct-uah'])).toBeNull();
  });

  test('фільтра немає — нічого й не вигадуємо', () => {
    expect(resolveAccountFilter(null, ['acct-uah'])).toBeNull();
  });
});
