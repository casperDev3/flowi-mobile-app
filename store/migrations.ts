/**
 * store/migrations.ts — одноразові перетворення локального сховища.
 *
 * Запускається на старті застосунку ДО того, як SyncProvider зробить перший
 * обмін: рушій синхронізації читає колекції за їхньою поточною формою, тож
 * форма має бути актуальною раніше, ніж він до неї дотягнеться.
 *
 * Кожна міграція мусить бути ідемпотентною — вона виконується на кожному
 * старті й має бути no-op, якщо дані вже в новій формі.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadData, saveData } from './storage';
import { saveSynced } from './synced-storage';
import { sortTimers, taskTimerId, type ActiveTimer } from '@/utils/activeTimers';
import type { Account } from '@/utils/accounts';
import { deriveStatusType, type TaskStatusColumn } from '@/utils/taskStatuses';
import type { TimeRecord } from '@/utils/timeEntries';
// Аліас: у цьому файлі вже є власний `MigratableTask` — мінімум полів для
// переносу ВІДКРИТИХ сесій у реєстр. Це інша форма й інша міграція.
import { migrateTaskSessions, type MigratableTask as TaskWithSessions } from '@/utils/timeMigration';
// Правило id живе в utils/recordIds: його читає ще й форма категорій, а
// імпортувати цей файл із чистої логіки не можна — він тягне сховище.
import { categoryRowId, isUsableId } from '@/utils/recordIds';
import { categoryMeta, isCategoryGroup, isCostKind, subscriptionCategoryNames, type SubscriptionRef } from '@/utils/finance/classify';

export { categoryRowId, isUsableId };

const MIGRATIONS_KEY = 'storage_migrations_applied';

/**
 * `finance_currencies` і `budget_limits` уже лежать масивами, але без `id`.
 * Додаємо його з природного ключа: код валюти / назва категорії.
 */
async function addDerivedIds(key: string, idField: string): Promise<boolean> {
  const rows = await loadData<Record<string, unknown>[] | null>(key, null);
  if (!Array.isArray(rows) || !rows.length) return false;
  if (rows.every(row => isUsableId(row.id))) return false;

  const next = rows
    .map(row => (isUsableId(row.id) ? row : { ...row, id: row[idField] }))
    .filter(row => isUsableId(row.id));
  await saveData(key, next);
  return true;
}

/** Запис `finance_balance_adjustments` у нормалізованій формі. */
export interface BalanceAdjustmentRow {
  id: string;
  amount: number;
}

/** `Record<currencyCode, number>` → `BalanceAdjustmentRow[]`. */
export function balanceAdjustmentsToRows(
  value: Record<string, number>,
): BalanceAdjustmentRow[] {
  return Object.entries(value)
    .filter(([code]) => isUsableId(code))
    .map(([code, amount]) => ({ id: code, amount }));
}

/** Зворотне перетворення — форма, якої чекають екрани фінансів. */
export function balanceAdjustmentsToMap(
  rows: BalanceAdjustmentRow[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (isUsableId(row.id) && typeof row.amount === 'number') out[row.id] = row.amount;
  }
  return out;
}

/** Запис `categories` у нормалізованій формі. */
export interface CategoryRow {
  /** `${type}:${name}` — похідний, щоб та сама категорія на двох пристроях
   *  зійшлася в один запис, а не подвоїлась. */
  id: string;
  type: string;
  name: string;
  icon: string;
  updatedAt?: string;
}

/** `Record<TxType, CategoryDef[]>` → пласкі рядки. */
export function categoryMapToRows<T extends { name: string; icon: string }>(
  value: Record<string, T[]>,
): CategoryRow[] {
  const rows: CategoryRow[] = [];
  for (const [type, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    for (const def of list) {
      if (!def || typeof def.name !== 'string' || !def.name) continue;
      const id = categoryRowId(type, def.name);
      if (!isUsableId(id)) continue;
      rows.push({ id, type, name: def.name, icon: def.icon });
    }
  }
  return rows;
}

/**
 * Зворотне перетворення — форма, якої чекають екрани фінансів.
 *
 * `fallback` задає набір типів (income/expense) і використовується цілком,
 * якщо для типу немає жодного збереженого рядка: інакше після нормалізації
 * порожня категорія показувалась би як порожній список замість дефолтів.
 */
export function categoryRowsToMap<T extends { name: string; icon: string }>(
  rows: CategoryRow[],
  fallback: Record<string, T[]>,
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const type of Object.keys(fallback)) out[type] = [];
  for (const row of rows) {
    if (!row || typeof row.name !== 'string') continue;
    if (!out[row.type]) out[row.type] = [];
    out[row.type].push({ name: row.name, icon: row.icon } as unknown as T);
  }
  for (const type of Object.keys(fallback)) {
    if (!out[type].length) out[type] = fallback[type];
  }
  return out;
}

