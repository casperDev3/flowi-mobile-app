/**
 * hooks/use-reduce-motion.ts
 *
 * Чи ввімкнено системне «Зменшення руху» — З ПІДПИСКОЮ на зміну.
 *
 * Навіщо окремо від useMotion(). Reanimated читає прапорець рівно один раз,
 * коли завантажується модуль:
 *
 *   // node_modules/react-native-reanimated/lib/module/hook/useReducedMotion.js
 *   const IS_REDUCED_MOTION_ENABLED_IN_SYSTEM = isReducedMotionEnabledInSystem();
 *   export function useReducedMotion() { return IS_REDUCED_MOTION_ENABLED_IN_SYSTEM; }
 *
 * і сам документує: «Changing the reduced motion system setting doesn't cause
 * your components to rerender». Для разової анімації входу цього досить —
 * її або програють, або ні. Для НЕСКІНЧЕННОГО циклу (Skeleton) цього мало:
 * користувач лізе в налаштування саме тоді, коли рух уже перед очима, і
 * повертається в застосунок, де все так само блимає.
 *
 * Тому тут — AccessibilityInfo з підпискою. useMotion() лишається робочим
 * інструментом для всього іншого; цей хук потрібен тільки там, де анімація
 * триває довше за один екран.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  // Початкове false = анімації ввімкнено. Прочитати прапорець синхронно не
  // можна (нативний виклик віддає Promise), тож перший кадр завжди такий;
  // помилятися краще в бік «як було», а не в бік «мовчки без анімації».
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (alive) setReduced(Boolean(value)); })
      // Платформа без підтримки прапорця — лишаємо анімації, а не падаємо.
      .catch(() => { /* no-op */ });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      setReduced(Boolean(value));
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
