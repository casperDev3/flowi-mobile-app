/**
 * utils/finance/pnl.ts — звіт про доходи й витрати (P&L) і порівняння періодів.
 *
 * flowi-web-app/docs/specs/finance-revamp.md §5. ДОСЛІВНИЙ ПОРТ
 * `flowi-web-app/lib/finance/pnl.ts`; спільна фікстура з очікуваними числами —
 * `__tests__/fixtures/finance-report-parity.json` (побайтова копія вебової).
 *
 * Детермінованість (§5.1):
 *  1. перед будь-яким підсумовуванням операції сортуються за (date, id);
 *  2. округлюється лише результат кожного ПУБЛІЧНОГО поля (1e-8);
 *  3. суми — `amountOf` (модуль); напрям задає `type`, а не знак.
 *
 * Перекази не входять НІДЕ (`isTransferType` — ширший за `isTransfer`:
 * покалічений переказ без адресата теж не оборот).
 */
import { accountById, txAmount, type Account } from '../accounts';
import { matchesMoneyScope } from '../budgetScope';
import type { Transaction } from '../financeUtils';
import { buildCategoryIndex, type CategoryGroup, type CategoryIndex, type CostKind, type SubscriptionRef } from './classify';
import { inRange, localDayKey, shiftPeriod, type FinanceFilter, type PeriodRange } from './period';

/** Підпис операції без категорії — той самий, що на вебі (UI мобільного перекладає його). */
export const NO_CATEGORY_LABEL = 'Без категорії';

export function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

/** Сума як невід'ємне число (веб: `amountOf` у lib/finance-report.ts). */
export function amountOf(tx: Pick<Transaction, 'amount'>): number {
  return txAmount(tx.amount);
}

/**
 * Чи є запис переказом ДЛЯ ПІДСУМКІВ (веб: lib/accounts.ts `isTransferType`).
 * Ширше за `isTransfer`: сюди потрапляє і покалічений переказ без адресата.
 */
export function isTransferType(tx: Pick<Transaction, 'type'>): boolean {
  return tx.type === 'transfer';
}

/**
 * Валюта операції — як `resolveTxCurrency(tx, accounts, primary)` на вебі:
 * рахунок → успадковане поле → основна валюта. Мобільний `resolveTxCurrency`
 * має запасною 'UAH', а не основну; звітам потрібна саме вебова семантика.
 */
export function resolveTxCurrency(tx: Transaction, accounts: readonly Account[], primary: string): string {
  const account = accountById(accounts as Account[], tx.accountId);
  return account?.currency || tx.currency || primary;
}

/** Порядок підсумовування: (date, id), лексикографічно. */
export function compareByDateId(a: Pick<Transaction, 'date' | 'id'>, b: Pick<Transaction, 'date' | 'id'>): number {
  const da = a.date ?? '';
  const db = b.date ?? '';
  if (da !== db) return da < db ? -1 : 1;
  const ia = a.id ?? '';
  const ib = b.id ?? '';
  return ia < ib ? -1 : ia > ib ? 1 : 0;
}

export function sortedByDateId<T extends Pick<Transaction, 'date' | 'id'>>(txs: readonly T[]): T[] {
  return [...txs].sort(compareByDateId);
}

/** Відбір операцій обороту (§5.2): не переказ, валюта фільтра, ракурс, період. */
export function includedInTurnover(
  tx: Transaction,
  filter: Pick<FinanceFilter, 'currency' | 'scope'> & { period: Pick<PeriodRange, 'from' | 'to'> },
  accounts: readonly Account[],
  primary: string,
): boolean {
  if (!tx || isTransferType(tx)) return false;
  if (tx.type !== 'income' && tx.type !== 'expense') return false;
  if (resolveTxCurrency(tx, accounts, primary) !== filter.currency) return false;
  if (!matchesMoneyScope(tx, filter.scope)) return false;
  return inRange(tx.date, filter.period);
}

export interface PnlTotals {
  currency: string;
  income: number;
  fixedExpense: number;
  variableExpense: number;
  /** fixedExpense + variableExpense */
  expense: number;
  /** income − expense */
  net: number;
  /** net / income, або null коли income === 0. */
  savingsRate: number | null;
  /** Витрати, у яких категорія не має ЖОДНОЇ ознаки cost — ні явної, ні похідної. */
  unclassifiedExpense: number;
  unclassifiedCount: number;
}

export interface PnlGroupRow {
  group: CategoryGroup;
  cost: CostKind;
  value: number;
  /** value / expense; 0 коли expense === 0. */
  share: number;
  /** За спаданням value, при рівності — за назвою. */
  categories: { name: string; value: number }[];
}