async function migrateCategories(): Promise<boolean> {
  const stored = await loadData<unknown>('categories', null);
  if (stored == null || Array.isArray(stored) || typeof stored !== 'object') return false;
  await saveData(
    'categories',
    categoryMapToRows(stored as Record<string, { name: string; icon: string }[]>),
  );
  return true;
}

async function migrateBalanceAdjustments(): Promise<boolean> {
  const stored = await loadData<unknown>('finance_balance_adjustments', null);
  if (stored == null || Array.isArray(stored) || typeof stored !== 'object') return false;
  await saveData(
    'finance_balance_adjustments',
    balanceAdjustmentsToRows(stored as Record<string, number>),
  );
  return true;
}

// ─── Відкриті сесії таймера → active_timers ───────────────────────────────────

/** Мінімум полів завдання, потрібний міграції. */
interface MigratableTask {
  id?: unknown;
  title?: unknown;
  projectId?: unknown;
  timeEntries?: { id?: string; startedAt?: string; endedAt?: string; duration?: number }[];
  [key: string]: unknown;
}

export interface OpenTimerMigration {
  tasks: MigratableTask[];
  timers: ActiveTimer[];
  moved: number;
}

/**
 * Виносить незавершені сесії з `task.timeEntries` у реєстр активних таймерів.
 *
 * До введення `active_timers` «таймер іде» означало запис без `endedAt` прямо в
 * завданні. Після переходу такий запис не показує ніхто: реєстр про нього не
 * знає, а `totalTrackedSeconds` рахує лише завершені сесії. Тобто час і далі
 * «йшов» би вічно, не додаючись нікуди й не даючи себе зупинити.
 *
 * Чиста функція — щоб її можна було перевірити без сховища.
 */
export function migrateOpenTimeEntries(
  tasks: MigratableTask[],
  existing: ActiveTimer[],
): OpenTimerMigration {
  const byId = new Map(existing.map(timer => [timer.id, timer]));
  let moved = 0;

  const nextTasks = tasks.map(task => {
    const entries = Array.isArray(task.timeEntries) ? task.timeEntries : [];
    const open = entries.filter(entry => entry && !entry.endedAt && entry.startedAt);
    if (!open.length) return task;

    const id = typeof task.id === 'string' ? task.id : '';
    if (!isUsableId(id)) return { ...task, timeEntries: entries.filter(e => e?.endedAt) };

    // Кілька відкритих записів на одне завдання — це вже зламані дані. Беремо
    // найраніший: він накопичив найбільше часу, і саме його користувач бачив
    // як «таймер іде».
    const earliest = open.reduce((best, entry) =>
      new Date(entry.startedAt!).getTime() < new Date(best.startedAt!).getTime() ? entry : best,
    );

    const timerId = taskTimerId(id);
    if (!byId.has(timerId)) {
      const startedAt = earliest.startedAt!;
      byId.set(timerId, {
        id: timerId,
        taskId: id,
        label: typeof task.title === 'string' ? task.title : '',
        startedAt,
        // Як і startTaskTimer: таймер несе проєкт задачі, щоб мітка й запис
        // часу не залежали від того, чи завантажена колекція задач.
        ...(typeof task.projectId === 'string' && task.projectId ? { projectId: task.projectId } : {}),
        // restoreColumn немає навмисно: куди саме класти завдання після
        // зупинки, стара форма не зберігала, а вгадувати означало б
        // переставити його всупереч рішенню користувача.
      });
      moved += 1;
    }

    return { ...task, timeEntries: entries.filter(e => e?.endedAt) };
  });

  return { tasks: nextTasks, timers: sortTimers([...byId.values()]), moved };
}

/**
 * Результат кроку — ще й самі задачі ПІСЛЯ нього.
 *
 * Наступний крок (`migrateTaskSessionsToTimeEntries`) працює з тим самим
 * ключем, і власне читання коштувало б розбору всієї колекції задач ще раз —
 * на КОЖНОМУ старті застосунку, назавжди. Тому задачі віддаються далі, а не
 * перечитуються: єдина причина цієї пари в сигнатурі.
 */
