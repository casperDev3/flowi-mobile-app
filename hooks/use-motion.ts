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
 * Значення кешується після першого КОМІТУ компонента, що використовує useMotion().
 * До першого монтування повертає false (анімації ввімкнено) — це безпечно.
 */
import { useEffect, useMemo } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { Motion } from '@/constants/motion';

// Модульний кеш: оновлюється в ЕФЕКТІ useMotion() (не в тілі рендера).
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

  // Кеш оновлюється в ефекті, а не в тілі: присвоєння модульної змінної під
  // час рендера — побічна дія, на якій React Compiler бейлаутить увесь
  // компонент («Cannot reassign variables declared outside of the
  // component/hook»), а з ним і все, що цей компонент рендерить.
  useEffect(() => { _reducedMotionCached = reduced; }, [reduced]);

  // useMemo, бо об'єкт їде пропом у мемоізовані картки списку
  // (`TaskListItem`, `TodayTaskRow`): новий об'єкт щорендера провалює
  // shallow-порівняння React.memo і перемальовує ВСІ видимі картки на
  // кожне натискання клавіші в пошуку. Ключ один — `reduced`; решта полів
  // від нього ж і залежить.
  return useMemo(() => ({
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
  } as const), [reduced]);
}

// Re-export Motion для зручності
export { Motion };