/** Те, що не потрапило у валюту фільтра: окремо, без конвертації (§7.1). */
export interface PnlUncounted {
  currency: string;
  income: number;
  expense: number;
  count: number;
}

export interface BuildPnlInput {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  /** Рядки колекції `categories` як є (форма перевіряється тут). */
  categories: readonly unknown[];
  /** Для правила «категорія підписки → fixed». */
  subscriptions: readonly SubscriptionRef[];
  filter: FinanceFilter;
  primary: string;
}

export interface PnlResult {
  totals: PnlTotals;
  groups: PnlGroupRow[];
  /** Назви категорій витрат без жодної ознаки cost (для «Розставити»). */
  unclassifiedCategories: string[];
  /** Інші валюти в тому самому періоді й ракурсі. */
  uncounted: PnlUncounted[];
}

function emptyTotals(currency: string): PnlTotals {
  return {
    currency,
    income: 0,
    fixedExpense: 0,
    variableExpense: 0,
    expense: 0,
    net: 0,
    savingsRate: null,
    unclassifiedExpense: 0,
    unclassifiedCount: 0,
  };
}

function finalizeTotals(t: PnlTotals): PnlTotals {
  const expense = t.fixedExpense + t.variableExpense;
  const net = t.income - expense;
  return {
    currency: t.currency,
    income: round(t.income),
    fixedExpense: round(t.fixedExpense),
    variableExpense: round(t.variableExpense),
    expense: round(expense),
    net: round(net),
    savingsRate: t.income > 0 ? round(net / t.income) : null,
    unclassifiedExpense: round(t.unclassifiedExpense),
    unclassifiedCount: t.unclassifiedCount,
  };
}

function pnlWithIndex(input: BuildPnlInput, index: CategoryIndex): PnlResult {
  const { filter, accounts, primary } = input;
  const totals = emptyTotals(filter.currency);
  const groups = new Map<string, { group: CategoryGroup; cost: CostKind; value: number; categories: Map<string, number> }>();
  const unclassified = new Set<string>();
  const uncounted = new Map<string, PnlUncounted>();

  for (const tx of sortedByDateId(input.transactions)) {
    if (!tx || isTransferType(tx)) continue;
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    if (!matchesMoneyScope(tx, filter.scope) || !inRange(tx.date, filter.period)) continue;
    const amount = amountOf(tx);
    const code = resolveTxCurrency(tx, accounts, primary);
    if (code !== filter.currency) {
      const row = uncounted.get(code) ?? { currency: code, income: 0, expense: 0, count: 0 };
      if (tx.type === 'income') row.income += amount;
      else row.expense += amount;
      row.count += 1;
      uncounted.set(code, row);
      continue;
    }
    if (tx.type === 'income') {
      totals.income += amount;
      continue;
    }
    const name = (tx.category ?? '').trim();
    const meta = index.meta('expense', name);
    if (meta.cost === 'fixed') totals.fixedExpense += amount;
    else totals.variableExpense += amount;
    if (meta.costSource === 'default') {
      totals.unclassifiedExpense += amount;
      totals.unclassifiedCount += 1;
      if (name) unclassified.add(name);
    }
    const key = `${meta.group}:${meta.cost}`;
    const bucket = groups.get(key) ?? { group: meta.group, cost: meta.cost, value: 0, categories: new Map<string, number>() };
    bucket.value += amount;
    const label = name || NO_CATEGORY_LABEL;
    bucket.categories.set(label, (bucket.categories.get(label) ?? 0) + amount);
    groups.set(key, bucket);
  }

  const final = finalizeTotals(totals);
  const rawExpense = totals.fixedExpense + totals.variableExpense;
  const rows: PnlGroupRow[] = [...groups.values()]
    .map((bucket) => ({
      group: bucket.group,
      cost: bucket.cost,
      value: round(bucket.value),
      share: rawExpense > 0 ? round(bucket.value / rawExpense) : 0,
      categories: [...bucket.categories.entries()]
        .map(([name, value]) => ({ name, value: round(value) }))
        .sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    }))
    .sort((a, b) =>
      b.value - a.value
      || (a.group < b.group ? -1 : a.group > b.group ? 1 : 0)
      || (a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : 0));

  return {
    totals: final,
    groups: rows,
    unclassifiedCategories: [...unclassified].sort(),
    uncounted: [...uncounted.values()]
      .map((row) => ({ ...row, income: round(row.income), expense: round(row.expense) }))
      .sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0)),
  };
}

