/**
 * __tests__/synced-local-changes.test.ts — збереження лише локальних змін.
 *
 * Регресія на «задача, додана на вебі, зникає з телефона»: екран Завдань
 * зберігав увесь свій масив через saveSynced, а той дифав його зі сховищем.
 * Масив екрана, завантажений до пулу, не містив веб-задачі — і вона йшла на
 * сервер як видалена. Тепер діфаються два стани ЕКРАНА (до/після дії), а
 * результат накладається на свіжий вміст сховища по полях.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  }),
  saveData: jest.fn(async (key: string, data: unknown) => {
    mockStore.set(key, JSON.stringify(data));
  }),
}));

import {
  applyLocalChanges,
  diffLocalChanges,
  saveSyncedChanges,
  updateSynced,
  type OutboxItem,
} from '@/store/synced-storage';
import { withStorageLock } from '@/store/storage-lock';

interface Row {
  id: string;
  title?: string;
  status?: string;
  note?: string;
  updatedAt?: string;
}

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

const outbox = () => read<OutboxItem[]>('sync_outbox', []);

beforeEach(() => {
  mockStore.clear();
});

describe('diffLocalChanges', () => {
  test('незмінені записи (те саме посилання) не потрапляють у зміни', () => {
    const a: Row = { id: 'a', title: 'A' };
    const b: Row = { id: 'b', title: 'B' };
    const changes = diffLocalChanges([a, b], [a, { ...b, title: 'B2' }]);
    expect(changes.upserts.map(u => u.id)).toEqual(['b']);
    expect(changes.upserts[0].patch).toEqual({ title: 'B2' });
    expect(changes.deletes).toEqual([]);
  });

  test('копія без реальних змін — теж не зміна', () => {
    const a: Row = { id: 'a', title: 'A' };
    expect(diffLocalChanges([a], [{ ...a }]).upserts).toEqual([]);
  });

  test('прибране поле потрапляє в removed', () => {
    const changes = diffLocalChanges<Row>([{ id: 'a', note: 'x' }], [{ id: 'a', note: undefined }]);
    expect(changes.upserts[0].removed).toEqual(['note']);
  });

  test('updatedAt не рахується зміною', () => {
    const changes = diffLocalChanges<Row>(
      [{ id: 'a', title: 'A' }],
      [{ id: 'a', title: 'A', updatedAt: '2026-01-01T00:00:00.000Z' }],
    );
    expect(changes.upserts).toEqual([]);
  });

  test('видалення — лише те, що було в попередньому стані екрана', () => {
    const changes = diffLocalChanges<Row>([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]);
    expect(changes.deletes).toEqual(['b']);
  });
});

describe('applyLocalChanges', () => {
  test('поле, змінене локально, накладається на свіжу версію — чужі поля лишаються', () => {
    const stored: Row[] = [{ id: 'a', title: 'A', status: 'done' }]; // status змінили на вебі
    const changes = diffLocalChanges<Row>([{ id: 'a', title: 'A', status: 'active' }], [
      { id: 'a', title: 'A (тел.)', status: 'active' },
    ]);
    const { next, changed } = applyLocalChanges(stored, changes);
    expect(next).toEqual([{ id: 'a', title: 'A (тел.)', status: 'done' }]);
    expect(changed).toEqual(['a']);
  });

  test('новий запис на початку стану іде на початок, у кінці — в кінець', () => {
    const base: Row[] = [{ id: 'a' }];
    const changes = diffLocalChanges<Row>(base, [{ id: 'new1' }, base[0], { id: 'new2' }]);
    const { next } = applyLocalChanges<Row>([{ id: 'web' }, { id: 'a' }], changes);
    expect(next.map(r => r.id)).toEqual(['new1', 'web', 'a', 'new2']);
  });

  test('повторне застосування тих самих змін нічого не змінює', () => {
    const changes = diffLocalChanges<Row>([{ id: 'a', title: 'A' }], [{ id: 'a', title: 'B' }]);
    const first = applyLocalChanges<Row>([{ id: 'a', title: 'A' }], changes);
    const second = applyLocalChanges(first.next, changes);
    expect(second.changed).toEqual([]);
    expect(second.deleted).toEqual([]);
  });

  test('локально правлений запис, видалений деінде, відновлюється цілком', () => {
    const changes = diffLocalChanges<Row>([{ id: 'a', title: 'A', note: 'n' }], [
      { id: 'a', title: 'B', note: 'n' },
    ]);
    const { next, changed } = applyLocalChanges<Row>([], changes);
    expect(next).toEqual([{ id: 'a', title: 'B', note: 'n' }]);
    expect(changed).toEqual(['a']);
  });

  test('видалення того, чого вже немає, — не зміна', () => {
    const changes = diffLocalChanges<Row>([{ id: 'a' }], []);
    expect(applyLocalChanges<Row>([{ id: 'b' }], changes).deleted).toEqual([]);
  });
});

describe('saveSyncedChanges', () => {
  test('застарілий стан екрана НЕ видаляє задачу, додану на вебі', async () => {
    // Екран завантажив [a]; тим часом пул синку поклав у сховище веб-задачу.
    const screenBefore: Row[] = [{ id: 'a', title: 'A', status: 'active' }];
    seed('tasks', [...screenBefore, { id: 'web', title: 'з вебу', status: 'active' }]);

    // Користувач відмітив «a» готовою у своєму застарілому стані.
    const screenAfter: Row[] = [{ ...screenBefore[0], status: 'done' }];
    const saved = await saveSyncedChanges('tasks', screenBefore, screenAfter);

    const stored = read<Row[]>('tasks', []);
    expect(stored.map(r => r.id)).toEqual(['a', 'web']);
    expect(stored.find(r => r.id === 'a')?.status).toBe('done');
    expect(saved?.map(r => r.id)).toEqual(['a', 'web']);
    // В outbox — лише справді змінений запис, жодних видалень.
    expect(outbox().map(o => `${o.local_id}:${o.deleted}`)).toEqual(['a:false']);
  });

  test('застарілий стан не відкочує чужу відмітку «готово» на іншому записі', async () => {
    const screenBefore: Row[] = [{ id: 'a', status: 'active' }, { id: 'b', title: 'B', status: 'active' }];
    seed('tasks', [{ id: 'a', status: 'done' }, { id: 'b', title: 'B', status: 'active' }]);

    await saveSyncedChanges('tasks', screenBefore, [screenBefore[0], { ...screenBefore[1], title: 'B2' }]);

    const stored = read<Row[]>('tasks', []);
    expect(stored.find(r => r.id === 'a')?.status).toBe('done');
    expect(stored.find(r => r.id === 'b')?.title).toBe('B2');
    expect(outbox().map(o => o.local_id)).toEqual(['b']);
  });

  test('локальне видалення йде в outbox як deleted', async () => {
    seed('tasks', [{ id: 'a' }, { id: 'b' }]);
    await saveSyncedChanges<Row>('tasks', [{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]);
    expect(read<Row[]>('tasks', []).map(r => r.id)).toEqual(['a']);
    expect(outbox().map(o => `${o.local_id}:${o.deleted}`)).toEqual(['b:true']);
  });

  test('без змін — жодного запису і жодного outbox', async () => {
    const rows: Row[] = [{ id: 'a' }];
    const saved = await saveSyncedChanges('tasks', rows, rows);
    expect(saved).toBeNull();
    expect(mockStore.has('tasks')).toBe(false);
    expect(outbox()).toEqual([]);
  });

  test('змінений запис отримує свіжий updatedAt, решта — зберігає свій', async () => {
    seed('tasks', [
      { id: 'a', title: 'A', updatedAt: '2020-01-01T00:00:00.000Z' },
      { id: 'b', title: 'B', updatedAt: '2020-01-01T00:00:00.000Z' },
    ]);
    const before: Row[] = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }];
    await saveSyncedChanges('tasks', before, [{ id: 'a', title: 'A2' }, before[1]]);
    const stored = read<Row[]>('tasks', []);
    expect(stored.find(r => r.id === 'a')?.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(stored.find(r => r.id === 'b')?.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('withStorageLock', () => {
  test('операції одного ключа виконуються по черзі, помилка не блокує чергу', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });

    const first = withStorageLock('k', async () => { order.push('1:start'); await gate; order.push('1:end'); });
    const failing = withStorageLock('k', async () => { order.push('2'); throw new Error('boom'); });
    const third = withStorageLock('k', async () => { order.push('3'); });
    const other = withStorageLock('other', async () => { order.push('other'); });

    await other;
    expect(order).toEqual(['1:start', 'other']);
    release();
    await first;
    await expect(failing).rejects.toThrow('boom');
    await third;
    expect(order).toEqual(['1:start', 'other', '1:end', '2', '3']);
  });
});

// Регресія: «loadData → saveSynced» поза блокуванням. Pull, що ліг між читанням
// екрана і записом, saveSynced бачив як `existing`, а в `next` його не було —
// і щойно створена на вебі задача їхала на сервер як DELETE.
describe('updateSynced', () => {
  test('pull, поставлений у чергу раніше, видно в fresh — жодного DELETE', async () => {
    seed('tasks', [{ id: 'a', title: 'A' }]);
    const pull = withStorageLock('tasks', async () => {
      seed('tasks', [{ id: 'a', title: 'A' }, { id: 'web', title: 'з вебу' }]);
    });
    const write = updateSynced<Row>('tasks', fresh =>
      fresh.map(t => (t.id === 'a' ? { ...t, status: 'done' } : t)));
    await Promise.all([pull, write]);

    expect(read<Row[]>('tasks', []).map(t => t.id)).toEqual(['a', 'web']);
    expect(outbox().map(o => [o.local_id, o.deleted])).toEqual([['a', false]]);
  });

  test('той самий масив — без запису і без outbox', async () => {
    seed('tasks', [{ id: 'a', title: 'A' }]);
    const result = await updateSynced<Row>('tasks', fresh => fresh);
    expect(result).toEqual([{ id: 'a', title: 'A' }]);
    expect(read<Row[]>('tasks', [])[0].updatedAt).toBeUndefined();
    expect(outbox()).toEqual([]);
  });

  test('не-масив у сховищі не перезаписується', async () => {
    seed('tasks', { broken: true });
    await expect(updateSynced<Row>('tasks', () => [{ id: 'x' }])).rejects.toThrow();
    expect(read('tasks', null)).toEqual({ broken: true });
  });
});
