/**
 * components/shared/GlassTabBar.tsx — тло й іконка панелі табів Liquid Glass
 * (DS v2.1) для вкладених таб-навігаторів (простір проєкту). Той самий рецепт,
 * що TabBarGlass/TabIcon в app/(tabs)/_layout.tsx:
 *   iOS 26+ — нативне скло, iOS — BlurView + glass.surfaceStrong,
 *   Android — майже непрозора заливка, «Зменшити прозорість» — суцільне TAB_BAR_BG.
 * Активна вкладка — скляна pill, тонована акцентом, іконка ink (+ світіння на iOS).
 * `island` — форма острівця особистих табів телефона (app/(tabs)/_layout.tsx).
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { GlassBackdrop } from '@/components/ds/Glass';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { TAB_BAR_BG } from '@/constants/nav';
import { radius, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export function GlassTabBarBackground({ island = false }: {
  /**
   * Острівець (особисті таби телефона, 11.2026): уся панель — pill з повним
   * обідком; скло обрізане по радіусу. Без острівця — суцільна смуга від краю
   * до краю з обідком лише згори (простір проєкту).
   */
  island?: boolean;
} = {}) {
  const { g, isDark, reduceTransparency } = useDS();
  const shape = island ? st.island : null;
  if (reduceTransparency) {
    return (
      <View
        style={[
          StyleSheet.absoluteFill,
          shape,
          { backgroundColor: isDark ? TAB_BAR_BG.dark : TAB_BAR_BG.light },
          island ? { borderWidth: StyleSheet.hairlineWidth, borderColor: isDark ? g.rim : g.rimShade } : null,
        ]}
      />
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, shape]} pointerEvents="none">
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
      {island ? (
        // Спекулярний обідок по всьому контуру: світліший згори, тінь знизу.
        <View
          style={[
            StyleSheet.absoluteFill,
            st.island,
            { borderWidth: 1, borderColor: g.rim, borderTopColor: g.rim, borderBottomColor: g.rimShade },
          ]}
        />
      ) : (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: isDark ? g.rim : g.rimShade }} />
      )}
    </View>
  );
}

/**
 * Іконка вкладки Omni (DS v2.2): активна — суцільна чорна pill action.primary
 * (у темній — біла) з іконкою text.onAction (≥ 15:1), як активний пункт
 * сайдбара й SectionTabs; неактивна — іконка кольору підпису (TAB_BAR_TINT).
 * `accent` лишився в API (акцент модуля вкладки) — Omni тримає таб-бар
 * монохромним, акцент модуля живе на сторінці.
 */
export function GlassTabIcon({ name, color, focused, accent, badge }: {
  name: IconSymbolName; color: string; focused: boolean; accent: GlassAccent; badge?: React.ReactNode;
}) {
  const { t, isDark, reduceTransparency } = useDS();
  void accent;
  return (
    <View
      style={[
        st.iconPill,
        focused && {
          backgroundColor: t.action.primary,
          ...(Platform.OS === 'ios' && !reduceTransparency
            ? { shadowColor: '#000', shadowOpacity: isDark ? 0.35 : 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }
            : null),
        },
      ]}>
      <IconSymbol size={20} name={name} color={focused ? t.text.onAction : color} />
      {badge}
    </View>
  );
}

const st = StyleSheet.create({
  island: { borderRadius: radius.pill, overflow: 'hidden' },
  iconPill: { width: 52, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
