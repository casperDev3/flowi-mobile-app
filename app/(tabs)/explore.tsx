import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Alert,
  Platform,
  Pressable,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FinanceSummary, KIND_COLOR, KIND_ICON } from '@/components/finance/FinanceSummary';
import { LoadErrorNotice } from '@/components/finance/LoadErrorNotice';
import { createSheetHandoff, openAfterModalExit } from '@/components/finance/sheetHandoff';
import { UpcomingPaymentsCard, useUpcomingPayments } from '@/components/finance/UpcomingPaymentsCard';
import { TransactionGroup } from '@/components/finance/TransactionGroup';
import { PickerField, type PickerOption } from '@/components/shared/PickerField';
import { PressableScale } from '@/components/shared/PressableScale';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { SheetModal } from '@/components/shared/SheetModal';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import {
  CategoryRow,
  categoryMapToRows,
  categoryRowsToMap,
} from '@/store/migrations';
import { saveSynced, saveSyncedValue, updateSynced } from '@/store/synced-storage';
import {
  groupTransactions, mergeTransactionsForSave, resolveAccountFilter,
  formatCurrency,
  appendTransactionHistory, BUILTIN_CURRENCIES,
  type Currency, type Transaction, type TxHistoryEvent,
} from '@/utils/financeUtils';
import {
  accountById, accountIdForLegacyTx, activeAccounts, creditedAmount,
  defaultAccountId, isTransfer, markTransferTargets, mergeAccountsForSave,
  findTransferPairCandidate, markAsTransferAccounts, reconciledOpeningBalance, resolveTxCurrency, transferRate,
  ACCOUNT_KINDS, type Account, type AccountKind,
} from '@/utils/accounts';
import { financeOverview } from '@/utils/financeOverview';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useMotion } from '@/hooks/use-motion';
import { isSameDay } from '@/utils/dateUtils';
import { haptic } from '@/utils/haptics';
import { useResponsive } from '@/hooks/use-responsive';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import {
  DEFAULT_CATEGORIES_EN, DEFAULT_CATEGORIES_UK, categoryNameIssue, categoryOptions,
  type CategoryDef,
} from '@/utils/financeCategories';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { DetailPane } from '@/components/shared/DetailPane';
import { categoryGroupLabel, costKindLabel, type FinColors } from '@/components/finance/financeLabels';
import { AccountsTab } from '@/components/finance/AccountsTab';
import { CategoryMetaEditor } from '@/components/finance/CategoryMetaEditor';
import { FinanceFilterBar, FinanceTabBar } from '@/components/finance/FinanceSectionBar';
import { OverviewTab } from '@/components/finance/OverviewTab';
import { ReportsTab } from '@/components/finance/ReportsTab';
import { useFinanceExtras } from '@/components/finance/useFinanceExtras';
import { useFinanceFilter } from '@/components/finance/useFinanceFilter';
import { useUiModules } from '@/store/ui-preferences';
import { BudgetPanel } from '@/app/budget';
import { SubscriptionsPanel } from '@/app/subscriptions';
import { matchesMoneyScope } from '@/utils/budgetScope';
import {
  categoryMeta, isCategoryGroup, isCostKind, subscriptionCategoryNames, type CategoryGroup, type CostKind,
} from '@/utils/finance/classify';
import { inRange, monthsOf, resolvePeriod } from '@/utils/finance/period';
import { calcPeriodTotalsByCurrency } from '@/utils/financePeriod';
import { parseFinanceTab, visibleFinanceTabs, type FinanceTab } from '@/utils/financeTabs';
import { formatSubscriptionMoney, parseDateKey } from '@/utils/subscriptions';

/**
 * Категорії існують лише для доходів і витрат. Переказ категорії не має: він
 * відповідає не на «на що», а на «звідки куди», тож окремий вужчий тип замість
 * спільного CatType, який тепер знає ще й про 'transfer'.
 */
type CatType = 'income' | 'expense';

/** Що саме заповнює форма. Переказ — третій рівноправний вид, а не витрата. */
type FormType = 'income' | 'expense' | 'transfer';

/** Чернетка форми рахунку. Валюта в редагуванні лише показується. */
interface AccountDraft {
  /** null — створюємо новий рахунок. */
  id: string | null;
  name: string;
  kind: AccountKind;
  currency: string;
  opening: string;
}

const ICON_SUGGESTIONS: IconSymbolName[] = [
  'briefcase.fill', 'laptopcomputer', 'chart.line.uptrend.xyaxis', 'gift.fill',
  'fork.knife', 'car.fill', 'gamecontroller.fill', 'cross.fill', 'house.fill',
  'tag.fill', 'ellipsis.circle.fill', 'cart.fill', 'bag.fill', 'creditcard.fill',
  'banknote', 'person.fill', 'airplane', 'heart.fill', 'star.fill', 'flame.fill',
  'bolt.fill', 'leaf.fill', 'books.vertical.fill', 'graduationcap.fill',
  'phone.fill', 'camera.fill', 'bicycle', 'figure.walk', 'drop.fill',
  'pawprint.fill', 'building.2.fill', 'building.columns.fill',
  'dollarsign.circle.fill', 'chart.pie.fill', 'music.note', 'tv.fill',
  'doc.fill', 'wrench.fill', 'chart.bar.fill', 'clock.fill',
];


/**
 * Лишає в полі суми лише цифри й ОДИН роздільник. Мовчки, а не забороною
 * вводу: вставка з буфера часто приходить із пробілами й символом валюти.
 */
function cleanAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  const i = cleaned.search(/[.,]/);
  return i < 0 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/[.,]/g, '');
}

/**
 * Ключі, які екран показує і які пишуть повз нього: синхронізація з іншого
 * пристрою, поповнення скарбнички на /banks, відновлення бекапу.
 */
