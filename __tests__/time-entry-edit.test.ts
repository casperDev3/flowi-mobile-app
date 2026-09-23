/**
 * __tests__/time-entry-edit.test.ts — правка запису часу з форми (пункт 4).
 *
 * Дзеркало вебового `lib/time-entry-edit.test.mjs`. Дати локальні (без
 * `Z`): «наступна доба» й «перетин півночі» міряються добою людини.
 */
import { crossesMidnight } from '@/utils/timeAnomalies';
import {
  applyEntryEdit,
  durationFromClock,
  endFromDuration,
  entryEditDraft,
  lockedProjectId,
  parseClock,
  searchTasks,
} from '@/utils/timeEntryEdit';

const eq = (a: unknown, b: unknown) => expect(a).toBe(b);
const eqDeep = (a: unknown, b: unknown) => expect(a).toEqual(b);
const at = (local: string) => new Date(local).toISOString();
const tasks = [
  { id: 't-proj', title: 'Макет головної', projectId: 'p1' },
  { id: 't-own', title: 'Прибирання' },
];
const base: any = {
  id: 'e1',
  task: 'Макет головної',
  taskId: 't-proj',
  projectId: 'p1',
  duration: 3600,
  date: at('2026-09-20T11:00:00'),
  note: 'стара',
};
const input = (over: Record<string, unknown> = {}): any => ({
  date: '2026-09-20',
  start: '10:00',
  durationSeconds: 3600,
  taskId: 't-proj',
  taskTitle: 'Макет головної',
  projectId: 'p1',
  note: 'стара',
  ...over,
});

test('годинник: розбір, тривалість, кінець через північ', () => {
  eq(parseClock('09:05'), 545);
  eq(parseClock('9:05'), 545);
  eq(parseClock('24:00'), null);
  eq(parseClock('abc'), null);
  eq(durationFromClock('10:00', '11:30'), 5400);
  eq(durationFromClock('23:30', '00:30'), 3600);
  eq(durationFromClock('10:00', '10:00'), 0);
  eq(endFromDuration('23:30', 3600), '00:30');
});

test('кінець раніше за початок — наступна доба', () => {
  const result = applyEntryEdit(base, input({ start: '23:30', end: '00:45' }), { tasks });
  eq(result.ok, true);
  eq((result as any).entry.duration, 4500);
  eq((result as any).entry.startedAt, at('2026-09-20T23:30:00'));
  eq((result as any).entry.date, at('2026-09-21T00:45:00'));
  // Запис справді лежить через північ — блок аномалій це побачить.
  eq(crossesMidnight((result as any).entry), true);
});

test('тривалість без кінця — кінець = початок + тривалість', () => {
  const result = applyEntryEdit(base, input({ start: '09:15', durationSeconds: 2700 }), { tasks });
  eq((result as any).entry.startedAt, at('2026-09-20T09:15:00'));
  eq((result as any).entry.date, at('2026-09-20T10:00:00'));
  eq('endedAt' in (result as any).entry, false);
});

test('вільний текст скидає taskId', () => {
  // До фіксу форма міняла лише `task`, і запис лишався під старою задачею.
  const result = applyEntryEdit(base, input({ taskId: null, taskTitle: 'Дзвінок з клієнтом', projectId: 'p1' }), { tasks });
  eq((result as any).entry.task, 'Дзвінок з клієнтом');
  eq('taskId' in (result as any).entry, false);
  eq((result as any).entry.projectId, 'p1');
});

test('вибір задачі ставить taskId, назву і проєкт задачі', () => {
  const personal: any = { id: 'e2', task: 'Щось', duration: 600, date: at('2026-09-20T12:00:00') };
  const result = applyEntryEdit(personal, input({ taskId: 't-proj', taskTitle: '', projectId: null }), { tasks });
  eq((result as any).entry.taskId, 't-proj');
  eq((result as any).entry.task, 'Макет головної');
  // Проєкт задає задача, навіть якщо у формі стояло «Особисте».
  eq((result as any).entry.projectId, 'p1');
  eq(lockedProjectId('t-proj', tasks), 'p1');
  eq(lockedProjectId('t-own', tasks), null);
});

test('особиста задача й «Особисте» знімають projectId', () => {
  const result = applyEntryEdit(base, input({ taskId: 't-own', taskTitle: 'Прибирання', projectId: null }), { tasks });
  eq((result as any).entry.taskId, 't-own');
  eq('projectId' in (result as any).entry, false);
});

test('незмінений початок береться з запису до секунди', () => {
  const precise: any = { ...base, startedAt: at('2026-09-20T10:00:37'), duration: 3600, date: at('2026-09-20T11:00:37') };
  const result = applyEntryEdit(precise, input(), { tasks });
  eq((result as any).entry.startedAt, precise.startedAt);
  eq((result as any).entry.date, precise.date);
});

test('endedAt оновлюється, коли він у записі був; порожня нотатка знімається', () => {
  const migrated: any = { ...base, startedAt: at('2026-09-20T10:00:00'), endedAt: at('2026-09-20T11:00:00') };
  const result = applyEntryEdit(migrated, input({ durationSeconds: 1800, note: '  ' }), { tasks });
  eq((result as any).entry.endedAt, at('2026-09-20T10:30:00'));
  eq((result as any).entry.date, (result as any).entry.endedAt);
  eq('note' in (result as any).entry, false);
});

test('помилки полів', () => {
  eqDeep(applyEntryEdit(null, input({ taskId: null, taskTitle: ' ' }), { tasks }), { ok: false, error: 'task' });
  eqDeep(applyEntryEdit(null, input({ date: '2026-02-30' }), { tasks }), { ok: false, error: 'date' });
  eqDeep(applyEntryEdit(null, input({ start: '25:00' }), { tasks }), { ok: false, error: 'start' });
  eqDeep(applyEntryEdit(null, input({ end: 'xx' }), { tasks }), { ok: false, error: 'end' });
  eqDeep(applyEntryEdit(null, input({ durationSeconds: 0 }), { tasks }), { ok: false, error: 'duration' });
});

test('новий запис бере id з опцій', () => {
  const result = applyEntryEdit(null, input({ taskId: null, taskTitle: 'Ручний', projectId: null }), { tasks, id: 'new-1' });
  eq((result as any).entry.id, 'new-1');
  eq((result as any).entry.task, 'Ручний');
});

test('чернетка: наявний запис і новий', () => {
  const draft = entryEditDraft(
    { id: 'x', task: 'Макет', taskId: 't-proj', duration: 5400, date: at('2026-09-21T00:30:00') },
    new Date(),
    { taskProjects: new Map([['t-proj', 'p1']]) },
  );
  eqDeep(
    { date: draft.date, start: draft.start, end: draft.end, duration: draft.durationSeconds, projectId: draft.projectId },
    { date: '2026-09-20', start: '23:00', end: '00:30', duration: 5400, projectId: 'p1' },
  );
  const fresh = entryEditDraft(null, new Date(2026, 8, 20, 14, 7, 42), { projectId: 'p9' });
  eqDeep(
    { date: fresh.date, start: fresh.start, end: fresh.end, duration: fresh.durationSeconds, projectId: fresh.projectId },
    { date: '2026-09-20', start: '13:07', end: '14:07', duration: 3600, projectId: 'p9' },
  );
});

test('пошук задач', () => {
  eqDeep(searchTasks(tasks, 'макет').map((t) => t.id), ['t-proj']);
  eqDeep(searchTasks(tasks, '').map((t) => t.id), ['t-proj', 't-own']);
  eqDeep(searchTasks(tasks, '', 1).length, 1);
});
