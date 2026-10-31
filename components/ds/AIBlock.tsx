/**
 * components/ds/AIBlock.tsx — AI-блок DS v2.1 (AI Insights, асистент).
 *
 * Лавандове Liquid Glass: <GlassSurface tint="lavender" glow> + легкий
 * перелив gradient.aiSurface поверх скла (≈45%) + необов'язкова «сфера»
 * gradient.aiOrb. Текст — text.primary (≥ 4.5:1 на тонованому склі).
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { GlassSurface } from '@/components/ds/Glass';
import { radius, space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export function AIOrb({ size = 28 }: { size?: number }) {
  const { t } = useDS();
  // Радіальний градієнт у RN без SVG — діагональний лінійний у колі дає
  // той самий «перелив» сфери.
  return (
    <LinearGradient
      colors={t.gradient.aiOrb}
      start={{ x: 0.15, y: 0.1 }}
      end={{ x: 0.9, y: 0.95 }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

export type AIBlockProps = {
  title?: string;
  /** Показати сферу асистента біля заголовка. */
  orb?: boolean;
  compact?: boolean;
  children?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function AIBlock({ title, orb = true, compact, children, testID, style }: AIBlockProps) {
  const { t, g, reduceTransparency } = useDS();
  return (
    <GlassSurface
      testID={testID}
      tint="lavender"
      glow="lavender"
      radius={compact ? radius.cardCompact : radius.card}
      style={[
        {
          padding: compact ? space.cardPaddingCompact : space.cardPadding,
          gap: space[3],
        },
        style,
      ]}>
      {!reduceTransparency ? (
        <LinearGradient
          pointerEvents="none"
          colors={t.gradient.aiSurface}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
        />
      ) : null}
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {orb ? <AIOrb size={24} /> : <IconSymbol name="sparkles" size={18} color={g.accent.lavender.ink} />}
          <Text accessibilityRole="header" style={[type.h2, { color: t.text.primary, flex: 1 }]}>{title}</Text>
        </View>
      ) : null}
      {children}
    </GlassSurface>
  );
}
