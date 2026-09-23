/**
 * utils/finance/forecast.ts — прогноз балансу на 30 і 90 днів.
 *
 * flowi-web-app/docs/specs/finance-revamp.md §6.2–§6.5. ДОСЛІВНИЙ ПОРТ
 * `flowi-web-app/lib/finance/forecast.ts`.
 *
 *   balance(today) = opening + Σ events(today)
 *   balance(d)     = balance(d−1) + Σ events(d) − avgDailyVariable
 *   shortfall      = перший d, де balance(d) < 0
 *
 * `opening` — баланс активних рахунків валюти на кінець сьогодні
 * (= overview.totalByCurrency[C]). Сьогоднішні події (прострочене, перенесене
 * на сьогодні) входять у сьогоднішню точку; середні змінні за сьогодні НЕ
 * віднімаються — сьогоднішні витрати вже частково є у факті.
 *
 * Прогноз — ЗАВЖДИ в ракурсі «Всі» (§3.2). Горизонти 30 і 90 будує той самий код.
 */
import { activeAccounts, type Account } from '../accounts';
import type { Transaction } from '../financeUtils';
import { addDaysKey, dateKeyOf, isDateKey, type Subscription } from '../subscriptions';
import { buildCategoryIndex } from './classify';
import { balanceAtEndOf, balanceContribution } from './cashflow';
import { localDayKey } from './period';
import { amountOf, isTransferType, resolveTxCurrency, round, sortedByDateId } from './pnl';
import { occurrencesBetween, type RecurringIncome } from './recurring';

export type ForecastKind = 'subscription' | 'recurring_income' | 'planned_tx' | 'variable';

export interface ForecastEvent {
  day: string;
  kind: ForecastKind;
  /** Додатнє — надходження, від'ємне — списання. */
  amount: number;
  label: string;
  sourceId?: string;
  /** Підписка/дохід, чий цикл уже прострочено; подія переноситься на сьогодні. */
  overdue?: boolean;
}

export interface ForecastPoint {
  day: string;
  balance: number;
  events: ForecastEvent[];
}

export interface CashflowForecast {
  horizonDays: 30 | 90;
  currency: string;
  /** Баланс активних рахунків валюти на кінець сьогоднішнього дня. */
  opening: number;
  points: ForecastPoint[];
  /** Прогноз на кінець горизонту. */
  closing: number;
  avgDailyVariable: number;
  basis: 'ok' | 'thin';
  /** Перший день, коли баланс іде в мінус, і баланс того дня. null — не йде. */
  shortfall: { day: string; balance: number } | null;
  /** Найнижча точка горизонту (може бути додатною). */
  lowest: { day: string; balance: number };
}

/** Вікно середніх — 90 ПОВНИХ днів перед сьогодні. */
export const VARIABLE_WINDOW_DAYS = 90;
/** Менше історії — `basis: 'thin'`, UI пише «мало даних». */
export const THIN_HISTORY_DAYS = 30;

export interface AvgDailyVariable {
  value: number;
  basis: 'ok' | 'thin';
  /** Сума змінних витрат у вікні (до ділення). */
  total: number;
}

interface CommonInput {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  categories: readonly unknown[];
  subscriptions: readonly Subscription[];
  currency: string;
  primary: string;
  now: Date;
}

/**
 * Середні змінні витрати на день (§6.3):
 *   window = [today − 90; today − 1]; value = round(Σ amountOf(tx) / 90)
 * Ділиться на 90 ЗАВЖДИ. Історія коротша за 30 днів → `basis: 'thin'`.
 */
export function avgDailyVariable(input: CommonInput): AvgDailyVariable {
  const today = dateKeyOf(input.now);
  const from = addDaysKey(today, -VARIABLE_WINDOW_DAYS);
  const to = addDaysKey(today, -1);
  const index = buildCategoryIndex(input.categories, input.subscriptions);
  let total = 0;
  let first: string | null = null;
  for (const tx of sortedByDateId(input.transactions)) {
    if (!tx || isTransferType(tx)) continue;
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    if (resolveTxCurrency(tx, input.accounts, input.primary) !== input.currency) continue;
    const day = localDayKey(tx.date);
    if (!day) continue;
    if (first === null || day < first) first = day;
    if (tx.type !== 'expense' || day < from || day > to) continue;
    if (index.meta('expense', tx.category).cost !== 'variable') continue;
    total += amountOf(tx);
  }
  const thin = first === null || first > addDaysKey(today, -THIN_HISTORY_DAYS);
  return { value: round(total / VARIABLE_WINDOW_DAYS), basis: thin ? 'thin' : 'ok', total: round(total) };
}

const KIND_ORDER: Record<ForecastKind, number> = {
  planned_tx: 0,
  subscription: 1,
  recurring_income: 2,
  variable: 3,
};