interface OpenTimersStep {
  changed: boolean;
  /** Порожньо — задач у сховищі немає (або вони биті). */
  tasks: MigratableTask[];
}

async function migrateOpenTaskTimers(): Promise<OpenTimersStep> {
  const tasks = await loadData<MigratableTask[] | null>('tasks', null);
  if (!Array.isArray(tasks) || !tasks.length) return { changed: false, tasks: [] };
  const hasOpen = tasks.some(task =>
    Array.isArray(task?.timeEntries) && task.timeEntries.some(e => e && !e.endedAt && e.startedAt),
  );
  // Ідемпотентність: після переносу відкритих записів не лишається, тож
  // повторний старт застосунку сюди вже не заходить.
  if (!hasOpen) return { changed: false, tasks };

  const existing = await loadData<ActiveTimer[]>('active_timers', []);
  const result = migrateOpenTimeEntries(tasks, Array.isArray(existing) ? existing : []);
  await saveData('active_timers', result.timers);
  await saveData('tasks', result.tasks);
  return { changed: true, tasks: result.tasks };
}

// ─── Завершені сесії задач → time_entries ─────────────────────────────────────

/**
 * Копіює завершені сесії з `task.timeEntries` у спільну колекцію `time_entries`.
 *
 * Сам перенос описаний в `utils/timeMigration.ts`; тут — лише його місце в
 * ЖИТТІ застосунку. Досі його робив екран «Час» на першому відкритті, і це
 * прив'язувало цілісність даних до навігації: людина, яка не заходила на цю
 * вкладку, мала розʼїхані підсумки на Огляді й у проєкті, а синк весь цей час
 * розносив по пристроях неповну колекцію. Міграція на старті прибирає цю
 * залежність — екран часу після неї нічого не знаходить і лишається no-op.
 *
 * Порядок важливий: `migrateOpenTaskTimers` вище вже винесла з задач сесії без
 * `endedAt`, тож сюди приходять тільки завершені — і приходять ПАРАМЕТРОМ, від
 * того ж кроку, щоб не розбирати колекцію задач удруге на кожному старті.
 */
async function migrateTaskSessionsToTimeEntries(raw: MigratableTask[]): Promise<boolean> {
  try {
    // Задачі без жодної завершеної сесії переносити нічого — і саме це
    // НОРМАЛЬНИЙ стан після першого разу. Перевірка тут, а не всередині
    // `migrateTaskSessions`, рятує від читання всієї колекції `time_entries`
    // на кожному старті застосунку.
    const hasClosed = raw.some(task =>
      Array.isArray(task?.timeEntries) && task.timeEntries.some(e => e?.endedAt && e.id),
    );
    if (!hasClosed) return false;
    // Локальний `MigratableTask` описує мінімум для переносу ВІДКРИТИХ сесій і
    // навмисно нестрогий (`id?: unknown`). `migrateTaskSessions` сама відкидає
    // записи без id, назви чи тривалості, тож звуження тут було б подвійним.
    const tasks = raw as unknown as TaskWithSessions[];
    const existing = await loadData<TimeRecord[]>('time_entries', []);
    const result = migrateTaskSessions(tasks, Array.isArray(existing) ? existing : []);
    // Ідемпотентність: наступні старти сюди заходять (стоп таймера пише сесію
    // і в задачу, і в дзеркало), але додають 0 — перенесений запис має похідний
    // id, а дзеркало відсікається за природним ключем «задача + кінець +
    // тривалість». Саме тому дзеркало тепер пише `taskId`: доки ключем була
    // НАЗВА, перейменована задача давала дубль часу на кожному старті.
    if (!result.added) return false;
    // saveSynced, а не saveData: перенесені сесії — це РЕАЛЬНО нові записи
    // колекції, які мусять доїхати на інші пристрої.
    await saveSynced('time_entries', result.entries as unknown as { id: string }[]);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[migrations] перенесення сесій задач не вдалося:', e);
    return false;
  }
}

// ─── Валюта операції → рахунок ────────────────────────────────────────────────

/** Мінімум полів транзакції, потрібний міграції. */
interface MigratableTx {
  currency?: unknown;
  accountId?: unknown;
  [key: string]: unknown;
}

