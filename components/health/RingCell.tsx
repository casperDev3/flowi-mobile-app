import React from 'react';
import { Text, View } from 'react-native';

interface RingCellProps {
  pct: number;
  color: string;
  label: string;
  value: string;
}

export function RingCell({ pct, color, label, value }: RingCellProps) {
  const SIZE = 64, STROKE = 5;
  const angle = Math.min(pct, 1) * 360;
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{
          position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
          borderWidth: STROKE, borderColor: color + '22',
        }} />
        <View style={{
          position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
          borderWidth: STROKE,
          borderTopColor:    angle > 0   ? color : 'transparent',
          borderRightColor:  angle > 90  ? color : 'transparent',
          borderBottomColor: angle > 180 ? color : 'transparent',
          borderLeftColor:   angle > 270 ? color : 'transparent',
          transform: [{ rotate: '-45deg' }],
        }} />
        <Text style={{ color, fontSize: 10, fontWeight: '800' }}>{Math.round(pct * 100)}%</Text>
      </View>
      <Text style={{ color, fontSize: 12, fontWeight: '800', marginTop: 5 }}>{value}</Text>
      <Text style={{ color: color + '99', fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  );
}
