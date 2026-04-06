import React from 'react';
import { View } from 'react-native';

interface MiniBarChartProps {
  values: number[];
  color: string;
  goal?: number;
  height?: number;
}

export function MiniBarChart({ values, color, goal, height = 52 }: MiniBarChartProps) {
  const max = Math.max(...values, goal ?? 0, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
          <View
            style={{
              height: Math.max(3, (v / max) * height),
              borderRadius: 4,
              backgroundColor: i === values.length - 1 ? color : color + '55',
            }}
          />
        </View>
      ))}
    </View>
  );
}