/** Мінімум полів скарбнички, потрібний міграції. */
interface MigratableJar {
  id?: unknown;
  name?: unknown;
  goal?: unknown;
  saved?: unknown;
  icon?: unknown;
  color?: unknown;
  createdAt?: unknown;
  [key: string]: unknown;
}

export interface AccountsMigrationInput {
  /**
   * Рахунки, які вже лежать у сховищі: свої чи прилетілі синком. Нових поверх
   * них не заводимо без потреби — лише ті, яким не має де взятися інакше.
   */
  existing?: Account[];
  transactions: MigratableTx[];
  jars: MigratableJar[];
  /** `finance_balance_adjustments` у формі мапи код→сума. */
  adjustments: Record<string, number>;
  /** `finance_primary_currency` — валюта, у якій велися скарбнички. */
  primaryCurrency: string;
  /** Час створення рахунків. Параметр, а не `Date.now()`, — щоб тестувати. */
  now: string;
}

export interface AccountsMigrationResult {
  /** Наявні рахунки плюс дозаведені — у порядку появи. */
  accounts: Account[];
  transactions: MigratableTx[];
  /** Чи з'явився хоч один новий рахунок (а не лише повернувся наявний список). */
  accountsChanged: boolean;
  /** Чи довелося переписувати самі транзакції (не лише завести рахунки). */
  transactionsChanged: boolean;
}

/**
 * id рахунку ПОХІДНИЙ від коду валюти, а не випадковий: два пристрої, що
 * мігрували ті самі дані офлайн, мусять зійтися в один рахунок, інакше після
 * синку користувач отримав би два «Основних» гаманці з розполовиненою
 * історією.
 */
export function currencyAccountId(code: string): string {
  return `acct-${code.toLowerCase()}`;
}

/** Скарбничка теж має власний природний ключ — свій же id. */
export function jarAccountId(jarId: string): string {
  return `acct-jar-${jarId}`;
}

function txCurrencyCode(tx: MigratableTx): string {
  return typeof tx.currency === 'string' && tx.currency ? tx.currency : 'UAH';
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Заводить рахунки для даних, що жили без них.
 *
 * До рахунків валюта висіла на операції, а «скільки в мене є» рахувалося як
 * сума операцій плюс ручна поправка `finance_balance_adjustments`. Саме ця
 * поправка й стає початковим залишком рахунку — вона й описувала гроші, що
 * були до першої записаної операції.
 *
 * Минулі перекази НЕ ВГАДУЄМО. Евристика «однакова сума того ж дня» тихо
 * з'їла б зарплату разом із покупкою на ту саму суму; замість неї в деталях
 * транзакції є ручна дія «позначити як переказ».
 *
 * Працює і на непорожньому списку рахунків: операція без `accountId` не
 * потрапляє в баланс ЖОДНОГО рахунку, хоч і входить в оборот місяця, — і
 * такі операції з'являються й після першого запуску (легасі-експорт через
 * «Дані → Завантажити», запис із клієнта, де рахунків ще немає).
 *
 * Чиста функція — щоб її можна було перевірити без сховища.
 */
