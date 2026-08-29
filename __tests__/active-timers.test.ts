/**
 * __tests__/active-timers.test.ts — реєстр таймерів, що йдуть просто зараз.
 *
 * Головне, що тут перевіряється, — ПОХІДНИЙ id таймера завдання. Випадковий id
 * зламав би злиття за LWW: два пристрої, кожен запустив офлайн той самий
 * таймер, після синку дали б два паралельні записи, і зупинка одного лишила б
 * другий вічно активним.
 */

// Міграція тягне за собою store/storage, а той — нативний AsyncStorage,
// якого в jest немає. Самі перевірки чисті й сховища не торкаються.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import {
  adHocTimerId,
  findTimerForTask,
  shiftForDate,
  sortTimers,
  taskTimerId,
  type ActiveTimer,
} from '@/utils/activeTimers';
import { migrateOpenTimeEntries } from '@/store/migrations';

const timer = (id: string, startedAt: string, taskId?: string): ActiveTimer => ({
  id,
  taskId,
  label: id,
  startedAt,
  shift: 'day',
});

describe('похідні id', () => {
  test('таймер завдання завжди дає той самий id', () => {
    expect(taskTimerId('t-1')).toBe('task:t-1');
    expect(taskTimerId('t-1')).toBe(taskTimerId('t-1'));
  });

  test('вільні таймери не зливаються між собою', () => {
    // Двічі запущене «Читання» — це дві різні сесії, природного ключа немає.
    expect(adHocTimerId()).not.toBe(adHocTimerId());
    expect(adHocTimerId().startsWith('adhoc:')).toBe(true);
  });

  test('id вкладається в обмеження syncRecordKey', () => {
    expect(adHocTimerId().length).toBeLessThanOrEqual(64);
  });
});

describe('sortTimers', () => {
  test('найстаріший перший', () => {
    const list = [
      timer('b', '2026-08-29T10:00:00.000Z'),
      timer('a', '2026-08-29T08:00:00.000Z'),
      timer('c', '2026-08-29T09:00:00.000Z'),
    ];
    expect(sortTimers(list).map(t => t.id)).toEqual(['a', 'c', 'b']);
  });

  test('не мутує вхідний масив', () => {
    const list = [timer('b', '2026-08-29T10:00:00.000Z'), timer('a', '2026-08-29T08:00:00.000Z')];
    sortTimers(list);
    expect(list.map(t => t.id)).toEqual(['b', 'a']);
  });

  test('однаковий час і битий startedAt не роблять порядок випадковим', () => {
    // Сітка fullscreen не сміє перебудовуватись під користувачем, тож порядок
    // мусить бути детермінованим навіть на зламаних даних.
    const same = [timer('b', '2026-08-29T08:00:00.000Z'), timer('a', '2026-08-29T08:00:00.000Z')];
    expect(sortTimers(same).map(t => t.id)).toEqual(['a', 'b']);

    const broken = [timer('z', 'не-дата'), timer('y', 'теж-не-дата')];
    expect(sortTimers(broken).map(t => t.id)).toEqual(['y', 'z']);
  });
});

describe('findTimerForTask', () => {
  const list = [timer('adhoc:1', '2026-08-29T08:00:00.000Z'), timer('task:t-1', '2026-08-29T09:00:00.000Z', 't-1')];

  test('знаходить за taskId', () => {
    expect(findTimerForTask(list, 't-1')?.id).toBe('task:t-1');
  });

  test('вільний таймер не видає себе за таймер завдання', () => {
    expect(findTimerForTask(list, 'adhoc:1')).toBeUndefined();
    expect(findTimerForTask([], 't-1')).toBeUndefined();
  });
});

describe('shiftForDate', () => {
  const at = (hour: number) => new Date(2026, 7, 29, hour, 30);

  test('межі змін', () => {
    expect(shiftForDate(at(0))).toBe('night');
    expect(shiftForDate(at(5))).toBe('night');
    expect(shiftForDate(at(6))).toBe('morning');
    expect(shiftForDate(at(11))).toBe('morning');
    expect(shiftForDate(at(12))).toBe('day');
    expect(shiftForDate(at(17))).toBe('day');
    expect(shiftForDate(at(18))).toBe('evening');
    expect(shiftForDate(at(23))).toBe('evening');
  });
});

describe('міграція відкритих сесій', () => {
  const open = { id: 'e1', startedAt: '2026-08-29T20:00:00.000Z', duration: 0 };
  const closed = { id: 'e0', startedAt: '2026-08-28T10:00:00.000Z', endedAt: '2026-08-28T11:00:00.000Z', duration: 3600 };

  test('відкритий запис переїжджає в реєстр і зникає з timeEntries', () => {
    const result = migrateOpenTimeEntries(
      [{ id: 't-1', title: 'Звіт', timeEntries: [closed, open] }],
      [],
    );
    expect(result.moved).toBe(1);
    expect(result.timers).toHaveLength(1);
    expect(result.timers[0]).toMatchObject({
      id: 'task:t-1',
      taskId: 't-1',
      label: 'Звіт',
      startedAt: open.startedAt,
    });
    expect(result.tasks[0].timeEntries).toEqual([closed]);
  });

  test('ідемпотентність: без відкритих записів нічого не додається', () => {
    const first = migrateOpenTimeEntries([{ id: 't-1', title: 'Звіт', timeEntries: [open] }], []);
    const second = migrateOpenTimeEntries(first.tasks, first.timers);
    expect(second.moved).toBe(0);
    expect(second.timers).toEqual(first.timers);
  });

  test('наявний таймер не перезаписується старим записом', () => {
    const existing = timer('task:t-1', '2026-08-29T21:00:00.000Z', 't-1');
    const result = migrateOpenTimeEntries(
      [{ id: 't-1', title: 'Звіт', timeEntries: [open] }],
      [existing],
    );
    expect(result.moved).toBe(0);
    expect(result.timers[0].startedAt).toBe(existing.startedAt);
    // Запис усе одно прибрано: інакше він лишився б вічною сесією.
    expect(result.tasks[0].timeEntries).toEqual([]);
  });

  test('кілька відкритих записів — беремо найраніший', () => {
    const later = { id: 'e2', startedAt: '2026-08-29T22:00:00.000Z', duration: 0 };
    const result = migrateOpenTimeEntries(
      [{ id: 't-1', title: 'Звіт', timeEntries: [later, open] }],
      [],
    );
    expect(result.timers[0].startedAt).toBe(open.startedAt);
  });

  test('завдання без придатного id не ламає міграцію', () => {
    const result = migrateOpenTimeEntries([{ title: 'Без id', timeEntries: [open] }], []);
    expect(result.timers).toEqual([]);
    expect(result.tasks[0].timeEntries).toEqual([]);
  });
});
