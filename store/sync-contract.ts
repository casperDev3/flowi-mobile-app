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
  // Спринт — іменована група завдань усередині проєкту (sprint.projectId).
  // Дат у нього немає навмисно: у часі завдання тримає лише власний deadline,
  // тож «Сьогодні» рахується так само, як і до спринтів.
  //
  // Належність лежить на ЗАВДАННІ (task.sprintId), а не масивом id у спринті:
  // масив — це один запис, і два пристрої, що офлайн поклали в спринт різні
  // завдання, переписали б його цілком, а LWW лишив би тільки пізнішу правку.
  // Поле на завданні робить із тих самих двох правок два різні записи, і вони
  // зливаються без втрат.
  //
  // id ВИПАДКОВИЙ — на відміну від categories й finance_currencies вище:
  // природного ключа в назви спринта немає, два «Тиждень 1» у різних проєктах
  // це справді різні спринти, і похідний id склеїв би їх в один.
  //
  // Колекція адитивна, тому SYNC_CONTRACT_VERSION лишається 2 — той самий
  // прецедент, що з 'accounts' і 'active_timers'. Підняти версію не можна:
  // assertCompatibleSyncContract нижче падає на будь-якому неспівпадінні, і
  // версія 3 зупинила б синк усім уже встановленим застосункам.
  'sprints',
  // Підписки (регулярні платежі). id ВИПАДКОВИЙ (`sub-…`): природного ключа
  // немає — дві «Netflix» у різних валютах справді дві підписки. Фінансових
  // операцій підписка не створює, історія продовжень лежить у самому записі
  // (append-only). Колекція адитивна — SYNC_CONTRACT_VERSION лишається 2.
  // Сервер знає колекцію з G1; старі клієнти її просто ігнорують на pull.
  'subscriptions',
  // Регулярні доходи (flowi-web-app/docs/specs/finance-revamp.md §4.2) —
  // дзеркало підписок у інший бік; id ВИПАДКОВИЙ (`ri-<uuid4>`). Групи
  // категорій і ознака фікс/змінна нової колекції не мають: це опційні поля
  // `group` і `cost` у наявних записах 'categories'. Адитивно — версія 2.
  'recurring_incomes',
  // Контейнери v2 (flowi-web-app/docs/specs/containers.md §3.4): речі —
  // окрема колекція з належністю на речі (`containerId`), місця — плоский
  // список із `parentId`, фото — легкі метадані. Адитивно.
  'container_places',
  'container_items',
  'media_assets',
  // Персональні сесії тренувань, розгорнуті сервером із програми групи
  // (flowi-server-app/docs/specs/training-module.md §4). local_id похідний
  // (`ts-{assignmentId}-{week}-{dayOfWeek}`). Адитивно — версія лишається 2.
  'training_sessions',
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
  // Вибір циферблата таймерів: { version, defaultDial, timers: { id → dial } }.
  // Singleton із LWW — прийнятно для налаштування вигляду: одночасна правка на
  // двох пристроях у найгіршому разі лишить один із двох виборів циферблата.
  //
  // Назва НАВМИСНО не 'timer_dials': під тим ім'ям лежить старий локальний
  // об'єкт, і синхронізований ключ із тією ж назвою рушій перебрав би на себе,
  // затерши стару форму. Локальний ключ лишається запасним джерелом для читання
  // (hooks/use-timer-dial.ts). Колекція адитивна — версія контракту лишається 2.
  'timer_dial_prefs',
  // Які модулі інтерфейсу вимкнено: { version, disabledModules[], updatedAt }.
  // Налаштування НА АКАУНТ, тож синхронізоване, на відміну від згорнутості
  // груп сайдбара ('nav_collapsed_groups'), яка лишається локальною: то вибір
  // під діагональ екрана, а не про те, з яких розділів складається продукт.
  //
  // Зберігається список ВИМКНЕНИХ (див. шапку store/ui-preferences.ts):
  // модуль, якого ця збірка не знає, лишається увімкненим, і новий розділ
  // не з'являється у користувача прихованим. Дані вимкненого модуля НЕ
  // видаляються — синк тягне їх як раніше, ховається лише вхід.
  //
  // Колекція адитивна — SYNC_CONTRACT_VERSION лишається 2.
  'ui_preferences',
] as const;

export type SyncSingletonKey = (typeof SYNC_SINGLETON_KEYS)[number];

/**
 * Колекції, якими володіє СЕРВЕР (`core/sync_contract.py::SERVER_OWNED_COLLECTIONS`):
 * клієнт їх лише тягне pull-ом у локальний масив, але ніколи не пише —
 * мутацію сервер відхилить як `read_only_collection`. Тому їх немає в
 * SYNC_ARRAY_KEYS: звідти виводяться outbox (generateFullOutbox), saveSynced
 * і резервні копії, а ці записи не є даними користувача з цього пристрою.
 *
 * `feedback_status` (feedback-inbox.md §3.2): `local_id = '<kind>:<id>'`,
 * дані `{report_uid, status, comment, duplicate_of, task_linked, updated_at,
 * delivery_state}`. Адитивно — версія контракту лишається 2.
 */
export const SYNC_SERVER_OWNED_KEYS = ['feedback_status'] as const;

export type SyncServerOwnedKey = (typeof SYNC_SERVER_OWNED_KEYS)[number];

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

/**
 * Потік групи тренувань (training-module.md §2.2): власна версія протоколу,
 * незалежна від особистого контракту. Колекції мусять збігатися з
 * `TRAINING_COLLECTIONS` у core/sync_contract.py і lib/sync-contract.ts вебу.
 */
export const TRAINING_SYNC_PROTOCOL = 1;

export const TRAINING_COLLECTIONS = [
  'training_groups',
  'training_exercises',
  'training_programs',
  'training_assignments',
  'quests',
  'quest_progress',
  'workout_logs',
  'training_comments',
] as const;

export type TrainingCollection = (typeof TRAINING_COLLECTIONS)[number];

export function assertTrainingSyncProtocol(serverVersion: unknown): void {
  if (serverVersion !== TRAINING_SYNC_PROTOCOL) {
    throw new Error(
      `Unsupported training sync protocol ${String(serverVersion)}; client requires ${TRAINING_SYNC_PROTOCOL}`,
    );
  }
}
