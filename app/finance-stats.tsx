import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CategoryRow, categoryRowsToMap } from '@/store/migrations';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { monthGrid } from '@/utils/dateUtils';
import {
  BUILTIN_CURRENCIES, formatCurrency, type Currency, type Transaction,
} from '@/utils/financeUtils';
import { type Account, type AccountKind } from '@/utils/accounts';
import { useResponsive } from '@/hooks/use-responsive';
import { CONTENT_MAX_WIDTH, useContentWidth } from '@/hooks/use-content-width';
import { defaultCategories, type CategoryDef } from '@/utils/financeCategories';

/**
 * Категорію мають лише дохід і витрата, тож розріз «за категоріями» знає саме
 * ці два види. Переказ у цей перелік свідомо не входить: категорії в нього
 * немає, і додати його сюди означало б завести порожній розділ, який завжди
 * показує «нічого».
 *
 * Сам `Transaction` береться з utils/financeUtils — власна копія типу знала б
 * лише 'income' | 'expense', і компілятор не показав би жодного місця, де
 * переказ не розглянуто.
 */
/**
 * I18N-04. Тут лежала ВЛАСНА україномовна копія дефолтних категорій, і саме
 * вона вживалась при читанні: у «Фінансах» категорії англійські, а в
 * «Статистиці» — українські, тобто той самий набір операцій розкладався на два
 * різні списки. Джерело правди одне — `utils/financeCategories`, який знає
 * обидві мови.
 */
type CatType = 'income' | 'expense';

/**
 * Іконка за видом рахунку, а не за полем `icon`: воно довільне й може містити
 * назву символу, якої в збірці немає, — тоді рядок лишився б без картинки.
 */
const ACCOUNT_KIND_ICONS: Record<AccountKind, IconSymbolName> = {
  cash:    'banknote',
  card:    'creditcard.fill',
  savings: 'building.columns.fill',
};

const CAT_COLORS = [
  '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#A855F7', '#64748B',
];

/**
 * I18N-03. Тут лежали три локальні україномовні масиви (короткі місяці,
 * повні місяці, дні тижня) — англійський інтерфейс показував «Січ», «Пн» і
 * «Січень 2026». Ті самі списки вже є у словнику (`tr.monthsShort`,
 * `tr.months`, `tr.weekdays`), тож беруться звідти.
 */
