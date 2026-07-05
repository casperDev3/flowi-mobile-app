/**
 * constants/motion.ts
 *
 * Централізовані motion-токени для всього додатку.
 * Використовуй через useMotion() (hook) або Motion.* (константи).
 */
import { Easing } from 'react-native-reanimated';

export const Motion = {
  duration: {
    fast:   150,
    normal: 250,
    slow:   400,
  },
  spring: {
    default: { damping: 18, stiffness: 200 },
    bouncy:  { damping: 12, stiffness: 180 },
    gentle:  { damping: 22, stiffness: 120 },
  },
  easing: {
    out:   Easing.out(Easing.cubic),
    inOut: Easing.inOut(Easing.quad),
  },
} as const;
