import {
  draftCurrentSprintId,
  draftEstimatedMinutes,
  draftRecurrence,
  editedDraftFields,
  taskToDraft,
  type EditableTask,
} from '../hooks/use-task-editor';
import { assigneeDisplayName, createdByAfterProjectChange } from '../utils/taskUtils';

const base: EditableTask = { title: 'Купити молоко', priority: 'medium' };

describe('taskToDraft', () => {
  it('розкладає хвилини на години й хвилини', () => {
    const d = taskToDraft({ ...base, estimatedMinutes: 150 }, 'col');
    expect(d.estHours).toBe('2');
    expect(d.estMins).toBe('30');
  });

  it('нульову частину лишає порожньою, а не нулем', () => {
    // '0' у полі вводу читається як введене значення, хоча користувач
    // нічого не вводив.
    const d = taskToDraft({ ...base, estimatedMinutes: 120 }, 'col');
    expect(d.estHours).toBe('2');
    expect(d.estMins).toBe('');

    const under = taskToDraft({ ...base, estimatedMinutes: 45 }, 'col');
    expect(under.estHours).toBe('');
    expect(under.estMins).toBe('45');
  });

  it('без оцінки часу обидва поля порожні', () => {
    const d = taskToDraft(base, 'col');
    expect(d.estHours).toBe('');
    expect(d.estMins).toBe('');
  });

  it('відсутній опис стає порожнім рядком', () => {
    // Веб-клієнт пише undefined замість порожнього рядка; TextInput від
    // undefined став би некерованим.
    expect(taskToDraft(base, 'col').desc).toBe('');
  });

  it('повторення з датою кінця вмикає режим until', () => {
    const d = taskToDraft(
      { ...base, recurrence: { freq: 'weekly', interval: 2, daysOfWeek: [0, 3], until: '2026-12-31' } },
      'col',
    );
    expect(d.repeat).toBe(true);
    expect(d.repeatEndType).toBe('until');
    expect(d.repeatUntil).toBe('2026-12-31');
    expect(d.repeatDays).toEqual([0, 3]);
  });

  it('повторення без дати кінця — режим never', () => {
    const d = taskToDraft({ ...base, recurrence: { freq: 'daily', interval: 1 } }, 'col');
    expect(d.repeatEndType).toBe('never');
    expect(d.repeatUntil).toBe('');
  });
});

describe('taskToDraft — спринт', () => {
  it('без спринта — беклог (null)', () => {
    expect(taskToDraft(base, 'col').sprintId).toBeNull();
  });

  it('поточний спринт переноситься дослівно', () => {
    const d = taskToDraft({ ...base, projectId: 'p1', sprintId: 's-closed' }, 'col');
    expect(d.projectId).toBe('p1');
    expect(d.sprintId).toBe('s-closed');
  });
});

describe('draftCurrentSprintId', () => {
  test('обраний у чернетці спринт — він', () => {
    expect(draftCurrentSprintId({ projectId: 'p1', sprintId: 's1' }, { projectId: 'p1', sprintId: 's0' })).toBe('s1');
  });
  test('«Беклог» при тому ж проєкті — вихідний спринт', () => {
    expect(draftCurrentSprintId({ projectId: 'p1', sprintId: null }, { projectId: 'p1', sprintId: 's0' })).toBe('s0');
  });
  test('інший проєкт або створення — null', () => {
    expect(draftCurrentSprintId({ projectId: 'p2', sprintId: null }, { projectId: 'p1', sprintId: 's0' })).toBeNull();
    expect(draftCurrentSprintId({ projectId: 'p1', sprintId: null }, null)).toBeNull();
  });
});

describe('draftEstimatedMinutes', () => {
  const d = (estHours: string, estMins: string) => ({ ...taskToDraft(base, 'c'), estHours, estMins });

  it('складає години й хвилини', () => {
    expect(draftEstimatedMinutes(d('2', '30'))).toBe(150);
    expect(draftEstimatedMinutes(d('', '45'))).toBe(45);
  });

  it('порожня форма означає «не вказано», а не нуль', () => {
    // Нуль хвилин записався б у завдання як реальна оцінка «0 хв».
    expect(draftEstimatedMinutes(d('', ''))).toBeUndefined();
    expect(draftEstimatedMinutes(d('0', '0'))).toBeUndefined();
  });
});

