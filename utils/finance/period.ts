/**
 * utils/finance/period.ts — період спільного фільтра розділу «Фінанси».
 *
 * flowi-web-app/docs/specs/finance-revamp.md §3. ДОСЛІВНИЙ ПОРТ
 * `flowi-web-app/lib/finance/period.ts` (джерело істини — веб, §8.2): ті самі
 * експорти, назви й семантика; відрізняються лише форма імпортів і
 * мобільні доповнення внизу файла (ключі сховища, локалізований підпис).
 *
 * Правила:
 *  - межі періоду — ЛОКАЛЬНІ дні, обидві ВКЛЮЧНО ('YYYY-MM-DD');
 *  - `now` — аргумент, а не `new Date()` усередині;
 *  - арифметика дат — ціла Р/М/Д (ключі 'YYYY-MM-DD' з utils/subscriptions.ts).
 */
import type { MoneyScope } from '../budgetScope';
import { addDaysKey, dateKeyOf, daysBetween, daysInMonth, isDateKey } from '../subscriptions';

export type PeriodPreset =
  | 'month' // календарний місяць (типово поточний; anchor 'YYYY-MM' — інший)
  | 'prev_month'
  | 'quarter' // календарний квартал (anchor 'YYYY-Qn')
  | 'year' // календарний рік (anchor 'YYYY')
  | 'custom'; // anchor 'YYYY-MM-DD..YYYY-MM-DD'

export const PERIOD_PRESETS: readonly PeriodPreset[] = ['month', 'prev_month', 'quarter', 'year', 'custom'];

export interface PeriodRange {
  /** 'YYYY-MM-DD', локальний календар, ВКЛЮЧНО. */
  from: string;
  /** 'YYYY-MM-DD', локальний календар, ВКЛЮЧНО. */
  to: string;
  /** Стабільний ключ для мемоізації й для сховища: 'month:2026-09' | '2026-01-01..2026-03-31'. */
  key: string;
  preset: PeriodPreset;
}

export interface FinanceFilter {
  period: PeriodRange;
  /** Код валюти, у якій рахується ВЕСЬ розділ. Типово — finance_primary_currency. */
  currency: string;
  /** utils/budgetScope.ts. Типово 'all'. */
  scope: MoneyScope;
}

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;
const YEAR_RE = /^(\d{4})$/;

/** Те саме, що `todayKey` на вебі: локальний ключ дня. */
const todayKey = (date: Date) => dateKeyOf(date);

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function monthRange(y: number, m: number): { from: string; to: string } {
  return { from: `${pad(y, 4)}-${pad(m)}-01`, to: `${pad(y, 4)}-${pad(m)}-${pad(daysInMonth(y, m))}` };
}

function shiftYm(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12 + 12) % 12 + 1 };
}

function monthPeriod(y: number, m: number): PeriodRange {
  return { ...monthRange(y, m), key: `month:${pad(y, 4)}-${pad(m)}`, preset: 'month' };
}

function quarterPeriod(y: number, q: number): PeriodRange {
  const first = (q - 1) * 3 + 1;
  return {
    from: monthRange(y, first).from,
    to: monthRange(y, first + 2).to,
    key: `quarter:${pad(y, 4)}-Q${q}`,
    preset: 'quarter',
  };
}

function yearPeriod(y: number): PeriodRange {
  return { from: `${pad(y, 4)}-01-01`, to: `${pad(y, 4)}-12-31`, key: `year:${pad(y, 4)}`, preset: 'year' };
}

function customPeriod(from: string, to: string): PeriodRange {
  // Переплутані межі — «з 31 по 1» очевидно означає «з 1 по 31».
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { from: a, to: b, key: `${a}..${b}`, preset: 'custom' };
}

function parseCustom(anchor: string): { from: string; to: string } | null {
  const [from, to] = anchor.split('..');
  return isDateKey(from) && isDateKey(to) ? { from, to } : null;
}

/**
 * Період за пресетом. `anchor` уточнює, ЯКИЙ саме місяць/квартал/рік
 * ('2026-08', '2026-Q3', '2026'). Порожній чи непридатний anchor → період, що
 * містить `now`. Для `custom` anchor — 'from..to'; без придатного anchor
 * `custom` стає поточним місяцем (а не порожнім екраном).
 */
