import React, { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/motion';
import { fontFamily } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useMotion } from '@/hooks/use-motion';
import { haptic } from '@/utils/haptics';

// ─── Animated SVG Circle ──────────────────────────────────────────────────────

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE   = 64;
const STROKE = 5;
const R      = (SIZE - STROKE) / 2;           // 29.5
const CIRC   = 2 * Math.PI * R;               // ≈185.35
const ANIM_DURATION = Motion.duration.slow * 2; // 520 ms

// ─── Props (unchanged external API) ──────────────────────────────────────────

interface RingCellProps {
  pct: number;
  color: string;
  label: string;
  value: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RingCell({ pct, color, label, value }: RingCellProps) {
  const { reduced } = useMotion();
  const { t, isDark } = useDS();
  // Omni (DS v2.2): кільця лежать на суцільній BentoCard — скляний subtle там
  // зникав; доріжка — тихий нейтральний тон (як штрих HatchedBars).
  const track = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(17,17,19,0.08)';

  // Visual ring is capped at 100 %; text label may show >100 % (preserves old behaviour).
  const capped       = Math.min(pct, 1);
  const targetOffset = CIRC * (1 - capped); // 0 = full ring, CIRC = empty ring

  // Shared value starts fully empty so it animates in on mount.
  const dashOffset = useSharedValue(CIRC);

  useEffect(() => {
    dashOffset.value = withTiming(targetOffset, {
      duration: reduced ? 0 : ANIM_DURATION,
      easing: Motion.easing.out,
    });
    // dashOffset is stable; CIRC / ANIM_DURATION are module-level constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOffset, reduced]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  // ── Goal-reached celebration: pulse when pct crosses <1 → ≥1 in-session ──
  const scale = useSharedValue(1);
  const prevPctRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevPctRef.current;
    if (prev !== null && prev < 1 && pct >= 1 && !reduced) {
      // Unslop: без пружного перебігу — короткий «вдих» на одній кривій.
      scale.value = withSequence(
        withTiming(1.04, { duration: Motion.duration.fast, easing: Motion.easing.out }),
        withTiming(1, { duration: Motion.duration.slow, easing: Motion.easing.out }),
      );
      haptic.success();
    }
    prevPctRef.current = pct;
    // scale / reduced are stable refs; pct drives the effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const celebrationStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[{ alignItems: 'center', flex: 1 }, celebrationStyle]}>
      {/* Ring + percentage label */}
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg
          width={SIZE}
          height={SIZE}
          style={{ position: 'absolute' }}>
          {/* Background track */}
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={track}
            strokeWidth={STROKE}
            fill="none"
          />
          {/* Animated progress arc — rotated -90° so it starts at 12 o'clock */}
          <AnimatedCircle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            stroke={color}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={CIRC}
            strokeLinecap="round"
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
            animatedProps={animatedProps}
          />
        </Svg>

        {/* Pct text (uncapped — same as old implementation) */}
        <Text style={{ color: t.text.primary, fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>
          {Math.round(pct * 100)}%
        </Text>
      </View>

      {/* Value */}
      <Text style={{ color: t.text.primary, fontSize: 13, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginTop: 6 }}>{value}</Text>
      {/* Label */}
      <Text style={{ color: t.text.secondary, fontSize: 11, fontFamily: fontFamily.regular, marginTop: 2 }}>{label}</Text>
    </Animated.View>
  );
}
