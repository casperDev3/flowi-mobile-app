/**
 * __tests__/finance-transfers.test.ts — переказ не є оборотом.
 *
 * Це головний інваріант усієї фази. Раніше переказ доводилося писати парою
 * «витрата + дохід», і місяць, у якому користувач просто зняв гроші з картки,
 * показував і зайвий дохід, і зайву витрату на ту саму суму. Тепер переказ —
 * один запис, і він не додається ні до доходів, ні до витрат, ні до
 * перенесеного залишку, лишаючись при цьому видимим у стрічці.
 */

import {
  calcTotals,
  calcTotalsByCurrency,
  groupTransactions,
  type Transaction,
} from '@/utils/financeUtils';

function tx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    category: 'catOther',
    amount: 0,
    note: '',
    date: '2026-08-10T12:00:00.000Z',
    accountId: 'acct-uah',
    ...over,
  };
}

const AUG = new Date(2026, 7, 1);

describe('calcTotalsByCurrency', () => {
  test('переказ не потрапляє ні в доходи, ні у витрати', () => {
    const txs = [
      tx({ id: '1', type: 'income', amount: 20000, currency: 'UAH' }),
      tx({ id: '2', type: 'expense', amount: 3000, currency: 'UAH' }),
      tx({
        id: '3', type: 'transfer', amount: 5000, currency: 'UAH',
        toAccountId: 'acct-cash',
      }),
    ];
    const totals = calcTotalsByCurrency(txs, AUG);
    expect(totals.UAH.income).toBe(20000);
    expect(totals.UAH.expense).toBe(3000);
    expect(totals.UAH.balance).toBe(17000);
  });

  test('переказ минулого місяця не потрапляє в перенесений залишок', () => {
    const txs = [
      tx({ id: '1', type: 'income', amount: 1000, date: '2026-07-05T10:00:00.000Z' }),
      tx({
        id: '2', type: 'transfer', amount: 900, date: '2026-07-06T10:00:00.000Z',
        toAccountId: 'acct-cash',
      }),
    ];
    expect(calcTotalsByCurrency(txs, AUG).UAH.carryover).toBe(1000);
  });

  test('переказ між валютами не створює доходу у валюті призначення', () => {
    const txs = [
      tx({
        id: '1', type: 'transfer', amount: 100, currency: 'USD',
        accountId: 'acct-usd', toAccountId: 'acct-uah', toAmount: 4100,
      }),
    ];
    const totals = calcTotalsByCurrency(txs, AUG);
    // Жодної валюти в підсумках: обороту не було взагалі.
    expect(Object.keys(totals)).toEqual([]);
  });

  test('місяць з самих переказів не вигадує валюту в підсумках', () => {
    const txs = [
      tx({ id: '1', type: 'transfer', amount: 500, toAccountId: 'acct-cash' }),
    ];
    expect(calcTotalsByCurrency(txs, AUG)).toEqual({});
  });
});

describe('groupTransactions', () => {
  const day = new Date('2026-08-10T12:00:00.000Z').toDateString();

  test('переказ видимий у стрічці, але не в денному підсумку', () => {
    const txs = [
      tx({ id: '1', type: 'income', amount: 1000 }),
      tx({ id: '2', type: 'expense', amount: 200 }),
      tx({ id: '3', type: 'transfer', amount: 700, toAccountId: 'acct-cash' }),
    ];
    const [group] = groupTransactions(txs, day, '', 'uk');
    expect(group.items.map(t => t.id)).toEqual(['1', '2', '3']);
    expect(group.dayIncomeByCur).toEqual({ UAH: 1000 });
    expect(group.dayExpenseByCur).toEqual({ UAH: 200 });
  });

  test('день з самого переказу має порожні підсумки', () => {
    const txs = [tx({ id: '1', type: 'transfer', amount: 700, toAccountId: 'acct-cash' })];
    const [group] = groupTransactions(txs, day, '', 'uk');
    expect(group.items).toHaveLength(1);
    expect(group.dayIncomeByCur).toEqual({});
    expect(group.dayExpenseByCur).toEqual({});
  });
});

describe('calcTotals (екран дня)', () => {
  test('переказ не рахується витратою', () => {
    const txs = [
      tx({ id: '1', type: 'income', amount: 1000 }),
      tx({ id: '2', type: 'expense', amount: 250 }),
      tx({ id: '3', type: 'transfer', amount: 400, toAccountId: 'acct-cash' }),
    ];
    expect(calcTotals(txs)).toEqual({
      income: 1000,
      expense: 250,
      balance: 750,
      savingsPct: 75,
    });
  });
});
