/**
 * store/synced-storage.ts — запис з підтримкою синхронізації.
 *
 * saveSynced(key, items[]) — для масивів SYNC_ARRAY_KEYS:
 *   1. Завантажує поточний стан зі сховища.
 *   2. Дифить за id: нові/змінені → outbox {deleted:false}; зниклі → outbox {deleted:true} + тумбстоун.
 *   3. saveData(key, items).
 *   4. Запускає debounce-синк.
 *
 * saveSyncedValue(key, value) — для singleton-ключів:
 *   outbox item local_id=key, data={value}.
 */

import { loadData, saveData } from './storage';

// ─── Ключові константи ─────────────────────────────────────────────────────────
export const SYNC_ARRAY_KEYS = [
  'tasks',
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
  'containers',
  'bugs',
  'ideas',
  'health_meds',
  'health_checkups',
  'health_vaccines',
  'health_habits',
] as const;

export type SyncArrayKey = (typeof SYNC_ARRAY_KEYS)[number];

export const SYNC_SINGLETON_KEYS = [
  'categories',
  'budget_limits',
  'finance_balance_adjustments',
  'finance_currencies',
  'finance_primary_currency',
] as const;

export type SyncSingletonKey = (typeof SYNC_SINGLETON_KEYS)[number];

export const OUTBOX_KEY = 'sync_outbox';
export const TOMBSTONES_KEY = 'sync_tombstones';

// ─── Типи ─────────────────────────────────────────────────────────────────────
export interface OutboxItem {
  collection: string;
  local_id: string;
  deleted: boolean;
  force?: boolean;
  queued_at: number;
}

/** map: collection → {id → deletedAtISO} */
export type Tombstones = Record<string, Record<string, string>>;

// ─── Scheduler hook (встановлюється sync-engine, щоб уникнути циклічного імпорту) ─
let _scheduleSync: (() => void) | null = null;

export function setSyncScheduler(fn: () => void): void {
  _scheduleSync = fn;
}

function notifySyncScheduler(): void {
  _scheduleSync?.();
}

// ─── Outbox helpers (чисті функції, тестабельні) ─────────────────────────────

/**
 * Дедуп за collection+local_id.
 * Пріоритети: deleted > force > last-seen.
 * Якщо existing вже deleted → не перезаписується (крім іншого deleted).
 */
