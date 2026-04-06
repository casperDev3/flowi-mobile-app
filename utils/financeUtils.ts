import { isSameMonth } from './dateUtils';

export type TxType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  note: string;
  date: string;
}

export interface TxGroup {
  label: string;
  dateStr: string;
  items: Transaction[];
  dayIncome: number;
  dayExpense: number;
}

export function groupLabel(
  date: Date,
  todayStr: string,
  yesterdayStr: string,
  locale: string,
): string {
  if (date.toDateString() === todayStr) return '__today__';
  if (date.toDateString() === yesterdayStr) return '__yesterday__';
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

export function groupTransactions(
  txs: Transaction[],
  todayStr: string,
  yesterdayStr: string,
  locale: string,
): TxGroup[] {
  const map: Record<string, TxGroup> = {};
  const order: string[] = [];

  txs.forEach(t => {
    const d = new Date(t.date);
    const key = d.toDateString();
    if (!map[key]) {
      map[key] = {
        label: groupLabel(d, todayStr, yesterdayStr, locale),
        dateStr: key,
        items: [],
        dayIncome: 0,
        dayExpense: 0,
      };
      order.push(key);
    }
    map[key].items.push(t);
    if (t.type === 'income') map[key].dayIncome += t.amount;
    else map[key].dayExpense += t.amount;
  });

  return order.map(k => map[k]);
}

export function filterByMonth(txs: Transaction[], month: Date): Transaction[] {
  return txs.filter(t => isSameMonth(new Date(t.date), month));
}

export function calcTotals(txs: Transaction[]) {
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;
  return { income, expense, balance, savingsPct };
}