export function resolvePeriod(preset: PeriodPreset, anchor: string, now: Date): PeriodRange {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const raw = typeof anchor === 'string' ? anchor.trim() : '';
  switch (preset) {
    case 'prev_month': {
      const prev = shiftYm(y, m, -1);
      return { ...monthPeriod(prev.y, prev.m), preset: 'prev_month' };
    }
    case 'quarter': {
      const match = QUARTER_RE.exec(raw);
      return match ? quarterPeriod(Number(match[1]), Number(match[2])) : quarterPeriod(y, Math.ceil(m / 3));
    }
    case 'year': {
      const match = YEAR_RE.exec(raw);
      return yearPeriod(match ? Number(match[1]) : y);
    }
    case 'custom': {
      const range = parseCustom(raw);
      return range ? customPeriod(range.from, range.to) : monthPeriod(y, m);
    }
    case 'month':
    default: {
      const match = MONTH_RE.exec(raw);
      const mm = match ? Number(match[2]) : 0;
      return match && mm >= 1 && mm <= 12 ? monthPeriod(Number(match[1]), mm) : monthPeriod(y, m);
    }
  }
}

/**
 * Рядок періоду → період. Формат — той самий `key`: 'month:2026-09' |
 * 'prev_month' | 'quarter:2026-Q3' | 'year:2026' | '2026-01-01..2026-03-31'.
 * Невідоме → поточний місяць.
 */
export function parsePeriodParam(raw: string | null | undefined, now: Date): PeriodRange {
  const value = (raw ?? '').trim();
  if (!value) return resolvePeriod('month', '', now);
  if (value.includes('..')) return resolvePeriod('custom', value, now);
  const [preset, anchor = ''] = value.split(':');
  if ((PERIOD_PRESETS as readonly string[]).includes(preset)) {
    return resolvePeriod(preset as PeriodPreset, anchor, now);
  }
  return resolvePeriod('month', '', now);
}

/** Період → рядок. Зворотне до {@link parsePeriodParam}. */
export function periodParam(period: PeriodRange): string {
  return period.preset === 'prev_month' ? 'prev_month' : period.key;
}

/** Кількість днів у періоді (включно з обома межами). */
export function periodLength(period: Pick<PeriodRange, 'from' | 'to'>): number {
  return daysBetween(period.from, period.to) + 1;
}

/**
 * Сусідній період тієї ж природи: місяць → місяць (серпень для вересня, а не
 * «30 днів тому»), квартал → квартал, рік → рік. `custom` зсувається на свою
 * довжину в днях. `prev_month` після зсуву — просто місяць.
 */
export function shiftPeriod(period: PeriodRange, delta: number): PeriodRange {
  const step = Math.trunc(delta);
  if (!step) return period;
  const [y, m] = period.from.split('-').map(Number);
  switch (period.preset) {
    case 'month':
    case 'prev_month': {
      const next = shiftYm(y, m, step);
      return monthPeriod(next.y, next.m);
    }
    case 'quarter': {
      const next = shiftYm(y, m, step * 3);
      return quarterPeriod(next.y, Math.ceil(next.m / 3));
    }
    case 'year':
      return yearPeriod(y + step);
    case 'custom':
    default: {
      const length = periodLength(period);
      return customPeriod(addDaysKey(period.from, step * length), addDaysKey(period.to, step * length));
    }
  }
}

/**
 * Локальний день дати операції ('YYYY-MM-DD') або null для битої.
 * Розбір — через `new Date(value)`, як у балансі рахунку (utils/accounts.ts):
 * день операції мусить збігатися з тим, у який її кладе баланс.
 */
export function localDayKey(value: string | undefined | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return todayKey(date);
}

/** Чи припадає дата операції на період (локальні межі доби, включно). */
export function inRange(date: string | undefined | null, period: Pick<PeriodRange, 'from' | 'to'>): boolean {
  const day = localDayKey(date);
  return day !== null && day >= period.from && day <= period.to;
}

/** Усі дні періоду по порядку — суцільний ряд без пропусків. */
export function daysOf(period: Pick<PeriodRange, 'from' | 'to'>): string[] {
  const out: string[] = [];
  const length = periodLength(period);
  for (let i = 0; i < length; i += 1) out.push(addDaysKey(period.from, i));
  return out;
}

