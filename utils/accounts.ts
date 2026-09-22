/**
 * utils/accounts.ts — рахунок як місце, де лежать гроші.
 *
 * До появи цього типу валюта висіла на ОПЕРАЦІЇ, і модель не знала, звідки
 * саме гроші пішли. Через це переказ доводилося писати парою «витрата +
 * дохід»: обидві половини потрапляли в оборот місяця й роздували доходи та
 * витрати сумою, яку користувач нікому не платив і ні від кого не отримав.
 *
 * Рахунок робить переказ ОДНИМ записом: списано з `accountId`, зараховано на
 * `toAccountId`. Пара була ще й небезпечною сама по собі — LWW-синхронізація
 * зливає записи поодинці, тож стан «доїхала лише витрата» цілком реальний, і
 * в ньому гроші просто зникають.
 *
 * Валюта тепер належить рахунку і після створення НЕ ЗМІНЮЄТЬСЯ: інакше вся
 * історія операцій заднім числом перерахувалася б в іншу валюту. Поле
 * `currency` на транзакції лишається лише для сумісності зі старими записами.
 */

import { txCurrency, type Transaction } from './financeUtils';

/**
 * `cash` — готівка, `card` — безготівка, `savings` — колишня скарбничка
 * (єдиний вид, що має `goal`).
 */
export type AccountKind = 'cash' | 'card' | 'savings';

export const ACCOUNT_KINDS: AccountKind[] = ['cash', 'card', 'savings'];

export interface Account {
  id: string;
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
  name: string;
  kind: AccountKind;
  /** Код валюти. НЕЗМІННИЙ після створення. */
  currency: string;
  /** Залишок на момент заведення рахунку — те, що було до першої операції. */
  openingBalance: number;
  /** Лише для kind='savings'. */
  goal?: number;
  icon?: string;
  color?: string;
  /**
   * Замість видалення: транзакції рахунку нікуди не діваються, і рахунок,
   * стертий назовсім, лишив би їх без валюти та без місця в балансі.
   */
  archived?: boolean;
  createdAt: string;
}

/**
 * Переказ. `toAccountId` обовʼязковий — без нього запис не переказ, а витрата
 * без адресата. `toAmount` необовʼязковий: у межах однієї валюти зарахована
 * сума дорівнює списаній, і змушувати екрани дублювати її означало б плодити
 * записи, де дві суми розійшлися через недогляд.
 */
export interface TransferTx extends Transaction {
  type: 'transfer';
  toAccountId: string;
  toAmount?: number;
}

/**
 * Звужувач типу. Перевіряє не лише `type`, а й наявність адресата: запис із
 * type='transfer' без `toAccountId` — зламані дані, і вдавати, що адресат є,
 * означало б зарахувати гроші на рахунок `undefined`.
 */
export function isTransfer(tx: Transaction): tx is TransferTx {
  return (
    tx.type === 'transfer' &&
    typeof (tx as TransferTx).toAccountId === 'string' &&
    (tx as TransferTx).toAccountId.length > 0
  );
}

/**
 * Скільки реально зараховано на рахунок призначення.
 *
 * Порожній `toAmount` означає «та сама сума» (переказ у межах однієї валюти),
 * а не нуль: нуль з'їв би гроші при зарахуванні.
 */
export function creditedAmount(tx: TransferTx): number {
  return typeof tx.toAmount === 'number' && Number.isFinite(tx.toAmount)
    ? tx.toAmount
    : tx.amount;
}

/**
 * Курс переказу — скільки одиниць валюти призначення дала одиниця валюти
 * джерела.
 *
 * `null` для однакових валют: курс 1 нікому нічого не каже, і показувати його
 * означало б засмічувати картку переказу цифрою без змісту. Однакові суми — і
 * є ознака однієї валюти: між різними валютами суми збігтися не можуть.
 */
export function transferRate(tx: Transaction): number | null {
  if (!isTransfer(tx)) return null;
  const to = creditedAmount(tx);
  // Нульове списання зробило б курс нескінченним.
  if (!tx.amount || !Number.isFinite(tx.amount)) return null;
  if (to === tx.amount) return null;
  return round(to / tx.amount);
}

