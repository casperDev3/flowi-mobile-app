/**
 * __tests__/finance-parity-web.test.ts — ВЕБОВА фікстура
 * (flowi-web-app/lib/__fixtures__/finance-parity.json, скопійована сюди
 * байт-у-байт) через МОБІЛЬНИЙ financeOverview.
 *
 * Навіщо окремо від finance-overview.test.ts: там фікстура мобільна, і
 * «спільною» вона була лише на словах — вебові очікувані числа мобільний код
 * не перевіряв. Скарга користувача («головна і Фінанси розходяться на 3000»)
 * — саме про розбіжність двох обчислень, тож головні цифри (баланси рахунків,
 * «На рахунках», сальдо місяця) мусять збігатися з вебом на тому самому вході.
 */
import { financeOverview } from '@/utils/financeOverview';
import type { Account } from '@/utils/accounts';
import type { Transaction } from '@/utils/financeUtils';

import fixture from './fixtures/finance-parity-web.json';

const [y, m, d, h, min, s] = fixture.now as number[];
const now = new Date(y, m, d, h, min, s);
const overview = financeOverview({
  txs: fixture.transactions as unknown as Transaction[],
  accounts: fixture.accounts as unknown as Account[],
  primary: fixture.primary,
  now,
});

describe('паритет із вебом: financeOverview на вебовій фікстурі', () => {
  test('баланс і розклад кожного активного рахунку — як на вебі', () => {
    for (const [id, exp] of Object.entries(fixture.expected.accounts)) {
      const b = overview.breakdowns[id];
      expect(b).toBeDefined();
      expect(b.opening).toBe(exp.opening);
      expect(b.income).toBe(exp.income);
      expect(b.expense).toBe(exp.expense);
      expect(b.transfersIn).toBe(exp.transfersIn);
      expect(b.transfersOut).toBe(exp.transfersOut);
      expect(b.future).toBe(exp.future);
      expect(overview.balances[id]).toBe(exp.total);
    }
  });

  test('«На рахунках» по валютах — як на вебі', () => {
    expect(overview.totalByCurrency).toEqual(fixture.expected.totalByCurrency);
  });

  test('сальдо місяця (основна валюта) — як на вебі', () => {
    const { income, expense, net } = fixture.expected.month;
    expect(overview.month).toEqual({ income, expense, net });
  });

  test('операції без рахунку враховано й показано', () => {
    // Операція зовсім без рахунку — в обох клієнтах попередження.
    expect(overview.unassigned.ids).toContain('sep-orphan');
  });
});

test('«без рахунку» — те саме число, що на вебі (включно з архівним рахунком)', () => {
  expect(overview.unassigned).toEqual(fixture.expected.unassigned);
});

describe('паритет із вебом: майбутні операції', () => {
  test('future.count і future.netByCurrency — як на вебі', () => {
    const exp = (fixture.expected as unknown as { future: { count: number; netByCurrency: Record<string, number> } }).future;
    expect(overview.future.count).toBe(exp.count);
    expect(overview.future.netByCurrency).toEqual(exp.netByCurrency);
  });
});
