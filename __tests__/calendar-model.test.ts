import {
  activeSprints, addDaysKey, bucketMeetings, bucketTasks, dateKey, deadlineIsoForKey, defaultCalendarView,
  layoutDayMeetings, layoutSprintRow, mergeCalendarProjects, mondayKey, monthMatrix, periodTitle,
  PERSONAL_FILTER, searchCalendar, shiftAnchor, sprintsOnDay, taskDeadlineKey, viewRange, type CalendarProject,
} from '../components/calendar/calendarModel';
import type { Meeting } from '../utils/meetings';
import type { Sprint } from '../utils/sprintUtils';
import type { Task } from '../utils/taskUtils';

const labels = {
  months: ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'],
  monthsGenitive: ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'],
  weekdaysFull: ['Понеділок','Вівторок','Середа','Четвер',"П'ятниця",'Субота','Неділя'],
};

function task(over: Partial<Task>): Task {
  return { id: 't', title: 'T', status: 'active', subtasks: [], createdAt: '2026-10-01T00:00:00.000Z', ...over } as Task;
}
function meeting(over: Partial<Meeting>): Meeting {
  return { id: 'm', title: 'M', date: '2026-10-06', time: '10:00', durationMinutes: 60, color: '#6366F1', ...over };
}
const P1: CalendarProject = { id: 'p1', name: 'Alpha', color: '#EF4444' };
const projects = new Map([[P1.id, P1]]);

describe('дати', () => {
  it('тиждень починається з понеділка, навіть для неділі', () => {
    expect(mondayKey('2026-10-11')).toBe('2026-10-05'); // неділя
    expect(mondayKey('2026-10-05')).toBe('2026-10-05');
  });

  it('місяць — лише потрібні рядки, кожен з понеділка', () => {
    const rows = monthMatrix(2026, 9); // жовтень 2026: 1-ше — четвер
    expect(rows[0][0]).toBe('2026-09-28');
    expect(rows.every(r => r.length === 7)).toBe(true);
    expect(rows[rows.length - 1]).toContain('2026-10-31');
    expect(rows.length).toBe(5);
  });

  it('зсув місяця обрізає число до довжини місяця', () => {
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftAnchor('week', '2026-10-06', -1)).toBe('2026-09-29');
    expect(shiftAnchor('day', '2026-12-31', 1)).toBe('2027-01-01');
  });

  it('діапазон виду', () => {
    expect(viewRange('day', '2026-10-06').days).toEqual(['2026-10-06']);
    expect(viewRange('week', '2026-10-06')).toMatchObject({ start: '2026-10-05', end: '2026-10-11' });
  });

  it('підписи періоду', () => {
    expect(periodTitle('month', '2026-10-06', labels)).toBe('Жовтень 2026');
    expect(periodTitle('week', '2026-10-06', labels)).toBe('5–11 жовтня 2026');
    expect(periodTitle('week', '2026-09-30', labels)).toBe('28 вересня – 4 жовтня 2026');
    expect(periodTitle('day', '2026-10-06', labels)).toBe('Вівторок, 6 жовтня');
  });

  it('дедлайн — локальний день ISO, а не зріз рядка', () => {
    const iso = deadlineIsoForKey('2026-10-06');
    expect(taskDeadlineKey({ deadline: iso })).toBe('2026-10-06');
    expect(taskDeadlineKey({ deadline: '2026-10-06' })).toBe('2026-10-06');
    expect(taskDeadlineKey({ deadline: 'nonsense' })).toBeNull();
    expect(addDaysKey('2026-10-06', 0)).toBe(dateKey(new Date(2026, 9, 6)));
  });

  it('типовий вид: телефон — місяць, планшет — тиждень', () => {
    expect(defaultCalendarView(false)).toBe('month');
    expect(defaultCalendarView(true)).toBe('week');
  });
});

describe('проєкти', () => {
  it('зливає локальні й workspace, без архівних', () => {
    const merged = mergeCalendarProjects(
      [{ id: 'a', name: 'B-local', color: '#111111' }, { id: 'x', name: 'Arch', color: '#222222', archivedAt: '2026-01-01' }],
      [{ id: 'a', name: 'B-remote', color: '#333333' }, { id: 'b', name: 'A-remote', color: '#444444' },
        { id: 'x', name: 'Arch', color: '#222222' }, { id: 'z', name: 'Z', color: '#555555', archived_at: '2026-01-01' }],
    );
    expect(merged.map(p => p.id)).toEqual(['b', 'a']);
    expect(merged.find(p => p.id === 'a')?.name).toBe('B-local');
  });
});

