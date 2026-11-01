/**
 * utils/deviceActions.ts — конверт DeviceAction і записи, які він створює
 * (watch-lockscreen-v1.md §1–§3). Детерміновані id — основа збіжності
 * телефон↔сервер, тому вони тут зафіксовані буквально.
 */
import {
  checkEnvelope,
  completeTaskRecord,
  createdTaskRecord,
  dayKeyInZone,
  expenseRecord,
  habitAfterCheck,
  inboxNoteRecord,
  isActionId,
  makeDeviceAction,
  nextOccurrenceRecord,
  notFoundStatus,
  roundAmount,
  sessionSeconds,
  type RecurringTask,
} from '@/utils/deviceActions';
import type { Habit } from '@/utils/preventionUtils';

const ID = '3f0c8f7e-5a2b-4c1d-9e1f-2a6b7c8d9e0f';
const NOW = new Date('2026-10-18T09:12:40.000Z');
const AT = '2026-10-18T09:12:33.120Z';

function envelope(overrides: Record<string, unknown> = {}) {
  return { id: ID, type: 'task_complete', at: AT, tz: 'Europe/Kyiv', day: '2026-10-18', payload: { taskId: 't1' }, ...overrides };
}

describe('checkEnvelope (§2.3)', () => {
  it('приймає валідну дію', () => {
    const checked = checkEnvelope(envelope(), NOW);
    expect(checked.ok).toBe(true);
    if (checked.ok) {
      expect(checked.day).toBe('2026-10-18');
      expect(checked.tz).toBe('Europe/Kyiv');
      expect(checked.at.toISOString()).toBe(AT);
    }
  });

  it.each([
    ['не UUID', { id: 'abc' }, 'invalid_payload'],
    ['UUID у верхньому регістрі', { id: ID.toUpperCase() }, 'invalid_payload'],
    ['невідомий тип', { type: 'task_delete' }, 'unknown_type'],
    ['час з майбутнього (>10 хв)', { at: '2026-10-18T09:30:00.000Z' }, 'invalid_payload'],
    ['битий час', { at: 'вчора' }, 'invalid_payload'],
    ['payload не обʼєкт', { payload: 'x' }, 'invalid_payload'],
    ['битий day', { day: '18.10.2026' }, 'invalid_payload'],
    ['старше 7 днів', { at: '2026-10-10T09:00:00.000Z' }, 'stale'],
  ])('%s → rejected/%s', (_label, overrides, reason) => {
    const checked = checkEnvelope(envelope(overrides), NOW);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.result).toEqual(expect.objectContaining({ status: 'rejected', reason }));
  });

  it('невалідний tz → пояс пристрою, day рахується сам', () => {
    const checked = checkEnvelope(envelope({ tz: 'Mars/Olympus', day: undefined }), NOW);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.tz).toBeUndefined();
  });

  it('retry лише в перші 15 хвилин', () => {
    expect(notFoundStatus(new Date(NOW.getTime() - 14 * 60_000), NOW)).toBe('retry');
    expect(notFoundStatus(new Date(NOW.getTime() - 16 * 60_000), NOW)).toBe('rejected');
  });

  it('makeDeviceAction дає lowercase UUID v4', () => {
    const action = makeDeviceAction('note_create', { text: 'x' }, { at: NOW, source: 'watch' });
    expect(isActionId(action.id)).toBe(true);
    expect(action.at).toBe(NOW.toISOString());
  });
});

describe('dayKeyInZone', () => {
  it('доба в поясі дії, а не в UTC', () => {
    expect(dayKeyInZone('2026-10-18T22:30:00.000Z', 'Europe/Kyiv')).toBe('2026-10-19');
    expect(dayKeyInZone('2026-10-18T02:30:00.000Z', 'America/New_York')).toBe('2026-10-17');
    expect(dayKeyInZone('2026-10-18', 'America/New_York')).toBe('2026-10-18');
  });
});

