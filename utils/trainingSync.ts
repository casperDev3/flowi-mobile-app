/**
 * utils/trainingSync.ts — потік групи тренувань на пристрої
 * (training-module.md §2.1: `POST /api/training-groups/{id}/sync/`).
 *
 * Стан групи (підтверджені записи + outbox) лежить ОДНИМ ключем на групу.
 * Ключі розведені за workspace і користувачем: інакше після зміни акаунта
 * на тому ж пристрої новий користувач побачив би кеш чужої групи — зокрема
 * чужі `workout_logs`, які бачить лише тренер.
 *
 * Логіка злиття — чиста й тестована (`utils/trainingStream.ts`); тут лише
 * сховище, блокування ключа і мережа.
 */
import { apiFetch, ApiError } from '@/store/api';
import { getCachedWorkspace } from '@/store/api-config';
import { loadData, removeData, saveData } from '@/store/storage';
import { withStorageLock } from '@/store/storage-lock';
import { assertTrainingSyncProtocol } from '@/store/sync-contract';
import { createMutationId } from '@/store/synced-storage';
import { uuidV4 } from '@/utils/uuid';

import { listTrainingGroups } from './trainingApi';
import type { TrainingGroupSummary } from './trainingTypes';
import {
  applySyncResponse,
  emptyGroupState,
  enqueueMutation,
  normalizeGroupState,
  PUSH_BATCH,
  type GroupStreamState,
  type TrainingSyncResponse,
} from './trainingStream';

/** Скільки сторінок pull/push за один виклик sync — страховка від вічного циклу. */
const MAX_ROUNDS = 25;

export function trainingScope(userId: string | number | null | undefined): string {
  const ws = getCachedWorkspace()?.workspaceId ?? 'default';
  return `${ws}:${userId ?? 'anon'}`;
}

export function groupStateKey(scope: string, groupId: string): string {
  return `training_group_v1:${scope}:${groupId}`;
}

export function groupsCacheKey(scope: string): string {
  return `training_groups_cache_v1:${scope}`;
}

// ── Список груп ────────────────────────────────────────────────────────────

export async function loadCachedGroups(scope: string): Promise<TrainingGroupSummary[]> {
  const raw = await loadData<unknown>(groupsCacheKey(scope), []);
  return Array.isArray(raw) ? (raw as TrainingGroupSummary[]) : [];
}

/** GET /training-groups/ + кеш. Групи, яких більше немає, прибирають і свій стан. */
export async function refreshGroups(scope: string): Promise<TrainingGroupSummary[]> {
  const fresh = await listTrainingGroups();
  const before = await loadCachedGroups(scope);
  await saveData(groupsCacheKey(scope), fresh);
  const alive = new Set(fresh.map(g => g.id));
  for (const gone of before.filter(g => !alive.has(g.id))) {
    await clearGroupState(scope, gone.id);
  }
  return fresh;
}

export async function upsertCachedGroup(scope: string, group: TrainingGroupSummary): Promise<void> {
  await withStorageLock(groupsCacheKey(scope), async () => {
    const list = await loadCachedGroups(scope);
    const next = list.some(g => g.id === group.id)
      ? list.map(g => (g.id === group.id ? { ...g, ...group } : g))
      : [...list, group];
    await saveData(groupsCacheKey(scope), next);
  });
}

export async function removeCachedGroup(scope: string, groupId: string): Promise<void> {
  await withStorageLock(groupsCacheKey(scope), async () => {
    const list = await loadCachedGroups(scope);
    await saveData(groupsCacheKey(scope), list.filter(g => g.id !== groupId));
  });
  await clearGroupState(scope, groupId);
}

// ── Стан групи ─────────────────────────────────────────────────────────────

export async function loadGroupState(scope: string, groupId: string): Promise<GroupStreamState> {
  const raw = await loadData<unknown>(groupStateKey(scope, groupId), null);
  return normalizeGroupState(raw, groupId);
}

async function mutateGroupState(
  scope: string,
  groupId: string,
  fn: (state: GroupStreamState) => GroupStreamState,
): Promise<GroupStreamState> {
  const key = groupStateKey(scope, groupId);
  return withStorageLock(key, async () => {
    const state = normalizeGroupState(await loadData<unknown>(key, null), groupId);
    const next = fn(state);
    if (next !== state) await saveData(key, next);
    return next;
  });
}

export async function clearGroupState(scope: string, groupId: string): Promise<void> {
  await withStorageLock(groupStateKey(scope, groupId), () => removeData(groupStateKey(scope, groupId)));
}

