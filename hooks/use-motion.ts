/**
 * hooks/use-motion.ts
 *
 * Хук useMotion() — обгортка над useReducedMotion() з reanimated.
 * Повертає { reduced, dur, entering, spring }:
 *   - reduced  → true якщо Reduce Motion увімкнено в системі
 *   - dur(d)   → 0 якщо reduced, інакше d (мілісекунди)
 *   - entering(anim) → undefined якщо reduced, інакше anim
 *   - spring(cfg)    → cfg без змін (використовуй dur окремо)
 *
 * getReducedMotion() — синхронний не-hook аксесор для місць поза React.
 * Значення кешується після першого рендеру компонента, що використовує useMotion().
 * До першого монтування повертає false (анімації ввімкнено) — це безпечно.
 */
import { useReducedMotion } from 'react-native-reanimated';

import { Motion } from '@/constants/motion';

// Модульний кеш: оновлюється при кожному виклику useMotion().
let _reducedMotionCached = false;

/**
 * Синхронний не-hook аксесор для не-React місць.
 * Безпечний після першого рендеру компонента з useMotion().
 */
export function getReducedMotion(): boolean {
  return _reducedMotionCached;
}

export type MotionAPI = ReturnType<typeof useMotion>;

export function useMotion() {
  const reduced = useReducedMotion();
  _reducedMotionCached = reduced;

  return {
    reduced,
    /** Повертає тривалість або 0 якщо reduced motion увімкнено. */
    dur(d: number): number {
      return reduced ? 0 : d;
    },
    /**
     * Повертає animation builder або undefined якщо reduced motion увімкнено.
     * Використовується для обох `entering` і `exiting` пропів Animated.View.
     */
    entering<T>(anim: T): T | undefined {
      return reduced ? undefined : anim;
    },
    /**
     * Повертає spring-конфіг без змін.
     * (Reduced motion не стосується spring — використовуй dur() окремо.)
     */
    spring<T extends object>(cfg: T): T {
      return cfg;
    },
  } as const;
}

// Re-export Motion для зручності
export { Motion };