describe('записи завдань (§3.1–§3.2)', () => {
  const task: RecurringTask = {
    id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-in-progress', createdAt: AT,
    subtasks: [{ id: 's1', title: 'a', done: true }, { id: 's2', title: 'b', done: false }],
    deadline: '2026-10-18T09:00:00.000Z',
    recurrence: { freq: 'daily', interval: 1 },
    reviewState: 'approved',
    history: [{ id: 'h0', at: AT, type: 'created' }],
  };

  it('«готово»: колонка, підзавдання, подія wa-<id> з reopen', () => {
    const done = completeTaskRecord(task, { actionId: ID, at: AT, doneColumnId: 'status-done' });
    expect(done.status).toBe('done');
    expect(done.kanbanColumnId).toBe('status-done');
    expect(done.subtasks.every(s => s.done)).toBe(true);
    expect(done.history!.at(-1)).toEqual({
      id: `wa-${ID}`, at: AT, type: 'done', reopen: { columnId: 'status-in-progress', openSubtaskIds: ['s2'] },
    });
  });

  it('наступна копія повторюваної: id <id>-next, нова доба, без полів здачі', () => {
    const next = nextOccurrenceRecord(task, { actionId: ID, at: AT, todoColumnId: 'status-active' })!;
    expect(next.id).toBe(`${ID}-next`);
    expect(next.status).toBe('active');
    expect(next.kanbanColumnId).toBe('status-active');
    expect(next.subtasks.every(s => !s.done)).toBe(true);
    expect(next.timeEntries).toEqual([]);
    expect(next.history).toEqual([{ id: `wa-${ID}-n`, at: AT, type: 'created' }]);
    expect(next.createdAt).toBe(AT);
    expect(next.reviewState).toBeUndefined();
    expect(next.deadlineHasTime).toBeUndefined();
    expect(new Date(next.deadline!).getTime()).toBeGreaterThan(new Date(task.deadline!).getTime());
  });

  it('без правила чи дедлайну копії немає', () => {
    expect(nextOccurrenceRecord({ ...task, recurrence: undefined }, { actionId: ID, at: AT, todoColumnId: 'x' })).toBeNull();
    expect(nextOccurrenceRecord({ ...task, deadline: undefined }, { actionId: ID, at: AT, todoColumnId: 'x' })).toBeNull();
  });

  it('task_create — форма §3.2', () => {
    expect(createdTaskRecord({ actionId: ID, at: AT, title: 'Купити хліб', deadline: '2026-10-18T09:00:00.000Z' })).toEqual({
      id: ID, title: 'Купити хліб', status: 'active', kanbanColumnId: 'status-active',
      priorityLevel: 3, priority: 'medium', subtasks: [], createdAt: AT,
      deadline: '2026-10-18T09:00:00.000Z', history: [{ id: `wa-${ID}`, at: AT, type: 'created' }],
    });
  });
});

describe('таймери, гроші, звички, нотатки', () => {
  it('тривалість сесії — floor секунд, не менше нуля', () => {
    expect(sessionSeconds('2026-10-18T09:00:00.000Z', '2026-10-18T09:01:30.900Z')).toBe(90);
    expect(sessionSeconds('2026-10-18T09:05:00.000Z', '2026-10-18T09:00:00.000Z')).toBe(0);
  });

  it('сума округлюється до знаків валюти', () => {
    expect(roundAmount(120.456, 2)).toBe(120.46);
    expect(roundAmount(0.123456789, 8)).toBe(0.12345679);
    const tx = expenseRecord({
      actionId: ID, at: AT, amount: 99.999, category: 'Їжа', account: { id: 'a1', currency: 'UAH' }, decimals: 2,
    });
    expect(tx).toEqual({
      id: ID, type: 'expense', category: 'Їжа', amount: 100, note: '', date: AT, accountId: 'a1', currency: 'UAH',
    });
  });

  const habit: Habit = { id: 'h1', title: 'Вода', icon: 'drop.fill', color: '#0EA5E9', log: [], createdAt: AT };

  it('звичка: набір на добу, не перемикач', () => {
    const checked = habitAfterCheck(habit, { done: true, day: '2026-10-18', tz: 'Europe/Kyiv', at: AT })!;
    expect(checked.log).toEqual([AT]);
    // Повтор тієї самої відмітки — нічого міняти.
    expect(habitAfterCheck(checked, { done: true, day: '2026-10-18', tz: 'Europe/Kyiv', at: AT })).toBeNull();
    const unchecked = habitAfterCheck(checked, { done: false, day: '2026-10-18', tz: 'Europe/Kyiv', at: AT })!;
    expect(unchecked.log).toEqual([]);
    expect(habitAfterCheck(unchecked, { done: false, day: '2026-10-18', tz: 'Europe/Kyiv', at: AT })).toBeNull();
  });

  it('нотатка: назва — перший рядок до 80 символів', () => {
    const note = inboxNoteRecord({ actionId: ID, at: AT, text: `${'а'.repeat(90)}\nдругий рядок` });
    expect(note.title).toHaveLength(80);
    expect(note).toEqual(expect.objectContaining({ id: ID, createdAt: AT, updatedAt: AT }));
  });
});
