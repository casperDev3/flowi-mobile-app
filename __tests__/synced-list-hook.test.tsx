/**
 * __tests__/synced-list-hook.test.tsx — useSyncedList над справжнім
 * storage/synced-storage (мок лише AsyncStorage).
 *
 * Сценарій скарги: задачу змінили на вебі, пул синку поклав її в сховище, а
 * телефон показував стару версію до pull-to-refresh — і наступне збереження
 * екрана затирало веб-зміну своїм застарілим масивом.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));

import React from 'react';

import { useSyncedList, type SyncedList } from '@/hooks/use-synced-list';
import { saveData } from '@/store/storage';
import type { OutboxItem } from '@/store/synced-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

interface Row { id: string; title: string; status?: string; updatedAt?: string }

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}
function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

let api!: SyncedList<Row>;
function Probe() {
  api = useSyncedList<Row>('tasks', { enabled: true });
  return null;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  }
}

async function mount(): Promise<void> {
  await act(async () => { create(<Probe />); });
  await act(async () => { await api.reload(); });
  await flush();
}

beforeEach(() => {
  mockStore.clear();
});

describe('useSyncedList', () => {
  test('запис у сховище повз екран (пул синку) з\'являється без перезавантаження', async () => {
    seed('tasks', [{ id: 'a', title: 'A' }]);
    await mount();
    expect(api.items.map(r => r.id)).toEqual(['a']);

    await act(async () => {
      await saveData('tasks', [{ id: 'a', title: 'A' }, { id: 'web', title: 'з вебу' }]);
    });
    await flush();

    expect(api.items.map(r => r.id)).toEqual(['a', 'web']);
    // Перечитане не зберігається назад — жодного ехо в outbox.
    expect(read<OutboxItem[]>('sync_outbox', [])).toEqual([]);
  });

  test('локальна правка пише лише свій запис і не видаляє чужі', async () => {
    seed('tasks', [{ id: 'a', title: 'A', status: 'active' }]);
    await mount();

    // Веб додав задачу і позначив «a» готовою — але сигнал екран ще не обробив:
    // пишемо напряму в AsyncStorage-мок, повз saveData.
    seed('tasks', [{ id: 'a', title: 'A', status: 'done' }, { id: 'web', title: 'з вебу' }]);

    await act(async () => {
      api.setItems(prev => prev.map(r => (r.id === 'a' ? { ...r, title: 'A (тел.)' } : r)));
    });
    await flush();

    const stored = read<Row[]>('tasks', []);
    expect(stored.map(r => r.id)).toEqual(['a', 'web']);
    expect(stored[0]).toMatchObject({ title: 'A (тел.)', status: 'done' });
    expect(read<OutboxItem[]>('sync_outbox', []).map(o => `${o.local_id}:${o.deleted}`)).toEqual(['a:false']);
    // Після збереження екран підтягнув злитий стан сховища.
    expect(api.items.map(r => r.id)).toEqual(['a', 'web']);
    expect(api.items[0].status).toBe('done');
  });

  test('локальне видалення йде в outbox як deleted', async () => {
    seed('tasks', [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    await mount();

    await act(async () => { api.setItems(prev => prev.filter(r => r.id !== 'b')); });
    await flush();

    expect(read<Row[]>('tasks', []).map(r => r.id)).toEqual(['a']);
    expect(read<OutboxItem[]>('sync_outbox', []).map(o => `${o.local_id}:${o.deleted}`)).toEqual(['b:true']);
  });
});
