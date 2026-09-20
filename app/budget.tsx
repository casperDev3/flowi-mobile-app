import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadErrorNotice } from '@/components/finance/LoadErrorNotice';
import { MonthPicker } from '@/components/shared/MonthPicker';
import { isSameMonth as sameMonth } from '@/utils/dateUtils';
import { budgetTxCurrency, formatUncounted, uncountedSpendByCategory } from '@/utils/budgetUtils';
import { expenseCategoryPresets } from '@/utils/financeCategories';
import type { CategoryRow } from '@/store/migrations';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import {
  BUILTIN_CURRENCIES, formatCurrency, type Currency, type Transaction,
} from '@/utils/financeUtils';
import { type Account } from '@/utils/accounts';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';

// ─── Types ────────────────────────────────────────────────────────────────────

// `Transaction` навмисно імпортується з utils/financeUtils, а не описується
// тут: власна копія типу знала лише 'income' | 'expense' і мовчки ховала б
// появу переказів — компілятор не сказав би, що екран їх не розглянув.

interface BudgetLimit {
  /** Дорівнює `category` — синхронізація ідентифікує запис саме за ним. */
  id?: string;
  category: string;
  icon: IconSymbolName;
  limit: number; // monthly limit in UAH
  updatedAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#0EA5E9';
/**
 * A11Y-05. Той самий `#0EA5E9`, узятий КОЛЬОРОМ ТЕКСТУ на світлому тлі
 * екрана, дає 2.51:1 при нормі 4.5:1 — цифра ліміту й підписи чипів
 * практично не читаються при яскравому світлі. Тло, заливки й прогрес
 * лишаються акцентними (там норма інша), а текст і гліфи у світлій темі
 * беруть темніший відтінок: `#0369A1` на `#EFF5FF` = 5.4:1.
 * Правильне місце для такої пари — токени теми, але constants/tokens.ts —
 * чужа зона цього проходу.
 */
const ACCENT_TEXT_LIGHT = '#0369A1';

/**
 * ERR-13. Підтвердження видалення й попередження про дубль були зашиті
 * українською повз i18n: англомовний користувач підтверджував незворотну дію,
 * не прочитавши, що саме підтверджує. Ключів під ці рядки в
 * `store/translations.ts` немає, а сам словник у цьому проході — чужа зона,
 * тож поки що двомовна табличка тут. Перенести в `Translations` — окремо
 * (винесено в needsOtherZone).
 */
const ALERTS = {
  uk: {
    deleteTitle: 'Видалити категорію?',
    deleteMsg: '«{name}» буде видалено з бюджету.',
    exists: 'Категорія вже існує',
    deleteAction: 'Видалити категорію',
  },
  en: {
    deleteTitle: 'Delete category?',
    deleteMsg: '"{name}" will be removed from the budget.',
    exists: 'This category already exists',
    deleteAction: 'Delete category',
  },
} as const;

const ICON_OPTIONS: IconSymbolName[] = [
  'fork.knife', 'car.fill', 'gamecontroller.fill', 'cross.fill', 'house.fill',
  'tag.fill', 'ellipsis.circle.fill', 'cart.fill', 'bag.fill', 'creditcard.fill',
  'banknote', 'person.fill', 'airplane', 'heart.fill', 'star.fill', 'flame.fill',
  'bolt.fill', 'leaf.fill', 'books.vertical.fill', 'graduationcap.fill',
  'phone.fill', 'camera.fill', 'bicycle', 'figure.walk', 'drop.fill',
  'pawprint.fill', 'building.2.fill', 'wrench.fill', 'chart.bar.fill',
];

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
function makeColors(isDark: boolean) {
  return {
    bg1:    isDark ? '#080E18' : '#EFF5FF',
    bg2:    isDark ? '#0F1A2E' : '#E0ECFF',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.80)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#EEF4FF' : '#0A1628',
    sub:    isDark ? 'rgba(220,235,255,0.62)' : 'rgba(10,22,40,0.58)',
    dim:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(8,14,24,0.98)' : 'rgba(239,245,255,0.98)',
    input:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    /** Акцент у ролі тексту/гліфа — див. ACCENT_TEXT_LIGHT (A11Y-05). */
    accentText: isDark ? ACCENT : ACCENT_TEXT_LIGHT,
    green:  '#10B981',
    amber:  '#F59E0B',
    red:    '#EF4444',
  };
}

