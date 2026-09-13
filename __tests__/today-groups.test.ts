/**
 * __tests__/today-groups.test.ts — склад і порядок списку на екрані дня.
 *
 * Три межі, які легко зсунути тихо й не помітити на екрані: кого беремо,
 * в якому порядку йдуть групи і що ховаємо під «показати всі».
 */

import { mergeTaskStatusColumns } from '../utils/taskStatuses';
import { completedAt, groupTodayTasks } from '../utils/todayGroups';
import type { Task } from '../utils/taskUtils';

const COLUMNS = mergeTaskStatusColumns([]);
const TODAY = new Date('2026-08-29T10:00:00.000Z');
const iso = (d: string) => new Date(d).toISOString();

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: over.id,
    priority: 'medium',
    status: 'active',
    subtasks: [],
    createdAt: iso('2026-08-01'),
    ...over,
  } as Task;
}

describe('groupTodayTasks', () => {
  it('завдання в роботі стоїть першим навіть без дедлайну', () => {
    // Головна причина групування: над ним працюють просто зараз, і дедлайн
    // десь попереду не мусить викидати його з дня.
    const groups = groupTodayTasks(
      [
        task({ id: 'due', deadline: iso('2026-08-29') }),
        task({ id: 'running', kanbanColumnId: 'status-in-progress' }),
      ],
      COLUMNS, TODAY, 3,
    );
    expect(groups.groups[0].id).toBe('status-in-progress');
    expect(groups.groups[0].tasks.map(t => t.id)).toEqual(['running']);
  });

  it('решта розкладається по своїх колонках', () => {
    const { groups } = groupTodayTasks(
      [
        task({ id: 'a', deadline: iso('2026-08-29') }),
        task({ id: 'r', deadline: iso('2026-08-29'), kanbanColumnId: 'status-review' }),
      ],
      COLUMNS, TODAY, 5,
    );
    expect(groups.map(g => g.id)).toEqual(['status-active', 'status-review']);
  });

  it('«У процесі» не обрізається лімітом, решта — обрізається', () => {
    // Ховати те, над чим людина працює, під «показати всі» означало б
    // викинути єдину причину, з якої воно тут.
    const running = Array.from({ length: 5 }, (_, i) =>
      task({ id: `run${i}`, kanbanColumnId: 'status-in-progress' }));
    const due = Array.from({ length: 5 }, (_, i) =>
      task({ id: `due${i}`, deadline: iso('2026-08-29') }));

    const { groups, hidden, total } = groupTodayTasks([...running, ...due], COLUMNS, TODAY, 2);
    expect(groups[0].tasks).toHaveLength(5);
    expect(groups[1].tasks).toHaveLength(2);
    expect(total).toBe(10);
    expect(hidden).toBe(3);
  });

  it('прострочене потрапляє в день, навіть якщо дедлайн був учора', () => {
    const { total } = groupTodayTasks(
      [task({ id: 'late', deadline: iso('2026-08-20') })],
      COLUMNS, TODAY, 3,
    );
    expect(total).toBe(1);
  });

  it('«На перевірці» тримається в дні без дедлайну', () => {
    // Зупинили таймер — завдання поїхало на перевірку. Воно не мусить зникати
    // з дня лише тому, що дедлайн у нього наступного тижня.
    const { groups } = groupTodayTasks(
      [task({ id: 'r', kanbanColumnId: 'status-review', deadline: iso('2026-09-15') })],
      COLUMNS, TODAY, 3,
    );
    expect(groups.map(g => g.id)).toEqual(['status-review']);
  });

  it('завершене СЬОГОДНІ лишається в дні', () => {
    const { groups } = groupTodayTasks(
      [task({
        id: 'd', status: 'done',
        history: [{ id: 'h', at: iso('2026-08-29T09:30'), type: 'done' }],
      })],
      COLUMNS, TODAY, 3,
    );
    expect(groups.map(g => g.id)).toEqual(['status-done']);
  });

  it('завершене ВЧОРА в день не повертається', () => {
    // Інакше екран дня поступово став би архівом усього, що колись закрили.
    const { total } = groupTodayTasks(
      [task({
        id: 'old', status: 'done',
        history: [{ id: 'h', at: iso('2026-08-28T18:00'), type: 'done' }],
      })],
      COLUMNS, TODAY, 3,
    );
    expect(total).toBe(0);
  });

  it('завершене без жодної дати не вигадує собі сьогодні', () => {
    const { total } = groupTodayTasks(
      [task({ id: 'nodate', status: 'done' })],
      COLUMNS, TODAY, 3,
    );
    expect(total).toBe(0);
  });

  it('готове стоїть НАПРИКІНЦІ, а робота — попереду', () => {
    const { groups } = groupTodayTasks(
      [
        task({ id: 'd', status: 'done', history: [{ id: 'h', at: iso('2026-08-29T09:00'), type: 'done' }] }),
        task({ id: 'run', kanbanColumnId: 'status-in-progress' }),
        task({ id: 'rev', kanbanColumnId: 'status-review' }),
      ],
      COLUMNS, TODAY, 5,
    );
    expect(groups.map(g => g.id)).toEqual(['status-in-progress', 'status-review', 'status-done']);
  });
});

