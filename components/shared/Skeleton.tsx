import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

/**
 * Непрозорість скелетона при ввімкненому «Зменшенні руху».
 *
 * Не 0.5 і не 1: 0.5 — це дно пульсації, статичний блок на ньому виглядає
 * зниклим; 1 — це звичайна плитка, яку легко сплутати з реальним вмістом.
 * 0.75 лишає блок явно «недомальованим», не рухаючись.
 */
export const SKELETON_REDUCED_OPACITY = 0.75;

// ─── Base Skeleton block ───────────────────────────────────────────────────────

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const isDark = useColorScheme() === 'dark';
  const reduced = useReduceMotion();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Єдиний Animated.loop у застосунку — і він крутиться весь час, поки
    // триває завантаження. Саме такий рух вимикають прапорцем «Зменшення
    // руху», тож при ньому лишаємо статичну плитку без циклу.
    if (reduced) {
      opacity.setValue(SKELETON_REDUCED_OPACITY);
      return;
    }

    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, reduced]);

  const bg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: bg },
        { opacity },
        style,
      ]}
    />
  );
}

// ─── Card skeleton (BlurView card replacement) ────────────────────────────────

interface SkeletonCardProps {
  style?: StyleProp<ViewStyle>;
}

export function SkeletonCard({ style }: SkeletonCardProps) {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[ss.card, { backgroundColor: bg, borderColor: border }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Skeleton width={30} height={30} radius={9} />
        <Skeleton width={120} height={14} radius={6} />
      </View>
      <Skeleton width="80%" height={12} radius={6} style={{ marginTop: 10 }} />
      <Skeleton width="60%" height={12} radius={6} style={{ marginTop: 6 }} />
    </View>
  );
}

// ─── Row skeleton (list item replacement) ────────────────────────────────────

interface SkeletonRowProps {
  style?: StyleProp<ViewStyle>;
}

export function SkeletonRow({ style }: SkeletonRowProps) {
  const isDark = useColorScheme() === 'dark';
  const bg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  return (
    <View style={[ss.row, { backgroundColor: bg, borderColor: border }, style]}>
      <Skeleton width={22} height={22} radius={6} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={13} radius={5} />
        <Skeleton width="45%" height={10} radius={5} />
      </View>
    </View>
  );
}

const ss = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
});
