/**
 * components/time/dials/shared.ts — спільний контракт циферблатів.
 *
 * Кожен циферблат сам підписується на тікер (useClockTick) і сам рахує час від
 * startedAt. Передавати йому готові секунди пропом було б помилкою: тоді
 * щосекунди перемальовувався б батько, тобто вся сітка з чотирьох клітинок і
 * підзавданнями, замість одного вузла всередині клітинки.
 */
import type { TextStyle } from 'react-native';

export interface DialColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export interface DialProps {
  /** ISO-мітка старту сесії — єдине джерело часу. */
  startedAt: string;
  /**
   * Полотно циферблата: коротша сторона доступного місця. Кожен варіант сам
   * вирішує, як його витратити — колу потрібен квадрат, лінійці ширина.
   */
  size: number;
  colors: DialColors;
}

/** Табличні цифри — інакше ширина розрядів гуляє і рядок сіпається щосекунди. */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export const pad = (n: number): string => String(n).padStart(2, '0');

/** Частки поточної хвилини / години / півдоби — для дуг, стрілок і орбіт. */
export function cycles(seconds: number) {
  return {
    second: (seconds % 60) / 60,
    minute: (seconds % 3600) / 3600,
    hour: (seconds % 43200) / 43200,
  };
}