type BudgetColors = ReturnType<typeof makeColors>;

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const contentWidth = useContentWidth();
  const { isWide } = useResponsive();
  const sheetSurface = useSheetSurface();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();

  const c = useMemo(() => makeColors(isDark), [isDark]);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  // ─── State ────────────────────────────────────────────────────────────────

  const [budgets, setBudgets]         = useState<BudgetLimit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  // Довідник валют: у нової операції валюта береться з її рахунку, а поле
  // currency лишилося тільки в записах, створених до появи рахунків.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState<string>('UAH');
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [activeMonth, setActiveMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Edit modal
  const [editItem, setEditItem]         = useState<BudgetLimit | null>(null);
  const [editLimit, setEditLimit]       = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Add category modal
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newCatName, setNewCatName]       = useState('');
  const [newCatIcon, setNewCatIcon]       = useState<IconSymbolName>('ellipsis.circle.fill');
  const [newCatLimit, setNewCatLimit]     = useState('');
  /** ERR-01: «ліміти не прочитались» — окремий стан, а не порожній бюджет. */
  const [loadFailed, setLoadFailed] = useState(false);

  // ─── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(async (retry = false) => {
    // Аліас із явним типом: union двох generic-функцій втрачає параметр T.
    const read: typeof loadDataResult = retry ? retryStorageRead : loadDataResult;
    const [savedBudgets, txs, primCur, curList, accs, catRows] = await Promise.all([
      read<BudgetLimit[]>('budget_limits', []),
      read<Transaction[]>('transactions', []),
      read<string>('finance_primary_currency', 'UAH'),
      read<Currency[]>('finance_currencies', []),
      read<Account[]>('accounts', []),
      read<CategoryRow[]>('categories', []),
    ]);
      // ERR-01. 'budget_limits' — єдиний ключ, у який цей екран пише. Якщо він
      // не прочитався, показувати пресети з нулями не можна: перша ж правка
      // ліміту записала б цей список поверх справжніх лімітів (а шар сховища
      // такий запис ще й відхилить StorageWriteBlockedError).
      if (!savedBudgets.ok) { setLoadFailed(true); return; }
      setPrimaryCurrency(primCur.ok ? (primCur.value || 'UAH') : 'UAH');
      setCustomCurrencies(curList.ok && Array.isArray(curList.value) ? curList.value : []);
      setAccounts(accs.ok && Array.isArray(accs.value) ? accs.value : []);

      // Форму даних перевіряємо ДО використання, а не сподіваємось на неї.
      // Екран падав саме тут: `budget_limits` чи `transactions` у вигляді
      // обʼєкта (стара форма, недоїхала міграція, підмінений бекап) давали
      // «Invalid attempt to spread non-iterable instance» просто на відкритті,
      // без жодного натяку на причину. Порожній список — поганий стан, але
      // видимий; виняток на монтуванні — це чорний екран.
      const limitRows = Array.isArray(savedBudgets.value)
        ? savedBudgets.value.filter((row): row is BudgetLimit => !!row && typeof row === 'object')
        : [];
      const txRows = txs.ok && Array.isArray(txs.value)
        ? txs.value.filter((row): row is Transaction => !!row && typeof row === 'object')
        : [];

      // Пресети беремо з категорій, під якими операції лежать НАСПРАВДІ, а не
      // зі свого зашитого списку. Бюджет звіряє витрати з лімітами за рядком
      // назви: доки список був зашитий українською, англійський інтерфейс
      // давав сім порожніх українських рядків, а ліміт на «Їжа» не зменшувався
      // ніколи — витрата лежала в «Food».
      const presets = expenseCategoryPresets(catRows.ok && Array.isArray(catRows.value) ? catRows.value : [], lang);
      const merged = [...limitRows];
      for (const def of presets) {
        if (!merged.find(b => b.category === def.name)) {
          merged.push({ category: def.name, icon: def.icon, limit: 0 });
        }
      }
      setBudgets(merged);
      setTransactions(txRows);
      setLoadFailed(false);
  }, [lang]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  /** «Повторити»: без retryStorageRead ключ лишається заблокованим на запис. */
  const retryLoad = useCallback(() => { void load(true); }, [load]);

  const saveBudgets = useCallback((next: BudgetLimit[]) => {
    setBudgets(next);
    // id похідний від назви категорії: два пристрої, що офлайн додали ліміт на
    // ту саму категорію, мусять зійтись в один запис, а не в два.
    // Запис у ключ із проваленим читанням шар сховища відхиляє — без .catch
    // RN лаявся б Possible Unhandled Promise Rejection (ERR-01).
    void saveSynced('budget_limits', next.map(b => ({ ...b, id: b.category })))
      .catch(e => { if (__DEV__) console.warn('[budget] запис лімітів не вдався:', e); });
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
    transactions
      .filter(tx =>
        tx.type === 'expense' &&
        isSameMonth(tx.date, activeMonth) &&
        budgetTxCurrency(tx, accounts, primaryCurrency) === primaryCurrency,
      )
      .forEach(tx => {
        map[tx.category] = (map[tx.category] ?? 0) + tx.amount;
      });
    return map;
  }, [transactions, accounts, activeMonth, primaryCurrency]);

  // Скільки витрат місяця лишилося поза бюджетом через іншу валюту — для
  // підказки під шапкою. Перекази не рахуємо й тут: вони не витрати в жодній
  // валюті, і згадка про них лише збивала б з пантелику.
  const otherCurrencyCount = useMemo(() => {
    return transactions.filter(
      tx =>
        tx.type === 'expense' &&
        isSameMonth(tx.date, activeMonth) &&
        budgetTxCurrency(tx, accounts, primaryCurrency) !== primaryCurrency,
    ).length;
  }, [transactions, accounts, activeMonth, primaryCurrency]);

  /**
   * Витрати категорії в ЧУЖИХ валютах — ті, що в ліміт не потрапили.
   *
   * Показуємо їх під самою категорією, а не лише лічильником у шапці: доти
   * ліміт міг світитися зеленим, коли поруч лежали неврахованих 120 $, і
   * екран про це мовчав саме там, де на нього дивляться.
   */
  const uncountedByCategory = useMemo(
    () => uncountedSpendByCategory(transactions, accounts, activeMonth, primaryCurrency),
    [transactions, accounts, activeMonth, primaryCurrency],
  );

  const symbolFor = useCallback(
    (code: string) =>
      [...BUILTIN_CURRENCIES, ...customCurrencies].find(cur => cur.code === code)?.symbol ?? code,
    [customCurrencies],
  );

  // Merged display list: saved budgets + auto-added from transactions
  const displayBudgets = useMemo(() => {
    const result: BudgetLimit[] = [...budgets];
    // Auto-add categories from transactions that aren't already tracked
    // Категорії беремо з ОБОХ джерел: та, у якій витрачали лише долари, не
    // має зникати зі списку тільки тому, що в основній валюті по ній нуль.
    [...Object.keys(actualByCategory), ...Object.keys(uncountedByCategory)].forEach(cat => {
      if (!cat) return;
      if (!result.find(b => b.category === cat)) {
        result.push({ category: cat, icon: 'ellipsis.circle.fill' as IconSymbolName, limit: 0 });
      }
    });
    // Sort: highest spending first, then alphabetically
    return result.sort((a, b) => {
      const diff = (actualByCategory[b.category] ?? 0) - (actualByCategory[a.category] ?? 0);
      return diff !== 0 ? diff : a.category.localeCompare(b.category, 'uk');
    });
  }, [budgets, actualByCategory, uncountedByCategory]);

  // Total budget and total spent
  const totals = useMemo(() => {
    const totalBudget = budgets.filter(b => b.limit > 0).reduce((s, b) => s + b.limit, 0);
    const totalSpent  = Object.values(actualByCategory).reduce((s, v) => s + v, 0);
    return { totalBudget, totalSpent };
  }, [budgets, actualByCategory]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const openEdit = useCallback((item: BudgetLimit) => {
    setEditItem(item);
    setEditLimit(item.limit > 0 ? String(item.limit) : '');
    setShowEditModal(true);
  }, []);

  function saveEdit() {
    if (!editItem) return;
    const limit = parseFloat(editLimit.replace(',', '.')) || 0;
    const alreadySaved = budgets.find(b => b.category === editItem.category);
    if (alreadySaved) {
      saveBudgets(budgets.map(b => b.category === editItem.category ? { ...b, limit } : b));
    } else {
      saveBudgets([...budgets, { ...editItem, limit }]);
    }
    setShowEditModal(false);
  }

  function deleteCategory(cat: string) {
    const a = ALERTS[lang] ?? ALERTS.uk;
    Alert.alert(a.deleteTitle, a.deleteMsg.replace('{name}', cat), [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => saveBudgets(budgets.filter(b => b.category !== cat)) },
    ]);
  }

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (budgets.find(b => b.category === name)) {
      Alert.alert((ALERTS[lang] ?? ALERTS.uk).exists);
      return;
    }
    const limit = parseFloat(newCatLimit.replace(',', '.')) || 0;
    saveBudgets([...budgets, { category: name, icon: newCatIcon, limit }]);
    setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); setNewCatLimit('');
    setShowAddModal(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={st.header}>
          {/* Екран відкривається зі Stack із headerShown:false, тож іншого
              шляху назад, окрім жесту, тут не було — на відміну від усіх
              сусідніх Stack-екранів фінансів. */}
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tr.back}
            style={[st.headerBtn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[st.title, { color: c.text }]}>Бюджет</Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            accessibilityRole="button"
            accessibilityLabel={tr.add}
            style={[st.headerBtn, { backgroundColor: ACCENT + '20' }]}>
            <IconSymbol name="plus" size={18} color={c.accentText} />
          </TouchableOpacity>
        </View>

        {/* Month picker */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <MonthPicker
            month={activeMonth}
            onChange={setActiveMonth}
            months={tr.months}
            monthsShort={tr.monthsShort}
            monthsGenitive={tr.monthsGenitive}
            accentColor={ACCENT}
            textColor={c.text}
            subColor={c.sub}
            dimColor={c.dim}
            borderColor={c.border}
          />
        </View>

        <ScrollView
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}>

          {/* Info: other-currency transactions excluded */}
          {otherCurrencyCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12,
              backgroundColor: ACCENT + '15', borderRadius: 12, marginBottom: 12,
              borderWidth: 1, borderColor: ACCENT + '30' }}>
              <IconSymbol name="info.circle" size={15} color={c.accentText} />
              <Text style={{ flex: 1, fontSize: 12, color: c.sub, lineHeight: 17 }}>
                {tr.budgetOtherCurrenciesHint.replace('{n}', String(otherCurrencyCount))}
              </Text>
            </View>
          )}

          {/* Total summary card */}
          {totals.totalBudget > 0 && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.summaryCard, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 12, color: c.sub, fontWeight: '600' }}>ВИТРАЧЕНО</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: c.text, marginTop: 2, letterSpacing: -0.5 }}>
                    {fmt(totals.totalSpent)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: c.sub, fontWeight: '600' }}>БЮДЖЕТ</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: c.accentText, marginTop: 2, letterSpacing: -0.5 }}>
                    {fmt(totals.totalBudget)}
                  </Text>
                </View>
              </View>
              <ProgressBar spent={totals.totalSpent} limit={totals.totalBudget} c={c} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: c.sub }}>
                  Залишилось: <Text style={{ fontWeight: '700', color: totals.totalSpent > totals.totalBudget ? c.red : c.green }}>
                    {fmt(Math.max(0, totals.totalBudget - totals.totalSpent))}
                  </Text>
                </Text>
                <Text style={{ fontSize: 12, color: c.sub }}>
                  {totals.totalBudget > 0
                    ? `${Math.round((totals.totalSpent / totals.totalBudget) * 100)}%`
                    : '0%'}
                </Text>
              </View>
            </BlurView>
          )}

          {/* Category rows */}
          {displayBudgets.length > 0 && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}>
              {displayBudgets.map((item, idx) => (
                <BudgetCategoryRow
                  key={item.category}
                  item={item}
                  spent={actualByCategory[item.category] ?? 0}
                  isAutoAdded={!budgets.some(b => b.category === item.category)}
                  uncounted={formatUncounted(uncountedByCategory[item.category], symbolFor, locale)}
                  uncountedLabel={tr.budgetUncounted}
                  divider={idx < displayBudgets.length - 1}
                  c={c}
                  fmt={fmt}
                  onPress={openEdit}
                />
              ))}
            </BlurView>
          )}

          {/* ERR-01: збій читання лімітів — окремий стан із «Повторити». */}
          {loadFailed && (
            <LoadErrorNotice lang={lang} isDark={isDark} text={c.text} sub={c.sub} onRetry={retryLoad} />
          )}

          {/* Empty state */}
          {displayBudgets.length === 0 && !loadFailed && (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[st.emptyIcon, { backgroundColor: ACCENT + '15' }]}>
                <IconSymbol name="chart.pie.fill" size={36} color={c.accentText} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: c.text, marginTop: 16 }}>
                Бюджет не налаштовано
              </Text>
              <Text style={{ fontSize: 14, color: c.sub, marginTop: 6, textAlign: 'center' }}>
                Категорії з&apos;являться автоматично{'\n'}після додавання витрат у Фінансах
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                style={[st.addBtn, { backgroundColor: ACCENT, marginTop: 24 }]}>
                <IconSymbol name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Додати вручну</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tips */}
          {displayBudgets.length > 0 && (
            <Text style={{ fontSize: 12, color: c.sub, textAlign: 'center', marginTop: 16 }}>
              Натисніть на категорію щоб встановити прогноз витрат
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── Edit Limit Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={st.overlay} onPress={() => setShowEditModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[st.sheetWrapper, contentWidth]} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* Handle */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                </View>

                {/* Icon + title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <View style={[st.catIconBox, { backgroundColor: ACCENT + '18', width: 44, height: 44, borderRadius: 13 }]}>
                    {editItem && <IconSymbol name={editItem.icon} size={20} color={c.accentText} />}
                  </View>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{editItem?.category}</Text>
                    <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>Прогноз витрат на місяць</Text>
                  </View>
                </View>

                {/* Actual spent */}
                {editItem && (
                  <View style={[st.spentRow, { backgroundColor: c.dim, borderColor: c.border }]}>
                    <Text style={{ fontSize: 13, color: c.sub }}>Фактично витрачено:</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>
                      {fmt(actualByCategory[editItem.category] ?? 0)}
                    </Text>
                  </View>
                )}

                {/* Limit input */}
                <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontWeight: '500' }}>Заплановано на місяць ({currencySymbol})</Text>
                <TextInput
                  autoFocus
                  placeholder="0"
                  placeholderTextColor={c.sub}
                  value={editLimit}
                  onChangeText={setEditLimit}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={saveEdit}
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />

                {/* Quick presets */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: 16 }}>
                  {[500, 1000, 1500, 2000, 3000, 5000, 10000].map(v => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setEditLimit(String(v))}
                      // Вибраний пресет позначався ЛИШЕ кольором (A11Y-04).
                      accessibilityRole="radio"
                      accessibilityState={{ selected: editLimit === String(v), checked: editLimit === String(v) }}
                      accessibilityLabel={v.toLocaleString(locale)}
                      style={[st.preset, { borderColor: editLimit === String(v) ? ACCENT : c.border,
                        backgroundColor: editLimit === String(v) ? ACCENT + '15' : c.dim }]}>
                      {/* I18N-03: число форматувалось жорстко в 'uk-UA'. */}
                      <Text style={{ fontSize: 13, fontWeight: '600',
                        color: editLimit === String(v) ? c.accentText : c.sub }}>{v.toLocaleString(locale)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Buttons */}
                <TouchableOpacity onPress={saveEdit}
                  style={[st.btn, { backgroundColor: ACCENT }]}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{tr.save}</Text>
                </TouchableOpacity>

                {editItem && !!budgets.find(b => b.category === editItem?.category) && (
                  <TouchableOpacity
                    onPress={() => { setShowEditModal(false); deleteCategory(editItem.category); }}
                    style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.red + '50', marginTop: 8 }]}>
                    <IconSymbol name="trash" size={15} color={c.red} />
                    <Text style={{ color: c.red, fontSize: 15, fontWeight: '600' }}>{(ALERTS[lang] ?? ALERTS.uk).deleteAction}</Text>
                  </TouchableOpacity>
                )}
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Category Modal ── */}
      <Modal visible={showAddModal} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={st.overlay} onPress={() => setShowAddModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[st.sheetWrapper, contentWidth]} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>

                <ScrollView keyboardShouldPersistTaps="handled">
                  {/* Handle */}
                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                  </View>

                  <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 20 }}>
                    Нова категорія бюджету
                  </Text>

                  {/* Name */}
                  <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontWeight: '500' }}>Назва</Text>
                  <TextInput
                    autoFocus
                    placeholder="Назва категорії"
                    placeholderTextColor={c.sub}
                    value={newCatName}
                    onChangeText={setNewCatName}
                    style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                  />

                  {/* Limit */}
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 14, marginBottom: 6, fontWeight: '500' }}>
                    Заплановано на місяць ({currencySymbol})
                  </Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={c.sub}
                    value={newCatLimit}
                    onChangeText={setNewCatLimit}
                    keyboardType="decimal-pad"
                    style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                  />

                  {/* Icon picker */}
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 14, marginBottom: 8, fontWeight: '500' }}>Іконка</Text>
                  {/* На планшеті аркуш ширший, тож іконки не роздуваються до
                      розміру кнопки — у ряд їх стає більше. */}
                  {chunk(ICON_OPTIONS, isWide ? 10 : 7).map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      {row.map(icon => (
                        <TouchableOpacity key={icon} onPress={() => setNewCatIcon(icon)}
                          style={[st.iconOption, {
                            backgroundColor: newCatIcon === icon ? ACCENT + '25' : c.dim,
                            borderColor: newCatIcon === icon ? ACCENT : 'transparent',
                          }]}>
                          <IconSymbol name={icon} size={18} color={newCatIcon === icon ? c.accentText : c.sub} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}

                  <TouchableOpacity onPress={addCategory} disabled={!newCatName.trim()} accessibilityState={{ disabled: !newCatName.trim() }}
                    style={[st.btn, { backgroundColor: newCatName.trim() ? ACCENT : c.dim, marginTop: 8 }]}>
                    <Text style={{ color: newCatName.trim() ? '#fff' : c.sub, fontSize: 15, fontWeight: '700' }}>
                      Додати категорію
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ spent, limit, c }: { spent: number; limit: number; c: BudgetColors }) {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const isOver = limit > 0 && spent > limit;
  const color = isOver ? c.red : pct > 0.8 ? c.amber : ACCENT;
  return (
    <View style={[{ height: 8, borderRadius: 4, overflow: 'hidden' }, { backgroundColor: c.dim }]}>
      <View style={{ height: '100%', width: `${pct * 100}%` as any, borderRadius: 4, backgroundColor: color }} />
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
  item, spent, isAutoAdded, uncounted, uncountedLabel, divider, c, fmt, onPress,
}: {
  item: BudgetLimit;
  spent: number;
  /** Категорія прийшла з транзакцій, а не з налаштованого бюджету. */
  isAutoAdded: boolean;
  /** Витрати в чужих валютах, уже відформатовані: «120 $ · 45 €». */
  uncounted: string;
  uncountedLabel: string;
  divider: boolean;
  c: BudgetColors;
  fmt: (n: number) => string;
  onPress: (item: BudgetLimit) => void;
}) {
  const pct = item.limit > 0 ? Math.min(spent / item.limit, 1) : 0;
  const isOver = item.limit > 0 && spent > item.limit;
  const barColor = isOver ? c.red : pct > 0.8 ? c.amber : ACCENT;
  return (
    <TouchableOpacity onPress={() => onPress(item)} activeOpacity={0.75}>
      <View style={[st.categoryRow,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
        {/* Icon */}
        <View style={[st.catIconBox, { backgroundColor: isAutoAdded ? c.dim : ACCENT + '18' }]}>
          <IconSymbol name={item.icon} size={16} color={isAutoAdded ? c.sub : c.accentText} />
        </View>
        {/* Info */}
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.category}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: isOver ? c.red : c.text }}>
              {fmt(spent)}
              {item.limit > 0 && (
                <Text style={{ color: c.sub, fontWeight: '400' }}> / {fmt(item.limit)}</Text>
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
          {item.limit > 0 ? (
            <View style={[st.progressTrack, { backgroundColor: c.dim }]}>
              <View style={[st.progressFill, { backgroundColor: barColor, width: `${pct * 100}%` as any }]} />
            </View>
          ) : (
            <Text style={{ fontSize: 11, color: c.sub, fontStyle: 'italic' }}>
              Натисніть щоб встановити прогноз
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
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:        { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  headerBtn:    { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryCard:  { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 16, marginBottom: 16 },
  card:         { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  categoryRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  catIconBox:   { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  progressTrack:{ height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  emptyIcon:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { width: '100%', flexShrink: 1 },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, padding: 24, paddingBottom: 36 },
  input:        { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 8 },
  spentRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  preset:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24 },
  iconOption:   { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5, padding: 6 },
});