const fmtShort = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}к`;
  return String(Math.round(n));
};

/**
 * Палітра екрана. Винесена з тіла компонента, щоб `useMemo` віддавав той
 * самий об'єкт між рендерами — інакше мемоізовані картки бачать «нові»
 * кольори на кожен рендер і перемальовуються дарма.
 */
function makeColors(isDark: boolean) {
  return {
    bg1:    isDark ? '#080E18' : '#EFF5FF',
    bg2:    isDark ? '#0F1A2E' : '#E0ECFF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(140,180,240,0.35)',
    text:   isDark ? '#F0F5FF' : '#0A1020',
    sub:    isDark ? 'rgba(240,245,255,0.62)' : 'rgba(10,16,32,0.58)',
    green:  '#10B981',
    red:    '#EF4444',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    hole:   isDark ? '#0C1420' : '#E8F0FC',
  };
}

type Period = 'week' | 'month' | '3months' | 'year' | 'all';

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  if (period === 'week')    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  if (period === 'month')   return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === 'year')    return new Date(now.getFullYear(), 0, 1);
  return null;
}

// ─── Pie slice (no SVG) ──────────────────────────────────────────────────────
const PieSlice = React.memo(function PieSlice({ from, sweep, color, size }: { from: number; sweep: number; color: string; size: number }) {
  if (sweep <= 0.5) return null;
  if (sweep > 180) {
    return (
      <>
        <PieSlice from={from} sweep={180} color={color} size={size} />
        <PieSlice from={from + 180} sweep={sweep - 180} color={color} size={size} />
      </>
    );
  }
  const r = size / 2;
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: [{ rotate: `${from - 90}deg` }] }}>
      <View collapsable={false} style={{ position: 'absolute', top: 0, left: r, width: r, height: size, overflow: 'hidden' }}>
        <View style={{
          position: 'absolute', top: 0, left: -r,
          width: size, height: size, borderRadius: r,
          backgroundColor: color,
          transform: [{ rotate: `${sweep - 180}deg` }],
        }} />
      </View>
    </View>
  );
});

const DonutChart = React.memo(function DonutChart({ data, size = 180, holeRatio = 0.56, holeBg }: {
  data: { value: number; color: string }[];
  size?: number; holeRatio?: number; holeBg: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = size / 2;
  let cum = 0;
  const holeSize = size * holeRatio;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: r, backgroundColor: 'rgba(128,128,128,0.1)' }} />
      {data.map((item, i) => {
        const sweep = (item.value / total) * 360;
        const slice = <PieSlice key={i} from={cum} sweep={sweep} color={item.color} size={size} />;
        cum += sweep;
        return slice;
      })}
      <View style={{
        position: 'absolute',
        width: holeSize, height: holeSize, borderRadius: holeSize / 2,
        backgroundColor: holeBg,
        top: (size - holeSize) / 2, left: (size - holeSize) / 2,
      }} />
    </View>
  );
});

// ─── Trend line chart (rotated Views) ────────────────────────────────────────
const SparkLine = React.memo(function SparkLine({ data, color, height = 64, width }: {
  data: number[]; color: string; height: number; width: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 8;

  const pts = data.map((v, i) => ({
    x: i * stepX,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }));

  return (
    <View style={{ width, height, position: 'relative' }}>
      {/* Area fill approximation */}
      {pts.map((pt, i) => (
        <View key={`a${i}`} style={{
          position: 'absolute',
          width: Math.max(2, stepX),
          height: height - pt.y,
          left: pt.x - stepX / 2,
          bottom: 0,
          backgroundColor: color + '14',
        }} />
      ))}
      {/* Line segments */}
      {pts.slice(1).map((pt, i) => {
        const prev = pts[i];
        const dx = pt.x - prev.x;
        const dy = pt.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View key={`l${i}`} style={{
            position: 'absolute',
            width: len, height: 2, borderRadius: 1,
            backgroundColor: color,
            left: (prev.x + pt.x) / 2 - len / 2,
            top:  (prev.y + pt.y) / 2 - 1,
            transform: [{ rotate: `${angle}deg` }],
          }} />
        );
      })}
      {/* Last point dot */}
      <View style={{
        position: 'absolute',
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: color,
        left: pts[pts.length - 1].x - 4,
        top:  pts[pts.length - 1].y - 4,
        shadowColor: color, shadowOpacity: 0.6, shadowRadius: 4,
      }} />
    </View>
  );
});

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function FinanceStatsScreen() {
  const contentWidth = useContentWidth();
  const { width, isWide } = useResponsive();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  // I18N-03: підписи осей і календаря — зі словника, а не з локальних масивів.
  const monthLabelsShort = tr.monthsShort;
  const monthLabelsFull = tr.months;
  const weekdayLabels = tr.weekdays;
  const [txs, setTxs] = useState<Transaction[]>([]);
  // Порожній стан показуємо лише після читання сховища: інакше він блимає
  // на першому кадрі, поки транзакції ще не приїхали.
  const [loaded, setLoaded] = useState(false);
  const defaultCats = useMemo(() => defaultCategories(lang), [lang]);
  /**
   * Зберігаємо СИРІ рядки категорій, а мапу рахуємо похідною: дефолти
   * залежать від мови, і при перемиканні мови список мусить перерахуватись,
   * а не лишитись тим, яким його прочитали на монтуванні (I18N-04).
   */
  const [catRows, setCatRows] = useState<CategoryRow[]>([]);
  const cats = useMemo<Record<CatType, CategoryDef[]>>(
    () => categoryRowsToMap(catRows, defaultCats),
    [catRows, defaultCats],
  );
  // Рахунки потрібні для розрізу витрат по місцях, де лежать гроші, і як
  // довідник валют для їхніх підсумків.
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [primaryCurrency, setPrimaryCurrency] = useState('UAH');
  const [customCurrencies, setCustomCurrencies] = useState<Currency[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [catTab, setCatTab] = useState<CatType>('expense');

  // Custom date range
  const [showCal, setShowCal]       = useState(false);
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd]     = useState<Date | null>(null);
  const [pickStep, setPickStep]     = useState<'start' | 'end'>('start');
  const today = useMemo(() => new Date(), []);
  const [calYear,  setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const hasCustomRange = rangeStart !== null && rangeEnd !== null;

  const openCal = () => {
    setPickStep('start');
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setShowCal(true);
  };

  const clearRange = () => { setRangeStart(null); setRangeEnd(null); setShowCal(false); };

  const handleDayPress = (day: Date) => {
    if (pickStep === 'start') {
      setRangeStart(day);
      setRangeEnd(null);
      setPickStep('end');
    } else {
      if (day < rangeStart!) {
        setRangeStart(day);
        setRangeEnd(rangeStart);
      } else {
        setRangeEnd(day);
      }
      setShowCal(false);
    }
  };

  const calWeeks = useMemo(() => monthGrid(calYear, calMonth), [calYear, calMonth]);

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    txs.forEach(t => {
      const d = new Date(t.date);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [txs]);

  useEffect(() => {
    Promise.all([
      loadData<Transaction[]>('transactions', []),
      loadData<CategoryRow[]>('categories', []),
      loadData<string>('finance_primary_currency', 'UAH'),
      loadData<Currency[]>('finance_currencies', []),
      loadData<Account[]>('accounts', []),
    ]).then(([loadedTxs, rows, primCur, curList, accs]) => {
      setTxs(loadedTxs);
      setCatRows(Array.isArray(rows) ? rows : []);
      setPrimaryCurrency(primCur || 'UAH');
      setCustomCurrencies(Array.isArray(curList) ? curList : []);
      setAccounts(Array.isArray(accs) ? accs : []);
      setLoaded(true);
    });
  }, []);

  const getCatIcon = useCallback(
    (name: string, type: CatType): IconSymbolName =>
      cats[type].find(cat => cat.name === name)?.icon ??
      defaultCats[type].find(cat => cat.name === name)?.icon ??
      'ellipsis.circle.fill',
    [cats, defaultCats],
  );

  const c = useMemo(() => makeColors(isDark), [isDark]);

  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  // Статистика показує ті самі суми, що й «Фінанси», тож і валюта та сама —
  // вшитий ₴ брехав би всім, хто веде облік у іншій валюті.
  const currency = useMemo<Currency>(
    () => [...BUILTIN_CURRENCIES, ...customCurrencies].find(cur => cur.code === primaryCurrency)
      ?? BUILTIN_CURRENCIES[0],
    [customCurrencies, primaryCurrency],
  );
  const fmt = useCallback((n: number) => formatCurrency(n, currency, locale), [currency, locale]);

  /**
   * Форматування у валюті конкретного рахунку — для розрізу по рахунках, де
   * гривневий гаманець і доларова картка стоять поруч. Зводити їх в одну суму
   * ця фаза не вміє, тож кожен рядок підписаний власною валютою.
   */
  const fmtIn = useCallback(
    (n: number, code: string) => formatCurrency(
      n,
      [...BUILTIN_CURRENCIES, ...customCurrencies].find(cur => cur.code === code) ?? currency,
      locale,
    ),
    [customCurrencies, currency, locale],
  );

  const periodStart = useMemo(() => getPeriodStart(period), [period]);
  const periodTxs   = useMemo(() => {
    if (hasCustomRange) {
      const end = new Date(rangeEnd!); end.setHours(23, 59, 59, 999);
      return txs.filter(t => { const d = new Date(t.date); return d >= rangeStart! && d <= end; });
    }
    return periodStart ? txs.filter(t => new Date(t.date) >= periodStart!) : txs;
  }, [txs, periodStart, hasCustomRange, rangeStart, rangeEnd]);

  /**
   * Оборот періоду — усе, крім переказів.
   *
   * Переказ між своїми рахунками не заробили й не витратили: він лише міняє
   * місце, де лежать гроші. Раніше його доводилося писати парою «витрата +
   * дохід», і місяць, у якому користувач просто зняв гроші з картки, показував
   * зайвий дохід і зайву витрату на ту саму суму — обидва графіки, донат і
   * тренд балансу брехали на подвійну суму переказу.
   *
   * Усі підсумки нижче рахуються саме з цього списку, а `periodTxs` лишається
   * повним — календар діапазону мусить позначати дні переказів теж.
   */
  const periodFlow = useMemo(() => periodTxs.filter(t => t.type !== 'transfer'), [periodTxs]);
  /** Ті самі транзакції за весь час — для помісячних стовпчиків. */
  const flowTxs = useMemo(() => txs.filter(t => t.type !== 'transfer'), [txs]);
  const transferCount = periodTxs.length - periodFlow.length;

  const income  = periodFlow.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
  const expense = periodFlow.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;

  // ── Adaptive bar chart data ──────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (period === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayKey = d.toDateString();
        const f = periodFlow.filter(t => new Date(t.date).toDateString() === dayKey);
        const dow = d.getDay();
        return {
          label: weekdayLabels[dow === 0 ? 6 : dow - 1],
          income:  f.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0),
          expense: f.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        };
      });
    }
    const count = period === '3months' ? 3 : period === 'month' ? 4 : 12;
    const now = new Date();
    return Array.from({ length: count }, (_, i) => {
      const offset = count - 1 - i;
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const f = flowTxs.filter(t => {
        const td = new Date(t.date);
        return `${td.getFullYear()}-${td.getMonth()}` === key;
      });
      return {
        label: monthLabelsShort[d.getMonth()],
        income:  f.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0),
        expense: f.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [flowTxs, periodFlow, period, monthLabelsShort, weekdayLabels]);

  const maxBar = Math.max(...chartData.map(m => Math.max(m.income, m.expense)), 1);

  // ── Cumulative balance trend ─────────────────────────────────────────────
  const trendData = useMemo(() => {
    if (periodFlow.length < 2) return [];
    const sorted = [...periodFlow].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = 0;
    const pts: number[] = [];
    // Гілка «інакше мінус» була найнебезпечнішим місцем екрана: переказ під неї
    // потрапляв як витрата, і лінія балансу провалювалася на кожному
    // перекладанні грошей між власними рахунками. Тепер переказів у списку
    // немає взагалі, тож ділення на дохід/витрату однозначне.
    sorted.forEach(t => {
      running += t.type === 'income' ? t.amount : -t.amount;
      pts.push(running);
    });
    if (pts.length <= 40) return pts;
    const step = Math.floor(pts.length / 40);
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  }, [periodFlow]);

  // ── Category stats ───────────────────────────────────────────────────────
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    // `catTab` — лише 'income' | 'expense', тож переказ сюди не потрапляє й не
    // заводить категорію-привид із порожньою назвою.
    periodFlow.filter(t => t.type === catTab).forEach(t => {
      map[t.category] = (map[t.category] ?? 0) + t.amount;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .map(([cat, amt], i) => ({ cat, amt, pct: total > 0 ? (amt / total) * 100 : 0, color: CAT_COLORS[i % CAT_COLORS.length] }))
      .sort((a, b) => b.amt - a.amt);
  }, [periodFlow, catTab]);

  // ── Day-of-week expense stats ────────────────────────────────────────────
  const weekdayStats = useMemo(() => {
    const sums   = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    periodFlow.filter(t => t.type === 'expense').forEach(t => {
      const dow = new Date(t.date).getDay();
      const idx = dow === 0 ? 6 : dow - 1;
      sums[idx]   += t.amount;
      counts[idx] += 1;
    });
    const maxSum = Math.max(...sums, 1);
    return weekdayLabels.map((label, i) => ({
      label,
      total: sums[i],
      count: counts[i],
      pct:   sums[i] / maxSum,
    }));
  }, [periodFlow, weekdayLabels]);

  // ── Quick stats ──────────────────────────────────────────────────────────
  // Лічильник показує операції обороту: він стоїть поруч із «сер/день», і
  // рахувати в ньому перекази означало б ділити витрати на завелике число
  // операцій у голові користувача.
  const txCount      = periodFlow.length;
  const expenseTxs   = periodFlow.filter(t => t.type === 'expense');
  const largestTx    = expenseTxs.reduce<Transaction | null>((max, t) => !max || t.amount > max.amount ? t : max, null);
  const periodDays   = hasCustomRange
    ? Math.max(1, Math.ceil((rangeEnd!.getTime() - rangeStart!.getTime()) / 86400000) + 1)
    : periodStart ? Math.max(1, Math.ceil((Date.now() - periodStart.getTime()) / 86400000)) : 30;
  const avgDailyExp  = expense / periodDays;

  /**
   * Витрати періоду в розрізі рахунків — звідки саме пішли гроші.
   *
   * Показуємо лише коли рахунків більше одного: з єдиним гаманцем цей розділ
   * просто вдруге повторив би загальну суму витрат.
   *
   * Архівні рахунки не відсіюємо: якщо витрата в періоді була, приховати рядок
   * означало б втратити частину суми без пояснення.
   */
  const accountStats = useMemo(() => {
    if (accounts.length < 2) return [];
    const spent: Record<string, number> = {};
    for (const t of periodFlow) {
      if (t.type !== 'expense') continue;
      spent[t.accountId] = (spent[t.accountId] ?? 0) + t.amount;
    }
    const rows = accounts
      .map(a => ({ account: a, spent: spent[a.id] ?? 0 }))
      .filter(r => r.spent > 0)
      .sort((a, b) => b.spent - a.spent);
    const max = rows.reduce((m, r) => Math.max(m, r.spent), 0);
    return rows.map(r => ({ ...r, pct: max > 0 ? r.spent / max : 0 }));
  }, [accounts, periodFlow]);

  const balanceDonutData = useMemo(
    () => (income + expense > 0
      ? [{ value: income, color: c.green }, { value: expense, color: c.red }]
      : []),
    [income, expense, c.green, c.red],
  );

  const categoryDonutData = useMemo(
    () => categoryStats.map(item => ({ value: item.amt, color: item.color })),
    [categoryStats],
  );

  const trendColor = balance >= 0 ? c.green : c.red;
  // Графік живе всередині колонки, обмеженої CONTENT_MAX_WIDTH: на планшеті
  // ширина вікна значно більша, і без стелі лінія вилазила б за картку.
  // 76 = поля прокрутки (20+20) + внутрішні поля картки (18+18).
  const SPARK_W = Math.min(width, CONTENT_MAX_WIDTH) - 76;

  const summaryCards = [
    { label: 'Доходи',       value: fmt(income),      color: c.green },
    { label: 'Витрати',      value: fmt(expense),     color: c.red },
    { label: 'Баланс',       value: fmt(balance),     color: balance >= 0 ? c.green : c.red },
    { label: 'Заощадження',  value: `${savingsPct}%`, color: c.accent },
  ];
  // На широкому екрані всі чотири підсумки вміщаються в один ряд.
  const summaryRows = isWide
    ? [summaryCards]
    : [summaryCards.slice(0, 2), summaryCards.slice(2)];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tr.back}
            style={[s.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text }]}>Статистика</Text>
          <TouchableOpacity
            onPress={openCal}
            accessibilityRole="button"
            accessibilityLabel={tr.calendar}
            style={[s.backBtn, {
              backgroundColor: hasCustomRange ? c.accent + '22' : c.dim,
              borderColor:     hasCustomRange ? c.accent        : c.border,
            }]}>
            <IconSymbol name="calendar" size={17} color={hasCustomRange ? c.accent : c.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }]}
          showsVerticalScrollIndicator={false}>

          {/* ── Custom range chip ── */}
          {hasCustomRange && (
            <TouchableOpacity
              onPress={clearRange}
              style={[s.rangeChip, { backgroundColor: c.accent + '18', borderColor: c.accent + '50' }]}>
              <IconSymbol name="calendar" size={12} color={c.accent} />
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700', marginHorizontal: 6 }}>
                {rangeStart!.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                {' — '}
                {rangeEnd!.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <IconSymbol name="xmark" size={11} color={c.accent} />
            </TouchableOpacity>
          )}

          {loaded && txs.length === 0 ? (
            /* Порожня статистика — глухий кут: графіки нулів не пояснюють,
               що робити далі, тому веде одразу до створення транзакції. */
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[s.emptyIcon, { backgroundColor: c.accent + '15' }]}>
                <IconSymbol name="chart.bar.fill" size={34} color={c.accent} />
              </View>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', marginTop: 16 }}>
                {tr.noTransactions}
              </Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/explore', params: { create: '1' } })}
                style={[s.emptyBtn, { backgroundColor: c.accent }]}>
                <IconSymbol name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 8 }}>{tr.add}</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <>

          {/* ── Period selector (hidden when custom range active) ── */}
          {!hasCustomRange && (
          <View style={[s.segRow, { backgroundColor: c.card, borderColor: c.border, marginBottom: 18 }]}>
            {([
              { key: 'week',    label: 'Тиждень' },
              { key: 'month',   label: 'Місяць'  },
              { key: '3months', label: '3 Міс'   },
              { key: 'year',    label: 'Рік'     },
              { key: 'all',     label: 'Все'     },
            ] as { key: Period; label: string }[]).map(p => (
              <TouchableOpacity
                key={p.key}
                onPress={() => setPeriod(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: period === p.key }}
                accessibilityLabel={p.label}
                style={[s.segBtn, period === p.key && { backgroundColor: c.accent }]}>
                <Text style={[s.segLabel, { color: period === p.key ? '#fff' : c.sub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          )}

          {/* ── Summary row ── */}
          {summaryRows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: 8, marginBottom: ri === summaryRows.length - 1 ? 18 : 8 }}>
              {row.map(card => (
                <SummCard key={card.label} label={card.label} value={card.value} color={card.color} border={c.border} isDark={isDark} />
              ))}
            </View>
          ))}

          {/* ── Перекази в підсумки не входять ── */}
          {transferCount > 0 && (
            <View style={[s.hintRow, { backgroundColor: c.accent + '15', borderColor: c.accent + '30' }]}>
              <IconSymbol name="arrow.left.arrow.right" size={14} color={c.accent} />
              <Text style={{ flex: 1, color: c.sub, fontSize: 12, lineHeight: 17, marginLeft: 8 }}>
                {tr.transfersNotCounted} ({transferCount})
              </Text>
            </View>
          )}

          {/* ── Balance trend ── */}
          {trendData.length >= 2 && (
            <>
              <SectionTitle text="Тренд балансу" sub={c.sub} />
              <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <View>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 2 }}>Поточний баланс</Text>
                    <Text style={{ color: trendColor, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{fmt(balance)}</Text>
                  </View>
                  <View style={[s.trendBadge, { backgroundColor: trendColor + '18', borderColor: trendColor + '30' }]}>
                    <IconSymbol name={balance >= 0 ? 'arrow.up.trend' : 'arrow.down.trend'} size={12} color={trendColor} />
                    <Text style={{ color: trendColor, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                      {balance >= 0 ? '+' : ''}{savingsPct}%
                    </Text>
                  </View>
                </View>
                <SparkLine data={trendData} color={trendColor} height={70} width={SPARK_W} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={{ color: c.sub, fontSize: 10 }}>Початок</Text>
                  <Text style={{ color: c.sub, fontSize: 10 }}>Зараз</Text>
                </View>
              </BlurView>
            </>
          )}

          {/* ── Adaptive bar chart ── */}
          <SectionTitle
            text={period === 'week' ? 'По днях (тиждень)' : period === '3months' ? 'По місяцях (3 міс)' : period === 'year' ? 'По місяцях (рік)' : period === 'all' ? 'По місяцях' : 'Поточний місяць'}
            sub={c.sub}
          />
          <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
            {flowTxs.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>Немає даних</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 120, gap: 4, marginBottom: 6 }}>
                  {chartData.map((m, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 120 }}>
                      {/* Amount label for tallest bar */}
                      {(m.income > 0 || m.expense > 0) && (
                        <Text style={{ color: c.sub, fontSize: 8, fontWeight: '600', marginBottom: 2 }} numberOfLines={1}>
                          {fmtShort(Math.max(m.income, m.expense))}
                        </Text>
                      )}
                      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, flex: 1 }}>
                        {m.income > 0
                          ? <View style={{ flex: 1, height: Math.max(4, (m.income / maxBar) * 90), backgroundColor: c.green, borderRadius: 5, opacity: 0.9 }} />
                          : <View style={{ flex: 1 }} />
                        }
                        {m.expense > 0
                          ? <View style={{ flex: 1, height: Math.max(4, (m.expense / maxBar) * 90), backgroundColor: c.red, borderRadius: 5, opacity: 0.9 }} />
                          : <View style={{ flex: 1 }} />
                        }
                      </View>
                      <Text style={{ color: c.sub, fontSize: 9, fontWeight: '600', marginTop: 5 }}>{m.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.legendRow}>
                  <LegendDot color={c.green} label="Доходи"  sub={c.sub} />
                  <LegendDot color={c.red}   label="Витрати" sub={c.sub} />
                </View>
              </>
            )}
          </BlurView>

          {/* ── Income vs Expense donut ── */}
          {balanceDonutData.length > 0 && (
            <>
              <SectionTitle text="Доходи / Витрати" sub={c.sub} />
              <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                  {/* Donut */}
                  <View style={{ position: 'relative' }}>
                    <DonutChart data={balanceDonutData} size={130} holeRatio={0.58} holeBg={c.hole} />
                    <View style={{
                      position: 'absolute',
                      top: (130 - 130 * 0.58) / 2, left: (130 - 130 * 0.58) / 2,
                      width: 130 * 0.58, height: 130 * 0.58,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: c.sub, fontSize: 9, fontWeight: '600' }}>збереж.</Text>
                      <Text style={{ color: c.green, fontSize: 20, fontWeight: '800' }}>{savingsPct}%</Text>
                    </View>
                  </View>
                  {/* Stats */}
                  <View style={{ flex: 1, gap: 10 }}>
                    {[
                      { label: 'Доходи',  value: income,  color: c.green },
                      { label: 'Витрати', value: expense, color: c.red   },
                      { label: 'Баланс',  value: balance, color: balance >= 0 ? c.green : c.red },
                    ].map(item => (
                      <View key={item.label}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: item.color }} />
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', flex: 1 }}>{item.label}</Text>
                          <Text style={{ color: item.color, fontSize: 12, fontWeight: '800' }}>{fmt(item.value)}</Text>
                        </View>
                        <View style={{ height: 3, backgroundColor: c.dim, borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{ height: '100%', borderRadius: 2, backgroundColor: item.color, width: income + expense > 0 ? `${(item.value / (income + expense)) * 100}%` : '0%' }} />
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </BlurView>
            </>
          )}

          {/* ── Quick stats ── */}
          <SectionTitle text="Швидка статистика" sub={c.sub} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <QuickStat icon="list.bullet.circle.fill" label="Транзакцій" value={String(txCount)} color={c.accent} border={c.border} isDark={isDark} />
            <QuickStat icon="calendar" label="Сер/день" value={avgDailyExp > 0 ? fmt(avgDailyExp) : '—'} color={c.red} border={c.border} isDark={isDark} />
          </View>
          {largestTx && (
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.red + '20', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name={getCatIcon(largestTx.category, 'expense')} size={18} color={c.red} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginBottom: 2 }}>Найбільша витрата</Text>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{largestTx.category}</Text>
                {largestTx.note ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{largestTx.note}</Text> : null}
              </View>
              <Text style={{ color: c.red, fontSize: 16, fontWeight: '800' }}>−{fmt(largestTx.amount)}</Text>
            </BlurView>
          )}

          {/* ── Витрати в розрізі рахунків ── */}
          {accountStats.length > 0 && (
            <>
              <SectionTitle text={tr.accounts} sub={c.sub} />
              <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                  {tr.expenses}
                </Text>
                {accountStats.map((row, i) => (
                  <View key={row.account.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, i > 0 && { marginTop: 12 }]}>
                    <View style={[s.catIcon, { backgroundColor: c.accent + '20' }]}>
                      <IconSymbol name={ACCOUNT_KIND_ICONS[row.account.kind]} size={15} color={c.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                          {row.account.name}
                        </Text>
                        <Text style={{ color: c.red, fontSize: 13, fontWeight: '800' }}>
                          {fmtIn(row.spent, row.account.currency)}
                        </Text>
                      </View>
                      <View style={{ height: 4, backgroundColor: c.dim, borderRadius: 2, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${row.pct * 100}%`, backgroundColor: c.accent, borderRadius: 2 }} />
                      </View>
                    </View>
                  </View>
                ))}
              </BlurView>
            </>
          )}

          {/* ── Day-of-week spending ── */}
          {expenseTxs.length > 0 && (
            <>
              <SectionTitle text="Витрати по днях тижня" sub={c.sub} />
              <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
                {weekdayStats.map((day, i) => (
                  <View key={i} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, i > 0 && { marginTop: 10 }]}>
                    <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', width: 26 }}>{day.label}</Text>
                    <View style={{ flex: 1, height: 6, backgroundColor: c.dim, borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${day.pct * 100}%`, backgroundColor: day.pct > 0.75 ? c.red : day.pct > 0.4 ? c.accent : c.green, borderRadius: 3 }} />
                    </View>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', width: 56, textAlign: 'right' }}>
                      {day.total > 0 ? fmt(day.total) : '—'}
                    </Text>
                  </View>
                ))}
              </BlurView>
            </>
          )}

          {/* ── Category breakdown ── */}
          <SectionTitle text="За категоріями" sub={c.sub} />
          <View style={[s.segRow, { backgroundColor: c.card, borderColor: c.border, marginBottom: 14 }]}>
            {(['expense', 'income'] as CatType[]).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setCatTab(t)}
                accessibilityRole="tab"
                accessibilityState={{ selected: catTab === t }}
                accessibilityLabel={t === 'expense' ? tr.expenses : tr.incomes}
                style={[s.segBtn, catTab === t && { backgroundColor: t === 'expense' ? c.red : c.green }]}>
                <Text style={[s.segLabel, { color: catTab === t ? '#fff' : c.sub }]}>
                  {t === 'expense' ? 'Витрати' : 'Доходи'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {categoryStats.length === 0 ? (
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                {catTab === 'expense' ? 'Витрат немає' : 'Доходів немає'}
              </Text>
            </BlurView>
          ) : (
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 18 }]}>
              {/* Donut + legend side by side */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                <DonutChart
                  data={categoryDonutData}
                  size={130}
                  holeRatio={0.52}
                  holeBg={c.hole}
                />
                <View style={{ flex: 1, gap: 6 }}>
                  {categoryStats.slice(0, 5).map(item => (
                    <View key={item.cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.color, flexShrink: 0 }} />
                      <Text style={{ color: c.sub, fontSize: 11, flex: 1 }} numberOfLines={1}>{item.cat}</Text>
                      <Text style={{ color: item.color, fontSize: 11, fontWeight: '700' }}>{item.pct.toFixed(0)}%</Text>
                    </View>
                  ))}
                  {categoryStats.length > 5 && (
                    <Text style={{ color: c.sub, fontSize: 10, marginTop: 2 }}>+{categoryStats.length - 5} інших</Text>
                  )}
                </View>
              </View>

              {/* Stacked proportional bar */}
              <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 16, gap: 1 }}>
                {categoryStats.map(item => (
                  <View key={item.cat} style={{ flex: item.pct, backgroundColor: item.color, minWidth: item.pct > 2 ? 2 : 0 }} />
                ))}
              </View>

              {/* Full category list */}
              {categoryStats.map((item, idx) => {
                const icon = getCatIcon(item.cat, catTab);
                return (
                  <View key={item.cat}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[s.catIcon, { backgroundColor: item.color + '20' }]}>
                        <IconSymbol name={icon} size={15} color={item.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{item.cat}</Text>
                          <Text style={{ color: item.color, fontSize: 13, fontWeight: '800' }}>{fmt(item.amt)}</Text>
                        </View>
                        <View style={{ height: 4, backgroundColor: c.dim, borderRadius: 2, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${item.pct}%`, backgroundColor: item.color, borderRadius: 2 }} />
                        </View>
                      </View>
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', width: 36, textAlign: 'right' }}>
                        {item.pct.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                );
              })}
            </BlurView>
          )}

          </>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* ─── Calendar Range Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <Pressable accessible={false} style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' }} onPress={() => setShowCal(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            accessible={false}
            accessibilityViewIsModal
            importantForAccessibility="yes"
            style={[{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 }, contentWidth]}>
            <BlurView intensity={isDark ? 55 : 72} tint={isDark ? 'dark' : 'light'} style={[s.calSheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(10,16,30,0.97)' : 'rgba(245,248,255,0.97)' }]}>

              {/* Handle + close */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flex: 1 }} />
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center' }} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    onPress={() => setShowCal(false)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.close}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={16} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Step indicator */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                {(['start', 'end'] as const).map(step => {
                  const isActive = pickStep === step;
                  const isDone   = step === 'start' ? rangeStart !== null : rangeEnd !== null;
                  const label    = step === 'start' ? 'Початок' : 'Кінець';
                  const dateVal  = step === 'start' ? rangeStart : rangeEnd;
                  return (
                    <TouchableOpacity
                      key={step}
                      onPress={() => { if (step === 'end' && !rangeStart) return; setPickStep(step); }}
                      style={[s.stepPill, {
                        backgroundColor: isActive ? c.accent + '22' : isDone ? c.green + '14' : c.dim,
                        borderColor:     isActive ? c.accent        : isDone ? c.green + '60' : c.border,
                        flex: 1,
                      }]}>
                      <IconSymbol
                        name={isActive ? 'calendar' : isDone ? 'checkmark.circle.fill' : 'circle'}
                        size={13}
                        color={isActive ? c.accent : isDone ? c.green : c.sub}
                      />
                      <View style={{ marginLeft: 7 }}>
                        <Text style={{ color: isActive ? c.accent : isDone ? c.green : c.sub, fontSize: 10, fontWeight: '600' }}>{label}</Text>
                        <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>
                          {dateVal ? dateVal.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Month navigation */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                {/* Ім'я кнопки — місяць, куди вона веде: ключів «попередній/
                    наступний місяць» у словнику немає, а SF Symbol iOS озвучує
                    англійським «Back»/«Forward» (A11Y-01, NAT-28). */}
                <TouchableOpacity
                  onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                  accessibilityRole="button"
                  accessibilityLabel={monthLabelsFull[(calMonth + 11) % 12]}
                  style={s.navBtn}>
                  <IconSymbol name="chevron.left" size={19} color={c.sub} />
                </TouchableOpacity>
                <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 15, fontWeight: '700' }}>
                  {monthLabelsFull[calMonth]} {calYear}
                </Text>
                <TouchableOpacity
                  onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                  accessibilityRole="button"
                  accessibilityLabel={monthLabelsFull[(calMonth + 1) % 12]}
                  style={s.navBtn}>
                  <IconSymbol name="chevron.right" size={19} color={c.sub} />
                </TouchableOpacity>
              </View>

              {/* Weekday headers */}
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                {weekdayLabels.map(d => (
                  <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                ))}
              </View>

              {/* Calendar days */}
              {calWeeks.map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'row', marginBottom: 3 }}>
                  {week.map((day, di) => {
                    if (!day) return <View key={di} style={{ flex: 1 }} />;
                    const date       = new Date(calYear, calMonth, day);
                    const dateStr    = date.toDateString();
                    const isStart    = rangeStart?.toDateString() === dateStr;
                    const isEnd      = rangeEnd?.toDateString() === dateStr;
                    const isInRange  = rangeStart && rangeEnd && date > rangeStart && date < rangeEnd;
                    const isToday    = date.toDateString() === today.toDateString();
                    const hasTx      = markedDays.has(`${calYear}-${calMonth}-${day}`);
                    const isFuture   = date > today;
                    return (
                      <TouchableOpacity
                        key={di}
                        onPress={() => !isFuture && handleDayPress(date)}
                        accessibilityRole="button"
                        accessibilityLabel={[
                          date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }),
                          isToday ? tr.today : null,
                        ].filter(Boolean).join(', ')}
                        accessibilityState={{ selected: !!(isStart || isEnd), disabled: isFuture }}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}
                        activeOpacity={isFuture ? 1 : 0.7}>
                        <View style={[
                          s.dayCell,
                          isStart && { backgroundColor: c.accent, borderRadius: 10 },
                          isEnd   && { backgroundColor: c.accent, borderRadius: 10 },
                          isInRange && { backgroundColor: c.accent + '22', borderRadius: 4 },
                          !isStart && !isEnd && isToday && { borderWidth: 1.5, borderColor: c.accent },
                        ]}>
                          <Text style={{
                            fontSize: 13,
                            fontWeight: isStart || isEnd || isToday ? '700' : '400',
                            color: isStart || isEnd ? '#fff' : isToday ? c.accent : isFuture ? c.sub + '60' : c.text,
                            opacity: isFuture ? 0.35 : 1,
                          }}>{day}</Text>
                        </View>
                        {hasTx && !isStart && !isEnd && (
                          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 2 }} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                {hasCustomRange && (
                  <TouchableOpacity onPress={clearRange} style={[s.calBtn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, flex: 1 }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontWeight: '600', marginLeft: 5 }}>Скинути</Text>
                  </TouchableOpacity>
                )}
                {pickStep === 'end' && rangeStart && (
                  <View style={[s.calBtn, { backgroundColor: c.accent + '15', borderWidth: 1, borderColor: c.accent + '40', flex: 2 }]}>
                    <IconSymbol name="calendar" size={13} color={c.accent} />
                    <Text style={{ color: c.accent, fontWeight: '700', marginLeft: 6 }}>Оберіть кінець діапазону</Text>
                  </View>
                )}
              </View>

            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Helper components ───────────────────────────────────────────────────────
