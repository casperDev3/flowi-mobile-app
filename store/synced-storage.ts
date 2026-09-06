/**
 * store/synced-storage.ts — запис з підтримкою синхронізації.
 *
 * saveSynced(key, items[]) — для масивів SYNC_ARRAY_KEYS:
 *   1. Завантажує поточний стан зі сховища.
 *   2. Дифить за id: нові/змінені → outbox {deleted:false}; зниклі → outbox {deleted:true}.
 *   3. saveData(key, items).
 *   4. Запускає debounce-синк.
 *
 * saveSyncedValue(key, value) — для singleton-ключів:
 *   outbox item local_id=key, data={value}.
 */

import { loadData, saveData } from './storage';
import {
  recordNotify,
  recordSchedulerInstalled,
  recordStorageEval,
  type SchedulerTag,
} from './sync-diagnostics';

export {
  SYNC_ARRAY_KEYS,
  SYNC_SINGLETON_KEYS,
  type SyncArrayKey,
  type SyncSingletonKey,
} from './sync-contract';

// ─── Ключові константи ─────────────────────────────────────────────────────────
export const OUTBOX_KEY = 'sync_outbox';

// ─── Типи ─────────────────────────────────────────────────────────────────────
export interface OutboxItem {
  /** Added lazily for outbox rows created by pre-v2 app versions. */
  mutation_id?: string;
  collection: string;
  local_id: string;
  deleted: boolean;
  force?: boolean;
  queued_at: number;
}

let mutationSequence = 0;

