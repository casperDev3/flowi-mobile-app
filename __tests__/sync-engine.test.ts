/**
 * __tests__/sync-engine.test.ts — юніт-тести чистих функцій sync-engine/synced-storage.
 *
 * Тести охоплюють:
 *  - diffItems: нові/змінені/видалені id
 *  - deduplicateOutbox: дедуп за collection+local_id
 *  - applyPullItems: upsert/delete + skip-dirty
 *  - Tombstone: наявність після видалення
 */

import {
  diffItems,
  deduplicateOutbox,
  applyPullItems,
  ensureMutationIds,
  OutboxItem,
} from '@/store/synced-storage';
import { assertCompatibleSyncContract } from '@/store/sync-contract';
import { ApiError } from '@/store/api';
import {
  describeSyncError,
  isRetryableSyncError,
  normalizeSyncLocalId,
} from '@/store/sync-engine';

// ─── Мок AsyncStorage (аналогічно іншим тестам) ──────────────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
  multiGet: jest.fn(async () => []),
  multiSet: jest.fn(async () => {}),
}));

// Мок storage (saveSynced імпортує loadData/saveData)
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (_key: string, fallback: unknown) => fallback),
  saveData: jest.fn(async () => {}),
}));

describe('sync contract compatibility', () => {
  test('приймає поточну та legacy-відповідь без версії', () => {
    expect(() => assertCompatibleSyncContract(1)).not.toThrow();
    expect(() => assertCompatibleSyncContract(undefined)).not.toThrow();
  });

  test('зупиняє застосування несумісного контракту', () => {
    expect(() => assertCompatibleSyncContract(2)).toThrow('Unsupported sync contract 2');
  });
});

describe('sync error handling', () => {
  test('не повторює детерміновані 400-відповіді', () => {
    expect(isRetryableSyncError(new ApiError(400, 'invalid collection', 'invalid collection'))).toBe(false);
  });

  test('повторює мережеві, rate-limit та серверні помилки', () => {
    expect(isRetryableSyncError(new ApiError(0, 'network', 'Network request failed'))).toBe(true);
    expect(isRetryableSyncError(new ApiError(429, 'throttled', 'Too many requests'))).toBe(true);
    expect(isRetryableSyncError(new ApiError(503, 'unavailable', 'Unavailable'))).toBe(true);
  });

  test('логує безпечні деталі відхиленої колекції', () => {
    const error = new ApiError(400, 'invalid collection', 'invalid collection', {
      error: 'invalid collection',
      invalid: 'legacy_collection',
    });
    expect(describeSyncError(error)).toEqual({
      status: 400,
      code: 'invalid collection',
      message: 'invalid collection',
      invalid: 'legacy_collection',
    });
  });
});

describe('sync local id normalization', () => {
  test('відсікає legacy-записи без id та надто довгі id', () => {
    expect(normalizeSyncLocalId(undefined)).toBeNull();
    expect(normalizeSyncLocalId(null)).toBeNull();
    expect(normalizeSyncLocalId('')).toBeNull();
    expect(normalizeSyncLocalId('x'.repeat(65))).toBeNull();
  });

  test('нормалізує старі числові id та зберігає валідні рядки', () => {
    expect(normalizeSyncLocalId(123)).toBe('123');
    expect(normalizeSyncLocalId('task-1')).toBe('task-1');
  });
});

// ─── diffItems ────────────────────────────────────────────────────────────────

describe('diffItems', () => {
  const makeItem = (id: string, val: number) => ({ id, val });

  test('порожні масиви — нема змін', () => {
    expect(diffItems([], [])).toEqual({ changed: [], deleted: [] });
  });

  test('новий елемент → changed', () => {
    const result = diffItems([], [makeItem('a', 1)]);
    expect(result.changed).toEqual(['a']);
    expect(result.deleted).toEqual([]);
  });

  test('видалений елемент → deleted', () => {
    const result = diffItems([makeItem('a', 1)], []);
    expect(result.changed).toEqual([]);
    expect(result.deleted).toEqual(['a']);
  });

  test('змінений елемент → changed', () => {
    const result = diffItems([makeItem('a', 1)], [makeItem('a', 2)]);
    expect(result.changed).toEqual(['a']);
    expect(result.deleted).toEqual([]);
  });

  test('незмінений елемент — не потрапляє ні в changed ні в deleted', () => {
    const result = diffItems([makeItem('a', 1)], [makeItem('a', 1)]);
    expect(result.changed).toEqual([]);
    expect(result.deleted).toEqual([]);
  });

  test('змішаний сценарій', () => {
    const prev = [makeItem('keep', 5), makeItem('change', 1), makeItem('del', 9)];
    const next = [makeItem('keep', 5), makeItem('change', 2), makeItem('new', 3)];
    const result = diffItems(prev, next);
    expect(result.changed).toContain('change');
    expect(result.changed).toContain('new');
    expect(result.changed).not.toContain('keep');
    expect(result.deleted).toEqual(['del']);
  });
});