const SectionTitle = React.memo(function SectionTitle({ text, sub }: { text: string; sub: string }) {
  return <Text style={[s.sectionTitle, { color: sub }]}>{text}</Text>;
});

const SummCard = React.memo(function SummCard({ label, value, color, border, isDark }: { label: string; value: string; color: string; border: string; isDark: boolean }) {
  return (
    <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.summCard, { borderColor: border, flex: 1 }]}>
      <Text style={{ color, fontSize: 10, fontWeight: '600', marginBottom: 5, opacity: 0.55 }}>{label}</Text>
      <Text style={{ color, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </BlurView>
  );
});

const QuickStat = React.memo(function QuickStat({ icon, label, value, color, border, isDark }: { icon: IconSymbolName; label: string; value: string; color: string; border: string; isDark: boolean }) {
  return (
    <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.summCard, { borderColor: border, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color, fontSize: 10, fontWeight: '600', marginBottom: 3, opacity: 0.55 }}>{label}</Text>
        <Text style={{ color, fontSize: 13, fontWeight: '800' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      </View>
    </BlurView>
  );
});

const LegendDot = React.memo(function LegendDot({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: sub, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
});

const s = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  backBtn:      { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  segRow:       { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segBtn:       { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  segLabel:     { fontSize: 11, fontWeight: '600' },
  summCard:     { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  card:         { borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden', marginBottom: 0 },
  legendRow:    { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  catIcon:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  trendBadge:   { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  rangeChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  calSheet:     { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  stepPill:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  navBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:      { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 11 },
  hintRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 18 },
  emptyIcon:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 14, marginTop: 20 },
});
