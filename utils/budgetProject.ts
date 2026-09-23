/**
 * utils/budgetProject.ts — гроші проєкту за ВЕСЬ час (finance-revamp.md §5.6, §10).
 *
 * «Витрачено» — те саме число, що budgetSpentTotal (utils/projectOverview.ts):
 * лише валюта бюджету, без конвертації. Поруч — доходи проєкту (П4) і те, що
 * в бюджет не потрапило через іншу валюту («не враховано», як в особистому
 * бюджеті). Переказ не є ні доходом, ні витратою.
 */
import { txAmount, type Account } from './accounts';
import { budgetTxCurrency } from './budgetUtils';
import type { Transaction } from './financeUtils';
import { budgetSpentTotal } from './projectOverview';
import { uuidV4 } from './uuid';

export interface ProjectMoneyTotals {
  /** Витрати в валюті бюджету (= budgetSpentTotal). */
  spent: number;
  /** Доходи в валюті бюджету. */
  income: number;
  /** income − spent. */
  net: number;
  /** Інші валюти: код → { income, expense }. */
  uncounted: Record<string, { income: number; expense: number }>;
}

function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}

export function projectMoneyTotals(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  projectId: string,
  budgetCurrency: string,
): ProjectMoneyTotals {
  const accountList = [...accounts];
  const spent = budgetSpentTotal(transactions, accounts, projectId, budgetCurrency);
  let income = 0;
  const uncounted: Record<string, { income: number; expense: number }> = {};
  for (const tx of transactions) {
    if (!tx || tx.projectId !== projectId) continue;
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const code = budgetTxCurrency(tx, accountList, budgetCurrency);
    const amount = txAmount(tx.amount);
    if (code === budgetCurrency) {
      if (tx.type === 'income') income += amount;
      continue;
    }
    const slot = uncounted[code] ?? (uncounted[code] = { income: 0, expense: 0 });
    if (tx.type === 'income') slot.income = round(slot.income + amount);
    else slot.expense = round(slot.expense + amount);
  }
  return { spent: round(spent), income: round(income), net: round(income - spent), uncounted };
}

/** Операції проєкту для списку: доходи й витрати окремо, найновіші першими. */
export function projectTransactions(
  transactions: readonly Transaction[],
  projectId: string,
  type: 'income' | 'expense',
  limit = 30,
): Transaction[] {
  return transactions
    .filter(t => t && t.projectId === projectId && t.type === type)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (a.id < b.id ? 1 : -1))
    .slice(0, limit);
}

/** Чиста збірка операції з полів форми; null — невалідна сума. */
export function buildProjectTransaction(input: {
  type: 'income' | 'expense';
  amount: string;
  category: string;
  note: string;
  account: Account | undefined;
  projectId: string;
  now: Date;
  id?: string;
}): Transaction | null {
  const amount = Number(input.amount.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    id: input.id ?? uuidV4(),
    type: input.type,
    category: input.category.trim(),
    amount,
    note: input.note.trim(),
    date: input.now.toISOString(),
    accountId: input.account?.id ?? '',
    ...(input.account?.currency ? { currency: input.account.currency } : {}),
    projectId: input.projectId,
  };
}

