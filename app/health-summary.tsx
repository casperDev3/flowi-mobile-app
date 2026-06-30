import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PeriodSelector, TrendChart } from '@/components/health/PeriodChart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import {
  ACCENT, ACCENT_CAL, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { Agg, Period, buildTrend } from '@/utils/healthPeriods';
import { EntryType } from '@/utils/healthUtils';

interface Metric { type: EntryType; label: string; color: string; agg: Agg; unit: string; goal?: number; }

export default function HealthSummaryScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_summary');

  const h = useHealthEntries();
  const [period, setPeriod] = useState<Period>('week');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };

  const metrics: Metric[] = [
    { type: 'calories', label: tr.calories, color: ACCENT_CAL,    agg: 'sum', unit: 'кк', goal: h.goals.calories },
    { type: 'steps',    label: tr.steps,    color: ACCENT_STEPS,  agg: 'sum', unit: '',   goal: h.goals.steps },
    { type: 'water',    label: tr.water,    color: ACCENT,        agg: 'sum', unit: 'мл', goal: h.goals.water },
    { type: 'sleep',    label: tr.sleep,    color: ACCENT_SLEEP,  agg: 'avg', unit: 'sleep' },
    { type: 'weight',   label: tr.weight,   color: ACCENT_WEIGHT, agg: 'avg', unit: 'кг' },
    { type: 'pulse',    label: tr.pulse,    color: ACCENT_PULSE,  agg: 'avg', unit: 'уд' },
  ];

  const fmt = (m: Metric, v: number) => {
    if (m.unit === 'sleep') return fmtSleep(Math.round(v));
    if (m.type === 'steps') return v >= 1000 ? `${(v / 1000).toFixed(1)}т` : `${Math.round(v)}`;
    if (m.type === 'water') return v >= 1000 ? `${(v / 1000).toFixed(1)} л` : `${Math.round(v)} мл`;
    if (m.type === 'weight') return `${v.toFixed(1)} кг`;
    return `${Math.round(v)}${m.unit ? ' ' + m.unit : ''}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.healthSummary}</Text>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <PeriodSelector period={period} onChange={setPeriod} color={ACCENT} c={c} tr={tr} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>
          {metrics.map(m => {
            const d = buildTrend(h.entries, m.type, period, m.agg, tr.weekdays, tr.monthsShort);
            const hasAny = d.hasData.some(Boolean);
            const headline = m.agg === 'sum' ? d.total : (d.latest ?? d.avg);
            const sub2 = m.agg === 'sum'
              ? `${tr.average}: ${fmt(m, d.avg)}`
              : (d.delta != null && d.delta !== 0 ? `${tr.dynamics}: ${d.delta > 0 ? '+' : ''}${m.type === 'weight' ? d.delta.toFixed(1) : Math.round(d.delta)}` : tr.average + ' ' + fmt(m, d.avg));
            return (
              <BlurView key={m.type} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.color, marginRight: 8, alignSelf: 'center' }} />
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', flex: 1 }}>{m.label}</Text>
                  <Text style={{ color: m.color, fontSize: 17, fontWeight: '800' }}>{hasAny ? fmt(m, headline) : '—'}</Text>
                </View>
                {hasAny ? (
                  <>
                    <TrendChart data={d} color={m.color} sub={c.sub} goal={m.goal} height={90} />
                    <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{sub2}</Text>
                  </>
                ) : (
                  <Text style={{ color: c.sub, fontSize: 12, paddingVertical: 16, textAlign: 'center' }}>{tr.noDataPeriod}</Text>
                )}
              </BlurView>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:  { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  card:   { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden', marginBottom: 12 },
});
