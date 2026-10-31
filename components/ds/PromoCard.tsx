/**
 * components/ds/PromoCard.tsx — promo-картка DS v2.1 («Upgrade to Pro» тощо).
 *
 * Переливчастий gradient.iridescent під Liquid Glass (BlurView / заливка),
 * спекулярний обідок і лавандове світіння; у темній — темніші насичені стопи
 * з 15% lavender-glow. «Зменшити прозорість» → градієнт без блюру, щільніша
 * підкладка під текст.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PillButton } from '@/components/ds/PillButton';
import { radius, space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type PromoCardProps = {
  title: string;
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  children?: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function PromoCard({ title, caption, actionLabel, onAction, actionTestID, children, testID, style }: PromoCardProps) {
  const { t, g, isDark, reduceTransparency } = useDS();
  return (
    <View
      testID={testID}
      style={[
        { borderRadius: radius.card },
        Platform.OS !== 'android'
          ? { shadowColor: g.accent.lavender.glow, shadowOpacity: isDark ? 0.45 : 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } }
          : null,
        style,
      ]}>
      <View style={{ borderRadius: radius.card, overflow: 'hidden' }}>
      <LinearGradient
        colors={t.gradient.iridescent}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {isDark ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.gradient.iridescentGlow }]} />
      ) : null}
      {reduceTransparency ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(13,13,15,0.45)' : 'rgba(255,255,255,0.45)' }]} />
      ) : (
        <BlurView
          intensity={isDark ? 30 : 40}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(13,13,15,0.25)' : 'rgba(255,255,255,0.25)' }]}
        />
      )}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius.card, borderWidth: 1, borderColor: g.rim, borderBottomColor: g.rimShade }]}
      />
      <View style={{ padding: space.cardPadding, gap: space[2] }}>
        <Text accessibilityRole="header" style={[type.h2, { fontSize: 18, lineHeight: 24, color: t.text.primary }]}>{title}</Text>
        {caption ? <Text style={[type.body, { color: isDark ? t.text.primary : t.text.secondary }]}>{caption}</Text> : null}
        {children}
        {actionLabel && onAction ? (
          <PillButton label={actionLabel} onPress={onAction} testID={actionTestID} style={{ marginTop: space[2] }} />
        ) : null}
      </View>
      </View>
    </View>
  );
}