/**
 * Сума операції як число. Сховище/синк інколи приносять рядок ("150") чи
 * від'ємне значення — рядок у `sum += tx.amount` склеївся б ("0150"), а
 * знак подвоїв би розбіжність між екранами. Напрям задає `type`, не знак.
 */
export function txAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/**
 * Кінець дня `now` — межа «вже відбулося». Операції з датою після неї
 * (заплановані, помилково датовані майбутнім) у поточний баланс НЕ входять.
 */
function endOfDay(now: Date): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function isFutureTx(tx: Transaction, cutoff: number | null): boolean {
  if (cutoff === null) return false;
  const t = new Date(tx.date).getTime();
  return Number.isFinite(t) && t > cutoff;
}

/**
 * З чого складається баланс рахунку — «Звідки ця сума».
 *
 *   balance = opening + income − expense + transfersIn − transfersOut
 *
 * `future` — чистий внесок операцій, датованих після `asOf` (у баланс НЕ
 * входить, показується окремо, щоб людина бачила, що їх відкладено).
 * Без `asOf` майбутні рахуються як звичайні (стара поведінка).
 */
export interface AccountBalanceBreakdown {
  opening: number;
  income: number;
  expense: number;
  transfersIn: number;
  transfersOut: number;
  future: number;
  futureCount: number;
  balance: number;
}

export function accountBalanceBreakdown(
  account: Account,
  txs: readonly Transaction[],
  options: { asOf?: Date } = {},
): AccountBalanceBreakdown {
  const opening = Number.isFinite(Number(account.openingBalance)) ? Number(account.openingBalance) : 0;
  const cutoff = options.asOf ? endOfDay(options.asOf) : null;
  const out = { opening, income: 0, expense: 0, transfersIn: 0, transfersOut: 0, future: 0, futureCount: 0 };

  for (const tx of txs) {
    let delta = 0;
    let bucket: 'income' | 'expense' | 'transfersIn' | 'transfersOut' | null = null;
    if (isTransfer(tx)) {
      // Обидві гілки навмисно НЕ виключають одна одну: переказ сам на себе
      // (наприклад, після помилкового вибору рахунку) мусить зійтися в нуль.
      const out1 = tx.accountId === account.id ? txAmount(tx.amount) : 0;
      const in1 = tx.toAccountId === account.id ? txAmount(creditedAmount(tx)) : 0;
      if (!out1 && !in1) continue;
      if (isFutureTx(tx, cutoff)) {
        out.future += in1 - out1;
        out.futureCount += 1;
        continue;
      }
      out.transfersOut += out1;
      out.transfersIn += in1;
      continue;
    }
    if (tx.accountId !== account.id) continue;
    if (tx.type === 'income') { delta = txAmount(tx.amount); bucket = 'income'; }
    else if (tx.type === 'expense') { delta = -txAmount(tx.amount); bucket = 'expense'; }
    else continue;
    if (isFutureTx(tx, cutoff)) {
      out.future += delta;
      out.futureCount += 1;
      continue;
    }
    out[bucket] += Math.abs(delta);
  }

  return {
    opening: round(out.opening),
    income: round(out.income),
    expense: round(out.expense),
    transfersIn: round(out.transfersIn),
    transfersOut: round(out.transfersOut),
    future: round(out.future),
    futureCount: out.futureCount,
    balance: round(out.opening + out.income - out.expense + out.transfersIn - out.transfersOut),
  };
}

/**
 * Баланс рахунку:
 *   openingBalance
 *     + доходи на цей рахунок
 *     − витрати з цього рахунку
 *     + зараховані перекази
 *     − списані перекази
 *
 * Перекази тут ВРАХОВУЮТЬСЯ (гроші справді переїхали), на відміну від
 * підсумків обороту, де їх нема. `asOf` — див. accountBalanceBreakdown.
 * Екрани беруть баланс НЕ звідси напряму, а з financeOverview
 * (utils/financeOverview.ts) — одне джерело для «Сьогодні» і «Фінансів».
 */