// ─── deduplicateOutbox ────────────────────────────────────────────────────────

describe('deduplicateOutbox', () => {
  const makeItem = (collection: string, local_id: string, deleted = false, force = false): OutboxItem => ({
    collection,
    local_id,
    deleted,
    force: force || undefined,
    queued_at: Date.now(),
  });

  test('без дублів — повертає всі', () => {
    const items = [makeItem('tasks', 'a'), makeItem('tasks', 'b')];
    expect(deduplicateOutbox(items)).toHaveLength(2);
  });

  test('дубль — залишає останній', () => {
    const items = [
      { ...makeItem('tasks', 'a'), queued_at: 1 },
      { ...makeItem('tasks', 'a'), queued_at: 2 },
    ];
    const result = deduplicateOutbox(items);
    expect(result).toHaveLength(1);
    expect(result[0].queued_at).toBe(2);
  });

  test('deleted має пріоритет над non-deleted', () => {
    const items = [
      makeItem('tasks', 'a', false),
      makeItem('tasks', 'a', true),
    ];
    const result = deduplicateOutbox(items);
    expect(result).toHaveLength(1);
    expect(result[0].deleted).toBe(true);
  });

  test('force має пріоритет над звичайним', () => {
    const items = [
      makeItem('tasks', 'a', false, false),
      makeItem('tasks', 'a', false, true),
    ];
    const result = deduplicateOutbox(items);
    expect(result).toHaveLength(1);
    expect(result[0].force).toBe(true);
  });

  test('різні колекції — зберігаються обидва', () => {
    const items = [makeItem('tasks', 'a'), makeItem('notes', 'a')];
    expect(deduplicateOutbox(items)).toHaveLength(2);
  });
});

describe('protocol v2 outbox ids', () => {
  test('додає id старим outbox-записам і зберігає наявний id', () => {
    const upgraded = ensureMutationIds([
      { collection: 'tasks', local_id: 'old', deleted: false, queued_at: 1 },
      { mutation_id: 'stable-id', collection: 'tasks', local_id: 'new', deleted: false, queued_at: 2 },
    ]);
    expect(upgraded[0].mutation_id).toBeTruthy();
    expect(upgraded[0].mutation_id!.length).toBeLessThanOrEqual(64);
    expect(upgraded[1].mutation_id).toBe('stable-id');
  });
});

// ─── applyPullItems ───────────────────────────────────────────────────────────

describe('applyPullItems', () => {
  const mkLocal = (id: string, val: number) => ({ id, val });

  test('upsert нового елемента', () => {
    const local = [mkLocal('a', 1)];
    const serverItems = [{ local_id: 'b', data: { id: 'b', val: 2 }, deleted: false }];
    const result = applyPullItems(local, serverItems, new Set(), 'tasks');
    expect(result).toHaveLength(2);
    expect(result.find(i => i.id === 'b')).toBeTruthy();
  });

  test('відновлює id, коли web payload його не містить', () => {
    const result = applyPullItems([], [
      { local_id: 'from-web', data: { title: 'Web task' }, deleted: false },
    ], new Set(), 'tasks');
    expect(result[0]).toEqual({ id: 'from-web', title: 'Web task' });
  });

  test('upsert існуючого елемента', () => {
    const local = [mkLocal('a', 1)];
    const serverItems = [{ local_id: 'a', data: { id: 'a', val: 99 }, deleted: false }];
    const result = applyPullItems(local, serverItems, new Set(), 'tasks');
    expect(result).toHaveLength(1);
    expect((result[0] as any).val).toBe(99);
  });

  test('видалення елемента', () => {
    const local = [mkLocal('a', 1), mkLocal('b', 2)];
    const serverItems = [{ local_id: 'a', data: null, deleted: true }];
    const result = applyPullItems(local, serverItems, new Set(), 'tasks');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  test('skip-dirty: елемент у outbox не перезаписується', () => {
    const local = [mkLocal('a', 1)];
    const serverItems = [{ local_id: 'a', data: { id: 'a', val: 99 }, deleted: false }];
    const dirtyIds = new Set(['tasks:a']);
    const result = applyPullItems(local, serverItems, dirtyIds, 'tasks');
    expect(result).toHaveLength(1);
    expect((result[0] as any).val).toBe(1); // не перезаписано
  });

  test('skip-dirty: видалений з сервера, але dirty → залишається', () => {
    const local = [mkLocal('a', 1)];
    const serverItems = [{ local_id: 'a', data: null, deleted: true }];
    const dirtyIds = new Set(['tasks:a']);
    const result = applyPullItems(local, serverItems, dirtyIds, 'tasks');
    expect(result).toHaveLength(1);
  });

  test('порожній serverItems — повертає local без змін', () => {
    const local = [mkLocal('a', 1), mkLocal('b', 2)];
    const result = applyPullItems(local, [], new Set(), 'tasks');
    expect(result).toEqual(local);
  });
});
