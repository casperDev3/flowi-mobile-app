/**
 * utils/financeTabs.ts — вкладки розділу «Фінанси» (finance-revamp.md §2.1, §2.3).
 *
 * Порядок фіксований і однаковий на обох платформах. Вимкнений підмодуль
 * ховає ВКЛАДКУ, а не розділ; спроба відкрити приховану чи невідому вкладку
 * (параметр `?tab=`) → типова вкладка, а не порожній екран.
 *
 * Рішення власника 2026-10-07: вкладки скрізь (телефон І планшет) —
 * «Операції · Рахунки · Звіти · Ще ▾»; «Огляд» прибрано — його вміст
 * (Рух коштів, Прогноз, попередження про мінус) влився у «Звіти» однією
 * стрічкою, а баланси рахунків живуть лише на «Рахунках».
 */

/** Те саме правило, що isModuleEnabled у store/ui-preferences.ts (без залежності від сховища). */
function isModuleEnabled(disabled: readonly string[], moduleId: string | undefined): boolean {
  return !moduleId || !disabled.includes(moduleId);
}

export type FinanceTab = 'transactions' | 'accounts' | 'reports' | 'budget' | 'subscriptions';

/**
 * Порядок — за частотою: «Операції» (типова, рішення власника 2026-10),
 * «Рахунки», «Звіти», далі рідші розділи, які живуть за кнопкою «Ще»
 * (components/finance/FinanceSectionBar.tsx).
 */
export const FINANCE_TABS: readonly FinanceTab[] = [
  'transactions', 'accounts', 'reports', 'budget', 'subscriptions',
];

export const DEFAULT_FINANCE_TAB: FinanceTab = 'transactions';

/**
 * Старі адреси вкладок → нинішні. `?tab=overview` (сайдбар, закладки,
 * сповіщення старих збірок) відкриває «Звіти» — туди переїхав вміст «Огляду».
 */
const TAB_ALIASES: Readonly<Record<string, FinanceTab>> = {
  overview: 'reports',
};

/** Вкладка → підмодуль, що її ховає (§2.3). Решта живе, поки живий `finance`. */
const TAB_MODULE: Partial<Record<FinanceTab, string>> = {
  budget: 'budget',
  subscriptions: 'subscriptions',
  accounts: 'banks',
};

export function visibleFinanceTabs(disabledModules: readonly string[]): FinanceTab[] {
  return FINANCE_TABS.filter(tab => isModuleEnabled(disabledModules, TAB_MODULE[tab]));
}

export function parseFinanceTab(value: unknown, visible: readonly FinanceTab[] = FINANCE_TABS): FinanceTab {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = typeof first === 'string' ? (TAB_ALIASES[first] ?? first) : first;
  return typeof raw === 'string' && (visible as readonly string[]).includes(raw)
    ? (raw as FinanceTab)
    : (visible.includes(DEFAULT_FINANCE_TAB) ? DEFAULT_FINANCE_TAB : (visible[0] ?? DEFAULT_FINANCE_TAB));
}

/**
 * Вкладки, що завжди стоять у рядку. Решта (Бюджет, Підписки) — за кнопкою
 * «Ще» на будь-якій ширині: один ряд сегментів однаковий на телефоні й
 * планшеті, і поруч на планшеті вміщується період із чипом «Фільтри».
 */
export const PRIMARY_FINANCE_TABS: readonly FinanceTab[] = ['transactions', 'accounts', 'reports'];

/** Розкладка вкладок: що в рядку, що в меню «Ще». */
export function splitFinanceTabs(tabs: readonly FinanceTab[]): {
  inline: FinanceTab[];
  more: FinanceTab[];
} {
  const inline = tabs.filter(t => PRIMARY_FINANCE_TABS.includes(t));
  const more = tabs.filter(t => !PRIMARY_FINANCE_TABS.includes(t));
  // Одна вкладка в «Ще» — не меню, а просто вкладка.
  if (more.length <= 1) return { inline: [...tabs], more: [] };
  return { inline, more };
}

/**
 * Секції «Звітів» — одна стрічка за змістом: спершу попередження про мінус
 * (якщо є), далі «що сталося» (підсумок → куди пішли гроші) → «як рухались
 * гроші» (факт) → «що буде» (прогноз 30/90 з подіями).
 */
export type ReportsSection = 'shortfall' | 'pnl' | 'structure' | 'cashflow' | 'forecast';

export function reportsSections(hasShortfall: boolean): ReportsSection[] {
  const feed: ReportsSection[] = ['pnl', 'structure', 'cashflow', 'forecast'];
  return hasShortfall ? ['shortfall', ...feed] : feed;
}

/**
 * Ряди карток «Звітів» на планшеті: по `columns` у ряд у порядку стрічки.
 *
 * Masonry клав «Прогноз» у ліву колонку ВИЩЕ за «Cash flow» у правій — читач
 * зліва направо бачив прогноз раніше за факт. Ряди тримають порядок читання
 * P&L · Структура → Cash flow · Прогноз ціною можливого проміжку під нижчою
 * карткою ряду. Одна колонка — кожна картка свій ряд (телефон).
 */
export function reportsRows<T>(items: readonly T[], columns: number): T[][] {
  const n = Math.max(1, Math.floor(columns) || 1);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return rows;
}

/**
 * Ховати FAB «+» на «Звітах» під час прокрутки вниз (телефон: кнопка
 * накривала колонку відсотків «Структури витрат»). Повертається при
 * прокрутці вгору або біля верху. Дрібне тремтіння (< 8pt) стан не змінює.
 */
export const REPORTS_FAB_TOP_ZONE = 40;
export function reportsFabHidden(prevY: number, y: number, hidden: boolean): boolean {
  if (y <= REPORTS_FAB_TOP_ZONE) return false;
  const dy = y - prevY;
  if (dy > 8) return true;
  if (dy < -8) return false;
  return hidden;
}

/**
 * Скільки фільтрів відхилено від типових — число на чипі «Фільтри (N)».
 * Типові: основна валюта, ракурс «Всі», тип «Всі». Ракурс не рахується там,
 * де його не показують (Рахунки, Підписки).
 */
export function activeFinanceFilterCount(input: {
  currency: string;
  primaryCurrency: string | undefined;
  scope: string;
  showScope: boolean;
  txType?: string;
}): number {
  let n = 0;
  if (input.primaryCurrency && input.currency !== input.primaryCurrency) n += 1;
  if (input.showScope && input.scope !== 'all') n += 1;
  if (input.txType && input.txType !== 'all') n += 1;
  return n;
}