export function buildAccountsFromLegacyFinance(
  input: AccountsMigrationInput,
): AccountsMigrationResult {
  const { transactions, jars, adjustments, primaryCurrency, now } = input;
  const existing = Array.isArray(input.existing) ? input.existing : [];
  const known = new Set(existing.map(a => a.id));
  const added: Account[] = [];

  // Рахунок заводимо ЛИШЕ під операції, у яких його немає. Раніше коди бралися
  // з усіх транзакцій підряд, і це було те саме, бо міграція виконувалась лише
  // на порожньому списку рахунків. Тепер вона лагодить і пізніші дані —
  // легасі-експорт, залитий через «Завантажити» вже після появи рахунків, —
  // а там операції з рахунком мають лишитися при своєму.
  const codes: string[] = [];
  for (const tx of transactions) {
    if (isUsableId(tx.accountId)) continue;
    const code = txCurrencyCode(tx);
    if (!codes.includes(code)) codes.push(code);
  }

  // Валюта, у якої є лише ручна поправка балансу й ЖОДНОЇ операції, теж мусить
  // отримати рахунок. Ці гроші існують — користувач сам їх записав, — і без
  // рахунку вони просто зникли б з застосунку: поправки після міграції ніхто
  // більше не читає, бо початковий залишок живе в Account.openingBalance.
  //
  // Тільки на ПЕРШІЙ міграції (порожній список рахунків), за тим самим
  // правилом, що й скарбнички: на непорожньому списку відсутність такого
  // рахунку означає, що його свідомо позбулися, і воскрешати його щостарту
  // не можна.
  if (existing.length === 0) {
    for (const [code, value] of Object.entries(adjustments)) {
      if (!code || !numberOr(value, 0)) continue;
      if (!codes.includes(code)) codes.push(code);
    }
  }

  // Код у назві, коли поруч є інші рахунки: другий безіменний «Основний» серед
  // рахунків користувача не давав би зрозуміти, чий він.
  const multi = codes.length > 1 || existing.length > 0;
  for (const code of codes) {
    const id = currencyAccountId(code);
    // Рахунок під цю валюту вже є (свій чи з попередньої міграції) — операції
    // просто приліпляться до нього, а не розділять історію надвоє.
    if (known.has(id)) continue;
    known.add(id);
    added.push({
      id,
      name: multi ? `Основний ${code}` : 'Основний',
      kind: 'cash',
      currency: code,
      openingBalance: numberOr(adjustments[code], 0),
      createdAt: now,
    });
  }

  // Скарбнички переносимо лише на порожньому списку рахунків. Непорожній
  // означає, що рахунки вже десь є — і якщо серед них немає рахунку
  // скарбнички, то його свідомо позбулися; заводити його знову на кожному
  // старті означало б воскрешати видалене.
  const jarsToMigrate: MigratableJar[] = existing.length ? [] : jars;
  for (const jar of jarsToMigrate) {
    const id = typeof jar.id === 'string' ? jar.id : '';
    if (!isUsableId(id)) continue;
    const accountId = jarAccountId(id);
    if (!isUsableId(accountId)) continue;
    if (known.has(accountId)) continue;
    known.add(accountId);
    added.push({
      id: accountId,
      name: typeof jar.name === 'string' && jar.name ? jar.name : 'Скарбничка',
      kind: 'savings',
      // Скарбнички валюти не мали взагалі, тож єдина осмислена здогадка —
      // основна валюта: саме в ній користувач бачив їхні суми.
      currency: primaryCurrency || 'UAH',
      openingBalance: numberOr(jar.saved, 0),
      goal: numberOr(jar.goal, 0) || undefined,
      icon: typeof jar.icon === 'string' ? jar.icon : undefined,
      color: typeof jar.color === 'string' ? jar.color : undefined,
      createdAt: typeof jar.createdAt === 'string' ? jar.createdAt : now,
    });
  }

  let transactionsChanged = false;
  const nextTxs = transactions.map(tx => {
    if (isUsableId(tx.accountId)) return tx;
    transactionsChanged = true;
    return { ...tx, accountId: currencyAccountId(txCurrencyCode(tx)) };
  });

  return {
    accounts: [...existing, ...added],
    transactions: nextTxs,
    accountsChanged: added.length > 0,
    transactionsChanged,
  };
}

/** Обидві форми `finance_balance_adjustments`: до нормалізації і після. */
function readAdjustments(stored: unknown): Record<string, number> {
  if (Array.isArray(stored)) return balanceAdjustmentsToMap(stored as BalanceAdjustmentRow[]);
  if (stored && typeof stored === 'object') return stored as Record<string, number>;
  return {};
}

async function migrateAccounts(): Promise<boolean> {
  const stored = await loadData<Account[] | null>('accounts', null);
  const existing = Array.isArray(stored) ? stored : [];

  const [transactions, jars, adjustmentsRaw, primaryCurrency] = await Promise.all([
    loadData<MigratableTx[] | null>('transactions', null),
    loadData<MigratableJar[] | null>('savings_jars', null),
    loadData<unknown>('finance_balance_adjustments', null),
    loadData<string>('finance_primary_currency', 'UAH'),
  ]);

  const result = buildAccountsFromLegacyFinance({
    existing,
    transactions: Array.isArray(transactions) ? transactions : [],
    jars: Array.isArray(jars) ? jars : [],
    adjustments: readAdjustments(adjustmentsRaw),
    primaryCurrency,
    now: new Date().toISOString(),
  });

  // Нема чого заводити й нема чого лагодити: порожньому застосунку рахунок
  // заведе сам користувач, а порожній масив у сховищі лише вимкнув би цю
  // міграцію назавжди.
  if (!result.accountsChanged && !result.transactionsChanged) return false;

  // saveSynced, а не saveData: рахунки й проставлені accountId — це ЗМІНА
  // даних, а не зміна їхньої форми. Пристрій із ненульовим курсором повного
  // outbox більше не генерує (див. generateFullOutbox у sync-engine), тож
  // записане повз outbox не поїхало б на сервер ніколи: веб не побачив би
  // жодного рахунку, а прилетіла звідти копія операції без accountId ще й
  // затерла б локальну.
  if (result.accountsChanged) await saveSynced('accounts', result.accounts);
  if (result.transactionsChanged) {
    await saveSynced('transactions', result.transactions as unknown as { id: string }[]);
  }
  // `savings_jars` і `finance_balance_adjustments` НЕ стираємо: старі збірки
  // на інших пристроях досі в них пишуть, а синхронізація донесе їхні записи
  // сюди — видалене довелося б відновлювати.
  return true;
}

