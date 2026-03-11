import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Platform,
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

const CATEGORY_ICONS: Record<string, IconSymbolName> = {
  'Зарплата':    'briefcase.fill',
  'Фріланс':     'laptopcomputer',
  'Інвестиції':  'chart.line.uptrend.xyaxis',
  'Подарунок':   'gift.fill',
  'Їжа':         'fork.knife',
  'Транспорт':   'car.fill',
  'Розваги':     'gamecontroller.fill',
  "Здоров'я":    'cross.fill',
  'Комунальні':  'house.fill',
  'Одяг':        'tag.fill',
  'Інше':        'ellipsis.circle.fill',
};

const CAT_COLORS = [
  '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#F97316', '#14B8A6', '#6366F1', '#A855F7', '#64748B',
];

const MONTHS_UA = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
const W = Dimensions.get('window').width - 40;
const fmt = (n: number) => n.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 });

type Period = 'week' | 'month' | '3months' | 'year' | 'all';

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  if (period === 'week')    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  if (period === 'month')   return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 2, 1);
  if (period === 'year')    return new Date(now.getFullYear(), 0, 1);
  return null;
}

// ─── Pie chart slice (pure RN, no SVG) ───────────────────────────────────────
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
      <View
        collapsable={false}
        style={{ position: 'absolute', top: 0, left: r, width: r, height: size, overflow: 'hidden' }}
      >
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

function DonutChart({ data, size = 200, holeRatio = 0.58, holeBg }: {
  data: { value: number; color: string }[];
  size?: number;
  holeRatio?: number;
  holeBg: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return null;
  const r = size / 2;
  let cumAngle = 0;
  const holeSize = size * holeRatio;

  return (
    <View style={{ width: size, height: size }}>
      {/* Background circle */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: r, backgroundColor: 'rgba(128,128,128,0.12)' }} />
      {data.map((item, i) => {
        const sweep = (item.value / total) * 360;
        const slice = <PieSlice key={i} from={cumAngle} sweep={sweep} color={item.color} size={size} />;
        cumAngle += sweep;
        return slice;
      })}
      {/* Center hole */}
      <View style={{
        position: 'absolute',
        width: holeSize, height: holeSize,
        borderRadius: holeSize / 2,
        backgroundColor: holeBg,
        top: (size - holeSize) / 2,
        left: (size - holeSize) / 2,
      }} />
    </View>
  );
}

