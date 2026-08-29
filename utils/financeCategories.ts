/**
 * utils/financeCategories.ts — дефолтні категорії фінансів в ОДНОМУ місці.
 *
 * Категорія живе в операції рядком (`tx.category`), і всі екрани звіряються з
 * нею саме за рядком. Доки набір дефолтів був копією в кожному екрані, копії
 * розійшлися: «Фінанси» створювали англійські категорії при lang='en', а
 * «Бюджет» знав лише український список — ліміт на «Їжа» не зменшувався
 * ніколи, бо витрата лежала в «Food».
 */
import type { IconSymbolName } from '@/components/ui/icon-symbol';

export type CatType = 'income' | 'expense';

export interface CategoryDef {
  name: string;
  icon: IconSymbolName;
}

/** Рядок ключа 'categories' у сховищі — форма після нормалізації. */
export interface CategoryRowLike {
  type?: string;
  name?: string;
  icon?: string;
}

const FALLBACK_ICON: IconSymbolName = 'ellipsis.circle.fill';

export const DEFAULT_CATEGORIES_UK: Record<CatType, CategoryDef[]> = {
  income: [
    { name: 'Зарплата',   icon: 'briefcase.fill' },
    { name: 'Фріланс',    icon: 'laptopcomputer' },
    { name: 'Інвестиції', icon: 'chart.line.uptrend.xyaxis' },
    { name: 'Подарунок',  icon: 'gift.fill' },
    { name: 'Інше',       icon: 'ellipsis.circle.fill' },
  ],
  expense: [
    { name: 'Їжа',        icon: 'fork.knife' },
    { name: 'Транспорт',  icon: 'car.fill' },
    { name: 'Розваги',    icon: 'gamecontroller.fill' },
    { name: "Здоров'я",   icon: 'cross.fill' },
    { name: 'Комунальні', icon: 'house.fill' },
    { name: 'Одяг',       icon: 'tag.fill' },
    { name: 'Інше',       icon: 'ellipsis.circle.fill' },
  ],
};

export const DEFAULT_CATEGORIES_EN: Record<CatType, CategoryDef[]> = {
  income: [
    { name: 'Salary',      icon: 'briefcase.fill' },
    { name: 'Freelance',   icon: 'laptopcomputer' },
    { name: 'Investments', icon: 'chart.line.uptrend.xyaxis' },
    { name: 'Gift',        icon: 'gift.fill' },
    { name: 'Other',       icon: 'ellipsis.circle.fill' },
  ],
  expense: [
    { name: 'Food',          icon: 'fork.knife' },
    { name: 'Transport',     icon: 'car.fill' },
    { name: 'Entertainment', icon: 'gamecontroller.fill' },
    { name: 'Health',        icon: 'cross.fill' },
    { name: 'Utilities',     icon: 'house.fill' },
    { name: 'Clothing',      icon: 'tag.fill' },
    { name: 'Other',         icon: 'ellipsis.circle.fill' },
  ],
};

export function defaultCategories(lang: string): Record<CatType, CategoryDef[]> {
  return lang === 'uk' ? DEFAULT_CATEGORIES_UK : DEFAULT_CATEGORIES_EN;
}

/**
 * Витратні категорії, під якими операції лежать НАСПРАВДІ.
 *
 * Джерело — збережені категорії фінансів, і лише коли їх ще немає, дефолти
 * мови. Саме тому це не «дефолти для англійської»: користувач, який
 * перейменував категорії чи перемкнув мову вже після перших операцій, має
 * бачити в бюджеті ті самі назви, що й у стрічці, а не порожні рядки поруч із
 * авто-доданими справжніми.
 */
export function expenseCategoryPresets(
  rows: readonly CategoryRowLike[],
  lang: string,
): CategoryDef[] {
  const stored: CategoryDef[] = [];
  for (const row of rows) {
    if (!row || row.type !== 'expense') continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name || stored.some(c => c.name === name)) continue;
    stored.push({ name, icon: (row.icon || FALLBACK_ICON) as IconSymbolName });
  }
  return stored.length ? stored : defaultCategories(lang).expense;
}
