/**
 * store/storage-lock.ts — черга read-modify-write на ключ сховища.
 *
 * AsyncStorage не має транзакцій: «прочитати масив → змінити → записати» з
 * двох місць одночасно (рушій синку застосовує серверні зміни, екран зберігає
 * свою правку) закінчується тим, що пізніший запис затирає ранній — той, хто
 * прочитав першим, пише масив без чужої зміни.
 *
 * `withStorageLock(key, fn)` виконує `fn` лише після того, як завершились усі
 * раніше поставлені в чергу операції того самого ключа. Різні ключі одне
 * одного не чекають. Блокування НЕ реентерабельне: усередині `fn` не можна
 * знову брати той самий ключ — це дедлок.
 *
 * Окремий модуль, а не частина storage.ts: тести мокають storage цілком, і
 * нова функція там ламала б кожен такий мок.
 */

const tails = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  // Помилка попередньої операції не має блокувати наступну.
  const run = previous.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    // Прибираємо хвіст, лише якщо за ним ніхто не встав — інакше мапа росла б.
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
