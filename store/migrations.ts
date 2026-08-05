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

  if (done.length) {
    await saveData(MIGRATIONS_KEY, [...applied, ...done]);
    if (__DEV__) console.log('[migrations] застосовано:', done.join(', '));
  }
  return done;
}
