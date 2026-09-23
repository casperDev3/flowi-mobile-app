/**
 * utils/trainingStream.ts — чиста логіка потоку групи тренувань
 * (training-module.md §2): кеш підтверджених записів, outbox мутацій і
 * застосування відповіді `POST /training-groups/{id}/sync/`.
 *
 * Чому окремий кеш, а не особисті ключі сховища: §0.1 — колекції групового
 * потоку не можуть лягати в ті самі локальні ключі, що й особисті, а при
 * виході з групи (`access_revoked`) клієнт мусить прибрати їх цілком. Тому
 * весь потік групи — один обʼєкт стану на групу.
 *
 * Модель — «сервер + накладка»: `items` тримає лише ПІДТВЕРДЖЕНІ сервером
 * записи з їхніми ревізіями, `outbox` — локальні мутації, які ще не
 * доїхали. Екран бачить `items`, поверх яких накладено outbox. Звідси
 * відкат відхиленої мутації безкоштовний: її просто прибирають з outbox, і
 * під нею знову видно серверну версію.
 */
import type { TrainingRole } from './trainingTypes';

export type TrainingCollectionName =
  | 'training_groups'
  | 'training_exercises'
  | 'training_programs'
  | 'training_assignments'
  | 'quests'
  | 'quest_progress'
  | 'workout_logs'
  | 'training_comments';

export interface StreamItem {
  collection: string;
  local_id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  revision: number;
  change_seq?: number;
  updated_by?: string | null;
}

export interface TrainingMutation {
  mutation_id: string;
  collection: string;
  local_id: string;
  operation: 'upsert' | 'delete';
  data: Record<string, unknown>;
  base_revision: number | null;
  client_updated_at: string;
  /** Скільки разів мутацію вже перебазовували після конфлікту. */
  attempts?: number;
}

export interface RejectedMutation {
  collection: string;
  local_id: string;
  reason: string;
  at: string;
}

export interface GroupStreamState {
  groupId: string;
  cursor: number;
  role: TrainingRole | null;
  items: Record<string, StreamItem>;
  outbox: TrainingMutation[];
  /** Останні відхилення — щоб екран міг сказати, чому правка не прижилась. */
  rejected: RejectedMutation[];
  lastSyncedAt: string | null;
}

/** Після стількох перебазувань мутація здається й віддає перемогу серверу. */
export const MAX_REBASE_ATTEMPTS = 3;
export const MAX_REJECTED_KEPT = 20;
/** Верхня межа пушу за один запит (сервер приймає до 1000). */
export const PUSH_BATCH = 200;

export function itemKey(collection: string, localId: string): string {
  return `${collection}/${localId}`;
}

export function emptyGroupState(groupId: string): GroupStreamState {
  return { groupId, cursor: 0, role: null, items: {}, outbox: [], rejected: [], lastSyncedAt: null };
}

/** Захист від будь-якого сміття у сховищі: читаємо, що можна, решту — типово. */
export function normalizeGroupState(raw: unknown, groupId: string): GroupStreamState {
  if (!raw || typeof raw !== 'object') return emptyGroupState(groupId);
  const r = raw as Partial<GroupStreamState>;
  return {
    groupId,
    cursor: typeof r.cursor === 'number' && r.cursor >= 0 ? r.cursor : 0,
    role: r.role === 'coach' || r.role === 'member' ? r.role : null,
    items: r.items && typeof r.items === 'object' ? r.items : {},
    outbox: Array.isArray(r.outbox) ? r.outbox.filter(m => m && typeof m === 'object' && m.mutation_id) : [],
    rejected: Array.isArray(r.rejected) ? r.rejected : [],
    lastSyncedAt: typeof r.lastSyncedAt === 'string' ? r.lastSyncedAt : null,
  };
}

/**
 * Поставити мутацію в outbox. Попередня неdoїхала мутація того самого
 * запису замінюється (сервер все одно побачив би лише останній стан), але
 * `base_revision` береться з ПІДТВЕРДЖЕНОЇ ревізії — не з накладки.
 */
export function enqueueMutation(
  state: GroupStreamState,
  mutation: Omit<TrainingMutation, 'base_revision'>,
): GroupStreamState {
  const key = itemKey(mutation.collection, mutation.local_id);
  const confirmed = state.items[key];
  const baseRevision = confirmed ? confirmed.revision : null;
  const outbox = state.outbox.filter(
    m => !(m.collection === mutation.collection && m.local_id === mutation.local_id),
  );
  outbox.push({ ...mutation, base_revision: baseRevision, attempts: 0 });
  return { ...state, outbox };
}

/** Записи колекції з накладеним outbox, без видалених. */
export function collectionView<T>(state: GroupStreamState, collection: string): T[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const item of Object.values(state.items)) {
    if (item.collection !== collection || item.deleted) continue;
    map.set(item.local_id, item.data);
  }
  for (const m of state.outbox) {
    if (m.collection !== collection) continue;
    if (m.operation === 'delete') map.delete(m.local_id);
    else map.set(m.local_id, m.data);
  }
  return [...map.values()] as T[];
}

export function recordView<T>(state: GroupStreamState, collection: string, localId: string): T | null {
  const pending = [...state.outbox].reverse().find(m => m.collection === collection && m.local_id === localId);
  if (pending) return pending.operation === 'delete' ? null : (pending.data as T);
  const item = state.items[itemKey(collection, localId)];
  return item && !item.deleted ? (item.data as T) : null;
}

export function confirmedRevision(state: GroupStreamState, collection: string, localId: string): number | null {
  return state.items[itemKey(collection, localId)]?.revision ?? null;
}

