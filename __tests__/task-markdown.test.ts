import { formatDeadlineDayMonth, formatTaskMarkdown, taskToMarkdown, type TaskMarkdownLabels } from '@/utils/taskMarkdown';
import { DEFAULT_TASK_STATUS_COLUMNS, IN_PROGRESS_COLUMN_ID } from '@/utils/taskStatuses';

const UK: TaskMarkdownLabels = {
  project: 'Проєкт',
  sprint: 'Спринт',
  status: 'Статус',
  deadline: 'Дедлайн',
  subtasks: 'Підзавдання',
};

describe('formatTaskMarkdown', () => {
  test('повне завдання — усі рядки в погодженому порядку', () => {
    const text = formatTaskMarkdown(
      {
        title: 'Зверстати лендинг',
        description: 'Мобільна версія першою',
        deadline: '2026-09-21',
        subtasks: [
          { title: 'Макет', done: true },
          { title: 'Верстка', done: false },
        ],
      },
      { projectName: 'Сайт', sprintName: 'Спринт 3', statusLabel: 'У процесі' },
      UK,
    );
    expect(text).toBe([
      '**Зверстати лендинг**',
      'Проєкт: Сайт · Спринт: Спринт 3',
      'Статус: У процесі · Дедлайн: 21.09',
      '',
      'Мобільна версія першою',
      '',
      'Підзавдання:',
      '- [x] Макет',
      '- [ ] Верстка',
    ].join('\n'));
  });

  test('лише назва — жодних порожніх підписів чи рядків', () => {
    expect(formatTaskMarkdown({ title: '  Купити хліб  ' }, {}, UK)).toBe('**Купити хліб**');
  });

  test('порожні частини рядка пропускаються разом із роздільником', () => {
    const text = formatTaskMarkdown(
      { title: 'A', deadline: '2026-01-05' },
      { projectName: '', sprintName: 'S1', statusLabel: null },
      UK,
    );
    expect(text).toBe('**A**\nСпринт: S1\nДедлайн: 05.01');
  });

  test('без метаданих опис іде після порожнього рядка', () => {
    expect(formatTaskMarkdown({ title: 'A', description: '  опис \n' }, {}, UK)).toBe('**A**\n\nопис');
  });

  test('підзавдання без опису; порожні назви підзавдань не пишуться', () => {
    const text = formatTaskMarkdown(
      { title: 'A', subtasks: [{ title: ' ', done: false }, { title: 'x', done: true }] },
      { statusLabel: 'Готово' },
      UK,
    );
    expect(text).toBe('**A**\nСтатус: Готово\n\nПідзавдання:\n- [x] x');
  });

  test('підписи беруться зі словника (англійська)', () => {
    const text = formatTaskMarkdown(
      { title: 'A', subtasks: [{ title: 'b', done: false }] },
      { projectName: 'P' },
      { project: 'Project', sprint: 'Sprint', status: 'Status', deadline: 'Deadline', subtasks: 'Subtasks' },
    );
    expect(text).toBe('**A**\nProject: P\n\nSubtasks:\n- [ ] b');
  });
});

describe('formatDeadlineDayMonth', () => {
  test('YYYY-MM-DD не зсувається часовим поясом', () => {
    expect(formatDeadlineDayMonth('2026-03-01')).toBe('01.03');
  });

  test('ISO з часом — локальна дата', () => {
    const d = new Date(2026, 11, 31, 15, 0);
    expect(formatDeadlineDayMonth(d.toISOString())).toBe('31.12');
  });

  test('порожнє або зіпсоване — порожній рядок', () => {
    expect(formatDeadlineDayMonth(undefined)).toBe('');
    expect(formatDeadlineDayMonth('')).toBe('');
    expect(formatDeadlineDayMonth('не дата')).toBe('');
  });
});

describe('taskToMarkdown', () => {
  const columns = [...DEFAULT_TASK_STATUS_COLUMNS];
  const inProgress = columns.find(c => c.id === IN_PROGRESS_COLUMN_ID)!;

  test('назви проєкту, спринта й статусу розвʼязуються зі списків', () => {
    const text = taskToMarkdown(
      { title: 'A', status: 'active', kanbanColumnId: IN_PROGRESS_COLUMN_ID, projectId: 'p1', sprintId: 's1' },
      {
        projects: [{ id: 'p1', name: 'Сайт' }],
        sprints: [{ id: 's1', projectId: 'p1', name: 'Спринт 3', createdAt: '2026-09-01T00:00:00Z' } as any],
        columns,
      },
      UK,
    );
    expect(text).toBe(`**A**\nПроєкт: Сайт · Спринт: Спринт 3\nСтатус: ${inProgress.name}`);
  });

  test('невідомі проєкт і спринт просто пропускаються', () => {
    const text = taskToMarkdown(
      { title: 'A', status: 'done', projectId: 'gone', sprintId: 'gone' },
      { projects: [], sprints: [], columns },
      UK,
    );
    const done = columns.find(c => c.isDone)!;
    expect(text).toBe(`**A**\nСтатус: ${done.name}`);
  });
});
