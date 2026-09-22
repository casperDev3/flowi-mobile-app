/**
 * utils/financeOverview.ts — ОДНЕ джерело цифр для «Сьогодні» і «Фінансів».
 *
 * Звідки взялось: головна плитка показувала оборот МІСЯЦЯ (доходи − витрати),
 * а екран фінансів — БАЛАНС рахунків (початковий залишок + уся історія ±
 * перекази). Обидві цифри звались «баланс», і різниця між ними (у користувача
 * ~3000) виглядала як помилка, яку неможливо звести. Тепер обидва екрани
 * беруть цифри звідси:
 *
 *   • totalByCurrency — «На рахунках»: сума балансів АКТИВНИХ рахунків у
 *     кожній валюті. Та сама цифра і на «Сьогодні», і на «Фінансах».
 *   • month — «Сальдо місяця»: доходи − витрати поточного місяця в основній
 *     валюті, без переказів. Це НЕ баланс і так і підписано.
 *   • breakdowns — «Звідки ця сума» по кожному рахунку.
 *   • unassigned — операції без рахунку (чи з невідомим/архівним рахунком):
 *     вони є в обороті місяця, але в жоден видимий баланс не входять — про
 *     них треба сказати. Правило 1-в-1 із вебом (lib/finance-overview.ts).
 *   • future — операції з датою після сьогодні: у баланс не входять.
 *
 * Чиста функція без React — під тестами (__tests__/finance-overview.test.ts).
 */
import {
  accountBalanceBreakdown,
  resolveTxCurrency,
  txAmount,
  type Account,
  type AccountBalanceBreakdown,
} from './accounts';
import { isSameMonth } from './dateUtils';
import type { Transaction } from './financeUtils';

export interface FinanceMonthFlow {
  income: number;
  expense: number;
  /** income − expense. «Сальдо місяця», не баланс. */
  net: number;
}

export interface FinanceOverview {
  primary: string;
  month: FinanceMonthFlow;
  /** id рахунку → баланс на сьогодні (без майбутніх операцій). */
  balances: Record<string, number>;
  breakdowns: Record<string, AccountBalanceBreakdown>;
  /** Валюта → сума балансів активних (не архівних) рахунків. */
  totalByCurrency: Record<string, number>;
  unassigned: { count: number; ids: string[]; netByCurrency: Record<string, number> };
  /** Майбутні доходи/витрати на активних рахунках (перекази — ні), як на вебі. */
  future: { count: number; netByCurrency: Record<string, number> };
}

function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export function financeOverview({
  txs,
  accounts,
  primary,
  now = new Date(),
}: {
  txs: readonly Transaction[];
  accounts: readonly Account[];
  primary: string;
  now?: Date;
}): FinanceOverview {
  const accountList = [...accounts];
  const txList = [...txs];
  // Як на вебі (lib/finance-overview.ts): операція на АРХІВНОМУ рахунку теж
  // «без рахунку» — у жоден видимий баланс («На рахунках») вона не входить.
  const activeIds = new Set(accountList.filter(a => !a.archived).map(a => a.id));

  const balances: Record<string, number> = {};
  const breakdowns: Record<string, AccountBalanceBreakdown> = {};
  const totalByCurrency: Record<string, number> = {};
  for (const account of accountList) {
    const breakdown = accountBalanceBreakdown(account, txList, { asOf: now });
    breakdowns[account.id] = breakdown;
    balances[account.id] = breakdown.balance;
    if (account.archived) continue;
    const code = account.currency || 'UAH';
    totalByCurrency[code] = round((totalByCurrency[code] ?? 0) + breakdown.balance);
  }

  const month = { income: 0, expense: 0 };
  const unassigned = { count: 0, ids: [] as string[], netByCurrency: {} as Record<string, number> };
  const future = { count: 0, netByCurrency: {} as Record<string, number> };
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  for (const tx of txList) {
    const date = new Date(tx.date);
    if (tx.type === 'transfer') continue;
    const signed = tx.type === 'income' ? txAmount(tx.amount) : tx.type === 'expense' ? -txAmount(tx.amount) : 0;
    const code = resolveTxCurrency(tx, accountList);
    if (!tx.accountId || !activeIds.has(tx.accountId)) {
      unassigned.count += 1;
      unassigned.ids.push(tx.id);
      unassigned.netByCurrency[code] = round((unassigned.netByCurrency[code] ?? 0) + signed);
    } else if (Number.isFinite(date.getTime()) && date.getTime() > endOfToday.getTime()) {
      // Правило 1-в-1 з lib/finance-overview.ts вебу: майбутні — лише доходи й
      // витрати на активних рахунках (без рахунку — вже в unassigned).
      future.count += 1;
      future.netByCurrency[code] = round((future.netByCurrency[code] ?? 0) + signed);
    }
    if (code !== primary || !isSameMonth(date, now)) continue;
    if (tx.type === 'income') month.income += txAmount(tx.amount);
    else if (tx.type === 'expense') month.expense += txAmount(tx.amount);
  }

  return {
    primary,
    month: { income: round(month.income), expense: round(month.expense), net: round(month.income - month.expense) },
    balances,
    breakdowns,
    totalByCurrency,
    unassigned,
    future,
  };
}
