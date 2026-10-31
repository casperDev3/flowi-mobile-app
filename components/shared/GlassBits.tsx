/**
 * components/shared/GlassBits.tsx — дрібні акцентні елементи DS v2.1 для
 * екранів, що малюють картки інлайн-стилями (не через <Card>/<GlassSurface>).
 *
 * Схема — пропом `isDark` (без useDS/useColorScheme: компоненти монтують
 * тести без моків theme-context/AsyncStorage); «Зменшити прозорість» —
 * useReduceTransparency (без залежностей).
 *
 *   <AccentWash isDark accent="lime" />   — absolute-«змивка» акцентом усередині
 *                                           картки (KPI); картці — overflow:hidden.
 *   <AccentDot isDark accent="coral" />   — крапка-маркер біля заголовка секції.
 *   <AccentIcon isDark icon accent size/> — тонований скляний кружок з іконкою ink.
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { GlassAccent } from '@/constants/theme';

import { useReduceTransparency } from '@/hooks/use-reduce-transparency';

import { dsGlass } from './dsTheme';

export function AccentWash({ isDark, accent, strength = 1, style }: { isDark: boolean; accent: GlassAccent; strength?: number; style?: StyleProp<ViewStyle> }) {
  const g = dsGlass(isDark);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: g.accent[accent].tint, opacity: strength }, style]}
    />
  );
}

export function AccentDot({ isDark, accent, size = 8, style }: { isDark: boolean; accent: GlassAccent; size?: number; style?: StyleProp<ViewStyle> }) {
  const g = dsGlass(isDark);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: g.accent[accent].fill }, style]}
    />
  );
}

const ICON_SIZES = { sm: { box: 30, icon: 15 }, md: { box: 36, icon: 18 }, lg: { box: 44, icon: 22 } } as const;

export function AccentIcon({ isDark, icon, accent, size = 'sm', solid, style }: {
  isDark: boolean;
  icon: IconSymbolName;
  accent: GlassAccent;
  size?: keyof typeof ICON_SIZES;
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const g = dsGlass(isDark);
  const rt = useReduceTransparency();
  const a = g.accent[accent];
  const s = ICON_SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{
        width: s.box,
        height: s.box,
        borderRadius: s.box / 2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: solid ? a.solid : rt ? g.solid.subtle : g.surfaceSubtle,
        borderWidth: solid ? 0 : 1,
        borderColor: g.rim,
        borderBottomColor: g.rimShade,
      }, style]}>
      {!solid ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: a.tint }]} /> : null}
      <IconSymbol name={icon} size={s.icon} color={solid ? a.onSolid : a.ink} />
    </View>
  );
}
