/**
 * utils/financePeriod.ts — оборот стрічки операцій за ПЕРІОДОМ спільного
 * фільтра (finance-revamp.md §3), а не лише за календарним місяцем.
 *
 * Та сама форма, що `calcTotalsByCurrency` (utils/financeUtils.ts): income /
 * expense — у межах періоду, carryover — усе до його початку, balance —
 * carryover + income − expense. Переказ не є оборотом і тут. Для періоду в
 * один календарний місяць результат збігається з calcTotalsByCurrency.
 */
import { txAmount } from './accounts';
import { localDayKey, type PeriodRange } from './finance/period';
import type { CurrencyTotals, Transaction } from './financeUtils';

function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export function calcPeriodTotalsByCurrency(
  txs: readonly Transaction[],
  period: Pick<PeriodRange, 'from' | 'to'>,
  currencyOf: (tx: Transaction) => string,
): Record<string, CurrencyTotals> {
  const out: Record<string, CurrencyTotals> = {};
  const ensure = (code: string) => {
    if (!out[code]) out[code] = { income: 0, expense: 0, carryover: 0, balance: 0 };
    return out[code];
  };
  for (const t of txs) {
    if (t.type === 'transfer') continue;
    const day = localDayKey(t.date);
    if (day === null || day > period.to) continue;
    const amount = txAmount(t.amount);
    const slot = ensure(currencyOf(t));
    if (day >= period.from) {
      if (t.type === 'income') slot.income += amount;
      else slot.expense += amount;
    } else {
      slot.carryover += t.type === 'income' ? amount : -amount;
    }
  }
  for (const code of Object.keys(out)) {
    const s = out[code];
    s.income = round(s.income);
    s.expense = round(s.expense);
    s.carryover = round(s.carryover);
    s.balance = round(s.carryover + s.income - s.expense);
  }
  return out;
}
