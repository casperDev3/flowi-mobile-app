/**
 * utils/finance/recurring.ts — регулярні доходи (колекція `recurring_incomes`)
 * і перелік входжень будь-якого регулярного запису.
 *
 * flowi-web-app/docs/specs/finance-revamp.md §4.2. ДОСЛІВНИЙ ПОРТ
 * `flowi-web-app/lib/finance/recurring.ts` + мобільні доповнення внизу
 * (ключ сховища, генерація id).
 *
 * Регулярний дохід — дзеркало підписки в інший бік: те, що СТАНЕТЬСЯ. У
 * баланс він не входить; операцію `type='income'` створює лише «Отримано»
 * (`receiveRecurringIncome`). Зворотного посилання з операції на дохід немає.
 * Крок періоду й дати — ті самі функції, що в підписок (`addPeriod`).
 */
import type { Transaction } from '../financeUtils';
import {
  addPeriod,
  dateKeyAtTime,
  isDateKey,
  parseDateKey,
  totalsByCurrency,
  type CurrencyTotal,
  type PeriodUnit,
  type Subscription,
  type SubscriptionPeriod,
  type SubscriptionRenewal,
} from '../subscriptions';
import { uuidV4 } from '../uuid';

export const RECURRING_INCOMES_COLLECTION = 'recurring_incomes';

