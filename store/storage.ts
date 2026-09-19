import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Слухач записів у сховище.
 *
 * Потрібен тому, що сховище — не єдине джерело правди для екранів: вони
 * тримають дані у React-стані, а писати в ключ можуть і повз них — рушій
 * синхронізації (застосування чужих змін), міграції, відновлення бекапу,
 * «очистити всі дані». Без сигналу такий запис лишається невидимим, і
 * наступне збереження зі старого стану затирає його.
 */
type StorageListener = (key: string) => void;

const listeners = new Set<StorageListener>();

/** Повертає функцію відписки — викликати з cleanup ефекту. */
export function subscribeToStorage(listener: StorageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Сигнал про зміну ключа повз saveData — наприклад, після
 * AsyncStorage.multiRemove в «очистити всі дані».
 */
export function notifyStorageChanged(key: string): void {
  // Копія набору: слухач має право відписатися просто з колбека.
  for (const listener of [...listeners]) {
    try {
      listener(key);
    } catch (e) {
      if (__DEV__) console.warn(`[storage] слухач ${key} впав:`, e);
    }
  }
}

export async function loadData<T>(key: string, fallback: T): Promise<T> {
  try {
    const json = await AsyncStorage.getItem(key);
    if (!json) return fallback;
    return JSON.parse(json) as T;
  } catch (e) {
    if (__DEV__) console.warn(`[storage] loadData(${key}) failed:`, e);
    return fallback;
  }
}

export async function saveData(key: string, data: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (__DEV__) console.warn(`[storage] saveData(${key}) failed:`, e);
    return;
  }
  notifyStorageChanged(key);
}

/**
 * Прибирає ключ ЦІЛКОМ (а не `saveData(key, null)`): останній пише рядок
 * `"null"`, і `loadData` — бо вважає «нема даних» лише порожній рядок від
 * AsyncStorage — повертав би СПРАВЖНІЙ `null` замість fallback усім читачам,
 * а не «значення відсутнє». Для singleton-ключів (`SYNC_SINGLETON_KEYS`)
 * читачі саме на `undefined` перевіряють «є локальні дані» (`hasAnyLocalData`,
 * `generateFullOutbox` у `store/sync-engine.tsx`) — `saveData(key, null)` там
 * лишав би щойно стертий singleton «локальними даними» назавжди.
 */
export async function removeData(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    if (__DEV__) console.warn(`[storage] removeData(${key}) failed:`, e);
    return;
  }
  notifyStorageChanged(key);
}
