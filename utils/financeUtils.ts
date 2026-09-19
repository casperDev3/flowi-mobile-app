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
  /**
   * Належність проєкту (WORKSPACE_PROJECTS_CONTRACT §3.3, §4.1). Транзакції й
   * підписки з `projectId` бачить лише власник проєкту — фільтрація на
   * сервері (§3.4 «бюджетна фільтрація»), тут поле лише розмічає запис.
   */
  projectId?: string;
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

/**
 * Час операції числом. Бита дата НЕ викидає запис зі стрічки — лише опускає
 * його вниз: мовчки з'їдена операція для користувача виглядає як зниклі гроші.
 */
function txTime(t: Transaction): number {
  const ms = new Date(t.date).getTime();
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * Денні групи стрічки — ВІД НАЙНОВІШОГО дня, і всередині дня від найновішої
 * операції.
 *
 * Порядок тут не косметика. Раніше групи віддавалися в порядку появи в
 * масиві, а масив приходить із сховища як є: applyPullItems дописує прилетілі
 * синком записи В КІНЕЦЬ, поповнення скарбнички додає свій переказ спереду,
 * скасоване видалення повертає операцію в хвіст. Сьогоднішня операція з іншого
 * пристрою опинялася під усіма старішими днями — і скарга звучала як «фінанси
 * не показують усі актуальні операції».
 */
export function groupTransactions(
  txs: Transaction[],
  todayStr: string,
  yesterdayStr: string,
  locale: string,
): TxGroup[] {
  const map: Record<string, TxGroup> = {};
  const order: string[] = [];
  /** Ключ сортування дня. Будь-яка мить дня годиться — дні не перетинаються. */
  const dayTime: Record<string, number> = {};

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
      dayTime[key] = txTime(t);
    }
    map[key].items.push(t);
    // Переказ лишається в `items` (стрічка мусить його показати), але в денний
    // підсумок не йде: гроші не заробили й не витратили, а переклали.
    if (t.type === 'transfer') return;
    const cur = txCurrency(t);
    const target = t.type === 'income' ? map[key].dayIncomeByCur : map[key].dayExpenseByCur;
    target[cur] = (target[cur] ?? 0) + t.amount;
  });

  order.sort((a, b) => dayTime[b] - dayTime[a]);
  return order.map(k => {
    const group = map[k];
    group.items.sort((x, y) => txTime(y) - txTime(x));
    return group;
  });
}

/**
 * Список операцій для запису у сховище: те, що тримає екран, ПЛЮС те, що
 * з'явилося у сховищі повз нього.
 *
 * Поки екран фінансів відкритий, у ключ 'transactions' пишуть і інші: рушій
 * синхронізації (застосування чужих змін), поповнення скарбнички, відновлення
 * бекапу. `saveSynced` рахує різницю з тим, що вже лежить у сховищі, тож
 * збереження самого лише React-стану оголошувало б такі записи ВИДАЛЕНИМИ —
 * стирало локально й відправляло тумбстоун в outbox, тобто вбивало операцію на
 * всіх пристроях.
 *
 * Просто долити все зайве, як це робить mergeAccountsForSave, не можна:
 * операції, на відміну від рахунків, справді видаляються. Тому третій
 * аргумент — id, які екран БАЧИВ (завантажив або сам записав). Відсутність
 * баченого в `next` — це видалення; відсутність небаченого — це запис, про
 * який екран просто не знає.
 */
export function mergeTransactionsForSave(
  stored: Transaction[],
  next: Transaction[],
  seenIds: ReadonlySet<string>,
): Transaction[] {
  const known = new Set(next.map(t => t.id));
  const extra = stored.filter(t => !known.has(t.id) && !seenIds.has(t.id));
  return extra.length ? [...next, ...extra] : next;
}

/**
 * Фільтр стрічки по рахунку, звірений зі стрічкою рахунків.
 *
 * Обраний рахунок може зникнути з-під фільтра, поки екран відкритий: його
 * архівували тут-таки або на іншому пристрої, і синхронізація донесла зміну.
 * Фільтр при цьому лишався б чинним — стрічка показувала б операції одного
 * рахунку, а жодна картка вгорі не була б підсвічена. Зняти його не було б чим
 * (повторний тап знімає фільтр лише з видимої картки), і виглядало б це рівно
 * як «фінанси показують не всі операції».
 */
export function resolveAccountFilter(
  selected: string | null,
  visibleIds: string[],
): string | null {
  if (!selected) return null;
  return visibleIds.includes(selected) ? selected : null;
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