const REFRESH_KEYS = ['transactions', 'accounts'] as const;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function FinanceScreen() {
  const tabBarInset = useTabBarInset();
  const { height, isExpanded, isWide } = useResponsive();
  const isDark = useColorScheme() === 'dark';
  useScreenView('finance');
  const insets = useSafeAreaInsets();
  /**
   * Вкладка розділу (finance-revamp.md §2). Живе в параметрі `?tab=`: сайдбар,
   * deep link і «Змінити підписки» з попередження відкривають потрібну
   * вкладку адресою. Прихована (вимкнений підмодуль) чи невідома → «Огляд».
   */
  const searchParams = useLocalSearchParams<{ create?: string; tab?: string }>();
  const { disabledModules } = useUiModules();
  const visibleTabs = useMemo(() => visibleFinanceTabs(disabledModules), [disabledModules]);
  const [tab, setTab] = useState<FinanceTab>(() => parseFinanceTab(searchParams.tab, visibleTabs));
  useEffect(() => {
    setTab(prev => {
      const next = searchParams.tab ? parseFinanceTab(searchParams.tab, visibleTabs) : prev;
      return visibleTabs.includes(next) ? next : parseFinanceTab(undefined, visibleTabs);
    });
  }, [searchParams.tab, visibleTabs]);
  const changeTab = useCallback((next: FinanceTab) => {
    haptic.light();
    setTab(next);
    router.setParams({ tab: next });
  }, []);
  const { tr, lang } = useI18n();
  // Найближчі й прострочені оплати підписок — блок під зведенням рахунків.
  const upcomingPayments = useUpcomingPayments();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const DEFAULT_CATEGORIES = lang === 'uk' ? DEFAULT_CATEGORIES_UK : DEFAULT_CATEGORIES_EN;
  const MONTHS_UA = tr.months;
  const WEEKDAYS_SHORT = tr.weekdays;
  /**
   * PERF-4. Нова функція щорендера — нові пропси в КОЖНІЙ групі стрічки, тож
   * мемоізація TransactionGroup зносилась на кожну натиснуту клавішу в полі
   * суми (форма живе в цьому ж компоненті).
   */
  const fmtCur = useCallback(
    (n: number, cur: Currency) => formatCurrency(n, cur, locale),
    [locale],
  );
  const motion = useMotion();
  const now = new Date();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [initialized, setInitialized] = useState(false);
  /**
   * ERR-01. Читання провалилось — це НЕ порожній екран. Доки прапорець
   * піднятий, `initialized` лишається false, тобто ефект-дзеркало не запише
   * порожній стан поверх цілих даних (а шар сховища такий запис ще й
   * відхилить StorageWriteBlockedError).
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<'all' | CatType>('all');
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txType, setTxType] = useState<FormType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  // Рахунок-джерело форми, а для переказу — ще й призначення та зарахована сума.
  const [formAccountId, setFormAccountId] = useState<string | null>(null);
  const [formToAccountId, setFormToAccountId] = useState<string | null>(null);
  const [toAmount, setToAmount] = useState('');
  /** Категорії має лише дохід і витрата — переказ бере набір витрат ні для чого. */
  const catType: CatType = txType === 'income' ? 'income' : 'expense';
  /** Підставляємо у наступну операцію той рахунок, з якого щойно платили. */
  const lastAccountRef = useRef<string | undefined>(undefined);
  /**
   * Черга «закрити цей аркуш → відкрити наступний» (NAT-02). Дві модалки,
   * перемкнуті в одному тіку, лишали на екрані невидимий модальний шар, після
   * якого Фінанси переставали приймати дотики до перезапуску застосунку.
   * Див. components/finance/sheetHandoff.ts.
   */
  const sheetHandoff = useRef(createSheetHandoff()).current;
  /**
   * Чернетка операції, перервана походом по перший рахунок: аркуш операції
   * закрився, але поля НЕ скидаємо — повернемось у них, щойно рахунок буде
   * створено. Саме втрату введеної суми й категорії описує NAT-02.
   */
  const txDraftPausedRef = useRef(false);
  const [showMenu, setShowMenu] = useState(false);
  const [compact, setCompact] = useState(false);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // Categories management
  const [cats, setCats] = useState<Record<CatType, CategoryDef[]>>(DEFAULT_CATEGORIES);
  const [catsInitialized, setCatsInitialized] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [catTab, setCatTab] = useState<CatType>('expense');
  const [showAddCat, setShowAddCat] = useState(false);
  /**
   * Явні `group`/`cost` рядків `categories` за id (`${type}:${name}`). Мапа
   * категорій екрана знає лише назву й іконку; без цієї пам'яті перший же
   * запис категорій стер би групи, розставлені на вебі (§4.1: поля
   * необов'язкові, і записувач зобов'язаний їх зберегти).
   */
  const [catMeta, setCatMeta] = useState<Record<string, { group?: CategoryGroup; cost?: CostKind }>>({});
  /** Рядок категорії, у якого розгорнуто редактор групи/ознаки. */
  const [metaOpenId, setMetaOpenId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState<IconSymbolName>('ellipsis.circle.fill');

  // Currency state
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [currenciesInitialized, setCurrenciesInitialized] = useState(false);
  // Валюта більше не належить операції — її задає рахунок. Поля нижче лишились
  // формі рахунку: там валюта обирається один раз і назавжди.
  const [showInlineAddCur, setShowInlineAddCur] = useState(false);
  const [inlineCurTicker, setInlineCurTicker] = useState('');
  const [inlineCurSymbol, setInlineCurSymbol] = useState('');

  // ── Рахунки ──
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsInitialized, setAccountsInitialized] = useState(false);
  /** Фільтр стрічки по рахунку. null — усі. */
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [showAccounts, setShowAccounts] = useState(false);
  // Форма рахунку живе всередині аркуша рахунків, а не окремим аркушем:
  // два bottom-sheet одночасно на iOS закривають один одного.
  const [accForm, setAccForm] = useState<AccountDraft | null>(null);
  const [reconcileActual, setReconcileActual] = useState('');
  const [reconcileNote, setReconcileNote] = useState<string | null>(null);
  /** Транзакція, яку перетворюємо на переказ (старі дані лежать парами). */
  const [markTxId, setMarkTxId] = useState<string | null>(null);
  const [markTargetId, setMarkTargetId] = useState<string | null>(null);

  // Primary currency for the main Finance card
  const [primaryCurrency, setPrimaryCurrency] = useState<string>('UAH');
  const [primaryCurrencyInitialized, setPrimaryCurrencyInitialized] = useState(false);
  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);
  /** Спільний фільтр розділу: період · валюта · ракурс (§3). */
  const finFilter = useFinanceFilter(primaryCurrency);
  const { period, scope } = finFilter.filter;
  /** Перший місяць періоду — для календаря-фільтра стрічки. */
  const activeMonth = useMemo(() => {
    const p = parseDateKey(period.from);
    if (p) return new Date(p.y, p.m - 1, 1);
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  }, [period.from]);
  const extras = useFinanceExtras();

  const allCurrencies = useMemo<Currency[]>(
    () => [...BUILTIN_CURRENCIES, ...customCurrencies],
    [customCurrencies],
  );
  const currencyByCode = useMemo<Record<string, Currency>>(() => {
    const m: Record<string, Currency> = {};
    allCurrencies.forEach(c => { m[c.code] = c; });
    return m;
  }, [allCurrencies]);
  const curOf = useCallback(
    (code: string): Currency => currencyByCode[code] ?? { code, symbol: code, kind: 'fiat', decimals: 2 },
    [currencyByCode],
  );

  /**
   * id операцій, які екран уже бачив: завантажив зі сховища або сам туди
   * записав. Без цього списку збереження не відрізнить «користувач видалив»
   * від «екран про це ще не знає» — див. mergeTransactionsForSave.
   */
  const seenTxIds = useRef<Set<string>>(new Set());

  /** true — прочитали; false — сховище віддало помилку (а не порожнечу). */
  const loadTxs = useCallback(async (retry = false) => {
    const r = retry
      ? await retryStorageRead<Transaction[]>('transactions', [])
      : await loadDataResult<Transaction[]>('transactions', []);
    if (!r.ok) return false;
    const list = Array.isArray(r.value) ? r.value : [];
    seenTxIds.current = new Set(list.map(t => t.id));
    setTxs(list);
    return true;
  }, []);

  const loadAccounts = useCallback(async (retry = false) => {
    const r = retry
      ? await retryStorageRead<Account[]>('accounts', [])
      : await loadDataResult<Account[]>('accounts', []);
    if (!r.ok) return false;
    setAccounts(Array.isArray(r.value) ? r.value : []);
    return true;
  }, []);

  // Load from storage — useFocusEffect ensures reload after data import or navigation
  const [txsInitialized, setTxsInitialized] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!txsInitialized) {
      Promise.all([loadTxs(), loadAccounts()]).then(([okTxs, okAccounts]) => {
        // Автозапис вмикаємо, лише коли ОБИДВА ключі справді прочитані.
        if (!okTxs || !okAccounts) { setLoadFailed(true); return; }
        setTxsInitialized(true);
        setInitialized(true);
        setAccountsInitialized(true);
      });
    } else {
      void loadTxs();
      void loadAccounts();
    }
  }, [txsInitialized, loadTxs, loadAccounts]));

  const reloadFromStorage = useCallback(async () => {
    await Promise.all([loadTxs(), loadAccounts()]);
  }, [loadTxs, loadAccounts]);

  /**
   * «Повторити» на плашці збою. Без цього виклику ключ лишається заблокованим
   * на запис до перезапуску застосунку — позначку знімає лише retryStorageRead.
   */
  const retryLoad = useCallback(async () => {
    const [okTxs, okAccounts] = await Promise.all([loadTxs(true), loadAccounts(true)]);
    if (!okTxs || !okAccounts) return;
    setLoadFailed(false);
    setTxsInitialized(true);
    setInitialized(true);
    setAccountsInitialized(true);
  }, [loadTxs, loadAccounts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadFromStorage();
    setRefreshing(false);
  }, [reloadFromStorage]);

  /**
   * Перечитуємо, щойно в сховище записали повз екран.
   *
   * `useFocusEffect` вище спрацьовує лише на вході на вкладку. Поки вкладка
   * ВІДКРИТА, синхронізація кладе прилетілу операцію прямо в 'transactions', і
   * без цієї підписки стрічка не змінювалась би НІКОЛИ, доки користувач сам не
   * піде й не повернеться — саме те, на що скаржились: фінанси показують не
   * всі актуальні операції.
   *
   * `trackWrite` обгортає ВЛАСНІ записи екрана: поки такий запис у польоті,
   * сигнал від нього ж ігнорується, інакше збереження ганяло б себе по колу.
   */
  const trackWrite = useStorageRefresh(REFRESH_KEYS, reloadFromStorage, txsInitialized);

  const { create: createParam } = searchParams;

  /**
   * Операції записуємо, доливши те, що з'явилось у сховищі повз екран.
   *
   * Поки вкладка відкрита, у ключ 'transactions' пишуть і інші: синхронізація
   * (чужі зміни), поповнення скарбнички на /banks, відновлення бекапу. Запис
   * самого лише React-стану `saveSynced` прочитав би як «операція зникла» і
   * поставив би в outbox тумбстоун — запис помер би на всіх пристроях, а
   * користувач побачив би саме те, на що скаржився: фінанси показують не всі
   * актуальні операції.
   */
  const persistTxs = useCallback(async (next: Transaction[]) => {
    const merged = await trackWrite(async () => {
      // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
      // ними інакше пішов би на сервер як DELETE.
      return updateSynced<Transaction>('transactions', stored => {
        const result = mergeTransactionsForSave(stored, next, seenTxIds.current);
        seenTxIds.current = new Set(result.map(t => t.id));
        return result;
      });
    });
    // Долите має стати видимим — повторний прохід ефекту вже нічого не долиє,
    // тож циклу немає.
    if (merged.length !== next.length) setTxs(merged);
  }, [trackWrite]);

  // Save to storage
  useEffect(() => {
    if (initialized) void persistTxs(txs);
  }, [txs, initialized, persistTxs]);

  // Undo-тост (таб — над таб-баром)
  const { show: showUndo, element: undoElement } = useUndoToast(true);

  // Load categories. У сховищі — пласкі рядки {id, type, name, icon}, екран
  // працює зі звичною мапою за типом; конвертуємо на межі.
  useEffect(() => {
    loadDataResult<CategoryRow[]>('categories', []).then(r => {
      // Провал читання НЕ вмикає catsInitialized: інакше наступний ефект
      // записав би дефолтні категорії поверх власних (ERR-01).
      if (!r.ok) return;
      const rows = Array.isArray(r.value) ? r.value : [];
      setCats(categoryRowsToMap(rows, DEFAULT_CATEGORIES));
      const meta: Record<string, { group?: CategoryGroup; cost?: CostKind }> = {};
      for (const row of rows as (CategoryRow & { group?: unknown; cost?: unknown })[]) {
        if (!row || typeof row.id !== 'string') continue;
        const entry: { group?: CategoryGroup; cost?: CostKind } = {};
        if (isCategoryGroup(row.group)) entry.group = row.group;
        if (isCostKind(row.cost)) entry.cost = row.cost;
        if (entry.group || entry.cost) meta[row.id] = entry;
      }
      setCatMeta(meta);
      setCatsInitialized(true);
    });
  }, []);

  // Save categories
  useEffect(() => {
    if (catsInitialized) {
      const rows = categoryMapToRows(cats).map(row => ({ ...row, ...(catMeta[row.id] ?? {}) }));
      void saveSynced('categories', rows)
        .catch(e => { if (__DEV__) console.warn('[finance] запис категорій не вдався:', e); });
    }
  }, [cats, catsInitialized, catMeta]);

  // Load custom currencies
  useEffect(() => {
    loadDataResult<Currency[]>('finance_currencies', []).then(r => {
      if (!r.ok) return;
      setCustomCurrencies(Array.isArray(r.value) ? r.value : []);
      setCurrenciesInitialized(true);
    });
  }, []);

  // Save custom currencies. id похідний від коду валюти — два пристрої, що
  // офлайн додали ту саму валюту, мусять зійтись в один запис.
  useEffect(() => {
    if (currenciesInitialized) {
      void saveSynced('finance_currencies', customCurrencies.map(c => ({ ...c, id: c.code })))
        .catch(e => { if (__DEV__) console.warn('[finance] запис валют не вдався:', e); });
    }
  }, [customCurrencies, currenciesInitialized]);

  /**
   * Рахунки записуємо, доливши те, що з'явилось у сховищі повз екран.
   *
   * Поки вкладка відкрита, синхронізація дописує прилетілі рахунки прямо в
   * сховище, а React-стан про них не знає. Запис самого лише стану `saveSynced`
   * прочитав би як «рахунок зник» і поставив би в outbox тумбстоун — рахунок
   * зник би з сервера й з усіх пристроїв.
   */
  const persistAccounts = useCallback(async (next: Account[]) => {
    const merged = await trackWrite(async () => {
      return updateSynced<Account>('accounts', stored => mergeAccountsForSave(stored, next));
    });
    // Долиті рахунки мають стати видимими — і повторний прохід ефекту вже
    // нічого не долиє, тож циклу немає.
    if (merged.length !== next.length) setAccounts(merged);
  }, [trackWrite]);

  // Початковий залишок переїхав у Account.openingBalance, тож ключ
  // 'finance_balance_adjustments' екран більше не читає й не переписує —
  // старі значення лишаються в сховищі недоторканими.
  useEffect(() => {
    if (accountsInitialized) void persistAccounts(accounts);
  }, [accounts, accountsInitialized, persistAccounts]);

  // Load / save primary currency
  useEffect(() => {
    loadDataResult<string>('finance_primary_currency', 'UAH').then(r => {
      if (!r.ok) return;
      setPrimaryCurrency(typeof r.value === 'string' && r.value ? r.value : 'UAH');
      setPrimaryCurrencyInitialized(true);
    });
  }, []);
  useEffect(() => {
    if (primaryCurrencyInitialized) {
      void saveSyncedValue('finance_primary_currency', primaryCurrency)
        .catch(e => { if (__DEV__) console.warn('[finance] запис основної валюти не вдався:', e); });
    }
  }, [primaryCurrency, primaryCurrencyInitialized]);

  const addInlineCurrency = () => {
    const code = inlineCurTicker.trim().toUpperCase();
    if (!code) return;
    const pick = (c: string) => setAccForm(prev => (prev ? { ...prev, currency: c } : prev));
    if (allCurrencies.some(c => c.code === code)) {
      pick(code);
      setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol('');
      return;
    }
    const symbol = (inlineCurSymbol.trim() || code);
    const newCur: Currency = { code, symbol, kind: 'crypto', decimals: 8 };
    setCustomCurrencies(prev => [...prev, newCur]);
    pick(code);
    setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol('');
  };

  /** PERF-4: те саме, що й з fmtCur — проп кожної групи стрічки. */
  const getCatIcon = useCallback(
    (catName: string, type: CatType): IconSymbolName =>
      cats[type].find(c => c.name === catName)?.icon ??
      DEFAULT_CATEGORIES[type].find(c => c.name === catName)?.icon ??
      (type === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'),
    [cats, DEFAULT_CATEGORIES],
  );

  const addCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (cats[catTab].some(c => c.name === trimmed)) return;
    setCats(prev => ({ ...prev, [catTab]: [...prev[catTab], { name: trimmed, icon: newCatIcon }] }));
    setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); setShowAddCat(false);
  };

  /**
   * Нова категорія прямо з форми операції. Питаємо ЛИШЕ назву: тип уже обрано
   * перемикачем витрата/дохід, а іконку тут вибирати нема коли — її завжди
   * можна поміняти в керуванні категоріями.
   *
   * Пишемо через `cats`, тобто тим самим ефектом, що зберігає ВЕСЬ масив
   * (categoryMapToRows). Окремий поштучний запис поруч із ним поставив би
   * тумбстоуни на все, чого немає в одному рядку.
   */
  const createFormCategory = useCallback((name: string) => {
    const trimmed = name.trim();
    if (categoryNameIssue(catType, trimmed, cats[catType].map(cat => cat.name))) return;
    setCats(prev => ({
      ...prev,
      [catType]: [...prev[catType], { name: trimmed, icon: 'ellipsis.circle.fill' as IconSymbolName }],
    }));
    setCategory(trimmed);
    haptic.success();
  }, [catType, cats]);

  const visibleAccounts = useMemo(() => activeAccounts(accounts), [accounts]);

  // Рахунок може зникнути зі стрічки, поки екран відкритий (архівували тут або
  // на іншому пристрої). Фільтр по ньому лишався б чинним, але невидимим —
  // і зняти його не було б чим.
  useEffect(() => {
    setAccountFilter(prev => resolveAccountFilter(prev, visibleAccounts.map(a => a.id)));
  }, [visibleAccounts]);

  /**
   * Баланси, «Разом» по валютах і розклад «Звідки ця сума» — з ТОГО САМОГО
   * financeOverview, що й плитка «Сьогодні»: два екрани більше не рахують
   * «баланс» кожен по-своєму (utils/financeOverview.ts).
   */
  const overview = useMemo(
    () => financeOverview({ txs, accounts, primary: primaryCurrency, now: new Date() }),
    [txs, accounts, primaryCurrency],
  );
  const accountBalances = overview.balances;
  /** Фільтр стрічки «лише операції без рахунку» — з попередження над рахунками. */
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const unassignedIds = useMemo(() => new Set(overview.unassigned.ids), [overview.unassigned.ids]);
  useEffect(() => {
    if (overview.unassigned.count === 0) setUnassignedOnly(false);
  }, [overview.unassigned.count]);


  /** Переказ належить обом рахункам: і тому, з якого пішов, і тому, куди прийшов. */
  const touchesAccount = useCallback(
    (t: Transaction, id: string) => t.accountId === id || t.toAccountId === id,
    [],
  );

  // Стрічка — за ПЕРІОДОМ і РАКУРСОМ спільного фільтра (§3.2): ракурс звужує
  // оборот, але не баланси рахунків.
  const monthTxs = useMemo(
    () => txs.filter(t => inRange(t.date, period) && matchesMoneyScope(t, scope)),
    [txs, period, scope],
  );
  const monthHasTransfers = useMemo(() => monthTxs.some(t => t.type === 'transfer'), [monthTxs]);

  // Оборот рахуємо по тому самому зрізу, який видно у стрічці: інакше вибраний
  // рахунок фільтрував би операції, а цифри згори лишалися б від усіх разом.
  const totalsSource = useMemo(
    () => {
      const scoped = scope === 'all' ? txs : txs.filter(t => matchesMoneyScope(t, scope));
      return accountFilter ? scoped.filter(t => touchesAccount(t, accountFilter)) : scoped;
    },
    [txs, accountFilter, touchesAccount, scope],
  );
  const totalsByCurrency = useMemo(
    // Валюта — за РАХУНКОМ (resolveTxCurrency), як і на плитці «Сьогодні».
    () => calcPeriodTotalsByCurrency(totalsSource, period, t => resolveTxCurrency(t, accounts)),
    [totalsSource, period, accounts],
  );

  const filtered = useMemo(() => monthTxs.filter(t => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (unassignedOnly && !unassignedIds.has(t.id)) return false;
    if (accountFilter && !touchesAccount(t, accountFilter)) return false;
    if (dateFilter && !isSameDay(new Date(t.date), dateFilter)) return false;
    return true;
  }), [monthTxs, filter, accountFilter, dateFilter, touchesAccount, unassignedOnly, unassignedIds]);

  /** У віртуалізованому списку елементи монтуються заново при прокрутці. */
  const animatedGroups = useRef<Set<string>>(new Set());
  const shouldAnimateGroup = useCallback((key: string) => {
    if (animatedGroups.current.has(key)) return false;
    animatedGroups.current.add(key);
    return true;
  }, []);

  const groups = useMemo(() => groupTransactions(
    filtered,
    now.toDateString(),
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString(),
    locale,
  ), [filtered, locale]);

  const typeLabel = useCallback(
    (t: FormType) => (t === 'income' ? tr.income : t === 'expense' ? tr.expense : tr.transfer),
    [tr],
  );

  const kindLabel = useCallback(
    (kind: AccountKind) => (kind === 'cash' ? tr.accountCash : kind === 'card' ? tr.accountCard : tr.accountSavings),
    [tr],
  );

  const accountName = useCallback(
    (id: string | undefined) => accountById(accounts, id)?.name ?? '—',
    [accounts],
  );

  /**
   * Варіанти для PickerField. `exclude` прибирає рахунок-джерело зі списку
   * призначення, `keep` навпаки лишає архівний рахунок, який уже стоїть в
   * операції: інакше редагування старого запису мовчки перевісило б його.
   */
  const accountOptions = useCallback((
    exclude?: string | null,
    keep?: string | null,
    /** Список рахунків, яким обмежити вибір (див. markTransferTargets). */
    only?: Account[] | null,
  ): PickerOption[] => {
    const source = only ?? visibleAccounts;
    const list = source.filter(a => a.id !== exclude);
    const kept = keep && keep !== exclude && !list.some(a => a.id === keep)
      ? accountById(accounts, keep)
      : undefined;
    return [...(kept ? [kept] : []), ...list].map(a => ({
      id: a.id,
      label: `${a.name} · ${a.currency}${a.archived ? ` · ${tr.accountArchived}` : ''}`,
      color: a.color ?? KIND_COLOR[a.kind],
    }));
  }, [visibleAccounts, accounts, tr]);

  const parseAmount = (raw: string) => parseFloat(raw.replace(',', '.'));

  const buildEditNote = (before: Transaction, after: { type: FormType; amount: number; category: string; note: string; accountId: string }): string => {
    const parts: string[] = [];
    if (before.amount !== after.amount) parts.push(`${tr.amount}: ${before.amount} → ${after.amount}`);
    if (before.category !== after.category) parts.push(`${tr.category}: ${before.category} → ${after.category}`);
    if (before.accountId !== after.accountId) parts.push(`${tr.account}: ${accountName(before.accountId)} → ${accountName(after.accountId)}`);
    if ((before.note || '') !== after.note) parts.push(tr.note);
    if (before.type !== after.type) parts.push(`${typeLabel(before.type)} → ${typeLabel(after.type)}`);
    return parts.length ? parts.join(' · ') : tr.transactionEdited;
  };

  /**
   * Відкрити чисту форму. Без цього наступний «+» відкривався б із чужими
   * даними. useCallback — не косметика: функція йде в шапку стрічки, і нова
   * ідентичність щорендера робила б мемоізацію шапки безглуздою (PERF-4).
   */
  const openAdd = useCallback((mode: FormType = 'expense') => {
    setEditingId(null);
    setTxType(mode);
    setAmount(''); setCategory(''); setNote(''); setToAmount('');
    setFormAccountId(defaultAccountId(accounts, lastAccountRef.current));
    setFormToAccountId(null);
    setShowAdd(true);
  }, [accounts]);

  /**
   * Форма операції, відкрита переходом `?create=1` (швидкі дії «Сьогодні»).
   *
   * `openAdd` перестворюється щорендера, тож у залежностях ефекту він
   * відкривав би форму знову після кожної правки полів. Раніше його просто
   * глушили `eslint-disable`, і це коштувало дорожче, ніж здається: React
   * Compiler відмовляється оптимізувати КОМПОНЕНТ, у якому вимкнено правило
   * хуків (PERF-2), тобто весь екран Фінансів лишався без мемоізації, і
   * кожне натискання клавіші в полі суми прокочувало повний рендер стрічки.
   * Свіжа функція живе в ref, а оновлює його ефект: запис у ref під час
   * рендера був би для компілятора тим самим бейлаутом.
   */
  const openAddRef = useRef(openAdd);
  // Оголошено ПЕРЕД ефектом-споживачем, тож на монтуванні ref уже свіжий.
  useEffect(() => { openAddRef.current = openAdd; });
  useEffect(() => {
    if (createParam === '1') {
      openAddRef.current();
      router.setParams({ create: '' });
    }
  }, [createParam]);

  const startEdit = (tx: Transaction) => {
    const openForm = () => {
      setEditingId(tx.id);
      setTxType(tx.type);
      setAmount(String(tx.amount));
      setCategory(tx.category);
      setNote(tx.note);
      // Операція без рахунку (дані до міграції або запис із клієнта, де рахунків
      // немає) отримує рахунок ТІЄЇ Ж валюти — або нічого. Типовий гаманець
      // підставляти не можна: saveTx пише валюту рахунку, і правка примітки
      // мовчки перетворила б витрату $100 на ₴100.
      setFormAccountId(tx.accountId || accountIdForLegacyTx(accounts, tx, lastAccountRef.current));
      setFormToAccountId(tx.toAccountId ?? null);
      setToAmount(typeof tx.toAmount === 'number' ? String(tx.toAmount) : '');
      setShowAdd(true);
    };
    // На широкому екрані деталь — колонка, а не модалка: мінятись нема з чим.
    // На телефоні деталь — окремий Modal, і відкрити форму в тому ж тіку, у
    // якому він зникає, означає презентувати друге вікно поверх ще живого
    // першого (NAT-02).
    if (isExpanded) {
      setSelected(null);
      openForm();
      return;
    }
    openAfterModalExit(() => setSelected(null), openForm);
  };

  const formFrom = accountById(accounts, formAccountId ?? undefined);
  const formTo = accountById(accounts, formToAccountId ?? undefined);
  /** Різні валюти — єдина причина питати другу суму. */
  const crossCurrency = txType === 'transfer' && !!formFrom && !!formTo && formFrom.currency !== formTo.currency;
  const formRate = (() => {
    if (!crossCurrency) return null;
    const from = parseAmount(amount);
    const to = parseAmount(toAmount);
    if (!from || !to || !Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.round((to / from) * 1e4) / 1e4;
  })();

  const formValid = (() => {
    const num = parseAmount(amount);
    if (!num || num <= 0 || !formFrom) return false;
    if (txType === 'transfer') {
      // Переказ сам у себе грошей не переміщує, лише плутає історію.
      if (!formTo || formTo.id === formFrom.id) return false;
      if (crossCurrency) {
        const credited = parseAmount(toAmount);
        if (!credited || credited <= 0) return false;
      }
      return true;
    }
    return !!category;
  })();

  const saveTx = () => {
    if (!formValid || !formFrom) return;
    const num = parseAmount(amount);
    const transferForm = txType === 'transfer';
    const credited = crossCurrency ? parseAmount(toAmount) : undefined;
    // Категорія переказу — підпис, а не вибір: переказ не про «на що».
    const nextCategory = transferForm ? tr.transfer : category;

    const patch = {
      type: txType,
      category: nextCategory,
      amount: num,
      note: note.trim(),
      accountId: formFrom.id,
      // Застаріле поле currency дублюємо навмисно: підсумки місяця й денні
      // цифри стрічки поки читають саме його.
      currency: formFrom.currency,
      toAccountId: transferForm ? formTo!.id : undefined,
      // У межах однієї валюти зарахована сума не зберігається — див.
      // creditedAmount() в utils/accounts.ts.
      toAmount: transferForm && crossCurrency ? credited : undefined,
    };

    if (editingId) {
      setTxs(prev => prev.map(t => {
        if (t.id !== editingId) return t;
        const noteText = buildEditNote(t, {
          type: txType, amount: num, category: nextCategory, note: note.trim(), accountId: formFrom.id,
        });
        const historyEvent: TxHistoryEvent = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          at: new Date().toISOString(),
          note: noteText,
        };
        return appendTransactionHistory({ ...t, ...patch }, historyEvent);
      }));
    } else {
      setTxs(p => [{
        id: Date.now().toString(),
        date: new Date().toISOString(),
        ...patch,
      }, ...p]);
    }
    lastAccountRef.current = formFrom.id;
    closeAddSheet();
    haptic.success();
  };

  /**
   * Перетворити наявну операцію на переказ. Потрібне старим даним, де переказ
   * записаний парою «витрата + дохід»: половину позначаємо переказом, другу
   * видаляють вручну. Автоматично такі пари не шукаємо — евристика «однакова
   * сума того ж дня» тихо з'їла б зарплату разом із покупкою на ту саму суму.
   */
  const applyMarkAsTransfer = () => {
    const target = accountById(accounts, markTargetId ?? undefined);
    const tx = txs.find(t => t.id === markTxId);
    if (!target || !tx || !tx.accountId || target.id === tx.accountId) return;
    // Валюта призначення мусить збігатися з валютою операції: зарахована сума
    // тут не питається (курс минулого переказу невідомий), тож на рахунок
    // іншої валюти пішло б те саме ЧИСЛО — 100 USD стали б 100 UAH з повітря.
    if (!markTransferTargets(accounts, tx).some(a => a.id === target.id)) return;
    // Дохід — гроші ПРИЙШЛИ на рахунок операції, тож він стає призначенням.
    const direction = markAsTransferAccounts(tx, target.id);
    const pair = findTransferPairCandidate(txs, tx, target.id, accounts);
    setTxs(prev => prev.map(t => (t.id !== tx.id ? t : appendTransactionHistory({
      ...t,
      type: 'transfer',
      category: tr.transfer,
      accountId: direction.accountId,
      toAccountId: direction.toAccountId,
      // Курс минулого переказу невідомий, тож зарахована сума лишається
      // порожньою (= списаній). За різних валют її виправляють редагуванням.
      toAmount: undefined,
    }, {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      at: new Date().toISOString(),
      note: `${tr.markAsTransfer}: ${accountName(direction.accountId)} → ${accountName(direction.toAccountId)}`,
    }))));
    setSelected(null);
    setMarkTxId(null);
    setMarkTargetId(null);
    haptic.success();
    // Друга половина старої пари лишилась би витратою/доходом поруч із
    // переказом — гроші порахувались би двічі. Пропонуємо, не видаляємо самі.
    if (pair) {
      Alert.alert(
        tr.markTransferPairTitle,
        tr.markTransferPairHint
          .replace('{account}', target.name)
          .replace('{date}', new Date(pair.date).toLocaleDateString(locale, { day: 'numeric', month: 'long' })),
        [
          { text: tr.markTransferPairKeep, style: 'cancel' },
          { text: tr.markTransferPairDelete, style: 'destructive', onPress: () => deleteTx(pair.id) },
        ],
      );
    }
  };

  // ── Рахунки: створення, перейменування, архівація ──
  /** useCallback з тієї ж причини, що й openAdd: проп мемоізованої шапки. */
  const openAccountForm = useCallback((account: Account | null) => {
    setShowAccounts(true);
    setReconcileActual('');
    setReconcileNote(null);
    setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol('');
    setAccForm(account
      ? {
          id: account.id, name: account.name, kind: account.kind,
          currency: account.currency, opening: String(account.openingBalance ?? 0),
        }
      : { id: null, name: '', kind: 'cash', currency: primaryCurrency, opening: '' });
  }, [primaryCurrency]);

  const showBreakdown = useCallback((account: Account) => {
    const b = overview.breakdowns[account.id];
    if (!b) return;
    const cur = curOf(account.currency);
    const line = (label: string, value: number, sign = '') => `${label}: ${sign}${fmtCur(value, cur)}`;
    const lines = [
      line(tr.breakdownOpening, b.opening),
      line(tr.breakdownIncome, b.income, '+'),
      line(tr.breakdownExpense, b.expense, '−'),
      line(tr.breakdownTransfersIn, b.transfersIn, '+'),
      line(tr.breakdownTransfersOut, b.transfersOut, '−'),
      `= ${line(tr.breakdownBalance, b.balance)}`,
    ];
    if (b.futureCount > 0) {
      lines.push('', `${tr.breakdownFuture.replace('{n}', String(b.futureCount))} (${b.future > 0 ? '+' : ''}${fmtCur(b.future, cur)})`);
    }
    Alert.alert(`${tr.balanceBreakdown} · ${account.name}`, lines.join('\n'), [
      { text: tr.reconcileBalance, onPress: () => openAccountForm(account) },
      { text: tr.close, style: 'cancel' },
    ]);
  }, [overview.breakdowns, fmtCur, curOf, tr, openAccountForm]);

  /**
   * «Звірити з реальним залишком»: людина вводить, скільки РЕАЛЬНО лежить на
   * рахунку зараз, і ми рахуємо, яким мав би бути початковий залишок, щоб
   * баланс зійшовся (історія операцій лишається як є). Нічого не
   * застосовується мовчки — нове значення лягає у форму разом із різницею,
   * і людина сама натискає «Зберегти».
   */
  const applyReconcile = () => {
    if (!accForm?.id) return;
    const account = accounts.find(a => a.id === accForm.id);
    const actual = parseFloat(reconcileActual.replace(',', '.').trim());
    if (!account || !Number.isFinite(actual)) return;
    const { opening, delta } = reconciledOpeningBalance(account, txs, actual, { asOf: new Date() });
    const cur = curOf(account.currency);
    setAccForm(prev => (prev ? { ...prev, opening: String(opening) } : prev));
    setReconcileNote(tr.reconcileDelta.replace('{delta}', `${delta > 0 ? '+' : ''}${fmtCur(delta, cur)}`));
    haptic.light();
  };

  /** Яким стане баланс рахунку з поточним значенням поля «Початковий залишок». */
  const accFormPreview = (() => {
    if (!accForm) return null;
    const raw = accForm.opening.replace(',', '.').trim();
    const opening = raw === '' ? 0 : parseFloat(raw);
    if (!Number.isFinite(opening)) return null;
    const b = accForm.id ? overview.breakdowns[accForm.id] : undefined;
    const history = b ? b.balance - b.opening : 0;
    return opening + history;
  })();

  const saveAccount = () => {
    if (!accForm) return;
    const name = accForm.name.trim();
    if (!name) return;
    const raw = accForm.opening.replace(',', '.').trim();
    const opening = raw === '' ? 0 : parseFloat(raw);
    if (!Number.isFinite(opening)) return;

    if (accForm.id) {
      // Валюту не чіпаємо навмисно: вся історія рахунку порахована саме в ній.
      setAccounts(prev => prev.map(a => (a.id === accForm.id
        ? { ...a, name, kind: accForm.kind, openingBalance: opening }
        : a)));
    } else {
      setAccounts(prev => [...prev, {
        id: 'acct-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        kind: accForm.kind,
        currency: accForm.currency,
        openingBalance: opening,
        createdAt: new Date().toISOString(),
      }]);
    }
    setAccForm(null);
    haptic.success();
  };

  /**
   * Архівація замість видалення: операції рахунку нікуди не діваються, і
   * стертий рахунок лишив би їх без валюти й без місця в балансі.
   */
  const toggleArchive = (account: Account) => {
    setAccounts(prev => prev.map(a => (a.id === account.id ? { ...a, archived: !a.archived } : a)));
    if (!account.archived && accountFilter === account.id) setAccountFilter(null);
    haptic.light();
  };

  // Cancel / backdrop-dismiss the Add-or-Edit sheet — must reset the form,
  // not just editingId, or the next "+" (new transaction) opens prefilled
  // with whatever transaction was being edited.
  const resetTxDraft = () => {
    setEditingId(null);
    setAmount(''); setCategory(''); setNote(''); setToAmount('');
    setFormToAccountId(null);
  };

  const closeAddSheet = () => {
    setShowAdd(false);
    resetTxDraft();
  };

  /**
   * Аркуш операції СПРАВДІ зник (SheetModal кличе onClose після
   * exit-анімації). Лише тепер можна показувати наступну модалку — і лише
   * тепер видно, чи це було закриття, чи передача керування.
   */
  const handleAddSheetClosed = () => {
    setShowAdd(false);
    if (sheetHandoff.isPending()) {
      // Чернетку лишаємо живою: користувач пішов заводити рахунок і
      // повернеться в ту саму форму.
      sheetHandoff.release();
      return;
    }
    txDraftPausedRef.current = false;
    resetTxDraft();
  };

  /**
   * «+ Новий рахунок» із форми операції. Друге вікно відкриється з
   * handleAddSheetClosed — див. sheetHandoff.
   */
  const goCreateFirstAccount = () => {
    txDraftPausedRef.current = true;
    sheetHandoff.queue(() => openAccountForm(null));
    setShowAdd(false);
  };

  /**
   * Аркуш рахунків зник. Якщо сюди прийшли з незавершеної операції й рахунок
   * таки з'явився — повертаємо користувача в його чернетку.
   */
  const handleAccountsSheetClosed = () => {
    setShowAccounts(false);
    setAccForm(null);
    const resume = txDraftPausedRef.current;
    txDraftPausedRef.current = false;
    if (resume && visibleAccounts.length > 0) {
      sheetHandoff.queue(() => {
        setFormAccountId(defaultAccountId(accounts, lastAccountRef.current));
        setShowAdd(true);
      });
    }
    sheetHandoff.release();
  };

  const deleteTx = (id: string) => {
    const txToDelete = txs.find(t => t.id === id);
    setTxs(p => p.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
    // Undo: повернути транзакцію
    if (txToDelete) {
      showUndo(tr.transactionDeleted, () => {
        setTxs(prev => [...prev, txToDelete]);
      });
    }
  };

  // Calendar helpers
  const firstDay = (() => { const d = new Date(calYear, calMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let i = 1; i <= daysInMonth; i++) calCells.push(i);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calWeeks = chunk(calCells, 7);

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    txs.forEach(t => {
      const d = new Date(t.date);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [txs]);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,170,240,0.4)',
    text:   isDark ? '#F4F2FF' : '#0A0818',
    sub:    isDark ? 'rgba(244,242,255,0.62)' : 'rgba(10,8,24,0.60)',
    green:  '#10B981',
    red:    '#EF4444',
    // Переказ малюємо нейтральним: він не дохід і не витрата, і зелений чи
    // червоний тут брехали б про те, що сталося з грошима.
    neutral: isDark ? '#94A3B8' : '#64748B',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)',
  };

  const txDetailScrollRef = useRef<ScrollView>(null);

  /** Палітра вкладок розділу — з тих самих кольорів екрана. */
  const finColors = useMemo<FinColors>(
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, card: c.card, accent: c.accent, green: c.green, red: c.red, sheet: c.sheet }),
    [c.text, c.sub, c.border, c.dim, c.card, c.accent, c.green, c.red, c.sheet],
  );
  /** Суми у вкладках: копійки не відкидаються, невідомий код — через символ. */
  const money = useCallback(
    (n: number, code: string) => formatSubscriptionMoney(n, code, allCurrencies, locale),
    [allCurrencies, locale],
  );
  /** Валюти для фільтра: основна першою, далі ті, у яких є рахунки чи операції. */
  const filterCurrencies = useMemo(() => {
    const set = new Set<string>([primaryCurrency, finFilter.filter.currency]);
    for (const a of accounts) if (!a.archived) set.add(a.currency || 'UAH');
    for (const t of txs) if (t.type !== 'transfer') set.add(resolveTxCurrency(t, accounts));
    return [...set].filter(Boolean);
  }, [primaryCurrency, finFilter.filter.currency, accounts, txs]);
  const budgetMonths = useMemo(() => monthsOf(period), [period]);
  /** Правило «категорія підписки → fixed» — щоб редактор категорій показував ту саму ознаку, що звіти. */
  const subscriptionFixedNames = useMemo(() => subscriptionCategoryNames(extras.subscriptions), [extras.subscriptions]);

  const groupColors = useMemo(
    () => ({ sub: c.sub, text: c.text, green: c.green, red: c.red, border: c.border, dim: c.dim, neutral: c.neutral }),
    [c.sub, c.text, c.green, c.red, c.border, c.dim, c.neutral],
  );

  const pickerColors = useMemo(
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.sheet }),
    [c.text, c.sub, c.border, c.dim, c.accent, c.sheet],
  );

  /**
   * Список категорій форми: збережені ПЛЮС назви, під якими вже лежать
   * операції. Друге доливання обовʼязкове — категорію могли прибрати з
   * керування або завести ще до появи колекції `categories`, а операції під
   * старою назвою лишились. Без неї стара назва зникла б із вибору, і та сама
   * витрата пішла б у нову категорію, розколовши історію й бюджетний ліміт.
   *
   * Долиті назви живуть ЛИШЕ в списку і в `cats` не осідають: інакше ефект
   * запису відправив би їх у колекцію як справжні категорії.
   */
  const categoryPickerOptions = useMemo<PickerOption[]>(
    () => categoryOptions(categoryMapToRows(cats), txs, catType, lang)
      .map(cat => ({ id: cat.name, label: cat.name, icon: cat.icon })),
    [cats, txs, catType, lang],
  );

  /**
   * «+» у пікері. Довжину перевіряємо ТУТ, а не в сховищі: categoryMapToRows
   * мовчки відкидає задовгий id, і без цієї перевірки людина побачила б
   * «додано», а категорія зникла б при наступному читанні.
   */
  const categoryCreateOption = useMemo(
    () => ({
      label: tr.newCategory,
      validate: (name: string) =>
        categoryNameIssue(catType, name, cats[catType].map(cat => cat.name)) === 'tooLong'
          ? tr.categoryNameTooLong
          : null,
      onCreate: createFormCategory,
    }),
    [tr, catType, cats, createFormCategory],
  );

  /** Перемикач виду форми. Переказ не пропонуємо в редагуванні звичайної
   *  операції — для цього є окрема дія «позначити як переказ». */
  const typeOptions: FormType[] = editingId
    ? (txType === 'transfer' ? ['transfer'] : ['income', 'expense'])
    : ['income', 'expense', 'transfer'];

  const formCur = curOf(formFrom?.currency ?? primaryCurrency);
  const formColor = txType === 'income' ? c.green : txType === 'expense' ? c.red : c.neutral;

  /** Операція, яку зараз позначають переказом. */
  const markTx = useMemo(() => txs.find(t => t.id === markTxId) ?? null, [txs, markTxId]);
  /** Лише рахунки валюти самої операції — див. markTransferTargets. */
  const markTargets = useMemo(
    () => (markTx ? markTransferTargets(accounts, markTx) : []),
    [accounts, markTx],
  );


  /**
   * Рядок стрічки. useCallback обовʼязковий: FlatList тримає renderItem у
   * рендері комірок, тож нова функція щорендера перемальовувала б увесь
   * видимий місяць на кожну натиснуту клавішу у формі (PERF-4).
   */
  const renderGroup = useCallback(({ item, index }: { item: ReturnType<typeof groupTransactions>[number]; index: number }) => (
    <Animated.View
      entering={shouldAnimateGroup(item.dateStr) ? motion.entering(FadeInDown.duration(200).delay(Math.min(index, 10) * 40)) : undefined}
      layout={motion.entering(LinearTransition.springify())}>
      <TransactionGroup
        group={item}
        compact={compact}
        isDark={isDark}
        c={groupColors}
        fmt={fmtCur}
        currencyByCode={currencyByCode}
        primaryCode={primaryCurrency}
        accounts={accounts}
        getCatIcon={getCatIcon}
        onSelect={setSelected}
        todayLabel={tr.today}
        yesterdayLabel={tr.yesterday}
        incomeLabel={tr.income}
        expenseLabel={tr.expense}
        transferLabel={tr.transfer}
      />
    </Animated.View>
  ), [
    accounts, compact, currencyByCode, fmtCur, getCatIcon, groupColors, isDark,
    motion, primaryCurrency, shouldAnimateGroup, tr,
  ]);

  // Шапка списку: фільтри, баланси, порожній стан. Мемоізуємо, щоб FlatList
  // не перебудовував її на кожен символ, надрукований у формі операції
  // (PERF-4): у змінній без useMemo вона перестворювалась щорендера, попри
  // коментар, який обіцяв протилежне.
  const listHeader = useMemo(() => (
    <>
            {/* ERR-01: збій читання — окремий стан, а не «немає транзакцій». */}
            {loadFailed && (
              <LoadErrorNotice
                lang={lang}
                isDark={isDark}
                text={c.text}
                sub={c.sub}
                onRetry={retryLoad}
                style={{ marginTop: 8 }}
              />
            )}

            {/* Skeleton — перший завантаження */}
            {!initialized && !loadFailed && (
              <>
                <SkeletonCard style={{ marginTop: 4 }} />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}

            {/* Date filter chip */}
            {dateFilter && (
              <TouchableOpacity
                onPress={() => setDateFilter(null)}
                style={[s.dateChip, { backgroundColor: c.accent + '20', borderColor: c.accent + '60' }]}>
                <IconSymbol name="calendar" size={13} color={c.accent} />
                <Text style={{ color: c.accent, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                  {dateFilter.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
                </Text>
                <IconSymbol name="xmark" size={13} color={c.accent} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}

            {/* Стрічка рахунків + оборот місяця */}
            <FinanceSummary
              accounts={visibleAccounts}
              balances={accountBalances}
              selectedAccountId={accountFilter}
              onSelectAccount={id => {
                haptic.light();
                // Повторний тап знімає фільтр — інакше з нього нема виходу.
                setAccountFilter(prev => (prev === id ? null : id));
              }}
              onNewAccount={() => openAccountForm(null)}
              kindLabel={kindLabel}
              currencies={allCurrencies}
              totalsByCurrency={totalsByCurrency}
              primaryCode={primaryCurrency}
              onPickPrimary={() => setShowPrimaryPicker(true)}
              fmt={fmtCur}
              isDark={isDark}
              c={{ border: c.border, sub: c.sub, text: c.text, dim: c.dim, accent: c.accent, green: c.green, red: c.red }}
              incomeLabel={tr.incomes}
              expenseLabel={tr.expenses}
              savingsLabel={tr.savings}
              accountsLabel={tr.accounts}
              newAccountLabel={tr.newAccount}
              noAccountsLabel={tr.noAccounts}
              noAccountsHint={tr.noAccountsHint}
              transfersNoteLabel={tr.transfersNotCounted}
              showTransfersNote={monthHasTransfers}
              accountTotals={overview.totalByCurrency}
              totalLabel={tr.totalOnAccounts}
              onLongPressAccount={showBreakdown}
              breakdownHint={tr.balanceBreakdown}
              unassignedLabel={overview.unassigned.count > 0
                ? tr.unassignedTxWarning.replace('{n}', String(overview.unassigned.count))
                : null}
              unassignedActive={unassignedOnly}
              onPressUnassigned={() => { haptic.light(); setUnassignedOnly(v => !v); }}
            />

            {/* Найближчі оплати / прострочені підписки. Операцій не створюють —
                лише нагадують; тап веде на екран підписок. */}
            <UpcomingPaymentsCard
              data={upcomingPayments}
              isDark={isDark}
              c={{ text: c.text, sub: c.sub, border: c.border }}
              tr={tr}
              lang={lang}
              style={{ marginTop: 16, marginBottom: 0 }}
            />

            {/* Filters. Вибраний стан передавався ВИКЛЮЧНО кольором тла, тож
                VoiceOver читав три однакові кнопки, а дальтонік не відрізняв їх
                зовсім (A11Y-04). Звідси role=tab + state.selected на кнопках і
                tablist на самому ряду. */}
            <View
              accessibilityRole="tablist"
              style={[s.filterRow, { backgroundColor: c.card, borderColor: c.border, marginTop: 16, marginBottom: 22 }]}>
              {(['all', 'income', 'expense'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: filter === f }}
                  accessibilityLabel={f === 'all' ? tr.all : f === 'income' ? tr.incomes : tr.expenses}
                  style={[s.filterBtn, filter === f && { backgroundColor: f === 'income' ? c.green : f === 'expense' ? c.red : c.accent }]}>
                  <Text style={[s.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                    {f === 'all' ? tr.all : f === 'income' ? tr.incomes : tr.expenses}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Empty state with CTA */}
            {groups.length === 0 && !loadFailed && (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <IconSymbol name="banknote" size={32} color={c.accent} />
                </View>
                <Text style={{ color: c.text, fontSize: 16, marginTop: 6, fontWeight: '700' }}>{tr.noTransactions}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.85 }}>{tr.pressToAdd}</Text>
                <TouchableOpacity
                  onPress={() => openAdd()}
                  accessibilityRole="button"
                  accessibilityLabel={tr.add}
                  style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol name="plus" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{tr.add}</Text>
                </TouchableOpacity>
              </View>
            )}

    </>
  ), [
    accountBalances, accountFilter, allCurrencies, c.accent, c.border, c.card, c.dim,
    c.green, c.red, c.sub, c.text, dateFilter, filter, fmtCur, groups.length, initialized,
    isDark, kindLabel, lang, loadFailed, locale, monthHasTransfers, openAccountForm, openAdd,
    primaryCurrency, retryLoad, totalsByCurrency, tr, upcomingPayments, visibleAccounts,
    overview.totalByCurrency, overview.unassigned.count, showBreakdown, unassignedOnly,
  ]);

  // Той самий вміст показується модалкою на телефоні й колонкою на
  // планшеті — див. DetailPane.
  const txDetailBody = selected ? (() => {
    // Вигляд переказу вмикає сам `type`: запис без адресата — зламані дані,
    // але малювати його витратою означало б брехати про долю грошей.
    const transfer = selected.type === 'transfer';
    const isIncome = selected.type === 'income';
    const color = transfer ? c.neutral : isIncome ? c.green : c.red;
    const iconName: IconSymbolName = transfer
      ? 'arrow.left.arrow.right'
      : getCatIcon(selected.category, isIncome ? 'income' : 'expense');
    const fromAccount = accountById(accounts, selected.accountId);
    const toAccount = transfer ? accountById(accounts, selected.toAccountId) : undefined;
    const detailCur = curOf(resolveTxCurrency(selected, accounts));
    const creditedCur = toAccount ? curOf(toAccount.currency) : detailCur;
    const credited = isTransfer(selected) ? creditedAmount(selected) : null;
    const rate = transferRate(selected);
    // Позначати переказом нема куди, поки немає другого рахунку.
    const canMark = !transfer && visibleAccounts.some(a => a.id !== selected.accountId);
    return (
    <>
                        <View style={s.handleRow}>
                          <View style={{ flex: 1 }} />
                          <View style={[s.handle, { backgroundColor: c.border }]} />
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <TouchableOpacity
                              onPress={() => setSelected(null)}
                              accessibilityRole="button"
                              accessibilityLabel={tr.close}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                              <IconSymbol name="xmark" size={17} color={c.sub} />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Hero */}
                        <View style={[s.detailHero, { backgroundColor: color + '12', borderColor: color + '25' }]}>
                          <View style={[s.detailIcon, { backgroundColor: color + '25' }]}>
                            <IconSymbol name={iconName} size={30} color={color} />
                          </View>
                          <Text style={[s.detailAmount, { color, marginTop: 12 }]}>
                            {transfer ? '' : isIncome ? '+' : '−'}{fmtCur(selected.amount, detailCur)}
                          </Text>
                          {credited !== null && credited !== selected.amount && (
                            <Text style={{ color: c.sub, fontSize: 15, fontWeight: '700', marginTop: 4 }}>
                              → {fmtCur(credited, creditedCur)}
                            </Text>
                          )}
                          <Text style={[s.detailCat, { color: c.text, marginTop: 4 }]}>
                            {transfer
                              ? `${fromAccount?.name ?? '—'} → ${toAccount?.name ?? '—'}`
                              : selected.category}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                            <View style={[s.typePill, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                              <IconSymbol name={transfer ? 'arrow.left.arrow.right' : isIncome ? 'arrow.up.trend' : 'arrow.down.trend'} size={11} color={color} />
                              <Text style={{ color, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>{typeLabel(selected.type)}</Text>
                            </View>
                            <View style={[s.typePill, { backgroundColor: c.dim, borderColor: c.border }]}>
                              <Text style={{ color: c.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                                {detailCur.code}
                              </Text>
                            </View>
                          </View>
                          {transfer && (
                            <Text style={{ color: c.sub, fontSize: 11, marginTop: 10, textAlign: 'center' }}>
                              {tr.transfersNotCounted}
                            </Text>
                          )}
                        </View>

                        <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginTop: 14 }]}>
                          {transfer ? (
                            <>
                              <InfoRow icon="banknote" label={tr.transferFrom} value={fromAccount?.name ?? '—'} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} />
                              <InfoRow icon="arrow.right" label={tr.transferTo} value={toAccount?.name ?? '—'} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} />
                              {rate !== null ? (
                                <InfoRow icon="arrow.left.arrow.right" label={tr.transferRate} value={`1 ${detailCur.code} = ${rate} ${creditedCur.code}`} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} />
                              ) : null}
                            </>
                          ) : (
                            <InfoRow icon="banknote" label={tr.account} value={fromAccount?.name ?? '—'} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} />
                          )}
                          {selected.note ? <InfoRow icon="doc.text" label={tr.note} value={selected.note} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} /> : null}
                          <InfoRow icon="calendar" label={tr.creationDate} value={new Date(selected.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color={c.sub} text={c.text} sub={c.sub} border={c.border} last />
                        </View>

                        {/* Ручна дія для старих даних, де переказ лежить парою
                            «витрата + дохід»: половину позначаємо переказом. */}
                        {canMark && (
                          <TouchableOpacity
                            onPress={() => {
                              const txId = selected.id;
                              const openMark = () => { setMarkTxId(txId); setMarkTargetId(null); };
                              // Деталь на телефоні — модалка; аркуш переказу
                              // поверх неї не презентується взагалі (NAT-02).
                              if (isExpanded) { openMark(); return; }
                              openAfterModalExit(() => setSelected(null), openMark);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={tr.markAsTransfer}
                            style={[s.btn, { marginTop: 14, backgroundColor: c.neutral + '18', borderWidth: 1, borderColor: c.neutral + '40' }]}>
                            <IconSymbol name="arrow.left.arrow.right" size={15} color={c.neutral} />
                            <Text style={{ color: c.neutral, fontWeight: '700', marginLeft: 6 }}>{tr.markAsTransfer}</Text>
                          </TouchableOpacity>
                        )}

                        {selected.history && selected.history.length > 0 && (
                          <View style={{ marginTop: 14 }}>
                            <Text style={[s.label, { color: c.sub, marginBottom: 8 }]}>{tr.history}</Text>
                            {[...selected.history].reverse().map((h) => (
                              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
                                <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: '#F59E0B20', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                                  <IconSymbol name="pencil.circle.fill" size={14} color="#F59E0B" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{tr.transactionEdited}</Text>
                                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{h.note}</Text>
                                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 3 }}>
                                    {new Date(h.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                                    {' · '}
                                    {new Date(h.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                          <TouchableOpacity onPress={() => deleteTx(selected.id)} style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                            <IconSymbol name="trash" size={15} color="#EF4444" />
                            <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>{tr.delete}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => startEdit(selected)} style={[s.btn, { flex: 1, backgroundColor: c.accent + '15', borderColor: c.accent + '40', borderWidth: 1 }]}>
                            <IconSymbol name="pencil" size={15} color={c.accent} />
                            <Text style={{ color: c.accent, fontWeight: '600', marginLeft: 5 }}>{tr.edit}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { flex: 1, backgroundColor: c.accent }]}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.close}</Text>
                          </TouchableOpacity>
                        </View>
    </>
    );
  })() : null;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>

        {/* Fixed Header */}
        <ScreenHeader
          title={tr.finance}
          color={c.text}
          actions={tab !== 'transactions' ? undefined :
            <>
              <HeaderButton
                onPress={() => setCompact(v => !v)}
                accessibilityLabel={compact ? tr.listMode : tr.compactView}
                style={{ backgroundColor: compact ? c.accent + '20' : c.dim, borderColor: compact ? c.accent : c.border }}>
                <IconSymbol name={compact ? 'rectangle.stack.fill' : 'rectangle.stack'} size={17} color={compact ? c.accent : c.sub} />
              </HeaderButton>
              <HeaderButton
                onPress={() => setShowMenu(true)}
                accessibilityLabel={tr.filtersAndSort}
                style={{ backgroundColor: dateFilter ? c.accent + '20' : c.dim, borderColor: dateFilter ? c.accent : c.border }}>
                <IconSymbol name="ellipsis" size={17} color={dateFilter ? c.accent : c.sub} />
              </HeaderButton>
            </>
          }>
          <FinanceTabBar tabs={visibleTabs} active={tab} onChange={changeTab} c={finColors} tr={tr} />
          <FinanceFilterBar
            filter={finFilter.filter}
            currencies={filterCurrencies}
            onPeriod={p => { finFilter.setPeriod(p); setDateFilter(null); }}
            onCurrency={code => finFilter.setCurrency(code === primaryCurrency ? null : code)}
            onScope={finFilter.setScope}
            showScope={tab !== 'accounts' && tab !== 'subscriptions'}
            c={finColors}
            tr={tr}
            locale={locale}
            isDark={isDark}
          />
        </ScreenHeader>

        {tab === 'overview' ? (
          <OverviewTab
            transactions={txs}
            accounts={accounts}
            categoryRows={extras.categoryRows}
            subscriptions={extras.subscriptions}
            recurringIncomes={extras.recurringIncomes}
            filter={finFilter.filter}
            primary={primaryCurrency}
            overview={overview}
            money={money}
            c={finColors}
            tr={tr}
            locale={locale}
            isWide={isWide}
            bottomInset={tabBarInset + 64}
            onOpenUnassigned={() => { setUnassignedOnly(true); changeTab('transactions'); }}
            onOpenSubscriptions={() => changeTab(visibleTabs.includes('subscriptions') ? 'subscriptions' : 'overview')}
            onOpenAccount={showBreakdown}
          />
        ) : tab === 'reports' ? (
          <ReportsTab
            transactions={txs}
            accounts={accounts}
            categoryRows={extras.categoryRows}
            subscriptions={extras.subscriptions}
            filter={finFilter.filter}
            primary={primaryCurrency}
            money={money}
            c={finColors}
            tr={tr}
            locale={locale}
            isWide={isWide}
            bottomInset={tabBarInset + 64}
            onAssignCategories={() => { setCatTab('expense'); setShowCats(true); }}
          />
        ) : tab === 'budget' ? (
          <BudgetPanel
            embedded={{
              month: activeMonth,
              months: budgetMonths,
              scope,
              bottomInset: tabBarInset,
              currency: finFilter.filter.currency,
              // Квартал/рік/довільний → поточний місяць СПІЛЬНОГО фільтра:
              // лише в місяці бюджет має рядки, «+» і редагування.
              onShowMonth: () => { finFilter.setPeriod(resolvePeriod('month', '', new Date())); setDateFilter(null); },
            }}
          />
        ) : tab === 'subscriptions' ? (
          <SubscriptionsPanel embedded={{ bottomInset: tabBarInset }} />
        ) : tab === 'accounts' ? (
          <AccountsTab
            accounts={accounts}
            overview={overview}
            money={money}
            kindLabel={kindLabel}
            c={finColors}
            tr={tr}
            isWide={isWide}
            bottomInset={tabBarInset + 64}
            onOpenAccount={showBreakdown}
            onEditAccount={account => openAccountForm(account)}
            onNewAccount={() => openAccountForm(null)}
            onOpenBanks={() => router.push('/banks' as never)}
          />
        ) : (
        <FlatList
          data={groups}
          keyExtractor={group => group.dateStr}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: tabBarInset + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          ListHeaderComponent={listHeader}
          renderItem={renderGroup}
        />
        )}
      </View>

      {/* FAB «+ Операція». На «Бюджеті» й «Підписках» у вкладки своя дія
          «додати», і друга кнопка поверх неї лише заступала б список. */}
      {tab !== 'budget' && tab !== 'subscriptions' ? (
      <PressableScale
        onPress={() => { haptic.medium(); openAdd(); }}
        accessibilityRole="button"
        accessibilityLabel={tr.add}
        scaleTo={0.92}
        style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </PressableScale>
      ) : null}
      </View>

      <DetailPane
        open={!!selected}
        wide={isExpanded}
        onClose={() => setSelected(null)}
        isDark={isDark}
        sheetColor={c.sheet}
        borderColor={c.border}
        maxHeight={height * 0.88}
        scrollRef={txDetailScrollRef}
        empty={
          <>
            <IconSymbol name="banknote" size={40} color={c.sub} />
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginTop: 12 }}>{tr.txEmptyTitle}</Text>
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 6 }}>{tr.txEmptyHint}</Text>
          </>
        }>
        {txDetailBody}
      </DetailPane>
      </View>


      {/* Undo-тост */}
      {undoElement}

      {/* ─── Context Menu Modal ─── */}
      <Modal visible={showMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowMenu(false)}>
        <Pressable accessible={false}
          style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
          onPress={() => setShowMenu(false)}>
            {/* NAT-03: Pressable з onPress на iOS сам стає елементом
                доступності й склеює ВСЕ піддерево в один вузол — VoiceOver
                читає аркуш однією фразою й не має в ньому жодного контролу.
                Тут Pressable існує лише заради stopPropagation. Модальну
                ізоляцію (accessibilityViewIsModal) при цьому лишаємо. */}
          <Pressable
            onPress={e => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
            importantForAccessibility="yes"
            style={{ position: 'absolute', top: insets.top + 62, right: 16, width: 220 }}>
            <BlurView intensity={isDark ? 60 : 75} tint={isDark ? 'dark' : 'light'} style={[s.menuBox, { borderColor: c.border }]}>

              {/* Статистика */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/finance-stats'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#0EA5E9' + '25' }]}>
                  <IconSymbol name="chart.bar.fill" size={15} color="#0EA5E9" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.statistics}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Категорії */}
              <TouchableOpacity
                onPress={() => openAfterModalExit(() => setShowMenu(false), () => setShowCats(true))}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#F59E0B25' }]}>
                  <IconSymbol name="tag.fill" size={15} color="#F59E0B" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.categories}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Бюджет */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/budget'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#0EA5E9' + '25' }]}>
                  <IconSymbol name="chart.pie.fill" size={15} color="#0EA5E9" />
                </View>
                {/* Через tr.*, а не рядком: підпис того самого розділу вже
                    розійшовся з сайдбаром і Налаштуваннями саме тому, що жив
                    у трьох місцях, а перекладався в одному. */}
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.navBudget}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Підписки — регулярні платежі. Операцій не створюють, тож
                  живуть окремим екраном поруч із бюджетом. */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/subscriptions'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#8B5CF625' }]}>
                  <IconSymbol name="repeat" size={15} color="#8B5CF6" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.navSubscriptions}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Рахунки. Замінили «розподіл балансу»: початковий залишок
                  тепер живе в самому рахунку, а не окремою поправкою. */}
              <TouchableOpacity
                onPress={() => openAfterModalExit(
                  () => setShowMenu(false),
                  () => { setAccForm(null); setShowAccounts(true); },
                )}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#8B5CF625' }]}>
                  <IconSymbol name="banknote" size={15} color="#8B5CF6" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.accounts}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Банки */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/banks'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#10B981' + '25' }]}>
                  <IconSymbol name="building.columns.fill" size={15} color="#10B981" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.piggyBanks}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Календар */}
              <TouchableOpacity
                onPress={() => openAfterModalExit(() => setShowMenu(false), () => setShowCal(true))}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: dateFilter ? c.accent + '25' : c.dim }]}>
                  <IconSymbol name="calendar" size={15} color={dateFilter ? c.accent : c.sub} />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>Календар</Text>
                {dateFilter
                  ? <View style={[s.menuPill, { backgroundColor: c.accent + '20', borderColor: c.accent + '40' }]}>
                      <Text style={[s.menuPillText, { color: c.accent }]}>
                        {dateFilter.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  : <IconSymbol name="chevron.right" size={13} color={c.sub} />
                }
              </TouchableOpacity>

            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Calendar Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>

                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={() => setShowCal(false)}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Month nav */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  {/* Ім'я кнопки — назва місяця, куди вона веде: власних ключів
                      «попередній/наступний місяць» у словнику немає, а «chevron.left»
                      VoiceOver вимовляв англійською (A11Y-01, NAT-28). */}
                  <TouchableOpacity
                    onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                    accessibilityRole="button"
                    accessibilityLabel={MONTHS_UA[(calMonth + 11) % 12]}
                    style={s.navBtn}>
                    <IconSymbol name="chevron.left" size={20} color={c.sub} />
                  </TouchableOpacity>
                  <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
                    {MONTHS_UA[calMonth]} {calYear}
                  </Text>
                  <TouchableOpacity
                    onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                    accessibilityRole="button"
                    accessibilityLabel={MONTHS_UA[(calMonth + 1) % 12]}
                    style={s.navBtn}>
                    <IconSymbol name="chevron.right" size={20} color={c.sub} />
                  </TouchableOpacity>
                </View>

                {/* Weekdays */}
                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                  {WEEKDAYS_SHORT.map(d => (
                    <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                  ))}
                </View>

                {/* Days */}
                {calWeeks.map((week, wi) => (
                  <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {week.map((day, di) => {
                      if (!day) return <View key={di} style={{ flex: 1 }} />;
                      const dayDate = new Date(calYear, calMonth, day);
                      const keyStr = `${calYear}-${calMonth}-${day}`;
                      const isToday = isSameDay(dayDate, now);
                      const isSel = !!dateFilter && isSameDay(dayDate, dateFilter);
                      const hasMark = markedDays.has(keyStr);
                      return (
                        <TouchableOpacity
                          key={di}
                          onPress={() => { setDateFilter(isSel ? null : dayDate); setShowCal(false); }}
                          accessibilityRole="button"
                          accessibilityLabel={[
                            dayDate.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
                            isToday ? tr.today : null,
                          ].filter(Boolean).join(', ')}
                          accessibilityState={{ selected: isSel }}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                          <View style={[s.dayCell, isSel && { backgroundColor: c.accent }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.accent }]}>
                            <Text style={{ color: isSel ? '#fff' : isToday ? c.accent : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                          </View>
                          {hasMark && !isSel && <View style={[s.daydot, { backgroundColor: c.accent }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>{tr.resetFilter}</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Modal ─── */}
      <SheetModal visible={showAdd} onClose={handleAddSheetClosed}>
        <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {editingId ? (
                    <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 14 }}>{tr.editTransaction}</Text>
                  ) : null}

                  {/* Вид операції: переказ — третій рівноправний, а не витрата */}
                  {typeOptions.length > 1 && (
                    <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 20 }]}>
                      {typeOptions.map(t => (
                        <TouchableOpacity
                          key={t}
                          onPress={() => {
                            setTxType(t);
                            setCategory('');
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ selected: txType === t }}
                          style={[s.typeBtn, txType === t && {
                            backgroundColor: t === 'income' ? c.green : t === 'expense' ? c.red : c.neutral,
                          }]}>
                          <IconSymbol
                            name={t === 'income' ? 'arrow.up.trend' : t === 'expense' ? 'arrow.down.trend' : 'arrow.left.arrow.right'}
                            size={14}
                            color={txType === t ? '#fff' : c.sub}
                          />
                          <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: txType === t ? '#fff' : c.sub }}>
                            {typeLabel(t)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Amount display. Валюта приходить із рахунку, окремого вибору немає. */}
                  <View style={[s.amountBlock, { backgroundColor: formColor + '12', borderColor: formColor + '30' }]}>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>
                      {tr.amountUAH.replace('₴', formCur.symbol).replace('UAH', formCur.code)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: formColor, fontSize: 28, fontWeight: '300' }}>{formCur.symbol}</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={amount}
                        onChangeText={t => setAmount(cleanAmountInput(t))}
                        keyboardType="decimal-pad"
                        accessibilityLabel={tr.amount}
                        style={{ color: formColor, fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
                      />
                    </View>
                  </View>

                  {/* Рахунок(и) */}
                  {txType === 'transfer' ? (
                    <>
                      <PickerField
                        label={tr.transferFrom}
                        icon="banknote"
                        options={accountOptions(formToAccountId, formAccountId)}
                        value={formAccountId}
                        onSelect={setFormAccountId}
                        colors={pickerColors}
                        isDark={isDark}
                        tr={tr}
                      />
                      <PickerField
                        label={tr.transferTo}
                        icon="arrow.right"
                        options={accountOptions(formAccountId, formToAccountId)}
                        value={formToAccountId}
                        onSelect={setFormToAccountId}
                        colors={pickerColors}
                        isDark={isDark}
                        tr={tr}
                      />
                    </>
                  ) : (
                    <PickerField
                      label={tr.account}
                      icon="banknote"
                      options={accountOptions(null, formAccountId)}
                      value={formAccountId}
                      onSelect={setFormAccountId}
                      colors={pickerColors}
                      isDark={isDark}
                      tr={tr}
                    />
                  )}

                  {visibleAccounts.length === 0 && (
                    <TouchableOpacity
                      onPress={goCreateFirstAccount}
                      accessibilityRole="button"
                      accessibilityLabel={tr.newAccount}
                      style={[s.btn, { marginTop: 12, backgroundColor: c.accent + '15', borderWidth: 1, borderColor: c.accent + '40' }]}>
                      <IconSymbol name="plus" size={15} color={c.accent} />
                      <Text style={{ color: c.accent, fontWeight: '700', marginLeft: 6 }}>{tr.newAccount}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Друга сума потрібна лише коли валюти рахунків різні:
                      списано 100 USD — зараховано 4100 UAH. */}
                  {crossCurrency && (
                    <>
                      <Text style={[s.label, { color: c.sub }]}>{tr.transferReceived}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: c.sub, fontSize: 18, fontWeight: '700', width: 22, textAlign: 'center' }}>
                          {curOf(formTo!.currency).symbol}
                        </Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={c.sub}
                          value={toAmount}
                          onChangeText={t => setToAmount(cleanAmountInput(t))}
                          keyboardType="decimal-pad"
                          accessibilityLabel={tr.transferReceived}
                          style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1 }]}
                        />
                      </View>
                      {formRate !== null && (
                        <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>
                          {tr.transferRate}: 1 {formFrom!.currency} = {formRate} {formTo!.currency}
                        </Text>
                      )}
                    </>
                  )}

                  {txType !== 'transfer' && (
                    <PickerField
                      label={tr.category}
                      icon="tag.fill"
                      options={categoryPickerOptions}
                      value={category || null}
                      onSelect={id => setCategory(id ?? '')}
                      createOption={categoryCreateOption}
                      colors={pickerColors}
                      isDark={isDark}
                      tr={tr}
                    />
                  )}

                  {/* Note */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.note}</Text>
                  <TextInput
                    placeholder={tr.notePlaceholder}
                    placeholderTextColor={c.sub}
                    value={note}
                    onChangeText={setNote}
                    accessibilityLabel={tr.note}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => closeAddSheet()} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveTx}
                      disabled={!formValid}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !formValid }}
                      style={[s.btn, { flex: 2, backgroundColor: formValid ? c.accent : c.dim }]}>
                      <IconSymbol
                        name={editingId ? 'checkmark' : txType === 'income' ? 'arrow.up.trend' : txType === 'expense' ? 'arrow.down.trend' : 'arrow.left.arrow.right'}
                        size={15}
                        color={formValid ? '#fff' : c.sub}
                      />
                      <Text style={{ color: formValid ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>{editingId ? tr.save : tr.add}</Text>
                    </TouchableOpacity>
                  </View>
          </ScrollView>
        </BlurView>
      </SheetModal>

      {/* ─── Primary Currency Picker ─── */}
      <Modal visible={showPrimaryPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowPrimaryPicker(false)}>
        <Pressable accessible={false} style={s.overlay} onPress={() => setShowPrimaryPicker(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
            importantForAccessibility="yes"
            style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    onPress={() => setShowPrimaryPicker(false)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.close}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 6 }}>{tr.primaryCurrency}</Text>
              <Text style={{ color: c.sub, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
                {tr.primaryCurrencyDesc}
              </Text>
              {/* Валют може бути скільки завгодно: BUILTIN — лише дві, решту
                  заводить користувач. Без прокрутки восьма й далі опинялись за
                  межею листа з overflow:'hidden' і обрати їх було неможливо (L4). */}
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {allCurrencies.map((curr, idx) => {
                const isSelected = primaryCurrency === curr.code;
                return (
                  <TouchableOpacity
                    key={curr.code}
                    onPress={() => { setPrimaryCurrency(curr.code); setShowPrimaryPicker(false); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected, checked: isSelected }}
                    accessibilityLabel={`${curr.code}, ${curr.kind === 'crypto' ? tr.cryptoKind : tr.fiatKind}`}
                    style={[{
                      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4,
                    }, idx < allCurrencies.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSelected ? c.accent : c.dim,
                      borderWidth: 1, borderColor: isSelected ? c.accent : c.border }}>
                      <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 14, fontWeight: '800' }}>{curr.symbol}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{curr.code}</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {curr.kind === 'crypto' ? tr.cryptoKind : tr.fiatKind}
                      </Text>
                    </View>
                    {isSelected && <IconSymbol name="checkmark" size={16} color={c.accent} />}
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Categories Modal ─── */}
      <Modal visible={showCats} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowCats(false); setShowAddCat(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={s.overlay} onPress={() => { setShowCats(false); setShowAddCat(false); }}>
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* Handle + close */}
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity
                        onPress={() => { setShowCats(false); setShowAddCat(false); }}
                        accessibilityRole="button"
                        accessibilityLabel={tr.close}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>{tr.categories}</Text>

                  {/* Tabs */}
                  <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 12 }]}>
                    {(['expense', 'income'] as CatType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { setCatTab(t); setShowAddCat(false); }}
                        style={[s.typeBtn, catTab === t && { backgroundColor: t === 'income' ? c.green : c.red }]}>
                        <IconSymbol name={t === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={13} color={catTab === t ? '#fff' : c.sub} />
                        <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: catTab === t ? '#fff' : c.sub }}>
                          {t === 'income' ? tr.incomes : tr.expenses}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Category list */}
                  <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginBottom: 14 }]}>
                    {cats[catTab].map((cat, idx) => {
                      const isLast = idx === cats[catTab].length - 1;
                      const isDefault = DEFAULT_CATEGORIES[catTab].some(d => d.name === cat.name);
                      const rowId = `${catTab}:${cat.name}`;
                      const explicit = catMeta[rowId] ?? {};
                      const meta = categoryMeta({ type: catTab, name: cat.name, ...explicit }, { fixedByReference: subscriptionFixedNames });
                      const metaOpen = metaOpenId === rowId;
                      return (
                        <View
                          key={cat.name}
                          style={!isLast ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border } : undefined}>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 }}>
                          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <IconSymbol name={cat.icon} size={13} color={c.accent} />
                          </View>
                          <TouchableOpacity
                            onPress={() => setMetaOpenId(metaOpen ? null : rowId)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: metaOpen }}
                            accessibilityLabel={`${cat.name}: ${categoryGroupLabel(meta.group, tr)}${catTab === 'expense' ? `, ${costKindLabel(meta.cost, tr)}` : ''}`}
                            style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
                            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{cat.name}</Text>
                            <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>
                              {categoryGroupLabel(meta.group, tr)}{catTab === 'expense' ? ` · ${costKindLabel(meta.cost, tr)}` : ''}
                            </Text>
                          </TouchableOpacity>
                          {isDefault
                            ? <View style={{ backgroundColor: c.dim, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>{tr.defaultCategory}</Text>
                              </View>
                            : <TouchableOpacity
                                onPress={() => setCats(prev => ({ ...prev, [catTab]: prev[catTab].filter(cc => cc.name !== cat.name) }))}
                                accessibilityRole="button"
                                accessibilityLabel={`${tr.delete}: ${cat.name}`}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <IconSymbol name="trash" size={13} color={c.sub} />
                              </TouchableOpacity>
                          }
                        </View>
                        {metaOpen ? (
                          <CategoryMetaEditor
                            type={catTab}
                            group={meta.group}
                            cost={meta.cost}
                            onGroup={group => setCatMeta(prev => ({ ...prev, [rowId]: { ...prev[rowId], group } }))}
                            onCost={cost => setCatMeta(prev => ({ ...prev, [rowId]: { ...prev[rowId], cost } }))}
                            c={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent }}
                            tr={tr}
                          />
                        ) : null}
                        </View>
                      );
                    })}
                  </View>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: -6, marginBottom: 14 }}>{tr.finCatMetaHint}</Text>

                  {/* Add new category */}
                  {showAddCat ? (
                    <View style={[{ borderRadius: 16, borderWidth: 1, padding: 14 }, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <TextInput
                        placeholder={tr.category}
                        placeholderTextColor={c.sub}
                        value={newCatName}
                        onChangeText={setNewCatName}
                        accessibilityLabel={tr.newCategory}
                        style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 12 }]}
                        autoFocus
                      />

                      <Text style={[s.label, { color: c.sub, marginTop: 0 }]}>{tr.icon}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {ICON_SUGGESTIONS.map(icon => {
                          const isSel = newCatIcon === icon;
                          return (
                            <TouchableOpacity
                              key={icon}
                              onPress={() => setNewCatIcon(icon)}
                              style={{
                                width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: isSel ? c.accent : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                                borderWidth: isSel ? 0 : 1,
                                borderColor: c.border,
                              }}>
                              <IconSymbol name={icon} size={15} color={isSel ? '#fff' : c.sub} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => { setShowAddCat(false); setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); }} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                          <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={addCategory}
                          disabled={!newCatName.trim()}
                          style={[s.btn, { flex: 2, backgroundColor: !newCatName.trim() ? c.dim : c.accent }]}>
                          <IconSymbol name="plus" size={14} color={!newCatName.trim() ? c.sub : '#fff'} />
                          <Text style={{ color: !newCatName.trim() ? c.sub : '#fff', fontWeight: '700', marginLeft: 5 }}>{tr.add}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowAddCat(true)}
                      style={[s.btn, { backgroundColor: c.accent + '15', borderWidth: 1, borderColor: c.accent + '40' }]}>
                      <IconSymbol name="plus" size={15} color={c.accent} />
                      <Text style={{ color: c.accent, fontWeight: '700', marginLeft: 6 }}>{tr.newCategory}</Text>
                    </TouchableOpacity>
                  )}

                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Рахунки: створення, перейменування, архівація ─── */}
      <SheetModal visible={showAccounts} onClose={handleAccountsSheetClosed}>
        <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <View style={s.handleRow}>
              <View style={{ flex: 1 }} />
              <View style={[s.handle, { backgroundColor: c.border }]} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <TouchableOpacity
                  onPress={() => { setShowAccounts(false); setAccForm(null); }}
                  accessibilityRole="button"
                  accessibilityLabel={tr.close}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol name="xmark" size={17} color={c.sub} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>{tr.accounts}</Text>

            {accounts.length === 0 && (
              <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19, marginBottom: 14 }}>{tr.noAccountsHint}</Text>
            )}

            {accounts.length > 0 && (
              <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginBottom: 14 }]}>
                {accounts.map((a, idx) => {
                  const tint = a.color ?? KIND_COLOR[a.kind];
                  const last = idx === accounts.length - 1;
                  return (
                    <View
                      key={a.id}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 },
                        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                        a.archived && { opacity: 0.55 },
                      ]}>
                      <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: tint + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <IconSymbol name={(a.icon as IconSymbolName) ?? KIND_ICON[a.kind]} size={14} color={tint} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{a.name}</Text>
                        <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>
                          {kindLabel(a.kind)} · {fmtCur(accountBalances[a.id] ?? a.openingBalance, curOf(a.currency))}
                          {a.archived ? ` · ${tr.accountArchived}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => openAccountForm(a)}
                        accessibilityRole="button"
                        accessibilityLabel={`${tr.edit}: ${a.name}`}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="pencil" size={15} color={c.sub} />
                      </TouchableOpacity>
                      {/* Видалення немає навмисно: операції рахунку нікуди не
                          діваються, і стертий рахунок лишив би їх без валюти. */}
                      <TouchableOpacity
                        onPress={() => toggleArchive(a)}
                        accessibilityRole="button"
                        accessibilityLabel={a.archived ? tr.unarchiveAccount : tr.archiveAccount}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name={a.archived ? 'arrow.uturn.backward' : 'archivebox.fill'} size={15} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {accForm ? (
              <View style={{ borderRadius: 16, borderWidth: 1, padding: 14, borderColor: c.border, backgroundColor: c.dim }}>
                <Text style={[s.label, { color: c.sub, marginTop: 0 }]}>{tr.nameLabel}</Text>
                <TextInput
                  placeholder={tr.accountDefaultName}
                  placeholderTextColor={c.sub}
                  value={accForm.name}
                  onChangeText={t => setAccForm(prev => (prev ? { ...prev, name: t } : prev))}
                  accessibilityLabel={tr.nameLabel}
                  style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text }]}
                />

                <Text style={[s.label, { color: c.sub }]}>{tr.account}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {ACCOUNT_KINDS.map(kind => {
                    const isSel = accForm.kind === kind;
                    return (
                      <TouchableOpacity
                        key={kind}
                        onPress={() => setAccForm(prev => (prev ? { ...prev, kind } : prev))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel }}
                        style={[s.catChip, { backgroundColor: isSel ? c.accent : c.dim, borderColor: isSel ? c.accent : c.border }]}>
                        <IconSymbol name={KIND_ICON[kind]} size={13} color={isSel ? '#fff' : c.sub} />
                        <Text style={{ color: isSel ? '#fff' : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{kindLabel(kind)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[s.label, { color: c.sub }]}>{tr.currency}</Text>
                {accForm.id ? (
                  <>
                    {/* Валюту не міняємо: вся історія рахунку порахована в ній,
                        і зміна заднім числом зробила б її безглуздою. */}
                    <View style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: c.border, opacity: 0.7 }]}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{accForm.currency}</Text>
                    </View>
                    <Text style={{ color: c.sub, fontSize: 11, marginTop: 6, lineHeight: 16 }}>{tr.accountCurrencyLocked}</Text>
                  </>
                ) : (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ flexDirection: 'row', gap: 7, paddingRight: 8 }}>
                      {allCurrencies.map(curr => {
                        const isSel = accForm.currency === curr.code;
                        return (
                          <TouchableOpacity
                            key={curr.code}
                            onPress={() => setAccForm(prev => (prev ? { ...prev, currency: curr.code } : prev))}
                            accessibilityRole="button"
                            accessibilityLabel={curr.code}
                            accessibilityState={{ selected: isSel }}
                            style={[s.catChip, { backgroundColor: isSel ? c.accent : c.dim, borderColor: isSel ? c.accent : c.border }]}>
                            <Text style={{ color: isSel ? '#fff' : c.sub, fontSize: 12, fontWeight: '800' }}>{curr.symbol}</Text>
                            <Text style={{ color: isSel ? '#fff' : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{curr.code}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => { setShowInlineAddCur(v => !v); setInlineCurTicker(''); setInlineCurSymbol(''); }}
                        accessibilityRole="button"
                        accessibilityLabel={tr.newCurrency}
                        style={[s.catChip, { backgroundColor: showInlineAddCur ? c.accent + '20' : c.dim, borderColor: showInlineAddCur ? c.accent : c.border, borderStyle: 'dashed' }]}>
                        <IconSymbol name="plus" size={13} color={showInlineAddCur ? c.accent : c.sub} />
                        <Text style={{ color: showInlineAddCur ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{tr.newCurrency}</Text>
                      </TouchableOpacity>
                    </ScrollView>

                    {showInlineAddCur && (
                      <View style={{ borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10, borderColor: c.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                        <TextInput
                          placeholder={tr.currencyTicker}
                          placeholderTextColor={c.sub}
                          value={inlineCurTicker}
                          onChangeText={t => setInlineCurTicker(t.toUpperCase())}
                          autoCapitalize="characters"
                          maxLength={8}
                          accessibilityLabel={tr.currencyTicker}
                          style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 10 }]}
                        />
                        <TextInput
                          placeholder={tr.currencySymbol}
                          placeholderTextColor={c.sub}
                          value={inlineCurSymbol}
                          onChangeText={setInlineCurSymbol}
                          maxLength={4}
                          accessibilityLabel={tr.currencySymbol}
                          style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 10 }]}
                        />
                        <View style={{ flexDirection: 'row', gap: 7 }}>
                          <TouchableOpacity
                            onPress={() => { setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol(''); }}
                            style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                            <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={addInlineCurrency}
                            disabled={!inlineCurTicker.trim()}
                            style={[s.btn, { flex: 2, backgroundColor: !inlineCurTicker.trim() ? c.dim : c.accent }]}>
                            <IconSymbol name="plus" size={14} color={!inlineCurTicker.trim() ? c.sub : '#fff'} />
                            <Text style={{ color: !inlineCurTicker.trim() ? c.sub : '#fff', fontWeight: '700', marginLeft: 5 }}>{tr.add}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </>
                )}

                <Text style={[s.label, { color: c.sub }]}>{tr.openingBalance}</Text>
                <TextInput
                  placeholder="0"
                  placeholderTextColor={c.sub}
                  value={accForm.opening}
                  accessibilityLabel={tr.openingBalance}
                  accessibilityHint={tr.openingBalanceHint}
                  // Мінус лишаємо: борг по картці — теж стан рахунку.
                  onChangeText={t => { setReconcileNote(null); setAccForm(prev => (prev ? { ...prev, opening: t.replace(/[^0-9.,-]/g, '') } : prev)); }}
                  keyboardType="numbers-and-punctuation"
                  style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text }]}
                />
                {/* Пояснення поля + живий підсумок: головна причина розбіжності
                    «Сьогодні» і «Фінансів» — поточний залишок, введений сюди
                    поверх уже привʼязаної історії (вона рахується двічі). */}
                <Text style={{ color: c.sub, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{tr.openingBalanceHint}</Text>
                {accFormPreview !== null && (
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginTop: 6 }}>
                    {tr.balanceWillBe.replace('{amount}', fmtCur(accFormPreview, curOf(accForm.currency)))}
                  </Text>
                )}
                {!!accForm.id && (
                  <>
                    <Text style={[s.label, { color: c.sub }]}>{tr.reconcileActualLabel}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={reconcileActual}
                        accessibilityLabel={tr.reconcileActualLabel}
                        onChangeText={t => setReconcileActual(t.replace(/[^0-9.,-]/g, ''))}
                        keyboardType="numbers-and-punctuation"
                        style={[s.input, { flexGrow: 1, flexBasis: 120, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text }]}
                      />
                      <TouchableOpacity
                        onPress={applyReconcile}
                        disabled={!reconcileActual.trim()}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !reconcileActual.trim() }}
                        accessibilityLabel={tr.reconcileBalance}
                        style={[s.btn, { flexGrow: 1, minHeight: 44, paddingHorizontal: 12, backgroundColor: reconcileActual.trim() ? c.accent + '20' : c.dim, borderWidth: 1, borderColor: reconcileActual.trim() ? c.accent + '55' : c.border }]}>
                        <IconSymbol name="arrow.triangle.2.circlepath" size={14} color={reconcileActual.trim() ? c.accent : c.sub} />
                        <Text style={{ color: reconcileActual.trim() ? c.accent : c.sub, fontWeight: '700', marginLeft: 6 }}>{tr.reconcileBalance}</Text>
                      </TouchableOpacity>
                    </View>
                    {reconcileNote && (
                      <Text style={{ color: c.accent, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{reconcileNote}</Text>
                    )}
                  </>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <TouchableOpacity onPress={() => setAccForm(null)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveAccount}
                    disabled={!accForm.name.trim()}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !accForm.name.trim() }}
                    style={[s.btn, { flex: 2, backgroundColor: !accForm.name.trim() ? c.dim : c.accent }]}>
                    <IconSymbol name="checkmark" size={14} color={!accForm.name.trim() ? c.sub : '#fff'} />
                    <Text style={{ color: !accForm.name.trim() ? c.sub : '#fff', fontWeight: '700', marginLeft: 6 }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => openAccountForm(null)}
                accessibilityRole="button"
                accessibilityLabel={tr.newAccount}
                style={[s.btn, { backgroundColor: c.accent + '15', borderWidth: 1, borderColor: c.accent + '40' }]}>
                <IconSymbol name="plus" size={15} color={c.accent} />
                <Text style={{ color: c.accent, fontWeight: '700', marginLeft: 6 }}>{tr.newAccount}</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </BlurView>
      </SheetModal>

      {/* ─── Позначити операцію переказом ─── */}
      <SheetModal visible={!!markTxId} onClose={() => { setMarkTxId(null); setMarkTargetId(null); }}>
        <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={s.handleRow}>
              <View style={{ flex: 1 }} />
              <View style={[s.handle, { backgroundColor: c.border }]} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <TouchableOpacity
                  onPress={() => { setMarkTxId(null); setMarkTargetId(null); }}
                  accessibilityRole="button"
                  accessibilityLabel={tr.close}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol name="xmark" size={17} color={c.sub} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 6 }}>{tr.markAsTransfer}</Text>
            <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19 }}>{tr.transfersNotCounted}</Text>
            <Text style={{ color: c.sub, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{tr.markTransferSameCurrency}</Text>

            {markTx && (
              <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginTop: 14 }]}>
                <InfoRow icon="banknote" label={tr.transferFrom} value={accountName(markTx.accountId)} color={c.sub} text={c.text} sub={c.sub} border={c.border} last />
              </View>
            )}

            <PickerField
              label={tr.transferTo}
              icon="arrow.right"
              options={accountOptions(markTx?.accountId ?? null, null, markTargets)}
              value={markTargetId}
              onSelect={setMarkTargetId}
              colors={pickerColors}
              isDark={isDark}
              tr={tr}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
              <TouchableOpacity
                onPress={() => { setMarkTxId(null); setMarkTargetId(null); }}
                style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applyMarkAsTransfer}
                disabled={!markTargetId}
                accessibilityRole="button"
                accessibilityState={{ disabled: !markTargetId }}
                style={[s.btn, { flex: 2, backgroundColor: markTargetId ? c.accent : c.dim }]}>
                <IconSymbol name="arrow.left.arrow.right" size={15} color={markTargetId ? '#fff' : c.sub} />
                <Text style={{ color: markTargetId ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>{tr.save}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </BlurView>
      </SheetModal>
    </View>
  );
}

function InfoRow({ icon, label, value, color, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 13 }, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <IconSymbol name={icon} size={15} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontWeight: '600', width: 72, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  dateChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  filterRow:   { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  filterBtn:   { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  groupLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fab:         { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  amountBlock: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 4 },
  detailHero:  { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center' },
  typePill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  typeRow:     { flexDirection: 'row', borderRadius: 12, padding: 3 },
  typeBtn:     { flex: 1, flexDirection: 'row', paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  catChip:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailAmount:{ fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  detailCat:   { fontSize: 15, fontWeight: '600', marginTop: 4 },
  infoBlock:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  navBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot:      { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  // Context menu
  menuBox:     { borderRadius: 18, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 },
  menuItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  menuIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuLabel:   { flex: 1, fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, marginHorizontal: 14 },
  menuToggle:  { width: 34, height: 20, borderRadius: 10, borderWidth: 1, padding: 2, justifyContent: 'center' },
  menuToggleDot:{ width: 14, height: 14, borderRadius: 7 },
  menuPill:    { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  menuPillText:{ fontSize: 11, fontWeight: '700' },
  // Compact rows
  txCompact:   { borderRadius: 12, borderWidth: 1, paddingRight: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  txAccentBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 0 },
  txIconSm:    { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  txCategorySm:{ fontSize: 13, fontWeight: '600' },
  txNoteSm:    { fontSize: 11, fontWeight: '400' },
  txAmountSm:  { fontSize: 13, fontWeight: '800' },
});
