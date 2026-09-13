/**
 * utils/subscriptions.ts — підписки (регулярні платежі): чиста логіка.
 *
 * Контракт даних спільний із вебом (CONTRACT.md §G): ті самі назви, та сама
 * семантика. Жодних залежностей від RN чи сховища — лише арифметика дат і
 * масивів, тож усе перевіряється unit-тестами (__tests__/subscriptions.test.ts).
 *
 * Головні інваріанти:
 *  - Підписка НІКОЛИ не створює фінансових операцій і не чіпає балансів.
 *    «Продовжено» лише зсуває дату наступної оплати на один період і дописує
 *    запис в історію.
 *  - Дати — ключі 'YYYY-MM-DD' у ЛОКАЛЬНОМУ календарі. Уся математика —
 *    цілочисельна Y/M/D (через Date.UTC лише як календар), без зсувів часових
 *    поясів і стрибків на переході літнього часу.
 *  - Історія append-only.
 */

// ─── Типи (G.1) ───────────────────────────────────────────────────────────────

export type PeriodUnit = 'day' | 'week' | 'month' | 'year';

export interface SubscriptionPeriod {
  /** Ціле ≥ 1. */
  every: number;
  unit: PeriodUnit;
}

export interface SubscriptionRenewal {
  /** 'YYYY-MM-DD' — дата оплати циклу, який продовжили (стара nextPaymentDate). */
  date: string;
  /** Скільки заплатили за цей цикл (редагується при продовженні). */
  amount: number;
  /** За замовчуванням — валюта підписки. */
  currency?: string;
  /** ISO-час натискання. */
  renewedAt?: string;
}

