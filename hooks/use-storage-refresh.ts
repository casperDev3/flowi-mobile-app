import { useCallback, useEffect, useRef } from 'react';

import { subscribeToStorage } from '@/store/storage';

/**
 * hooks/use-storage-refresh.ts — перечитати сховище, коли в нього записали
 * повз екран.
 *
 * `useFocusEffect` перечитує лише на вході на екран. Але поки екран
 * ВІДКРИТИЙ, у ключ пишуть і інші: рушій синхронізації (чужі зміни з іншого
 * пристрою), відновлення бекапу, сусідній екран. Без цієї підписки такий
 * запис лишається невидимим доти, доки користувач сам не піде й не
 * повернеться — рівно те, на що скаржились: «фінанси не отримуються всі
 * актуальні операції».
 *
 * Повертає `trackWrite` — обгортку для ВЛАСНИХ записів екрана. Поки такий
 * запис у польоті, сигнал від нього ж ігнорується: інакше збереження стану
 * піднімало б перечитування, те — новий стан, а той — знову збереження.
 */
export function useStorageRefresh(
  keys: readonly string[],
  reload: () => void | Promise<unknown>,
  enabled = true,
): <T>(write: () => Promise<T>) => Promise<T> {
  const writesInFlight = useRef(0);
  const reloadRef = useRef(reload);
  const keysRef = useRef(keys);

  // Через ref, а не через залежності ефекту: `reload` і масив ключів
  // перестворюються щорендера, і підписка перечіплювалась би без потреби.
  useEffect(() => {
    reloadRef.current = reload;
    keysRef.current = keys;
  });

  useEffect(() => {
    if (!enabled) return;
    return subscribeToStorage(key => {
      if (!keysRef.current.includes(key)) return;
      // Власний запис ще не долетів до сховища — перечитування відкотило б
      // його назад.
      if (writesInFlight.current > 0) return;
      try {
        void Promise.resolve(reloadRef.current()).catch(e => {
          if (__DEV__) console.warn(`[storage] перечитування ${key} впало:`, e);
        });
      } catch (e) {
        if (__DEV__) console.warn(`[storage] перечитування ${key} впало:`, e);
      }
    });
  }, [enabled]);

  return useCallback(async <T,>(write: () => Promise<T>): Promise<T> => {
    writesInFlight.current += 1;
    try {
      return await write();
    } finally {
      writesInFlight.current -= 1;
    }
  }, []);
}
