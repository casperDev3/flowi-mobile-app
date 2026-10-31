/**
 * components/ds/ProgressBar.tsx — тонкий прогрес-бар DS v2.1.
 * Заливка — accent.fill (≥ 3:1 на склі): за замовчуванням акцент модуля
 * (<GlassScreen module>), поза ним — бурштиновий («прогрес, gauge»).
 * Доріжка — скло subtle.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useModuleAccent } from '@/components/ds/AccentContext';
import { radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type ProgressBarProps = {
  /** 0…1; значення поза межами обрізаються. */
  value: number;
  tone?: 'accent' | 'amber' | 'lime' | 'lavender' | 'coral' | 'info' | 'success' | 'primary';
  height?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function ProgressBar({ value, tone, height = 6, accessibilityLabel, testID, style }: ProgressBarProps) {
  const { t, g, reduceTransparency } = useDS();
  const ctx = useModuleAccent();
  const v = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const resolved = !tone || tone === 'accent' ? (ctx ?? 'amber') : tone;
  const fill = resolved === 'primary' ? t.action.primary : g.accent[resolved].fill;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      testID={testID}
      style={[{ height, borderRadius: radius.pill, backgroundColor: reduceTransparency ? t.surface.subtle : g.surfaceSubtle, borderWidth: reduceTransparency ? 0 : StyleSheet.hairlineWidth, borderColor: g.rimShade, overflow: 'hidden' }, style]}>
      <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: fill }} />
    </View>
  );
}
