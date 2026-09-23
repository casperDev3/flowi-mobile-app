/**
 * utils/budgetUtils.ts — що бюджет НЕ порахував.
 *
 * Ліміт задається в основній валюті, а витрати тепер бувають у будь-якій:
 * після появи рахунків картка в доларах — звичайна річ. Додати 120 $ до
 * гривневого ліміту чесно неможливо, бо курсів у застосунку ще немає.
 *
 * Тому екран не вигадує число, а показує те, чого не врахував. Це різниця між
 * «ліміт зелений» і «ліміт зелений, але поруч є 120 $, яких я не бачу» —
 * перше бреше, друге ні.
 *
 * Коли зʼявляться курси, ці суми просто перестануть бути «неврахованими» й
 * увіллються в основний підрахунок; сама функція тоді зникне.
 */
import type { IconSymbolName } from '@/components/ui/icon-symbol';

import { accountById } from './accounts';
import { isSameMonth } from './dateUtils';
import {
  DEFAULT_CATEGORIES_EN,
  DEFAULT_CATEGORIES_UK,
  expenseCategoryPresets,
  type CategoryRowLike,
} from './financeCategories';
import type { Transaction } from './financeUtils';
import { MAX_RECORD_ID_LENGTH } from './recordIds';
import type { Account } from './accounts';

/** Категорія → код валюти → сума витрат, що не потрапили в ліміт. */
export type UncountedSpend = Record<string, Record<string, number>>;

/**
 * У якій валюті бюджет має рахувати операцію.
 *
 * Свідомо НЕ `resolveTxCurrency`: та підставляє 'UAH', коли валюти взяти
 * нізвідки, — розумний дефолт для гаманця, але не для бюджету. Бюджет звіряє
 * валюту операції з основною, тож будь-який дефолт тут — це вирок:
 *   • для користувача з основною не гривнею UAH-дефолт викидає з бюджету геть
 *     усі записи без рахунку, і екран показує самі нулі;
 *   • для гривневого — навпаки, оголошує гривнями суми з рахунку, який ще не
 *     доїхав синком, і додає долари до ліміту за номіналом.
 *
 * Тому «невідомо» тут означає «та сама валюта, що й ліміт»: рівно так екран
 * поводився до появи рахунків, коли поле currency було порожнім у всіх старих
 * записів. Щойно рахунок зʼявиться, істину скаже він.
 */
export function budgetTxCurrency(
  tx: Transaction,
  accounts: Account[],
  baseCurrency: string,
): string {
  const account = accountById(accounts, tx.accountId);
  if (account?.currency) return account.currency;
  // Успадковане поле: лишилося в записах, створених до появи рахунків.
  if (tx.currency) return tx.currency;
  return baseCurrency;
}

export function uncountedSpendByCategory(
  transactions: Transaction[],
  accounts: Account[],
  month: Date,
  baseCurrency: string,
): UncountedSpend {
  // Object.create(null), а не {}: ключ тут — назва категорії, яку набрав
  // користувач. Для '__proto__' звичайний літерал не створює власного поля, а
  // ПІДМІНЮЄ прототип, і сума потім лягає просто в Object.prototype — зайве
  // поле дістається кожному обʼєкту в застосунку. Для 'constructor' гілка
  // «поле вже є» спрацьовує на успадкованому значенні, і категорія разом із
  // сумою зникає зі звіту.
  const out: UncountedSpend = Object.create(null);
  for (const tx of transactions) {
    // Строге порівняння з 'expense', а не «все, що не дохід»: переказ між
    // своїми рахунками витратою не є в жодній валюті, і згадка про нього тут
    // лише збивала б з пантелику.
    if (tx.type !== 'expense') continue;
    const at = new Date(tx.date);
    // Бита дата не має тихо потрапляти в підсумок «неврахованого»: там вона
    // виглядала б як реальні гроші, яких насправді немає в цьому місяці.
    if (Number.isNaN(at.getTime()) || !isSameMonth(at, month)) continue;
    const code = budgetTxCurrency(tx, accounts, baseCurrency);
    if (code === baseCurrency) continue;
    const category = tx.category || '';
    if (!out[category]) out[category] = Object.create(null);
    out[category][code] = (out[category][code] ?? 0) + tx.amount;
  }
  return out;
}

