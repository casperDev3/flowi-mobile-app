/**
 * components/finance/CashflowCharts.tsx — два прості графіки Cash Flow на
 * View (без SVG-залежностей): факт (± стовпці по днях) і прогноз (баланс по
 * днях, мінус — червоним). Графік — ілюстрація; точні числа — у підписах під
 * ним, тому для скрінрідера весь графік — один вузол із підсумком.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';

import type { CashflowPoint } from '@/utils/finance/cashflow';
import type { ForecastPoint } from '@/utils/finance/forecast';
import type { FinColors } from './financeLabels';

export function CashflowFactChart({ points, c, height = 120, summary }: {
  points: readonly CashflowPoint[];
  c: FinColors;
  height?: number;
  /** Текст для скрінрідера: «Приплив …, відплив …». */
  summary: string;
}) {
  const max = useMemo(
    () => points.reduce((m, p) => Math.max(m, p.inflow, p.outflow), 0),
    [points],
  );
  const half = height / 2;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ height, flexDirection: 'row', alignItems: 'center', gap: points.length > 60 ? 0 : 1 }}>
      {points.map(p => {
        const up = max > 0 ? Math.max(p.inflow > 0 ? 2 : 0, (p.inflow / max) * (half - 2)) : 0;
        const down = max > 0 ? Math.max(p.outflow > 0 ? 2 : 0, (p.outflow / max) * (half - 2)) : 0;
        return (
          <View key={p.day} style={{ flex: 1, height, justifyContent: 'center' }}>
            <View style={{ height: half, justifyContent: 'flex-end' }}>
              <View style={{ height: up, backgroundColor: c.green, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
            </View>
            <View style={{ height: 1, backgroundColor: c.border }} />
            <View style={{ height: half - 1, justifyContent: 'flex-start' }}>
              <View style={{ height: down, backgroundColor: c.red, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function ForecastChart({ points, c, height = 110, summary }: {
  points: readonly ForecastPoint[];
  c: FinColors;
  height?: number;
  summary: string;
}) {
  const { maxPos, maxNeg } = useMemo(() => {
    let pos = 0;
    let neg = 0;
    for (const p of points) {
      if (p.balance > pos) pos = p.balance;
      if (p.balance < neg) neg = p.balance;
    }
    return { maxPos: pos, maxNeg: -neg };
  }, [points]);
  const span = maxPos + maxNeg || 1;
  const posH = (maxPos / span) * height;
  const negH = height - posH;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ height, flexDirection: 'row', gap: points.length > 60 ? 0 : 1 }}>
      {points.map(p => {
        const pos = p.balance > 0 ? Math.max(1, (p.balance / span) * height) : 0;
        const neg = p.balance < 0 ? Math.max(1, (-p.balance / span) * height) : 0;
        const hasEvent = p.events.some(e => e.kind !== 'variable');
        return (
          <View key={p.day} style={{ flex: 1 }}>
            <View style={{ height: posH, justifyContent: 'flex-end' }}>
              <View style={{ height: pos, backgroundColor: hasEvent ? c.accent : c.accent + '88' }} />
            </View>
            <View style={{ height: negH, justifyContent: 'flex-start', borderTopWidth: maxNeg > 0 ? 1 : 0, borderTopColor: c.border }}>
              <View style={{ height: neg, backgroundColor: c.red }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
