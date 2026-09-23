/**
 * __tests__/timer-migration-gate.test.tsx — провайдер читає реєстр ПІСЛЯ міграцій.
 *
 * Міграція `active_timers:from_open_entries` переносить відкриту сесію із
 * task.timeEntries у реєстр таймерів. TimerProvider читає той самий ключ на
 * монтуванні — і без спільної обіцянки читав би його раніше за міграцію: таймер
 * був би невидимий увесь сеанс, а перший старт іншого таймера стер би його
 * дифом у saveSynced.
 *
 * Файл окремий свідомо: ensureStorageMigrations запускається один раз на
 * реєстр модулів, тож перевірка мусить бути першим монтуванням.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));

import React from 'react';

import { TimerProvider, useTimerContext, type TimerContextValue } from '@/store/timer-context';
import type { ActiveTimer } from '@/utils/activeTimers';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

let api!: TimerContextValue;

function Probe() {
  api = useTimerContext();
  return null;
}

test('перенесений міграцією таймер видно одразу і він переживає наступний старт', async () => {
  mockStore.set('tasks', JSON.stringify([
    {
      id: 't1',
      title: 'Завдання з відкритою сесією',
      status: 'active',
      subtasks: [],
      timeEntries: [{ id: 'e1', startedAt: new Date(Date.now() - 120_000).toISOString() }],
    },
  ]));

  await act(async () => {
    create(
      <TimerProvider>
        <Probe />
      </TimerProvider>,
    );
  });

  expect(api.timersReady).toBe(true);
  expect(api.activeTimers.map(t => t.taskId)).toEqual(['t1']);

  await act(async () => { await api.startAdHocTimer('Своє'); });

  const stored = JSON.parse(mockStore.get('active_timers') ?? '[]') as ActiveTimer[];
  expect(stored.map(t => t.taskId)).toContain('t1');
  expect(stored).toHaveLength(2);
});