/**
 * Підпис на кшталт «120 $ · 45 €». Порядок — за спаданням суми: найбільша
 * неврахована валюта найважливіша, і саме її треба побачити першою.
 *
 * `locale` — параметр, а не константа: підпис стоїть посеред фрази з i18n, і
 * зашита 'uk-UA' розділяла б тисячі по-українськи в англійському інтерфейсі.
 */
export function formatUncounted(
  perCurrency: Record<string, number> | undefined,
  symbolFor: (code: string) => string,
  locale: string,
): string {
  if (!perCurrency) return '';
  return Object.entries(perCurrency)
    .filter(([, amount]) => amount > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([code, amount]) => `${Math.round(amount).toLocaleString(locale)} ${symbolFor(code)}`)
    .join(' · ');
}

// ─── Форма записів ────────────────────────────────────────────────────────────

/** Іконка, коли своєї немає: категорія з транзакцій чи битий рядок. */
export const FALLBACK_BUDGET_ICON: IconSymbolName = 'ellipsis.circle.fill';

/**
 * Межа довжини `local_id` у протоколі синхронізації — та сама, що у вебі
 * (`lib/budget.ts`, MAX_BUDGET_ID_LENGTH) і що в `utils/recordIds.ts`.
 *
 * Для бюджету вона лягає не на якийсь технічний ключ, а на НАЗВУ категорії:
 * id запису дорівнює назві навмисно, щоб два пристрої, які офлайн задали
 * ліміт на ту саму категорію, зійшлися в ОДИН запис, а не подвоїли його.
 * Ціна цього рішення — ось ця межа, і форма мусить перевірити її САМА.
 */
export const MAX_BUDGET_ID_LENGTH = MAX_RECORD_ID_LENGTH;

/**
 * Чи годиться назва категорії на роль id запису.
 *
 * Перевіряються ОБИДВІ міри довжини, і це не перестраховка:
 *  • Django міряє `max_length` у символах (кодових позиціях) — так само рахує
 *    веб (`[...trimmed].length`), тож емодзі в назві там займає одну позицію;
 *  • `normalizeSyncLocalId` у store/sync-engine.tsx міряє `String.length`,
 *    тобто одиниці UTF-16, де те саме емодзі займає дві.
 * Пройти треба обидві: назва, що влазить лише в одну з них, дає запис, який
 * або мовчки не потрапляє в outbox, або летить на сервер і вертається
 * `rejected` — в обох випадках ліміт «збережено», але його ніде немає.
 */
export function isUsableBudgetId(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  return [...trimmed].length <= MAX_BUDGET_ID_LENGTH && trimmed.length <= MAX_RECORD_ID_LENGTH;
}

/** Ліміт витрат на категорію за місяць. `id` ЗАВЖДИ дорівнює `category`. */
export interface BudgetLimit {
  id: string;
  category: string;
  icon: IconSymbolName;
  /** Місячний ліміт в ОСНОВНІЙ валюті. 0 — ліміту немає. */
  limit: number;
  updatedAt?: string;
}

/**
 * Форма даних перевіряється ДО використання — по ОДНОМУ запису.
 *
 * Екран бюджету падав саме на формі, а не на логіці: `budget_limits` у вигляді
 * обʼєкта, рядок без `category`, `limit: null`, id від давнього UUID-варіанта.
 * Такий стан дають стара форма ключа, недоїхала міграція й підмінений бекап —
 * тобто реальні дані реальних людей. Раніше будь-який із цих випадків або
 * валив рендер (`a.category.localeCompare` на `undefined`, ширина смужки
 * `NaN%`), або, через `!ok`, гасив ВЕСЬ екран плашкою помилки.
 *
 * Правило тут одне: пошкоджена ОДИНИЦЯ даних коштує рівно себе. Рядок без
 * назви категорії показати нема як — його пропускаємо; решту показуємо.
 *
 * Заразом це й МІГРАЦІЯ id: він мусить дорівнювати назві, тож чужий id
 * (давній UUID, обрізаний, задовгий) не переживає читання. Наступний запис
 * поставить старому ключу тумбстоун, а новий створить під правильним, — саме
 * тому окремий `storedId`, як у вебі, тут не потрібен: `saveSynced` дифить за
 * `id` і робить цю пару мутацій сам.
 */