export function createMutationId(): string {
  mutationSequence = (mutationSequence + 1) % 1_000_000;
  return `mob-${Date.now().toString(36)}-${mutationSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function ensureMutationIds(items: OutboxItem[]): OutboxItem[] {
  return items.map(item => item.mutation_id ? item : { ...item, mutation_id: createMutationId() });
}

// ─── Scheduler hook (встановлюється sync-engine, щоб уникнути циклічного імпорту) ─

/**
 * Відбиток ЦІЄЇ оцінки модуля.
 *
 * Модульний стан нижче переживає лише один екземпляр модуля. Якщо збірка
 * оцінить synced-storage вдруге (Fast Refresh, дубль у графі), екрани
 * сповіщатимуть один екземпляр, а планувальник стоятиме в іншому — outbox при
 * цьому спільний, бо він у AsyncStorage, тож симптом виглядає як «кнопка
 * працює, автоматика ні». Ідентифікатор робить цю підміну видимою.
 */
export const SYNCED_STORAGE_INSTANCE_ID = Math.random().toString(36).slice(2, 8);
recordStorageEval(SYNCED_STORAGE_INSTANCE_ID);

let _scheduleSync: (() => void) | null = null;
let _schedulerTag: SchedulerTag = 'none';

/**
 * `tag` не впливає ні на що, крім діагностики: реєстр однаково зберігає
 * передану функцію. Він потрібен тому, що cleanup рушія ставить сюди порожню
 * функцію, і ззовні «жива функція» від «заглушки» нічим не відрізняються —
 * обидві виглядають як встановлений планувальник.
 */
export function setSyncScheduler(fn: () => void, tag: 'live' | 'noop' = 'live'): void {
  _scheduleSync = fn;
  _schedulerTag = tag;
  recordSchedulerInstalled(tag, SYNCED_STORAGE_INSTANCE_ID);
}

function notifySyncScheduler(): void {
  recordNotify(_scheduleSync ? _schedulerTag : 'none');
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
  const stored = await loadData<OutboxItem[]>(OUTBOX_KEY, []);
  const upgraded = ensureMutationIds(stored);
  if (upgraded.some((item, index) => item !== stored[index])) {
    await saveData(OUTBOX_KEY, upgraded);
  }
  return upgraded;
}

export async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await saveData(OUTBOX_KEY, ensureMutationIds(items));
}

/** Додає нові записи до outbox, дедупліціруючи з наявними. */
export async function appendToOutbox(newItems: OutboxItem[]): Promise<void> {
  if (!newItems.length) return;
  const existing = await loadOutbox();
  const combined = deduplicateOutbox([...existing, ...ensureMutationIds(newItems)]);
  await saveOutbox(combined);
}

/** Remove only confirmed mutations, preserving a newer edit of the same row. */
export async function removeMutationsFromOutbox(mutationIds: Set<string>): Promise<void> {
  if (!mutationIds.size) return;
  const current = await loadOutbox();
  await saveOutbox(
    current.filter(item => !item.mutation_id || !mutationIds.has(item.mutation_id)),
  );
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
    mutation_id: createMutationId(),
    collection,
    local_id,
    deleted,
    force: force || undefined,
    queued_at: Date.now(),
  };
  await appendToOutbox([item]);
  notifySyncScheduler();
}

// ─── diffItems (чиста функція, тестабельна) ───────────────────────────────────

export interface DiffResult {
  changed: string[]; // local_ids нових або змінених
  deleted: string[]; // local_ids зниклих
}

/**
 * Порівняльний відбиток запису — БЕЗ `updatedAt`.
 *
 * `updatedAt` проставляється в сховищі (див. stampUpdatedAt), а екрани тримають
 * items у React-стані, завантаженому раніше. Якби `updatedAt` брав участь у
 * порівнянні, кожне збереження бачило б розбіжність «у сховищі штамп є, у стані
 * ще немає» і позначало б змінними геть усі записи колекції.
 */
function comparableJson(item: Record<string, unknown>): string {
  const { updatedAt: _ignored, ...rest } = item;
  return JSON.stringify(rest);
}

export function diffItems<T extends { id: string }>(
  prev: T[],
  next: T[],
): DiffResult {
  const prevMap = new Map(prev.map(i => [i.id, comparableJson(i)]));
  const nextMap = new Map(next.map(i => [i.id, comparableJson(i)]));

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

// ─── stampUpdatedAt (чиста функція, тестабельна) ─────────────────────────────

/** Будь-який синхронізований запис несе час останньої правки на клієнті. */
export interface Timestamped {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

/**
 * Проставляє `updatedAt` перед записом у сховище.
 *
 * - змінені/нові → поточний час;
 * - незмінені → зберігають наявний штамп;
 * - незмінені без штампа → бекфіл із `createdAt` (а якщо його немає — поточний
 *   час). Це ліниве доповнення для даних, створених до введення поля.
 *
 * Централізовано саме тут, щоб не правити 57 місць виклику saveSynced: усе, що
 * лягає в сховище, гарантовано має штамп, навіть якщо екран його не проставив.
 */
export function stampUpdatedAt<T extends Timestamped>(
  prev: T[],
  next: T[],
  changedIds: Set<string>,
  now: string,
): T[] {
  const prevById = new Map(prev.map(item => [item.id, item]));
  return next.map(item => {
    if (changedIds.has(item.id)) return { ...item, updatedAt: now };
    const existing = prevById.get(item.id)?.updatedAt ?? item.updatedAt;
    return { ...item, updatedAt: existing ?? item.createdAt ?? now };
  });
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
      map.set(si.local_id, { id: si.local_id, ...(si.data ?? {}) } as T);
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

  // Штампуємо updatedAt і зберігаємо. Робиться навіть коли змін немає — так
  // ліниво доповнюються записи, створені до введення поля.
  const stamped = stampUpdatedAt(
    existing as unknown as Timestamped[],
    items as unknown as Timestamped[],
    new Set(changed),
    new Date().toISOString(),
  );
  await saveData(key, stamped);

  // Якщо нема змін — не чіпаємо outbox
  if (!changed.length && !deleted.length) return;

  const now = Date.now();
  const outboxItems: OutboxItem[] = [];

  for (const id of changed) {
    outboxItems.push({
      mutation_id: createMutationId(), collection: key, local_id: id,
      deleted: false, queued_at: now,
    });
  }

  for (const id of deleted) {
    outboxItems.push({
      mutation_id: createMutationId(), collection: key, local_id: id,
      deleted: true, queued_at: now,
    });
  }

  await appendToOutbox(outboxItems);
  notifySyncScheduler();
}

// ─── saveSyncedValue (singleton) ──────────────────────────────────────────────

export async function saveSyncedValue(key: string, value: unknown): Promise<void> {
  await saveData(key, value);
  const item: OutboxItem = {
    mutation_id: createMutationId(),
    collection: key,
    local_id: key,
    deleted: false,
    queued_at: Date.now(),
  };
  await appendToOutbox([item]);
  notifySyncScheduler();
}
