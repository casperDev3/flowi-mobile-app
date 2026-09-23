/**
 * Потік групи тренувань на клієнті: накладка outbox, підтвердження,
 * конфлікти й відхилення (utils/trainingStream.ts).
 */
import {
  applySyncResponse,
  collectionView,
  emptyGroupState,
  enqueueMutation,
  MAX_REBASE_ATTEMPTS,
  normalizeGroupState,
  recordView,
  type GroupStreamState,
  type TrainingSyncResponse,
} from '@/utils/trainingStream';

const NOW = '2026-10-06T08:00:00.000Z';

function res(partial: Partial<TrainingSyncResponse>): TrainingSyncResponse {
  return {
    group_id: 'g-1', role: 'member', cursor: 10, changes: [], acknowledged: [], conflicts: [], rejected: [],
    next_cursor: null, ...partial,
  };
}

function withServerItem(state: GroupStreamState, collection: string, localId: string, data: object, revision: number) {
  return applySyncResponse(state, [], res({
    changes: [{ collection, local_id: localId, data: data as Record<string, unknown>, deleted: false, revision }],
  }), NOW);
}

describe('накладка outbox', () => {
  it('локальна правка видна одразу, base_revision — підтверджена ревізія', () => {
    let s = withServerItem(emptyGroupState('g-1'), 'quests', 'q-1', { id: 'q-1', title: 'A' }, 3);
    s = enqueueMutation(s, {
      mutation_id: 'm1', collection: 'quests', local_id: 'q-1', operation: 'upsert',
      data: { id: 'q-1', title: 'B' }, client_updated_at: NOW,
    });
    expect(recordView<{ title: string }>(s, 'quests', 'q-1')?.title).toBe('B');
    expect(s.outbox[0].base_revision).toBe(3);
  });

  it('друга правка того самого запису замінює першу в outbox', () => {
    let s = emptyGroupState('g-1');
    for (const [id, title] of [['m1', 'A'], ['m2', 'B']]) {
      s = enqueueMutation(s, {
        mutation_id: id, collection: 'quests', local_id: 'q-1', operation: 'upsert',
        data: { id: 'q-1', title }, client_updated_at: NOW,
      });
    }
    expect(s.outbox.map(m => m.mutation_id)).toEqual(['m2']);
  });

  it('видалення ховає запис у view', () => {
    let s = withServerItem(emptyGroupState('g-1'), 'quests', 'q-1', { id: 'q-1' }, 1);
    s = enqueueMutation(s, {
      mutation_id: 'm1', collection: 'quests', local_id: 'q-1', operation: 'delete', data: {}, client_updated_at: NOW,
    });
    expect(collectionView(s, 'quests')).toEqual([]);
  });
});

describe('відповідь сервера', () => {
  const base = () => enqueueMutation(emptyGroupState('g-1'), {
    mutation_id: 'm1', collection: 'workout_logs', local_id: 'wl-1', operation: 'upsert',
    data: { id: 'wl-1', userId: 12, status: 'completed' }, client_updated_at: NOW,
  });

  it('applied — запис підтверджено, outbox порожній, курсор і роль оновлено', () => {
    const s0 = base();
    const s = applySyncResponse(s0, s0.outbox, res({
      role: 'member', cursor: 42,
      acknowledged: [{ status: 'applied', mutation_id: 'm1', collection: 'workout_logs', local_id: 'wl-1', revision: 1 }],
    }), NOW);
    expect(s.outbox).toEqual([]);
    expect(s.items['workout_logs/wl-1'].revision).toBe(1);
    expect(s.cursor).toBe(42);
    expect(s.role).toBe('member');
    expect(s.lastSyncedAt).toBe(NOW);
  });

  it('rejected — мутація зникає, під нею знову серверна версія, причину видно', () => {
    let s0 = withServerItem(emptyGroupState('g-1'), 'quests', 'q-1', { id: 'q-1', title: 'server' }, 2);
    s0 = enqueueMutation(s0, {
      mutation_id: 'm1', collection: 'quests', local_id: 'q-1', operation: 'upsert',
      data: { id: 'q-1', title: 'mine' }, client_updated_at: NOW,
    });
    const s = applySyncResponse(s0, s0.outbox, res({
      rejected: [{ status: 'rejected', mutation_id: 'm1', collection: 'quests', local_id: 'q-1', reason: 'forbidden' }],
    }), NOW);
    expect(recordView<{ title: string }>(s, 'quests', 'q-1')?.title).toBe('server');
    expect(s.rejected[0].reason).toBe('forbidden');
  });

  it('conflict — перебазування на серверну ревізію, після ліміту перемагає сервер', () => {
    let s = base();
    for (let i = 1; i <= MAX_REBASE_ATTEMPTS; i += 1) {
      const sent = s.outbox;
      s = applySyncResponse(s, sent, res({
        conflicts: [{
          status: 'conflict', mutation_id: 'm1', collection: 'workout_logs', local_id: 'wl-1',
          server: { collection: 'workout_logs', local_id: 'wl-1', data: { id: 'wl-1', status: 'partial' }, deleted: false, revision: 4 + i },
        }],
      }), NOW);
      expect(s.outbox).toHaveLength(1);
      expect(s.outbox[0].base_revision).toBe(4 + i);
      expect(s.outbox[0].attempts).toBe(i);
    }
    s = applySyncResponse(s, s.outbox, res({
      conflicts: [{
        status: 'conflict', mutation_id: 'm1', collection: 'workout_logs', local_id: 'wl-1',
        server: { collection: 'workout_logs', local_id: 'wl-1', data: { id: 'wl-1', status: 'partial' }, deleted: false, revision: 9 },
      }],
    }), NOW);
    expect(s.outbox).toEqual([]);
    expect(recordView<{ status: string }>(s, 'workout_logs', 'wl-1')?.status).toBe('partial');
  });

  it('мутація, поставлена поки запит летів, лишається і отримує свіжу базу', () => {
    const s0 = base();
    const sent = s0.outbox;
    const s1 = enqueueMutation(s0, {
      mutation_id: 'm2', collection: 'quests', local_id: 'q-9', operation: 'upsert',
      data: { id: 'q-9' }, client_updated_at: NOW,
    });
    const s = applySyncResponse(s1, sent, res({
      acknowledged: [{ status: 'applied', mutation_id: 'm1', collection: 'workout_logs', local_id: 'wl-1', revision: 1 }],
    }), NOW);
    expect(s.outbox.map(m => m.mutation_id)).toEqual(['m2']);
  });

  it('змінена сторінка pull не позначає синк завершеним', () => {
    const s = applySyncResponse(emptyGroupState('g-1'), [], res({ cursor: 900, next_cursor: 500 }), NOW);
    expect(s.cursor).toBe(500);
    expect(s.lastSyncedAt).toBeNull();
  });

  it('старіша ревізія з changes не перетирає свіжішу', () => {
    let s = withServerItem(emptyGroupState('g-1'), 'quests', 'q-1', { v: 2 }, 5);
    s = withServerItem(s, 'quests', 'q-1', { v: 1 }, 4);
    expect(recordView<{ v: number }>(s, 'quests', 'q-1')?.v).toBe(2);
  });
});

it('normalizeGroupState витримує сміття', () => {
  expect(normalizeGroupState('x', 'g').outbox).toEqual([]);
  expect(normalizeGroupState({ cursor: -1, role: 'owner', outbox: [null, { mutation_id: 'a' }] }, 'g')).toMatchObject({
    cursor: 0, role: null, outbox: [{ mutation_id: 'a' }],
  });
});
