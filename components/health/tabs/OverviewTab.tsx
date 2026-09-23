/**
 * components/health/tabs/OverviewTab.tsx — вкладка «Огляд».
 *
 * Зводить докупи те, що раніше стояло на двох екранах: хаб показував «сьогодні»
 * (кільця й вітальні), а `app/health-summary.tsx` — тренди за період. Ходити
 * між ними доводилось через кнопку «Динаміка», хоча дивляться на них разом:
 * «сьогодні» без тренду не каже, добре це чи погано.
 *
 * Обидві частини лишились дослівно тими самими — зокрема кільце калорій міряє
 * ЗʼЇДЕНЕ проти ліміту їжі й нічого більше, а тренди рахує buildTrend. Жодних
 * власних формул тут немає навмисно: розбіжність між «Оглядом» і вкладкою
 * розділу людина прочитала б як зіпсовані дані.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { LoadErrorNotice } from '@/components/health/HealthNotices';
import { ChartTypeToggle, PeriodSelector, TrendChart } from '@/components/health/PeriodChart';
import { RingCell } from '@/components/health/RingCell';
import type { HealthTabProps } from '@/components/health/tabs/types';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useChartType } from '@/store/chart-prefs';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { Agg, Period, buildTrend } from '@/utils/healthPeriods';
import {
  ACCENT, ACCENT_CAL, ACCENT_MOOD, ACCENT_PROT, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT,
  type HealthColors, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { EntryType, HealthEntry, getWeeklyInsights } from '@/utils/healthUtils';

interface Metric { type: EntryType; label: string; color: string; agg: Agg; unit: string; goal?: number }

function fmtMetric(m: Metric, v: number): string {
  if (m.unit === 'sleep') return fmtSleep(Math.round(v));
  if (m.type === 'steps') return v >= 1000 ? `${(v / 1000).toFixed(1)}т` : `${Math.round(v)}`;
  if (m.type === 'water') return v >= 1000 ? `${(v / 1000).toFixed(1)} л` : `${Math.round(v)} мл`;
  if (m.type === 'weight') return `${v.toFixed(1)} кг`;
  return `${Math.round(v)}${m.unit ? ' ' + m.unit : ''}`;
}

export function OverviewTab({ h }: HealthTabProps) {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  // Палітра й список метрик — у useMemo: SummaryCard обгорнутий у React.memo,
  // і новий обʼєкт на кожен ререндер зводив би memo нанівець, а кожна картка
  // заново перебирає всі записи через buildTrend.
  const c = useMemo(() => getHealthColors(isDark), [isDark]);

  const { today, goals, cal, latestWeight, bmi, bmiCategory, profile } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>('week');

  const reload = h.reload;
  const onRefresh = useCallback(async () => {
    setRefreshing(true); await reload(); setRefreshing(false);
  }, [reload]);

  const bmiColor = (b: number) => {
    const cat = bmiCategory(b);
    return cat === 'normal' ? ACCENT : cat === 'underweight' ? ACCENT_STEPS : cat === 'overweight' ? ACCENT_MOOD : ACCENT_PULSE;
  };

  const insights = useMemo(() => getWeeklyInsights(h.entries).slice(0, 2), [h.entries]);
  const insightLabel: Record<string, string> = { steps: tr.steps, sleep: tr.sleep, water: tr.water, calories: tr.calories };

  const metrics: Metric[] = useMemo(() => [
    { type: 'calories', label: tr.calories, color: ACCENT_CAL,    agg: 'sum', unit: 'кк', goal: goals.calories },
    { type: 'steps',    label: tr.steps,    color: ACCENT_STEPS,  agg: 'sum', unit: '',   goal: goals.steps },
    { type: 'water',    label: tr.water,    color: ACCENT,        agg: 'sum', unit: 'мл', goal: goals.water },
    { type: 'sleep',    label: tr.sleep,    color: ACCENT_SLEEP,  agg: 'avg', unit: 'sleep' },
    { type: 'weight',   label: tr.weight,   color: ACCENT_WEIGHT, agg: 'avg', unit: 'кг' },
    { type: 'pulse',    label: tr.pulse,    color: ACCENT_PULSE,  agg: 'avg', unit: 'уд' },
  ], [tr, goals]);

  return (
    <ScrollView
      contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: tabBarInset + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

      {/* ERR-01: якщо читання провалилось, initialized НЕ вмикається — без
          цієї гілки екран крутив би скелетони нескінченно. */}
      {h.loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={() => { void h.retryLoad(); }} />}

      {!h.initialized && !h.loadFailed && (
        <>
          <SkeletonCard style={{ marginTop: 4 }} />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {/* Профіль-підказка. Веде в налаштування розділу — профіль перестав бути
          окремим пунктом меню, але саме з нього рахуються всі норми. */}
      {h.initialized && !profile && (
        <TouchableOpacity onPress={() => router.push('/health-profile')} activeOpacity={0.85} style={{ marginBottom: 14 }}>
          <LinearGradient colors={isDark ? ['#0c1a14', '#10241c'] : ['#e9fbf3', '#d8f5e8']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.banner, { borderColor: ACCENT + '40' }]}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol name="person.fill" size={18} color={ACCENT} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{tr.healthProfile}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{tr.profileHint}</Text>
            </View>
            <IconSymbol name="chevron.right" size={13} color={c.sub} />
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Сьогодні */}
      <Text style={[s.kicker, { color: c.sub }]}>{tr.todayLabel}</Text>
      <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {/* Кільце міряє ЗʼЇДЕНЕ проти ліміту їжі й нічого більше:
              спалене — окреме число, а не поправка до цього. */}
          <RingCell pct={cal.pct} color={ACCENT_CAL} label={tr.calories} value={`${cal.consumed}кк`} />
          <RingCell pct={today.steps / goals.steps} color={ACCENT_STEPS} label={tr.steps}
            value={today.steps >= 1000 ? `${(today.steps / 1000).toFixed(1)}т` : `${today.steps}`} />
          <RingCell pct={today.water / goals.water} color={ACCENT} label={tr.water}
            value={today.water >= 1000 ? `${(today.water / 1000).toFixed(1)}л` : `${today.water}мл`} />
          <RingCell pct={today.sleep ? today.sleep / goals.sleep : 0} color={ACCENT_SLEEP} label={tr.sleep}
            value={today.sleep ? fmtSleep(today.sleep) : '—'} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
          <VitalMini label={tr.weight} value={latestWeight ? `${latestWeight} кг` : '—'} color={ACCENT_WEIGHT} sub={c.sub} />
          <VitalMini label={tr.bmi} value={bmi ? bmi.toFixed(1) : '—'} color={bmi ? bmiColor(bmi) : c.sub} sub={c.sub} />
          <VitalMini label={tr.pulse} value={today.pulse ? `${today.pulse}` : '—'} color={ACCENT_PULSE} sub={c.sub} />
          <VitalMini label={tr.protein} value={`${Math.round(today.protein)}г`} color={ACCENT_PROT} sub={c.sub} />
        </View>
      </BlurView>

      {/* Інсайти тижня */}
      {insights.length > 0 && (
        <>
          <Text style={[s.kicker, { color: c.sub }]}>{tr.insights}</Text>
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16, paddingVertical: 6 }]}>
            {insights.map((ins, i) => {
              const up = ins.deltaPct > 0;
              const col = ins.good ? ACCENT : ACCENT_PULSE;
              return (
                <View key={ins.type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.border }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: col + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <IconSymbol name={up ? 'arrow.up.right' : 'arrow.down.right'} size={13} color={col} />
                  </View>
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginLeft: 10, flex: 1 }}>{insightLabel[ins.type]}</Text>
                  <Text style={{ color: col, fontSize: 13, fontWeight: '800' }}>{up ? '+' : ''}{ins.deltaPct}%</Text>
                  <Text style={{ color: c.sub, fontSize: 11, marginLeft: 6 }}>{tr.thisWeek}</Text>
                </View>
              );
            })}
          </BlurView>
        </>
      )}

      {/* Динаміка: один селектор періоду на всі шість карток — сенс саме в
          тому, що вони дивляться на один період. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={[s.kicker, { color: c.sub, marginBottom: 0, flex: 1 }]}>{tr.dynamics}</Text>
      </View>
      <View style={{ marginBottom: 10 }}>
        <PeriodSelector period={period} onChange={setPeriod} color={ACCENT} c={c} tr={tr} />
      </View>
      {metrics.map(m => (
        <SummaryCard key={m.type} m={m} period={period} entries={h.entries} isDark={isDark} c={c} tr={tr} />
      ))}
    </ScrollView>
  );
}

function VitalMini({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const SummaryCard = React.memo(function SummaryCard({ m, period, entries, isDark, c, tr }: {
  m: Metric; period: Period; entries: HealthEntry[]; isDark: boolean; c: HealthColors; tr: Translations;
}) {
  const [chartType, setChartType] = useChartType(m.type);
  const d = buildTrend(entries, m.type, period, m.agg, tr.weekdays, tr.monthsShort);
  const hasAny = d.hasData.some(Boolean);
  const headline = m.agg === 'sum' ? d.total : (d.latest ?? d.avg);
  const sub2 = m.agg === 'sum'
    ? `${tr.average}: ${fmtMetric(m, d.avg)}`
    : (d.delta != null && d.delta !== 0
        ? `${tr.dynamics}: ${d.delta > 0 ? '+' : ''}${m.type === 'weight' ? d.delta.toFixed(1) : Math.round(d.delta)}`
        : `${tr.average}: ${fmtMetric(m, d.avg)}`);

  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.trendCard, { borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color, marginRight: 8 }} />
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{m.label}</Text>
        <Text style={{ color: m.color, fontSize: 17, fontWeight: '800', marginRight: 10 }}>{hasAny ? fmtMetric(m, headline) : '—'}</Text>
        <ChartTypeToggle value={chartType} onChange={setChartType} color={m.color} c={c} tr={tr} />
      </View>
      {hasAny ? (
        <>
          <TrendChart data={d} color={m.color} sub={c.sub} goal={m.goal} height={90} chartType={chartType} />
          <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{sub2}</Text>
        </>
      ) : (
        <Text style={{ color: c.sub, fontSize: 12, paddingVertical: 16, textAlign: 'center' }}>{tr.noDataPeriod}</Text>
      )}
    </BlurView>
  );
});

const s = StyleSheet.create({
  kicker:    { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 2 },
  card:      { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  trendCard: { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden', marginBottom: 12 },
  banner:    { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center' },
});