// ─── Явний `type` в особистих статусах (§3.3 контракту, мінор з ревʼю) ────────

/**
 * `mergeTaskStatusColumns` рахує `type` ПРИ ПОКАЗІ (в памʼяті, `resolvedStatusType`),
 * але сам запис у сховищі — а отже і те, що синкається на інші пристрої/web —
 * досі лежить без явного поля, якщо особисту колонку створено чи відредаговано
 * до появи `type`. Контракт §3.3 дослівно: «особисті статуси теж отримують
 * type» — без цієї міграції кожен клієнт мусив би сам вивести те саме правило
 * (isDone→done, status-in-progress→in_progress, інше→todo) з тих самих даних,
 * і будь-яка майбутня розбіжність у цьому виведенні між клієнтами тихо
 * розійшлася б. Лише ОСОБИСТІ колонки (без `projectId`) — проєктні й так
 * завжди отримують явний `type` при створенні (`seedProjectStatusColumns`).
 * Ідемпотентно: другий прохід нічого не змінює (return false).
 */
async function migratePersonalStatusTypes(): Promise<boolean> {
  const stored = await loadData<TaskStatusColumn[] | null>('task_statuses', null);
  if (!Array.isArray(stored) || !stored.length) return false;
  let changed = false;
  const next = stored.map(column => {
    if (!column || column.projectId || column.type !== undefined) return column;
    changed = true;
    return { ...column, type: deriveStatusType(column) };
  });
  if (!changed) return false;
  // saveSynced, а не saveData: явний `type` — реальна зміна даних, яку мають
  // побачити й інші пристрої/web (contract §3.3), а не лише форма запису.
  await saveSynced('task_statuses', next as unknown as { id: string }[]);
  return true;
}

// ─── Бекфіл `createdBy` для проєктних задач без автора (major, review §3.7) ───

const WORKSPACE_PROJECTS_KEY = 'workspace_projects';
const PROJECT_SYNC_STATE_KEY = 'project_sync_state_v1';
const AUTH_USER_KEY = 'auth_user';

interface ProjectRoleSummaryRow { id: string; role?: string }
interface ProjectSyncStateEntryRow { role?: string }
interface CreatedByTaskRow { id: string; projectId?: string | null; createdBy?: string }

/**
 * Задачі без `assigneeId` і без `createdBy` контракт §3.7 не рахує «моїми»
 * (`isMyTask` — дослівна рівність, без фолбеку — див. попередній прохід
 * ревʼю нижче в цьому файлі). Такий стан лишають (a) соло-проєктні задачі,
 * створені ДО появи `createdBy` в клієнті, і (b) записи, перенесені в проєкт
 * міграцією сервера §3.6 (`POST /projects/migrate/` копіює дані як є, без
 * додавання поля) — власник тоді втрачає власні задачі з «Сьогодні» й
 * «Завдання» одразу після входу. Бекфілимо лише для проєктів, де я owner:
 * для member/viewer чужа задача без автора лишається як є — приписати собі
 * авторство ЧУЖОЇ команди тут не можна.
 *
 * Ідемпотентно: другий прохід не знаходить задач без `createdBy` і виходить
 * без запису.
 */
