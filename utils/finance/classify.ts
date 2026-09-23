/**
 * utils/finance/classify.ts — групи категорій і ознака «фіксована / змінна».
 *
 * flowi-web-app/docs/specs/finance-revamp.md §4.1, §4.5. ДОСЛІВНИЙ ПОРТ
 * `flowi-web-app/lib/finance/classify.ts` (джерело істини — веб, §8.2).
 * Підписи груп на мобільному — з store/translations.ts, тож CATEGORY_GROUP_LABELS
 * тут лишається лише заради паритету експортів.
 *
 * Поля `group`/`cost` — ОПЦІЙНІ в наявних рядках `categories`; id рядка не
 * змінюється. Пріоритет:
 *
 *   явне значення в записі  >  правило «категорія підписки → fixed»  >
 *   посівна таблиця за назвою  >  'other' + 'variable'.
 *
 * Функції нічого не пишуть у сховище й ідемпотентні.
 */

export type CategoryGroup =
  // витратні
  | 'housing' | 'food' | 'transport' | 'health' | 'entertainment'
  | 'services' | 'education' | 'clothing' | 'pets' | 'taxes' | 'debt'
  // доходні
  | 'salary' | 'business' | 'investments' | 'gifts'
  // спільна
  | 'other';

export type CostKind = 'fixed' | 'variable';

export const EXPENSE_GROUPS: readonly CategoryGroup[] = [
  'housing', 'food', 'transport', 'health', 'entertainment',
  'services', 'education', 'clothing', 'pets', 'taxes', 'debt', 'other',
];

export const INCOME_GROUPS: readonly CategoryGroup[] = ['salary', 'business', 'investments', 'gifts', 'other'];

/** Усі групи — порядок витратні → доходні → «інше». */
export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  'housing', 'food', 'transport', 'health', 'entertainment',
  'services', 'education', 'clothing', 'pets', 'taxes', 'debt',
  'salary', 'business', 'investments', 'gifts',
  'other',
];

export const COST_KINDS: readonly CostKind[] = ['fixed', 'variable'];

/** Паритет із вебом. Мобільний UI бере підписи з store/translations.ts (finGroup*). */
export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  housing: 'Житло',
  food: 'Їжа',
  transport: 'Транспорт',
  health: "Здоров'я",
  entertainment: 'Розваги',
  services: "Сервіси і зв'язок",
  education: 'Навчання',
  clothing: 'Одяг',
  pets: 'Тварини',
  taxes: 'Податки',
  debt: 'Кредити',
  salary: 'Зарплата',
  business: 'Бізнес і фріланс',
  investments: 'Інвестиції',
  gifts: 'Подарунки',
  other: 'Інше',
};

export const COST_KIND_LABELS: Record<CostKind, string> = {
  fixed: 'Фіксовані',
  variable: 'Змінні',
};

export function isCategoryGroup(value: unknown): value is CategoryGroup {
  return typeof value === 'string' && (CATEGORY_GROUPS as readonly string[]).includes(value);
}

export function isCostKind(value: unknown): value is CostKind {
  return value === 'fixed' || value === 'variable';
}

/**
 * Ключ посівної таблиці: trim, нижній регістр, апострофи (' ’ ʼ `) зведені до
 * одного символу. «Здоров’я» з iOS-клавіатури і «Здоров'я» з веба — одна
 * категорія.
 */
