import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

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

export function TrendChart({ data, color, height = 96, sub, goal }: {
  data: TrendData; color: string; height?: number; sub: string; goal?: number;
}) {
  const max = Math.max(...data.buckets, goal ?? 0, 1);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: data.buckets.length > 14 ? 1 : 3 }}>
        {data.buckets.map((v, i) => (
          <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
            <View style={{
              height: Math.max(v > 0 ? 3 : 0, (v / max) * height),
              borderRadius: 3,
              backgroundColor: data.hasData[i] ? color : color + '22',
            }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.labels.map((l, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', color: sub, fontSize: 8, fontWeight: '600' }} numberOfLines={1}>{l}</Text>
        ))}
      </View>
    </View>
  );
}
