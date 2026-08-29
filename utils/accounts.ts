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
 * Баланс рахунку:
 *   openingBalance
 *     + доходи на цей рахунок
 *     − витрати з цього рахунку
 *     + зараховані перекази
 *     − списані перекази
 *
 * Перекази тут ВРАХОВУЮТЬСЯ (гроші справді переїхали), на відміну від
 * підсумків обороту, де їх нема.
 */
export function accountBalance(account: Account, txs: Transaction[]): number {
  let sum = Number.isFinite(account.openingBalance) ? account.openingBalance : 0;

  for (const tx of txs) {
    if (isTransfer(tx)) {
      // Обидві гілки навмисно НЕ виключають одна одну: переказ сам на себе
      // (наприклад, після помилкового вибору рахунку) мусить зійтися в нуль,
      // а не списати чи зарахувати суму однобічно.
      if (tx.accountId === account.id) sum -= tx.amount;
      if (tx.toAccountId === account.id) sum += creditedAmount(tx);
      continue;
    }
    if (tx.accountId !== account.id) continue;
    if (tx.type === 'income') sum += tx.amount;
    else if (tx.type === 'expense') sum -= tx.amount;
  }

  return round(sum);
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