describe('draftRecurrence', () => {
  const withRepeat = (over: Partial<ReturnType<typeof taskToDraft>>) => ({
    ...taskToDraft(base, 'c'), repeat: true, ...over,
  });

  it('вимкнене повторення дає undefined', () => {
    expect(draftRecurrence(taskToDraft(base, 'c'))).toBeUndefined();
  });

  it('дні тижня зберігаються лише для тижневого повторення', () => {
    // Інакше вони лишилися б у даних як мовчазне сміття, яке нічого
    // не робить, але видно в синку й експорті.
    expect(draftRecurrence(withRepeat({ repeatFreq: 'weekly', repeatDays: [1, 2] }))?.daysOfWeek).toEqual([1, 2]);
    expect(draftRecurrence(withRepeat({ repeatFreq: 'monthly', repeatDays: [1, 2] }))?.daysOfWeek).toBeUndefined();
  });

  it('порожній список днів не пишеться', () => {
    expect(draftRecurrence(withRepeat({ repeatFreq: 'weekly', repeatDays: [] }))?.daysOfWeek).toBeUndefined();
  });

  it('дата кінця пишеться лише в режимі until', () => {
    expect(draftRecurrence(withRepeat({ repeatEndType: 'until', repeatUntil: '2026-12-31' }))?.until).toBe('2026-12-31');
    expect(draftRecurrence(withRepeat({ repeatEndType: 'never', repeatUntil: '2026-12-31' }))?.until).toBeUndefined();
  });
});

describe('обіг завдання через чернетку', () => {
  it('не втрачає й не вигадує даних', () => {
    const task: EditableTask = {
      title: 'Звіт', description: 'за квартал', priority: 'high',
      estimatedMinutes: 195, deadline: '2026-09-01',
      recurrence: { freq: 'weekly', interval: 2, daysOfWeek: [4], until: '2026-11-30' },
    };
    const d = taskToDraft(task, 'col');

    expect(d.title).toBe(task.title);
    expect(d.desc).toBe(task.description);
    expect(d.priorityLevel).toBe(1); // легасі 'high' → P1
    expect(d.deadline).toBe(task.deadline);
    expect(draftEstimatedMinutes(d)).toBe(task.estimatedMinutes);
    expect(draftRecurrence(d)).toEqual(task.recurrence);
  });
});

describe('завдання без пріоритету (старі записи з деталі проєкту)', () => {
  it('чернетка показує «без пріоритету», а не падає', () => {
    const legacy = { title: 'З попапа' } as EditableTask;
    expect(taskToDraft(legacy, 'col').priorityLevel).toBeNull();
    const broken = { title: 'Биті дані', priority: 'urgent' } as unknown as EditableTask;
    expect(taskToDraft(broken, 'col').priorityLevel).toBeNull();
  });
});

describe('пріоритет P0–P5 у чернетці (CONTRACT §B.5)', () => {
  it('новий рівень читається як є, розбіжність з легасі — перемагає легасі', () => {
    expect(taskToDraft({ title: 'a', priority: 'high', priorityLevel: 0 }, 'c').priorityLevel).toBe(0);
    expect(taskToDraft({ title: 'a', priority: 'low', priorityLevel: 0 }, 'c').priorityLevel).toBe(4);
    expect(taskToDraft({ title: 'a', priority: 'low', priorityLevel: null }, 'c').priorityLevel).toBeNull();
  });
});

