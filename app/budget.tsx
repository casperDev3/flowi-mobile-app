import { fontFamily, radius, shadow, space, touchTarget, type as dsType } from '@/constants/theme';
/**
 * app/budget.tsx — місячні ліміти витрат по категоріях.
 *
 * ЧОМУ ЕКРАН НЕ ВІДКРИВАВСЯ. Колекція лімітів читалась як одне ціле: будь-яка
 * біда — обірваний запис, підмінений бекап, стара форма ключа — давала
 * `loadDataResult.ok === false`, і завантаження робило ранній `return`. Замість
 * бюджету лишалась плашка «Дані не прочитались» із кнопкою «Повторити», яка
 * перечитує ТІ САМІ байти, тобто не може допомогти ніколи. А на рівень нижче,
 * коли колекція все ж парсилась, окремий битий рядок (без `category`, з
 * `limit: null`, з давнім UUID-id) проходив перевірку `typeof row === 'object'`
 * і валив уже рендер: `a.category.localeCompare(...)` на `undefined`, ширина
 * смужки `NaN%`, однакові React-ключі.
 *
 * Правило тепер одне й живе в `utils/budgetUtils.ts`: пошкоджена ОДИНИЦЯ даних
 * коштує рівно себе. `sanitizeBudgetLimits` викидає те, що показати нема як, і
 * віддає решту; збій читання ВСІЄЇ колекції більше не гасить екран — витрати
 * рахуються з транзакцій і далі, а плашка каже, що ліміти зараз не
 * зберігаються (шар сховища їх і так блокує — ERR-01).
 *
 * Три речі, які легко зламати «покращенням»:
 *
 * 1. У витрати йде СТРОГО `type === 'expense'`. Переказ між своїми рахунками
 *    витратою не є: зарахувати його означало б зʼїдати ліміт щоразу, коли
 *    гроші просто зняли з картки, та ще й створити порожній рядок — категорії
 *    в переказу немає взагалі.
 * 2. Курсів у застосунку немає, а ліміт завжди в ОСНОВНІЙ валюті. Тому екран
 *    не конвертує, а показує те, чого не врахував.
 * 3. `id` запису дорівнює назві категорії — щоб два пристрої, які офлайн
 *    задали ліміт на ту саму категорію, зійшлися в ОДИН запис. Ціна — межа
 *    сервера в 64 символи (`isUsableBudgetId`), і форма перевіряє її сама.
 *
 * Дзеркало у вебі — `lib/budget.ts`. Будь-яка правка формули мусить статись на
 * обох платформах: бюджет — це порівняння двох чисел, і якщо телефон і браузер
 * рахують «витрачено» по-різному, людина бачить не дві думки, а зіпсовані дані.
 */
