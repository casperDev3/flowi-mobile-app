/**
 * components/tasks/ElapsedClock.tsx
 *
 * Годинник, що цокає раз на секунду.
 *
 * Сам тік живе в hooks/use-clock-tick.ts і спільний на весь застосунок — тут
 * лише його показ. Розділення не косметичне: циферблати (components/time/dials)
 * підписуються на той самий тікер, і чотири клітинки повноекранної сітки
 * зобов'язані перемикати секунду РАЗОМ, а не з розбігом у сотні мілісекунд.
 *
 * Мітка часу приходить у рендер ЗНАЧЕННЯМ і передається в `seconds(now)`. Це
 * вимога React Compiler (app.json → experiments.reactCompiler): рендер, який
 * читає Date.now() сам, ні від чого не залежить, і компілятор має право його
 * закешувати — саме так годинники й завмирали до останнього перемальовування
 * екрана.
 */
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useClockTick } from '@/hooks/use-clock-tick';

export interface ElapsedClockProps {
  /** Чи йде відлік. false → інтервал не заводиться. */
  running: boolean;
  /**
   * Скільки секунд показувати на мітку `now`.
   *
   * Мітку ОБОВʼЯЗКОВО треба використати — саме вона робить рендер залежним від
   * часу. `() => elapsedSince(startedAt)` замість `now => elapsedSince(
   * startedAt, now)` поверне правильне число, але застигне на першому ж
   * закешованому рендері.
   */
  seconds: (now: number) => number;
  /** Форматування секунд у рядок годинника. */
  format: (seconds: number) => string;
  style?: StyleProp<TextStyle>;
}

export function ElapsedClock({ running, seconds, format, style }: ElapsedClockProps) {
  const tick = useClockTick(running);
  return <Text style={style}>{format(seconds(tick))}</Text>;
}
