/**
 * store/timer-ops.ts — старт/стоп поза провайдером (watch-lockscreen-v1.md §3.3–§3.4, §11.1).
 * Ті самі ефекти, що й у застосунку; опції лише міняють час, id і поведінку
 * без колонки робочого процесу.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));

import {
  startAdHocTimerOp,
  startTaskTimerOp,
  stopTimerOp,
  subscribeExternalTimerChanges,
  notifyExternalTimerChange,
} from '@/store/timer-ops';

type Rec = Record<string, any>;
const read = <T,>(key: string): T => JSON.parse(mockStore.get(key) ?? 'null') as T;
const seed = (key: string, value: unknown) => mockStore.set(key, JSON.stringify(value));

beforeEach(() => mockStore.clear());

describe('startTaskTimerOp', () => {
  it('старт: «У процесі», історія з власним id і часом', async () => {
    seed('tasks', [{ id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-active', subtasks: [], createdAt: '' }]);
    const at = new Date('2026-10-18T09:00:00.000Z');
    const onTasksChanged = jest.fn();
    const outcome = await startTaskTimerOp(
      { id: 't1', title: 'Звіт', status: 'active' },
      { at, historyId: 'wa-x' },
      { onTasksChanged },
    );
    expect(outcome).toBe('started');
    expect(onTasksChanged).toHaveBeenCalled();
    expect(read<Rec[]>('active_timers')).toEqual([expect.objectContaining({ id: 'task:t1', startedAt: at.toISOString() })]);
    const task = read<Rec[]>('tasks')[0];
    expect(task.kanbanColumnId).toBe('status-in-progress');
    expect(task.history).toEqual([{ id: 'wa-x', at: at.toISOString(), type: 'timer_start' }]);
    // Таймер уже йде — нічого не міняємо.
    expect(await startTaskTimerOp({ id: 't1', title: 'Звіт', status: 'active' })).toBe('exists');
  });

  it('проєкт без колонки «У процесі»: у застосунку — Alert і без старту, з дії — старт без колонки', async () => {
    seed('task_statuses', [
      { id: 'st-todo', name: 'Черга', color: '#000', position: 0, isDone: false, projectId: 'P', type: 'todo' },
      { id: 'st-done', name: 'Зроблено', color: '#000', position: 1, isDone: true, projectId: 'P', type: 'done' },
    ]);
    seed('tasks', [{ id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'st-todo', subtasks: [], createdAt: '', projectId: 'P' }]);
    const onWorkflowMissing = jest.fn();
    const input = { id: 't1', title: 'Звіт', status: 'active' as const, projectId: 'P' };
    expect(await startTaskTimerOp(input, {}, { onWorkflowMissing })).toBe('workflow_missing');
    expect(onWorkflowMissing).toHaveBeenCalledTimes(1);
    expect(read<Rec[] | null>('active_timers')).toBeNull();

    expect(await startTaskTimerOp(input, { silentWorkflow: true }, { onWorkflowMissing })).toBe('started');
    expect(onWorkflowMissing).toHaveBeenCalledTimes(1);
    expect(read<Rec[]>('tasks')[0].kanbanColumnId).toBe('st-todo');
    expect(read<Rec[]>('active_timers')[0]).toEqual(expect.objectContaining({ projectId: 'P' }));
  });
});

describe('stopTimerOp', () => {
  it('зупинка з дії: детерміновані id, «На перевірці», дзеркало з projectId задачі', async () => {
    seed('tasks', [{ id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-in-progress', subtasks: [], createdAt: '', projectId: undefined }]);
    seed('active_timers', [{ id: 'task:t1', taskId: 't1', label: 'Звіт', startedAt: '2026-10-18T09:00:00.000Z' }]);
    const at = new Date('2026-10-18T09:10:00.500Z');
    const stopped = await stopTimerOp('task:t1', { at, entryId: 'wa-1', historyId: 'wa-1-s' });
    expect(stopped?.duration).toBe(600);
    const task = read<Rec[]>('tasks')[0];
    expect(task.kanbanColumnId).toBe('status-review');
    expect(task.timeEntries).toEqual([{ id: 'wa-1', startedAt: '2026-10-18T09:00:00.000Z', endedAt: at.toISOString(), duration: 600 }]);
    expect(task.history).toEqual([{ id: 'wa-1-s', at: at.toISOString(), type: 'timer_stop' }]);
    expect(read<Rec[]>('time_entries')).toEqual([expect.objectContaining({ id: 'wa-1', taskId: 't1', duration: 600 })]);
    // Вже зупинено — null, без дубля.
    expect(await stopTimerOp('task:t1', { at, entryId: 'wa-1' })).toBeNull();
    expect(read<Rec[]>('time_entries')).toHaveLength(1);
  });

  it('keepColumn: «готово» лишається на місці', async () => {
    seed('tasks', [{ id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-in-progress', subtasks: [], createdAt: '' }]);
    seed('active_timers', [{ id: 'task:t1', taskId: 't1', label: 'Звіт', startedAt: '2026-10-18T09:00:00.000Z' }]);
    await stopTimerOp('task:t1', { keepColumn: true, at: new Date('2026-10-18T09:00:10.000Z') });
    expect(read<Rec[]>('tasks')[0].kanbanColumnId).toBe('status-in-progress');
  });

  it('нарада: сесія в timeEntries наради з id дії', async () => {
    seed('meetings', [{ id: 'm1', title: 'Демо', date: '2026-10-18', time: '09:00', durationMinutes: 30, color: '#000' }]);
    seed('active_timers', [{ id: 'meeting:m1', meetingId: 'm1', label: 'Демо', startedAt: '2026-10-18T09:00:00.000Z' }]);
    await stopTimerOp('meeting:m1', { at: new Date('2026-10-18T09:00:30.000Z'), entryId: 'wa-2' });
    expect(read<Rec[]>('meetings')[0].timeEntries).toEqual([expect.objectContaining({ id: 'wa-2', duration: 30 })]);
  });
});

describe('startAdHocTimerOp', () => {
  it('детермінований id не дублюється', async () => {
    const at = new Date('2026-10-18T09:00:00.000Z');
    expect(await startAdHocTimerOp('Читання', { id: 'adhoc:a', at })).toBe('started');
    expect(await startAdHocTimerOp('Читання', { id: 'adhoc:a', at })).toBe('exists');
    expect(read<Rec[]>('active_timers')).toEqual([expect.objectContaining({ id: 'adhoc:a', label: 'Читання', startedAt: at.toISOString() })]);
  });
});

it('сигнал зовнішніх змін доходить до підписників', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeExternalTimerChanges(listener);
  notifyExternalTimerChange({ tasks: true });
  unsubscribe();
  notifyExternalTimerChange({ tasks: true });
  expect(listener).toHaveBeenCalledTimes(1);
});