async function backfillProjectTaskCreatedBy(): Promise<boolean> {
  const user = await loadData<{ id?: string } | null>(AUTH_USER_KEY, null);
  const myUserId = user?.id;
  if (!myUserId) return false; // без сесії бекфілити нема від чийого імені

  const tasks = await loadData<CreatedByTaskRow[] | null>('tasks', null);
  if (!Array.isArray(tasks) || !tasks.length) return false;
  if (!tasks.some(t => t?.projectId && !t.createdBy)) return false;

  const [summaries, state] = await Promise.all([
    loadData<ProjectRoleSummaryRow[]>(WORKSPACE_PROJECTS_KEY, []),
    loadData<Record<string, ProjectSyncStateEntryRow>>(PROJECT_SYNC_STATE_KEY, {}),
  ]);
  const roles: Record<string, string> = {};
  for (const s of summaries ?? []) {
    if (s?.id && s.role) roles[s.id] = s.role;
  }
  // project_sync_state_v1 точніше й свіжіше за кеш GET /projects/ (той самий
  // порядок злиття, що й hooks/use-project-roles.ts readRoleMap).
  for (const [id, entry] of Object.entries(state ?? {})) {
    if (entry?.role) roles[id] = entry.role;
  }
  // Той самий фолбек, що й use-project-roles.ts/canEditProjectItem: невідома
  // роль = owner (соло-проєкт, якого сервер ще не бачив, належить тому, хто
  // його створив).
  const isOwnedByMe = (projectId: string) => (roles[projectId] ?? 'owner') === 'owner';

  let changed = false;
  const next = tasks.map(t => {
    if (!t || !t.projectId || t.createdBy || !isOwnedByMe(t.projectId)) return t;
    changed = true;
    return { ...t, createdBy: myUserId };
  });
  if (!changed) return false;
  // saveSynced, а не saveData: авторство — реальна зміна даних (contract
  // §3.7), яку мають побачити й інші пристрої/web, а не лише форма запису.
  await saveSynced('tasks', next as unknown as { id: string }[]);
  return true;
}

// ─── Групи категорій і ознака фікс/змінна (finance-revamp.md §4.5.2) ─────────

const CATEGORY_GROUP_COST_MIGRATION = 'categories:group_cost';

interface CategoryRowForMeta { id?: unknown; type?: unknown; name?: unknown; group?: unknown; cost?: unknown }

/**
 * Проставити `group`/`cost` рядкам `categories`, де їх немає, тим самим
 * `categoryMeta`, яким обидва клієнти й так читають категорії. Пишуться ЛИШЕ
 * відсутні поля; id, назва, іконка й наявні значення не чіпаються; `cost` —
 * лише витратам (для доходів ознака не має сенсу). Повертає той самий масив,
 * якщо змінювати нічого.
 */
export function withCategoryGroupCost<T extends CategoryRowForMeta>(
  rows: readonly T[],
  subscriptions: readonly SubscriptionRef[] = [],
): T[] {
  const fixedByReference = subscriptionCategoryNames(subscriptions);
  let changed = false;
  const next = rows.map(row => {
    if (!row || typeof row !== 'object') return row;
    const needGroup = !isCategoryGroup(row.group);
    const needCost = row.type === 'expense' && !isCostKind(row.cost);
    if (!needGroup && !needCost) return row;
    const meta = categoryMeta(row as never, { fixedByReference });
    changed = true;
    return {
      ...row,
      ...(needGroup ? { group: meta.group } : {}),
      ...(needCost ? { cost: meta.cost } : {}),
    };
  });
  return changed ? next : (rows as T[]);
}

/**
 * Одноразова (§4.5.2): не умова правильності — цифри однакові й без неї, —
 * а щоб у редакторі категорій людина побачила заповнені поля. Веб її не
 * запускає. Після першого проходу не повторюється (прапорець у
 * `storage_migrations_applied`), тож рядок, якому людина потім явно прибере
 * значення, його не отримає назад.
 */
async function migrateCategoryGroupCost(applied: readonly string[]): Promise<boolean> {
  if (applied.includes(CATEGORY_GROUP_COST_MIGRATION)) return false;
  const stored = await loadData<unknown>('categories', null);
  // Порожньо (свіжий вхід, синк ще не приніс категорій) — не позначаємо
  // виконаною: інакше рядки, що приїдуть першим pull-ом, її вже не отримали б.
  if (!Array.isArray(stored) || !stored.length) return false;
  const subs = await loadData<unknown>('subscriptions', []);
  const refs = Array.isArray(subs) ? (subs as SubscriptionRef[]) : [];
  const next = withCategoryGroupCost(stored as CategoryRowForMeta[], refs);
  // Рядки є, але змінювати нічого — теж виконана: прохід не повторюється на
  // кожному старті для кожного майбутнього рядка без полів.
  if (next !== stored) {
    // saveSynced: група й ознака — реальна зміна даних, її бачать інші пристрої й веб.
    await saveSynced('categories', next as unknown as { id: string }[]);
  }
  return true;
}

