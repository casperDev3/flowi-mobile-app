/**
 * utils/budgetMonths.ts — бюджет на період, довший за місяць
 * (finance-revamp.md §5.5).
 *
 * Формули бюджету НЕ змінюються: у витрати йде строго `type === 'expense'`,
 * ліміт — завжди в основній валюті, нічого не конвертується. Нове лише те,
 * що період «квартал/рік/свій» показує ліміти ПО МІСЯЦЯХ (таблиця «категорія ×
 * місяць»), а не суму лімітів: місячний ліміт, складений у квартальний, —
 * вигадане число, якого користувач не задавав.
 */
import type { Account } from './accounts';
import { budgetTxCurrency, type BudgetLimit } from './budgetUtils';
import { matchesMoneyScope, type MoneyScope } from './budgetScope';
import { localDayKey } from './finance/period';
import type { Transaction } from './financeUtils';

export interface BudgetMonthCell {
  /** Місяць 'YYYY-MM' (як monthsOf у utils/finance/period.ts). */
  month: string;
  spent: number;
  limit: number;
}

export interface BudgetMonthRow {
  category: string;
  icon: string;
  cells: BudgetMonthCell[];
}

/**
 * Рядки таблиці: лише збережені ліміти (limit > 0), бо питання таблиці —
 * «чи вклався я в ліміт кожного місяця». Витрати без ліміту видно на вкладці
 * «Звіти».
 */
export function budgetMonthRows(
  limits: readonly BudgetLimit[],
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  months: readonly string[],
  primary: string,
  scope: MoneyScope,
): BudgetMonthRow[] {
  const monthSet = new Set(months.map(m => m.slice(0, 7)));
  // Object.create(null): ключ — назва категорії, яку набрав користувач.
  const spent: Record<string, Record<string, number>> = Object.create(null);
  const accountList = [...accounts];
  for (const tx of transactions) {
    if (!tx || tx.type !== 'expense') continue;
    if (!matchesMoneyScope(tx, scope)) continue;
    const day = localDayKey(tx.date);
    if (!day || !monthSet.has(day.slice(0, 7))) continue;
    if (budgetTxCurrency(tx, accountList, primary) !== primary) continue;
    const amount = Number(tx.amount);
    if (!Number.isFinite(amount)) continue;
    const category = typeof tx.category === 'string' ? tx.category : '';
    const byMonth = spent[category] ?? (spent[category] = Object.create(null) as Record<string, number>);
    const key = day.slice(0, 7);
    byMonth[key] = (byMonth[key] ?? 0) + amount;
  }
  return limits
    .filter(l => l.limit > 0)
    .map(l => ({
      category: l.category,
      icon: l.icon,
      cells: months.map(m => ({
        month: m,
        spent: Math.round((spent[l.category]?.[m.slice(0, 7)] ?? 0) * 100) / 100,
        limit: l.limit,
      })),
    }));
}