describe('завдання', () => {
  const base = {
    filter: null, showDone: true, onlyMine: true, myUserId: 'u1', roles: { p1: 'member' },
    isDone: (t: Task) => t.status === 'done', projects, personalColor: '#7C3AED',
  };
  const tasks = [
    task({ id: 'personal', deadline: deadlineIsoForKey('2026-10-06') }),
    task({ id: 'mine', projectId: 'p1', assigneeId: 'u1', deadline: deadlineIsoForKey('2026-10-06') }),
    task({ id: 'other', projectId: 'p1', assigneeId: 'u2', deadline: deadlineIsoForKey('2026-10-06') }),
    task({ id: 'done', status: 'done', deadline: deadlineIsoForKey('2026-10-06') }),
    task({ id: 'foreign', projectId: 'gone', assigneeId: 'u1', deadline: deadlineIsoForKey('2026-10-06') }),
    task({ id: 'idea', backlogKind: 'idea', deadline: deadlineIsoForKey('2026-10-06') }),
    task({ id: 'nodl' }),
  ];

  it('особисті + мої проєктні; виконані — в кінці', () => {
    const out = bucketTasks(tasks, base)['2026-10-06'].map(i => i.task.id);
    expect(out).toHaveLength(3);
    expect(out).toContain('personal');
    expect(out).toContain('mine');
    expect(out).not.toContain('other');
    expect(out).not.toContain('foreign');
    expect(out).not.toContain('idea');
    expect(out[out.length - 1]).toBe('done');
  });

  it('«Лише мої» вимкнено — видно й чужі проєктні; колір — проєкту', () => {
    const items = bucketTasks(tasks, { ...base, onlyMine: false })['2026-10-06'];
    expect(items.map(i => i.task.id)).toContain('other');
    expect(items.find(i => i.task.id === 'other')?.color).toBe('#EF4444');
    expect(items.find(i => i.task.id === 'personal')?.color).toBe('#7C3AED');
  });

  it('фільтр проєкту і приховування виконаних', () => {
    expect(bucketTasks(tasks, { ...base, filter: PERSONAL_FILTER })['2026-10-06'].map(i => i.task.id).sort())
      .toEqual(['done', 'personal']);
    expect(bucketTasks(tasks, { ...base, filter: 'p1' })['2026-10-06'].map(i => i.task.id)).toEqual(['mine']);
    expect(bucketTasks(tasks, { ...base, showDone: false })['2026-10-06'].map(i => i.task.id)).not.toContain('done');
  });
});

describe('зустрічі', () => {
  it('фільтр і порядок за часом', () => {
    const out = bucketMeetings([
      meeting({ id: 'b', time: '12:00' }), meeting({ id: 'a', time: '09:30' }), meeting({ id: 'p', projectId: 'p1' }),
    ], PERSONAL_FILTER);
    expect(out['2026-10-06'].map(m => m.id)).toEqual(['a', 'b']);
  });

  it('перекриття діляться шириною', () => {
    const laid = layoutDayMeetings([
      meeting({ id: 'a', time: '10:00', durationMinutes: 60 }),
      meeting({ id: 'b', time: '10:30', durationMinutes: 60 }),
      meeting({ id: 'c', time: '12:00', durationMinutes: 5 }),
    ]);
    const byId = Object.fromEntries(laid.map(p => [p.meeting.id, p]));
    expect(byId.a).toMatchObject({ col: 0, cols: 2 });
    expect(byId.b).toMatchObject({ col: 1, cols: 2 });
    expect(byId.c).toMatchObject({ col: 0, cols: 1, endMin: 12 * 60 + 15 });
  });
});

