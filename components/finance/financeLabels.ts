/**
 * components/finance/financeLabels.ts — підписи вкладок, груп і пресетів
 * розділу «Фінанси». Лише мапінг id → рядок із `store/translations.ts`, щоб
 * той самий перелік не повторювався в кількох компонентах.
 */
import type { Translations } from '@/store/translations';
import type { MoneyScope } from '@/utils/budgetScope';
import type { CategoryGroup, CostKind } from '@/utils/finance/classify';
import type { PeriodPreset } from '@/utils/finance/period';
import type { FinanceTab } from '@/utils/financeTabs';

/** Спільна палітра компонентів розділу (підмножина палітри екрана «Фінанси»). */
export interface FinColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  card: string;
  accent: string;
  green: string;
  red: string;
  sheet: string;
}

export function financeTabLabel(tab: FinanceTab, tr: Translations): string {
  switch (tab) {
    case 'overview': return tr.finTabOverview;
    case 'transactions': return tr.finTabTransactions;
    case 'reports': return tr.finTabReports;
    case 'budget': return tr.finTabBudget;
    case 'subscriptions': return tr.finTabSubscriptions;
    case 'accounts': return tr.finTabAccounts;
  }
}

export function periodPresetLabel(preset: PeriodPreset, tr: Translations): string {
  switch (preset) {
    case 'month': return tr.finPresetMonth;
    case 'prev_month': return tr.finPresetPrevMonth;
    case 'quarter': return tr.finPresetQuarter;
    case 'year': return tr.finPresetYear;
    case 'custom': return tr.finPresetCustom;
  }
}

export function moneyScopeText(scope: MoneyScope, tr: Translations): string {
  return scope === 'personal' ? tr.budgetScopePersonal : scope === 'project' ? tr.budgetScopeProject : tr.budgetScopeAll;
}

export function categoryGroupLabel(group: CategoryGroup, tr: Translations): string {
  const map: Record<CategoryGroup, string> = {
    housing: tr.finGroupHousing,
    food: tr.finGroupFood,
    transport: tr.finGroupTransport,
    health: tr.finGroupHealth,
    entertainment: tr.finGroupEntertainment,
    services: tr.finGroupServices,
    education: tr.finGroupEducation,
    clothing: tr.finGroupClothing,
    pets: tr.finGroupPets,
    taxes: tr.finGroupTaxes,
    debt: tr.finGroupDebt,
    salary: tr.finGroupSalary,
    business: tr.finGroupBusiness,
    investments: tr.finGroupInvestments,
    gifts: tr.finGroupGifts,
    other: tr.finGroupOther,
  };
  return map[group];
}

export function costKindLabel(cost: CostKind, tr: Translations): string {
  return cost === 'fixed' ? tr.finCostFixed : tr.finCostVariable;
}
