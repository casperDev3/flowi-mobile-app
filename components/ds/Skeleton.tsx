/**
 * components/ds/Skeleton.tsx — скелетон DS v2: skeleton.base ↔ highlight.
 * При «Зменшенні руху» — статична плитка без циклу (як і components/shared/Skeleton).
 */
import React, { useEffect, useRef } from 'react';
import { Animated, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { radius as R } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 14, radius = R.control, style }: SkeletonProps) {
  const { t } = useDS();
  const reduced = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) { pulse.setValue(0); return; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse, reduced]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: t.skeleton.base, overflow: 'hidden' }, style]}>
      {/* Шар highlight поверх base: його прозорість і дає «мерехтіння». */}
      <Animated.View
        style={{ flex: 1, backgroundColor: t.skeleton.highlight, opacity: pulse }}
      />
    </View>
  );
}

/** Скелетон картки: заголовок + два рядки. */
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { t, g, reduceTransparency } = useDS();
  return (
    <View
      style={[
        reduceTransparency
          ? { backgroundColor: t.surface.card }
          : { backgroundColor: g.surface, borderWidth: 1, borderColor: g.rim, borderBottomColor: g.rimShade },
        { borderRadius: R.cardCompact, padding: 20, gap: 10 },
        style,
      ]}>
      <Skeleton width={120} height={14} />
      <Skeleton width="60%" height={36} radius={R.nestedCompact} />
      <Skeleton width="80%" height={12} />
    </View>
  );
}