describe('спринти', () => {
  const sprints: Sprint[] = [
    { id: 's1', projectId: 'p1', name: 'Один', createdAt: '2026-09-01', startDate: '2026-10-01T00:00:00', endDate: '2026-10-07T00:00:00' },
    { id: 's2', projectId: 'p1', name: 'Два', createdAt: '2026-09-02' },
    { id: 's3', projectId: 'p1', name: 'Закритий', createdAt: '2026-09-03', closedAt: '2026-09-30', startDate: '2026-10-01', endDate: '2026-10-02' },
    { id: 's4', projectId: 'p1', name: 'Чотири', createdAt: '2026-09-04', startDate: '2026-10-05', endDate: '2026-10-20' },
    { id: 's5', projectId: 'other', name: 'Чужий', createdAt: '2026-09-04', startDate: '2026-10-05', endDate: '2026-10-20' },
  ];

  it('активні з датами — смуги; без дат — окремо; номер за створенням', () => {
    const { bars, undated } = activeSprints(sprints, projects, null);
    expect(bars.map(b => [b.sprint.id, b.number])).toEqual([['s1', 1], ['s4', 4]]);
    expect(undated.map(u => u.sprint.id)).toEqual(['s2']);
    expect(activeSprints(sprints, projects, PERSONAL_FILTER).bars).toEqual([]);
  });

  it('календар проєкту: includeClosed додає закриті, колір смуги — колір проєкту', () => {
    const { bars } = activeSprints(sprints, projects, 'p1', { includeClosed: true });
    expect(bars.map(b => b.sprint.id)).toEqual(['s3', 's1', 's4']);
    for (const b of bars) expect(b.project.color).toBe(projects.get('p1')!.color);
  });

  it('розкладка рядка: доріжки й продовження', () => {
    const { bars } = activeSprints(sprints, projects, null);
    const week = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
    const { segments } = layoutSprintRow(bars, week);
    const s1 = segments.find(s => s.bar.sprint.id === 's1')!;
    const s4 = segments.find(s => s.bar.sprint.id === 's4')!;
    expect(s1).toMatchObject({ startCol: 0, span: 3, lane: 0, continuesLeft: true, continuesRight: false });
    expect(s4).toMatchObject({ startCol: 0, span: 7, lane: 1, continuesLeft: false, continuesRight: true });
    expect(sprintsOnDay(bars, '2026-10-08').map(b => b.sprint.id)).toEqual(['s4']);
  });

  it('що не влізло в доріжки — у overflow', () => {
    const { bars } = activeSprints(sprints, projects, null);
    const { segments, overflow } = layoutSprintRow(bars, ['2026-10-05', '2026-10-06'], 1);
    expect(segments).toHaveLength(1);
    expect(overflow).toEqual([1, 1]);
  });
});

describe('пошук', () => {
  const mk = (id: string, date: string, title: string, extra: Partial<Meeting> = {}): Meeting =>
    ({ id, title, date, time: '10:00', durationMinutes: 30, color: '#6366F1', ...extra }) as Meeting;
  const meetingsByDay: Record<string, Meeting[]> = {
    '2026-09-01': [mk('m1', '2026-09-01', 'Ретро спринту')],
    '2026-10-01': [mk('r_1', '2026-10-01', 'Стендап', { _origId: 'r' })],
    '2026-10-08': [mk('r_2', '2026-10-08', 'Стендап', { _origId: 'r' })],
    '2026-10-15': [mk('r_3', '2026-10-15', 'Стендап', { _origId: 'r' })],
    '2026-10-20': [mk('m2', '2026-10-20', 'Клієнт', { notes: 'обговорити ретро' })],
  };
  const task = { id: 't1', title: 'Підготувати ретро', status: 'active', subtasks: [], createdAt: '2026-01-01' } as unknown as Task;
  const tasksByDay = { '2026-10-10': [{ task, day: '2026-10-10', done: false, color: '#7C3AED', project: null }] };

  it('порожній запит — нічого', () => {
    expect(searchCalendar('  ', meetingsByDay, tasksByDay, '2026-10-07').total).toBe(0);
  });

  it('шукає в назві й нотатках, включно з історією; майбутнє за зростанням, минуле — від свіжого', () => {
    const r = searchCalendar('РЕТРО', meetingsByDay, tasksByDay, '2026-10-07');
    expect(r.upcoming.map(g => g.day)).toEqual(['2026-10-10', '2026-10-20']);
    expect(r.past.map(g => g.day)).toEqual(['2026-09-01']);
    expect(r.total).toBe(3);
  });

  it('повторювана серія — один рядок: найближчий екземпляр від сьогодні', () => {
    const r = searchCalendar('стендап', meetingsByDay, tasksByDay, '2026-10-07');
    expect(r.total).toBe(1);
    expect(r.upcoming[0].meetings[0].id).toBe('r_2');
    const ended = searchCalendar('стендап', meetingsByDay, tasksByDay, '2026-11-01');
    expect(ended.past[0].meetings[0].id).toBe('r_3');
  });
});