export interface Subscription {
  id: string;
  name: string;
  /** > 0, за один цикл. */
  amount: number;
  currency: string;
  period: SubscriptionPeriod;
  /** 'YYYY-MM-DD' (локальна дата). */
  nextPaymentDate: string;
  /** 1..31 — «якір» дня місяця для місячних/річних періодів. */
  billingDay?: number;
  /** 'YYYY-MM-DD'; відсутня = безстроково. */
  endDate?: string;
  /** 0 | 1 | 3 | 7; за замовчуванням 1. */
  reminderDaysBefore: number;
  projectId?: string;
  /** Назва SF Symbol. */
  icon: string;
  /** '#RRGGBB' */
  color: string;
  /** Назва категорії витрат (як Transaction.category). */
  category?: string;
  /** Необовʼязкове дзеркало id рядка categories: `expense:${name}`. */
  categoryId?: string;
  /** Лише посилання — баланси не змінюються. */
  accountId?: string;
  note?: string;
  url?: string;
  history: SubscriptionRenewal[];
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Константи ────────────────────────────────────────────────────────────────

export const REMINDER_DAY_OPTIONS = [0, 1, 3, 7] as const;
export const DEFAULT_REMINDER_DAYS = 1;
export const UNITS_PER_YEAR: Record<PeriodUnit, number> = { day: 365, week: 52, month: 12, year: 1 };
export const PERIOD_UNITS: readonly PeriodUnit[] = ['day', 'week', 'month', 'year'];

export const DEFAULT_SUBSCRIPTION_ICON = 'repeat';
export const DEFAULT_SUBSCRIPTION_COLOR = '#8B5CF6';

// ─── id ───────────────────────────────────────────────────────────────────────

let subscriptionSequence = 0;

/**
 * id ВИПАДКОВИЙ: природного ключа в підписки немає (дві «Netflix» у різних
 * валютах — справді дві підписки). Формат з контракту:
 * `sub-${Date.now().toString(36)}-${seq.toString(36)}-${rand8}` (≤ 64 символів).
 */
export function newSubscriptionId(now: number = Date.now()): string {
  subscriptionSequence = (subscriptionSequence + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `sub-${now.toString(36)}-${subscriptionSequence.toString(36)}-${rand}`;
}

// ─── Дати ─────────────────────────────────────────────────────────────────────

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function daysInMonth(year: number, month1to12: number): number {
  // День 0 наступного місяця = останній день потрібного. UTC — щоб не залежати від поясу.
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Розбирає ключ дати; null — якщо рядок не є реальною календарною датою. */
export function parseDateKey(dateKey: unknown): { y: number; m: number; d: number } | null {
  if (typeof dateKey !== 'string') return null;
  const match = DATE_KEY_RE.exec(dateKey);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isDateKey(value: unknown): value is string {
  return parseDateKey(value) !== null;
}

function formatKey(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

/** Локальний ключ дати з Date (як localDateKey у dateUtils, без залежності). */
export function dateKeyOf(date: Date): string {
  return formatKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function addDaysKey(dateKey: string, days: number): string {
  const p = parseDateKey(dateKey);
  if (!p || !Number.isFinite(days)) return dateKey;
  const at = new Date(Date.UTC(p.y, p.m - 1, p.d + Math.trunc(days)));
  return formatKey(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate());
}

/** toKey − fromKey у днях. Невалідний ключ → NaN. */
export function daysBetween(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  if (!a || !b) return NaN;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

function normalizeEvery(every: unknown): number {
  const n = typeof every === 'number' ? Math.floor(every) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Дата наступного циклу.
 * day: +every днів; week: +7·every; month/year: +every місяців/років, день =
 * min(billingDay ?? день(dateKey), днів у цільовому місяці). Так 31 січня →
 * 28/29 лютого → 31 березня (якір не «сповзає» після короткого місяця).
 * every < 1 чи NaN → 1. Невалідний dateKey повертається як є.
 */
export function addPeriod(dateKey: string, period: SubscriptionPeriod, billingDay?: number): string {
  const p = parseDateKey(dateKey);
  if (!p) return dateKey;
  const every = normalizeEvery(period?.every);
  const unit = period?.unit;
  if (unit === 'day') return addDaysKey(dateKey, every);
  if (unit === 'week') return addDaysKey(dateKey, 7 * every);
  // Невідома одиниця (бите значення з іншого клієнта) — трактуємо як місяць,
  // як і normalizeSubscription.
  const monthsToAdd = unit === 'year' ? 12 * every : every;
  const total = p.y * 12 + (p.m - 1) + monthsToAdd;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const anchor = typeof billingDay === 'number' && billingDay >= 1 && billingDay <= 31
    ? Math.floor(billingDay)
    : p.d;
  return formatKey(y, m, Math.min(anchor, daysInMonth(y, m)));
}

// ─── Статус ───────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'active' | 'overdue' | 'archived';

/**
 * archived — якщо є archivedAt АБО дата завершення вже минула;
 * overdue — дата оплати минула без продовження;
 * інакше active (сам день оплати — ще active).
 */
export function subscriptionStatus(sub: Subscription, today: string): SubscriptionStatus {
  if (sub.archivedAt) return 'archived';
  if (sub.endDate && isDateKey(sub.endDate) && sub.endDate < today) return 'archived';
  if (isDateKey(sub.nextPaymentDate) && sub.nextPaymentDate < today) return 'overdue';
  return 'active';
}

// ─── Дії ──────────────────────────────────────────────────────────────────────

function dayOfKey(dateKey: string): number | undefined {
  return parseDateKey(dateKey)?.d;
}

/** Один клік = один період. Фінансових операцій не створює. */
export function renewSubscription(sub: Subscription, opts?: { amount?: number; now?: Date }): Subscription {
  const now = opts?.now ?? new Date();
  const amount = typeof opts?.amount === 'number' && Number.isFinite(opts.amount) && opts.amount > 0
    ? opts.amount
    : sub.amount;
  const renewal: SubscriptionRenewal = {
    date: sub.nextPaymentDate,
    amount,
    currency: sub.currency,
    renewedAt: now.toISOString(),
  };
  return {
    ...sub,
    amount,
    history: [...(Array.isArray(sub.history) ? sub.history : []), renewal],
    nextPaymentDate: addPeriod(sub.nextPaymentDate, sub.period, sub.billingDay ?? dayOfKey(sub.nextPaymentDate)),
  };
}

export function archiveSubscription(sub: Subscription, now: Date = new Date()): Subscription {
  return { ...sub, archivedAt: now.toISOString() };
}

/** Прибирає archivedAt; якщо дата завершення вже минула — прибирає і її (інакше знову «архів»). */
export function restoreSubscription(sub: Subscription, today: string): Subscription {
  const { archivedAt: _archivedAt, ...rest } = sub;
  if (rest.endDate && rest.endDate < today) {
    const { endDate: _endDate, ...withoutEnd } = rest;
    return withoutEnd as Subscription;
  }
  return rest as Subscription;
}

// ─── Суми ─────────────────────────────────────────────────────────────────────

export function yearlyEquivalent(sub: Pick<Subscription, 'amount' | 'period'>): number {
  const amount = Number.isFinite(sub.amount) ? sub.amount : 0;
  const unit = sub.period?.unit;
  const perYear = unit && UNITS_PER_YEAR[unit] !== undefined ? UNITS_PER_YEAR[unit] : 12;
  return (amount * perYear) / normalizeEvery(sub.period?.every);
}

export function monthlyEquivalent(sub: Pick<Subscription, 'amount' | 'period'>): number {
  return yearlyEquivalent(sub) / 12;
}

export interface CurrencyTotal {
  currency: string;
  monthly: number;
  yearly: number;
}

/** Лише неархівні; без конвертації і без округлення. monthly desc, потім код валюти. */
export function totalsByCurrency(subs: readonly Subscription[], today: string): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const sub of subs) {
    if (subscriptionStatus(sub, today) === 'archived') continue;
    const currency = sub.currency || 'UAH';
    const row = map.get(currency) ?? { currency, monthly: 0, yearly: 0 };
    const yearly = yearlyEquivalent(sub);
    row.yearly += yearly;
    row.monthly += yearly / 12;
    map.set(currency, row);
  }
  return [...map.values()].sort((a, b) =>
    b.monthly - a.monthly || (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));
}

// ─── Списки ───────────────────────────────────────────────────────────────────

function compareText(a: string, b: string): number {
  return (a ?? '').localeCompare(b ?? '', 'uk');
}

function compareByDateNameId(a: Subscription, b: Subscription): number {
  if (a.nextPaymentDate !== b.nextPaymentDate) return a.nextPaymentDate < b.nextPaymentDate ? -1 : 1;
  const byName = compareText(a.name, b.name);
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortSubscriptions(subs: readonly Subscription[]): Subscription[] {
  return [...subs].sort(compareByDateNameId);
}

export interface UpcomingPayment {
  subscription: Subscription;
  daysUntil: number;
  status: 'active' | 'overdue';
}

/** Неархівні з nextPaymentDate ≤ today + withinDays (прострочені теж, daysUntil < 0). */
export function upcomingPayments(
  subs: readonly Subscription[],
  today: string,
  withinDays: number = 7,
): UpcomingPayment[] {
  const limit = addDaysKey(today, withinDays);
  const out: UpcomingPayment[] = [];
  for (const sub of sortSubscriptions(subs)) {
    const status = subscriptionStatus(sub, today);
    if (status === 'archived') continue;
    if (!isDateKey(sub.nextPaymentDate) || sub.nextPaymentDate > limit) continue;
    out.push({ subscription: sub, daysUntil: daysBetween(today, sub.nextPaymentDate), status });
  }
  return out;
}

export function subscriptionsForProject(subs: readonly Subscription[], projectId: string): Subscription[] {
  return sortSubscriptions(subs.filter(sub => !!projectId && sub.projectId === projectId));
}

// ─── Підписи ──────────────────────────────────────────────────────────────────

/** Українська множина: 1 / 2-4 / 5+ (11-14 → «багато»). */
export function ukPluralIndex(n: number): 0 | 1 | 2 {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

const UK_EVERY_ONE: Record<PeriodUnit, string> = {
  day: 'щодня', week: 'щотижня', month: 'щомісяця', year: 'щороку',
};
const UK_UNIT_FORMS: Record<PeriodUnit, [string, string, string]> = {
  day: ['день', 'дні', 'днів'],
  week: ['тиждень', 'тижні', 'тижнів'],
  month: ['місяць', 'місяці', 'місяців'],
  year: ['рік', 'роки', 'років'],
};
const EN_EVERY_ONE: Record<PeriodUnit, string> = {
  day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly',
};
const EN_UNIT: Record<PeriodUnit, string> = { day: 'days', week: 'weeks', month: 'months', year: 'years' };

/** Множинна форма одиниці для поля «кожні N …». */
export function periodUnitLabel(unit: PeriodUnit, every: number, lang: 'uk' | 'en' = 'uk'): string {
  if (lang === 'en') return every === 1 ? EN_UNIT[unit].slice(0, -1) : EN_UNIT[unit];
  return UK_UNIT_FORMS[unit][ukPluralIndex(every)];
}

/** «щомісяця» (every 1) / «кожні 3 місяці». `lang` — для англійського інтерфейсу застосунку. */
export function formatPeriod(period: SubscriptionPeriod, lang: 'uk' | 'en' = 'uk'): string {
  const unit: PeriodUnit = PERIOD_UNITS.includes(period?.unit) ? period.unit : 'month';
  const every = normalizeEvery(period?.every);
  if (lang === 'en') return every === 1 ? EN_EVERY_ONE[unit] : `every ${every} ${EN_UNIT[unit]}`;
  if (every === 1) return UK_EVERY_ONE[unit];
  return `кожні ${every} ${UK_UNIT_FORMS[unit][ukPluralIndex(every)]}`;
}

// ─── Нормалізація при читанні ─────────────────────────────────────────────────

/**
 * Приводить сирий запис зі сховища до форми Subscription. READ-TIME:
 * нічого не пише, невідомі поля (від новіших клієнтів) зберігає через spread.
 *
 * null — якщо запис непридатний для показу: немає id, порожня назва або
 * nextPaymentDate не є валідною датою. Правило ТОЧНО як у вебі
 * (lib/subscriptions.ts normalizeSubscription), щоб телефон і браузер
 * показували однаковий список і однакові суми. Сирий запис у сховищі
 * лишається як є (mutateSubscriptions пропускає нерозпізнані елементи без змін).
 *
 * Нормалізовані значення НЕ пишуться назад: запис іде через
 * mergeSubscriptionWrite, який бере сирі значення для всього, що дія не змінила.
 */
export function normalizeSubscription(raw: unknown): Subscription | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name || !isDateKey(r.nextPaymentDate)) return null;
  const periodRaw = (r.period && typeof r.period === 'object' ? r.period : {}) as Record<string, unknown>;
  const unit = PERIOD_UNITS.includes(periodRaw.unit as PeriodUnit) ? (periodRaw.unit as PeriodUnit) : 'month';
  const amountNum = typeof r.amount === 'number' ? r.amount : Number(r.amount);
  const amount = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0;
  const reminder = typeof r.reminderDaysBefore === 'number' && Number.isFinite(r.reminderDaysBefore) && r.reminderDaysBefore >= 0
    ? Math.floor(r.reminderDaysBefore)
    : DEFAULT_REMINDER_DAYS;
  const history = Array.isArray(r.history)
    ? (r.history as unknown[]).filter((h): h is SubscriptionRenewal =>
        !!h && typeof h === 'object'
        && typeof (h as SubscriptionRenewal).date === 'string'
        && Number.isFinite(Number((h as SubscriptionRenewal).amount)))
    : [];
  const created = typeof r.createdAt === 'string' ? r.createdAt : '';
  const out: Record<string, unknown> = {
    ...(r as object),
    id: r.id,
    name,
    amount,
    currency: typeof r.currency === 'string' && r.currency ? r.currency : 'UAH',
    period: { ...(periodRaw as object), every: normalizeEvery(periodRaw.every), unit },
    nextPaymentDate: r.nextPaymentDate as string,
    reminderDaysBefore: reminder,
    icon: typeof r.icon === 'string' && r.icon ? r.icon : DEFAULT_SUBSCRIPTION_ICON,
    color: typeof r.color === 'string' && r.color ? r.color : DEFAULT_SUBSCRIPTION_COLOR,
    history,
    createdAt: created,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : created,
  };
  // Биті необовʼязкові поля — як відсутні (веб: undefined). Лише в копії для показу.
  if (!(typeof r.billingDay === 'number' && Number.isInteger(r.billingDay) && r.billingDay >= 1 && r.billingDay <= 31)) {
    delete out.billingDay;
  }
  if (!isDateKey(r.endDate)) delete out.endDate;
  if (!(typeof r.archivedAt === 'string' && r.archivedAt.trim())) delete out.archivedAt;
  return out as unknown as Subscription;
}

export function normalizeSubscriptions(raw: unknown): Subscription[] {
  if (!Array.isArray(raw)) return [];
  const out: Subscription[] = [];
  for (const item of raw) {
    const sub = normalizeSubscription(item);
    if (sub) out.push(sub);
  }
  return out;
}

// ─── Нагадування (G.4) ────────────────────────────────────────────────────────

export interface SubscriptionReminderSpec {
  id: string;
  kind: 'before' | 'due' | 'overdue' | 'end';
  /** Разове нагадування. */
  fireAt?: Date;
  /** Щоденне повторюване. */
  daily?: { hour: number; minute: number };
}

function atHour(dateKey: string, hour: number): Date | null {
  const p = parseDateKey(dateKey);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d, hour, 0, 0, 0);
}

/**
 * План локальних нагадувань для однієї підписки. Нічого не планує саме —
 * лише описує; планувальник у store/notifications.ts.
 *  - архівна → [];
 *  - прострочена → щоденне о `hour`:00, доки не продовжать/архівують/видалять;
 *  - інакше: за N днів до оплати (якщо N > 0) і в день оплати, лише в майбутньому,
 *    плюс разові «Прострочено» на +K днів для K з OVERDUE_FOLLOWUP_OFFSETS (id `…_overdue_K`);
 *  - дата завершення → за 7 днів до неї.
 */
export function subscriptionReminderPlan(sub: Subscription, now: Date, hour: number = 9): SubscriptionReminderSpec[] {
  const today = dateKeyOf(now);
  const status = subscriptionStatus(sub, today);
  if (status === 'archived') return [];
  const plan: SubscriptionReminderSpec[] = [];
  if (status === 'overdue') {
    plan.push({ id: `sub_${sub.id}_overdue`, kind: 'overdue', daily: { hour, minute: 0 } });
  } else {
    const days = Number.isFinite(sub.reminderDaysBefore) ? Math.max(0, Math.floor(sub.reminderDaysBefore)) : 0;
    if (days > 0) {
      const before = atHour(addDaysKey(sub.nextPaymentDate, -days), hour);
      if (before && before.getTime() > now.getTime()) {
        plan.push({ id: `sub_${sub.id}_before`, kind: 'before', fireAt: before });
      }
    }
    const due = atHour(sub.nextPaymentDate, hour);
    if (due && due.getTime() > now.getTime()) {
      plan.push({ id: `sub_${sub.id}_due`, kind: 'due', fireAt: due });
    }
    // «Прострочено» наперед: щоденний DAILY ставиться лише коли статус уже
    // overdue на момент планування, а застосунок після дня оплати можуть і не
    // відкрити. Тож разові нагадування на +1..+N днів після оплати. Щойно
    // підписка стане простроченою, план замінить їх на DAILY, а ці id
    // скасуються як застарілі. Не пізніше дати завершення (далі — архів).
    const endKey = sub.endDate && isDateKey(sub.endDate) ? sub.endDate : null;
    for (const k of OVERDUE_FOLLOWUP_OFFSETS) {
      const key = addDaysKey(sub.nextPaymentDate, k);
      if (endKey && key > endKey) break;
      const at = atHour(key, hour);
      if (at && at.getTime() > now.getTime()) {
        plan.push({ id: `sub_${sub.id}_overdue_${k}`, kind: 'overdue', fireAt: at });
      }
    }
  }
  if (sub.endDate && isDateKey(sub.endDate)) {
    const end = atHour(addDaysKey(sub.endDate, -7), hour);
    if (end && end.getTime() > now.getTime()) {
      plan.push({ id: `sub_${sub.id}_end`, kind: 'end', fireAt: end });
    }
  }
  return plan;
}

export const SUBSCRIPTION_NOTIFICATION_PREFIX = 'sub_';

/**
 * На які дні після дати оплати наперед плануються разові «Прострочено».
 * Лише два: щойно застосунок відкриють після дня оплати, план замінить їх
 * щоденним DAILY. Так одна підписка займає не більше 4 слотів ОС
 * (before + due + 2 follow-up; end — рідко й окремо).
 */
export const OVERDUE_FOLLOWUP_OFFSETS: readonly number[] = [1, 3];
/** Разові нагадування плануються лише в цьому вікні; далі — при наступній синхронізації. */
export const SUBSCRIPTION_REMINDER_HORIZON_DAYS = 35;
/**
 * Стеля нагадувань підписок в ОС. iOS тримає лише 64 найближчі локальні
 * нотифікації й мовчки відкидає решту — підписки не мають витісняти нагадування
 * задач, зустрічей і здоровʼя.
 */
export const MAX_SUBSCRIPTION_REMINDERS = 20;
/** iOS тримає не більше стількох запланованих локальних нотифікацій застосунку. */
export const IOS_PENDING_NOTIFICATION_LIMIT = 64;
/** Запас слотів під нагадування, які інші екрани поставлять пізніше. */
export const RESERVED_NOTIFICATION_SLOTS = 10;

/**
 * Скільки нагадувань підписок можна запланувати, не витісняючи чужих.
 *
 * iOS мовчки відкидає все понад 64 найближчі нотифікації, тож фіксована стеля
 * не захищає: на пристрої з 50 далекими нагадуваннями задач 20 найближчих
 * разових від підписок витіснили б саме їх. Тому бюджет рахується від того,
 * скільки ВЖЕ заплановано іншими (`othersPending` — без `sub_…`), із запасом.
 * Android такої межі не має — лише звичайна стеля. `othersPending` невідомий
 * (null) → звичайна стеля, як і раніше.
 */
export function subscriptionReminderBudget(platform: string, othersPending: number | null): number {
  if (platform !== 'ios' || othersPending == null || !Number.isFinite(othersPending)) {
    return MAX_SUBSCRIPTION_REMINDERS;
  }
  return Math.max(0, Math.min(
    MAX_SUBSCRIPTION_REMINDERS,
    IOS_PENDING_NOTIFICATION_LIMIT - Math.max(0, othersPending) - RESERVED_NOTIFICATION_SLOTS,
  ));
}

/**
 * Обмежує обʼєднаний план усіх підписок: щоденні (прострочені) — першими;
 * разові — лише майбутні в межах вікна horizonDays, найближчі першими
 * (за часом, потім id); усього не більше max. Кореневий ефект перезапускає
 * планування на старті, на зміну сховища і при поверненні в застосунок, тож
 * дальші нагадування доплануються, коли потраплять у вікно.
 */
export function limitSubscriptionReminders<T extends SubscriptionReminderSpec>(
  specs: readonly T[],
  now: Date,
  opts: { horizonDays?: number; max?: number } = {},
): T[] {
  const horizonDays = opts.horizonDays ?? SUBSCRIPTION_REMINDER_HORIZON_DAYS;
  const max = Math.max(0, opts.max ?? MAX_SUBSCRIPTION_REMINDERS);
  const nowMs = now.getTime();
  const limitMs = nowMs + horizonDays * DAY_MS;
  const byId = (a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const daily = specs.filter(s => !!s.daily).sort(byId);
  const oneShots = specs
    .filter(s => !s.daily && s.fireAt instanceof Date
      && s.fireAt.getTime() > nowMs && s.fireAt.getTime() <= limitMs)
    .sort((a, b) => a.fireAt!.getTime() - b.fireAt!.getTime() || byId(a, b));
  return [...daily, ...oneShots].slice(0, max);
}

// ─── Форматування для показу ──────────────────────────────────────────────────

export interface CurrencyLike {
  code: string;
  symbol: string;
  kind?: 'fiat' | 'crypto';
  decimals?: number;
}

/**
 * Сума підписки з валютою. На відміну від formatCurrency у financeUtils копійки
 * НЕ відкидаються для фіату: $9.99 — це не $10, а саме за ціною підписку і
 * звіряють. Нулі в дробовій частині не показуються (₴450, а не ₴450,00).
 */
export function formatSubscriptionMoney(
  amount: number,
  code: string,
  currencies: readonly CurrencyLike[],
  locale: string,
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const cur = currencies.find(c => c.code === code);
  const kind = cur?.kind ?? 'fiat';
  const decimals = Math.max(0, Math.min(kind === 'fiat' ? 2 : 8, cur?.decimals ?? 2));
  if (kind === 'fiat') {
    try {
      return value.toLocaleString(locale, {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      });
    } catch {
      // невідомий ISO-код (власна валюта) — нижче, через символ
    }
  }
  let formatted: string;
  try {
    formatted = value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  } catch {
    formatted = String(Math.round(value * 100) / 100);
  }
  return cur?.symbol ? `${cur.symbol}${kind === 'fiat' ? '' : ' '}${formatted}` : `${formatted} ${code}`;
}

/** 'YYYY-MM-DD' → «20 вересня» (або з роком, якщо рік не поточний). */
export function formatDateKey(dateKey: string, locale: string, now: Date = new Date()): string {
  const p = parseDateKey(dateKey);
  if (!p) return dateKey || '—';
  const date = new Date(p.y, p.m - 1, p.d);
  try {
    return date.toLocaleDateString(locale, p.y === now.getFullYear()
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateKey;
  }
}

/** «$32/міс · ₴450/міс» — рядок підсумків (без конвертації валют). */
export function formatTotalsLine(
  totals: readonly CurrencyTotal[],
  field: 'monthly' | 'yearly',
  suffix: string,
  currencies: readonly CurrencyLike[],
  locale: string,
): string {
  return totals
    .map(row => `${formatSubscriptionMoney(row[field], row.currency, currencies, locale)}${suffix}`)
    .join(' · ');
}

// ─── Форма: чернетка ⇄ запис ──────────────────────────────────────────────────

export interface SubscriptionDraft {
  name: string;
  /** Як набрано: кома теж дозволена. */
  amount: string;
  currency: string;
  every: string;
  unit: PeriodUnit;
  nextPaymentDate: string;
  /** null — безстроково. */
  endDate: string | null;
  reminderDaysBefore: number;
  projectId: string | null;
  icon: string;
  color: string;
  category: string | null;
  accountId: string | null;
  note: string;
  url: string;
}

export function emptySubscriptionDraft(opts: {
  today: string;
  currency: string;
  projectId?: string | null;
}): SubscriptionDraft {
  return {
    name: '',
    amount: '',
    currency: opts.currency || 'UAH',
    every: '1',
    unit: 'month',
    nextPaymentDate: opts.today,
    endDate: null,
    reminderDaysBefore: DEFAULT_REMINDER_DAYS,
    projectId: opts.projectId ?? null,
    icon: DEFAULT_SUBSCRIPTION_ICON,
    color: DEFAULT_SUBSCRIPTION_COLOR,
    category: null,
    accountId: null,
    note: '',
    url: '',
  };
}

export function draftFromSubscription(sub: Subscription): SubscriptionDraft {
  return {
    name: sub.name ?? '',
    amount: Number.isFinite(sub.amount) && sub.amount > 0 ? String(sub.amount) : '',
    currency: sub.currency || 'UAH',
    every: String(normalizeEvery(sub.period?.every)),
    unit: PERIOD_UNITS.includes(sub.period?.unit) ? sub.period.unit : 'month',
    nextPaymentDate: sub.nextPaymentDate ?? '',
    endDate: sub.endDate ?? null,
    reminderDaysBefore: Number.isFinite(sub.reminderDaysBefore) ? sub.reminderDaysBefore : DEFAULT_REMINDER_DAYS,
    projectId: sub.projectId ?? null,
    icon: sub.icon || DEFAULT_SUBSCRIPTION_ICON,
    color: sub.color || DEFAULT_SUBSCRIPTION_COLOR,
    category: sub.category ?? null,
    accountId: sub.accountId ?? null,
    note: sub.note ?? '',
    url: sub.url ?? '',
  };
}

/** '12,50' → 12.5; порожнє/бите → NaN. */
export function parseAmountInput(input: string): number {
  const cleaned = String(input ?? '').replace(/\s/g, '').replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return NaN;
  return parseFloat(cleaned);
}

export type SubscriptionDraftError = 'invalid' | 'endBeforeNext';

/**
 * Застосовує чернетку форми.
 *
 * Правка СПРЕДИТЬ наявний запис: поля, про які ця форма не знає (від новішого
 * клієнта), історія продовжень, archivedAt і createdAt лишаються як були.
 * Очищені необовʼязкові поля ВИДАЛЯЮТЬСЯ з обʼєкта (а не пишуться порожніми).
 *
 * billingDay: при створенні — день обраної дати; при правці — лише коли дату
 * змінили або якоря ще не було (інакше «31» після лютого з'їхав би на «28»).
 */
export function applySubscriptionDraft(
  existing: Subscription | null,
  draft: SubscriptionDraft,
  opts: { now: Date; newId?: () => string },
): { ok: true; subscription: Subscription } | { ok: false; error: SubscriptionDraftError } {
  const name = draft.name.trim();
  const amount = parseAmountInput(draft.amount);
  const everyRaw = parseInt(String(draft.every).trim(), 10);
  if (!name || !Number.isFinite(amount) || amount <= 0 || !isDateKey(draft.nextPaymentDate)) {
    return { ok: false, error: 'invalid' };
  }
  if (!Number.isFinite(everyRaw) || everyRaw < 1 || everyRaw > 999) return { ok: false, error: 'invalid' };
  if (draft.endDate !== null && !isDateKey(draft.endDate)) return { ok: false, error: 'invalid' };
  if (draft.endDate !== null && draft.endDate < draft.nextPaymentDate) return { ok: false, error: 'endBeforeNext' };
  const unit: PeriodUnit = PERIOD_UNITS.includes(draft.unit) ? draft.unit : 'month';
  const nowIso = opts.now.toISOString();
  const nextDay = parseDateKey(draft.nextPaymentDate)!.d;

  const base: Record<string, unknown> = existing ? { ...existing } : {};
  const billingDay = existing && existing.nextPaymentDate === draft.nextPaymentDate && typeof existing.billingDay === 'number'
    ? existing.billingDay
    : nextDay;
  const reminder = Number.isFinite(draft.reminderDaysBefore) && draft.reminderDaysBefore >= 0
    ? Math.floor(draft.reminderDaysBefore)
    : DEFAULT_REMINDER_DAYS;

  const next: Record<string, unknown> = {
    ...base,
    id: existing?.id ?? (opts.newId ?? newSubscriptionId)(),
    name,
    amount,
    currency: draft.currency || 'UAH',
    period: { ...(existing?.period ?? {}), every: everyRaw, unit },
    nextPaymentDate: draft.nextPaymentDate,
    billingDay,
    reminderDaysBefore: reminder,
    icon: draft.icon || DEFAULT_SUBSCRIPTION_ICON,
    color: draft.color || DEFAULT_SUBSCRIPTION_COLOR,
    history: Array.isArray(existing?.history) ? existing!.history : [],
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const setOrDelete = (key: string, value: string | null | undefined) => {
    const v = typeof value === 'string' ? value.trim() : value;
    if (v) next[key] = v;
    else delete next[key];
  };
  setOrDelete('endDate', draft.endDate);
  setOrDelete('projectId', draft.projectId);
  setOrDelete('accountId', draft.accountId);
  setOrDelete('note', draft.note);
  setOrDelete('url', draft.url);
  const category = draft.category?.trim() || null;
  setOrDelete('category', category);
  setOrDelete('categoryId', category ? `expense:${category}` : null);

  return { ok: true, subscription: next as unknown as Subscription };
}

/** Поля чернетки форми (для зливання з даними, що прийшли синком). */
const DRAFT_FIELDS: readonly (keyof SubscriptionDraft)[] = [
  'name', 'amount', 'currency', 'every', 'unit', 'nextPaymentDate', 'endDate', 'reminderDaysBefore',
  'projectId', 'icon', 'color', 'category', 'accountId', 'note', 'url',
];

/**
 * Перебазовує чернетку форми на СВІЖИЙ запис. Поки форма відкрита, синк міг
 * змінити підписку (наприклад, на вебі натиснули «Продовжено»). Для кожного
 * поля: якщо користувач його не чіпав (edited === original) — береться свіже
 * значення, інакше — те, що ввів користувач. Так збереження форми не відкочує
 * продовження (дату/суму), а billingDay не перераховується з застарілої дати.
 */
export function rebaseSubscriptionDraft(
  original: SubscriptionDraft,
  edited: SubscriptionDraft,
  fresh: SubscriptionDraft,
): SubscriptionDraft {
  const out = { ...edited } as Record<string, unknown>;
  for (const field of DRAFT_FIELDS) {
    if (edited[field] === original[field]) out[field] = fresh[field];
  }
  return out as unknown as SubscriptionDraft;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter(k => ao[k] !== undefined);
  const bk = Object.keys(bo).filter(k => bo[k] !== undefined);
  return ak.length === bk.length && ak.every(k => Object.prototype.hasOwnProperty.call(bo, k) && deepEqual(ao[k], bo[k]));
}

/**
 * Що саме записати в сховище після дії над нормалізованою копією.
 *
 * normalizeSubscription підставляє значення за замовчуванням і відфільтровує
 * записи історії у формі, якої ця збірка не знає. Якщо писати нормалізований
 * обʼєкт, дія (продовження, архів, відновлення, правка) назавжди стерла б те,
 * що записав інший чи новіший клієнт. Тому:
 *  - основа — СИРИЙ запис (усі його поля лишаються);
 *  - поле, яке дія не змінила (updated[key] глибоко дорівнює normalized[key]),
 *    лишається сирим — нормалізоване значення назад не пишеться;
 *  - змінене поле пишеться; поле, яке дія прибрала (restore → archivedAt), видаляється;
 *  - history append-only: до СИРОЇ історії дописуються лише нові записи
 *    (updated.history понад довжину normalized.history).
 */
export function mergeSubscriptionWrite(
  raw: Record<string, unknown>,
  normalized: Subscription,
  updated: Subscription,
): Record<string, unknown> {
  const n = normalized as unknown as Record<string, unknown>;
  const u = updated as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };
  for (const key of Object.keys(n)) {
    if (!(key in u)) delete out[key];
  }
  for (const key of Object.keys(u)) {
    if (key === 'history') continue;
    if (key in n && deepEqual(n[key], u[key])) continue;
    if (u[key] === undefined) delete out[key];
    else out[key] = u[key];
  }
  const nHistory = Array.isArray(normalized.history) ? normalized.history : [];
  const uHistory = Array.isArray(updated.history) ? updated.history : [];
  if (uHistory !== nHistory && !deepEqual(uHistory, nHistory)) {
    const rawHistory = Array.isArray(raw.history) ? (raw.history as unknown[]) : [];
    const added = uHistory.length > nHistory.length ? uHistory.slice(nHistory.length) : [];
    out.history = [...rawHistory, ...added];
  }
  return out;
}

/** Адреса для відкриття: без схеми — https://. Небезпечні схеми відкидаються. */
export function subscriptionLink(url: string | undefined): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return `https://${trimmed}`;
}
