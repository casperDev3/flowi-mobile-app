/** Client-side compatibility declaration for the server sync contract. */
export const SYNC_CONTRACT_VERSION = 2;

export const SYNC_ARRAY_KEYS = [
  'tasks',
  'task_statuses',
  'transactions',
  'time_entries',
  'notes',
  'projects',
  'meetings',
  'health_entries_v2',
  'workouts',
  'exercises',
  'workout_programs',
  'savings_jars',
  // Рахунок — місце, де лежать гроші (готівка / картка / заощадження). Окрема
  // сутність, бо валюта належить саме йому, а не операції: операція лише
  // рухає гроші, і перевішувати валюту на неї означало б, що те саме місце
  // може мати дві валюти одночасно.
  //
  // Окремої колекції для переказів навмисно немає: переказ — ЦЕ транзакція
  // (type='transfer') із двома рахунками. Пара «витрата+дохід» чи дві половини
  // в різних колекціях зливалися б за LWW поодинці, і стан «доїхала лише
  // витрата» — цілком реальний — просто знищив би гроші.
  //
  // Колекція адитивна, тому SYNC_CONTRACT_VERSION лишається 2.
  'accounts',
  'containers',
  'bugs',
  'ideas',
  'health_meds',
  'health_checkups',
  'health_vaccines',
  'health_habits',
  // Нормалізовані з singleton-блобів. Їхні id ПОХІДНІ від природного ключа
  // (код валюти / назва категорії), а не випадкові: інакше два пристрої,
  // додавши офлайн одну й ту саму валюту, згенерували б різні id і після
  // синку отримали б дублікат замість злиття.
  'budget_limits',
  'finance_currencies',
  'finance_balance_adjustments',
  'categories',
  // Таймери, що йдуть просто зараз. id теж ПОХІДНИЙ — `task:<taskId>` для
  // таймера завдання: старт того самого завдання на двох пристроях мусить
  // зійтися в один запис за LWW, а не дати два паралельні дублікати, з яких
  // зупинка одного лишила б другий вічно активним. Вільні таймери природного
  // ключа не мають (дві сесії «Читання» — це справді дві сесії), тож там id
  // випадковий. Колекція адитивна, тому версія контракту лишається 2.
  'active_timers',
] as const;

export type SyncArrayKey = (typeof SYNC_ARRAY_KEYS)[number];

export const SYNC_SINGLETON_KEYS = [
  // Справжній скаляр — повна заміна коректна за визначенням.
  'finance_primary_currency',
  // Профіль здоров'я і перемикачі нагадувань. Це справжні об'єкти, а не
  // колекції: окремих записів, які можна було б зливати, у них немає.
  //
  // Без синхронізації новий клієнт не мав профілю, і healthUtils рахував TDEE,
  // норму білка, води та зони ІМТ із дефолтів — користувач бачив не
  // «порожньо», а НЕПРАВИЛЬНІ цифри.
  'health_profile',
  'health_reminders',
] as const;

export type SyncSingletonKey = (typeof SYNC_SINGLETON_KEYS)[number];

export function assertCompatibleSyncContract(serverVersion: unknown): void {
  // Поблажливість до відповіді без версії прибрана разом з обнуленням даних
  // (фаза 11). Вона існувала для rolling-деплою, коли на сервері могла лишатись
  // версія без цього поля. Тепер такого сервера не існує, а сама поблажливість
  // маскувала б розсинхрон версій: клієнт мовчки застосовував би дані від
  // сервера, який не вміє того, на що клієнт розраховує.
  if (serverVersion !== SYNC_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported sync contract ${String(serverVersion)}; client supports ${SYNC_CONTRACT_VERSION}`,
    );
  }
}