export function deduplicateOutbox(items: OutboxItem[]): OutboxItem[] {
  const map = new Map<string, OutboxItem>();
  for (const item of items) {
    const key = `${item.collection}:${item.local_id}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else if (item.deleted && !existing.deleted) {
      // deleted завжди перемагає non-deleted
      map.set(key, item);
    } else if (!existing.deleted) {
      // Для non-deleted: force перемагає, або останній запис перемагає
      if (item.force || !existing.force) {
        map.set(key, item);
      }
    }
    // existing.deleted перемагає над будь-яким non-deleted
  }
  return Array.from(map.values());
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  return loadData<OutboxItem[]>(OUTBOX_KEY, []);
}

export async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await saveData(OUTBOX_KEY, items);
}

/** Додає нові записи до outbox, дедупліціруючи з наявними. */
export async function appendToOutbox(newItems: OutboxItem[]): Promise<void> {
  if (!newItems.length) return;
  const existing = await loadOutbox();
  const combined = deduplicateOutbox([...existing, ...newItems]);
  await saveOutbox(combined);
}

/** Видаляє записи з outbox за набором ключів collection:local_id. */
export async function removeFromOutbox(keys: Set<string>): Promise<void> {
  if (!keys.size) return;
  const current = await loadOutbox();
  const filtered = current.filter(i => !keys.has(`${i.collection}:${i.local_id}`));
  await saveOutbox(filtered);
}

/** Позначає елемент як dirty вручну (наприклад, force-push при вирішенні конфлікту). */
export async function markDirty(
  collection: string,
  local_id: string,
  deleted = false,
  force = false,
): Promise<void> {
  const item: OutboxItem = {
    collection,
    local_id,
    deleted,
    force: force || undefined,
    queued_at: Date.now(),
  };
  await appendToOutbox([item]);
  notifySyncScheduler();
}

// ─── Тумбстоуни ──────────────────────────────────────────────────────────────

export async function loadTombstones(): Promise<Tombstones> {
  return loadData<Tombstones>(TOMBSTONES_KEY, {});
}

async function saveTombstones(t: Tombstones): Promise<void> {
  await saveData(TOMBSTONES_KEY, t);
}

// ─── diffItems (чиста функція, тестабельна) ───────────────────────────────────

export interface DiffResult {
  changed: string[]; // local_ids нових або змінених
  deleted: string[]; // local_ids зниклих
}

export function diffItems<T extends { id: string }>(
  prev: T[],
  next: T[],
): DiffResult {
  const prevMap = new Map(prev.map(i => [i.id, JSON.stringify(i)]));
  const nextMap = new Map(next.map(i => [i.id, JSON.stringify(i)]));

  const changed: string[] = [];
  for (const [id, json] of nextMap) {
    if (!prevMap.has(id) || prevMap.get(id) !== json) {
      changed.push(id);
    }
  }

  const deleted: string[] = [];
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      deleted.push(id);
    }
  }

  return { changed, deleted };
}

// ─── applyPullItems (чиста функція, тестабельна) ──────────────────────────────

/**
 * Застосовує список items із відповіді сервера до локального масиву.
 * Пропускає items, що є у dirtyIds (dirty-wins).
 */
export function applyPullItems<T extends { id: string }>(
  local: T[],
  serverItems: { local_id: string; data: any; deleted: boolean }[],
  dirtyIds: Set<string>, // format: "collection:local_id"
  collection: string,
): T[] {
  const map = new Map(local.map(i => [i.id, i]));

  for (const si of serverItems) {
    const fullKey = `${collection}:${si.local_id}`;
    if (dirtyIds.has(fullKey)) continue; // dirty-wins

    if (si.deleted) {
      map.delete(si.local_id);
    } else {
      map.set(si.local_id, si.data as T);
    }
  }

  return Array.from(map.values());
}

// ─── saveSynced ───────────────────────────────────────────────────────────────

export async function saveSynced<T extends { id: string }>(
  key: string,
  items: T[],
): Promise<void> {
  // Зберігаємо дані та обчислюємо diff
  const existing = await loadData<T[]>(key, []);
  const { changed, deleted } = diffItems(existing, items);

  // Зберігаємо нові дані
  await saveData(key, items);

  // Якщо нема змін — не чіпаємо outbox
  if (!changed.length && !deleted.length) return;

  const now = Date.now();
  const outboxItems: OutboxItem[] = [];

  for (const id of changed) {
    outboxItems.push({ collection: key, local_id: id, deleted: false, queued_at: now });
  }

  // Тумбстоуни для видалених
  if (deleted.length) {
    const tombstones = await loadTombstones();
    const colTomb = tombstones[key] ?? {};
    const deletedAt = new Date().toISOString();
    for (const id of deleted) {
      colTomb[id] = deletedAt;
      outboxItems.push({ collection: key, local_id: id, deleted: true, queued_at: now });
    }
    tombstones[key] = colTomb;
    await saveTombstones(tombstones);
  }

  await appendToOutbox(outboxItems);
  notifySyncScheduler();
}

// ─── saveSyncedValue (singleton) ──────────────────────────────────────────────

export async function saveSyncedValue(key: string, value: unknown): Promise<void> {
  await saveData(key, value);
  const item: OutboxItem = {
    collection: key,
    local_id: key,
    deleted: false,
    queued_at: Date.now(),
  };
  await appendToOutbox([item]);
  notifySyncScheduler();
}
