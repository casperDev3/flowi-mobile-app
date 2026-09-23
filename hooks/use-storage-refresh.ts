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
 *
 * ЧУЖИЙ сигнал, що прилетів у те саме вікно, більше не губиться: він
 * ЗАПАМʼЯТОВУЄТЬСЯ і програється, щойно власні записи завершились (раніше
 * такий сигнал просто відкидався — а обмін проєкту цілком може дописати
 * `tasks`/`sprints` саме тоді, коли користувач відмічає задачу, і екран
 * лишався зі старим списком до наступного фокуса).
 *
 * Що вважати «своїм» ключем, вирішує сам виклик: `trackWrite(write, ['tasks'])`
 * каже, що цей запис торкається лише `tasks`, тож сигнали решти
 * прослуховуваних ключів у цьому вікні — чужі й програються. Без другого
 * аргументу своїми вважаються ВСІ прослуховувані ключі (поведінка, яка була
 * тут завжди): екран, що не уточнив, чого саме торкається його запис, не
 * повинен раптом почати перечитувати себе після кожного збереження.
 */
export function useStorageRefresh(
  keys: readonly string[],
  /** Отримує ключ, що змінився, — можна перечитати лише його. */
  reload: (key: string) => void | Promise<unknown>,
  enabled = true,
): <T>(write: () => Promise<T>, ownKeys?: readonly string[]) => Promise<T> {
  const writesInFlight = useRef(0);
  /** Ключі, чиї сигнали прилетіли під час власного запису і ще не програні. */
  const missedKeys = useRef(new Set<string>());
  /** Ключі, які оголосили «своїми» записи, що зараз у польоті. */
  const ownKeysInFlight = useRef(new Set<string>());
  const reloadRef = useRef(reload);
  const keysRef = useRef(keys);

  // Через ref, а не через залежності ефекту: `reload` і масив ключів
  // перестворюються щорендера, і підписка перечіплювалась би без потреби.
  useEffect(() => {
    reloadRef.current = reload;
    keysRef.current = keys;
  });

  const runReload = useCallback((key: string) => {
    try {
      void Promise.resolve(reloadRef.current(key)).catch(e => {
        if (__DEV__) console.warn(`[storage] перечитування ${key} впало:`, e);
      });
    } catch (e) {
      if (__DEV__) console.warn(`[storage] перечитування ${key} впало:`, e);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return subscribeToStorage(key => {
      if (!keysRef.current.includes(key)) return;
      // Власний запис ще не долетів до сховища — перечитування відкотило б
      // його назад. Чужий ключ у тому ж вікні відкладаємо до кінця запису,
      // свій — відкидаємо (це наш же сигнал).
      if (writesInFlight.current > 0) {
        if (!ownKeysInFlight.current.has(key)) missedKeys.current.add(key);
        return;
      }
      runReload(key);
    });
  }, [enabled, runReload]);

  return useCallback(async <T,>(write: () => Promise<T>, ownKeys?: readonly string[]): Promise<T> => {
    const declared = ownKeys ?? keysRef.current;
    for (const key of declared) ownKeysInFlight.current.add(key);
    writesInFlight.current += 1;
    try {
      return await write();
    } finally {
      writesInFlight.current -= 1;
      if (writesInFlight.current === 0) {
        ownKeysInFlight.current.clear();
        // Програємо пропущене саме ТУТ, а не під час запису: на цю мить
        // власний запис уже в сховищі, тож перечитування його не відкотить.
        const missed = [...missedKeys.current];
        missedKeys.current.clear();
        for (const key of missed) runReload(key);
      }
    }
  }, [runReload]);
}
