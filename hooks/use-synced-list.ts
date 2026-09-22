import { useCallback, useEffect, useRef, useState } from 'react';

import { loadData, subscribeToStorage } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';

/**
 * hooks/use-synced-list.ts — синхронізована колекція, яку екран тримає в стані
 * і правит через звичайний `setItems(p => …)`.
 *
 * Чим це відрізняється від ефекту «saveSynced(key, items) на кожну зміну»:
 *
 *  1. Зберігаються лише ЛОКАЛЬНІ зміни — різниця між попереднім і наступним
 *     станом екрана (saveSyncedChanges). Масив екрана більше ніколи не
 *     порівнюється зі сховищем, тож застарілий стан не може «видалити» задачу,
 *     додану на вебі, чи відкотити чужу відмітку «готово».
 *  2. Змінені записи накладаються на свіжий вміст сховища по полях: правка
 *     назви тут і відмітка статусу на вебі обидві доживають.
 *  3. Будь-який запис у ключ повз екран (пул рушія синку, стор таймерів,
 *     інший екран) перечитується одразу — без pull-to-refresh.
 *  4. Перечитане зі сховища не зберігається назад (немає ехо-циклу): такі
 *     масиви позначаються і ефект збереження їх пропускає.
 *
 * Поки локальне збереження в черзі, сигнали сховища не застосовуються — вони
 * відкотили б іще не записану правку. Після останнього збереження екран
 * перечитує ключ, тож пропущений сигнал не губиться.
 */
export interface SyncedList<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  /** Перечитати ключ; не чіпає стан, якщо є незбережена локальна правка. */
  reload: () => Promise<void>;
}

const EMPTY: never[] = [];

export function useSyncedList<T extends { id: string }>(
  key: string,
  options: {
    /** Поки false — нічого не зберігається (дані ще не завантажені). */
    enabled: boolean;
    /** Викликається після кожного завершеного локального збереження. */
    onSaved?: () => void;
  },
): SyncedList<T> {
  const { enabled } = options;
  const [items, setItems] = useState<T[]>(EMPTY);
  /** Стан, від якого рахується наступна локальна зміна. */
  const baselineRef = useRef<T[]>(EMPTY);
  /** Масиви, що прийшли зі сховища, — їх зберігати не треба. */
  const fromStorageRef = useRef(new WeakSet<T[]>());
  /** Скільки локальних збережень поставлено в чергу й ще не завершено. */
  const pendingRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onSavedRef = useRef(options.onSaved);
  useEffect(() => { onSavedRef.current = options.onSaved; });

  const reload = useCallback(async () => {
    if (pendingRef.current > 0) return;
    const raw = await loadData<unknown>(key, []);
    // Поки читали, екран міг поставити своє збереження — тоді застосує його
    // хвіст (див. нижче), а цей знімок уже застарів.
    if (pendingRef.current > 0) return;
    const fresh = (Array.isArray(raw) ? raw : []) as T[];
    fromStorageRef.current.add(fresh);
    const base = baselineRef.current;
    // Чиста функція (жодних записів у ref): стан замінюється лише коли в ньому
    // немає локальної правки, яку ефект збереження ще не підхопив.
    setItems(current => (current === base ? fresh : current));
  }, [key]);

  useEffect(() => {
    if (fromStorageRef.current.has(items)) {
      baselineRef.current = items;
      return;
    }
    if (!enabled) return;
    const before = baselineRef.current;
    if (before === items) return;
    baselineRef.current = items;
    const after = items;

    pendingRef.current += 1;
    queueRef.current = queueRef.current
      .then(async () => {
        await saveSyncedChanges(key, before, after);
        onSavedRef.current?.();
      })
      .catch(e => { if (__DEV__) console.warn(`[${key}] збереження не вдалося:`, e); })
      .finally(() => {
        pendingRef.current -= 1;
        // Останнє збереження в черзі — підтягуємо все, що тим часом записали
        // інші (сигнали сховища під час збереження ігнорувались).
        if (pendingRef.current === 0) {
          reload().catch(e => { if (__DEV__) console.warn(`[${key}] перечитування не вдалося:`, e); });
        }
      });
  }, [items, enabled, key, reload]);

  useEffect(() => subscribeToStorage(changedKey => {
    if (changedKey !== key) return;
    reload().catch(e => { if (__DEV__) console.warn(`[${key}] перечитування не вдалося:`, e); });
  }), [key, reload]);

  return { items, setItems, reload };
}