function compareEvents(a: ForecastEvent, b: ForecastEvent): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
    || ((a.sourceId ?? '') < (b.sourceId ?? '') ? -1 : (a.sourceId ?? '') > (b.sourceId ?? '') ? 1 : 0);
}

interface RecurringSource {
  id: string;
  name: string;
  amount: number;
  currency: string;
  nextPaymentDate: string;
  period: Subscription['period'];
  billingDay?: number;
  endDate?: string;
  archivedAt?: string;
}

/**
 * Входження регулярного запису на горизонті. Прострочене (`next < today`)
 * переноситься на СЬОГОДНІ одним входженням з `overdue`.
 */
function recurringEvents(
  source: RecurringSource,
  kind: 'subscription' | 'recurring_income',
  today: string,
  horizon: string,
): ForecastEvent[] {
  if (source.archivedAt || !isDateKey(source.nextPaymentDate)) return [];
  if (source.endDate && source.endDate < today) return [];
  const amount = Math.abs(Number(source.amount) || 0);
  if (!amount) return [];
  const signed = kind === 'subscription' ? -amount : amount;
  const out: ForecastEvent[] = [];
  if (source.nextPaymentDate < today) {
    out.push({ day: today, kind, amount: round(signed), label: source.name, sourceId: source.id, overdue: true });
  }
  for (const day of occurrencesBetween(source, today, horizon)) {
    out.push({ day, kind, amount: round(signed), label: source.name, sourceId: source.id });
  }
  return out;
}

/**
 * Прогноз балансу валюти `currency` на `horizonDays` днів уперед. Джерела
 * подій (§6.2): заплановані операції, підписки, регулярні доходи. Дубль
 * «підписка + та сама оплата, заведена вручну» НЕ дедуплікується (В4).
 */
export function cashflowForecast(input: CommonInput & {
  recurringIncomes: readonly RecurringIncome[];
  horizonDays: 30 | 90;
}): CashflowForecast {
  const { currency, primary, now, horizonDays } = input;
  const today = dateKeyOf(now);
  const horizon = addDaysKey(today, horizonDays);
  const opening = balanceAtEndOf(input.accounts, input.transactions, currency, today, primary);
  const variable = avgDailyVariable(input);

  const events: ForecastEvent[] = [];
  const active = new Map(activeAccounts(input.accounts as Account[]).map((account) => [account.id, account]));
  for (const tx of sortedByDateId(input.transactions)) {
    if (!tx) continue;
    const day = localDayKey(tx.date);
    if (!day || day <= today || day > horizon) continue;
    const amount = balanceContribution(tx, active, currency, primary);
    if (!amount) continue;
    const label = isTransferType(tx)
      ? (tx.note?.trim() || 'Переказ')
      : (tx.category?.trim() || tx.note?.trim() || (tx.type === 'income' ? 'Дохід' : 'Витрата'));
    events.push({ day, kind: 'planned_tx', amount: round(amount), label, sourceId: tx.id });
  }
  for (const sub of input.subscriptions) {
    if (!sub || sub.currency !== currency) continue;
    events.push(...recurringEvents(sub, 'subscription', today, horizon));
  }
  for (const item of input.recurringIncomes) {
    if (!item || item.currency !== currency) continue;
    events.push(...recurringEvents(item, 'recurring_income', today, horizon));
  }

  const byDay = new Map<string, ForecastEvent[]>();
  for (const event of events) byDay.set(event.day, [...(byDay.get(event.day) ?? []), event]);

  const points: ForecastPoint[] = [];
  let running = opening;
  let shortfall: CashflowForecast['shortfall'] = null;
  let lowest = { day: today, balance: opening };
  for (let i = 0; i <= horizonDays; i += 1) {
    const day = addDaysKey(today, i);
    const dayEvents = (byDay.get(day) ?? []).sort(compareEvents);
    running += dayEvents.reduce((sum, event) => sum + event.amount, 0);
    if (i > 0) running -= variable.value;
    const balance = round(running);
    points.push({ day, balance, events: dayEvents });
    if (balance < 0 && !shortfall) shortfall = { day, balance };
    if (i === 0 || balance < lowest.balance) lowest = { day, balance };
  }

  return {
    horizonDays,
    currency,
    opening,
    points,
    closing: points[points.length - 1].balance,
    avgDailyVariable: variable.value,
    basis: variable.basis,
    shortfall,
    lowest,
  };
}

/** Найбільші списання до дня `untilDay` включно — для картки попередження. */
export function largestOutflowsUntil(forecast: CashflowForecast, untilDay: string, limit = 3): ForecastEvent[] {
  const out: ForecastEvent[] = [];
  for (const point of forecast.points) {
    if (point.day > untilDay) break;
    for (const event of point.events) if (event.amount < 0) out.push(event);
  }
  return out
    .sort((a, b) => a.amount - b.amount || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .slice(0, limit);
}