describe('completedAt', () => {
  it('бере ОСТАННЮ подію завершення, а не першу', () => {
    // Завдання могли закрити, відкрити й закрити знову — у день має потрапити
    // остання дія, інакше воно зникне з екрана в день повторного закриття.
    const at = completedAt(task({
      id: 'x', status: 'done',
      history: [
        { id: '1', at: iso('2026-08-20'), type: 'done' },
        { id: '2', at: iso('2026-08-22'), type: 'active' },
        { id: '3', at: iso('2026-08-29'), type: 'done' },
      ],
    }));
    expect(at?.toISOString()).toBe(iso('2026-08-29'));
  });

  it('без історії падає на updatedAt', () => {
    const at = completedAt(task({ id: 'x', status: 'done', updatedAt: iso('2026-08-29T12:00') }));
    expect(at?.toISOString()).toBe(iso('2026-08-29T12:00'));
  });

  it('без нічого повертає null, а не createdAt', () => {
    // createdAt тут — не дата завершення, і підміна нею витягувала б на екран
    // випадкові старі завдання.
    expect(completedAt(task({ id: 'x', status: 'done' }))).toBeNull();
  });
});

describe('groupTodayTasks — порядок і межі', () => {
  it('усередині групи вищий пріоритет вище', () => {
    const { groups } = groupTodayTasks(
      [
        task({ id: 'low', priority: 'low', deadline: iso('2026-08-29') }),
        task({ id: 'high', priority: 'high', deadline: iso('2026-08-29') }),
      ],
      COLUMNS, TODAY, 5,
    );
    expect(groups[0].tasks.map(t => t.id)).toEqual(['high', 'low']);
  });

  it('P0–P5: P0 першим, без пріоритету — в кінці', () => {
    const { groups } = groupTodayTasks(
      [
        task({ id: 'none', priority: undefined, deadline: iso('2026-08-29') }),
        task({ id: 'p5', priority: 'low', priorityLevel: 5, deadline: iso('2026-08-29') }),
        task({ id: 'p0', priority: 'high', priorityLevel: 0, deadline: iso('2026-08-29') }),
      ],
      COLUMNS, TODAY, 5,
    );
    expect(groups[0].tasks.map(t => t.id)).toEqual(['p0', 'p5', 'none']);
  });

  it('порожніх груп немає', () => {
    const { groups } = groupTodayTasks(
      [task({ id: 'a', deadline: iso('2026-08-29') })],
      COLUMNS, TODAY, 3,
    );
    expect(groups.every(g => g.tasks.length > 0)).toBe(true);
  });

  it('кастомна колонка отримує власну групу, а не зникає', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'blocked', name: 'Заблоковано', color: '#EF4444', position: 9, isDone: false },
    ]);
    const { groups } = groupTodayTasks(
      [task({ id: 'b', deadline: iso('2026-08-29'), kanbanColumnId: 'blocked' })],
      columns, TODAY, 3,
    );
    expect(groups.map(g => g.id)).toEqual(['blocked']);
    expect(groups[0].name).toBe('Заблоковано');
  });

  it('порожній вхід не вигадує груп', () => {
    expect(groupTodayTasks([], COLUMNS, TODAY, 3)).toEqual({ groups: [], total: 0, hidden: 0 });
  });
});
