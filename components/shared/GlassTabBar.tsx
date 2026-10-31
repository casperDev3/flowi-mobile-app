/**
 * components/shared/GlassTabBar.tsx — тло й іконка панелі табів Liquid Glass
 * (DS v2.1) для вкладених таб-навігаторів (простір проєкту). Той самий рецепт,
 * що TabBarGlass/TabIcon в app/(tabs)/_layout.tsx:
 *   iOS 26+ — нативне скло, iOS — BlurView + glass.surfaceStrong,
 *   Android — майже непрозора заливка, «Зменшити прозорість» — суцільне TAB_BAR_BG.
 * Активна вкладка — скляна pill, тонована акцентом, іконка ink (+ світіння на iOS).
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { GlassBackdrop } from '@/components/ds/Glass';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { TAB_BAR_BG } from '@/constants/nav';
import { radius, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export function GlassTabBarBackground() {
  const { g, isDark, reduceTransparency } = useDS();
  if (reduceTransparency) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? TAB_BAR_BG.dark : TAB_BAR_BG.light }]} />;
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <GlassBackdrop intensityBoost={20} />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: Platform.OS === 'android' ? (isDark ? 'rgba(23,23,26,0.92)' : 'rgba(255,255,255,0.9)') : g.surfaceStrong },
        ]}
      />
      <LinearGradient
        colors={[g.highlight, 'rgba(255,255,255,0)']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 18, opacity: isDark ? 0.35 : 0.6 }}
      />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: isDark ? g.rim : g.rimShade }} />
    </View>
  );
}

export function GlassTabIcon({ name, color, focused, accent }: { name: IconSymbolName; color: string; focused: boolean; accent: GlassAccent }) {
  const { g, isDark, reduceTransparency } = useDS();
  const a = g.accent[accent];
  return (
    <View
      style={[
        st.iconPill,
        focused && (reduceTransparency
          ? { backgroundColor: a.solid }
          : {
            backgroundColor: a.tint,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: g.rim,
            ...(Platform.OS === 'ios'
              ? { shadowColor: a.glow, shadowOpacity: isDark ? 0.6 : 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 2 } }
              : null),
          }),
      ]}>
      <IconSymbol size={22} name={name} color={focused ? (reduceTransparency ? a.onSolid : a.ink) : color} />
    </View>
  );
}

const st = StyleSheet.create({
  iconPill: { width: 52, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
