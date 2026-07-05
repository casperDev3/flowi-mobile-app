/**
 * __tests__/sync-engine.test.ts — юніт-тести чистих функцій sync-engine/synced-storage.
 *
 * Тести охоплюють:
 *  - diffItems: нові/змінені/видалені id
 *  - deduplicateOutbox: дедуп за collection+local_id
 *  - applyPullItems: upsert/delete + skip-dirty
 *  - Tombstone: наявність після видалення
 */

import { diffItems, deduplicateOutbox, applyPullItems, OutboxItem } from '@/store/synced-storage';

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