/** Форма запису. Мусить збігатися з вебовою ДО ПОЛЯ. */
export interface RecurringIncome {
  /** `ri-<uuid4>` — ВИПАДКОВИЙ; водночас local_id синку. */
  id: string;
  name: string;
  /** > 0, за ОДИН цикл. */
  amount: number;
  currency: string;
  period: SubscriptionPeriod;
  /** 'YYYY-MM-DD' — наступне очікуване надходження. */
  nextPaymentDate: string;
  /** 1..31 — «якір» дня місяця, з обрізанням до кінця місяця. */
  billingDay?: number;
  /** 'YYYY-MM-DD'; відсутнє — безстроково. */
  endDate?: string;
  /** Куди зазвичай приходить. Довідка для дії «Отримано». */
  accountId?: string;
  /** НАЗВА доходної категорії (як Transaction.category). */
  category?: string;
  /** Необов'язкове дзеркало `income:${category}`. */
  categoryId?: string;
  projectId?: string;
  /** Ім'я SF Symbol. */
  icon: string;
  /** '#RRGGBB'. */
  color: string;
  note?: string;
  /** Append-only. */
  history: SubscriptionRenewal[];
  /** ISO. Є — дохід в архіві. */
  archivedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_RECURRING_INCOME_ICON = 'briefcase.fill';
export const DEFAULT_RECURRING_INCOME_COLOR = '#10B981';

/** Мінімум регулярного запису, потрібний переліку входжень (підписка теж підходить). */
export interface RecurringLike {
  nextPaymentDate: string;
  period: SubscriptionPeriod;
  billingDay?: number;
  endDate?: string;
}

/** День місяця ключа (веб: `dayOfKey` у lib/subscriptions.ts). */
function dayOfKey(dateKey: string): number | undefined {
  return parseDateKey(dateKey)?.d;
}

function anchorOf(item: RecurringLike): number | undefined {
  return item.billingDay ?? dayOfKey(item.nextPaymentDate);
}

/**
 * Входження регулярного запису в [from; to] (обидві межі включно), починаючи
 * строго з `nextPaymentDate` і кроком `addPeriod` від якоря — те, що не дає
 * факту й прогнозу перетнутися (§6.4 «Подвійний облік»).
 */
export function occurrencesBetween(item: RecurringLike, from: string, to: string): string[] {
  if (!item || !isDateKey(item.nextPaymentDate) || !isDateKey(from) || !isDateKey(to)) return [];
  const out: string[] = [];
  const end = item.endDate && isDateKey(item.endDate) && item.endDate < to ? item.endDate : to;
  const anchor = anchorOf(item);
  let day = item.nextPaymentDate;
  for (let guard = 0; guard < 5000 && day <= end; guard += 1) {
    if (day >= from) out.push(day);
    const next = addPeriod(day, item.period, anchor);
    if (next <= day) break;
    day = next;
  }
  return out;
}

/** Перші `count` входжень від `nextPaymentDate` (з урахуванням `endDate`). */
export function nextOccurrences(item: RecurringLike, count: number): string[] {
  if (!item || !isDateKey(item.nextPaymentDate) || count <= 0) return [];
  const out: string[] = [];
  const anchor = anchorOf(item);
  let day = item.nextPaymentDate;
  while (out.length < count) {
    if (item.endDate && isDateKey(item.endDate) && day > item.endDate) break;
    out.push(day);
    const next = addPeriod(day, item.period, anchor);
    if (next <= day) break;
    day = next;
  }
  return out;
}

// ─── Стан і нормалізація ────────────────────────────────────────────────────

export type RecurringIncomeStatus = 'active' | 'overdue' | 'archived';

/** Те саме правило, що `subscriptionStatus`: сам день надходження — ще active. */
export function recurringIncomeStatus(item: RecurringIncome, today: string): RecurringIncomeStatus {
  if (item.archivedAt) return 'archived';
  if (item.endDate && item.endDate < today) return 'archived';
  if (item.nextPaymentDate < today) return 'overdue';
  return 'active';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeEvery(every: unknown): number {
  const n = Number(every);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function normalizeUnit(unit: unknown): PeriodUnit {
  return unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year' ? unit : 'month';
}

/**
 * Нормалізація на ЧИТАННЯ (нічого не пише). Невідомі поля зберігаються
 * (spread). Без назви або без валідної дати наступного надходження — null.
 */
export function normalizeRecurringIncome(raw: unknown): RecurringIncome | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!id || !name || !isDateKey(row.nextPaymentDate)) return null;
  const amount = Number(row.amount);
  const periodRaw = (row.period && typeof row.period === 'object' ? row.period : {}) as Record<string, unknown>;
  const billingDay = Number(row.billingDay);
  const history = Array.isArray(row.history)
    ? (row.history as unknown[]).filter(
        (item): item is SubscriptionRenewal =>
          Boolean(item) && typeof item === 'object'
          && typeof (item as SubscriptionRenewal).date === 'string'
          && Number.isFinite(Number((item as SubscriptionRenewal).amount)),
      )
    : [];
  return {
    ...(row as unknown as RecurringIncome),
    id,
    name,
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    currency: optionalString(row.currency) ?? 'UAH',
    period: { ...(periodRaw as object), every: normalizeEvery(periodRaw.every), unit: normalizeUnit(periodRaw.unit) },
    nextPaymentDate: row.nextPaymentDate as string,
    billingDay: Number.isInteger(billingDay) && billingDay >= 1 && billingDay <= 31 ? billingDay : undefined,
    endDate: isDateKey(row.endDate) ? (row.endDate as string) : undefined,
    icon: optionalString(row.icon) ?? DEFAULT_RECURRING_INCOME_ICON,
    color: optionalString(row.color) ?? DEFAULT_RECURRING_INCOME_COLOR,
    history,
    archivedAt: optionalString(row.archivedAt),
    createdAt: optionalString(row.createdAt) ?? '',
  };
}

export function normalizeRecurringIncomes(rows: readonly unknown[]): RecurringIncome[] {
  const out: RecurringIncome[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeRecurringIncome(row);
    if (item) out.push(item);
  }
  return out;
}

/** nextPaymentDate asc, назва, id — той самий порядок, що в підписок. */
export function sortRecurringIncomes(items: readonly RecurringIncome[]): RecurringIncome[] {
  return [...items].sort((a, b) => {
    if (a.nextPaymentDate !== b.nextPaymentDate) return a.nextPaymentDate < b.nextPaymentDate ? -1 : 1;
    const byName = a.name.localeCompare(b.name, 'uk');
    if (byName) return byName;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Місячний і річний еквівалент за валютами — ТА САМА `totalsByCurrency`, що в підписок (§9.5). */
export function recurringIncomeTotals(items: readonly RecurringIncome[], today: string): CurrencyTotal[] {
  return totalsByCurrency(
    items.map((item) => ({ ...item, reminderDaysBefore: 0 }) as unknown as Subscription),
    today,
  );
}

// ─── «Отримано» ─────────────────────────────────────────────────────────────

export interface ReceiveOptions {
  /** id нової операції — генерує платформа. */
  id: string;
  /** Рахунок зарахування; порожній — операція без рахунку. */
  accountId?: string;
  /** Валюта операції: валюта РАХУНКУ, якщо відома, інакше валюта доходу. */
  currency?: string;
  /** Сума, підтверджена в діалозі. */
  amount?: number;
  /** Категорія, коли в доході її не вказано. */
  fallbackCategory: string;
  now?: Date;
}

export interface ReceiveResult {
  income: RecurringIncome;
  transaction: Transaction;
}

/**
 * «Отримано» — операція `income` і новий цикл. Операція датується днем
 * ЦИКЛУ, який отримали (як «Оплачено» у підписок). Історія лише доповнюється.
 */
export function receiveRecurringIncome(item: RecurringIncome, opts: ReceiveOptions): ReceiveResult {
  const now = opts.now ?? new Date();
  const amount = typeof opts.amount === 'number' && Number.isFinite(opts.amount) && opts.amount > 0
    ? opts.amount
    : item.amount;
  const renewal: SubscriptionRenewal = {
    date: item.nextPaymentDate,
    amount,
    currency: item.currency,
    renewedAt: now.toISOString(),
  };
  const income: RecurringIncome = {
    ...item,
    amount,
    history: [...(Array.isArray(item.history) ? item.history : []), renewal],
    nextPaymentDate: addPeriod(item.nextPaymentDate, item.period, anchorOf(item)),
    updatedAt: now.toISOString(),
  };
  const transaction: Transaction = {
    id: opts.id,
    type: 'income',
    category: (item.category ?? '').trim() || opts.fallbackCategory,
    amount,
    note: item.name,
    date: dateKeyAtTime(item.nextPaymentDate, now),
    // Мобільний тип вимагає рядок: '' — «без рахунку», як у формі операції.
    accountId: opts.accountId || '',
    currency: opts.currency || item.currency,
    ...(item.projectId ? { projectId: item.projectId } : {}),
    updatedAt: now.toISOString(),
  };
  return { income, transaction };
}

// ─── Форма ──────────────────────────────────────────────────────────────────

export interface RecurringIncomeDraft {
  name: string;
  amount: string;
  currency: string;
  every: string;
  unit: PeriodUnit;
  nextPaymentDate: string;
  endDate: string;
  accountId: string;
  category: string;
  projectId: string;
  note: string;
}

export function recurringIncomeToDraft(
  item: RecurringIncome | null,
  defaults: { currency: string; today: string },
): RecurringIncomeDraft {
  if (!item) {
    return {
      name: '',
      amount: '',
      currency: defaults.currency,
      every: '1',
      unit: 'month',
      nextPaymentDate: defaults.today,
      endDate: '',
      accountId: '',
      category: '',
      projectId: '',
      note: '',
    };
  }
  return {
    name: item.name,
    amount: item.amount ? String(item.amount) : '',
    currency: item.currency,
    every: String(normalizeEvery(item.period?.every)),
    unit: normalizeUnit(item.period?.unit),
    nextPaymentDate: item.nextPaymentDate,
    endDate: item.endDate ?? '',
    accountId: item.accountId ?? '',
    category: item.category ?? '',
    projectId: item.projectId ?? '',
    note: item.note ?? '',
  };
}

/** Сума з поля форми (веб: `parseSubscriptionAmount`). */
function parseSubscriptionAmount(raw: string): number {
  const value = Number.parseFloat(String(raw ?? '').replace(',', '.').trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Перша помилка чернетки або null. Текст — як на вебі (українською);
 * мобільний UI показує замість нього власний перекладений рядок.
 */
export function recurringIncomeDraftError(draft: RecurringIncomeDraft): string | null {
  if (!draft.name.trim()) return 'Вкажіть назву';
  const amount = parseSubscriptionAmount(draft.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Вкажіть суму більшу за нуль';
  if (!draft.currency) return 'Оберіть валюту';
  const every = Number(draft.every);
  if (!Number.isInteger(every) || every < 1) return 'Період — ціле число від 1';
  if (!isDateKey(draft.nextPaymentDate)) return 'Вкажіть дату наступного надходження';
  if (draft.endDate && !isDateKey(draft.endDate)) return 'Некоректна дата завершення';
  if (draft.endDate && draft.endDate < draft.nextPaymentDate) {
    return 'Дата завершення раніша за наступне надходження';
  }
  return null;
}

/**
 * Запис із чернетки. `existing` спредиться першим — історія й поля інших
 * клієнтів зберігаються. Якір `billingDay` лишається, доки не змінили дату
 * наступного надходження. Викликати лише після `recurringIncomeDraftError === null`.
 */
export function buildRecurringIncome(
  draft: RecurringIncomeDraft,
  existing: RecurringIncome | null,
  opts: { id: string; now?: Date },
): RecurringIncome {
  const now = opts.now ?? new Date();
  const text = (value: string) => (value.trim() ? value.trim() : undefined);
  const category = text(draft.category);
  const keepAnchor = existing
    && existing.nextPaymentDate === draft.nextPaymentDate
    && Number.isInteger(existing.billingDay);
  return {
    ...(existing ?? {}),
    id: existing?.id ?? opts.id,
    name: draft.name.trim(),
    amount: parseSubscriptionAmount(draft.amount),
    currency: draft.currency,
    period: { ...(existing?.period ?? {}), every: normalizeEvery(draft.every), unit: normalizeUnit(draft.unit) },
    nextPaymentDate: draft.nextPaymentDate,
    billingDay: keepAnchor ? existing!.billingDay : dayOfKey(draft.nextPaymentDate),
    endDate: draft.endDate ? draft.endDate : undefined,
    accountId: draft.accountId || undefined,
    category,
    categoryId: category ? `income:${category}` : undefined,
    projectId: draft.projectId || undefined,
    icon: existing?.icon || DEFAULT_RECURRING_INCOME_ICON,
    color: existing?.color || DEFAULT_RECURRING_INCOME_COLOR,
    note: text(draft.note),
    history: Array.isArray(existing?.history) ? existing!.history : [],
    createdAt: existing?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** Новий id: `ri-<uuid4>`, ≤ 64 символів (межа local_id синку). */
export function recurringIncomeId(uuid: string): string {
  return `ri-${uuid}`;
}

// ─── Мобільні доповнення ────────────────────────────────────────────────────

/** Ключ AsyncStorage = назва колекції синку. */
export const RECURRING_INCOMES_KEY = RECURRING_INCOMES_COLLECTION;

/** `ri-<uuid4>` без нативної залежності (utils/uuid.ts). */
export function newRecurringIncomeId(): string {
  return recurringIncomeId(uuidV4());
}

/**
 * Запис для сховища без `undefined`-полів: JSON їх однаково викине, а
 * LWW-диф `saveSynced`/`updateSynced` порівнює обʼєкти й бачив би «зміну».
 */
export function compactRecord<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}