export function sanitizeBudgetLimits(rows: unknown): BudgetLimit[] {
  if (!Array.isArray(rows)) return [];
  // Map, а не масив із пошуком: дублікати по категорії — звичайна річ після
  // того, як пресети осідали в сховищі, і схлопнути їх треба саме тут.
  const byCategory = new Map<string, BudgetLimit>();
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const raw = row as Record<string, unknown>;
    const category = typeof raw.category === 'string' ? raw.category.trim() : '';
    if (!category || byCategory.has(category)) continue;
    const limit = Number(raw.limit);
    byCategory.set(category, {
      id: category,
      category,
      icon: (typeof raw.icon === 'string' && raw.icon ? raw.icon : FALLBACK_BUDGET_ICON) as IconSymbolName,
      // Number.isFinite відсікає і NaN, і ±Infinity: перше отруїло б підсумок
      // місяця, друге зробило б смужку нульовою назавжди.
      limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
      ...(typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
    });
  }
  return [...byCategory.values()];
}

/** Збережені ліміти, чий id сервер не прийме, — їх видно в UI попередженням. */
export function unsyncableBudgetCategories(rows: readonly BudgetLimit[]): string[] {
  return rows.filter(row => !isUsableBudgetId(row.category)).map(row => row.category);
}

// ─── Пресети: стабільний ключ, перекладена назва ──────────────────────────────

/**
 * Українська назва дефолтної категорії ↔ англійська.
 *
 * Пари беруться ПОЗИЦІЙНО з двох дефолтних списків: у них один і той самий
 * набір понять у тому самому порядку, і «Їжа» — це «Food» саме тому, що вони
 * стоять під одним індексом.
 */
const PRESET_TWIN = (() => {
  const map = new Map<string, string>();
  DEFAULT_CATEGORIES_UK.expense.forEach((uk, index) => {
    const en = DEFAULT_CATEGORIES_EN.expense[index];
    if (!en) return;
    map.set(uk.name, en.name);
    map.set(en.name, uk.name);
  });
  return map;
})();

/** Та сама категорія іншою мовою, якщо це дефолтна категорія. */
export function presetTwin(name: string): string | undefined {
  return PRESET_TWIN.get(name);
}

/** Пресет списку бюджету: ключ окремо від того, що бачить людина. */
export interface BudgetPreset {
  /** Рядок, за яким категорію звіряють транзакції. Від мови НЕ залежить. */
  key: string;
  /** Те, що показуємо. Від мови залежить — і лише воно. */
  label: string;
  icon: IconSymbolName;
}

/**
 * Пресети категорій бюджету.
 *
 * `expenseCategoryPresets` навмисно викликається з 'uk', а не з мовою
 * інтерфейсу. Причина: збережені категорії користувача він віддає як є (мова
 * там ні до чого), а дефолти — по мові, і саме через це КЛЮЧ рядка бюджету
 * стрибав разом з інтерфейсом. Українські й англійські дублі, які люди бачили
 * в списку, — наслідок саме цього: перемкнув мову, зберіг будь-який ліміт — і
 * в 'budget_limits' осіли обидва набори.
 *
 * Тепер ключ завжди один (збережена назва або український дефолт), а мова
 * впливає лише на підпис.
 */
export function budgetPresets(rows: readonly CategoryRowLike[], lang: string): BudgetPreset[] {
  return expenseCategoryPresets(rows, 'uk').map(def => ({
    key: def.name,
    label: lang === 'uk' ? def.name : (PRESET_TWIN.get(def.name) ?? def.name),
    icon: def.icon,
  }));
}

// ─── Рядки списку ─────────────────────────────────────────────────────────────

export interface BudgetRow extends BudgetLimit {
  /** Підпис для показу: у пресета — перекладений, у решти — сама назва. */
  label: string;
  spent: number;
  /** Категорія прийшла з пресетів або транзакцій, збереженого ліміту немає. */
  isAutoAdded: boolean;
  /** Ліміт можна зберегти: назва влазить у межу id (див. isUsableBudgetId). */
  syncable: boolean;
}

/**
 * Повний список для показу: збережені ліміти + пресети + категорії, знайдені
 * в транзакціях.
 *
 * Пресет НЕ додається, коли та сама категорія вже є під іншою мовою: якщо
 * гроші лежать у «Food», рядок «Їжа» поруч — це не друга категорія, а той
 * самий пресет, показаний двічі. Перемога тут завжди за тією назвою, під якою
 * РЕАЛЬНО лежать дані, а не за мовою інтерфейсу.
 *
 * Категорії беруться з ОБОХ джерел витрат — і з основної валюти, і з
 * неврахованих: та, у якій витрачали лише долари, не має зникати зі списку
 * тільки тому, що в основній валюті по ній нуль.
 */
