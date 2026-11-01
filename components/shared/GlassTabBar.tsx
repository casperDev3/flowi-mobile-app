/**
 * components/shared/GlassTabBar.tsx — тло й іконка панелі табів Liquid Glass
 * (DS v2.1) для вкладених таб-навігаторів (простір проєкту). Той самий рецепт,
 * що TabBarGlass/TabIcon в app/(tabs)/_layout.tsx:
 *   iOS 26+ — нативне скло, iOS — BlurView + glass.surfaceStrong,
 *   Android — майже непрозора заливка, «Зменшити прозорість» — суцільне TAB_BAR_BG.
 * Активна вкладка — без pill: лише сама іконка (колір + заповнений варіант).
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
 * Іконка вкладки (11.2026, рішення власника): БЕЗ pill, обводки й тла —
 * виділяється сама іконка. Активна — колір `TAB_BAR_TINT.active`
 * (text.primary, ≥ 15:1) + заповнений варіант SF Symbol (`activeName`) і
 * трохи товща лінія; неактивна — приглушений `TAB_BAR_TINT.inactive`
 * (≥ 4.5:1). Колір приходить від навігатора (`color`), підпис — той самий.
 * `accent` лишився в API — таб-бар монохромний, акцент модуля живе на сторінці.
 */
export function GlassTabIcon({ name, activeName, color, focused, accent, badge }: {
  name: IconSymbolName;
  /** Заповнений варіант для активної вкладки (напр. house → house.fill). */
  activeName?: IconSymbolName;
  color: string; focused: boolean; accent: GlassAccent; badge?: React.ReactNode;
}) {
  void accent;
  return (
    <View testID={focused ? 'tab-icon-active' : undefined} style={st.iconBox}>
      <IconSymbol
        size={focused ? 24 : 22}
        name={focused && activeName ? activeName : name}
        color={color}
        weight={focused ? 'semibold' : 'regular'}
      />
      {badge}
    </View>
  );
}

const st = StyleSheet.create({
  island: { borderRadius: radius.pill, overflow: 'hidden' },
  // Коробка 52×28 — та сама, що була під pill: розкладка панелі не змінюється.
  iconBox: { width: 52, height: 28, alignItems: 'center', justifyContent: 'center' },
});
