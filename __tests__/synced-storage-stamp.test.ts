/**
 * __tests__/synced-storage-stamp.test.ts — штамп updatedAt (фаза 6 плану).
 *
 * Штамп проставляється централізовано в saveSynced, а не в 57 місцях виклику.
 * Ключова умова коректності: diffItems мусить ІГНОРУВАТИ updatedAt, інакше
 * розбіжність «у сховищі штамп є, у React-стані ще немає» позначала б змінними
 * геть усі записи колекції на кожному збереженні.
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

import { diffItems, saveSynced, stampUpdatedAt } from '@/store/synced-storage';

interface Row {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

beforeEach(() => {
  mockStore.clear();
});

describe('diffItems ігнорує updatedAt', () => {
  test('запис, що відрізняється лише штампом, не вважається зміненим', () => {
    const prev: Row[] = [{ id: 'a', title: 'те саме', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const next: Row[] = [{ id: 'a', title: 'те саме' }];
    expect(diffItems(prev, next).changed).toEqual([]);
  });

  test('справжня зміна поля все одно ловиться', () => {
    const prev: Row[] = [{ id: 'a', title: 'було', updatedAt: '2026-01-01T00:00:00.000Z' }];
    const next: Row[] = [{ id: 'a', title: 'стало', updatedAt: '2026-01-01T00:00:00.000Z' }];
    expect(diffItems(prev, next).changed).toEqual(['a']);
  });
});

describe('stampUpdatedAt', () => {
  const NOW = '2026-08-05T12:00:00.000Z';

  test('змінені отримують поточний час', () => {
    const result = stampUpdatedAt<Row>(
      [{ id: 'a', updatedAt: '2020-01-01T00:00:00.000Z' }],
      [{ id: 'a' }],
      new Set(['a']),
      NOW,
    );
    expect(result[0].updatedAt).toBe(NOW);
  });

  test('незмінені зберігають наявний штамп', () => {
    const result = stampUpdatedAt<Row>(
      [{ id: 'a', updatedAt: '2020-01-01T00:00:00.000Z' }],
      [{ id: 'a' }],
      new Set(),
      NOW,
    );
    expect(result[0].updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  test('незмінені без штампа беруть createdAt — бекфіл старих даних', () => {
    const result = stampUpdatedAt<Row>(
      [{ id: 'a', createdAt: '2019-05-05T00:00:00.000Z' }],
      [{ id: 'a', createdAt: '2019-05-05T00:00:00.000Z' }],
      new Set(),
      NOW,
    );
    expect(result[0].updatedAt).toBe('2019-05-05T00:00:00.000Z');
  });

  test('без штампа і без createdAt — поточний час', () => {
    const result = stampUpdatedAt<Row>([], [{ id: 'нове' }], new Set(), NOW);
    expect(result[0].updatedAt).toBe(NOW);
  });
});

describe('saveSynced штампує при записі', () => {
  test('новий запис отримує updatedAt', async () => {
    await saveSynced('tasks', [{ id: 't1', title: 'нове' }]);
    expect(read<Row[]>('tasks', [])[0].updatedAt).toEqual(expect.any(String));
  });

  test('повторне збереження без змін не зсуває штамп', async () => {
    await saveSynced('tasks', [{ id: 't1', title: 'нове' }]);
    const first = read<Row[]>('tasks', [])[0].updatedAt;

    // Екран віддає той самий стан, у якому штампа ще немає.
    await saveSynced('tasks', [{ id: 't1', title: 'нове' }]);

    expect(read<Row[]>('tasks', [])[0].updatedAt).toBe(first);
  });

  test('повторне збереження без змін не плодить записів в outbox', async () => {
    await saveSynced('tasks', [{ id: 't1', title: 'нове' }, { id: 't2', title: 'друге' }]);
    mockStore.set('sync_outbox', JSON.stringify([]));

    await saveSynced('tasks', [{ id: 't1', title: 'нове' }, { id: 't2', title: 'друге' }]);

    expect(read('sync_outbox', [])).toEqual([]);
  });

  test('правка одного запису не зсуває штамп сусіднього і не тягне його в outbox', async () => {
    await saveSynced('tasks', [{ id: 't1', title: 'перше' }, { id: 't2', title: 'друге' }]);
    const untouchedBefore = read<Row[]>('tasks', []).find(r => r.id === 't2')!.updatedAt;
    mockStore.set('sync_outbox', JSON.stringify([]));

    await saveSynced('tasks', [{ id: 't1', title: 'ЗМІНЕНО' }, { id: 't2', title: 'друге' }]);

    expect(read<Row[]>('tasks', []).find(r => r.id === 't2')!.updatedAt).toBe(untouchedBefore);
    // Свідомо не порівнюємо штампи t1 і t2 на нерівність: обидва збереження
    // можуть потрапити в ту саму мілісекунду, і рядки збіжаться. Достовірний
    // сигнал «змінено» — потрапляння саме t1 в outbox.
    const queued = read<{ local_id: string }[]>('sync_outbox', []);
    expect(queued.map(item => item.local_id)).toEqual(['t1']);
  });
});
