/**
 * utils/financeTabs.ts — вкладки розділу «Фінанси» (finance-revamp.md §2.1, §2.3).
 *
 * Порядок фіксований і однаковий на обох платформах. Вимкнений підмодуль
 * ховає ВКЛАДКУ, а не розділ; спроба відкрити приховану чи невідому вкладку
 * (параметр `?tab=`) → типова вкладка, а не порожній екран.
 */

/** Те саме правило, що isModuleEnabled у store/ui-preferences.ts (без залежності від сховища). */
function isModuleEnabled(disabled: readonly string[], moduleId: string | undefined): boolean {
  return !moduleId || !disabled.includes(moduleId);
}

export type FinanceTab = 'overview' | 'transactions' | 'reports' | 'budget' | 'subscriptions' | 'accounts';

export const FINANCE_TABS: readonly FinanceTab[] = [
  'overview', 'transactions', 'reports', 'budget', 'subscriptions', 'accounts',
];

export const DEFAULT_FINANCE_TAB: FinanceTab = 'overview';

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
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && (visible as readonly string[]).includes(raw)
    ? (raw as FinanceTab)
    : (visible.includes(DEFAULT_FINANCE_TAB) ? DEFAULT_FINANCE_TAB : (visible[0] ?? DEFAULT_FINANCE_TAB));
}
