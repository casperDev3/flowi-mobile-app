import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';

interface MiniBarChartProps {
  values: number[];
  color: string;
  goal?: number;
  height?: number;
}

// ─── Single animated bar ──────────────────────────────────────────────────────
interface BarProps {
  targetHeight: number;
  color: string;
  delayMs: number;
  reduced: boolean;
}

function Bar({ targetHeight, color, delayMs, reduced }: BarProps) {
  const h = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      h.value = targetHeight;
    } else {
      h.value = withDelay(
        delayMs,
        withTiming(targetHeight, {
          duration: Motion.duration.slow,
          easing:   Motion.easing.out,
        }),
      );
    }
  }, [targetHeight, reduced, delayMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const style = useAnimatedStyle(() => ({ height: h.value }));

  return (
    <Animated.View style={[{ borderRadius: 4, backgroundColor: color }, style]} />
  );
}

// ─── Chart ───────────────────────────────────────────────────────────────────
export function MiniBarChart({ values, color, goal, height = 52 }: MiniBarChartProps) {
  const max = Math.max(...values, goal ?? 0, 1);
  const { reduced } = useMotion();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => {
        const targetH = Math.max(3, (v / max) * height);
        const barColor = i === values.length - 1 ? color : color + '55';
        return (
          <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
            <Bar
              targetHeight={targetH}
              color={barColor}
              delayMs={i * 30}
              reduced={reduced}
            />
          </View>
        );
      })}
    </View>
  );
}