/** Локальний запис у потік групи: накладка одразу, сервер — на наступному sync. */
export async function writeGroupRecord(
  scope: string,
  groupId: string,
  collection: string,
  localId: string,
  data: Record<string, unknown>,
): Promise<GroupStreamState> {
  const now = new Date().toISOString();
  return mutateGroupState(scope, groupId, state =>
    enqueueMutation(state, {
      mutation_id: createMutationId(),
      collection,
      local_id: localId,
      operation: 'upsert',
      data: { ...data, updatedAt: now },
      client_updated_at: now,
    }),
  );
}

export async function deleteGroupRecord(
  scope: string,
  groupId: string,
  collection: string,
  localId: string,
): Promise<GroupStreamState> {
  const now = new Date().toISOString();
  return mutateGroupState(scope, groupId, state =>
    enqueueMutation(state, {
      mutation_id: createMutationId(),
      collection,
      local_id: localId,
      operation: 'delete',
      data: {},
      client_updated_at: now,
    }),
  );
}

// ── Синк ───────────────────────────────────────────────────────────────────

/** Група зникла для цього користувача: видалена, або його прибрали. */
export class TrainingGroupGoneError extends Error {
  constructor(public readonly groupId: string, public readonly code: string) {
    super(`training group ${groupId} is gone: ${code}`);
    this.name = 'TrainingGroupGoneError';
  }
}

const inFlight = new Map<string, Promise<GroupStreamState>>();

/**
 * Пуш outbox і пулл змін, доки сервер не скаже «все». Паралельні виклики
 * для тієї самої групи зливаються в один — інакше дві вкладки одночасно
 * відправили б ті самі мутації (ідемпотентно, але марно).
 */
export function syncGroup(scope: string, groupId: string): Promise<GroupStreamState> {
  const key = groupStateKey(scope, groupId);
  const running = inFlight.get(key);
  if (running) return running;
  const run = runSync(scope, groupId).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function runSync(scope: string, groupId: string): Promise<GroupStreamState> {
  let state = await loadGroupState(scope, groupId);
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const sent = state.outbox.slice(0, PUSH_BATCH);
    let res: TrainingSyncResponse;
    try {
      res = await apiFetch<TrainingSyncResponse>(`/training-groups/${encodeURIComponent(groupId)}/sync/`, {
        method: 'POST',
        body: {
          cursor: state.cursor,
          mutations: sent.map(m => ({
            mutation_id: m.mutation_id,
            collection: m.collection,
            local_id: m.local_id,
            operation: m.operation,
            data: m.data,
            base_revision: m.base_revision,
            client_updated_at: m.client_updated_at,
          })),
        },
      });
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'group_not_found' || e.code === 'not_a_member')) {
        await removeCachedGroup(scope, groupId);
        throw new TrainingGroupGoneError(groupId, e.code);
      }
      throw e;
    }
    assertTrainingSyncProtocol(res.training_sync_protocol);
    state = await mutateGroupState(scope, groupId, fresh => applySyncResponse(fresh, sent, res));
    const moreToPull = res.next_cursor !== null && res.next_cursor !== undefined;
    // Шлемо далі все, чого сервер у ЦЬОМУ раунді не бачив: нові правки й
    // перебазовані після конфлікту (це нові обʼєкти). Мутація, яку сервер
    // чомусь не згадав, лишається тим самим обʼєктом і циклу не крутить.
    // Порівняння за id і лічильником спроб, а не за посиланням: стан щойно
    // перечитано зі сховища, тож обʼєкти мутацій там уже інші.
    const sentAttempts = new Map(sent.map(m => [m.mutation_id, m.attempts ?? 0]));
    const morePush = state.outbox.some(
      m => !sentAttempts.has(m.mutation_id) || sentAttempts.get(m.mutation_id) !== (m.attempts ?? 0),
    );
    if (!moreToPull && !morePush) break;
  }
  return state;
}

/** Синк, що НЕ кидає: для фонових тригерів (фокус, після запису). */
export async function syncGroupQuietly(scope: string, groupId: string): Promise<GroupStreamState | null> {
  try {
    return await syncGroup(scope, groupId);
  } catch (e) {
    if (__DEV__ && !(e instanceof TrainingGroupGoneError)) console.warn('[training] sync failed', e);
    return null;
  }
}

/** Згенерувати id нового запису (`tp-…`, `q-…` тощо) у форматі `^[A-Za-z0-9_.:-]{1,64}$`. */
export function newTrainingId(prefix: string): string {
  return `${prefix}-${uuidV4()}`.slice(0, 64);
}

export { emptyGroupState };
