import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChartTypeToggle, PeriodSelector, TrendChart } from '@/components/health/PeriodChart';
import { useChartType } from '@/store/chart-prefs';
import { Agg, Period, buildTrend } from '@/utils/healthPeriods';
import { EntryType, HealthEntry } from '@/utils/healthUtils';

/** Блок «Динаміка»: селектор періоду (день/тиждень/місяць/3міс/рік) + графік + заголовок. */
export function MetricTrend({ entries, type, agg, color, goal, format, isDark, c, tr }: {
  entries: HealthEntry[];
  type: EntryType;
  agg: Agg;
  color: string;
  goal?: number;
  format: (v: number) => string;
  isDark: boolean;
  c: any;
  tr: any;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const [chartType, setChartType] = useChartType(type);
  const d = buildTrend(entries, type, period, agg, tr.weekdays, tr.monthsShort);
  const hasAny = d.hasData.some(Boolean);
  const headline = agg === 'sum' ? d.total : (d.latest ?? d.avg);
  const sub2 = agg === 'sum'
    ? `${tr.average}: ${format(d.avg)}`
    : (d.delta != null && d.delta !== 0
        ? `${tr.dynamics}: ${d.delta > 0 ? '+' : ''}${format(d.delta)}`
        : `${tr.average}: ${format(d.avg)}`);

  return (
    <View style={{ marginBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 }}>{tr.dynamics}</Text>
        <Text style={{ color, fontSize: 16, fontWeight: '800' }}>{hasAny ? format(headline) : '—'}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flex: 1 }}><PeriodSelector period={period} onChange={setPeriod} color={color} c={c} tr={tr} /></View>
        <ChartTypeToggle value={chartType} onChange={setChartType} color={color} c={c} tr={tr} />
      </View>
      <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
        {hasAny ? (
          <>
            <TrendChart data={d} color={color} sub={c.sub} goal={goal} height={88} chartType={chartType} />
            <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{sub2}</Text>
          </>
        ) : (
          <Text style={{ color: c.sub, fontSize: 12, paddingVertical: 16, textAlign: 'center' }}>{tr.noDataPeriod}</Text>
        )}
      </BlurView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 12, overflow: 'hidden' },
});
