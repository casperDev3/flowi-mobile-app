import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
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
import { loadData } from '@/store/storage';

type TxType = 'income' | 'expense';
interface Transaction {
  id: string; type: TxType; category: string; amount: number; note: string; date: string;
}
interface CategoryDef { name: string; icon: IconSymbolName; }

const DEFAULT_CATEGORIES: Record<TxType, CategoryDef[]> = {
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

const CAT_COLORS = [
  '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#A855F7', '#64748B',
];

const MONTHS_UA      = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
const MONTHS_UA_FULL = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WEEKDAYS_UA    = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const W = Dimensions.get('window').width;
const fmt = (n: number) => n.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 });
const fmtShort = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}к`;
  return String(Math.round(n));
};

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
function PieSlice({ from, sweep, color, size }: { from: number; sweep: number; color: string; size: number }) {
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
}

function DonutChart({ data, size = 180, holeRatio = 0.56, holeBg }: {
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
}

// ─── Trend line chart (rotated Views) ────────────────────────────────────────
function SparkLine({ data, color, height = 64, width }: {
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
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function FinanceStatsScreen() {
  const isDark = useColorScheme() === 'dark';
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Record<TxType, CategoryDef[]>>(DEFAULT_CATEGORIES);
  const [period, setPeriod] = useState<Period>('month');
  const [catTab, setCatTab] = useState<TxType>('expense');

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

  // Calendar grid helpers
  const firstDayOfMonth = useMemo(() => {
    const d = new Date(calYear, calMonth, 1).getDay();
    return d === 0 ? 6 : d - 1;
  }, [calYear, calMonth]);
  const daysInMonth = useMemo(() => new Date(calYear, calMonth + 1, 0).getDate(), [calYear, calMonth]);
  const calWeeks = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) cells.push(i);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [firstDayOfMonth, daysInMonth]);

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    txs.forEach(t => {
      const d = new Date(t.date);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [txs]);

  useEffect(() => {
    loadData<Transaction[]>('transactions', []).then(setTxs);
    loadData<Record<TxType, CategoryDef[]>>('categories', DEFAULT_CATEGORIES).then(setCats);
  }, []);

  const getCatIcon = (name: string, type: TxType): IconSymbolName =>
    cats[type].find(c => c.name === name)?.icon ??
    DEFAULT_CATEGORIES[type].find(c => c.name === name)?.icon ??
    'ellipsis.circle.fill';

  const c = {
    bg1:    isDark ? '#080E18' : '#EFF5FF',
    bg2:    isDark ? '#0F1A2E' : '#E0ECFF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(140,180,240,0.35)',
    text:   isDark ? '#F0F5FF' : '#0A1020',
    sub:    isDark ? 'rgba(240,245,255,0.45)' : 'rgba(10,16,32,0.45)',
    green:  '#10B981',
    red:    '#EF4444',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    hole:   isDark ? '#0C1420' : '#E8F0FC',
  };

  const periodStart = useMemo(() => getPeriodStart(period), [period]);
  const periodTxs   = useMemo(() => {
    if (hasCustomRange) {
      const end = new Date(rangeEnd!); end.setHours(23, 59, 59, 999);
      return txs.filter(t => { const d = new Date(t.date); return d >= rangeStart! && d <= end; });
    }
    return periodStart ? txs.filter(t => new Date(t.date) >= periodStart!) : txs;
  }, [txs, periodStart, hasCustomRange, rangeStart, rangeEnd]);

  const income  = periodTxs.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
  const expense = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;

  // ── Adaptive bar chart data ──────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (period === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayKey = d.toDateString();
        const f = periodTxs.filter(t => new Date(t.date).toDateString() === dayKey);
        const dow = d.getDay();
        return {
          label: WEEKDAYS_UA[dow === 0 ? 6 : dow - 1],
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
      const f = txs.filter(t => {
        const td = new Date(t.date);
        return `${td.getFullYear()}-${td.getMonth()}` === key;
      });
      return {
        label: MONTHS_UA[d.getMonth()],
        income:  f.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0),
        expense: f.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [txs, periodTxs, period]);

  const maxBar = Math.max(...chartData.map(m => Math.max(m.income, m.expense)), 1);

  // ── Cumulative balance trend ─────────────────────────────────────────────
  const trendData = useMemo(() => {
    if (periodTxs.length < 2) return [];
    const sorted = [...periodTxs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let running = 0;
    const pts: number[] = [];
    sorted.forEach(t => {
      running += t.type === 'income' ? t.amount : -t.amount;
      pts.push(running);
    });
    if (pts.length <= 40) return pts;
    const step = Math.floor(pts.length / 40);
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  }, [periodTxs]);

  // ── Category stats ───────────────────────────────────────────────────────
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    periodTxs.filter(t => t.type === catTab).forEach(t => {
      map[t.category] = (map[t.category] ?? 0) + t.amount;
    });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .map(([cat, amt], i) => ({ cat, amt, pct: total > 0 ? (amt / total) * 100 : 0, color: CAT_COLORS[i % CAT_COLORS.length] }))
      .sort((a, b) => b.amt - a.amt);
  }, [periodTxs, catTab]);

  // ── Day-of-week expense stats ────────────────────────────────────────────
  const weekdayStats = useMemo(() => {
    const sums   = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    periodTxs.filter(t => t.type === 'expense').forEach(t => {
      const dow = new Date(t.date).getDay();
      const idx = dow === 0 ? 6 : dow - 1;
      sums[idx]   += t.amount;
      counts[idx] += 1;
    });
    const maxSum = Math.max(...sums, 1);
    return WEEKDAYS_UA.map((label, i) => ({
      label,
      total: sums[i],
      count: counts[i],
      pct:   sums[i] / maxSum,
    }));
  }, [periodTxs]);

  // ── Quick stats ──────────────────────────────────────────────────────────
  const txCount      = periodTxs.length;
  const expenseTxs   = periodTxs.filter(t => t.type === 'expense');
  const largestTx    = expenseTxs.reduce<Transaction | null>((max, t) => !max || t.amount > max.amount ? t : max, null);
  const periodDays   = hasCustomRange
    ? Math.max(1, Math.ceil((rangeEnd!.getTime() - rangeStart!.getTime()) / 86400000) + 1)
    : periodStart ? Math.max(1, Math.ceil((Date.now() - periodStart.getTime()) / 86400000)) : 30;
  const avgDailyExp  = expense / periodDays;

  const balanceDonutData = income + expense > 0
    ? [{ value: income, color: c.green }, { value: expense, color: c.red }]
    : [];

  const trendColor = balance >= 0 ? c.green : c.red;
  const SPARK_W = W - 76;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text }]}>Статистика</Text>
          <TouchableOpacity
            onPress={openCal}
            style={[s.backBtn, {
              backgroundColor: hasCustomRange ? c.accent + '22' : c.dim,
              borderColor:     hasCustomRange ? c.accent        : c.border,
            }]}>
            <IconSymbol name="calendar" size={17} color={hasCustomRange ? c.accent : c.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }}
          showsVerticalScrollIndicator={false}>

          {/* ── Custom range chip ── */}
          {hasCustomRange && (
            <TouchableOpacity
              onPress={clearRange}
              style={[s.rangeChip, { backgroundColor: c.accent + '18', borderColor: c.accent + '50' }]}>
              <IconSymbol name="calendar" size={12} color={c.accent} />
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700', marginHorizontal: 6 }}>
                {rangeStart!.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                {' — '}
                {rangeEnd!.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <IconSymbol name="xmark" size={11} color={c.accent} />
            </TouchableOpacity>
          )}

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
                style={[s.segBtn, period === p.key && { backgroundColor: c.accent }]}>
                <Text style={[s.segLabel, { color: period === p.key ? '#fff' : c.sub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          )}

          {/* ── Summary row ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <SummCard label="Доходи"  value={fmt(income)}  color={c.green} border={c.border} isDark={isDark} />
            <SummCard label="Витрати" value={fmt(expense)} color={c.red}   border={c.border} isDark={isDark} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
            <SummCard label="Баланс"      value={fmt(balance)}      color={balance >= 0 ? c.green : c.red} border={c.border} isDark={isDark} />
            <SummCard label="Заощадження" value={`${savingsPct}%`}  color={c.accent} border={c.border} isDark={isDark} />
          </View>

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
            {txs.length === 0 ? (
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
            {(['expense', 'income'] as TxType[]).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setCatTab(t)}
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
                  data={categoryStats.map(s => ({ value: s.amt, color: s.color }))}
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

        </ScrollView>
      </SafeAreaView>

      {/* ─── Calendar Range Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' }} onPress={() => setShowCal(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 }}>
            <BlurView intensity={isDark ? 55 : 72} tint={isDark ? 'dark' : 'light'} style={[s.calSheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(10,16,30,0.97)' : 'rgba(245,248,255,0.97)' }]}>

              {/* Handle + close */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flex: 1 }} />
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center' }} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={() => setShowCal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                          {dateVal ? dateVal.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Month navigation */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={s.navBtn}>
                  <IconSymbol name="chevron.left" size={19} color={c.sub} />
                </TouchableOpacity>
                <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 15, fontWeight: '700' }}>
                  {MONTHS_UA_FULL[calMonth]} {calYear}
                </Text>
                <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={s.navBtn}>
                  <IconSymbol name="chevron.right" size={19} color={c.sub} />
                </TouchableOpacity>
              </View>

              {/* Weekday headers */}
              <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                {WEEKDAYS_UA.map(d => (
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
function SectionTitle({ text, sub }: { text: string; sub: string }) {
  return <Text style={[s.sectionTitle, { color: sub }]}>{text}</Text>;
}

function SummCard({ label, value, color, border, isDark }: { label: string; value: string; color: string; border: string; isDark: boolean }) {
  return (
    <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.summCard, { borderColor: border, flex: 1 }]}>
      <Text style={{ color, fontSize: 10, fontWeight: '600', marginBottom: 5, opacity: 0.55 }}>{label}</Text>
      <Text style={{ color, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </BlurView>
  );
}

function QuickStat({ icon, label, value, color, border, isDark }: { icon: IconSymbolName; label: string; value: string; color: string; border: string; isDark: boolean }) {
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
}

function LegendDot({ color, label, sub }: { color: string; label: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ color: sub, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

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
});
