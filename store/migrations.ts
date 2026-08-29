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

import { loadData, saveData } from './storage';
import { saveSynced } from './synced-storage';
import { sortTimers, taskTimerId, shiftForDate, type ActiveTimer } from '@/utils/activeTimers';
import type { Account } from '@/utils/accounts';

const MIGRATIONS_KEY = 'storage_migrations_applied';

/** Порожній рядок як id зламав би syncRecordKey — такі записи пропускаємо. */
function isUsableId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

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

export function categoryRowId(type: string, name: string): string {
  return `${type}:${name}`;
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
        // Зміну відновлюємо з часу СТАРТУ старої сесії, а не з «зараз»:
        // інакше нічна сесія після ранкового запуску застосунку осіла б у
        // статистиці як ранкова.
        shift: shiftForDate(new Date(startedAt)),
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

async function migrateOpenTaskTimers(): Promise<boolean> {
  const tasks = await loadData<MigratableTask[] | null>('tasks', null);
  if (!Array.isArray(tasks) || !tasks.length) return false;
  const hasOpen = tasks.some(task =>
    Array.isArray(task?.timeEntries) && task.timeEntries.some(e => e && !e.endedAt && e.startedAt),
  );
  // Ідемпотентність: після переносу відкритих записів не лишається, тож
  // повторний старт застосунку сюди вже не заходить.
  if (!hasOpen) return false;

  const existing = await loadData<ActiveTimer[]>('active_timers', []);
  const result = migrateOpenTimeEntries(tasks, Array.isArray(existing) ? existing : []);
  await saveData('active_timers', result.timers);
  await saveData('tasks', result.tasks);
  return true;
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
  if (await migrateOpenTaskTimers()) done.push('active_timers:from_open_entries');
  // Після нормалізації adjustments: міграція рахунків читає їх уже рядками.
  if (await migrateAccounts()) done.push('accounts:from_currencies');

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
