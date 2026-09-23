/**
 * hooks/use-today-key.ts — ключ сьогоднішньої дати ('YYYY-MM-DD'), що НЕ застигає.
 *
 * Звідси й був баг «Найближчі оплати зʼявляються лише після нагадування».
 * `today` рахувався разом із читанням сховища, тобто лише на фокусі екрана. Але
 * застосунок, згорнутий увечері й розгорнутий наступного дня, фокус НЕ
 * переотримує: `useFocusEffect` спрацьовує на вхід на екран, а екран з нього й
 * не виходив. Тож секція лишалась із учорашнім «сьогодні»: підписка з оплатою
 * на сьогодні не проходила поріг `nextPaymentDate <= today + 7` (для
 * відпрацьованих циклів — навпаки, висіла простроченою), і все ставало на
 * місце аж коли нагадування піднімало застосунок і давало фокус. Звідси три
 * джерела оновлення замість одного: фокус, повернення з фону і перехід через
 * північ при відкритому екрані.
 *
 * Нове значення ставиться ЛИШЕ коли доба справді змінилась: інакше кожне
 * повернення з фону скидало б мемоізацію списків, що від ключа залежать.
 *
 * Вебовий двійник — flowi-web-app/lib/use-today-key.ts (та сама назва й та сама
 * північна логіка через msUntilNextDay).
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDateKey } from '@/utils/dateUtils';

/**
 * Скільки мілісекунд до першої секунди наступної локальної доби (не менше 1с).
 *
 * Ціль — 00:00:01, а не рівно північ: годинник пристрою може розбудити
 * setTimeout на мілісекунду раніше, і дата тоді ще не зміниться.
 */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}

export function useTodayKey(): string {
  const [today, setToday] = useState(() => localDateKey(new Date()));

  const sync = useCallback(() => {
    setToday(prev => {
      const next = localDateKey(new Date());
      return prev === next ? prev : next;
    });
  }, []);

  useFocusEffect(sync);

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [sync]);

  // Північ при відкритому екрані. Таймер переозброюється сам, а не через
  // залежність від `today`: якщо він прокинеться ще у старій добі, таймер, що
  // чекав би саме на зміну дати, більше не поставився б ніколи.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => { sync(); arm(); }, msUntilNextDay(new Date()));
    };
    arm();
    return () => clearTimeout(timer);
  }, [sync]);

  return today;
}
