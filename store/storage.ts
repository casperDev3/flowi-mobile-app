import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Слухач записів у сховище.
 *
 * Потрібен тому, що сховище — не єдине джерело правди для екранів: вони
 * тримають дані у React-стані, а писати в ключ можуть і повз них — рушій
 * синхронізації (застосування чужих змін), міграції, відновлення бекапу,
 * «очистити всі дані». Без сигналу такий запис лишається невидимим, і
 * наступне збереження зі старого стану затирає його.
 *
 * Разом із ключем слухач отримує НЕОБОВʼЯЗКОВЕ джерело запису — `StorageOrigin`.
 */

/**
 * Хто саме записав ключ — довільна мітка, яку джерело запису придумує собі
 * само (`useStorageRefresh` бере лічильник власних записів, рушій синку —
 * свою назву). Значення нікуди не зберігається й ні з чим не звіряється:
 * підписник лише порівнює його зі СВОЄЮ міткою.
 *
 * Навіщо. Слухач, що сам пише в ті самі ключі, мусить розрізняти два сигнали,
 * які досі виглядали однаково: «долетів мій власний запис» (перечитувати не
 * можна — відкотить щойно збережений стан) і «в той самий ключ написав хтось
 * інший, поки мій запис був у польоті» (перечитати ТРЕБА, інакше зміна
 * лишиться невидимою до наступного фокуса). Без джерела єдиний доступний
 * спосіб розрізнення — ключ: усе, що прилітає в «мій» ключ під час мого
 * запису, вважається моїм і глушиться разом із чужим.
 *
 * `undefined` означає «джерело не назвалось» — так поводяться всі наявні
 * викликачі, і для них нічого не змінюється.
 */
export type StorageOrigin = string;

type StorageListener = (key: string, origin?: StorageOrigin) => void;

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
 *
 * `origin` (необовʼязковий) — мітка джерела запису, див. `StorageOrigin`.
 */
export function notifyStorageChanged(key: string, origin?: StorageOrigin): void {
  // Ключ змінився ПОВЗ saveData (multiRemove у «очистити всі дані», зміна
  // workspace) — байтів, на яких спіткнулось читання, більше немає, тож
  // позначку збою знімаємо: інакше після очищення даних запис у цей ключ
  // лишався б заблокованим до перезапуску застосунку.
  readFailures.delete(key);
  // Копія набору: слухач має право відписатися просто з колбека.
  for (const listener of [...listeners]) {
    try {
      listener(key, origin);
    } catch (e) {
      if (__DEV__) console.warn(`[storage] слухач ${key} впав:`, e);
    }
  }
}

/**
 * Ключі, останнє читання яких провалилось. Доки збій не визнано явно, запис у
 * такий ключ заблоковано: будь-який масив, порахований з `fallback`, затер би
 * дані, які ще лежать у сховищі.
 *
 * Позначка НАВМИСНО не знімається просто успішним читанням: успішно перечитати
 * ключ може зовсім інший викликач (рушій синку, сусідній екран), а екран, що
 * отримав `fallback`, далі тримає порожній масив у стані — і саме його запис
 * знищував дані. Знімають позначку: `retryStorageRead` (кнопка «повторити»),
 * `clearStorageReadFailure`, `removeData`, успішний примусовий запис
 * (`{ force: true }`) і `notifyStorageChanged` (ключ змінили повз saveData).
 */
const readFailures = new Map<string, unknown>();

/**
 * Результат читання ключа. Головна відмінність від `loadData`: «ключа немає»
 * (`ok: true, found: false`) і «прочитати не вдалося» (`ok: false`) — це два
 * різні результати, а не однакове `fallback`.
 *
 * Навіщо: раніше зіпсований JSON, обірваний запис або «Row too big to fit into
 * CursorWindow» віддавали екрану порожній масив, екран малював звичайний
 * порожній стан, а його ефект-дзеркало одразу писало цей порожній масив назад —
 * і ще читабельні байти знищувались. Екран, що читає через `loadDataResult`,
 * бачить `ok: false` і мусить показати помилку з повтором, а не порожній стан.
 */
export type StorageReadResult<T> =
  | { ok: true; value: T; found: boolean }
  | { ok: false; value: T; found: false; error: unknown };


/** Запис заблоковано, бо останнє читання цього ключа провалилось (ERR-01). */
export class StorageWriteBlockedError extends Error {
  readonly key: string;
  readonly readError: unknown;
  constructor(key: string, readError: unknown) {
    super(
      `[storage] запис у '${key}' заблоковано: останнє читання ключа провалилось. `
      + 'Спочатку перечитайте ключ (loadDataResult) або пишіть із { force: true }.',
    );
    this.name = 'StorageWriteBlockedError';
    this.key = key;
    this.readError = readError;
  }
}

