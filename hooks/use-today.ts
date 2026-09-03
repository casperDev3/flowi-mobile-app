/**
 * hooks/use-today.ts
 *
 * «Сьогодні», що не застигає.
 *
 * `const today = new Date()` на рівні модуля фіксується в момент ІМПОРТУ —
 * тобто на першому відкритті екрана за весь запуск застосунку. Доки це
 * значення вирішувало лише ПІДПИС групи, вада була косметична. Відколи те
 * саме «сьогодні» вирішує, у яку секцію завдання взагалі потрапить
 * (utils/taskListSections.ts), ціна інша: у застосунку, не закритому через
 * північ, завдання з дедлайном на реальне сьогодні випадає зі статусних груп
 * і рендериться окремою секцією з підписом «Завтра» — і водночас isOverdue у
 * тій самій функції звіряється з реальним new Date(). Дві половини одного
 * правила живуть у різних добах.
 *
 * Оновлюємось на поверненні застосунку з фону і на фокусі екрана, а не раз на
 * секунду: дата міняється раз на добу, і тримати заради неї тікер
 * (hooks/use-clock-tick.ts) немає сенсу.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { isSameDay } from '@/utils/dateUtils';

/**
 * Момент часу, а не північ: так значення лишається взаємозамінним із
 * попереднім `new Date()` скрізь, де його вже читають (підписи груп рахують
 * різницю в мілісекундах, а не в добах).
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date());

  const refresh = useCallback(() => {
    // Нове посилання лише коли доба СПРАВДІ змінилась. Інакше кожен фокус
    // екрана віддавав би новий Date і скидав усі мемоізації, що від нього
    // залежать, — тобто перебирав би весь список на кожне повернення.
    setToday(prev => (isSameDay(prev, new Date()) ? prev : new Date()));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useFocusEffect(refresh);

  return today;
}
