/**
 * components/tasks/ElapsedClock.tsx
 *
 * Годинник, що цокає раз на секунду.
 *
 * Тік навмисно живе тут, а не в екрані. Раніше екран тримав лічильник
 * timerTick у власному стані єдино заради того, щоб перемалювати цей
 * рядок — і разом із ним щосекунди перебудовував увесь свій рендер,
 * включно зі списком завдань і деталлю. Тепер щосекунди оновлюється
 * рівно один текстовий вузол.
 *
 * Коли таймер стоїть, інтервалу немає взагалі: показане число вже не
 * змінюється, і будити застосунок раз на секунду нема сенсу.
 */
import React, { useEffect, useState } from 'react';
import { AppState, Text, type StyleProp, type TextStyle } from 'react-native';

export interface ElapsedClockProps {
  /** Чи йде відлік. false → інтервал не заводиться. */
  running: boolean;
  /**
   * Скільки секунд показувати ЗАРАЗ. Викликається на кожному тіку, тож
   * має читати актуальний стан, а не замикати давнє значення.
   */
  seconds: () => number;
  /** Форматування секунд у рядок годинника. */
  format: (seconds: number) => string;
  style?: StyleProp<TextStyle>;
}

export function ElapsedClock({ running, seconds, format, style }: ElapsedClockProps) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // У фоні інтервали не працюють, тож після повернення показане число
  // відстає рівно на час відсутності. Один примусовий перерахунок його
  // наздоганяє; чекати до наступного тіку означало б показати брехню.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') tick(n => n + 1);
    });
    return () => sub.remove();
  }, []);

  return <Text style={style}>{format(seconds())}</Text>;
}
