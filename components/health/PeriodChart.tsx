import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { CHART_TYPES, ChartType } from '@/store/chart-prefs';
import { PERIODS, Period, TrendData } from '@/utils/healthPeriods';

const PERIOD_LABEL: Record<Period, string> = {
  day: 'pDay', week: 'pWeek', month: 'pMonth', quarter: 'pQuarter', year: 'pYear',
};

export function PeriodSelector({ period, onChange, color, c, tr }: {
  period: Period; onChange: (p: Period) => void; color: string; c: any; tr: any;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, backgroundColor: c.dim, borderRadius: 12, padding: 3 }}>
      {PERIODS.map(p => {
        const active = p === period;
        return (
          <TouchableOpacity key={p} onPress={() => onChange(p)} accessibilityRole="button" accessibilityLabel={tr[PERIOD_LABEL[p]]}
            style={{ flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center', backgroundColor: active ? color : 'transparent' }}>
            <Text style={{ color: active ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{tr[PERIOD_LABEL[p]]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const CHART_ICON: Record<ChartType, string> = {
  bar: 'chart.bar.fill', line: 'chart.line.uptrend.xyaxis', dots: 'chart.dots.scatter',
};
const CHART_A11Y: Record<ChartType, string> = { bar: 'chartBar', line: 'chartLine', dots: 'chartDots' };

export function ChartTypeToggle({ value, onChange, color, c, tr }: {
  value: ChartType; onChange: (t: ChartType) => void; color: string; c: any; tr: any;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, backgroundColor: c.dim, borderRadius: 9, padding: 2 }}>
      {CHART_TYPES.map(t => {
        const active = t === value;
        return (
          <TouchableOpacity key={t} onPress={() => onChange(t)} accessibilityRole="button" accessibilityLabel={tr[CHART_A11Y[t]]}
            style={{ width: 30, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? color : 'transparent' }}>
            <IconSymbol name={CHART_ICON[t] as any} size={14} color={active ? '#fff' : c.sub} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function TrendChart({ data, color, height = 96, sub, goal, chartType = 'bar' }: {
  data: TrendData; color: string; height?: number; sub: string; goal?: number; chartType?: ChartType;
}) {
  const max = Math.max(...data.buckets, goal ?? 0, 1);
  const n = data.buckets.length;
  const [w, setW] = useState(0);

  return (
    <View>
      <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {chartType === 'bar' && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: n > 14 ? 1 : 3 }}>
            {data.buckets.map((v, i) => (
              <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
                <View style={{ height: Math.max(v > 0 ? 3 : 0, (v / max) * height), borderRadius: 3, backgroundColor: data.hasData[i] ? color : color + '22' }} />
              </View>
            ))}
          </View>
        )}

        {(chartType === 'line' || chartType === 'dots') && w > 0 && (() => {
          const pts = data.buckets.map((v, i) => ({ x: ((i + 0.5) / n) * w, y: height - (v / max) * height, has: data.hasData[i] }));
          const segs: React.ReactNode[] = [];
          if (chartType === 'line') {
            for (let i = 0; i < pts.length - 1; i++) {
              const a = pts[i], b = pts[i + 1];
              const dx = b.x - a.x, dy = b.y - a.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const ang = Math.atan2(dy, dx);
              segs.push(
                <View key={`s${i}`} style={{
                  position: 'absolute', left: a.x, top: a.y, width: len, height: 2.5, borderRadius: 2,
                  backgroundColor: color, opacity: 0.85,
                  transform: [{ translateY: -1.25 }, { rotateZ: `${ang}rad` }], transformOrigin: 'left center',
                }} />
              );
            }
          }
          const dots = pts.map((p, i) => (
            <View key={`d${i}`} style={{
              position: 'absolute', left: p.x - 3, top: p.y - 3, width: 6, height: 6, borderRadius: 3,
              backgroundColor: p.has ? color : color + '44',
            }} />
          ));
          return <>{segs}{dots}</>;
        })()}
      </View>

      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.labels.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: sub, fontSize: 8, fontWeight: '600' }} numberOfLines={1}>{l}</Text>
        ))}
      </View>
    </View>
  );
}
