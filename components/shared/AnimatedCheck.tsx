/**
 * components/shared/AnimatedCheck.tsx
 *
 * Анімований кружечок-чекбокс:
 * — checked=true  → withSequence(withSpring 1.25 bouncy, withSpring 1 default) + галочка FadeIn
 * — checked=false → scale повертається до 1, галочка FadeOut (withTiming fast)
 * — reduced motion → без анімацій, стан змінюється миттєво
 *
 * Якщо onPress відсутній — read-only View (без Pressable), для archive.tsx тощо.
 */
import React, { useEffect } from 'react';
import type { AccessibilityRole, AccessibilityState, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';
import { IconSymbol } from '@/components/ui/icon-symbol';

export interface AnimatedCheckProps {
  /** Current checked state. */
  checked: boolean;
  /** Outer diameter in points. Default 22. */
  size?: number;
  /** Fill colour (and border when checked). Default '#10B981'. */
  color?: string;
  /** Border colour when unchecked. Defaults to `color + '80'`. */
  borderColor?: string;
  /** Checkmark icon size (points). Defaults to `Math.round(size * 0.52)`. */
  iconSize?: number;
  /** Corner radius. Defaults to `Math.round(size * 0.32)`. */
  radius?: number;
  /**
   * Press handler. When provided the circle is wrapped in a Pressable.
   * When absent the component is read-only (e.g. archive).
   */
  onPress?: () => void;
  /** Extra style for the outer animated circle view. */
  style?: StyleProp<ViewStyle>;
  /* Accessibility */
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityHint?: string;
  hitSlop?: { top?: number; bottom?: number; left?: number; right?: number };
}

export function AnimatedCheck({
  checked,
  size = 22,
  color = '#10B981',
  borderColor,
  iconSize: iconSizeProp,
  radius,
  onPress,
  style,
  accessibilityLabel,
  accessibilityRole = 'checkbox',
  accessibilityState,
  accessibilityHint,
  hitSlop,
}: AnimatedCheckProps) {
  const { reduced } = useMotion();

  const scale        = useSharedValue(1);
  const checkOpacity = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    if (checked) {
      if (reduced) {
        scale.value        = 1;
        checkOpacity.value = 1;
      } else {
        /* Bounce in */
        scale.value = withSequence(
          withSpring(1.25, Motion.spring.bouncy),
          withSpring(1,    Motion.spring.default),
        );
        checkOpacity.value = withTiming(1, { duration: Motion.duration.fast });
      }
    } else {
      scale.value        = 1; // no scale animation on uncheck
      checkOpacity.value = reduced
        ? 0
        : withTiming(0, { duration: Motion.duration.fast });
    }
    // `reduced` intentionally omitted: effect only re-runs when `checked` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);

  const circleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
  }));

  const r     = radius    ?? Math.round(size * 0.32);
  const iSize = iconSizeProp ?? Math.round(size * 0.52);
  const bColor = borderColor ?? color + '80';

  const circle = (
    <Animated.View
      style={[
        {
          width:           size,
          height:          size,
          borderRadius:    r,
          borderWidth:     1.5,
          alignItems:      'center',
          justifyContent:  'center',
          borderColor:     checked ? color : bColor,
          backgroundColor: checked ? color : 'transparent',
        } as ViewStyle,
        circleStyle,
        style,
      ]}>
      <Animated.View style={checkStyle}>
        <IconSymbol name="checkmark" size={iSize} color="#fff" />
      </Animated.View>
    </Animated.View>
  );

  if (!onPress) return circle;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState ?? { checked }}
      accessibilityHint={accessibilityHint}>
      {circle}
    </Pressable>
  );
}