import { OverlayScrim } from '@/components/ds/OverlaySurface';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { SwipeRow, type SwipeAction } from '@/components/layout-zones';
import { useFinanceLayoutStrings } from '@/components/finance/layoutStrings';
import { dsTheme, glassOf } from '@/components/shared/dsTheme';
import { Stack, router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

import { BudgetMonthsTable } from '@/components/finance/BudgetMonthsTable';
import { LoadErrorNotice } from '@/components/finance/LoadErrorNotice';
import { MonthPicker } from '@/components/shared/MonthPicker';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { isSameMonth as sameMonth } from '@/utils/dateUtils';
import {
  buildBudgetRows,
  budgetPresets,
  budgetTotals,
  budgetTxCurrency,
  barRatio,
  formatUncounted,
  isOverLimit,
  isUsableBudgetId,
  MAX_BUDGET_ID_LENGTH,
  parseLimit,
  sanitizeBudgetLimits,
  uncountedSpendByCategory,
  type BudgetLimit,
  type BudgetRow,
} from '@/utils/budgetUtils';
import { budgetMonthRows } from '@/utils/budgetMonths';
import {
  DEFAULT_MONEY_SCOPE,
  MONEY_SCOPES,
  MONEY_SCOPE_KEY,
  filterByMoneyScope,
  normalizeMoneyScope,
  type MoneyScope,
} from '@/utils/budgetScope';
import type { CategoryRow } from '@/store/migrations';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useDS } from '@/hooks/use-ds';
import { finPalette } from '@/components/finance/finPalette';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { loadDataResult, retryStorageRead, saveData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import {
  BUILTIN_CURRENCIES, formatCurrency, type Currency, type Transaction,
} from '@/utils/financeUtils';
import { type Account } from '@/utils/accounts';
import { WIDE_CONTENT_MAX_WIDTH, useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { wideModalStyles } from '@/components/finance/wideModal';
import { useResponsive } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import {
  BentoCard, BentoGrid, BentoPeriodPill, KpiCounter, MeshBackground, PageHeader, SegmentedProgress,
} from '@/components/ds';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * DS v2: синього акценту екрана більше немає. Головні дії — pill
 * action.primary, прогрес — accent.amber (≤80%) / accent.coral (ближче до
 * ліміту й понад), текст і гліфи — text.primary/secondary (A11Y-05 тримає
 * сама тема: усі пари ≥ 4.5:1).
 */

const ICON_OPTIONS: IconSymbolName[] = [
  'fork.knife', 'car.fill', 'gamecontroller.fill', 'cross.fill', 'house.fill',
  'tag.fill', 'ellipsis.circle.fill', 'cart.fill', 'bag.fill', 'creditcard.fill',
  'banknote', 'person.fill', 'airplane', 'heart.fill', 'star.fill', 'flame.fill',
  'bolt.fill', 'leaf.fill', 'books.vertical.fill', 'graduationcap.fill',
  'phone.fill', 'camera.fill', 'bicycle', 'figure.walk', 'drop.fill',
  'pawprint.fill', 'building.2.fill', 'wrench.fill', 'chart.bar.fill',
];

const LIMIT_PRESETS = [500, 1000, 1500, 2000, 3000, 5000, 10000];

/**
 * Ключі, з яких складається екран. Поки вкладка ВІДКРИТА, у них пишуть і
 * інші: рушій синку (ліміт, заданий на вебі), `persistTxs` «Фінансів»
 * (операція, додана тут же, пишеться асинхронно), сусідні екрани. Без
 * підписки панель жила зі знімком моменту фокуса — саме це й виглядало як
 * «бюджет не працює». Ракурс (MONEY_SCOPE_KEY) сюди не входить: у вбудованій
 * вкладці він приходить пропом зі спільного фільтра.
 */
const BUDGET_REFRESH_KEYS = [
  'budget_limits', 'transactions', 'accounts', 'categories',
  'finance_primary_currency', 'finance_currencies',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameMonth(dateStr: string, month: Date): boolean {
  // Делегує спільній утиліті замість власного порівняння: копія цієї умови
  // жила тут із власною сигнатурою, і будь-яка правка правила про місяць
  // (наприклад, перехід на локальний час) полагодила б лише одне з двох місць.
  const at = new Date(dateStr);
  return !Number.isNaN(at.getTime()) && sameMonth(at, month);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Палітра винесена з тіла екрана: `useMemo` віддає той самий об'єкт між
 * рендерами, інакше кожен рядок категорії отримує нові кольори і `React.memo`
 * на ньому нічого не заощаджує.
 */
function makeColors(isDark: boolean, reduceTransparency = false) {
  // Токени DS v2 (components/finance/finPalette.ts) — спільні для всього розділу.
  const p = finPalette(isDark, reduceTransparency);
  return {
    ...p,
    coral: p.t.accent.coral,
  };
}

type BudgetColors = ReturnType<typeof makeColors>;

/**
 * Підпис перемикача «Всі / Особисті / Проєктні» — порядок задає MONEY_SCOPES.
 * Жив у `utils/budgetStrings.ts` разом із таблицею рядків; таблиця переїхала в
 * словник, а вибір підпису — сюди, до єдиного місця, де його читають.
 */
function moneyScopeLabel(scope: string, tr: Translations): string {
  if (scope === 'personal') return tr.budgetScopePersonal;
  if (scope === 'project') return tr.budgetScopeProject;
  return tr.budgetScopeAll;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

/**
 * Вкладка «Бюджет» розділу «Фінанси» (finance-revamp.md §2.4, §5.5).
 *
 * Один компонент на два входи: Stack-маршрут `/budget` (сайдбар планшета,
 * `router.push` з бюджету проєкту) малює його з власною шапкою, а вкладка
 * `(tabs)/explore?tab=budget` — вбудованим (`embedded`): місяць і ракурс тоді
 * приходять зі спільного фільтра розділу, а шапка — розділу.
 */
export interface BudgetEmbed {
  /** Перший місяць періоду фільтра. */
  month: Date;
  /** Місяці періоду ('YYYY-MM', utils/finance/period.ts monthsOf). Більше одного — таблиця по місяцях. */
  months: readonly string[];
  scope: MoneyScope;
  bottomInset: number;
  /**
   * Валюта спільного фільтра. Бюджет її НЕ застосовує (ліміти в основній
   * валюті, курсів немає) — лише попереджає, як веб (budget-tab.tsx).
   */
  currency: string;
  /**
   * «Показати місяць»: у кварталі/році/довільному періоді панель показує лише
   * таблицю по місяцях — редагувати там нічого. Кнопка перемикає СПІЛЬНИЙ
   * фільтр розділу на поточний місяць (власника фільтра знає лише екран).
   */
  onShowMonth?: () => void;
}

export default function BudgetScreen() {
  return <BudgetPanel />;
}

export function BudgetPanel({ embedded }: { embedded?: BudgetEmbed } = {}) {
  const readingWidth = useContentWidth();
  const { isWide, isExpanded } = useResponsive();
  // Ландшафт планшета: підсумок ліворуч, рядки категорій праворуч — у
  // ширшій колонці (Layout.wideMaxWidth). Портрет і телефон — одна колонка
  // для читання, як і було.
  const contentWidth = useMemo(
    () => (isExpanded ? { ...readingWidth, maxWidth: WIDE_CONTENT_MAX_WIDTH } : readingWidth),
    [isExpanded, readingWidth],
  );
  // Аркуші ліміту/категорії — діалогом посеред екрана на планшеті.
  const wm = wideModalStyles(isWide, 'slide');
  const sheetSurface = useSheetSurface();
  const { isDark, reduceTransparency } = useDS();
  const { tr, lang } = useI18n();

  const c = useMemo(() => makeColors(isDark, reduceTransparency), [isDark, reduceTransparency]);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  // Межу довжини підставляє екран, а не словник: `store/translations.ts` не
  // залежить від utils і лишається чистою таблицею рядків.
  const tooLongError = useMemo(
    () => tr.budgetErrorTooLong.replace('{max}', String(MAX_BUDGET_ID_LENGTH)),
    [tr.budgetErrorTooLong],
  );

  // ─── State ────────────────────────────────────────────────────────────────

  /**
   * ЛИШЕ те, що справді лежить у 'budget_limits'.
   *
   * Пресети сюди не домішуються, і це головна половина фіксу дублікатів:
   * раніше стан екрана був «збережене + пресети», а `saveBudgets` писав його
   * цілком — тобто будь-яка правка одного ліміту осаджувала в сховище ще й
   * сім порожніх пресетних рядків поточної мови. Перемкнув мову, зберіг ще
   * раз — і поруч лежать «Їжа» та «Food».
   */
  const [savedLimits, setSavedLimits] = useState<BudgetLimit[]>([]);
  const [presets, setPresets] = useState(() => budgetPresets([], 'uk'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // Довідник валют: у нової операції валюта береться з її рахунку, а поле
  // currency лишилося тільки в записах, створених до появи рахунків.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>('UAH');
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [ownMonth, setActiveMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  /** «Всі / Особисті / Проєктні» — погляд, а не модель (utils/budgetScope.ts). */
  const [ownScope, setScope] = useState<MoneyScope>(DEFAULT_MONEY_SCOPE);
  // Вбудована вкладка бере місяць і ракурс зі СПІЛЬНОГО фільтра розділу —
  // другого, власного перемикача поруч із ним бути не може.
  const activeMonth = embedded ? embedded.month : ownMonth;
  const scope = embedded ? embedded.scope : ownScope;
  const multiMonth = !!embedded && embedded.months.length > 1;

  // Edit modal
  const [editItem, setEditItem]         = useState<BudgetRow | null>(null);
  const [editLimit, setEditLimit]       = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Add category modal
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newCatName, setNewCatName]       = useState('');
  const [newCatIcon, setNewCatIcon]       = useState<IconSymbolName>('ellipsis.circle.fill');
  const [newCatLimit, setNewCatLimit]     = useState('');
  const [addError, setAddError]           = useState<string | null>(null);
  /** ERR-01: «ліміти не прочитались» — окремий стан, а не порожній бюджет. */
  const [loadFailed, setLoadFailed] = useState(false);
  /** Перше читання завершилось — лише тоді слухаємо сховище (як `initialized`). */
  const [loaded, setLoaded] = useState(false);
  /** Останній запис лімітів провалився і був відкочений — кажемо про це вголос. */
  const [saveError, setSaveError] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async (retry = false) => {
    // Аліас із явним типом: union двох generic-функцій втрачає параметр T.
    const read: typeof loadDataResult = retry ? retryStorageRead : loadDataResult;
    const [savedBudgets, txs, primCur, curList, accs, catRows, scopePref] = await Promise.all([
      read<unknown>('budget_limits', []),
      read<Transaction[]>('transactions', []),
      read<string>('finance_primary_currency', 'UAH'),
      read<Currency[]>('finance_currencies', []),
      read<Account[]>('accounts', []),
      read<CategoryRow[]>('categories', []),
      loadDataResult<string>(MONEY_SCOPE_KEY, DEFAULT_MONEY_SCOPE),
    ]);

    setPrimaryCurrency(primCur.ok ? (primCur.value || 'UAH') : 'UAH');
    setCustomCurrencies(curList.ok && Array.isArray(curList.value) ? curList.value : []);
    setAccounts(accs.ok && Array.isArray(accs.value) ? accs.value : []);
    setScope(normalizeMoneyScope(scopePref.ok ? scopePref.value : DEFAULT_MONEY_SCOPE));

    // ERR-01. 'budget_limits' — єдиний ключ, у який цей екран пише. Якщо він
    // не прочитався, ліміти вважаємо невідомими (а не порожніми) і лишаємо
    // екран у режимі читання: перша ж правка записала б порожній список
    // поверх справжніх лімітів — шар сховища такий запис і так відхилить
    // (StorageWriteBlockedError), але показувати кнопки, що не працюють,
    // нечесно. Решта екрана при цьому жива: витрати рахуються з транзакцій.
    setLoadFailed(!savedBudgets.ok);
    // Форму перевіряємо ДО використання, і по ОДНОМУ запису: битий рядок не
    // має коштувати цілого екрана. Тут же й міграція id — див. шапку файлу.
    setSavedLimits(savedBudgets.ok ? sanitizeBudgetLimits(savedBudgets.value) : []);

    const txRows = txs.ok && Array.isArray(txs.value)
      ? txs.value.filter((row): row is Transaction => !!row && typeof row === 'object')
      : [];
    setTransactions(txRows);

    // Пресети беремо з категорій, під якими операції лежать НАСПРАВДІ. КЛЮЧ
    // рядка при цьому від мови не залежить (budgetPresets просить 'uk'), а
    // перекладається лише підпис — інакше перемикання мови створювало б другу
    // копію тієї самої категорії.
    setPresets(budgetPresets(catRows.ok && Array.isArray(catRows.value) ? catRows.value : [], lang));
    setLoaded(true);
  }, [lang]);

  useFocusEffect(useCallback(() => {
    load().catch(e => { if (__DEV__) console.warn('[budget] завантаження не вдалося:', e); });
  }, [load]));

  /**
   * Перечитуємо, щойно в сховище записали повз панель (див. BUDGET_REFRESH_KEYS).
   * `trackWrite` обгортає ВЛАСНИЙ запис лімітів, щоб він не перечитував сам себе.
   */
  const trackWrite = useStorageRefresh(BUDGET_REFRESH_KEYS, () => load(), loaded);

  /** «Повторити»: без retryStorageRead ключ лишається заблокованим на запис. */
  const retryLoad = useCallback(() => { void load(true); }, [load]);

  // Останній показаний стан лімітів — точка відкату, якщо запис провалиться.
  const savedLimitsRef = useRef(savedLimits);
  useEffect(() => { savedLimitsRef.current = savedLimits; }, [savedLimits]);

  const saveLimits = useCallback((next: BudgetLimit[]) => {
    const prev = savedLimitsRef.current;
    savedLimitsRef.current = next;
    setSavedLimits(next);
    setSaveError(false);
    // id похідний від назви категорії: два пристрої, що офлайн додали ліміт на
    // ту саму категорію, мусять зійтись в один запис, а не в два.
    //
    // Провал запису (ERR-01: ключ заблокований після збою читання; повний
    // диск тощо) раніше лише логувався в dev — людина бачила ліміт, якого в
    // сховищі немає, і він зникав при наступному вході. Тепер стан
    // відкочується, а панель каже, що зміну не збережено. Відкат — лише якщо
    // відтоді ніхто не замінив стан (перечитування синку — вже правда сховища).
    void trackWrite(
      () => saveSynced('budget_limits', next.map(b => ({ ...b, id: b.category }))),
      ['budget_limits'],
    ).catch(e => {
      if (__DEV__) console.warn('[budget] запис лімітів не вдався:', e);
      setSavedLimits(cur => {
        if (cur !== next) return cur;
        savedLimitsRef.current = prev;
        return prev;
      });
      setSaveError(true);
    });
  }, [trackWrite]);

  /**
   * Ліміти не прочитались — редагування вимкнене (інакше порожній список ліг
   * би поверх справжніх). Але дотик не має бути мертвим: пояснюємо, чому.
   */
  const explainReadOnly = useCallback(() => {
    Alert.alert(tr.budgetReadOnlyTitle, tr.budgetReadOnlyBody);
  }, [tr.budgetReadOnlyTitle, tr.budgetReadOnlyBody]);

  const openAdd = useCallback(() => {
    if (loadFailed) { explainReadOnly(); return; }
    setAddError(null);
    setShowAddModal(true);
  }, [loadFailed, explainReadOnly]);

  const changeScope = useCallback((next: MoneyScope) => {
    setScope(next);
    // Запамʼятовується на пристрої: ракурс — стан погляду, не дані.
    void saveData(MONEY_SCOPE_KEY, next)
      .catch(e => { if (__DEV__) console.warn('[budget] запис фільтра не вдався:', e); });
  }, []);

  // ─── Computed ─────────────────────────────────────────────────────────────

  // Бюджет рахується в основній валюті — тій самій, що показують «Фінанси».
  const currency = useMemo<Currency>(
    () => [...BUILTIN_CURRENCIES, ...customCurrencies].find(cur => cur.code === primaryCurrency)
      ?? BUILTIN_CURRENCIES[0],
    [customCurrencies, primaryCurrency],
  );
  const currencySymbol = currency.symbol;
  const fmt = useCallback((n: number) => formatCurrency(n, currency, locale), [currency, locale]);

  /**
   * Операції обраного ракурсу. Записи з `projectId` лишаються в тому самому
   * потоці — фільтр лише звужує погляд, нічого не ховаючи з даних.
   */
  const scopedTransactions = useMemo(
    () => filterByMoneyScope(transactions, scope) as Transaction[],
    [transactions, scope],
  );

  /**
   * Фактичні витрати за категоріями обраного місяця — лише основна валюта.
   *
   * `type === 'expense'` тут навмисно строге порівняння, а не «все, що не
   * дохід»: переказ між своїми рахунками витратою не є, і зарахувати його в
   * ліміт означало б з'їдати бюджет «Інше» щоразу, коли гроші просто зняли з
   * картки. Категорії в переказу немає взагалі, тож він ще й створив би
   * порожній рядок у списку.
   */
  const actualByCategory = useMemo(() => {
    // Object.create(null): ключ — назва категорії, яку набрав користувач.
    // У звичайному літералі 'constructor' і 'toString' уже «є», тож
    // `map[cat] ?? 0` дало б успадковану функцію замість нуля, а сума
    // категорії перетворилася б на NaN.
    const map: Record<string, number> = Object.create(null);
    for (const tx of scopedTransactions) {
      if (tx.type !== 'expense') continue;
      if (!isSameMonth(tx.date, activeMonth)) continue;
      if (budgetTxCurrency(tx, accounts, primaryCurrency) !== primaryCurrency) continue;
      const amount = Number(tx.amount);
      if (!Number.isFinite(amount)) continue;
      const category = typeof tx.category === 'string' ? tx.category : '';
      map[category] = (map[category] ?? 0) + amount;
    }
    return map;
  }, [scopedTransactions, accounts, activeMonth, primaryCurrency]);

  // Скільки витрат місяця лишилося поза бюджетом через іншу валюту — для
  // підказки під шапкою. Перекази не рахуємо й тут: вони не витрати в жодній
  // валюті, і згадка про них лише збивала б з пантелику.
  const otherCurrencyCount = useMemo(() => {
    return scopedTransactions.filter(
      tx =>
        tx.type === 'expense' &&
        isSameMonth(tx.date, activeMonth) &&
        budgetTxCurrency(tx, accounts, primaryCurrency) !== primaryCurrency,
    ).length;
  }, [scopedTransactions, accounts, activeMonth, primaryCurrency]);

  /**
   * Витрати категорії в ЧУЖИХ валютах — ті, що в ліміт не потрапили.
   *
   * Показуємо їх під самою категорією, а не лише лічильником у шапці: доти
   * ліміт міг світитися зеленим, коли поруч лежали неврахованих 120 $, і
   * екран про це мовчав саме там, де на нього дивляться.
   */
  const uncountedByCategory = useMemo(
    () => uncountedSpendByCategory(scopedTransactions, accounts, activeMonth, primaryCurrency),
    [scopedTransactions, accounts, activeMonth, primaryCurrency],
  );

  const symbolFor = useCallback(
    (code: string) =>
      [...BUILTIN_CURRENCIES, ...customCurrencies].find(cur => cur.code === code)?.symbol ?? code,
    [customCurrencies],
  );

  const displayBudgets = useMemo(
    () => buildBudgetRows(savedLimits, presets, actualByCategory, uncountedByCategory),
    [savedLimits, presets, actualByCategory, uncountedByCategory],
  );

  // Обидва числа картки — з ОДНОГО набору категорій (див. budgetTotals).
  const totals = useMemo(() => budgetTotals(displayBudgets), [displayBudgets]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const openEdit = useCallback((item: BudgetRow) => {
    if (loadFailed) { explainReadOnly(); return; }
    setEditItem(item);
    setEditLimit(item.limit > 0 ? String(item.limit) : '');
    setShowEditModal(true);
  }, [loadFailed, explainReadOnly]);

  function saveEdit() {
    if (!editItem) return;
    const limit = parseLimit(editLimit);
    const alreadySaved = savedLimits.some(b => b.category === editItem.category);
    if (alreadySaved) {
      saveLimits(savedLimits.map(b => (b.category === editItem.category ? { ...b, limit } : b)));
    } else {
      saveLimits([...savedLimits, {
        id: editItem.category,
        category: editItem.category,
        icon: editItem.icon,
        limit,
      }]);
    }
    setShowEditModal(false);
  }

  const lz = useFinanceLayoutStrings();
  const rowSwipeActions = (item: BudgetRow): SwipeAction[] => [
    { key: 'edit', label: lz.swipeEdit, icon: 'pencil', tone: 'neutral', onPress: () => openEdit(item) },
    ...(item.isAutoAdded ? [] : [{
      key: 'delete', label: lz.swipeDelete, icon: 'trash.fill' as const, tone: 'danger' as const,
      // Той самий «лише читання», що й у формі: незчитане сховище не переписуємо.
      onPress: () => { if (loadFailed) { explainReadOnly(); return; } deleteCategory(item.category); },
    }]),
  ];

  function deleteCategory(cat: string) {
    Alert.alert(tr.budgetDeleteTitle, tr.budgetDeleteMsg.replace('{name}', cat), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => saveLimits(savedLimits.filter(b => b.category !== cat)),
      },
    ]);
  }

  /** Перевірка назви ДО збереження — дзеркало web `categoryNameError`. */
  function categoryNameError(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    // Дублікат відхиляється ТОЧНИМ порівнянням рядка: саме за рядком категорію
    // звіряють витрати, тож «Їжа » і «Їжа» — різні категорії, і мовчки зливати
    // їх не можна.
    if (displayBudgets.some(row => row.category === trimmed)) return tr.budgetErrorExists;
    if (!isUsableBudgetId(trimmed)) return tooLongError;
    return null;
  }

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const error = categoryNameError(name);
    if (error) { setAddError(error); return; }
    saveLimits([...savedLimits, {
      id: name,
      category: name,
      icon: newCatIcon,
      limit: parseLimit(newCatLimit),
    }]);
    setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); setNewCatLimit(''); setAddError(null);
    setShowAddModal(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  /** Дві колонки — лише коли є що ставити поруч: підсумок і рядки. */
  const splitColumns = isExpanded && !multiMonth && totals.totalBudget > 0 && displayBudgets.length > 0;

  // KPI шапки (лише окремий екран; вбудована вкладка має шапку «Фінансів»).
  // Без лімітів показувати нічого — нулі брехали б, що бюджет порожній.
  const spentPct = totals.totalBudget > 0 ? Math.round((totals.totalSpent / totals.totalBudget) * 100) : 0;
  const budgetKpis = !embedded && !multiMonth && totals.totalBudget > 0 ? (
    <>
      <KpiCounter value={fmt(totals.totalSpent)} label={tr.budgetSpentCaps.charAt(0) + tr.budgetSpentCaps.slice(1).toLowerCase()} delta={`${spentPct}%`}
        deltaTone={totals.totalSpent > totals.totalBudget ? 'down' : 'neutral'} />
      <KpiCounter value={fmt(Math.max(0, totals.totalBudget - totals.totalSpent))} label={tr.budgetLeft}
        valueColor={totals.totalSpent > totals.totalBudget ? c.red : undefined} />
    </>
  ) : undefined;

  return (
    <View style={{ flex: 1 }}>
      {!embedded ? <Stack.Screen options={{ headerShown: false }} /> : null}
      {!embedded ? <MeshBackground /> : null}

      {/* Шапка, перемикач місяця і вміст стоять в ОДНІЙ колонці: на планшеті
          хедер, розтягнутий на всю ширину, «від'їжджав» від списку під ним. */}
      {/* Omni (DS v2.2): під заголовком — KPI місяця (витрачено / залишок), ті
          самі budgetTotals, що й картка нижче. Окремий екран лишається на
          ScreenHeader (стрілка «Назад» / крихти), глобальна шапка — у «Фінансах». */}
      {!embedded ? (
      <View style={contentWidth}>
        <ScreenHeader
          title={tr.navBudget}
          color={c.text}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { ...c.gl.card, borderColor: 'transparent' },
          }}
          actions={
            <HeaderButton
              onPress={openAdd}
              accessibilityLabel={tr.add}
              style={{ backgroundColor: c.action, borderColor: 'transparent', borderRadius: radius.pill }}>
              <IconSymbol name="plus" size={18} color={c.onAction} />
            </HeaderButton>
          }>
          <MonthPicker
            month={activeMonth}
            onChange={setActiveMonth}
            months={tr.months}
            monthsShort={tr.monthsShort}
            monthsGenitive={tr.monthsGenitive}
            accentColor={c.text}
            textColor={c.text}
            subColor={c.sub}
            dimColor={c.dim}
            borderColor={c.border}
          />
          {budgetKpis ? <PageHeader kpis={budgetKpis} bleed={20} style={{ marginTop: 12 }} /> : null}
        </ScreenHeader>
      </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[contentWidth, {
          paddingHorizontal: 20,
          paddingTop: embedded ? 12 : 0,
          paddingBottom: embedded ? embedded.bottomInset + 24 : 100,
        }]}
        showsVerticalScrollIndicator={false}>

        {/* Вбудована вкладка: шапка — розділу, тож «+ ліміт» живе тут. */}
        {embedded && !loadFailed ? (
          <TouchableOpacity
            onPress={openAdd}
            accessibilityRole="button"
            accessibilityLabel={tr.add}
            style={[st.inlineAdd, { backgroundColor: c.action }]}>
            <IconSymbol name="plus" size={15} color={c.onAction} />
            <Text style={{ ...dsType.label, color: c.onAction }}>{tr.budgetAddManually}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Чиї гроші показуємо. Транзакції проєктів лишаються в спільному
            потоці — це погляд, а не поділ даних. У вбудованій вкладці ракурс
            задає спільний фільтр розділу. */}
        {!embedded ? (
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={tr.budgetScopeLabel}
          style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {MONEY_SCOPES.map(option => {
            const active = scope === option;
            return (
              <TouchableOpacity
                key={option}
                onPress={() => changeScope(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active, checked: active }}
                accessibilityLabel={moneyScopeLabel(option, tr)}
                style={[st.scopeChip, {
                  backgroundColor: active ? c.action : c.card,
                }]}>
                <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold, color: active ? c.onAction : c.text }}>
                  {moneyScopeLabel(option, tr)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        ) : null}

        {/* Період, довший за місяць: ліміти ПО МІСЯЦЯХ, а не сума лімітів. */}
        {multiMonth && embedded ? (
          <BudgetMonthsTable
            rows={budgetMonthRows(savedLimits, scopedTransactions, accounts, embedded.months, primaryCurrency, 'all')}
            monthsShort={tr.monthsShort}
            fmt={fmt}
            c={c}
            title={tr.finBudgetByMonth}
            hint={tr.finBudgetMonthsHint}
            empty={tr.budgetEmptyBody}
          />
        ) : null}

        {/* У таблиці редагувати нічого — ліміт задається на МІСЯЦЬ. Без цієї
            кнопки вкладка в кварталі/році була глухою: ні рядків, ні «+». */}
        {multiMonth && embedded?.onShowMonth ? (
          <View style={{ marginBottom: 12, gap: 8 }}>
            <Text style={{ fontSize: 12, color: c.sub, lineHeight: 17 }}>{tr.budgetMultiMonthHint}</Text>
            <TouchableOpacity
              onPress={embedded.onShowMonth}
              accessibilityRole="button"
              accessibilityLabel={tr.budgetShowMonth}
              style={[st.inlineAdd, { ...c.gl.card, marginBottom: 0 }]}>
              <IconSymbol name="calendar" size={15} color={c.text} />
              <Text style={{ ...dsType.label, color: c.text }}>{tr.budgetShowMonth}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Валюта фільтра розділу бюджет не перемикає — кажемо це, як веб. */}
        {embedded && embedded.currency && embedded.currency !== primaryCurrency ? (
          <Text style={{ fontSize: 12, color: c.sub, marginBottom: 12, lineHeight: 17 }}>
            {tr.budgetPrimaryCurrencyNote.replace('{primary}', primaryCurrency)}
          </Text>
        ) : null}

        {/* Запис лімітів провалився — стан уже відкочено. */}
        {saveError ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12,
              ...c.gl.card, borderRadius: radius.nestedCompact, marginBottom: 12 }}>
            <IconSymbol name="exclamationmark.triangle.fill" size={15} color={c.coral} />
            <Text style={{ flex: 1, fontSize: 12, color: c.text, lineHeight: 17 }}>{tr.budgetSaveFailed}</Text>
          </View>
        ) : null}

        {/* Info: other-currency transactions excluded */}
        {otherCurrencyCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12,
            ...c.gl.card, borderRadius: radius.nestedCompact, marginBottom: 12 }}>
            <IconSymbol name="info.circle" size={15} color={c.t.status.info} />
            <Text style={{ flex: 1, fontSize: 12, color: c.sub, lineHeight: 17 }}>
              {tr.budgetOtherCurrenciesHint.replace('{n}', String(otherCurrencyCount))}
            </Text>
          </View>
        )}

        {/* ERR-01: збій читання лімітів. Екран лишається живим — плашка стоїть
            НАД списком і каже, що зміни зараз не зберігаються. */}
        {loadFailed && (
          <>
            <LoadErrorNotice lang={lang} isDark={isDark} text={c.text} sub={c.sub} onRetry={retryLoad} />
            {/* Чому рядки не відкриваються і «+» немає — одразу, без дотику. */}
            <Text style={{ fontSize: 12, color: c.sub, marginBottom: 12, lineHeight: 17 }}>
              {tr.budgetReadOnlyBody}
            </Text>
          </>
        )}

        {/* Omni: підсумок і категорії — BentoCard у BentoGrid. Ландшафт —
            підсумок ліворуч (1 колонка), категорії праворуч (2 колонки);
            вужче — одна під одною в тому самому порядку. */}
        {!multiMonth && (totals.totalBudget > 0 || displayBudgets.length > 0) ? (
        <BentoGrid columns={{ compact: 1, medium: 1, expanded: splitColumns ? 3 : 1 }} style={{ marginBottom: space.cardGap }}>
        {/* Total summary card */}
        {totals.totalBudget > 0 ? (
          <BentoCard
            key="summary"
            compact
            title={tr.navBudget}
            icon="chart.pie.fill"
            accent="lime"
            headerRight={<BentoPeriodPill label={`${tr.months[activeMonth.getMonth()]} ${activeMonth.getFullYear()}`} />}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={{ ...dsType.caption, color: c.sub, fontFamily: fontFamily.medium }}>{tr.budgetSpentCaps}</Text>
                {/* KPI — великі тонкі табличні цифри (Omni). */}
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ ...dsType.displaySm, fontFamily: fontFamily.light, color: c.text, marginTop: 4 }}>
                  {fmt(totals.totalSpent)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                <Text style={{ ...dsType.caption, color: c.sub, fontFamily: fontFamily.medium }}>{tr.budgetBudgetCaps}</Text>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ ...dsType.displaySm, fontFamily: fontFamily.light, fontSize: 28, lineHeight: 32, color: c.sub, marginTop: 4 }}>
                  {fmt(totals.totalBudget)}
                </Text>
              </View>
            </View>
            {/* Omni: сегментний прогрес місяця (фірмовий градієнт — підсвітка
                даних). Перевищення — червоним «Залишок» і відсотком нижче. */}
            <SegmentedProgress
              value={totals.totalSpent / totals.totalBudget}
              accessibilityLabel={`${tr.budgetSpentCaps}: ${spentPct}%`}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={{ fontSize: 12, color: c.sub }}>
                {tr.budgetLeft}: <Text style={{ fontFamily: fontFamily.semibold, color: totals.totalSpent > totals.totalBudget ? c.red : c.text }}>
                  {fmt(Math.max(0, totals.totalBudget - totals.totalSpent))}
                </Text>
              </Text>
              <Text style={{ fontSize: 12, fontFamily: fontFamily.semibold, color: totals.totalSpent > totals.totalBudget ? c.red : c.text, fontVariant: ['tabular-nums'] }}>
                {`${Math.round((totals.totalSpent / totals.totalBudget) * 100)}%`}
              </Text>
            </View>
            {/* Витрати поза лімітами не входять у «ВИТРАЧЕНО» — інакше два
                числа картки були б з різних наборів категорій і не сходились
                би ніколи. Але й ховати їх не можна: це справжні гроші. */}
            {totals.unbudgetedSpent > 0 && (
              <Text style={{ fontSize: 12, color: c.sub, marginTop: 6 }}>
                {tr.budgetOutsideLimits}: <Text style={{ fontFamily: fontFamily.semibold, color: c.text }}>{fmt(totals.unbudgetedSpent)}</Text>
              </Text>
            )}
          </BentoCard>
        ) : null}

        {/* Category rows */}
        {displayBudgets.length > 0 ? (
          <BentoCard key="rows" compact padded={false} span={splitColumns ? 2 : 1}>
            {/* Layout System v2.4: свайп уліво — «Змінити» / «Видалити» ліміт
                без відкриття форми (ті самі openEdit і deleteCategory з
                підтвердженням). Автододані рядки ліміту ще не мають — лише
                «Змінити». */}
            {displayBudgets.map((item, idx) => (
              <SwipeRow key={item.category} actions={rowSwipeActions(item)} radius={0}>
                {a11y => (
              <BudgetCategoryRow
                {...a11y}
                item={item}
                uncounted={formatUncounted(uncountedByCategory[item.category], symbolFor, locale)}
                uncountedLabel={tr.budgetUncounted}
                unsyncableLabel={tr.budgetUnsyncableRow}
                tapHint={tr.budgetTapRowHint}
                divider={idx < displayBudgets.length - 1}
                c={c}
                fmt={fmt}
                onPress={openEdit}
              />
                )}
              </SwipeRow>
            ))}
          </BentoCard>
        ) : null}
        </BentoGrid>
        ) : null}

        {/* Empty state */}
        {!multiMonth && displayBudgets.length === 0 && !loadFailed && (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <View style={[st.emptyIcon, { backgroundColor: c.limeTint }]}>
              <IconSymbol name="chart.pie.fill" size={36} color={c.lime} />
            </View>
            <Text style={{ fontSize: 17, fontFamily: fontFamily.semibold, color: c.text, marginTop: 16 }}>
              {tr.budgetEmptyTitle}
            </Text>
            <Text style={{ fontSize: 14, color: c.sub, marginTop: 6, textAlign: 'center' }}>
              {tr.budgetEmptyBody}
            </Text>
            <TouchableOpacity
              onPress={openAdd}
              style={[st.addBtn, { backgroundColor: c.action, marginTop: 24 }]}>
              <IconSymbol name="plus" size={16} color={c.onAction} />
              <Text style={{ ...dsType.label, fontSize: 15, color: c.onAction }}>{tr.budgetAddManually}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tips */}
        {!multiMonth && displayBudgets.length > 0 && !loadFailed && (
          <Text style={{ fontSize: 12, color: c.sub, textAlign: 'center', marginTop: 16 }}>
            {tr.budgetTapHint}
          </Text>
        )}
      </ScrollView>

      {/* ── Edit Limit Modal ── */}
      <Modal visible={showEditModal} transparent animationType={wm.animation} statusBarTranslucent
        onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, wm.overlay]} onPress={() => setShowEditModal(false)}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable onPress={e => e.stopPropagation()} style={[st.sheetWrapper, readingWidth, wm.column]} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <View style={[st.sheet, sheetSurface, { ...c.gl.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet }, shadow[isDark ? 'dark' : 'light'].popover]}>
                <OverlayMaterial isDark={isDark} radius={24} />
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* Handle */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.muted }} />
                </View>

                {/* Icon + title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <View style={[st.catIconBox, { backgroundColor: c.dim, width: 44, height: 44, borderRadius: radius.pill }]}>
                    {editItem && <IconSymbol name={editItem.icon} size={20} color={c.text} />}
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={{ fontSize: 18, fontFamily: fontFamily.semibold, color: c.text }}>{editItem?.label}</Text>
                    <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>{tr.budgetMonthlyForecast}</Text>
                  </View>
                </View>

                {/* Actual spent */}
                {editItem && (
                  <View style={[st.spentRow, { backgroundColor: c.dim }]}>
                    <Text style={{ fontSize: 13, color: c.sub }}>{tr.budgetActuallySpent}</Text>
                    <Text style={{ fontSize: 16, fontFamily: fontFamily.semibold, color: c.text, fontVariant: ['tabular-nums'] }}>
                      {fmt(editItem.spent)}
                    </Text>
                  </View>
                )}

                {/* Назву-ключ сервер не прийме — кажемо це ДО того, як людина
                    натисне «Зберегти» й вирішить, що ліміт збережено. */}
                {editItem && !editItem.syncable && (
                  <Text style={{ fontSize: 12, color: c.red, marginBottom: 12 }}>{tooLongError}</Text>
                )}

                {/* Limit input */}
                <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontFamily: fontFamily.medium }}>
                  {tr.budgetPlannedFor.replace('{currency}', currencySymbol)}
                </Text>
                <TextInput
                  autoFocus
                  placeholder="0"
                  placeholderTextColor={c.muted}
                  value={editLimit}
                  onChangeText={setEditLimit}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={saveEdit}
                  style={[st.input, { backgroundColor: c.input, color: c.text }]}
                />

                {/* Quick presets */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: 16 }}>
                  {LIMIT_PRESETS.map(v => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setEditLimit(String(v))}
                      // Вибраний пресет позначався ЛИШЕ кольором (A11Y-04).
                      accessibilityRole="radio"
                      accessibilityState={{ selected: editLimit === String(v), checked: editLimit === String(v) }}
                      accessibilityLabel={v.toLocaleString(locale)}
                      style={[st.preset, { backgroundColor: editLimit === String(v) ? c.action : c.dim }]}>
                      {/* I18N-03: число форматувалось жорстко в 'uk-UA'. */}
                      <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold,
                        color: editLimit === String(v) ? c.onAction : c.text, fontVariant: ['tabular-nums'] }}>{v.toLocaleString(locale)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Buttons */}
                <TouchableOpacity onPress={saveEdit}
                  style={[st.btn, { backgroundColor: c.action }]}>
                  <Text style={{ ...dsType.label, fontSize: 15, color: c.onAction }}>{tr.save}</Text>
                </TouchableOpacity>

                {editItem && !editItem.isAutoAdded && (
                  <TouchableOpacity
                    onPress={() => { setShowEditModal(false); deleteCategory(editItem.category); }}
                    style={[st.btn, { backgroundColor: c.red + '14', marginTop: 8 }]}>
                    <IconSymbol name="trash" size={15} color={c.red} />
                    <Text style={{ color: c.red, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.budgetDeleteAction}</Text>
                  </TouchableOpacity>
                )}
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Category Modal ── */}
      <Modal visible={showAddModal} transparent animationType={wm.animation} statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, wm.overlay]} onPress={() => setShowAddModal(false)}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable onPress={e => e.stopPropagation()} style={[st.sheetWrapper, readingWidth, wm.column]} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <View style={[st.sheet, sheetSurface, { ...c.gl.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet }, shadow[isDark ? 'dark' : 'light'].popover]}>
                <OverlayMaterial isDark={isDark} radius={24} />

                <ScrollView keyboardShouldPersistTaps="handled">
                  {/* Handle */}
                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.muted }} />
                  </View>

                  <Text style={{ fontSize: 18, fontFamily: fontFamily.semibold, color: c.text, marginBottom: 20 }}>
                    {tr.budgetNewCategory}
                  </Text>

                  {/* Name */}
                  <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontFamily: fontFamily.medium }}>{tr.budgetName}</Text>
                  <TextInput
                    autoFocus
                    placeholder={tr.budgetNamePlaceholder}
                    placeholderTextColor={c.muted}
                    value={newCatName}
                    onChangeText={text => { setNewCatName(text); setAddError(null); }}
                    style={[st.input, { backgroundColor: c.input, color: c.text }]}
                  />
                  {addError && (
                    <Text style={{ fontSize: 12, color: c.red, marginBottom: 6 }}>{addError}</Text>
                  )}

                  {/* Limit */}
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 14, marginBottom: 6, fontFamily: fontFamily.medium }}>
                    {tr.budgetPlannedFor.replace('{currency}', currencySymbol)}
                  </Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={c.muted}
                    value={newCatLimit}
                    onChangeText={setNewCatLimit}
                    keyboardType="decimal-pad"
                    style={[st.input, { backgroundColor: c.input, color: c.text }]}
                  />

                  {/* Icon picker */}
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 14, marginBottom: 8, fontFamily: fontFamily.medium }}>{tr.budgetIcon}</Text>
                  {/* На планшеті аркуш ширший, тож іконки не роздуваються до
                      розміру кнопки — у ряд їх стає більше. */}
                  {chunk(ICON_OPTIONS, isWide ? 10 : 7).map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      {row.map(icon => (
                        <TouchableOpacity key={icon} onPress={() => setNewCatIcon(icon)}
                          style={[st.iconOption, {
                            backgroundColor: newCatIcon === icon ? c.action : c.dim,
                            borderColor: 'transparent',
                          }]}>
                          <IconSymbol name={icon} size={18} color={newCatIcon === icon ? c.onAction : c.sub} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}

                  <TouchableOpacity onPress={addCategory} disabled={!newCatName.trim()} accessibilityState={{ disabled: !newCatName.trim() }}
                    style={[st.btn, { backgroundColor: newCatName.trim() ? c.action : c.t.state.disabledBg, marginTop: 8 }]}>
                    <Text style={{ ...dsType.label, fontSize: 15, color: newCatName.trim() ? c.onAction : c.t.state.disabledText }}>
                      {tr.budgetAddCategory}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Рядок категорії ─────────────────────────────────────────────────────────

/**
 * Один рядок бюджету.
 *
 * Мемоізація має сенс лише разом зі стабільними пропсами: палітра приходить
 * з `useMemo`, `fmt` і `onPress` — з `useCallback`, а сама категорія
 * передається аргументом натискання, а не замиканням.
 */
const BudgetCategoryRow = React.memo(function BudgetCategoryRow({
  item, uncounted, uncountedLabel, unsyncableLabel, tapHint, divider, c, fmt, onPress,
  accessibilityActions, onAccessibilityAction,
}: {
  item: BudgetRow;
  /** Витрати в чужих валютах, уже відформатовані: «120 $ · 45 €». */
  uncounted: string;
  uncountedLabel: string;
  unsyncableLabel: string;
  tapHint: string;
  divider: boolean;
  c: BudgetColors;
  fmt: (n: number) => string;
  onPress: (item: BudgetRow) => void;
  /** Layout System v2.4: дії свайпу рядка — і для VoiceOver (SwipeRow). */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
}) {
  const pct = barRatio(item.spent, item.limit);
  const isOver = isOverLimit(item.spent, item.limit);
  const barColor = isOver ? c.coral : pct > 0.8 ? c.amber : c.limeFill;
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      // Суцільне тло: під свайпом рядок не просвічує кнопки дій.
      style={{ backgroundColor: c.t.surface.card }}>
      <View style={[st.categoryRow,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
        {/* Icon */}
        <View style={[st.catIconBox, { backgroundColor: item.isAutoAdded ? c.t.surface.subtle : c.limeTint }]}>
          <IconSymbol name={item.icon} size={16} color={item.isAutoAdded ? c.sub : c.lime} />
        </View>
        {/* Info */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontFamily: fontFamily.semibold, color: c.text }}>{item.label}</Text>
            <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold, color: isOver ? c.red : c.text, fontVariant: ['tabular-nums'] }}>
              {fmt(item.spent)}
              {item.limit > 0 && (
                <Text style={{ color: c.sub, fontFamily: fontFamily.regular }}> / {fmt(item.limit)}</Text>
              )}
            </Text>
          </View>
          {/* Неврахованого не буває «трохи»: або воно є, або рядка немає.
              Показуємо ПІД прогресом, щоб не заважати читати сам ліміт, але
              в межах тієї ж картки — інакше зв'язок із категорією губиться. */}
          {uncounted ? (
            <Text style={{ fontSize: 11, color: c.sub }}>
              ⚠ {uncounted} {uncountedLabel}
            </Text>
          ) : null}
          {!item.syncable ? (
            <Text style={{ fontSize: 11, color: c.red }}>⚠ {unsyncableLabel}</Text>
          ) : null}
          {item.limit > 0 ? (
            <View style={[st.progressTrack, { backgroundColor: c.t.surface.subtle }]}>
              <View style={[st.progressFill, { backgroundColor: barColor, width: `${pct * 100}%` as `${number}%` }]} />
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: c.sub, fontStyle: 'italic' }}>
              {tapHint}
            </Text>
          )}
        </View>
        {/* Chevron */}
        <IconSymbol name="chevron.right" size={14} color={c.sub} style={{ marginLeft: 6 }} />
      </View>
    </TouchableOpacity>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  categoryRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  catIconBox:   { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  progressTrack:{ height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
  scopeChip:    { paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill },
  inlineAdd:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: radius.pill, marginBottom: 12 },
  emptyIcon:    { width: 80, height: 80, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, minHeight: 52, borderRadius: radius.pill },
  overlay:      { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheetWrapper: { width: '100%', flexShrink: 1 },
  sheet:        { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.cardPadding, paddingBottom: 36 },
  input:        { borderRadius: radius.control, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 13, fontSize: 18, fontFamily: fontFamily.medium, marginBottom: 8, fontVariant: ['tabular-nums'] },
  spentRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.nestedCompact, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
  preset:       { paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', borderRadius: radius.pill },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.pill, minHeight: 52, paddingHorizontal: 24 },
  iconOption:   { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1.5, padding: 6 },
});
