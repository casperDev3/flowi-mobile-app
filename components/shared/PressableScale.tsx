/**
 * components/shared/PressableScale.tsx
 *
 * Pressable з анімацією масштабування при натисканні (reanimated 4).
 * onPressIn → withSpring(scaleTo, Motion.spring.default)
 * onPressOut → withSpring(1, Motion.spring.default)
 *
 * При reduced motion — звичайний Pressable з opacity-фідбеком (0.8 on pressed).
 *
 * Props: всі PressableProps + style (StyleProp<ViewStyle>, не функція) +
 *        scaleTo (default 0.96; FABs рекомендовано 0.92) + children.
 */
import React, { useCallback } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';

/**
 * Animated variant of Pressable — accepts both static and animated styles.
 * Created once at module level to avoid re-creation on each render.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable) as any;

export type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** Layout and visual style (static; function styles not supported). */
  style?: StyleProp<ViewStyle>;
  /**
   * Scale target on press-in. Default 0.96.
   * Use 0.92 for FABs to give a more pronounced "push" feel.
   */
  scaleTo?: number;
  children?: React.ReactNode;
};

export function PressableScale({
  onPressIn,
  onPressOut,
  style,
  scaleTo = 0.96,
  children,
  ...rest
}: PressableScaleProps) {
  const { reduced } = useMotion();
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      if (!reduced) scale.value = withSpring(scaleTo, Motion.spring.default);
      onPressIn?.(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced, scaleTo, onPressIn],
  );

  const handlePressOut = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
      if (!reduced) scale.value = withSpring(1, Motion.spring.default);
      onPressOut?.(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reduced, onPressOut],
  );

  /* ── Reduced motion: plain Pressable with opacity feedback ── */
  if (reduced) {
    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) =>
          [style, pressed && ({ opacity: 0.8 } as ViewStyle)] as StyleProp<ViewStyle>
        }
        {...rest}
      >
        {children}
      </Pressable>
    );
  }

  /* ── Normal: AnimatedPressable with spring-scale ── */
  return (
    <AnimatedPressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, animStyle]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