/** Чи провалилось останнє читання ключа (екран показує помилку, а не «порожньо»). */
export function hasStorageReadFailure(key: string): boolean {
  return readFailures.has(key);
}

/** Помилка останнього проваленого читання ключа — для діагностики й повтору. */
export function getStorageReadFailure(key: string): unknown {
  return readFailures.get(key);
}

/**
 * Знімає позначку «читання провалилось». Викликати лише там, де дані ключа
 * свідомо замінюються цілком (відновлення з копії, «очистити всі дані»).
 */
export function clearStorageReadFailure(key: string): void {
  readFailures.delete(key);
}

/**
 * Повторне читання після збою — те, що стоїть за кнопкою «повторити».
 * Знімає позначку й читає наново: вдалося — ключ знову можна писати, ні —
 * позначка стає назад.
 */
export async function retryStorageRead<T>(key: string, fallback: T): Promise<StorageReadResult<T>> {
  readFailures.delete(key);
  return loadDataResult<T>(key, fallback);
}

/**
 * Читання, що РОЗРІЗНЯЄ «немає» і «не вдалося». Успіх знімає позначку збою,
 * провал — ставить її й блокує наступний запис у цей ключ.
 */
export async function loadDataResult<T>(key: string, fallback: T): Promise<StorageReadResult<T>> {
  try {
    const json = await AsyncStorage.getItem(key);
    // `!json` (а не `== null`) — точно та сама умова, що була в loadData:
    // порожній рядок теж означає «значення немає».
    if (!json) return { ok: true, value: fallback, found: false };
    return { ok: true, value: JSON.parse(json) as T, found: true };
  } catch (e) {
    readFailures.set(key, e);
    if (__DEV__) console.warn(`[storage] loadData(${key}) failed:`, e);
    return { ok: false, value: fallback, found: false, error: e };
  }
}

/**
 * Сумісна обгортка: на збої віддає `fallback`, як і раніше, — щоб ~14 екранів
 * не довелося правити одночасно. АЛЕ збій тепер не безслідний: ключ
 * позначається, і наступний `saveData` у нього кидає `StorageWriteBlockedError`
 * замість того, щоб мовчки затерти дані порожнім масивом.
 *
 * Новий код має читати через `loadDataResult` і показувати помилку з повтором.
 */
export async function loadData<T>(key: string, fallback: T): Promise<T> {
  return (await loadDataResult<T>(key, fallback)).value;
}

export interface SaveOptions {
  /**
   * Писати навіть у ключ із проваленим читанням. Тільки для даних, що НЕ
   * похідні від цього читання: відновлення з резервної копії, імпорт,
   * «очистити всі дані». Успішний примусовий запис знімає позначку.
   */
  force?: boolean;
  /**
   * Мітка джерела (`StorageOrigin`), яка приїде підписникам разом із ключем.
   * Без неї сигнал анонімний — рівно те, що було тут завжди.
   */
  origin?: StorageOrigin;
}

export async function saveData(key: string, data: unknown, options?: SaveOptions): Promise<void> {
  if (!options?.force && readFailures.has(key)) {
    // Саме тут гинули дані: масив, порахований з fallback після проваленого
    // читання, лягав поверх ще читабельних байтів.
    throw new StorageWriteBlockedError(key, readFailures.get(key));
  }
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    if (__DEV__) console.warn(`[storage] saveData(${key}) failed:`, e);
    return;
  }
  readFailures.delete(key);
  notifyStorageChanged(key, options?.origin);
}

/**
 * Той самий запис, але ПРОКИДАЄ помилку сховища нагору. Для місць, де «не
 * записалось» мусить бути видно користувачу (відновлення з копії, імпорт):
 * `saveData` там показував би «Успішно · Дані відновлено» навіть тоді, коли не
 * записано жодного ключа.
 */
export async function saveDataChecked(key: string, data: unknown, options?: SaveOptions): Promise<void> {
  if (!options?.force && readFailures.has(key)) {
    throw new StorageWriteBlockedError(key, readFailures.get(key));
  }
  await AsyncStorage.setItem(key, JSON.stringify(data));
  readFailures.delete(key);
  notifyStorageChanged(key, options?.origin);
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
export async function removeData(key: string, options?: { origin?: StorageOrigin }): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (e) {
    if (__DEV__) console.warn(`[storage] removeData(${key}) failed:`, e);
    return;
  }
  // Ключа більше немає — нічого затирати, позначку «читання провалилось»
  // знімаємо, інакше запис у щойно очищений ключ лишався б заблокованим.
  readFailures.delete(key);
  notifyStorageChanged(key, options?.origin);
}