/** Місяці ('YYYY-MM'), яких торкається період, по порядку. */
export function monthsOf(period: Pick<PeriodRange, 'from' | 'to'>): string[] {
  const out: string[] = [];
  let [y, m] = period.from.split('-').map(Number);
  const last = period.to.slice(0, 7);
  for (let guard = 0; guard < 1200; guard += 1) {
    const key = `${pad(y, 4)}-${pad(m)}`;
    out.push(key);
    if (key >= last) break;
    ({ y, m } = shiftYm(y, m, 1));
  }
  return out;
}

// ─── Підписи ────────────────────────────────────────────────────────────────

const MONTHS_NOMINATIVE = [
  'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
  'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень',
];
const MONTHS_SHORT = [
  'січ', 'лют', 'бер', 'квіт', 'трав', 'черв',
  'лип', 'серп', 'вер', 'жовт', 'лист', 'груд',
];
const QUARTER_ROMAN = ['I', 'II', 'III', 'IV'];

/** «5 лист.» — короткий день для осей і рядків подій. */
export function labelDayShort(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number);
  if (!m || !d) return dateKey;
  return `${d} ${MONTHS_SHORT[m - 1]}.`;
}

/**
 * Підпис періоду українською (паритет із вебом): «вересень 2026»,
 * «III квартал 2026», «2026 рік», «1 січ. – 31 бер. 2026». Мобільний UI
 * показує {@link labelPeriodLocalized} — з перекладами застосунку.
 */
export function labelPeriod(period: PeriodRange, options: { short?: boolean } = {}): string {
  const [y, m] = period.from.split('-').map(Number);
  switch (period.preset) {
    case 'month':
    case 'prev_month':
      return options.short ? `${MONTHS_SHORT[m - 1]}. ${y}` : `${MONTHS_NOMINATIVE[m - 1]} ${y}`;
    case 'quarter':
      return `${QUARTER_ROMAN[Math.floor((m - 1) / 3)]} ${options.short ? 'кв.' : 'квартал'} ${y}`;
    case 'year':
      return `${y} рік`;
    case 'custom':
    default: {
      const toYear = period.to.slice(0, 4);
      const fromLabel = labelDayShort(period.from) + (period.from.slice(0, 4) !== toYear ? ` ${period.from.slice(0, 4)}` : '');
      return `${fromLabel} – ${labelDayShort(period.to)} ${toYear}`;
    }
  }
}

// ─── Мобільні доповнення (сховище, i18n) ────────────────────────────────────

/** Локальні ключі AsyncStorage (НЕ синхронізуються — стан погляду, §3.3). */
export const FINANCE_PERIOD_KEY = 'finance_period';
export const FINANCE_CURRENCY_KEY = 'finance_currency';

/**
 * Період → значення для `finance_period`. Поточний період пресета
 * зберігається ЛИШЕ пресетом ('month', 'quarter', …): «цей місяць», збережений
 * у серпні, у вересні мусить означати вересень. Інший — повним ключем.
 */
export function storedPeriodOf(period: PeriodRange, now: Date): string {
  if (period.preset !== 'custom' && resolvePeriod(period.preset, '', now).key === period.key) return period.preset;
  return periodParam(period);
}

/** Значення `finance_period` → період. Бите — поточний місяць. */
export function parseStoredPeriod(raw: unknown, now: Date): PeriodRange {
  return parsePeriodParam(typeof raw === 'string' ? raw : '', now);
}

/**
 * Підпис періоду мовою застосунку: назви місяців приходять з
 * `store/translations.ts` (tr.months / tr.monthsShort), а не з модуля.
 */
export function labelPeriodLocalized(
  period: PeriodRange,
  months: readonly string[],
  monthsShort: readonly string[],
  quarterLabel = 'Q',
): string {
  const [y, m] = period.from.split('-').map(Number);
  switch (period.preset) {
    case 'month':
    case 'prev_month':
      return `${months[m - 1] ?? pad(m)} ${y}`;
    case 'quarter':
      return `${quarterLabel}${Math.floor((m - 1) / 3) + 1} ${y}`;
    case 'year':
      return String(y);
    case 'custom':
    default: {
      const day = (key: string) => {
        const [, mm, dd] = key.split('-').map(Number);
        return `${dd} ${monthsShort[mm - 1] ?? pad(mm)}`;
      };
      const toYear = period.to.slice(0, 4);
      const fromYear = period.from.slice(0, 4);
      return `${day(period.from)}${fromYear !== toYear ? ` ${fromYear}` : ''} – ${day(period.to)} ${toYear}`;
    }
  }
}