describe('editedDraftFields — пишуться лише змінені у формі поля', () => {
  it('створення (initial null) — змінено все', () => {
    const d = taskToDraft(base, 'col');
    expect(editedDraftFields(null, d).has('title')).toBe(true);
    // 9 полів форми + 'assignee' (контракт §4.5) — виконавець.
    expect(editedDraftFields(null, d).size).toBe(10);
  });

  it('форма без правок — нічого', () => {
    const d = taskToDraft({ ...base, estimatedMinutes: 30, deadline: '2026-09-20' }, 'col');
    expect(editedDraftFields(d, { ...d }).size).toBe(0);
  });

  it('змінена лише назва — лише title (статус з вебу не перезапишеться)', () => {
    const d = taskToDraft(base, 'col');
    expect([...editedDraftFields(d, { ...d, title: 'Купити хліб' })]).toEqual(['title']);
  });

  it('пробіли навколо назви — не правка', () => {
    const d = taskToDraft(base, 'col');
    expect(editedDraftFields(d, { ...d, title: ' Купити молоко ' }).size).toBe(0);
  });

  it('оцінка порівнюється у хвилинах, а не рядками полів', () => {
    const d = taskToDraft({ ...base, estimatedMinutes: 60 }, 'col');
    expect(editedDraftFields(d, { ...d, estHours: '', estMins: '60' }).size).toBe(0);
    expect([...editedDraftFields(d, { ...d, estMins: '15' })]).toEqual(['estimate']);
  });

  it('повторення, статус і проєкт — окремі групи', () => {
    const d = taskToDraft(base, 'col');
    const edited = editedDraftFields(d, { ...d, repeat: true, statusId: 'done', projectId: 'p1' });
    expect([...edited].sort()).toEqual(['project', 'recurrence', 'status']);
  });

  // §4.5 — виконавець: обрати, зняти («Без виконавця» → null) і «не чіпати».
  it('виконавець — окрема група, null теж рахується зміною', () => {
    const withAssignee = taskToDraft({ ...base, assigneeId: '42' }, 'col');
    expect(editedDraftFields(withAssignee, { ...withAssignee }).size).toBe(0);
    expect([...editedDraftFields(withAssignee, { ...withAssignee, assigneeId: null })]).toEqual(['assignee']);
    expect([...editedDraftFields(withAssignee, { ...withAssignee, assigneeId: '7' })]).toEqual(['assignee']);
  });

  it('taskToDraft: відсутній assigneeId → null (не undefined)', () => {
    expect(taskToDraft(base, 'col').assigneeId).toBeNull();
  });
});

// §3.7 review finding: перенесення особистої/соло-проєктної задачі без
// createdBy у проєкт не має ховати її з «Сьогодні»/«Завдання» власника —
// isMyTask вимагає дослівної рівності createdBy == me, без фолбеку.
describe('createdByAfterProjectChange', () => {
  it('дописує мене автором задачі без createdBy, яка потрапляє в проєкт', () => {
    expect(createdByAfterProjectChange({ projectId: 'p1', createdBy: undefined }, 'u1')).toBe('u1');
  });

  it('не чіпає наявний createdBy — авторство не змінюється переносом', () => {
    expect(createdByAfterProjectChange({ projectId: 'p1', createdBy: 'u2' }, 'u1')).toBe('u2');
  });

  it('задача без проєкту (повернена в Особисте) — createdBy не займаємо', () => {
    expect(createdByAfterProjectChange({ projectId: undefined, createdBy: undefined }, 'u1')).toBeUndefined();
  });

  it('без сесії (myUserId відсутній) — не пише порожнє значення', () => {
    expect(createdByAfterProjectChange({ projectId: 'p1', createdBy: undefined }, null)).toBeUndefined();
  });
});

// §4.5 — підпис виконавця на компактній картці (TaskCompactCard, task-group,
// project/[id]/tasks). Чиста функція: та сама, що вже показує «Я»/ім'я в
// пікері TaskEditForm, лише винесена, щоб її бачили й списки, де редактора
// нема.
describe('assigneeDisplayName', () => {
  const members = [
    { user: { id: 1, name: 'Оля', email: 'olya@example.com' } },
    { user: { id: 2, name: '', email: 'bez-imeni@example.com' } },
  ];

  it('без assigneeId — null (немає виконавця)', () => {
    expect(assigneeDisplayName(null, members, 'u1', 'Я')).toBeNull();
  });

  it('assigneeId === myUserId — мітка "Я", а не ім\'я з кешу', () => {
    expect(assigneeDisplayName('1', members, '1', 'Я')).toBe('Я');
  });

  it('чужий assigneeId — ім\'я учасника з кешу', () => {
    expect(assigneeDisplayName('1', members, '2', 'Я')).toBe('Оля');
  });

  it('учасник без імені — фолбек на email', () => {
    expect(assigneeDisplayName('2', members, '1', 'Я')).toBe('bez-imeni@example.com');
  });

  it('assigneeId, якого нема в кеші (учасника прибрали) — null, не "невідомий"', () => {
    expect(assigneeDisplayName('99', members, '1', 'Я')).toBeNull();
  });

  it('без сесії (myUserId відсутній) — все одно шукає в кеші', () => {
    expect(assigneeDisplayName('1', members, null, 'Я')).toBe('Оля');
  });
});