export function normalizeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name.trim().toLocaleLowerCase('uk-UA').replace(/[’ʼ`‘]/g, "'");
}

interface SeedMeta {
  group: CategoryGroup;
  /** Відсутнє — для доходних назв ознака не має сенсу. */
  cost?: CostKind;
}

function seeds(names: string[], meta: SeedMeta): [string, SeedMeta][] {
  return names.map((name) => [normalizeName(name), meta]);
}

/** Посівна таблиця §4.5.1 — покриває дефолти обох мов. */
export const SEED_BY_NAME: Readonly<Record<string, SeedMeta>> = Object.freeze(Object.fromEntries([
  ...seeds(['Комунальні', 'Utilities'], { group: 'housing', cost: 'fixed' }),
  ...seeds(['Оренда', 'Житло', 'Rent', 'Housing'], { group: 'housing', cost: 'fixed' }),
  ...seeds(['Їжа', 'Food'], { group: 'food', cost: 'variable' }),
  ...seeds(['Транспорт', 'Transport'], { group: 'transport', cost: 'variable' }),
  ...seeds(["Здоров'я", 'Health'], { group: 'health', cost: 'variable' }),
  ...seeds(['Розваги', 'Entertainment'], { group: 'entertainment', cost: 'variable' }),
  ...seeds(['Одяг', 'Clothing'], { group: 'clothing', cost: 'variable' }),
  ...seeds(['Підписки', 'Subscriptions'], { group: 'services', cost: 'fixed' }),
  ...seeds(["Зв'язок", 'Інтернет', 'Mobile', 'Internet'], { group: 'services', cost: 'fixed' }),
  ...seeds(['Навчання', 'Education'], { group: 'education', cost: 'fixed' }),
  ...seeds(['Податки', 'Taxes'], { group: 'taxes', cost: 'fixed' }),
  ...seeds(['Кредит', 'Позика', 'Loan', 'Credit'], { group: 'debt', cost: 'fixed' }),
  ...seeds(['Тварини', 'Pets'], { group: 'pets', cost: 'variable' }),
  ...seeds(['Зарплата', 'Salary'], { group: 'salary' }),
  ...seeds(['Фріланс', 'Freelance'], { group: 'business' }),
  ...seeds(['Інвестиції', 'Investments'], { group: 'investments' }),
  ...seeds(['Подарунок', 'Gift'], { group: 'gifts' }),
  ...seeds(['Інше', 'Other'], { group: 'other', cost: 'variable' }),
]) as Record<string, SeedMeta>);

/** Рядок `categories` очима класифікатора: форма перевіряється, бо пише її інший клієнт. */
export interface CategoryRowLike {
  type?: string;
  name?: string;
  group?: unknown;
  cost?: unknown;
}

/** Звідки взялась ознака `cost` — для «N категорій без ознаки». */
export type CostSource = 'explicit' | 'subscription' | 'seed' | 'default';

export interface CategoryMeta {
  group: CategoryGroup;
  cost: CostKind;
  /** Група записана в рядку явно. */
  explicitGroup: boolean;
  costSource: CostSource;
}

export interface CategoryMetaOptions {
  /** Нормалізовані назви витратних категорій, на які посилається неархівна підписка. */
  fixedByReference?: ReadonlySet<string>;
}

/** Група й ознака категорії. Явне значення в записі ЗАВЖДИ перемагає похідне. */
export function categoryMeta(row: CategoryRowLike, options: CategoryMetaOptions = {}): CategoryMeta {
  const key = normalizeName(row?.name);
  const seeded = key ? SEED_BY_NAME[key] : undefined;
  const explicitGroup = isCategoryGroup(row?.group);
  const group: CategoryGroup = explicitGroup ? (row.group as CategoryGroup) : (seeded?.group ?? 'other');
  if (row?.type !== 'expense') {
    // Для доходів ознака не має сенсу й не показується.
    return { group, cost: 'variable', explicitGroup, costSource: 'default' };
  }
  if (isCostKind(row.cost)) return { group, cost: row.cost, explicitGroup, costSource: 'explicit' };
  if (key && options.fixedByReference?.has(key)) {
    return { group, cost: 'fixed', explicitGroup, costSource: 'subscription' };
  }
  if (seeded?.cost) return { group, cost: seeded.cost, explicitGroup, costSource: 'seed' };
  return { group, cost: 'variable', explicitGroup, costSource: 'default' };
}

/** Мінімум підписки, потрібний правилу «→ fixed». */
export interface SubscriptionRef {
  category?: string;
  archivedAt?: string;
}

/**
 * Назви (нормалізовані) категорій, на які посилається неархівна підписка.
 * «Неархівна» — лише за `archivedAt`, без `endDate`: інакше класифікація
 * залежала б від сьогоднішньої дати.
 */
export function subscriptionCategoryNames(subscriptions: readonly SubscriptionRef[]): Set<string> {
  const out = new Set<string>();
  for (const sub of subscriptions) {
    if (!sub || sub.archivedAt) continue;
    const key = normalizeName(sub.category);
    if (key) out.add(key);
  }
  return out;
}

/** Класифікатор операцій: індекс рядків + правило підписок, зібрані один раз. */
export interface CategoryIndex {
  meta(type: 'income' | 'expense', name: string | undefined): CategoryMeta;
}

/**
 * Індекс «тип + назва → рядок». Кілька рядків з однією назвою — перемагає
 * перший, у якого є явне значення, щоб порядок доїзду з синку не міняв
 * класифікацію.
 */
export function buildCategoryIndex(
  categories: readonly unknown[],
  subscriptions: readonly SubscriptionRef[] = [],
): CategoryIndex {
  const rows = new Map<string, CategoryRowLike>();
  for (const raw of categories) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as CategoryRowLike;
    if (row.type !== 'income' && row.type !== 'expense') continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const key = `${row.type}:${name}`;
    const existing = rows.get(key);
    const explicit = isCategoryGroup(row.group) || isCostKind(row.cost);
    const existingExplicit = existing && (isCategoryGroup(existing.group) || isCostKind(existing.cost));
    if (!existing || (explicit && !existingExplicit)) rows.set(key, row);
  }
  const fixedByReference = subscriptionCategoryNames(subscriptions);
  const cache = new Map<string, CategoryMeta>();
  return {
    meta(type, name) {
      const trimmed = typeof name === 'string' ? name.trim() : '';
      const key = `${type}:${trimmed}`;
      const hit = cache.get(key);
      if (hit) return hit;
      const row = rows.get(key) ?? { type, name: trimmed };
      const result = categoryMeta(row, { fixedByReference });
      cache.set(key, result);
      return result;
    },
  };
}

/** Ознака операції: береться з категорії, а не з самої операції (§4.6). */
export function costKindOfTx(
  tx: { type?: string; category?: string },
  index: CategoryIndex,
): CostKind {
  if (tx.type !== 'expense') return 'variable';
  return index.meta('expense', tx.category).cost;
}
