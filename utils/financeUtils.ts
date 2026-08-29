/**
 * utils/financeUtils.ts — операції та підсумки.
 *
 * Головний інваріант: ПЕРЕКАЗ НЕ Є ОБОРОТОМ. `type='transfer'` — це переїзд
 * власних грошей між своїми ж рахунками, тож він не додається ні до доходів,
 * ні до витрат, ні до перенесеного залишку — ані в підсумках місяця, ані в
 * денних підсумках стрічки. Раніше переказ доводилося писати парою «витрата +
 * дохід», і місяць, у якому користувач просто зняв гроші з картки, показував
 * зайвий дохід і зайву витрату на ту саму суму.
 *
 * У стрічці переказ ЛИШАЄТЬСЯ видимим — його малює екран окремим виглядом;
 * прибрано лише його внесок у цифри.
 *
 * Валюта операції визначається її рахунком (`accountId`). Поле `currency`
 * лишається тільки для записів, створених до появи рахунків, — див.
 * `resolveTxCurrency` в utils/accounts.ts.
 */

import { isSameMonth, startOfMonth } from './dateUtils';

export type TxType = 'income' | 'expense' | 'transfer';

export interface TxHistoryEvent {
  id: string;
  at: string;
  note: string;
}

export interface Transaction {
  id: string;
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
  type: TxType;
  category: string;
  /** Списана сума — з рахунку `accountId`. */
  amount: number;
  note: string;
  date: string;
  /**
   * Рахунок-джерело: звідси беруться і гроші, і валюта операції.
   */
  accountId: string;
  /** Рахунок-призначення. Лише для type='transfer'. */
  toAccountId?: string;
  /**
   * Зарахована сума. Лише для type='transfer' і лише коли валюти рахунків
   * різні: списано 100 USD — зараховано 4100 UAH. У межах однієї валюти
   * дорівнює `amount` і не зберігається.
   */
  toAmount?: number;
  /**
   * Успадковане поле. Джерело істини про валюту — рахунок; тут воно лишилося
   * заради записів, створених до появи рахунків.
   */
  currency?: string;
  history?: TxHistoryEvent[];
}

/** Append chronologically; detail screens may reverse a copy for newest-first UI. */
export function appendTransactionHistory(
  transaction: Transaction,
  event: TxHistoryEvent,
): Transaction {
  return { ...transaction, history: [...(transaction.history ?? []), event] };
}

export interface Currency {
  code: string;
  symbol: string;
  kind: 'fiat' | 'crypto';
  decimals: number;
}

export interface CurrencyTotals {
  income: number;
  expense: number;
  carryover: number;
  balance: number;
}

export interface TxGroup {
  label: string;
  dateStr: string;
  items: Transaction[];
  // Day totals keyed by currency code
  dayIncomeByCur: Record<string, number>;
  dayExpenseByCur: Record<string, number>;
}

export const BUILTIN_CURRENCIES: Currency[] = [
  { code: 'UAH', symbol: '₴', kind: 'fiat',   decimals: 2 },
  { code: 'USD', symbol: '$', kind: 'fiat',   decimals: 2 },
];

export function txCurrency(t: Transaction): string {
  return t.currency || 'UAH';
}

export function formatCurrency(n: number, cur: Currency, locale: string): string {
  if (cur.kind === 'fiat') {
    try {
      return n.toLocaleString(locale, {
        style: 'currency',
        currency: cur.code,
        maximumFractionDigits: 0,
      });
    } catch {
      return `${cur.symbol}${Math.round(n).toLocaleString(locale)}`;
    }
  }
  const abs = Math.abs(n);
  let decimals = cur.decimals;
  if (abs >= 100) decimals = Math.min(2, cur.decimals);
  else if (abs >= 1) decimals = Math.min(4, cur.decimals);
  const formatted = n.toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return `${cur.symbol} ${formatted}`;
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
        dayIncomeByCur: {},
        dayExpenseByCur: {},
      };
      order.push(key);
    }
    map[key].items.push(t);
    // Переказ лишається в `items` (стрічка мусить його показати), але в денний
    // підсумок не йде: гроші не заробили й не витратили, а переклали.
    if (t.type === 'transfer') return;
    const cur = txCurrency(t);
    const target = t.type === 'income' ? map[key].dayIncomeByCur : map[key].dayExpenseByCur;
    target[cur] = (target[cur] ?? 0) + t.amount;
  });

  return order.map(k => map[k]);
}

export function filterByMonth(txs: Transaction[], month: Date): Transaction[] {
  return txs.filter(t => isSameMonth(new Date(t.date), month));
}

/**
 * Per-currency totals including a "carryover" line:
 *   carryover = sum(income - expense) of all transactions with date < startOfMonth(activeMonth)
 *                + optional per-currency manual adjustment (from settings)
 *   income/expense = transactions inside activeMonth only
 *   balance = carryover + income - expense
 *
 * Returns a map keyed by currency code. Includes any currency that has any
 * activity OR a non-zero manual adjustment.
 *
 * Перекази пропускаються ЦІЛКОМ — і в місяці, і в перенесеному залишку. Вони
 * не змінюють суму грошей у валюті, лише її розкладку по рахунках, тож
 * баланси окремих рахунків рахує accountBalance, а не ця функція.
 */
export function calcTotalsByCurrency(
  allTxs: Transaction[],
  activeMonth: Date,
  adjustments: Record<string, number> = {},
): Record<string, CurrencyTotals> {
  const monthStart = startOfMonth(activeMonth);
  const out: Record<string, CurrencyTotals> = {};
  const ensure = (code: string) => {
    if (!out[code]) out[code] = { income: 0, expense: 0, carryover: 0, balance: 0 };
    return out[code];
  };

  for (const t of allTxs) {
    if (t.type === 'transfer') continue;
    const code = txCurrency(t);
    const d = new Date(t.date);
    if (isSameMonth(d, activeMonth)) {
      const slot = ensure(code);
      if (t.type === 'income') slot.income += t.amount;
      else slot.expense += t.amount;
    } else if (d < monthStart) {
      const slot = ensure(code);
      slot.carryover += t.type === 'income' ? t.amount : -t.amount;
    }
  }

  // Apply manual adjustments to carryover, ensuring the currency slot exists.
  for (const [code, value] of Object.entries(adjustments)) {
    if (!value) continue;
    ensure(code).carryover += value;
  }

  // Round floats to mitigate fp accumulation error. 8 decimals is enough for
  // crypto, harmless for fiat. (e.g. 1.1 + 2.2 → 3.30000000000000... → 3.3)
  const round = (n: number) => Math.round(n * 1e8) / 1e8;
  for (const code of Object.keys(out)) {
    const s = out[code];
    s.income    = round(s.income);
    s.expense   = round(s.expense);
    s.carryover = round(s.carryover);
    s.balance   = round(s.carryover + s.income - s.expense);
  }
  return out;
}

/**
 * Back-compat: totals for one month, no carryover, all currencies summed.
 *
 * Перекази сюди не потрапляють: фільтри беруть лише 'income' і 'expense', і
 * 'transfer' відсіюється сам. Лишаємо це явним, бо саме на цій функції
 * тримається екран дня.
 */
export function calcTotals(txs: Transaction[]) {
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;
  return { income, expense, balance, savingsPct };
}
