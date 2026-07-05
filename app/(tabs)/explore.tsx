import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FinanceSummary } from '@/components/finance/FinanceSummary';
import { TransactionGroup } from '@/components/finance/TransactionGroup';
import { MonthPicker } from '@/components/shared/MonthPicker';
import { PressableScale } from '@/components/shared/PressableScale';
import { SheetModal } from '@/components/shared/SheetModal';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { saveSynced, saveSyncedValue } from '@/store/synced-storage';
import {
  filterByMonth, groupTransactions,
  calcTotalsByCurrency, formatCurrency,
  BUILTIN_CURRENCIES, txCurrency,
  type Currency, type CurrencyTotals,
} from '@/utils/financeUtils';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { useMotion } from '@/hooks/use-motion';
import { isSameDay } from '@/utils/dateUtils';
import { haptic } from '@/utils/haptics';

type TxType = 'income' | 'expense';

interface Transaction {
  id: string; type: TxType; category: string; amount: number; note: string; date: string;
  currency?: string;
}

interface CategoryDef { name: string; icon: IconSymbolName; }

const DEFAULT_CATEGORIES_UK: Record<TxType, CategoryDef[]> = {
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

const DEFAULT_CATEGORIES_EN: Record<TxType, CategoryDef[]> = {
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


function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function FinanceScreen() {
  const isDark = useColorScheme() === 'dark';
  useScreenView('finance');
  const insets = useSafeAreaInsets();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const DEFAULT_CATEGORIES = lang === 'uk' ? DEFAULT_CATEGORIES_UK : DEFAULT_CATEGORIES_EN;
  const MONTHS_UA = tr.months;
  const WEEKDAYS_SHORT = tr.weekdays;
  const fmtCur = (n: number, cur: Currency) => formatCurrency(n, cur, locale);
  const motion = useMotion();
  const now = new Date();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [filter, setFilter] = useState<'all' | TxType>('all');
  const [dateFilter, setDateFilter] = useState<Date | null>(null);
  const [activeMonth, setActiveMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [compact, setCompact] = useState(false);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  // Categories management
  const [cats, setCats] = useState<Record<TxType, CategoryDef[]>>(DEFAULT_CATEGORIES);
  const [catsInitialized, setCatsInitialized] = useState(false);
  const [showCats, setShowCats] = useState(false);
  const [catTab, setCatTab] = useState<TxType>('expense');
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState<IconSymbolName>('ellipsis.circle.fill');

  // Inline add category inside Add Transaction modal
  const [showInlineAddCat, setShowInlineAddCat] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');
  const [inlineCatIcon, setInlineCatIcon] = useState<IconSymbolName>('ellipsis.circle.fill');

  // Currency state
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [currenciesInitialized, setCurrenciesInitialized] = useState(false);
  const [txCur, setTxCur] = useState<string>('UAH');
  const [showInlineAddCur, setShowInlineAddCur] = useState(false);
  const [inlineCurTicker, setInlineCurTicker] = useState('');
  const [inlineCurSymbol, setInlineCurSymbol] = useState('');

  // Manual balance adjustments per currency — used to split the historical
  // carryover between currencies (e.g. mark part of UAH savings as USD/BTC).
  const [balanceAdj, setBalanceAdj] = useState<Record<string, number>>({});
  const [balanceAdjInitialized, setBalanceAdjInitialized] = useState(false);
  const [showSplit, setShowSplit] = useState(false);

  // Primary currency for the main Finance card
  const [primaryCurrency, setPrimaryCurrency] = useState<string>('UAH');
  const [primaryCurrencyInitialized, setPrimaryCurrencyInitialized] = useState(false);
  const [showPrimaryPicker, setShowPrimaryPicker] = useState(false);

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

  const loadTxs = useCallback(async () => {
    const data = await loadData<Transaction[]>('transactions', []);
    setTxs(data);
  }, []);

  // Load from storage — useFocusEffect ensures reload after data import or navigation
  const [txsInitialized, setTxsInitialized] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!txsInitialized) {
      loadTxs().then(() => { setTxsInitialized(true); setInitialized(true); });
    } else {
      loadTxs();
    }
  }, [txsInitialized, loadTxs]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTxs();
    setRefreshing(false);
  }, [loadTxs]);

  // Open add-transaction modal when navigated with ?create=1 (e.g. from Today quick actions)
  const { create: createParam } = useLocalSearchParams<{ create?: string }>();
  useEffect(() => {
    if (createParam === '1') {
      setShowAdd(true);
      router.setParams({ create: '' });
    }
  }, [createParam]);

  // Save to storage
  useEffect(() => {
    if (initialized) void saveSynced('transactions', txs);
  }, [txs, initialized]);

  // Undo-тост (таб — над таб-баром)
  const { show: showUndo, element: undoElement } = useUndoToast(true);

  // Load categories
  useEffect(() => {
    loadData<Record<TxType, CategoryDef[]>>('categories', DEFAULT_CATEGORIES).then(data => {
      setCats(data);
      setCatsInitialized(true);
    });
  }, []);

  // Save categories
  useEffect(() => {
    if (catsInitialized) void saveSyncedValue('categories', cats);
  }, [cats, catsInitialized]);

  // Load custom currencies
  useEffect(() => {
    loadData<Currency[]>('finance_currencies', []).then(data => {
      setCustomCurrencies(Array.isArray(data) ? data : []);
      setCurrenciesInitialized(true);
    });
  }, []);

  // Save custom currencies
  useEffect(() => {
    if (currenciesInitialized) void saveSyncedValue('finance_currencies', customCurrencies);
  }, [customCurrencies, currenciesInitialized]);

  // Load / save manual balance adjustments
  useEffect(() => {
    loadData<Record<string, number>>('finance_balance_adjustments', {}).then(data => {
      setBalanceAdj(data && typeof data === 'object' ? data : {});
      setBalanceAdjInitialized(true);
    });
  }, []);
  useEffect(() => {
    if (balanceAdjInitialized) void saveSyncedValue('finance_balance_adjustments', balanceAdj);
  }, [balanceAdj, balanceAdjInitialized]);

  // Load / save primary currency
  useEffect(() => {
    loadData<string>('finance_primary_currency', 'UAH').then(code => {
      setPrimaryCurrency(typeof code === 'string' && code ? code : 'UAH');
      setPrimaryCurrencyInitialized(true);
    });
  }, []);
  useEffect(() => {
    if (primaryCurrencyInitialized) void saveSyncedValue('finance_primary_currency', primaryCurrency);
  }, [primaryCurrency, primaryCurrencyInitialized]);

  const addInlineCurrency = () => {
    const code = inlineCurTicker.trim().toUpperCase();
    if (!code) return;
    if (allCurrencies.some(c => c.code === code)) {
      setTxCur(code);
      setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol('');
      return;
    }
    const symbol = (inlineCurSymbol.trim() || code);
    const newCur: Currency = { code, symbol, kind: 'crypto', decimals: 8 };
    setCustomCurrencies(prev => [...prev, newCur]);
    setTxCur(code);
    setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol('');
  };

  const getCatIcon = (catName: string, type: TxType): IconSymbolName =>
    cats[type].find(c => c.name === catName)?.icon ??
    DEFAULT_CATEGORIES[type].find(c => c.name === catName)?.icon ??
    (type === 'income' ? 'arrow.up.trend' : 'arrow.down.trend');

  const addCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    if (cats[catTab].some(c => c.name === trimmed)) return;
    setCats(prev => ({ ...prev, [catTab]: [...prev[catTab], { name: trimmed, icon: newCatIcon }] }));
    setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); setShowAddCat(false);
  };

  const addInlineCategory = () => {
    const trimmed = inlineCatName.trim();
    if (!trimmed) return;
    if (cats[txType].some(c => c.name === trimmed)) return;
    setCats(prev => ({ ...prev, [txType]: [...prev[txType], { name: trimmed, icon: inlineCatIcon }] }));
    setCategory(trimmed);
    setInlineCatName(''); setInlineCatIcon('ellipsis.circle.fill'); setShowInlineAddCat(false);
  };

  const monthTxs = useMemo(() => filterByMonth(txs, activeMonth), [txs, activeMonth]);
  const totalsByCurrency = useMemo(
    () => calcTotalsByCurrency(txs, activeMonth, balanceAdj),
    [txs, activeMonth, balanceAdj],
  );

  const filtered = useMemo(() => monthTxs.filter(t => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (dateFilter && !isSameDay(new Date(t.date), dateFilter)) return false;
    return true;
  }), [monthTxs, filter, dateFilter]);

  const groups = useMemo(() => groupTransactions(
    filtered,
    now.toDateString(),
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString(),
    locale,
  ), [filtered, locale]);

  const addTx = () => {
    const num = parseFloat(amount.replace(',', '.'));
    if (!num || num <= 0 || !category) return;
    setTxs(p => [{
      id: Date.now().toString(), type: txType, category, amount: num,
      note: note.trim(), date: new Date().toISOString(), currency: txCur,
    }, ...p]);
    setAmount(''); setCategory(''); setNote(''); setShowAdd(false);
    setShowInlineAddCat(false); setInlineCatName(''); setInlineCatIcon('ellipsis.circle.fill');
    setShowInlineAddCur(false); setInlineCurTicker(''); setInlineCurSymbol('');
    haptic.success();
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
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>{tr.finance}</Text>
            <TouchableOpacity
              onPress={() => setCompact(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={compact ? tr.listMode : tr.compactView}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[s.headerBtn, { backgroundColor: compact ? c.accent + '20' : c.dim, borderColor: compact ? c.accent : c.border }]}>
              <IconSymbol name={compact ? 'rectangle.stack.fill' : 'rectangle.stack'} size={17} color={compact ? c.accent : c.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              accessibilityRole="button"
              accessibilityLabel={tr.filtersAndSort}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={[s.headerBtn, { backgroundColor: dateFilter ? c.accent + '20' : c.dim, borderColor: dateFilter ? c.accent : c.border }]}>
              <IconSymbol name="ellipsis" size={17} color={dateFilter ? c.accent : c.sub} />
            </TouchableOpacity>
          </View>
          <MonthPicker
            month={activeMonth}
            onChange={m => { setActiveMonth(m); setDateFilter(null); }}
            months={tr.months}
            monthsShort={tr.monthsShort}
            monthsGenitive={tr.monthsGenitive}
            accentColor={c.accent}
            textColor={c.text}
            subColor={c.sub}
            dimColor={c.dim}
            borderColor={c.border}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          }>

          {/* Skeleton — перший завантаження */}
          {!initialized && (
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

          {/* Balance Cards — one per active currency */}
          <FinanceSummary
            currencies={allCurrencies}
            totalsByCurrency={totalsByCurrency}
            primaryCode={primaryCurrency}
            onPickPrimary={() => setShowPrimaryPicker(true)}
            fmt={fmtCur}
            isDark={isDark}
            c={{ border: c.border, sub: c.sub, green: c.green, red: c.red }}
            incomeLabel={tr.incomes}
            expenseLabel={tr.expenses}
            balanceLabel={tr.balance}
            savingsLabel={tr.savings}
            carryoverLabel={tr.carryover}
            otherCurrenciesLabel={tr.otherCurrencies}
            primaryBadgeLabel={tr.primaryBadge}
            showAllLabel={(n) => tr.showAllCount.replace('{count}', String(n))}
            allCurrenciesLabel={tr.allCurrencies}
            onSelectPrimary={setPrimaryCurrency}
          />

          {/* Filters */}
          <View style={[s.filterRow, { backgroundColor: c.card, borderColor: c.border, marginTop: 16, marginBottom: 22 }]}>
            {(['all', 'income', 'expense'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[s.filterBtn, filter === f && { backgroundColor: f === 'income' ? c.green : f === 'expense' ? c.red : c.accent }]}>
                <Text style={[s.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                  {f === 'all' ? tr.all : f === 'income' ? tr.incomes : tr.expenses}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Empty state with CTA */}
          {groups.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <IconSymbol name="banknote" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.text, fontSize: 16, marginTop: 6, fontWeight: '700' }}>{tr.noTransactions}</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.85 }}>{tr.pressToAdd}</Text>
              <TouchableOpacity
                onPress={() => setShowAdd(true)}
                accessibilityRole="button"
                accessibilityLabel={tr.add}
                style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <IconSymbol name="plus" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{tr.add}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Grouped transactions */}
          {groups.map((group, i) => (
            <Animated.View
              key={group.dateStr}
              entering={motion.entering(FadeInDown.duration(200).delay(Math.min(i, 10) * 40))}
              layout={motion.entering(LinearTransition.springify())}>
              <TransactionGroup
                group={group}
                compact={compact}
                isDark={isDark}
                c={{ sub: c.sub, text: c.text, green: c.green, red: c.red, border: c.border, dim: c.dim }}
                fmt={fmtCur}
                currencyByCode={currencyByCode}
                primaryCode={primaryCurrency}
                getCatIcon={getCatIcon}
                onSelect={setSelected}
                todayLabel={tr.today}
                yesterdayLabel={tr.yesterday}
                incomeLabel={tr.income}
                expenseLabel={tr.expense}
              />
            </Animated.View>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <PressableScale onPress={() => { haptic.medium(); setShowAdd(true); }} scaleTo={0.92} style={[s.fab, { backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </PressableScale>

      {/* Undo-тост */}
      {undoElement}

      {/* ─── Context Menu Modal ─── */}
      <Modal visible={showMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowMenu(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
          onPress={() => setShowMenu(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
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
                onPress={() => { setShowMenu(false); setShowCats(true); }}
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
                <Text style={[s.menuLabel, { color: c.text }]}>Планування бюджету</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Розподіл балансу */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); setShowSplit(true); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#8B5CF625' }]}>
                  <IconSymbol name="arrow.left.arrow.right" size={15} color="#8B5CF6" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.balanceSplit}</Text>
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
                onPress={() => { setShowMenu(false); setShowCal(true); }}
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
          <Pressable style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>

                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowCal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Month nav */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.left" size={20} color={c.sub} />
                  </TouchableOpacity>
                  <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
                    {MONTHS_UA[calMonth]} {calYear}
                  </Text>
                  <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={s.navBtn}>
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
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)}>
        <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* Type toggle */}
                  <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 20 }]}>
                    {(['income', 'expense'] as TxType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { setTxType(t); setCategory(''); setShowInlineAddCat(false); setInlineCatName(''); setInlineCatIcon('ellipsis.circle.fill'); }}
                        style={[s.typeBtn, txType === t && { backgroundColor: t === 'income' ? c.green : c.red }]}>
                        <IconSymbol name={t === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={14} color={txType === t ? '#fff' : c.sub} />
                        <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: txType === t ? '#fff' : c.sub }}>
                          {t === 'income' ? tr.income : tr.expense}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Amount display */}
                  <View style={[s.amountBlock, { backgroundColor: (txType === 'income' ? c.green : c.red) + '12', borderColor: (txType === 'income' ? c.green : c.red) + '30' }]}>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>
                      {tr.amountUAH.replace('₴', curOf(txCur).symbol).replace('UAH', curOf(txCur).code)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: txType === 'income' ? c.green : c.red, fontSize: 28, fontWeight: '300' }}>{curOf(txCur).symbol}</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={amount}
                        onChangeText={(t) => {
                          // Allow only digits and a single separator (. or ,).
                          // Strip anything else silently so paste from clipboard is forgiving.
                          const cleaned = t.replace(/[^0-9.,]/g, '');
                          // collapse multiple separators to the first one
                          const i = cleaned.search(/[.,]/);
                          const next = i < 0 ? cleaned : cleaned.slice(0, i + 1) + cleaned.slice(i + 1).replace(/[.,]/g, '');
                          setAmount(next);
                        }}
                        keyboardType="decimal-pad"
                        style={{ color: txType === 'income' ? c.green : c.red, fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
                      />
                    </View>
                  </View>

                  {/* Currency picker — horizontal scroll keeps it 1 row even with many cryptos */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.currency}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ flexDirection: 'row', gap: 7, paddingRight: 8 }}>
                    {allCurrencies.map(curr => {
                      const isSelected = txCur === curr.code;
                      return (
                        <TouchableOpacity
                          key={curr.code}
                          onPress={() => setTxCur(curr.code)}
                          accessibilityRole="button"
                          accessibilityLabel={curr.code}
                          accessibilityState={{ selected: isSelected }}
                          style={[s.catChip, { backgroundColor: isSelected ? c.accent : c.dim, borderColor: isSelected ? c.accent : c.border }]}>
                          <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '800' }}>{curr.symbol}</Text>
                          <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{curr.code}</Text>
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
                    <View style={[{ borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 }, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <TextInput
                        placeholder={tr.currencyTicker}
                        placeholderTextColor={c.sub}
                        value={inlineCurTicker}
                        onChangeText={t => setInlineCurTicker(t.toUpperCase())}
                        autoCapitalize="characters"
                        maxLength={8}
                        style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 10 }]}
                        autoFocus
                      />
                      <TextInput
                        placeholder={tr.currencySymbol}
                        placeholderTextColor={c.sub}
                        value={inlineCurSymbol}
                        onChangeText={setInlineCurSymbol}
                        maxLength={4}
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

                  {/* Category */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.category}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    {cats[txType].map(cat => {
                      const isSelected = category === cat.name;
                      return (
                        <TouchableOpacity
                          key={cat.name}
                          onPress={() => setCategory(cat.name)}
                          style={[s.catChip, { backgroundColor: isSelected ? c.accent : c.dim, borderColor: isSelected ? c.accent : c.border }]}>
                          <IconSymbol name={cat.icon} size={13} color={isSelected ? '#fff' : c.sub} />
                          <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{cat.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => { setShowInlineAddCat(v => !v); setInlineCatName(''); setInlineCatIcon('ellipsis.circle.fill'); }}
                      style={[s.catChip, { backgroundColor: showInlineAddCat ? c.accent + '20' : c.dim, borderColor: showInlineAddCat ? c.accent : c.border, borderStyle: 'dashed' }]}>
                      <IconSymbol name="plus" size={13} color={showInlineAddCat ? c.accent : c.sub} />
                      <Text style={{ color: showInlineAddCat ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>Нова</Text>
                    </TouchableOpacity>
                  </View>

                  {showInlineAddCat && (
                    <View style={[{ borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 }, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <TextInput
                        placeholder={tr.category}
                        placeholderTextColor={c.sub}
                        value={inlineCatName}
                        onChangeText={setInlineCatName}
                        style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 10 }]}
                        autoFocus
                      />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
                        {ICON_SUGGESTIONS.slice(0, 20).map(icon => {
                          const isSel = inlineCatIcon === icon;
                          return (
                            <TouchableOpacity
                              key={icon}
                              onPress={() => setInlineCatIcon(icon)}
                              style={{ width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
                                backgroundColor: isSel ? c.accent : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                                borderWidth: isSel ? 0 : 1, borderColor: c.border }}>
                              <IconSymbol name={icon} size={16} color={isSel ? '#fff' : c.sub} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 7 }}>
                        <TouchableOpacity
                          onPress={() => { setShowInlineAddCat(false); setInlineCatName(''); setInlineCatIcon('ellipsis.circle.fill'); }}
                          style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                          <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={addInlineCategory}
                          disabled={!inlineCatName.trim()}
                          style={[s.btn, { flex: 2, backgroundColor: !inlineCatName.trim() ? c.dim : c.accent }]}>
                          <IconSymbol name="plus" size={14} color={!inlineCatName.trim() ? c.sub : '#fff'} />
                          <Text style={{ color: !inlineCatName.trim() ? c.sub : '#fff', fontWeight: '700', marginLeft: 5 }}>{tr.add}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Note */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.note}</Text>
                  <TextInput
                    placeholder={tr.notePlaceholder}
                    placeholderTextColor={c.sub}
                    value={note}
                    onChangeText={setNote}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={addTx}
                      disabled={!amount.trim() || !category}
                      style={[s.btn, { flex: 2, backgroundColor: (!amount.trim() || !category) ? c.dim : c.accent }]}>
                      <IconSymbol name={txType === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={15} color={(!amount.trim() || !category) ? c.sub : '#fff'} />
                      <Text style={{ color: (!amount.trim() || !category) ? c.sub : '#fff', fontWeight: '700', marginLeft: 6 }}>{tr.add}</Text>
                    </TouchableOpacity>
                  </View>
          </ScrollView>
        </BlurView>
      </SheetModal>

      {/* ─── Primary Currency Picker ─── */}
      <Modal visible={showPrimaryPicker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowPrimaryPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowPrimaryPicker(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={() => setShowPrimaryPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 6 }}>{tr.primaryCurrency}</Text>
              <Text style={{ color: c.sub, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
                {tr.primaryCurrencyDesc}
              </Text>
              {allCurrencies.map((curr, idx) => {
                const isSelected = primaryCurrency === curr.code;
                return (
                  <TouchableOpacity
                    key={curr.code}
                    onPress={() => { setPrimaryCurrency(curr.code); setShowPrimaryPicker(false); }}
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
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Balance Split Modal ─── */}
      <BalanceSplitModal
        visible={showSplit}
        onClose={() => setShowSplit(false)}
        currencies={allCurrencies}
        totalsByCurrency={totalsByCurrency}
        adjustments={balanceAdj}
        onApply={(next) => { setBalanceAdj(next); setShowSplit(false); }}
        onAddCurrency={(cur) => setCustomCurrencies(prev => prev.some(p => p.code === cur.code) ? prev : [...prev, cur])}
        onRemoveCurrency={(code) => {
          setCustomCurrencies(prev => prev.filter(p => p.code !== code));
          setBalanceAdj(prev => {
            const next = { ...prev }; delete next[code]; return next;
          });
        }}
        c={c}
        isDark={isDark}
        fmtCur={fmtCur}
        tr={tr}
        locale={locale}
        styles={s}
      />

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelected(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              {selected && (() => {
                const isIncome = selected.type === 'income';
                const color = isIncome ? c.green : c.red;
                const iconName: IconSymbolName = getCatIcon(selected.category, selected.type);
                return (
                  <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <View style={s.handleRow}>
                        <View style={{ flex: 1 }} />
                        <View style={[s.handle, { backgroundColor: c.border }]} />
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                          {isIncome ? '+' : '−'}{fmtCur(selected.amount, curOf(txCurrency(selected)))}
                        </Text>
                        <Text style={[s.detailCat, { color: c.text, marginTop: 4 }]}>{selected.category}</Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                          <View style={[s.typePill, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                            <IconSymbol name={isIncome ? 'arrow.up.trend' : 'arrow.down.trend'} size={11} color={color} />
                            <Text style={{ color, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>{isIncome ? tr.income : tr.expense}</Text>
                          </View>
                          <View style={[s.typePill, { backgroundColor: c.dim, borderColor: c.border }]}>
                            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                              {curOf(txCurrency(selected)).code}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginTop: 14 }]}>
                        {selected.note ? <InfoRow icon="doc.text" label={tr.note} value={selected.note} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} /> : null}
                        <InfoRow icon="calendar" label={tr.creationDate} value={new Date(selected.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color={c.sub} text={c.text} sub={c.sub} border={c.border} last />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                        <TouchableOpacity onPress={() => deleteTx(selected.id)} style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                          <IconSymbol name="trash" size={15} color="#EF4444" />
                          <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>{tr.delete}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.close}</Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  </BlurView>
                );
              })()}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Categories Modal ─── */}
      <Modal visible={showCats} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowCats(false); setShowAddCat(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => { setShowCats(false); setShowAddCat(false); }}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                  {/* Handle + close */}
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => { setShowCats(false); setShowAddCat(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', marginBottom: 12 }}>{tr.categories}</Text>

                  {/* Tabs */}
                  <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 12 }]}>
                    {(['expense', 'income'] as TxType[]).map(t => (
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
                      return (
                        <View
                          key={cat.name}
                          style={[
                            { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 },
                            !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                          ]}>
                          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.accent + '18', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                            <IconSymbol name={cat.icon} size={13} color={c.accent} />
                          </View>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{cat.name}</Text>
                          {isDefault
                            ? <View style={{ backgroundColor: c.dim, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>{tr.defaultCategory}</Text>
                              </View>
                            : <TouchableOpacity
                                onPress={() => setCats(prev => ({ ...prev, [catTab]: prev[catTab].filter(cc => cc.name !== cat.name) }))}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <IconSymbol name="trash" size={13} color={c.sub} />
                              </TouchableOpacity>
                          }
                        </View>
                      );
                    })}
                  </View>

                  {/* Add new category */}
                  {showAddCat ? (
                    <View style={[{ borderRadius: 16, borderWidth: 1, padding: 14 }, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <TextInput
                        placeholder={tr.category}
                        placeholderTextColor={c.sub}
                        value={newCatName}
                        onChangeText={setNewCatName}
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
    </View>
  );
}

function BalanceSplitModal({
  visible, onClose, currencies, totalsByCurrency, adjustments, onApply,
  onAddCurrency, onRemoveCurrency,
  c, isDark, fmtCur, tr, locale, styles: s,
}: {
  visible: boolean;
  onClose: () => void;
  currencies: Currency[];
  totalsByCurrency: Record<string, CurrencyTotals>;
  adjustments: Record<string, number>;
  onApply: (next: Record<string, number>) => void;
  onAddCurrency: (cur: Currency) => void;
  onRemoveCurrency: (code: string) => void;
  c: any;
  isDark: boolean;
  fmtCur: (n: number, cur: Currency) => string;
  tr: any;
  locale: string;
  styles: any;
}) {
  // Per-currency string drafts for the inputs. Seeded from currently shown
  // carryover (computed + existing adjustment).
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [showAddCur, setShowAddCur] = useState(false);
  const [newTicker, setNewTicker] = useState('');
  const [newSymbol, setNewSymbol] = useState('');

  useEffect(() => {
    if (!visible) return;
    const next: Record<string, string> = {};
    currencies.forEach(curr => {
      const cur = totalsByCurrency[curr.code];
      const v = cur ? cur.carryover : (adjustments[curr.code] ?? 0);
      next[curr.code] = v === 0 ? '' : String(v);
    });
    setDraft(next);
    setShowAddCur(false); setNewTicker(''); setNewSymbol('');
  }, [visible]);

  const addCurrency = () => {
    const code = newTicker.trim().toUpperCase();
    if (!code) return;
    if (currencies.some(c => c.code === code)) {
      setShowAddCur(false); setNewTicker(''); setNewSymbol('');
      return;
    }
    onAddCurrency({
      code,
      symbol: newSymbol.trim() || code,
      kind: 'crypto',
      decimals: 8,
    });
    setShowAddCur(false); setNewTicker(''); setNewSymbol('');
  };

  const isBuiltin = (code: string) => code === 'UAH' || code === 'USD';

  const apply = () => {
    const next: Record<string, number> = { ...adjustments };
    currencies.forEach(curr => {
      const raw = (draft[curr.code] ?? '').replace(',', '.').trim();
      const desired = raw === '' ? 0 : parseFloat(raw);
      if (Number.isNaN(desired)) return;
      const existing = totalsByCurrency[curr.code];
      const txCarry = (existing?.carryover ?? 0) - (adjustments[curr.code] ?? 0);
      const newAdj = desired - txCarry;
      if (Math.abs(newAdj) < 1e-9) delete next[curr.code];
      else next[curr.code] = newAdj;
    });
    onApply(next);
  };

  const reset = () => {
    onApply({});
  };

  const hasAdjustments = Object.values(adjustments).some(v => Math.abs(v) > 1e-9);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={s.overlay} onPress={onClose}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginBottom: 6 }}>
                  {tr.balanceSplit}
                </Text>
                <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
                  {tr.balanceSplitDesc}
                </Text>

                {currencies.map(curr => {
                  const tot = totalsByCurrency[curr.code];
                  const currentAdj = adjustments[curr.code] ?? 0;
                  const txOnlyCarry = (tot?.carryover ?? 0) - currentAdj;
                  const removable = !isBuiltin(curr.code);
                  return (
                    <View key={curr.code} style={{ marginBottom: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.accent + '20', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <Text style={{ color: c.accent, fontSize: 14, fontWeight: '800' }}>{curr.symbol}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{curr.code}</Text>
                            {curr.kind === 'crypto' && (
                              <View style={{ backgroundColor: c.accent + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                                <Text style={{ color: c.accent, fontSize: 9, fontWeight: '700' }}>{tr.cryptoBadge}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ color: c.sub, fontSize: 11 }}>
                            {tr.fromTransactions}: {fmtCur(txOnlyCarry, curr)}
                          </Text>
                        </View>
                        {removable && (
                          <TouchableOpacity
                            onPress={() => {
                              Alert.alert(
                                (tr.removeCurrencyTitle as string).replace('{code}', curr.code),
                                tr.removeCurrencyMsg,
                                [
                                  { text: tr.cancel, style: 'cancel' },
                                  { text: tr.remove, style: 'destructive', onPress: () => onRemoveCurrency(curr.code) },
                                ],
                              );
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={(tr.removeCurrencyTitle as string).replace('{code}', curr.code)}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                            <IconSymbol name="trash" size={14} color={c.sub} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: c.sub, fontSize: 16, fontWeight: '700', width: 16, textAlign: 'center' }}>{curr.symbol}</Text>
                        <TextInput
                          placeholder="0"
                          placeholderTextColor={c.sub}
                          value={draft[curr.code] ?? ''}
                          onChangeText={(t) => setDraft(prev => ({ ...prev, [curr.code]: t }))}
                          keyboardType="numbers-and-punctuation"
                          style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, flex: 1, marginBottom: 0 }]}
                        />
                      </View>
                    </View>
                  );
                })}

                {/* Inline add crypto */}
                {showAddCur ? (
                  <View style={{ marginBottom: 14, borderRadius: 14, borderWidth: 1, borderColor: c.accent + '60', borderStyle: 'dashed', backgroundColor: c.accent + '08', padding: 12 }}>
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>{tr.newCurrency}</Text>
                    <TextInput
                      placeholder={tr.currencyTicker}
                      placeholderTextColor={c.sub}
                      value={newTicker}
                      onChangeText={t => setNewTicker(t.toUpperCase())}
                      autoCapitalize="characters"
                      maxLength={8}
                      style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 8 }]}
                      autoFocus
                    />
                    <TextInput
                      placeholder={tr.currencySymbol}
                      placeholderTextColor={c.sub}
                      value={newSymbol}
                      onChangeText={setNewSymbol}
                      maxLength={4}
                      style={[s.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', color: c.text, marginBottom: 8 }]}
                    />
                    <View style={{ flexDirection: 'row', gap: 7 }}>
                      <TouchableOpacity
                        onPress={() => { setShowAddCur(false); setNewTicker(''); setNewSymbol(''); }}
                        style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                        <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={addCurrency}
                        disabled={!newTicker.trim()}
                        style={[s.btn, { flex: 2, backgroundColor: !newTicker.trim() ? c.dim : c.accent }]}>
                        <IconSymbol name="plus" size={14} color={!newTicker.trim() ? c.sub : '#fff'} />
                        <Text style={{ color: !newTicker.trim() ? c.sub : '#fff', fontWeight: '700', marginLeft: 5 }}>{tr.add}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowAddCur(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 14, borderRadius: 14, borderWidth: 1, borderColor: c.accent + '40', borderStyle: 'dashed', backgroundColor: c.accent + '10', paddingVertical: 13 }}>
                    <IconSymbol name="plus" size={15} color={c.accent} />
                    <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>{tr.addCrypto}</Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {hasAdjustments && (
                    <TouchableOpacity onPress={reset} style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                      <IconSymbol name="arrow.uturn.backward" size={14} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontWeight: '700', marginLeft: 6 }}>{tr.reset}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={apply} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                    <IconSymbol name="checkmark" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
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
  pageTitle:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dateChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  filterRow:   { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  filterBtn:   { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  groupLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fab:         { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 108 : 88, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.88 },
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
