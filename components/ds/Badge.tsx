/**
 * components/ds/Badge.tsx — бейдж DS v2.
 *
 * Тони за правилами використання акцентів:
 *   lime     — бейджі значень на графіках (+12%, активний стовпець)
 *   amber    — «7 днів», прогрес, тултіпи
 *   lavender — AI / асистент
 *   coral    — алерти, високий пріоритет. Суцільна coral-заливка з дрібним
 *              текстом не тримає 4.5:1, тому coral — це тонована підкладка
 *              + coral-крапка-тік + text.primary.
 *   neutral  — surface.subtle + text.secondary
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useResolvedAccent } from '@/components/ds/AccentContext';
import { radius, space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type BadgeTone = 'lime' | 'amber' | 'lavender' | 'coral' | 'info' | 'success' | 'accent' | 'neutral';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  /** Пояснення для скрінрідера, якщо сам підпис неочевидний («+12%» → «зростання на 12%»). */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Badge({ label, tone = 'neutral', accessibilityLabel, testID, style }: BadgeProps) {
  const { t, g, isDark, reduceTransparency } = useDS();
  const moduleAccent = useResolvedAccent(null);
  let bg: string;
  let fg: string = t.text.onAccent;
  let dot: string | null = null;
  let rim: string | null = null;
  switch (tone) {
    case 'lime': bg = t.accent.lime; break;
    case 'amber': bg = t.accent.amber; break;
    case 'lavender':
      bg = isDark ? t.accent.lavender : t.accent.lavenderSoft;
      fg = isDark ? t.text.onAccent : '#3B2A86';
      break;
    case 'coral':
    case 'info':
    case 'success':
    case 'accent': {
      const a = g.accent[tone === 'accent' ? moduleAccent : tone];
      bg = a.tint;
      fg = t.text.primary;
      dot = a.fill;
      rim = reduceTransparency ? null : g.rim;
      break;
    }
    default:
      bg = reduceTransparency ? t.surface.subtle : g.surfaceSubtle;
      fg = t.text.secondary;
      rim = reduceTransparency ? null : g.rim;
  }
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          gap: 5,
          paddingHorizontal: space[2] + 2,
          paddingVertical: 3,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: rim ? StyleSheet.hairlineWidth : 0,
          borderColor: rim ?? 'transparent',
        },
        style,
      ]}>
      {dot ? (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      ) : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={[type.caption, type.numeric, { fontFamily: type.label.fontFamily, color: fg }]}>
        {label}
      </Text>
    </View>
  );
}
