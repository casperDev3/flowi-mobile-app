/**
 * utils/finance/cashflow.ts — Cash Flow: факт по днях.
 *
 * flowi-web-app/docs/specs/finance-revamp.md §6.1. ДОСЛІВНИЙ ПОРТ
 * `flowi-web-app/lib/finance/cashflow.ts`.
 *
 * Приплив/відплив і баланс рахуються ПО-РІЗНОМУ, і це навмисно:
 *  - `inflow`/`outflow` — оборот за правилами §5.2: переказ виключено, ракурс
 *    застосовано, операції без рахунку входять;
 *  - `balance` — баланс АКТИВНИХ рахунків валюти фільтра на кінець дня, тим
 *    самим правилом, що `accountBalanceBreakdown` (utils/accounts.ts): доходи й
 *    витрати рахунків плюс внесок переказів (крос-валютний переказ справді
 *    змінює гривневий баланс, хоча доходом не є). Ракурс на баланс НЕ впливає.
 */
import {
  accountBalanceBreakdown,
  activeAccounts,
  creditedAmount,
  isTransfer,
  type Account,
} from '../accounts';
import type { Transaction } from '../financeUtils';
import { addDaysKey, dateKeyOf } from '../subscriptions';
import { daysOf, localDayKey, type FinanceFilter } from './period';
import { amountOf, includedInTurnover, isTransferType, round, sortedByDateId } from './pnl';

export interface CashflowPoint {
  /** 'YYYY-MM-DD' */
  day: string;
  inflow: number;
  outflow: number;
  /** Баланс на КІНЕЦЬ цього дня, у валюті фільтра. */
  balance: number;
}

export interface CashflowFact {
  points: CashflowPoint[];
  /** Баланс активних рахунків валюти на кінець дня, що передує period.from. */
  opening: number;
  inflow: number;
  outflow: number;
}

/** Локальна дата дня `dateKey` — для `asOf` балансу (береться кінець доби). */
function dateOfKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Сума балансів АКТИВНИХ рахунків валюти `currency` на кінець дня `dayKey`.
 * Та сама формула, що на картці рахунку й у «На рахунках».
 */
export function balanceAtEndOf(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  currency: string,
  dayKey: string,
  primary: string,
): number {
  const asOf = dateOfKey(dayKey);
  let total = 0;
  for (const account of activeAccounts(accounts as Account[])) {
    if ((account.currency || primary) !== currency) continue;
    total += accountBalanceBreakdown(account, transactions, { asOf }).balance;
  }
  return round(total);
}

/**
 * Внесок операції в баланс активних рахунків валюти C (без відсічки дати).
 * Дзеркалить гілки `accountBalanceBreakdown`: переказ без адресата не
 * рахується ніде, операція без рахунку чи на архівному — теж.
 */
export function balanceContribution(
  tx: Transaction,
  accountsById: ReadonlyMap<string, Account>,
  currency: string,
  primary: string,
): number {
  const inC = (id: string | undefined) => {
    const account = id ? accountsById.get(id) : undefined;
    return Boolean(account) && (account!.currency || primary) === currency;
  };
  if (isTransfer(tx)) {
    let delta = 0;
    if (inC(tx.accountId)) delta -= amountOf(tx);
    if (inC(tx.toAccountId)) delta += Math.abs(Number(creditedAmount(tx)) || 0);
    return delta;
  }
  if (isTransferType(tx)) return 0;
  if (tx.type !== 'income' && tx.type !== 'expense') return 0;
  if (!inC(tx.accountId)) return 0;
  return tx.type === 'income' ? amountOf(tx) : -amountOf(tx);
}

/**
 * Факт за період фільтра. Ряд СУЦІЛЬНИЙ: день без операцій — видимий нуль.
 * Ряд обрізається по сьогодні (`now`): майбутні дні — справа прогнозу.
 */
export function cashflowFact(input: {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  filter: FinanceFilter;
  primary: string;
  now: Date;
}): CashflowFact {
  const { transactions, accounts, filter, primary, now } = input;
  const today = dateKeyOf(now);
  const from = filter.period.from;
  const to = filter.period.to < today ? filter.period.to : today;
  const opening = balanceAtEndOf(accounts, transactions, filter.currency, addDaysKey(from, -1), primary);
  if (from > to) return { points: [], opening, inflow: 0, outflow: 0 };

  const active = new Map(activeAccounts(accounts as Account[]).map((account) => [account.id, account]));
  const inflowByDay = new Map<string, number>();
  const outflowByDay = new Map<string, number>();
  const balanceByDay = new Map<string, number>();

  for (const tx of sortedByDateId(transactions)) {
    if (!tx) continue;
    const day = localDayKey(tx.date);
    if (!day || day < from || day > to) continue;
    if (includedInTurnover(tx, filter, accounts, primary)) {
      const map = tx.type === 'income' ? inflowByDay : outflowByDay;
      map.set(day, (map.get(day) ?? 0) + amountOf(tx));
    }
    const delta = balanceContribution(tx, active, filter.currency, primary);
    if (delta) balanceByDay.set(day, (balanceByDay.get(day) ?? 0) + delta);
  }

  const points: CashflowPoint[] = [];
  let running = opening;
  let inflow = 0;
  let outflow = 0;
  for (const day of daysOf({ from, to })) {
    const dayIn = inflowByDay.get(day) ?? 0;
    const dayOut = outflowByDay.get(day) ?? 0;
    running += balanceByDay.get(day) ?? 0;
    inflow += dayIn;
    outflow += dayOut;
    points.push({ day, inflow: round(dayIn), outflow: round(dayOut), balance: round(running) });
  }
  return { points, opening, inflow: round(inflow), outflow: round(outflow) };
}
