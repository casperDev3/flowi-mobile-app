/**
 * __tests__/accounts.test.ts — рахунок і переказ як один запис.
 *
 * Головне, що тут перевіряється: гроші не зникають і не подвоюються. Переказ
 * списує з одного рахунку рівно те, що зараховує на інший (з поправкою на
 * курс), а сам по собі оборотом не є — це перевіряє finance-transfers.test.ts.
 */

import {
  accountBalance,
  accountById,
  accountIdForLegacyTx,
  accountsByCurrency,
  activeAccounts,
  creditedAmount,
  defaultAccountId,
  isTransfer,
  markTransferTargets,
  mergeAccountsForSave,
  resolveTxCurrency,
  transferRate,
  type Account,
} from '@/utils/accounts';
import type { Transaction } from '@/utils/financeUtils';

function account(over: Partial<Account> & { id: string }): Account {
  return {
    name: over.id,
    kind: 'cash',
    currency: 'UAH',
    openingBalance: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function tx(over: Partial<Transaction> & { id: string; accountId: string }): Transaction {
  return {
    type: 'expense',
    category: 'catOther',
    amount: 0,
    note: '',
    date: '2026-08-10T12:00:00.000Z',
    ...over,
  };
}

const uah = account({ id: 'acct-uah', currency: 'UAH', openingBalance: 1000 });
const usd = account({ id: 'acct-usd', currency: 'USD', openingBalance: 100 });

describe('isTransfer', () => {
  test('переказ із адресатом звужується', () => {
    const t = tx({ id: '1', accountId: 'acct-uah', type: 'transfer', toAccountId: 'acct-usd' });
    expect(isTransfer(t)).toBe(true);
    if (isTransfer(t)) expect(t.toAccountId).toBe('acct-usd');
  });

  test('дохід і витрата — не перекази', () => {
    expect(isTransfer(tx({ id: '2', accountId: 'acct-uah', type: 'income' }))).toBe(false);
    expect(isTransfer(tx({ id: '3', accountId: 'acct-uah' }))).toBe(false);
  });

  test('type=transfer без адресата — зламані дані, не переказ', () => {
    expect(isTransfer(tx({ id: '4', accountId: 'acct-uah', type: 'transfer' }))).toBe(false);
    expect(
      isTransfer(tx({ id: '5', accountId: 'acct-uah', type: 'transfer', toAccountId: '' })),
    ).toBe(false);
  });
});

describe('creditedAmount', () => {
  test('без toAmount зараховується та сама сума', () => {
    const t = tx({ id: '1', accountId: 'a', type: 'transfer', toAccountId: 'b', amount: 500 });
    expect(isTransfer(t) && creditedAmount(t)).toBe(500);
  });

  test('toAmount перекриває суму списання', () => {
    const t = tx({
      id: '1', accountId: 'a', type: 'transfer', toAccountId: 'b',
      amount: 100, toAmount: 4100,
    });
    expect(isTransfer(t) && creditedAmount(t)).toBe(4100);
  });
});

describe('accountBalance', () => {
  test('порожній список — лише початковий залишок', () => {
    expect(accountBalance(uah, [])).toBe(1000);
  });

  test('доходи додаються, витрати віднімаються, чужі операції ігноруються', () => {
    const txs: Transaction[] = [
      tx({ id: '1', accountId: 'acct-uah', type: 'income', amount: 5000 }),
      tx({ id: '2', accountId: 'acct-uah', type: 'expense', amount: 1200 }),
      tx({ id: '3', accountId: 'acct-usd', type: 'expense', amount: 50 }),
    ];
    expect(accountBalance(uah, txs)).toBe(1000 + 5000 - 1200);
    expect(accountBalance(usd, txs)).toBe(100 - 50);
  });

  test('переказ у межах однієї валюти: скільки списано, стільки й зараховано', () => {
    const card = account({ id: 'acct-card', kind: 'card', openingBalance: 3000 });
    const cash = account({ id: 'acct-cash', openingBalance: 200 });
    const txs: Transaction[] = [
      tx({
        id: 't1', accountId: 'acct-card', type: 'transfer',
        toAccountId: 'acct-cash', amount: 500,
      }),
    ];
    expect(accountBalance(card, txs)).toBe(2500);
    expect(accountBalance(cash, txs)).toBe(700);
    // Сума грошей на руках не змінилася — це й є ознака переказу.
    expect(accountBalance(card, txs) + accountBalance(cash, txs)).toBe(3200);
  });

  test('переказ між валютами: списано 100 USD, зараховано 4100 UAH', () => {
    const txs: Transaction[] = [
      tx({
        id: 't1', accountId: 'acct-usd', type: 'transfer', toAccountId: 'acct-uah',
        amount: 100, toAmount: 4100,
      }),
    ];
    expect(accountBalance(usd, txs)).toBe(0);
    expect(accountBalance(uah, txs)).toBe(5100);
  });

  test('переказ сам на себе не ламає баланс', () => {
    const txs: Transaction[] = [
      tx({
        id: 't1', accountId: 'acct-uah', type: 'transfer',
        toAccountId: 'acct-uah', amount: 700,
      }),
    ];
    expect(accountBalance(uah, txs)).toBe(1000);
  });

  test('переказ із адресатом, якого вже нема, лише списує', () => {
    const txs: Transaction[] = [
      tx({
        id: 't1', accountId: 'acct-uah', type: 'transfer',
        toAccountId: 'acct-deleted', amount: 300,
      }),
    ];
    expect(accountBalance(uah, txs)).toBe(700);
  });

  test('архівований рахунок і далі має баланс — операції нікуди не поділися', () => {
    const closed = account({ id: 'acct-old', openingBalance: 50, archived: true });
    const txs: Transaction[] = [tx({ id: '1', accountId: 'acct-old', type: 'income', amount: 25 })];
    expect(accountBalance(closed, txs)).toBe(75);
  });

  test('дробові суми не накопичують похибку float', () => {
    const zero = account({ id: 'acct-btc', currency: 'BTC', openingBalance: 0 });
    const txs: Transaction[] = [
      tx({ id: '1', accountId: 'acct-btc', type: 'income', amount: 1.1 }),
      tx({ id: '2', accountId: 'acct-btc', type: 'income', amount: 2.2 }),
    ];
    expect(accountBalance(zero, txs)).toBe(3.3);
  });
});

describe('transferRate', () => {
  test('різні валюти — курс', () => {
    const t = tx({
      id: '1', accountId: 'acct-usd', type: 'transfer', toAccountId: 'acct-uah',
      amount: 100, toAmount: 4100,
    });
    expect(transferRate(t)).toBe(41);
  });

  test('однакова валюта — null, бо курс 1 нічого не каже', () => {
    expect(
      transferRate(tx({
        id: '1', accountId: 'a', type: 'transfer', toAccountId: 'b', amount: 500,
      })),
    ).toBeNull();
    expect(
      transferRate(tx({
        id: '2', accountId: 'a', type: 'transfer', toAccountId: 'b',
        amount: 500, toAmount: 500,
      })),
    ).toBeNull();
  });

  test('не переказ або нульове списання — null', () => {
    expect(transferRate(tx({ id: '1', accountId: 'a', type: 'expense', amount: 10 }))).toBeNull();
    expect(
      transferRate(tx({
        id: '2', accountId: 'a', type: 'transfer', toAccountId: 'b',
        amount: 0, toAmount: 100,
      })),
    ).toBeNull();
  });
});

describe('списки рахунків', () => {
  const list = [
    uah,
    account({ id: 'acct-old', archived: true }),
    usd,
    account({ id: 'acct-jar', kind: 'savings', goal: 50000 }),
  ];

  test('activeAccounts прибирає архівні', () => {
    expect(activeAccounts(list).map(a => a.id)).toEqual(['acct-uah', 'acct-usd', 'acct-jar']);
    expect(activeAccounts([])).toEqual([]);
  });

  test('accountsByCurrency групує, архівні лишає екрану', () => {
    const byCur = accountsByCurrency(list);
    expect(Object.keys(byCur).sort()).toEqual(['UAH', 'USD']);
    expect(byCur.UAH.map(a => a.id)).toEqual(['acct-uah', 'acct-old', 'acct-jar']);
    expect(accountsByCurrency([])).toEqual({});
  });

  test('accountById знаходить і не падає на порожньому id', () => {
    expect(accountById(list, 'acct-usd')?.currency).toBe('USD');
    expect(accountById(list, undefined)).toBeUndefined();
    expect(accountById([], 'acct-uah')).toBeUndefined();
  });
});

describe('resolveTxCurrency', () => {
  test('валюта береться з рахунку', () => {
    const t = tx({ id: '1', accountId: 'acct-usd', currency: 'UAH', amount: 10 });
    expect(resolveTxCurrency(t, [uah, usd])).toBe('USD');
  });

  test('старий запис без рахунку падає назад на власне поле', () => {
    const legacy = { ...tx({ id: '1', accountId: '', amount: 10 }), currency: 'EUR' };
    expect(resolveTxCurrency(legacy, [uah, usd])).toBe('EUR');
  });

  test('ні рахунку, ні валюти — гривня', () => {
    expect(resolveTxCurrency(tx({ id: '1', accountId: '', amount: 10 }), [])).toBe('UAH');
  });
});

describe('defaultAccountId', () => {
  const cash = account({ id: 'acct-cash' });
  const card = account({ id: 'acct-card', kind: 'card' });
  const jar = account({ id: 'acct-jar', kind: 'savings' });

  test('порожній список — null', () => {
    expect(defaultAccountId([])).toBeNull();
    expect(defaultAccountId([account({ id: 'acct-old', archived: true })])).toBeNull();
  });

  test('останній використаний виграє', () => {
    expect(defaultAccountId([cash, card], 'acct-card')).toBe('acct-card');
  });

  test('архівований останній використаний ігнорується', () => {
    const closed = account({ id: 'acct-old', archived: true });
    expect(defaultAccountId([closed, cash], 'acct-old')).toBe('acct-cash');
  });

  test('заощадження не підставляються, поки є платіжний рахунок', () => {
    expect(defaultAccountId([jar, card])).toBe('acct-card');
  });

  test('якщо є лише заощадження — беремо його', () => {
    expect(defaultAccountId([jar])).toBe('acct-jar');
  });
});

describe('markTransferTargets — «позначити як переказ»', () => {
  const cash = account({ id: 'acct-cash', currency: 'UAH' });
  const card = account({ id: 'acct-card', currency: 'UAH', kind: 'card' });
  const dollars = account({ id: 'acct-usd', currency: 'USD' });
  const closed = account({ id: 'acct-old', currency: 'UAH', archived: true });
  const all = [cash, card, dollars, closed];

  test('рахунок іншої валюти не пропонується', () => {
    const spend = tx({ id: '1', accountId: 'acct-usd', amount: 100, currency: 'USD' });
    expect(markTransferTargets(all, spend).map(a => a.id)).toEqual([]);
  });

  test('гроші не беруться з повітря: зарахувати можна лише те саме число в тій самій валюті', () => {
    // Без обмеження за валютою витрата 100 USD, позначена переказом на
    // гривневу картку, додала б їй 100 UAH — creditedAmount за відсутності
    // toAmount повертає списану суму, а transferRate для рівних сум мовчить.
    const spend = tx({ id: '1', accountId: 'acct-usd', amount: 100, currency: 'USD' });
    for (const target of markTransferTargets(all, spend)) {
      expect(target.currency).toBe('USD');
    }
    const marked = { ...spend, type: 'transfer' as const, toAccountId: 'acct-card' };
    // Саме цього стану обмеження й не допускає — інакше баланс картки росте.
    expect(accountBalance(card, [marked])).toBe(100);
  });

  test('своя валюта — усі активні, крім самого джерела', () => {
    const spend = tx({ id: '1', accountId: 'acct-cash', amount: 500, currency: 'UAH' });
    expect(markTransferTargets(all, spend).map(a => a.id)).toEqual(['acct-card']);
  });

  test('операція без рахунку судиться за власним полем currency', () => {
    const legacy = { ...tx({ id: '1', accountId: '', amount: 20 }), currency: 'USD' };
    expect(markTransferTargets(all, legacy).map(a => a.id)).toEqual(['acct-usd']);
  });
});

describe('accountIdForLegacyTx — правка операції без рахунку', () => {
  const wallet = account({ id: 'acct-uah-wallet', currency: 'UAH' });
  const jar = account({ id: 'acct-usd-jar', currency: 'USD', kind: 'savings' });
  const dollars = account({ id: 'acct-usd', currency: 'USD' });

  test('валюта запису не міняється на валюту типового гаманця', () => {
    // Форма зберігає currency рахунку: підставивши гривневий гаманець,
    // правка примітки перетворила б витрату $100 на ₴100.
    const legacy = { ...tx({ id: '1', accountId: '', amount: 100 }), currency: 'USD' };
    expect(accountIdForLegacyTx([wallet, dollars], legacy)).toBe('acct-usd');
  });

  test('немає рахунку тієї валюти — null, а не «хоч якийсь»', () => {
    const legacy = { ...tx({ id: '1', accountId: '', amount: 100 }), currency: 'USD' };
    expect(accountIdForLegacyTx([wallet], legacy)).toBeNull();
  });

  test('останній використаний працює лише в межах валюти запису', () => {
    const legacy = { ...tx({ id: '1', accountId: '', amount: 100 }), currency: 'USD' };
    expect(accountIdForLegacyTx([wallet, dollars], legacy, 'acct-uah-wallet')).toBe('acct-usd');
  });

  test('заощадження позаду платіжного — правило defaultAccountId лишається', () => {
    const legacy = { ...tx({ id: '1', accountId: '', amount: 100 }), currency: 'USD' };
    expect(accountIdForLegacyTx([jar, dollars], legacy)).toBe('acct-usd');
  });
});

describe('mergeAccountsForSave — запис не вбиває долиті синком рахунки', () => {
  const own = account({ id: 'acct-own' });
  const synced = account({ id: 'acct-synced', name: 'Депозит' });

  test('рахунок, що є лише у сховищі, лишається в масиві на запис', () => {
    // Інакше diffItems у saveSynced побачив би «зник» і поставив тумбстоун:
    // рахунок зник би з сервера й з усіх пристроїв.
    expect(mergeAccountsForSave([own, synced], [own]).map(a => a.id))
      .toEqual(['acct-own', 'acct-synced']);
  });

  test('правка зі стану виграє над копією зі сховища', () => {
    const renamed = { ...own, name: 'Картка' };
    const merged = mergeAccountsForSave([own, synced], [renamed]);
    expect(merged[0].name).toBe('Картка');
    expect(merged).toHaveLength(2);
  });

  test('нічого доливати — той самий масив, без зайвого рендера', () => {
    const next = [own, synced];
    expect(mergeAccountsForSave([own], next)).toBe(next);
  });

  test('порожнє сховище нічого не додає', () => {
    expect(mergeAccountsForSave([], [own])).toEqual([own]);
  });
});
