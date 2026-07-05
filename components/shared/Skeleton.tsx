import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

// ─── Base Skeleton block ───────────────────────────────────────────────────────

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const isDark = useColorScheme() === 'dark';
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

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