/**
 * P&L за період фільтра:
 *   income          = Σ amountOf(tx)  type='income'
 *   fixedExpense    = Σ amountOf(tx)  type='expense', cost='fixed'
 *   variableExpense = Σ amountOf(tx)  type='expense', cost='variable'
 *   expense = fixed + variable;  net = income − expense
 *   savingsRate = income > 0 ? net / income : null
 */
export function buildPnl(input: BuildPnlInput): PnlResult {
  return pnlWithIndex(input, buildCategoryIndex(input.categories, input.subscriptions));
}

// ─── Порівняння ─────────────────────────────────────────────────────────────

export type PnlField =
  | 'income' | 'fixedExpense' | 'variableExpense' | 'expense' | 'net' | 'savingsRate';

export const PNL_COMPARED_FIELDS: readonly PnlField[] = [
  'income', 'fixedExpense', 'variableExpense', 'expense', 'net', 'savingsRate',
];

export interface PnlDelta {
  field: PnlField;
  /** value − base. Для savingsRate — різниця в ЧАСТКАХ (0.08 = +8 п.п.); null — коли savingsRate невизначена. */
  abs: number | null;
  /** (value − base) / |base|; null коли base === 0 і завжди для savingsRate. */
  pct: number | null;
}

export interface PnlComparison {
  current: PnlTotals;
  /** Період тієї ж довжини безпосередньо перед поточним. */
  previous: PnlTotals;
  /** Середнє за ТРИ ПОВНІ попередні періоди (або менше — див. basis). */
  average3: PnlTotals;
  /** Скільки попередніх періодів увійшло в середнє: 0..3. UI показує «середнє за 2 міс.». */
  basis: 0 | 1 | 2 | 3;
  /** Поточний проти попереднього. */
  delta: PnlDelta[];
  /** Поточний проти середнього. */
  deltaAverage: PnlDelta[];
}

function deltaOf(field: PnlField, value: PnlTotals, base: PnlTotals): PnlDelta {
  if (field === 'savingsRate') {
    const a = value.savingsRate;
    const b = base.savingsRate;
    return { field, abs: a === null || b === null ? null : round(a - b), pct: null };
  }
  const a = value[field];
  const b = base[field];
  return { field, abs: round(a - b), pct: b === 0 ? null : round((a - b) / Math.abs(b)) };
}

/**
 * Поточний період проти попереднього і проти середнього за три попередні.
 * Поточний у середнє не входить НІКОЛИ. Попередній рахується в середнє, лише
 * якщо історія його сягає (кінець не раніший за день першої операції обороту
 * в будь-якій валюті й ракурсі). savingsRate середнього — net/income середніх сум.
 */
export function comparePnl(input: BuildPnlInput): PnlComparison {
  const index = buildCategoryIndex(input.categories, input.subscriptions);
  const at = (period: PeriodRange) => pnlWithIndex({ ...input, filter: { ...input.filter, period } }, index).totals;
  const current = at(input.filter.period);
  const previous = at(shiftPeriod(input.filter.period, -1));

  let firstDay: string | null = null;
  for (const tx of input.transactions) {
    if (!tx || isTransferType(tx)) continue;
    const day = localDayKey(tx.date);
    if (day && (firstDay === null || day < firstDay)) firstDay = day;
  }

  const sums = emptyTotals(input.filter.currency);
  let basis = 0;
  for (let step = 1; step <= 3; step += 1) {
    const period = shiftPeriod(input.filter.period, -step);
    if (firstDay === null || period.to < firstDay) break;
    const totals = at(period);
    sums.income += totals.income;
    sums.fixedExpense += totals.fixedExpense;
    sums.variableExpense += totals.variableExpense;
    sums.unclassifiedExpense += totals.unclassifiedExpense;
    sums.unclassifiedCount += totals.unclassifiedCount;
    basis += 1;
  }
  const divisor = basis || 1;
  const average3 = finalizeTotals({
    ...sums,
    income: sums.income / divisor,
    fixedExpense: sums.fixedExpense / divisor,
    variableExpense: sums.variableExpense / divisor,
    unclassifiedExpense: sums.unclassifiedExpense / divisor,
    unclassifiedCount: round(sums.unclassifiedCount / divisor),
  });

  return {
    current,
    previous,
    average3,
    basis: basis as PnlComparison['basis'],
    delta: PNL_COMPARED_FIELDS.map((field) => deltaOf(field, current, previous)),
    deltaAverage: basis
      ? PNL_COMPARED_FIELDS.map((field) => deltaOf(field, current, average3))
      : PNL_COMPARED_FIELDS.map((field) => ({ field, abs: null, pct: null })),
  };
}
