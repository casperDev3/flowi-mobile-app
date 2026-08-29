import {
  draftEstimatedMinutes,
  draftRecurrence,
  taskToDraft,
  type EditableTask,
} from '../hooks/use-task-editor';

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
    expect(d.priority).toBe(task.priority);
    expect(d.deadline).toBe(task.deadline);
    expect(draftEstimatedMinutes(d)).toBe(task.estimatedMinutes);
    expect(draftRecurrence(d)).toEqual(task.recurrence);
  });
});