export function buildBudgetRows(
  saved: readonly BudgetLimit[],
  presets: readonly BudgetPreset[],
  spent: Record<string, number>,
  uncounted: UncountedSpend,
): BudgetRow[] {
  const rows: BudgetRow[] = saved.map(limit => ({
    ...limit,
    label: limit.category,
    spent: spent[limit.category] ?? 0,
    isAutoAdded: false,
    syncable: isUsableBudgetId(limit.category),
  }));
  const taken = new Set(rows.map(row => row.category));
  // Порожня назва ('' — реальний стан даних) рядка не отримує: показати її
  // нема як, а гроші по ній видно в лічильнику неврахованого. Так само робить
  // веб (lib/budget.ts, buildBudgetRows).
  const fromSpending = [...Object.keys(spent), ...Object.keys(uncounted)].filter(Boolean);
  const spendingSet = new Set(fromSpending);

  for (const preset of presets) {
    if (taken.has(preset.key)) continue;
    const twin = PRESET_TWIN.get(preset.key);
    if (twin && (taken.has(twin) || spendingSet.has(twin))) continue;
    taken.add(preset.key);
    rows.push({
      id: preset.key,
      category: preset.key,
      label: preset.label,
      icon: preset.icon,
      limit: 0,
      spent: spent[preset.key] ?? 0,
      isAutoAdded: true,
      syncable: isUsableBudgetId(preset.key),
    });
  }

  for (const category of fromSpending) {
    if (taken.has(category)) continue;
    taken.add(category);
    rows.push({
      id: category,
      category,
      label: category,
      icon: FALLBACK_BUDGET_ICON,
      limit: 0,
      spent: spent[category] ?? 0,
      isAutoAdded: true,
      syncable: isUsableBudgetId(category),
    });
  }

  return rows.sort((left, right) => {
    const diff = right.spent - left.spent;
    return diff !== 0 ? diff : left.label.localeCompare(right.label, 'uk');
  });
}

export interface BudgetTotals {
  totalBudget: number;
  /** Витрати ТИХ САМИХ категорій, з яких складено totalBudget. */
  totalSpent: number;
  /** Витрати категорій без ліміту — окремим рядком, а не в підсумку. */
  unbudgetedSpent: number;
}

/**
 * Підсумки місяця — обидва числа з ОДНОГО набору категорій.
 *
 * Було інакше, і це був баг: «БЮДЖЕТ» складався лише з категорій, що мають
 * ліміт, а «ВИТРАЧЕНО» — з усіх підряд. Поруч стояли два числа, які в
 * принципі не мусили сходитись, а під ними «Залишилось» і відсоток, пораховані
 * з їхньої різниці. У людини з одним налаштованим лімітом картка показувала
 * перевитрату там, де її не було.
 *
 * Витрати поза лімітами не зникають — вони в `unbudgetedSpent` і показуються
 * окремим рядком. Ховати їх не можна (це справжні гроші), додавати в
 * «витрачено з бюджету» — теж (це витрати поза бюджетом).
 */
export function budgetTotals(rows: readonly BudgetRow[]): BudgetTotals {
  let totalBudget = 0;
  let totalSpent = 0;
  let unbudgetedSpent = 0;
  for (const row of rows) {
    if (row.limit > 0) {
      totalBudget += row.limit;
      totalSpent += row.spent;
    } else {
      unbudgetedSpent += row.spent;
    }
  }
  return { totalBudget, totalSpent, unbudgetedSpent };
}

/** Частка витраченого, обрізана по 1: смужка довша за доріжку не буває. */
export function barRatio(spent: number, limit: number): number {
  if (!(limit > 0) || !Number.isFinite(spent)) return 0;
  return Math.min(Math.max(spent, 0) / limit, 1);
}

export function isOverLimit(spent: number, limit: number): boolean {
  return limit > 0 && spent > limit;
}

/**
 * Ліміт із поля вводу. Кома як десятковий роздільник обовʼязкова: на
 * українській розкладці її набирають частіше за крапку, а `parseFloat('1,5')`
 * тихо дав би 1.
 */
export function parseLimit(input: string): number {
  const value = parseFloat(input.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
