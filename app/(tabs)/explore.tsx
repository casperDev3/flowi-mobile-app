import { Atlas } from '@/constants/atlas';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { OverlayScrim } from '@/components/ds/OverlaySurface';
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

import { KIND_COLOR, KIND_ICON, PeriodFlowCard } from '@/components/finance/FinanceSummary';
import { OperationsNotices, orderCurrencies } from '@/components/finance/OperationsSummary';
import { LoadErrorNotice } from '@/components/finance/LoadErrorNotice';
import { afterModalExit, createSheetHandoff, openAfterModalExit } from '@/components/finance/sheetHandoff';
import { UpcomingPaymentsCard, useUpcomingPayments } from '@/components/finance/UpcomingPaymentsCard';
import { TransactionGroup } from '@/components/finance/TransactionGroup';
import { FAB_LIST_CLEARANCE } from '@/components/tasks/AddTaskButton';
import { PickerField, type PickerOption } from '@/components/shared/PickerField';
import { PressableScale } from '@/components/shared/PressableScale';
// Верхній інсет рахує ScreenHeader усередині AppHeader (useTopInset у JS).
import { AppHeader } from '@/components/shared/AppHeader';
import { ScrollHeaderProvider, ScrollHeaderSlot } from '@/components/shared/ScrollHeaderSlot';
import { useHeaderScroll } from '@/hooks/use-header-scroll';
import type { TitleMenuItem } from '@/components/shared/TitleMenu';
import { SheetModal } from '@/components/shared/SheetModal';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
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
import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';
import { isSameDay } from '@/utils/dateUtils';
import { haptic } from '@/utils/haptics';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { wideModalStyles } from '@/components/finance/wideModal';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import {
  DEFAULT_CATEGORIES_EN, DEFAULT_CATEGORIES_UK, categoryNameIssue, categoryOptions,
  type CategoryDef,
} from '@/utils/financeCategories';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { BulkActionBar, ZoneLayout, ZoneSkeleton, zoneWidths, type BulkAction, type SwipeAction } from '@/components/layout-zones';
import { useZoneState } from '@/hooks/use-zone-state';
import { useFinanceLayoutStrings } from '@/components/finance/layoutStrings';
import { categoryGroupLabel, costKindLabel, type FinColors } from '@/components/finance/financeLabels';
import { AccountsTab } from '@/components/finance/AccountsTab';
import { CategoryMetaEditor } from '@/components/finance/CategoryMetaEditor';
import { FinanceFilterBar, FinanceTabBar } from '@/components/finance/FinanceSectionBar';
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
import { parseFinanceTab, reportsFabHidden, visibleFinanceTabs, type FinanceTab } from '@/utils/financeTabs';
import { formatSubscriptionMoney, parseDateKey } from '@/utils/subscriptions';
import { fontFamily } from '@/constants/theme';
import { KpiCounter, MeshBackground } from '@/components/ds';
import { glassOf, glassRimFor } from '@/components/shared/dsTheme';
import { AccentIcon } from '@/components/shared/GlassBits';

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
  const headerScroll = useHeaderScroll();
  const resetHeaderScroll = headerScroll.reset;
  const { width, height, isWide } = useResponsive();
  // Рукописні модалки (календар, валюта, категорії) — діалогом на планшеті,
  // як і SheetModal-и цього ж екрана.
  const wm = wideModalStyles(isWide);
  // DS v2: нейтральна палітра; головні дії/вибрані чипи — action.primary (c.accent).
  const { t, isDark } = useDSTheme();
  useScreenView('finance');
  /**
   * Вкладка розділу (finance-revamp.md §2). Живе в параметрі `?tab=`: сайдбар,
   * deep link і «Змінити підписки» з попередження відкривають потрібну
   * вкладку адресою. Прихована (вимкнений підмодуль) чи невідома → «Операції»
   * (типова вкладка — рішення власника 2026-10).
   */
  const searchParams = useLocalSearchParams<{ create?: string; tab?: string }>();
  const { disabledModules } = useUiModules();
  const visibleTabs = useMemo(() => visibleFinanceTabs(disabledModules), [disabledModules]);
  const [tab, setTab] = useState<FinanceTab>(() => parseFinanceTab(searchParams.tab, visibleTabs));
  // «Звіти»: FAB ховається, поки стрічку гортають униз (накривав відсотки).
  const [reportsFabOff, setReportsFabOff] = useState(false);
  const reportsScrollY = useRef(0);
  const onReportsScroll = useCallback((y: number) => {
    const prev = reportsScrollY.current;
    reportsScrollY.current = y;
    setReportsFabOff(h => reportsFabHidden(prev, y, h));
  }, []);
  useEffect(() => { reportsScrollY.current = 0; setReportsFabOff(false); resetHeaderScroll(); }, [tab, resetHeaderScroll]);
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
  // Оплати підписок. На «Операціях» показуємо лише СЬОГОДНІШНІ (todayOnly).
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
  /**
   * Layout System v2.4: вибрана операція — у параметрі маршруту `?tx=<id>`
   * (поряд із `?panel=`), тож диплінк відкриває ту саму деталь. Сам запис
   * береться зі стрічки: правка чи синк одразу видно в панелі, а видалена
   * деінде операція просто закриває її.
   */
  const zoneState = useZoneState({ section: 'finance', selectedParam: 'tx', label: tr.finance });
  const zoneSelect = zoneState.select;
  const selected = useMemo(
    () => (zoneState.selectedId ? txs.find(x => x.id === zoneState.selectedId) ?? null : null),
    [txs, zoneState.selectedId],
  );
  // Стабільна посилання (через ref): select залежить від router, і нова
  // функція щорендера перемальовувала б усю стрічку (PERF-4).
  const zoneSelectRef = useRef(zoneSelect);
  useEffect(() => { zoneSelectRef.current = zoneSelect; });
  const setSelected = useCallback((tx: Transaction | null) => zoneSelectRef.current(tx ? tx.id : null), []);
  const lz = useFinanceLayoutStrings();
  const screenWidth = useScreenWidth();
  /**
   * Деталь — панель праворуч (планшет, коли вміщається) чи нижній аркуш
   * (телефон / вузьке вікно). Аркуш — це RN Modal, тож друге вікно (форма,
   * «позначити переказом») відкриваємо лише після його зникнення (NAT-02).
   */
  const detailInPanel = isWide && zoneWidths({
    windowWidth: width, screenWidth, wide: isWide, wantStatic: false, wantDynamic: true,
  }).dynamicMode === 'panel';
  /** Масовий вибір операцій (довгий дотик по рядку). */
  const [bulkIds, setBulkIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = bulkIds.size > 0;
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);
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
  }, [DEFAULT_CATEGORIES]);

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
      // P2: 'arrow.up.trend'/'arrow.down.trend' не існують у SF Symbols —
      // на iOS категорія без запису (Продукти, Кафе…) малювала порожній
      // квадрат. 'tag.fill' є і в SF Symbols, і в мапі Material.
      'tag.fill',
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

  /** Оборот періоду для вкладки «Рахунки» — без фільтра стрічки по рахунку. */
  const flowTotalsByCurrency = useMemo(
    () => calcPeriodTotalsByCurrency(
      scope === 'all' ? txs : txs.filter(t => matchesMoneyScope(t, scope)),
      period,
      t => resolveTxCurrency(t, accounts),
    ),
    [txs, scope, period, accounts],
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

  const todayLabel = now.toDateString();
  const yesterdayLabel = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString();
  const groups = useMemo(() => groupTransactions(
    filtered,
    todayLabel,
    yesterdayLabel,
    locale,
  ), [filtered, locale, todayLabel, yesterdayLabel]);

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
  const accountDefaultPendingRef = useRef(false);
  useEffect(() => {
    if (!accountDefaultPendingRef.current) return;
    if (!showAdd || editingId) { accountDefaultPendingRef.current = false; return; }
    const accId = defaultAccountId(accounts, lastAccountRef.current);
    if (!accId) return;
    accountDefaultPendingRef.current = false;
    setFormAccountId(prev => prev ?? accId);
  }, [accounts, showAdd, editingId]);

  const openAdd = useCallback((mode: FormType = 'expense') => {
    setEditingId(null);
    setTxType(mode);
    setAmount(''); setCategory(''); setNote(''); setToAmount('');
    const accId = defaultAccountId(accounts, lastAccountRef.current);
    setFormAccountId(accId);
    // Диплінк `?create=1` відкриває форму ДО того, як рахунки дочитались, і
    // поле «Рахунок» лишалось порожнім навіть з єдиним рахунком. Ефект нижче
    // підставить типовий, щойно рахунки з'являться.
    accountDefaultPendingRef.current = !accId;
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
    // Аркуш деталі не відкритий (свайп «Змінити» з рядка) або деталь — панель:
    // мінятись нема з чим, форма відкривається одразу.
    if (detailInPanel || !selected) {
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
      // Стрічка карток рахунків пішла з «Операцій» — фільтр стрічки по
      // рахунку тепер вмикається звідси.
      {
        text: tr.finShowOperations,
        onPress: () => { setAccountFilter(account.id); changeTab('transactions'); },
      },
      { text: tr.reconcileBalance, onPress: () => openAccountForm(account) },
      { text: tr.close, style: 'cancel' },
    ]);
  }, [overview.breakdowns, fmtCur, curOf, tr, openAccountForm, changeTab]);

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

  /**
   * Масове видалення — та сама операція, що й з одного рядка (deleteTx), але
   * одним записом і з одним «Скасувати» на весь набір. Підтвердження — лише
   * для кількох: одну операцію й досі видаляють без діалогу (є undo).
   */
  const deleteTxs = (ids: string[]) => {
    const set = new Set(ids);
    const removed = txs.filter(x => set.has(x.id));
    if (removed.length === 0) return;
    setTxs(p => p.filter(x => !set.has(x.id)));
    if (selected && set.has(selected.id)) setSelected(null);
    clearBulk();
    showUndo(removed.length === 1 ? tr.transactionDeleted : lz.bulkDeleted(removed.length), () => {
      setTxs(prev => [...prev, ...removed.filter(r => !prev.some(p => p.id === r.id))]);
    });
  };
  const confirmDeleteTxs = (ids: string[]) => {
    if (ids.length <= 1) { deleteTxs(ids); return; }
    Alert.alert(lz.bulkDeleteTitle(ids.length), lz.bulkDeleteBody, [
      { text: tr.cancel, style: 'cancel' },
      { text: lz.bulkDelete, style: 'destructive', onPress: () => deleteTxs(ids) },
    ]);
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
    bg1:    t.bg.canvas,
    bg2:    t.bg.canvas,
    card:   glassOf(t).surface,
    border: t.border.hairline,
    text:   t.text.primary,
    sub:    t.text.secondary,
    green:  t.status.success,
    red:    t.status.danger,
    // Переказ малюємо нейтральним: він не дохід і не витрата, і зелений чи
    // червоний тут брехали б про те, що сталося з грошима.
    neutral: t.text.secondary,
    // DS v2: головна дія / вибраний чип — action.primary з text.onAction.
    accent: t.action.primary,
    onAccent: t.text.onAction,
    // DS v2.1: акцент розділу «Фінанси» — lime (ink на склі, #RRGGBB) — для
    // вкладених палітр компонентів, icon-chip меню, прогресу.
    info:   glassOf(t).accent.lime.ink,
    dim:    glassOf(t).surfaceSubtle,
    sheet:  glassOf(t).sheet,
  };

  const txDetailScrollRef = useRef<ScrollView>(null);

  /** Палітра вкладок розділу — з тих самих кольорів екрана. */
  const finColors = useMemo<FinColors>(
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, card: c.card, accent: c.info, green: c.green, red: c.red, sheet: c.sheet }),
    [c.text, c.sub, c.border, c.dim, c.card, c.info, c.green, c.red, c.sheet],
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
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.info, sheet: c.sheet }),
    [c.text, c.sub, c.border, c.dim, c.info, c.sheet],
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
   * Layout System v2.4 — дії рядка без входу в деталі: свайп уліво
   * («Змінити» / «Видалити», ті самі startEdit і deleteTx з undo), довгий
   * дотик — масовий вибір, тап у режимі вибору — перемкнути рядок. Свіжі
   * функції — у ref, щоб renderGroup лишався стабільним (PERF-4).
   */
  const rowOpsRef = useRef({ startEdit, deleteTx, confirmDelete: confirmDeleteTxs });
  useEffect(() => { rowOpsRef.current = { startEdit, deleteTx, confirmDelete: confirmDeleteTxs }; });
  const swipeActionsFor = useCallback((tx: Transaction): SwipeAction[] => [
    { key: 'edit', label: lz.swipeEdit, icon: 'pencil', tone: 'neutral', onPress: () => rowOpsRef.current.startEdit(tx), testID: 'tx-swipe-edit' },
    { key: 'delete', label: lz.swipeDelete, icon: 'trash.fill', tone: 'danger', onPress: () => rowOpsRef.current.deleteTx(tx.id), testID: 'tx-swipe-delete' },
  ], [lz]);
  const toggleBulk = useCallback((tx: Transaction) => {
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(tx.id)) next.delete(tx.id); else next.add(tx.id);
      return next;
    });
  }, []);
  const onRowPress = useCallback((tx: Transaction) => {
    if (selectionMode) { haptic.light(); toggleBulk(tx); return; }
    setSelected(tx);
  }, [selectionMode, toggleBulk, setSelected]);
  const onRowLongPress = useCallback((tx: Transaction) => {
    haptic.medium();
    toggleBulk(tx);
  }, [toggleBulk]);
  // Вибір живе лише в стрічці «Операцій»: інша вкладка — інший список.
  useEffect(() => { clearBulk(); }, [tab, clearBulk]);
  const bulkActions = useMemo<BulkAction[]>(() => [
    { key: 'delete', label: lz.bulkDelete, icon: 'trash.fill', tone: 'danger', testID: 'tx-bulk-delete', onPress: () => rowOpsRef.current.confirmDelete([...bulkIds]) },
  ], [lz, bulkIds]);

  /**
   * Рядок стрічки. useCallback обовʼязковий: FlatList тримає renderItem у
   * рендері комірок, тож нова функція щорендера перемальовувала б увесь
   * видимий місяць на кожну натиснуту клавішу у формі (PERF-4).
   */
  const renderGroup = useCallback(({ item, index }: { item: ReturnType<typeof groupTransactions>[number]; index: number }) => (
    <Animated.View
      entering={shouldAnimateGroup(item.dateStr) ? motion.entering(FadeInDown.duration(200).delay(Math.min(index, 6) * 40)) : undefined}
      layout={motion.entering(LinearTransition.duration(Motion.duration.slow).easing(Motion.easing.out))}>
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
        onSelect={onRowPress}
        onLongPress={onRowLongPress}
        swipeActionsFor={swipeActionsFor}
        activeId={selected?.id ?? null}
        bulkIds={bulkIds}
        selectionMode={selectionMode}
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
    onRowPress, onRowLongPress, swipeActionsFor, selected?.id, bulkIds, selectionMode,
  ]);

  /** Суми «Залишків» — тією самою точністю валюти, що й стрічка. */
  const fmtCode = useCallback((n: number, code: string) => fmtCur(n, curOf(code)), [fmtCur, curOf]);
  // «Рахунки» сховано (вимкнено підмодуль «Банки») → список рахунків у модалці:
  // «Огляду» з балансами більше немає, а порожнього переходу не має бути.
  const openAccountsTab = useCallback(() => {
    if (visibleTabs.includes('accounts')) { changeTab('accounts'); return; }
    setAccForm(null);
    setShowAccounts(true);
  }, [changeTab, visibleTabs]);
  const accountFilterName = accountFilter ? (accountById(accounts, accountFilter)?.name ?? null) : null;
  /** Чи є оплата з датою сьогодні — інакше блок не малюємо зовсім. */
  const hasTodayDue = useMemo(() => upcomingPayments.items.some(i => i.daysUntil === 0), [upcomingPayments.items]);
  /**
   * Плашки над стрічкою: операції без рахунку й чип фільтра за рахунком.
   * Самі залишки (колишня картка «Залишки») — KPI під заголовком (headerKpis).
   */
  const opsNotices = useMemo(() => (
    <OperationsNotices
      unassignedLabel={overview.unassigned.count > 0
        ? tr.unassignedTxWarning.replace('{n}', String(overview.unassigned.count))
        : null}
      unassignedActive={unassignedOnly}
      onPressUnassigned={() => { haptic.light(); setUnassignedOnly(v => !v); }}
      accountFilterName={accountFilterName}
      onClearAccountFilter={() => { haptic.light(); setAccountFilter(null); }}
    />
  ), [overview.unassigned.count, tr, unassignedOnly, accountFilterName]);
  const todayDueCard = useCallback((style: object) => (
    <UpcomingPaymentsCard
      data={upcomingPayments}
      todayOnly
      isDark={isDark}
      c={{ text: c.text, sub: c.sub, border: c.border }}
      tr={tr}
      lang={lang}
      style={style}
    />
  ), [upcomingPayments, isDark, c.text, c.sub, c.border, tr, lang]);

  /**
   * Layout System v2.4 — статична зона «плашки + сьогоднішні оплати» поруч
   * зі стрічкою лише там, де вона вміщається поряд із деталлю (вікно ≥ 1280,
   * стрічка лишається найширшою). Інакше той самий контекст — у шапці стрічки.
   */
  const detailOpen = tab === 'transactions' && !!selected && zoneState.panels.dynamic;
  const staticShown = tab === 'transactions' && zoneWidths({
    windowWidth: width, screenWidth, wide: isWide, wantStatic: zoneState.panels.static, wantDynamic: detailOpen,
  }).showStatic;

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
                style={[s.dateChip, { backgroundColor: c.accent }]}>
                <IconSymbol name="calendar" size={14} color={c.onAccent} />
                <Text style={{ color: c.onAccent, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>
                  {dateFilter.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
                </Text>
                <IconSymbol name="xmark" size={14} color={c.onAccent} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            )}

            {/* Плашки (без рахунку / фільтр рахунку) + «Сьогодні до оплати»
                над стрічкою. Залишки — KPI у шапці. На дуже широкому вікні
                це — у статичній зоні ліворуч (ZoneLayout). */}
            {!staticShown && (
              <View style={isWide ? s.summaryRow : undefined}>
                <View style={isWide ? s.summaryCell : undefined}>{opsNotices}</View>
                {hasTodayDue ? (
                  <View style={isWide ? s.summaryCell : undefined}>
                    {todayDueCard({ marginTop: 14, marginBottom: 0 })}
                  </View>
                ) : null}
              </View>
            )}

            {/* Заголовок стрічки. Перемикач Всі/Доходи/Витрати переїхав у
                фільтр-чип ряду періоду (FinanceFilterBar): під табами й
                періодом він був третім рядом контролів (P2 аудиту 2026-10). */}
            <View style={[s.feedHead, { marginTop: staticShown ? 4 : 18 }]}>
              <Text style={[s.feedTitle, { color: c.text }]} accessibilityRole="header">{tr.finTabTransactions}</Text>
              {filter !== 'all' ? (
                <TouchableOpacity
                  onPress={() => setFilter('all')}
                  accessibilityRole="button"
                  accessibilityLabel={`${filter === 'income' ? tr.incomes : tr.expenses}, ${tr.all}`}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={[s.dateChip, { marginBottom: 0, backgroundColor: (filter === 'income' ? c.green : c.red) + '20', borderColor: (filter === 'income' ? c.green : c.red) + '60' }]}>
                  <Text style={{ color: filter === 'income' ? c.green : c.red, fontSize: 12, fontFamily: fontFamily.semibold }}>
                    {filter === 'income' ? tr.incomes : tr.expenses}
                  </Text>
                  <IconSymbol name="xmark" size={12} color={filter === 'income' ? c.green : c.red} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Empty state with CTA */}
            {groups.length === 0 && !loadFailed && (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <AccentIcon isDark={isDark} icon="banknote" accent="lime" size="lg" style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 14 }} />
                <Text style={{ color: c.text, fontSize: 16, marginTop: 6, fontFamily: fontFamily.semibold }}>{tr.noTransactions}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.85 }}>{tr.pressToAdd}</Text>
                <TouchableOpacity
                  onPress={() => openAdd()}
                  accessibilityRole="button"
                  accessibilityLabel={tr.add}
                  style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, borderRadius: 999, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol name="plus" size={16} color={c.onAccent} />
                  <Text style={{ color: c.onAccent, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.add}</Text>
                </TouchableOpacity>
              </View>
            )}

    </>
  ), [
    c.accent, c.onAccent, c.green, c.red, c.sub, c.text, dateFilter, filter,
    groups.length, initialized, isDark, staticShown, isWide, lang, loadFailed, locale, openAdd,
    retryLoad, tr, todayDueCard, opsNotices, hasTodayDue,
  ]);
  // Телефон (11.2026): заголовок розділу гортається зі стрічкою — гніздо
  // ScrollHeaderSlot читає його з провайдера, тож сама шапка стрічки лишається
  // тим самим об'єктом і не перемальовує FlatList на кожну літеру (PERF-4).
  const feedHeader = useMemo(() => <><ScrollHeaderSlot insetX={20} />{listHeader}</>, [listHeader]);

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
                        {/* Ручку, ✕ і «Закрити» дає каркас зон (панель / аркуш). */}
                        {/* Hero */}
                        <View style={[s.detailHero, { backgroundColor: c.dim }]}>
                          <View style={[s.detailIcon, { backgroundColor: color + '25' }]}>
                            <IconSymbol name={iconName} size={30} color={color} />
                          </View>
                          <Text style={[s.detailAmount, { color, marginTop: 12 }]}>
                            {transfer ? '' : isIncome ? '+' : '−'}{fmtCur(selected.amount, detailCur)}
                          </Text>
                          {credited !== null && credited !== selected.amount && (
                            <Text style={{ color: c.sub, fontSize: 15, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginTop: 4 }}>
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
                              <IconSymbol name={transfer ? 'arrow.left.arrow.right' : isIncome ? 'arrow.up.trend' : 'arrow.down.trend'} size={12} color={color} />
                              <Text style={{ color, fontSize: 11, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{typeLabel(selected.type)}</Text>
                            </View>
                            <View style={[s.typePill, { backgroundColor: c.dim, borderColor: c.border }]}>
                              <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5 }}>
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
                              if (detailInPanel) { openMark(); return; }
                              openAfterModalExit(() => setSelected(null), openMark);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={tr.markAsTransfer}
                            style={[s.btn, { marginTop: 14, backgroundColor: c.dim }]}>
                            <IconSymbol name="arrow.left.arrow.right" size={16} color={c.neutral} />
                            <Text style={{ color: c.neutral, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.markAsTransfer}</Text>
                          </TouchableOpacity>
                        )}

                        {selected.history && selected.history.length > 0 && (
                          <View style={{ marginTop: 14 }}>
                            <Text style={[s.label, { color: c.sub, marginBottom: 8 }]}>{tr.history}</Text>
                            {[...selected.history].reverse().map((h) => (
                              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
                                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.accent.amber + '26', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                                  <IconSymbol name="pencil.circle.fill" size={14} color={t.accent.amber} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.transactionEdited}</Text>
                                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{h.note}</Text>
                                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 4 }}>
                                    {new Date(h.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                                    {' · '}
                                    {new Date(h.at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                  </Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        )}

    </>
    );
  })() : null;

  /** Липкий низ деталі: «Видалити» і головна дія «Змінити» (чорна pill DS). */
  const txDetailFooter = selected ? (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <TouchableOpacity
        onPress={() => deleteTx(selected.id)}
        accessibilityRole="button"
        testID="tx-detail-delete"
        style={[s.btn, { flex: 1, backgroundColor: c.red + '14' }]}>
        <IconSymbol name="trash" size={16} color={c.red} />
        <Text style={{ color: c.red, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.delete}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => startEdit(selected)}
        accessibilityRole="button"
        testID="tx-detail-edit"
        style={[s.btn, { flex: 1.4, backgroundColor: c.accent }]}>
        <IconSymbol name="pencil" size={16} color={c.onAccent} />
        <Text style={{ color: c.onAccent, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.edit}</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  // ─── KPI розділу: залишки на рахунках (11.2026, рішення власника) ──────────
  // Картку «Залишки» над стрічкою прибрано — її цифра стала великим числом під
  // заголовком «Фінанси»: «На рахунках» по кожній валюті (основна першою), та
  // сама сума й точність валюти, що були в картці (financeOverview), а під нею
  // — «Перенесено з минулого» за період фільтра. Курсів немає, тож суми між
  // валютами немає свідомо. Тап — усі рахунки. До першого читання — нічого
  // (нуль до завантаження збрехав би).
  const balanceCodes = orderCurrencies(Object.keys(overview.totalByCurrency), primaryCurrency);
  const headerKpis = initialized && !loadFailed ? (
    visibleAccounts.length > 0 ? (
      <>
        {(balanceCodes.length > 0 ? balanceCodes : [primaryCurrency]).map(code => {
          const value = overview.totalByCurrency[code] ?? 0;
          const carry = totalsByCurrency[code]?.carryover ?? 0;
          const carryText = carry !== 0 ? `${tr.carryover}: ${carry > 0 ? '+' : ''}${fmtCode(carry, code)}` : null;
          return (
            <View key={code} testID={`fin-balance-${code}`}>
              <KpiCounter
                value={fmtCode(value, code)}
                label={tr.totalOnAccounts}
                valueColor={value < 0 ? t.status.danger : undefined}
                onPress={openAccountsTab}
                accessibilityLabel={[`${tr.totalOnAccounts} ${fmtCode(value, code)}`, carryText, tr.finOpenAccounts].filter(Boolean).join('. ')}
              />
              {/* Перенесений залишок — підписом ПІД сумою, як і в картці. */}
              {carryText ? (
                <Text
                  numberOfLines={1}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                  maxFontSizeMultiplier={1.3}
                  style={[s.kpiCaption, { color: t.text.secondary }]}>
                  {carryText}
                </Text>
              ) : null}
            </View>
          );
        })}
      </>
    ) : (
      <KpiCounter
        value={fmtCode(0, primaryCurrency)}
        label={tr.noAccounts}
        delta={tr.newAccount}
        onPress={() => openAccountForm(null)}
        accessibilityLabel={`${tr.noAccounts}. ${tr.newAccount}`}
      />
    )
  ) : undefined;

  /**
   * Бургер (☰) навпроти заголовка «Фінанси» (11.2026): дії розділу — колишнє
   * меню «⋯». Перемикач «Компактний вигляд» з шапки прибрано — він тепер
   * пункт-галочка цього меню (лише на «Операціях», як і раніше). Наступну
   * модалку відкриваємо після зникнення поповера (NAT-02, sheetHandoff).
   */
  const titleMenuItems: TitleMenuItem[] = [
    { key: 'stats', label: tr.statistics, icon: 'chart.bar.fill', onPress: () => router.push('/finance-stats') },
    { key: 'cats', label: tr.categories, icon: 'tag.fill', onPress: () => afterModalExit(() => setShowCats(true)) },
    {
      key: 'accounts', label: tr.accounts, icon: 'banknote',
      onPress: () => afterModalExit(() => { setAccForm(null); setShowAccounts(true); }),
    },
    { key: 'banks', label: tr.piggyBanks, icon: 'building.columns.fill', onPress: () => router.push('/banks') },
    ...(tab === 'transactions' ? [
      {
        key: 'calendar',
        label: dateFilter
          ? `${tr.calendar} · ${dateFilter.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`
          : tr.calendar,
        icon: 'calendar' as const,
        separatorBefore: true,
        onPress: () => afterModalExit(() => setShowCal(true)),
      },
      {
        key: 'compact',
        label: tr.compactView,
        icon: 'rectangle.stack' as const,
        checked: compact,
        onPress: () => setCompact(v => !v),
      },
    ] : []),
  ];

  // FAB «+ Операція». На «Бюджеті» й «Підписках» у вкладки своя дія
  // «додати», і друга кнопка поверх неї лише заступала б список. Під час
  // масового вибору її місце — у панелі дій.
  const fab = tab !== 'budget' && tab !== 'subscriptions' && !(tab === 'reports' && reportsFabOff) && !selectionMode ? (
    <PressableScale
      onPress={() => { haptic.medium(); openAdd(); }}
      accessibilityRole="button"
      accessibilityLabel={tr.add}
      scaleTo={0.92}
      style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: c.accent }]}>
      <IconSymbol name="plus" size={26} color={c.onAccent} />
    </PressableScale>
  ) : null;

  /**
   * Статична зона (лише вікно ≥ 1280 і лише «Операції»): плашки стрічки й
   * сьогоднішні оплати — контекст, що не залежить від вибору. Поки сховище
   * не прочитане — скелет у формі вмісту, а не нулі.
   */
  const staticPane = tab === 'transactions' ? (
    initialized ? (
      <View style={{ paddingRight: 4 }}>
        {opsNotices}
        {todayDueCard({ marginTop: 16, marginBottom: 0 })}
      </View>
    ) : <ZoneSkeleton variant="static" />
  ) : undefined;

  const headerProps = {
    title: tr.finance,
    kpis: headerKpis,
    titleMenu: { items: titleMenuItems, active: !!dateFilter, accessibilityLabel: tr.filtersAndSort },
    // Один ряд навігації: сегменти вкладок (+ «Ще») і, на планшеті, фільтр
    // періоду поруч. Раніше тут було три ряди «табів».
    children: (
          <View style={isWide ? s.navRowWide : undefined}>
          <FinanceTabBar tabs={visibleTabs} active={tab} onChange={changeTab} c={finColors} tr={tr} stretch={!isWide} />
          <FinanceFilterBar
            filter={finFilter.filter}
            currencies={filterCurrencies}
            onPeriod={p => { finFilter.setPeriod(p); setDateFilter(null); }}
            onCurrency={code => finFilter.setCurrency(code === primaryCurrency ? null : code)}
            onScope={finFilter.setScope}
            showScope={tab !== 'accounts' && tab !== 'subscriptions'}
            txType={tab === 'transactions' ? filter : undefined}
            onTxType={tab === 'transactions' ? setFilter : undefined}
            c={finColors}
            tr={tr}
            locale={locale}
            isDark={isDark}
          />
          </View>
    ),
  };
  const renderHeaderBody = (insetX: number) => <AppHeader {...headerProps} part="body" insetX={insetX} />;

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {/*
        Layout System v2.4 — зони «Операцій»: [статична «плашки + оплати» (≥1280)]
        [стрічка — завжди найширша] [деталь операції — панель праворуч з ✕ /
        нижній аркуш ~60% на телефоні]. Інші вкладки (Рахунки, Бюджет,
        Підписки, Звіти) — лише головна зона: деталі в них мають власні
        панелі (Підписки) або не існують.
      */}
      <ZoneLayout
        testID="finance-zones"
        main={
      <View style={{ flex: 1 }}>

        {/* Omni: глобальна шапка (☰ · дзвіник · акаунт; на планшеті — рядок
            інструментів) + KPI залишків на рахунках і бургер дій навпроти
            заголовка; під нею — вкладки й фільтр. Телефон (11.2026): нерухома
            лише смуга кнопок; заголовок, KPI, вкладки й фільтр — першим
            елементом прокрутки кожної вкладки (ScrollHeaderSlot). */}
        <AppHeader {...headerProps} part="toolbar" scrolled={headerScroll.scrolled} />

        <ScrollHeaderProvider render={renderHeaderBody} onScrollY={headerScroll.onScrollY}>
        {tab === 'reports' ? (
          <ReportsTab
            transactions={txs}
            accounts={accounts}
            categoryRows={extras.categoryRows}
            subscriptions={extras.subscriptions}
            recurringIncomes={extras.recurringIncomes}
            filter={finFilter.filter}
            primary={primaryCurrency}
            money={money}
            c={finColors}
            tr={tr}
            locale={locale}
            isWide={isWide}
            bottomInset={tabBarInset + 64}
            onScrollY={onReportsScroll}
            onAssignCategories={() => { setCatTab('expense'); setShowCats(true); }}
            onOpenSubscriptions={visibleTabs.includes('subscriptions') ? () => changeTab('subscriptions') : undefined}
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
            header={
              <PeriodFlowCard
                currencies={allCurrencies}
                totalsByCurrency={flowTotalsByCurrency}
                primaryCode={primaryCurrency}
                onPickPrimary={() => setShowPrimaryPicker(true)}
                fmt={fmtCur}
                isDark={isDark}
                c={{ border: c.border, sub: c.sub, text: c.text, dim: c.dim, accent: c.info, green: c.green, red: c.red }}
                incomeLabel={tr.incomes}
                expenseLabel={tr.expenses}
                savingsLabel={tr.savings}
                transfersNoteLabel={tr.transfersNotCounted}
                showTransfersNote={monthHasTransfers}
                title={tr.finPeriodFlow}
              />
            }
          />
        ) : (
        <FlatList
          data={groups}
          keyExtractor={group => group.dateStr}
          // На планшеті стрічка операцій — колонка для читання по центру:
          // рядок «категорія … сума» на всю ширину ландшафту розносить
          // назву й суму так далеко, що око губить, що до чого.
          contentContainerStyle={[
            // P1: FAB «+» більше не накриває суму останнього рядка — той самий
            // запас, що й у списку Задач.
            { paddingHorizontal: 20, paddingTop: 8, paddingBottom: tabBarInset + FAB_LIST_CLEARANCE },
            isWide && { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          onScroll={headerScroll.onScroll}
          scrollEventThrottle={16}
          // Заголовок розділу — через гніздо (ScrollHeaderSlot читає провайдер):
          // сам ListHeaderComponent лишається тим самим об'єктом (PERF-4).
          ListHeaderComponent={feedHeader}
          renderItem={renderGroup}
        />
        )}
        </ScrollHeaderProvider>
      </View>
        }
        dynamic={tab === 'transactions' ? txDetailBody : null}
        dynamicOpen={detailOpen}
        onCloseDynamic={() => setSelected(null)}
        dynamicFooter={tab === 'transactions' ? txDetailFooter : undefined}
        dynamicLabel={lz.txDetails}
        dynamicScrollRef={txDetailScrollRef}
        static={staticPane}
        showStatic={zoneState.panels.static}
        panels={isWide && tab === 'transactions' ? zoneState.panels : undefined}
        onTogglePanel={zoneState.togglePanel}
        fab={fab}
        overlay={tab === 'transactions' ? (
          <BulkActionBar
            testID="tx-bulk-bar"
            count={bulkIds.size}
            actions={bulkActions}
            onClear={clearBulk}
            bottom={tabBarInset + 16}
          />
        ) : null}
      />

      {/* Undo-тост */}
      {undoElement}

      {/* ─── Calendar Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={() => setShowCal(false)}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[s.sheetWrapper, wm.column]}>
              <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
                <OverlayMaterial isDark={isDark} />

                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={() => setShowCal(false)}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={18} color={c.sub} />
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
                  <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontFamily: fontFamily.semibold }}>
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
                    <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold }}>{d}</Text>
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
                            <Text style={{ color: isSel ? c.onAccent : isToday ? c.accent : c.text, fontSize: 13, fontFamily: isToday || isSel ? fontFamily.semibold : fontFamily.regular }}>{day}</Text>
                          </View>
                          {hasMark && !isSel && <View style={[s.daydot, { backgroundColor: c.accent }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { backgroundColor: c.dim }]}>
                    <IconSymbol name="xmark" size={14} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.resetFilter}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Modal ─── */}
      <SheetModal visible={showAdd} onClose={handleAddSheetClosed}>
        <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
          <OverlayMaterial isDark={isDark} />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {editingId ? (
                    <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, marginBottom: 14 }}>{tr.editTransaction}</Text>
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
                            color={txType === t ? WHITE : c.sub}
                          />
                          <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 4, color: txType === t ? WHITE : c.sub }}>
                            {typeLabel(t)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Amount display. Валюта приходить із рахунку, окремого вибору немає. */}
                  <View style={[s.amountBlock, { backgroundColor: formColor + '12', borderColor: formColor + '30' }]}>
                    <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 6 }}>
                      {tr.amountUAH.replace('₴', formCur.symbol).replace('UAH', formCur.code)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: formColor, fontSize: 28, fontFamily: fontFamily.light }}>{formCur.symbol}</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={amount}
                        onChangeText={t => setAmount(cleanAmountInput(t))}
                        keyboardType="decimal-pad"
                        accessibilityLabel={tr.amount}
                        style={{ color: formColor, fontSize: 38, fontFamily: fontFamily.semibold, letterSpacing: -1, flex: 1 }}
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
                      style={[s.btn, { marginTop: 12, backgroundColor: c.dim }]}>
                      <IconSymbol name="plus" size={16} color={c.accent} />
                      <Text style={{ color: c.accent, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.newAccount}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Друга сума потрібна лише коли валюти рахунків різні:
                      списано 100 USD — зараховано 4100 UAH. */}
                  {crossCurrency && (
                    <>
                      <Text style={[s.label, { color: c.sub }]}>{tr.transferReceived}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: c.sub, fontSize: 18, fontFamily: fontFamily.semibold, width: 22, textAlign: 'center' }}>
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
                      <Text style={{ color: c.sub, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveTx}
                      disabled={!formValid}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !formValid }}
                      style={[s.btn, { flex: 2, backgroundColor: formValid ? c.accent : c.dim }]}>
                      <IconSymbol
                        name={editingId ? 'checkmark' : txType === 'income' ? 'arrow.up.trend' : txType === 'expense' ? 'arrow.down.trend' : 'arrow.left.arrow.right'}
                        size={16}
                        color={formValid ? c.onAccent : c.sub}
                      />
                      <Text style={{ color: formValid ? c.onAccent : c.sub, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{editingId ? tr.save : tr.add}</Text>
                    </TouchableOpacity>
                  </View>
          </ScrollView>
        </View>
      </SheetModal>

      {/* ─── Primary Currency Picker ─── */}
      <Modal visible={showPrimaryPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowPrimaryPicker(false)}>
        <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={() => setShowPrimaryPicker(false)}>
          {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
          <OverlayScrim />
          <Pressable
            onPress={e => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
            importantForAccessibility="yes"
            style={[s.sheetWrapper, wm.column]}>
            <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
              <OverlayMaterial isDark={isDark} />
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    onPress={() => setShowPrimaryPicker(false)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.close}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, marginBottom: 6 }}>{tr.primaryCurrency}</Text>
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
                    <View style={{ width: 34, height: 34, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: isSelected ? c.accent : c.dim,
                      }}>
                      <Text style={{ color: isSelected ? c.onAccent : c.sub, fontSize: 14, fontFamily: fontFamily.semibold }}>{curr.symbol}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{curr.code}</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {curr.kind === 'crypto' ? tr.cryptoKind : tr.fiatKind}
                      </Text>
                    </View>
                    {isSelected && <IconSymbol name="checkmark" size={16} color={c.accent} />}
                  </TouchableOpacity>
                );
              })}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Categories Modal ─── */}
      <Modal visible={showCats} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowCats(false); setShowAddCat(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={() => { setShowCats(false); setShowAddCat(false); }}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
              style={[s.sheetWrapper, wm.column]}>
              <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
                <OverlayMaterial isDark={isDark} />
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
                        <IconSymbol name="xmark" size={18} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={{ color: c.text, fontSize: 17, fontFamily: fontFamily.semibold, marginBottom: 12 }}>{tr.categories}</Text>

                  {/* Tabs */}
                  <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 12 }]}>
                    {(['expense', 'income'] as CatType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { setCatTab(t); setShowAddCat(false); }}
                        style={[s.typeBtn, catTab === t && { backgroundColor: t === 'income' ? c.green : c.red }]}>
                        <IconSymbol name={t === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={14} color={catTab === t ? WHITE : c.sub} />
                        <Text style={{ fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 4, color: catTab === t ? WHITE : c.sub }}>
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
                          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 }}>
                          <View style={{ width: 28, height: 28, borderRadius: Atlas.radius.small, backgroundColor: c.dim, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <IconSymbol name={cat.icon} size={14} color={c.text} />
                          </View>
                          <TouchableOpacity
                            onPress={() => setMetaOpenId(metaOpen ? null : rowId)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: metaOpen }}
                            accessibilityLabel={`${cat.name}: ${categoryGroupLabel(meta.group, tr)}${catTab === 'expense' ? `, ${costKindLabel(meta.cost, tr)}` : ''}`}
                            style={{ flex: 1, minHeight: 36, justifyContent: 'center' }}>
                            <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{cat.name}</Text>
                            <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>
                              {categoryGroupLabel(meta.group, tr)}{catTab === 'expense' ? ` · ${costKindLabel(meta.cost, tr)}` : ''}
                            </Text>
                          </TouchableOpacity>
                          {isDefault
                            ? <View style={{ backgroundColor: c.dim, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: c.sub, fontSize: 10, fontFamily: fontFamily.semibold }}>{tr.defaultCategory}</Text>
                              </View>
                            : <TouchableOpacity
                                onPress={() => setCats(prev => ({ ...prev, [catTab]: prev[catTab].filter(cc => cc.name !== cat.name) }))}
                                accessibilityRole="button"
                                accessibilityLabel={`${tr.delete}: ${cat.name}`}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <IconSymbol name="trash" size={14} color={c.sub} />
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
                    <View style={[{ borderRadius: Atlas.radius.large, padding: 14 }, { backgroundColor: c.dim }]}>
                      <TextInput
                        placeholder={tr.category}
                        placeholderTextColor={c.sub}
                        value={newCatName}
                        onChangeText={setNewCatName}
                        accessibilityLabel={tr.newCategory}
                        style={[s.input, { backgroundColor: c.dim, color: c.text, marginBottom: 12 }]}
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
                                backgroundColor: isSel ? c.accent : c.dim,
                                borderWidth: 0,
                                borderColor: c.border,
                              }}>
                              <IconSymbol name={icon} size={16} color={isSel ? c.onAccent : c.sub} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => { setShowAddCat(false); setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); }} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                          <Text style={{ color: c.sub, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={addCategory}
                          disabled={!newCatName.trim()}
                          style={[s.btn, { flex: 2, backgroundColor: !newCatName.trim() ? c.dim : c.accent }]}>
                          <IconSymbol name="plus" size={14} color={!newCatName.trim() ? c.sub : c.onAccent} />
                          <Text style={{ color: !newCatName.trim() ? c.sub : c.onAccent, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.add}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowAddCat(true)}
                      style={[s.btn, { backgroundColor: c.dim }]}>
                      <IconSymbol name="plus" size={16} color={c.accent} />
                      <Text style={{ color: c.accent, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.newCategory}</Text>
                    </TouchableOpacity>
                  )}

                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Рахунки: створення, перейменування, архівація ─── */}
      <SheetModal visible={showAccounts} onClose={handleAccountsSheetClosed}>
        <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
          <OverlayMaterial isDark={isDark} />
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
                  <IconSymbol name="xmark" size={18} color={c.sub} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, marginBottom: 12 }}>{tr.accounts}</Text>

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
                        <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{a.name}</Text>
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
                        <IconSymbol name="pencil" size={16} color={c.sub} />
                      </TouchableOpacity>
                      {/* Видалення немає навмисно: операції рахунку нікуди не
                          діваються, і стертий рахунок лишив би їх без валюти. */}
                      <TouchableOpacity
                        onPress={() => toggleArchive(a)}
                        accessibilityRole="button"
                        accessibilityLabel={a.archived ? tr.unarchiveAccount : tr.archiveAccount}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name={a.archived ? 'arrow.uturn.backward' : 'archivebox.fill'} size={16} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {accForm ? (
              <View style={{ borderRadius: Atlas.radius.large, padding: 14, backgroundColor: c.dim }}>
                <Text style={[s.label, { color: c.sub, marginTop: 0 }]}>{tr.nameLabel}</Text>
                <TextInput
                  placeholder={tr.accountDefaultName}
                  placeholderTextColor={c.sub}
                  value={accForm.name}
                  onChangeText={t => setAccForm(prev => (prev ? { ...prev, name: t } : prev))}
                  accessibilityLabel={tr.nameLabel}
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                />

                <Text style={[s.label, { color: c.sub }]}>{tr.account}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ACCOUNT_KINDS.map(kind => {
                    const isSel = accForm.kind === kind;
                    return (
                      <TouchableOpacity
                        key={kind}
                        onPress={() => setAccForm(prev => (prev ? { ...prev, kind } : prev))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isSel }}
                        style={[s.catChip, { backgroundColor: isSel ? c.accent : c.dim }]}>
                        <IconSymbol name={KIND_ICON[kind]} size={14} color={isSel ? c.onAccent : c.sub} />
                        <Text style={{ color: isSel ? c.onAccent : c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{kindLabel(kind)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[s.label, { color: c.sub }]}>{tr.currency}</Text>
                {accForm.id ? (
                  <>
                    {/* Валюту не міняємо: вся історія рахунку порахована в ній,
                        і зміна заднім числом зробила б її безглуздою. */}
                    <View style={[s.input, { backgroundColor: c.dim, opacity: 0.7 }]}>
                      <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{accForm.currency}</Text>
                    </View>
                    <Text style={{ color: c.sub, fontSize: 11, marginTop: 6, lineHeight: 16 }}>{tr.accountCurrencyLocked}</Text>
                  </>
                ) : (
                  <>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {allCurrencies.map(curr => {
                        const isSel = accForm.currency === curr.code;
                        return (
                          <TouchableOpacity
                            key={curr.code}
                            onPress={() => setAccForm(prev => (prev ? { ...prev, currency: curr.code } : prev))}
                            accessibilityRole="button"
                            accessibilityLabel={curr.code}
                            accessibilityState={{ selected: isSel }}
                            style={[s.catChip, { backgroundColor: isSel ? c.accent : c.dim }]}>
                            <Text style={{ color: isSel ? c.onAccent : c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{curr.symbol}</Text>
                            <Text style={{ color: isSel ? c.onAccent : c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{curr.code}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => { setShowInlineAddCur(v => !v); setInlineCurTicker(''); setInlineCurSymbol(''); }}
                        accessibilityRole="button"
                        accessibilityLabel={tr.newCurrency}
                        style={[s.catChip, { backgroundColor: c.dim, borderWidth: 1, borderColor: showInlineAddCur ? c.text : c.border, borderStyle: 'dashed' }]}>
                        <IconSymbol name="plus" size={14} color={showInlineAddCur ? c.text : c.sub} />
                        <Text style={{ color: showInlineAddCur ? c.text : c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.newCurrency}</Text>
                      </TouchableOpacity>
                    </ScrollView>

                    {showInlineAddCur && (
                      <View style={{ borderRadius: Atlas.radius.large, padding: 14, marginTop: 10, backgroundColor: c.dim }}>
                        <TextInput
                          placeholder={tr.currencyTicker}
                          placeholderTextColor={c.sub}
                          value={inlineCurTicker}
                          onChangeText={t => setInlineCurTicker(t.toUpperCase())}
                          autoCapitalize="characters"
                          maxLength={8}
                          accessibilityLabel={tr.currencyTicker}
                          style={[s.input, { backgroundColor: c.dim, color: c.text, marginBottom: 10 }]}
                        />
                        <TextInput
                          placeholder={tr.currencySymbol}
                          placeholderTextColor={c.sub}
                          value={inlineCurSymbol}
                          onChangeText={setInlineCurSymbol}
                          maxLength={4}
                          accessibilityLabel={tr.currencySymbol}
                          style={[s.input, { backgroundColor: c.dim, color: c.text, marginBottom: 10 }]}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            onPress={() => { setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol(''); }}
                            style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                            <Text style={{ color: c.sub, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={addInlineCurrency}
                            disabled={!inlineCurTicker.trim()}
                            style={[s.btn, { flex: 2, backgroundColor: !inlineCurTicker.trim() ? c.dim : c.accent }]}>
                            <IconSymbol name="plus" size={14} color={!inlineCurTicker.trim() ? c.sub : c.onAccent} />
                            <Text style={{ color: !inlineCurTicker.trim() ? c.sub : c.onAccent, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.add}</Text>
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
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                />
                {/* Пояснення поля + живий підсумок: головна причина розбіжності
                    «Сьогодні» і «Фінансів» — поточний залишок, введений сюди
                    поверх уже привʼязаної історії (вона рахується двічі). */}
                <Text style={{ color: c.sub, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{tr.openingBalanceHint}</Text>
                {accFormPreview !== null && (
                  <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, marginTop: 6 }}>
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
                        style={[s.input, { flexGrow: 1, flexBasis: 120, backgroundColor: c.dim, color: c.text }]}
                      />
                      <TouchableOpacity
                        onPress={applyReconcile}
                        disabled={!reconcileActual.trim()}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !reconcileActual.trim() }}
                        accessibilityLabel={tr.reconcileBalance}
                        style={[s.btn, { flexGrow: 1, minHeight: 44, paddingHorizontal: 12, backgroundColor: reconcileActual.trim() ? c.accent : c.dim }]}>
                        <IconSymbol name="arrow.triangle.2.circlepath" size={14} color={reconcileActual.trim() ? c.onAccent : c.sub} />
                        <Text style={{ color: reconcileActual.trim() ? c.onAccent : c.sub, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.reconcileBalance}</Text>
                      </TouchableOpacity>
                    </View>
                    {reconcileNote && (
                      <Text style={{ color: c.sub, fontSize: 12, lineHeight: 17, marginTop: 6 }}>{reconcileNote}</Text>
                    )}
                  </>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <TouchableOpacity onPress={() => setAccForm(null)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={saveAccount}
                    disabled={!accForm.name.trim()}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !accForm.name.trim() }}
                    style={[s.btn, { flex: 2, backgroundColor: !accForm.name.trim() ? c.dim : c.accent }]}>
                    <IconSymbol name="checkmark" size={14} color={!accForm.name.trim() ? c.sub : c.onAccent} />
                    <Text style={{ color: !accForm.name.trim() ? c.sub : c.onAccent, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => openAccountForm(null)}
                accessibilityRole="button"
                accessibilityLabel={tr.newAccount}
                style={[s.btn, { backgroundColor: c.dim }]}>
                <IconSymbol name="plus" size={16} color={c.accent} />
                <Text style={{ color: c.accent, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.newAccount}</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </View>
      </SheetModal>

      {/* ─── Позначити операцію переказом ─── */}
      <SheetModal visible={!!markTxId} onClose={() => { setMarkTxId(null); setMarkTargetId(null); }}>
        <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
          <OverlayMaterial isDark={isDark} />
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
                  <IconSymbol name="xmark" size={18} color={c.sub} />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, marginBottom: 6 }}>{tr.markAsTransfer}</Text>
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
                <Text style={{ color: c.sub, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applyMarkAsTransfer}
                disabled={!markTargetId}
                accessibilityRole="button"
                accessibilityState={{ disabled: !markTargetId }}
                style={[s.btn, { flex: 2, backgroundColor: markTargetId ? c.accent : c.dim }]}>
                <IconSymbol name="arrow.left.arrow.right" size={16} color={markTargetId ? c.onAccent : c.sub} />
                <Text style={{ color: markTargetId ? c.onAccent : c.sub, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.save}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </SheetModal>
    </View>
  );
}

function InfoRow({ icon, label, value, color, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 14 }, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <IconSymbol name={icon} size={16} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontFamily: fontFamily.semibold, width: 72, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1 }}>{value}</Text>
    </View>
  );
}

/** Білий підпис на status.success / status.danger (перемикач «дохід/витрата»). */
const WHITE = '#FFFFFF';

const s = StyleSheet.create({
  dateChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 14 },
  feedHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 },
  feedTitle:   { fontSize: 16, fontFamily: fontFamily.semibold, flexShrink: 1 },
  summaryRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  // «Перенесено з минулого» під KPI залишку — як дельта KpiCounter, але без стелі ширини.
  kpiCaption:  { marginTop: 2, fontSize: 12, lineHeight: 16, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
  summaryCell: { flexGrow: 1, flexBasis: 260, minWidth: 0 },
  // Планшет: вкладки ліворуч, період і «Фільтри (N)» праворуч — один ряд.
  // wrap лишається лише страховкою для найвужчого medium-вікна.
  navRowWide:  { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12 },
  sidePane:    { alignSelf: 'stretch', flex: 1 },
  groupLabel:  { fontSize: 12, fontFamily: fontFamily.medium },
  fab:         { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#111113', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: Atlas.radius.xxlarge, padding: 24, overflow: 'hidden' },
  amountBlock: { borderRadius: Atlas.radius.large, padding: 20, marginBottom: 4 },
  detailHero:  { borderRadius: Atlas.radius.xxlarge, padding: 24, alignItems: 'center' },
  typePill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 16 },
  typeRow:     { flexDirection: 'row', borderRadius: 999, padding: 4 },
  typeBtn:     { flex: 1, flexDirection: 'row', paddingVertical: 10, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  input:       { borderRadius: Atlas.radius.medium, minHeight: 44, padding: 14, fontSize: 14, fontFamily: fontFamily.regular },
  label:       { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8, marginTop: 16 },
  catChip:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, borderRadius: 999 },
  btn:         { paddingVertical: 14, minHeight: 48, borderRadius: 999, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon:  { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  // DS v2: сума — display (тонкі великі цифри, tabular-nums).
  detailAmount:{ fontSize: 44, lineHeight: 48, fontFamily: fontFamily.light, letterSpacing: -0.88, fontVariant: ['tabular-nums'] },
  detailCat:   { fontSize: 15, fontFamily: fontFamily.semibold, marginTop: 4 },
  infoBlock:   { borderRadius: Atlas.radius.large, overflow: 'hidden' },
  navBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:     { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  daydot:      { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 12, minHeight: 44, borderRadius: 999 },
  // Compact rows
  txCompact:   { borderRadius: Atlas.radius.large, paddingRight: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  txAccentBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 0 },
  txIconSm:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  txCategorySm:{ fontSize: 13, fontFamily: fontFamily.semibold },
  txNoteSm:    { fontSize: 11, fontFamily: fontFamily.regular },
  txAmountSm:  { fontSize: 14, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
});