export function accountBalance(account: Account, txs: readonly Transaction[], options: { asOf?: Date } = {}): number {
  return accountBalanceBreakdown(account, txs, options).balance;
}

/**
 * Скільки треба поставити в «Початковий залишок», щоб баланс рахунку
 * дорівнював РЕАЛЬНОМУ залишку `actual` («Звірити з реальним залишком»).
 * Решта історії лишається як є — змінюється лише точка відліку.
 */
export function reconciledOpeningBalance(
  account: Account,
  txs: readonly Transaction[],
  actual: number,
  options: { asOf?: Date } = {},
): { opening: number; delta: number } {
  const b = accountBalanceBreakdown(account, txs, options);
  const history = b.balance - b.opening;
  return { opening: round(actual - history), delta: round(actual - b.balance) };
}

/** Рахунки, які ще в обігу. Архівні лишаються в історії, але не в виборі. */
export function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter(a => !a.archived);
}

/**
 * Групування за валютою — у цій фазі валюти не зводяться між собою, тож
 * кожна має власний список і власний підсумок.
 *
 * Архівні НЕ відсіюються тут навмисно: рішення, показувати їх чи ні, належить
 * екрану — сполучати з `activeAccounts`.
 */
export function accountsByCurrency(accounts: Account[]): Record<string, Account[]> {
  const out: Record<string, Account[]> = {};
  for (const a of accounts) {
    const code = a.currency || 'UAH';
    (out[code] ??= []).push(a);
  }
  return out;
}

export function accountById(accounts: Account[], id: string | undefined): Account | undefined {
  if (!id) return undefined;
  return accounts.find(a => a.id === id);
}

/**
 * Валюта операції. Джерело істини — рахунок; поле `currency` лишається
 * запасним варіантом для записів, створених до появи рахунків.
 */
export function resolveTxCurrency(tx: Transaction, accounts: Account[]): string {
  const account = accountById(accounts, tx.accountId);
  return account?.currency || txCurrency(tx);
}

/**
 * Який рахунок підставити у форму нової операції.
 *
 * Правило: останній використаний (якщо він ще активний) → перший активний
 * платіжний (готівка чи картка) → перший активний узагалі → null.
 *
 * Заощадження навмисно позаду платіжних: щоденна витрата йде з гаманця, і
 * підставити «Відпустка» означало б регулярно списувати з накопичень тим, хто
 * не перевірив підставлене значення.
 */
export function defaultAccountId(accounts: Account[], lastUsed?: string): string | null {
  const active = activeAccounts(accounts);
  if (!active.length) return null;
  if (lastUsed && active.some(a => a.id === lastUsed)) return lastUsed;
  const payable = active.find(a => a.kind !== 'savings');
  return (payable ?? active[0]).id;
}

/**
 * Куди можна перекласти операцію, позначаючи її переказом.
 *
 * ЛИШЕ рахунки тієї самої валюти. Курс минулого переказу ніде не записаний, а
 * `creditedAmount` за відсутності `toAmount` зараховує рівно списане число:
 * позначивши витрату 100 USD переказом на гривневу картку, користувач створив
 * би з повітря 100 UAH — і не побачив би цього, бо `transferRate` для рівних
 * сум мовчить. Різні валюти — це завжди ДВА числа, і взяти друге тут нізвідки.
 */
export function markTransferTargets(accounts: Account[], tx: Transaction): Account[] {
  const code = resolveTxCurrency(tx, accounts);
  return activeAccounts(accounts).filter(a => a.id !== tx.accountId && a.currency === code);
}

/**
 * Напрям переказу, на який перетворюють наявну операцію.
 *
 * Витрата з рахунку A → «з A на обраний». ДОХІД на рахунок A — навпаки: гроші
 * ПРИЙШЛИ на A, тож джерело — обраний рахунок, а A — призначення. Раніше
 * `accountId` завжди лишався джерелом, і позначений переказом дохід списував
 * гроші з A замість зарахування — баланс розʼїжджався на подвійну суму.
 */