export function isPending(state: GroupStreamState, collection: string, localId: string): boolean {
  return state.outbox.some(m => m.collection === collection && m.local_id === localId);
}

// ── Відповідь сервера ──────────────────────────────────────────────────────

export interface SyncChange {
  collection: string;
  local_id: string;
  data: Record<string, unknown>;
  deleted: boolean;
  revision: number;
  change_seq?: number;
  updated_by?: string | null;
}

export interface SyncAck {
  status: 'applied';
  mutation_id: string;
  collection: string;
  local_id: string;
  revision: number;
  change_seq?: number;
}

export interface SyncConflict {
  status: 'conflict';
  mutation_id: string;
  collection: string;
  local_id: string;
  server: SyncChange | null;
}

export interface SyncRejected {
  status: 'rejected';
  mutation_id: string;
  collection: string;
  local_id: string;
  reason: string;
  detail?: string;
}

export interface TrainingSyncResponse {
  training_sync_protocol?: number;
  group_id: string;
  role: TrainingRole;
  cursor: number;
  changes: SyncChange[];
  acknowledged: SyncAck[];
  conflicts: SyncConflict[];
  rejected: SyncRejected[];
  next_cursor: number | null;
}

/**
 * Застосувати відповідь до стану. `sent` — мутації, що пішли в ЦЬОМУ
 * запиті (outbox міг поповнитись, поки запит летів — ті лишаються).
 *
 * - `applied`: запис стає підтвердженим з даними мутації й новою ревізією
 *   (якщо в `changes` того ж запиту приїхала ще свіжіша версія — вона
 *   перепише це нижче, бо `changes` застосовуються ПІСЛЯ).
 * - `conflict`: серверна версія стає підтвердженою, мутація перебазовується
 *   на її ревізію і лишається в outbox (LWW на користь локальної дії — це
 *   дія самої людини, а не фонова синхронізація). Після MAX_REBASE_ATTEMPTS
 *   перемагає сервер.
 * - `rejected`: мутація зникає; під нею знову видно серверну версію.
 */
export function applySyncResponse(
  state: GroupStreamState,
  sent: readonly TrainingMutation[],
  res: TrainingSyncResponse,
  now: string = new Date().toISOString(),
): GroupStreamState {
  const items = { ...state.items };
  const sentById = new Map(sent.map(m => [m.mutation_id, m]));
  const done = new Set<string>();
  const rebased = new Map<string, TrainingMutation>();
  const rejected = [...state.rejected];

  for (const ack of res.acknowledged ?? []) {
    const m = sentById.get(ack.mutation_id);
    done.add(ack.mutation_id);
    if (!m) continue;
    const key = itemKey(m.collection, m.local_id);
    const prev = items[key];
    if (prev && prev.revision > ack.revision) continue;
    items[key] = {
      collection: m.collection,
      local_id: m.local_id,
      data: m.operation === 'delete' ? (prev?.data ?? {}) : m.data,
      deleted: m.operation === 'delete',
      revision: ack.revision,
      change_seq: ack.change_seq,
    };
  }

  for (const conflict of res.conflicts ?? []) {
    const m = sentById.get(conflict.mutation_id);
    done.add(conflict.mutation_id);
    const key = itemKey(conflict.collection, conflict.local_id);
    if (conflict.server) {
      items[key] = { ...conflict.server, collection: conflict.collection, local_id: conflict.local_id };
    }
    if (!m) continue;
    const attempts = (m.attempts ?? 0) + 1;
    if (attempts > MAX_REBASE_ATTEMPTS) continue;
    rebased.set(m.mutation_id, {
      ...m,
      attempts,
      base_revision: conflict.server ? conflict.server.revision : null,
    });
  }

  for (const r of res.rejected ?? []) {
    done.add(r.mutation_id);
    rejected.push({ collection: r.collection, local_id: r.local_id, reason: r.reason, at: now });
  }

  for (const change of res.changes ?? []) {
    const key = itemKey(change.collection, change.local_id);
    const prev = items[key];
    if (prev && prev.revision > change.revision) continue;
    items[key] = { ...change };
  }

  const outbox: TrainingMutation[] = [];
  for (const m of state.outbox) {
    if (rebased.has(m.mutation_id)) {
      // Поки запит летів, того самого запису могла торкнутись новіша правка —
      // тоді перебазована стара вже не потрібна.
      const newer = state.outbox.some(
        o => o !== m && o.collection === m.collection && o.local_id === m.local_id && !sentById.has(o.mutation_id),
      );
      if (!newer) outbox.push(rebased.get(m.mutation_id) as TrainingMutation);
      continue;
    }
    if (done.has(m.mutation_id)) continue;
    if (sentById.has(m.mutation_id)) {
      // Сервер не згадав мутацію взагалі — лишаємо на наступну спробу.
      outbox.push(m);
      continue;
    }
    // Нова мутація, що зʼявилась, поки запит летів: її базу підтягуємо до
    // щойно підтвердженої ревізії, інакше вона гарантовано дасть конфлікт.
    const confirmed = items[itemKey(m.collection, m.local_id)];
    outbox.push(confirmed ? { ...m, base_revision: confirmed.revision } : m);
  }

  return {
    ...state,
    items,
    outbox,
    role: res.role ?? state.role,
    cursor: res.next_cursor ?? res.cursor ?? state.cursor,
    rejected: rejected.slice(-MAX_REJECTED_KEPT),
    lastSyncedAt: res.next_cursor ? state.lastSyncedAt : now,
  };
}