// ─── «Спільне» → прибрано (§4 плану, §6.3 контракту) ──────────────────────────

/** Точні ключі легасі-функції «Спільне» — без динамічного `shared_items_<sid>`. */
const SHARED_FEATURE_KEYS = ['shared_device_id', 'shared_groups_list', 'shared_group', 'shared_section_counts'];

/**
 * Прибирає сховище екрана «Спільне» — той жорсткий перехід контракту §6.3:
 * групи стали проєктами, а старі локальні ключі (пристрій, кеш груп/секцій,
 * лічильники) більше нічого не читає й не пише. `shared_items_<sid>` —
 * динамічний за id секції, тож шукаємо його префіксом серед усіх ключів, а
 * не окремим `loadData`.
 */
async function removeSharedFeatureKeys(): Promise<boolean> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = allKeys.filter(
      key => SHARED_FEATURE_KEYS.includes(key) || key.startsWith('shared_items_'),
    );
    if (!toRemove.length) return false;
    await AsyncStorage.multiRemove(toRemove);
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[migrations] очищення ключів «Спільне» не вдалося:', e);
    return false;
  }
}

/**
 * Нормалізація фінансових singleton-блобів у масиви (фаза 7 плану синку).
 *
 * До неї ці ключі синхронізувалися цілими блобами: два пристрої, кожен додав
 * офлайн по валюті — і при застосуванні вигравав один блоб повністю, а чужий
 * запис зникав без сліду.
 */
export async function runStorageMigrations(): Promise<string[]> {
  const applied = await loadData<string[]>(MIGRATIONS_KEY, []);
  const done: string[] = [];

  if (await addDerivedIds('finance_currencies', 'code')) done.push('finance_currencies:ids');
  if (await addDerivedIds('budget_limits', 'category')) done.push('budget_limits:ids');
  if (await migrateBalanceAdjustments()) done.push('finance_balance_adjustments:rows');
  if (await migrateCategories()) done.push('categories:rows');
  const openTimers = await migrateOpenTaskTimers();
  if (openTimers.changed) done.push('active_timers:from_open_entries');
  // Задачі беремо з попереднього кроку: у них уже лишились тільки завершені
  // сесії, і другого читання ключа 'tasks' це не коштує.
  if (await migrateTaskSessionsToTimeEntries(openTimers.tasks)) {
    done.push('time_entries:from_task_sessions');
  }
  // Після нормалізації adjustments: міграція рахунків читає їх уже рядками.
  if (await migrateAccounts()) done.push('accounts:from_currencies');
  if (await removeSharedFeatureKeys()) done.push('shared:removed');
  if (await migratePersonalStatusTypes()) done.push('task_statuses:explicit_type');
  if (await backfillProjectTaskCreatedBy()) done.push('tasks:createdBy_backfill');
  // Після migrateCategories: читає вже рядки, а не легасі-мапу.
  if (await migrateCategoryGroupCost(applied)) done.push(CATEGORY_GROUP_COST_MIGRATION);

  if (done.length) {
    await saveData(MIGRATIONS_KEY, [...applied, ...done]);
    if (__DEV__) console.log('[migrations] застосовано:', done.join(', '));
  }
  return done;
}

let migrationRun: Promise<string[]> | null = null;

/**
 * Один запуск на процес — і та сама обіцянка для всіх, хто на неї чекає.
 *
 * Міграція `active_timers:from_open_entries` переносить відкриту сесію із
 * task.timeEntries у реєстр таймерів. TimerProvider читає той самий ключ на
 * монтуванні, і без спільної обіцянки він гарантовано читав би сховище
 * РАНІШЕ за міграцію (вона робить кілька await до цього кроку): перенесений
 * таймер був би невидимий увесь сеанс, а перший же старт іншого таймера
 * стер би його через diff у saveSynced.
 */
export function ensureStorageMigrations(): Promise<string[]> {
  if (!migrationRun) migrationRun = runStorageMigrations();
  return migrationRun;
}
