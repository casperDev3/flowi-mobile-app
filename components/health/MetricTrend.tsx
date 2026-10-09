import { Atlas } from '@/constants/atlas';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { HealthCard } from '@/components/health/HealthBits';
import { ChartTypeToggle, PeriodSelector, TrendChart } from '@/components/health/PeriodChart';
import { useChartType } from '@/store/chart-prefs';
import { Agg, Period, buildTrend } from '@/utils/healthPeriods';
import { ACCENT } from '@/utils/healthTheme';
import { EntryType, HealthEntry } from '@/utils/healthUtils';

/**
 * Картка «Динаміка»: заголовок + значення, селектор періоду
 * (день/тиждень/місяць/3міс/рік), тип графіка і сам графік.
 *
 * Уся секція — ОДНА суцільна картка (HealthCard): у masonry на планшеті
 * заголовок і селектор не можуть відірватись від свого графіка в іншу колонку.
 * `title` — щоб у двох колонках було видно, ЧИЯ це динаміка («Калорії · Динаміка»).
 */
export function MetricTrend({ entries, type, agg, color, goal, format, c, tr, title }: {
  entries: HealthEntry[];
  type: EntryType;
  agg: Agg;
  /** Колір ДАНИХ (графік, значення); селектор періоду — акцентом розділу. */
  color: string;
  goal?: number;
  format: (v: number) => string;
  /** Не використовується: картка суцільна. Лишається для сумісності викликів. */
  isDark?: boolean;
  c: any;
  tr: any;
  title?: string;
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
    <HealthCard
      c={c}
      title={title ?? tr.dynamics}
      right={<Text style={{ color, fontSize: 16, fontWeight: Atlas.type.headingWeight }}>{hasAny ? format(headline) : '—'}</Text>}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <View style={{ flex: 1 }}><PeriodSelector period={period} onChange={setPeriod} color={ACCENT} c={c} tr={tr} /></View>
        <ChartTypeToggle value={chartType} onChange={setChartType} color={ACCENT} c={c} tr={tr} />
      </View>
      {hasAny ? (
        <>
          <TrendChart data={d} color={color} sub={c.sub} goal={goal} height={88} chartType={chartType} />
          <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{sub2}</Text>
        </>
      ) : (
        <Text style={{ color: c.sub, fontSize: 12, paddingVertical: 16, textAlign: 'center' }}>{tr.noDataPeriod}</Text>
      )}
    </HealthCard>
  );
}
