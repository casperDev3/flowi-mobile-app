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
import { categoryRowId, isUsableId } from '@/utils/recordIds';

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
 * Категорії одного типу, під якими операції лежать НАСПРАВДІ.
 *
 * Джерело — збережені категорії фінансів, і лише коли їх ще немає, дефолти
 * мови. Саме тому це не «дефолти для англійської»: користувач, який
 * перейменував категорії чи перемкнув мову вже після перших операцій, має
 * бачити в бюджеті ті самі назви, що й у стрічці, а не порожні рядки поруч із
 * авто-доданими справжніми.
 */
export function categoryPresets(
  rows: readonly CategoryRowLike[],
  type: CatType,
  lang: string,
): CategoryDef[] {
  const stored: CategoryDef[] = [];
  for (const row of rows) {
    if (!row || row.type !== type) continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name || stored.some(c => c.name === name)) continue;
    stored.push({ name, icon: (row.icon || FALLBACK_ICON) as IconSymbolName });
  }
  return stored.length ? stored : defaultCategories(lang)[type];
}

/** Те саме для витрат — форма, якої чекає бюджет. */
export function expenseCategoryPresets(
  rows: readonly CategoryRowLike[],
  lang: string,
): CategoryDef[] {
  return categoryPresets(rows, 'expense', lang);
}

/** Мінімум, потрібний, щоб побачити категорію операції. */
export interface TransactionLike {
  type?: string;
  category?: string;
}

/** Назви категорій, під якими вже лежать операції цього типу, за абеткою. */
export function usedCategoryNames(
  transactions: readonly TransactionLike[],
  type: CatType,
): string[] {
  const seen = new Set<string>();
  for (const tx of transactions) {
    if (!tx || tx.type !== type) continue;
    const name = typeof tx.category === 'string' ? tx.category.trim() : '';
    if (name) seen.add(name);
  }
  // Порядок фіксований і саме український: той самий список будує веб, і два
  // клієнти мусять давати ту саму відповідь на тих самих даних.
  return [...seen].sort((a, b) => a.localeCompare(b, 'uk-UA'));
}

/**
 * Повний список для пікера категорій: збережені (а якщо їх немає — дефолти)
 * ПЛЮС назви, під якими вже лежать операції.
 *
 * Друга частина — не запас про всяк випадок. Категорію могли прибрати з
 * керування, перейменувати чи завести ще до появи колекції `categories`, а
 * операції під старою назвою лишились. Якби пікер показував саму лише
 * колекцію, ця назва зникла б із вибору — і наступна така сама витрата пішла б
 * у нову категорію, розколовши історію й бюджетний ліміт надвоє.
 *
 * Порядок: спершу збережені у своєму порядку (він осмислений — його задає
 * людина в керуванні категоріями), далі «сироти» за абеткою. Іконки для сиріт
 * немає звідки взяти, тож дефолтна.
 *
 * `lang` впливає лише на дефолти для порожньої колекції; на вебі дефолти
 * завжди українські, тобто веб — це той самий виклик із lang='uk'.
 */
export function categoryOptions(
  rows: readonly CategoryRowLike[],
  transactions: readonly TransactionLike[],
  type: CatType,
  lang: string,
): CategoryDef[] {
  const presets = categoryPresets(rows, type, lang);
  const known = new Set(presets.map(c => c.name));
  const orphans = usedCategoryNames(transactions, type).filter(name => !known.has(name));
  return [...presets, ...orphans.map(name => ({ name, icon: FALLBACK_ICON }))];
}

/** Причина, чому назву категорії не можна зберегти. */
export type CategoryNameIssue = 'empty' | 'duplicate' | 'tooLong';

/**
 * Перевірка назви ПЕРЕД збереженням. Мусить жити у формі, а не в сховищі:
 * categoryMapToRows мовчки відкидає рядок із задовгим id, тож без цієї
 * перевірки людина побачила б «додано», а категорія зникла б при наступному
 * читанні.
 *
 * Межа рахується від повного `${type}:${name}`, а не від самої назви — саме
 * повний рядок стає id запису.
 */
export function categoryNameIssue(
  type: CatType,
  name: string,
  existing: readonly string[],
): CategoryNameIssue | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  const lower = trimmed.toLowerCase();
  if (existing.some(known => known.trim().toLowerCase() === lower)) return 'duplicate';
  if (!isUsableId(categoryRowId(type, trimmed))) return 'tooLong';
  return null;
}