export default function FinanceStatsScreen() {
  const isDark = useColorScheme() === 'dark';
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [catTab, setCatTab] = useState<TxType>('expense');

  useEffect(() => {
    loadData<Transaction[]>('transactions', []).then(setTxs);
  }, []);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,170,240,0.4)',
    text:   isDark ? '#F4F2FF' : '#0A0818',
    sub:    isDark ? 'rgba(244,242,255,0.45)' : 'rgba(10,8,24,0.45)',
    green:  '#10B981',
    red:    '#EF4444',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    hole:   isDark ? '#0E0D18' : '#ECE9FF',
  };

  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  const periodTxs = useMemo(() =>
    periodStart ? txs.filter(t => new Date(t.date) >= periodStart!) : txs,
  [txs, periodStart]);

  const income  = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;

  // Category stats for donut chart
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

  // Monthly bar chart (last 6 months)
  const monthlyStats = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const filtered = txs.filter(t => {
        const td = new Date(t.date);
        return `${td.getFullYear()}-${td.getMonth()}` === key;
      });
      return {
        label: MONTHS_UA[d.getMonth()],
        income: filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        expense: filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      };
    });
  }, [txs]);

  const maxMonthly = Math.max(...monthlyStats.map(m => Math.max(m.income, m.expense)), 1);

  // Income vs Expense donut data
  const balanceDonutData = income + expense > 0
    ? [{ value: income, color: c.green }, { value: expense, color: c.red }]
    : [];

  const donutSize = 160;
  const pieSize = 200;

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
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }}
          showsVerticalScrollIndicator={false}>

          {/* ── Period selector ── */}
          <View style={[s.periodRow, { backgroundColor: c.card, borderColor: c.border, marginBottom: 16 }]}>
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
                style={[s.periodBtn, period === p.key && { backgroundColor: c.accent }]}>
                <Text style={[s.periodLabel, { color: period === p.key ? '#fff' : c.sub }]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Summary cards ── */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.summCard, { borderColor: c.border, flex: 1 }]}>
              <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginBottom: 5 }}>Доходи</Text>
              <Text style={{ color: c.green, fontSize: 14, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>{fmt(income)}</Text>
            </BlurView>
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.summCard, { borderColor: c.border, flex: 1 }]}>
              <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginBottom: 5 }}>Витрати</Text>
              <Text style={{ color: c.red, fontSize: 14, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>{fmt(expense)}</Text>
            </BlurView>
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.summCard, { borderColor: c.border, flex: 1 }]}>
              <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginBottom: 5 }}>Баланс</Text>
              <Text style={{ color: balance >= 0 ? c.green : c.red, fontSize: 14, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit>{fmt(balance)}</Text>
            </BlurView>
          </View>

          {/* ── Доходи vs Витрати (donut) ── */}
          {balanceDonutData.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: c.sub }]}>Доходи / Витрати</Text>
              <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16 }]}>
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <View style={{ position: 'relative' }}>
                    <DonutChart data={balanceDonutData} size={donutSize} holeRatio={0.58} holeBg={c.hole} />
                    {/* Center label */}
                    <View style={{
                      position: 'absolute',
                      top: (donutSize - donutSize * 0.58) / 2,
                      left: (donutSize - donutSize * 0.58) / 2,
                      width: donutSize * 0.58, height: donutSize * 0.58,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>Збереження</Text>
                      <Text style={{ color: c.green, fontSize: 22, fontWeight: '800', marginTop: 2 }}>{savingsPct}%</Text>
                    </View>
                  </View>
                  {/* Legend */}
                  <View style={{ flexDirection: 'row', gap: 20, marginTop: 16 }}>
                    {[{ label: 'Доходи', value: income, color: c.green }, { label: 'Витрати', value: expense, color: c.red }].map(item => (
                      <View key={item.label} style={{ alignItems: 'center', gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{item.label}</Text>
                        </View>
                        <Text style={{ color: item.color, fontSize: 13, fontWeight: '800' }}>{fmt(item.value)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </BlurView>
            </>
          )}

          {/* ── Monthly bar chart ── */}
          <Text style={[s.sectionTitle, { color: c.sub }]}>Динаміка по місяцях</Text>
          <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16 }]}>
            {txs.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>Немає даних</Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 6, marginBottom: 8 }}>
                  {monthlyStats.map((m, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 110 }}>
                      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, height: 90 }}>
                        {/* Income bar */}
                        {m.income > 0 && (
                          <View style={{
                            flex: 1,
                            height: Math.max(4, (m.income / maxMonthly) * 84),
                            backgroundColor: c.green,
                            borderRadius: 4,
                            opacity: 0.85,
                          }} />
                        )}
                        {m.income === 0 && <View style={{ flex: 1 }} />}
                        {/* Expense bar */}
                        {m.expense > 0 && (
                          <View style={{
                            flex: 1,
                            height: Math.max(4, (m.expense / maxMonthly) * 84),
                            backgroundColor: c.red,
                            borderRadius: 4,
                            opacity: 0.85,
                          }} />
                        )}
                        {m.expense === 0 && <View style={{ flex: 1 }} />}
                      </View>
                      <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginTop: 5 }}>{m.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={[s.legendRow]}>
                  <LegendDot color={c.green} label="Доходи" sub={c.sub} />
                  <LegendDot color={c.red}   label="Витрати" sub={c.sub} />
                </View>
              </>
            )}
          </BlurView>

          {/* ── Category pie chart ── */}
          <Text style={[s.sectionTitle, { color: c.sub }]}>За категоріями</Text>

          {/* Tab */}
          <View style={[s.tabRow, { backgroundColor: c.card, borderColor: c.border, marginBottom: 14 }]}>
            {(['expense', 'income'] as TxType[]).map(t => (
              <TouchableOpacity
                key={t}
                onPress={() => setCatTab(t)}
                style={[s.tabBtn, catTab === t && { backgroundColor: t === 'expense' ? c.red : c.green }]}>
                <Text style={[s.tabLabel, { color: catTab === t ? '#fff' : c.sub }]}>
                  {t === 'expense' ? 'Витрати' : 'Доходи'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {categoryStats.length === 0 ? (
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16 }]}>
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                {catTab === 'expense' ? 'Витрат немає' : 'Доходів немає'}
              </Text>
            </BlurView>
          ) : (
            <BlurView intensity={isDark ? 22 : 40} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16 }]}>
              {/* Pie chart */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <DonutChart
                  data={categoryStats.map(s => ({ value: s.amt, color: s.color }))}
                  size={pieSize}
                  holeRatio={0.5}
                  holeBg={c.hole}
                />
              </View>

              {/* Stacked proportional bar */}
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 16, gap: 1 }}>
                {categoryStats.map(item => (
                  <View key={item.cat} style={{ flex: item.pct, backgroundColor: item.color, minWidth: item.pct > 2 ? 2 : 0 }} />
                ))}
              </View>

              {/* Category list */}
              {categoryStats.map((item, idx) => {
                const icon: IconSymbolName = CATEGORY_ICONS[item.cat] ?? 'ellipsis.circle.fill';
                return (
                  <View key={item.cat}>
                    {idx > 0 && <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[s.catIcon, { backgroundColor: item.color + '22' }]}>
                        <IconSymbol name={icon} size={14} color={item.color} />
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
                      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', width: 38, textAlign: 'right' }}>
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
    </View>
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
  header:      { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  backBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  periodRow:   { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  periodBtn:   { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  periodLabel: { fontSize: 11, fontWeight: '600' },
  summCard:    { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden' },
  sectionTitle:{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  card:        { borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden' },
  legendRow:   { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  tabRow:      { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  tabBtn:      { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  tabLabel:    { fontSize: 12, fontWeight: '600' },
  catIcon:     { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