export function markAsTransferAccounts(
  tx: Pick<Transaction, 'type' | 'accountId'>,
  targetId: string,
): { accountId: string; toAccountId: string } {
  return tx.type === 'income'
    ? { accountId: targetId, toAccountId: tx.accountId }
    : { accountId: tx.accountId, toAccountId: targetId };
}

/**
 * Імовірна «друга половина» старого переказу, записаного парою: операція
 * протилежного типу на ОБРАНОМУ рахунку, на ту саму суму й у тій самій
 * валюті, в межах ±1 календарного дня. Лише пропозиція — видаляє людина
 * (автоматично не можна: зарплата й покупка на ту саму суму теж збігаються).
 */
export function findTransferPairCandidate(
  txs: readonly Transaction[],
  tx: Transaction,
  targetId: string,
  accounts: Account[],
): Transaction | undefined {
  if (tx.type !== 'income' && tx.type !== 'expense') return undefined;
  const opposite = tx.type === 'income' ? 'expense' : 'income';
  const amount = txAmount(tx.amount);
  const code = resolveTxCurrency(tx, accounts);
  const at = new Date(tx.date);
  if (!Number.isFinite(at.getTime())) return undefined;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  let best: Transaction | undefined;
  let bestGap = Infinity;
  for (const t of txs) {
    if (t.id === tx.id || t.type !== opposite || t.accountId !== targetId) continue;
    if (txAmount(t.amount) !== amount || resolveTxCurrency(t, accounts) !== code) continue;
    const d = new Date(t.date);
    if (!Number.isFinite(d.getTime())) continue;
    if (Math.abs(Math.round((day(d) - day(at)) / 86400000)) > 1) continue;
    const gap = Math.abs(d.getTime() - at.getTime());
    if (gap < bestGap) { best = t; bestGap = gap; }
  }
  return best;
}

/**
 * Який рахунок підставити у форму правки операції, що лежить БЕЗ рахунку
 * (дані до міграції або запис, який прилетів синком із клієнта без рахунків).
 *
 * Валюта тут — обмеження, а не побажання: форма зберігає `currency` рахунку,
 * тож підставлений гаманець іншої валюти мовчки перетворив би витрату $100 на
 * ₴100 при першій же правці примітки. Немає рахунку потрібної валюти —
 * повертаємо null: хай користувач обере сам, свідомо.
 */
export function accountIdForLegacyTx(
  accounts: Account[],
  tx: Transaction,
  lastUsed?: string,
): string | null {
  const code = txCurrency(tx);
  return defaultAccountId(accounts.filter(a => a.currency === code), lastUsed);
}

/**
 * Список рахунків для запису у сховище: те, що тримає екран, ПЛЮС те, що є в
 * сховищі, але екран про нього не знає.
 *
 * Синхронізація дописує прилетілі рахунки прямо у сховище, повз React-стан
 * відкритого екрана. Запис самого лише стану `saveSynced` прочитав би як
 * «рахунок зник» і поставив би в outbox тумбстоун — рахунок зник би з сервера
 * й з усіх пристроїв, а транзакції, що на нього посилаються, лишилися б без
 * місця в балансі. Рахунки й так ніколи не видаляються — лише архівуються, —
 * тож відсутність у стані НІКОЛИ не означає видалення.
 */
export function mergeAccountsForSave(stored: Account[], next: Account[]): Account[] {
  const known = new Set(next.map(a => a.id));
  const extra = stored.filter(a => !known.has(a.id));
  return extra.length ? [...next, ...extra] : next;
}

/**
 * Округлення проти накопичення похибки float. 8 знаків вистачає криптовалюті
 * й нешкідливе для фіату (1.1 + 2.2 → 3.3000000000000003 → 3.3).
 */
function round(n: number): number {
  return Math.round(n * 1e8) / 1e8;
}
