import { applyColumnDoneChangeToTasks } from '@/utils/taskStatuses';
import { closeSubtasksOnDone, type Task } from '@/utils/taskUtils';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Задача',
  status: 'active',
  subtasks: [
    { id: 'a', title: 'Перша', done: false },
    { id: 'b', title: 'Друга', done: true },
  ],
  createdAt: '2026-09-01T00:00:00.000Z',
  ...over,
} as Task);

describe('closeSubtasksOnDone', () => {
  it('перехід у done закриває всі підзавдання', () => {
    const next = closeSubtasksOnDone(task(), task({ status: 'done' }));
    expect(next.subtasks.map(s => s.done)).toEqual([true, true]);
  });

  it('вже завершене завдання не відмічає підзадачі назад', () => {
    const done = task({ status: 'done' });
    expect(closeSubtasksOnDone(done, done)).toBe(done);
  });

  it('повернення в роботу підзадачі не скидає', () => {
    const reopened = task();
    expect(closeSubtasksOnDone(task({ status: 'done' }), reopened)).toBe(reopened);
  });

  it('колонка, що стала «готово», закриває підзадачі своїх завдань', () => {
    const { tasks } = applyColumnDoneChangeToTasks([task({ kanbanColumnId: 'c1' })], 'c1', true);
    expect(tasks[0].subtasks.every(s => s.done)).toBe(true);
  });
});
