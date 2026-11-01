/**
 * store/device-actions.ts — застосування дій на телефоні (watch-lockscreen-v1.md §2–§3):
 * ті самі ключі й форми записів, що й у застосунку; повтор — `duplicate`;
 * `retry` лише для свіжого `not_found`.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}));

import { applyDeviceActions, APPLIED_LOG_KEY } from '@/store/device-actions';
import type { DeviceAction } from '@/utils/deviceActions';

const read = <T,>(key: string): T => JSON.parse(mockStore.get(key) ?? 'null') as T;
const seed = (key: string, value: unknown) => mockStore.set(key, JSON.stringify(value));

let seq = 0;
function uuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

function action(type: DeviceAction['type'], payload: Record<string, unknown>, agoSec = 5): DeviceAction {
  const at = new Date(Date.now() - agoSec * 1000).toISOString();
  return { id: uuid(), type, at, tz: 'Europe/Kyiv', source: 'watch', payload };
}

type Rec = Record<string, any>;

beforeEach(() => {
  mockStore.clear();
});

describe('task_complete', () => {
  it('закриває задачу, зупиняє її таймер і створює наступну копію', async () => {
    const startedAt = new Date(Date.now() - 600_000).toISOString();
    seed('tasks', [{
      id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-in-progress', createdAt: startedAt,
      subtasks: [], deadline: new Date().toISOString(), recurrence: { freq: 'daily', interval: 1 }, history: [],
    }]);
    seed('active_timers', [{ id: 'task:t1', taskId: 't1', label: 'Звіт', startedAt }]);
    const a = action('task_complete', { taskId: 't1' });

    const [result] = await applyDeviceActions([a]);
    expect(result).toEqual({ id: a.id, status: 'applied', record: { collection: 'tasks', local_id: 't1' } });

    const tasks = read<Rec[]>('tasks');
    const done = tasks.find(t => t.id === 't1')!;
    expect(done.status).toBe('done');
    expect(done.kanbanColumnId).toBe('status-done');
    expect(done.history.map((e: Rec) => [e.id, e.type])).toEqual([[`wa-${a.id}`, 'done'], [`wa-${a.id}-s`, 'timer_stop']]);
    expect(done.timeEntries).toEqual([expect.objectContaining({ id: `wa-${a.id}`, startedAt, endedAt: a.at })]);
    expect(tasks.find(t => t.id === `${a.id}-next`)).toEqual(expect.objectContaining({ status: 'active', kanbanColumnId: 'status-active' }));
    expect(read<Rec[]>('active_timers')).toEqual([]);
    expect(read<Rec[]>('time_entries')).toEqual([expect.objectContaining({ id: `wa-${a.id}`, taskId: 't1', date: a.at })]);

    // Повтор — з журналу; без журналу — за станом цілі.
    expect((await applyDeviceActions([a]))[0].status).toBe('duplicate');
    mockStore.delete(APPLIED_LOG_KEY);
    expect((await applyDeviceActions([a]))[0].status).toBe('duplicate');
    expect(read<Rec[]>('tasks').filter(t => t.id === `${a.id}-next`)).toHaveLength(1);
  });

  it('задача з перевіркою результату → review_required; глядач → forbidden', async () => {
    seed('tasks', [
      { id: 'r1', title: 'r', status: 'active', subtasks: [], createdAt: '', reviewRequired: true },
      { id: 'p1', title: 'p', status: 'active', subtasks: [], createdAt: '', projectId: 'P', assigneeId: '7' },
    ]);
    seed('workspace_projects', [{ id: 'P', name: 'Проєкт', role: 'viewer' }]);
    const results = await applyDeviceActions([
      action('task_complete', { taskId: 'r1' }),
      action('task_complete', { taskId: 'p1' }),
    ]);
    expect(results.map(r => r.reason)).toEqual(['review_required', 'forbidden']);
  });

  it('немає задачі: свіжа дія — retry (не в журнал), стара — rejected/not_found', async () => {
    seed('tasks', []);
    const fresh = action('task_complete', { taskId: 'ghost' });
    const old = action('task_complete', { taskId: 'ghost' }, 20 * 60);
    const results = await applyDeviceActions([fresh, old]);
    expect(results.map(r => [r.status, r.reason])).toEqual([['retry', 'not_found'], ['rejected', 'not_found']]);
    const log = read<Rec[]>(APPLIED_LOG_KEY);
    expect(log.map(e => e.id)).toEqual([old.id]);
  });
});

describe('task_create / note_create / expense_create / habit_check', () => {
  it('створює записи з id дії й не дублює', async () => {
    seed('accounts', [
      { id: 'a1', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 0, createdAt: '' },
      { id: 'a2', name: 'Стара', kind: 'card', currency: 'UAH', openingBalance: 0, createdAt: '', archived: true },
    ]);
    seed('health_habits', [{ id: 'h1', title: 'Вода', icon: 'drop.fill', color: '#0EA5E9', log: [], createdAt: '' }]);
    const create = action('task_create', { title: '  Купити хліб ', deadline: '2026-10-18T09:00:00.000Z' });
    const note = action('note_create', { text: 'Ідея\nдеталі' });
    const expense = action('expense_create', { amount: 120.456, category: 'Їжа', accountId: 'a1' });
    const archived = action('expense_create', { amount: 1, category: 'Їжа', accountId: 'a2' });
    const habit = action('habit_check', { habitId: 'h1', done: true });
    const habitAgain = action('habit_check', { habitId: 'h1', done: true });

    const results = await applyDeviceActions([create, note, expense, archived, habit, habitAgain]);
    expect(results.map(r => r.status)).toEqual(['applied', 'applied', 'applied', 'rejected', 'applied', 'duplicate']);
    expect(results[3].reason).toBe('invalid_account');

    expect(read<Rec[]>('tasks')[0]).toEqual(expect.objectContaining({ id: create.id, title: 'Купити хліб', kanbanColumnId: 'status-active' }));
    expect(read<Rec[]>('notes')[0]).toEqual(expect.objectContaining({ id: note.id, title: 'Ідея', body: 'Ідея\nдеталі' }));
    expect(read<Rec[]>('transactions')[0]).toEqual(expect.objectContaining({ id: expense.id, amount: 120.46, currency: 'UAH', date: expense.at }));
    expect(read<Rec[]>('health_habits')[0].log).toEqual([habit.at]);

    const again = await applyDeviceActions([create, note, expense]);
    expect(again.map(r => r.status)).toEqual(['duplicate', 'duplicate', 'duplicate']);
    expect(read<Rec[]>('tasks')).toHaveLength(1);
  });

  it('невалідний payload → invalid_payload', async () => {
    const results = await applyDeviceActions([
      action('task_create', { title: '', deadline: '2026-10-18T09:00:00.000Z' }),
      action('expense_create', { amount: -5, category: 'x', accountId: 'a1' }),
      action('habit_check', { habitId: 'h1', done: 'yes' }),
      action('note_create', { text: '   ' }),
    ]);
    expect(results.every(r => r.status === 'rejected' && r.reason === 'invalid_payload')).toBe(true);
  });
});

describe('timer_start / timer_stop', () => {
  it('вільний таймер з дії: adhoc:<id>, стоп пише wa-<id> з часу дій', async () => {
    const start = action('timer_start', { kind: 'adhoc', label: 'Читання' }, 120);
    const stop = action('timer_stop', { timerId: `adhoc:${start.id}` }, 30);
    const results = await applyDeviceActions([start, stop]);
    expect(results).toEqual([
      { id: start.id, status: 'applied', record: { collection: 'active_timers', local_id: `adhoc:${start.id}` } },
      { id: stop.id, status: 'applied', record: { collection: 'time_entries', local_id: `wa-${stop.id}` } },
    ]);
    const [entry] = read<Rec[]>('time_entries');
    expect(entry).toEqual(expect.objectContaining({ id: `wa-${stop.id}`, task: 'Читання', startedAt: start.at, endedAt: stop.at }));
    expect(entry.duration).toBe(Math.floor((Date.parse(stop.at) - Date.parse(start.at)) / 1000));

    // Повторний стоп без журналу — duplicate за наявним записом часу.
    mockStore.delete(APPLIED_LOG_KEY);
    expect((await applyDeviceActions([stop]))[0].status).toBe('duplicate');
  });

  it('таймер задачі: колонка «У процесі», історія wa-<id>; завершена задача — task_done', async () => {
    seed('tasks', [
      { id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-active', subtasks: [], createdAt: '' },
      { id: 't2', title: 'Готове', status: 'done', subtasks: [], createdAt: '' },
    ]);
    const start = action('timer_start', { kind: 'task', taskId: 't1' });
    const done = action('timer_start', { kind: 'task', taskId: 't2' });
    const results = await applyDeviceActions([start, done]);
    expect(results.map(r => r.status)).toEqual(['applied', 'rejected']);
    expect(results[1].reason).toBe('task_done');
    const task = read<Rec[]>('tasks').find(t => t.id === 't1')!;
    expect(task.kanbanColumnId).toBe('status-in-progress');
    expect(task.history).toEqual([{ id: `wa-${start.id}`, at: start.at, type: 'timer_start' }]);
    expect(read<Rec[]>('active_timers')).toEqual([expect.objectContaining({ id: 'task:t1', startedAt: start.at })]);
  });
});
