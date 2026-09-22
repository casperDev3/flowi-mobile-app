/**
 * __tests__/task-list-sections.test.ts — межа між «сьогодні» і рештою списку
 * у вкладці завдань, згрупованій за статусом.
 *
 * Баг, який тут зафіксовано, повторювався тричі. Спершу статусні групи збирали
 * завдання з БУДЬ-ЯКИМ дедлайном, тож справа на листопад стояла в «До роботи»
 * поруч із сьогоднішньою. Потім майбутнє винесли в денні секції — але беклог
 * без дедлайну лишився в статусах, і для людини з півсотнею таких завдань
 * вкладка як показувала все, так і показувала. Потім і те, і те склали в
 * згорнуті шухляди — і денний режим усе одно читався як «ось завдання за інші
 * дні», просто дрібнішим шрифтом.
 *
 * Тому головне, що тут перевіряється, — несьогоднішнє у scope 'today' не
 * потрапляє в результат ВЗАГАЛІ: ні секцією, ні порожнім заголовком.
 *
 * Саме правило «сьогодні» тут не перевіряється: воно спільне з екраном дня і
 * має власний файл — task-today.test.ts.
 */

import { buildStatusListSections } from '../utils/taskListSections';
import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  mergeTaskStatusColumns,
} from '../utils/taskStatuses';
import type { Task } from '../utils/taskUtils';

const COLUMNS = mergeTaskStatusColumns([]);
/** 3 вересня 2026, четвер. Локальний полудень — щоб зсув зони нічого не з'їв. */
const TODAY = new Date(2026, 8, 3, 12, 0, 0);

const day = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0).toISOString();
const TOMORROW = day(2026, 8, 4);
const NEXT_WEEK = day(2026, 8, 10);
const NEXT_MONTH = day(2026, 9, 15);
const TODAY_ISO = day(2026, 8, 3);

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: over.id,
    priority: 'medium',
    status: 'active',
    subtasks: [],
    createdAt: day(2026, 7, 1),
    ...over,
  } as Task;
}

const keys = (sections: { key: string }[]) => sections.map(section => section.key);
const ids = (section: { tasks: Task[] }) => section.tasks.map(t => t.id);

beforeAll(() => {
  // isOverdue звіряється з реальним «зараз», а не з переданим `today`, тож без
  // фіксованого годинника «майбутнє» в тестах поступово ставало б простроченим.
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('scope «today»', () => {
  it('у результаті лише денна робота: ні беклогу, ні майбутніх днів', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'future', deadline: TOMORROW }),
        task({ id: 'today', deadline: TODAY_ISO }),
        task({ id: 'backlog' }),
      ],
      COLUMNS, TODAY,
    );
    expect(keys(sections)).toEqual([ACTIVE_COLUMN_ID]);
    expect(ids(sections[0])).toEqual(['today']);
  });

  it('беклог не дає ані секції, ані завдання в статусній групі', () => {
    // Власне баг: завдання без дедлайну — це не «до роботи на сьогодні».
    // Порожній масив тут навмисний: екран мусить показати порожній стан із
    // кнопкою «Показати всі», а не список із самих заголовків.
    expect(buildStatusListSections([task({ id: 'backlog' })], COLUMNS, TODAY)).toEqual([]);
  });

  it('майбутній день не дає секції навіть коли денна робота є', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'today', deadline: TODAY_ISO }),
        task({ id: 'week', deadline: NEXT_WEEK }),
        task({ id: 'month', deadline: NEXT_MONTH }),
      ],
      COLUMNS, TODAY,
    );
    expect(keys(sections)).toEqual([ACTIVE_COLUMN_ID]);
    expect(ids(sections[0])).toEqual(['today']);
  });

  it('неспарсовний дедлайн просто відсіюється, а не творить секцію «Invalid Date»', () => {
    // Усі порівняння з Invalid Date дають false, тож таке завдання денною
    // роботою не є — і секції по собі лишати не має права.
    expect(buildStatusListSections([task({ id: 'broken', deadline: 'не-дата' })], COLUMNS, TODAY))
      .toEqual([]);
  });

  it('«У процесі» перша, «Готово» остання', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'done', status: 'done' }),
        task({ id: 'plain', deadline: TODAY_ISO }),
        task({ id: 'running', kanbanColumnId: IN_PROGRESS_COLUMN_ID }),
      ],
      COLUMNS, TODAY,
    );
    expect(keys(sections)).toEqual([IN_PROGRESS_COLUMN_ID, ACTIVE_COLUMN_ID, DONE_COLUMN_ID]);
  });

  it('завершене лишається в «Готово», хай навіть його дедлайн у майбутньому', () => {
    // Завершене — підсумок, а не робота на майбутнє: відсіяти його за
    // дедлайном 10 вересня означало б спорожнити «Готово» і сховати зроблене.
    // Скільки завершеного сюди доходить, вирішує taskVisibleInList вище.
    const sections = buildStatusListSections(
      [task({ id: 'done', status: 'done', deadline: NEXT_WEEK })],
      COLUMNS, TODAY,
    );
    expect(keys(sections)).toEqual([DONE_COLUMN_ID]);
  });

  it('порожні колонки не дають секцій', () => {
    const sections = buildStatusListSections(
      [task({ id: 'a', deadline: TODAY_ISO })],
      COLUMNS, TODAY,
    );
    expect(keys(sections)).toEqual([ACTIVE_COLUMN_ID]);
  });

  it('порядок завдань усередині секції лишається вхідним', () => {
    // Вхід уже відсортований за пріоритетом — пересортувати його тут означало б
    // тихо перебити вибір користувача.
    const sections = buildStatusListSections(
      [
        task({ id: 'high', priority: 'high', deadline: TODAY_ISO }),
        task({ id: 'low', priority: 'low', deadline: TODAY_ISO }),
        task({ id: 'medium', priority: 'medium', deadline: TODAY_ISO }),
      ],
      COLUMNS, TODAY,
    );
    expect(ids(sections[0])).toEqual(['high', 'low', 'medium']);
  });

  it('кастомна колонка з датою в id більше ні з чим не стикається', () => {
    // Денні секції мали префікс «day:» саме через цей ризик; секцій немає —
    // а тест лишається, бо він про те, що ключ секції = id колонки.
    const columns = mergeTaskStatusColumns([
      { id: '2026-09-04', name: 'Дивна колонка', color: '#EC4899', position: 5, isDone: false },
    ]);
    const sections = buildStatusListSections(
      [
        task({ id: 'inColumn', kanbanColumnId: '2026-09-04', deadline: TODAY_ISO }),
        task({ id: 'plain', deadline: TODAY_ISO }),
      ],
      columns, TODAY,
    );
    expect(keys(sections)).toEqual([ACTIVE_COLUMN_ID, '2026-09-04']);
    expect(ids(sections[0])).toEqual(['plain']);
    expect(ids(sections[1])).toEqual(['inColumn']);
  });

  it('колір секції приходить із колонки', () => {
    const sections = buildStatusListSections(
      [task({ id: 'today', deadline: TODAY_ISO })],
      COLUMNS, TODAY,
    );
    expect(sections[0].color).toBe(COLUMNS.find(c => c.id === ACTIVE_COLUMN_ID)?.color);
  });
});

describe('scope «all»', () => {
  it('усе лягає в статусні групи — і беклог, і майбутнє', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'future', deadline: NEXT_MONTH }),
        task({ id: 'today', deadline: TODAY_ISO }),
        task({ id: 'backlog' }),
        task({ id: 'done', status: 'done' }),
      ],
      COLUMNS, TODAY, 'all',
    );
    expect(keys(sections)).toEqual([ACTIVE_COLUMN_ID, DONE_COLUMN_ID]);
    expect(ids(sections[0])).toEqual(['future', 'today', 'backlog']);
  });

  it('порядок колонок той самий, що й у денному режимі', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'done', status: 'done' }),
        task({ id: 'plain', deadline: NEXT_MONTH }),
        task({ id: 'running', deadline: NEXT_MONTH, kanbanColumnId: IN_PROGRESS_COLUMN_ID }),
      ],
      COLUMNS, TODAY, 'all',
    );
    expect(keys(sections)).toEqual([IN_PROGRESS_COLUMN_ID, ACTIVE_COLUMN_ID, DONE_COLUMN_ID]);
  });
});

describe('особистий список зводить колонки проєктів до особистих', () => {
  // Кожен проєкт має власні колонки з власними id. Групування за id давало на
  // екрані «Завдання» окрему «До роботи» на кожен проєкт — дублікати груп.
  const project = (projectId: string) => [
    { id: `st-${projectId}-todo`, name: 'До роботи', color: '#6366F1', position: 0, isDone: false, projectId, type: 'todo' as const, sourceStatusId: ACTIVE_COLUMN_ID },
    { id: `st-${projectId}-done`, name: 'Готово', color: '#10B981', position: 1, isDone: true, projectId, type: 'done' as const },
    { id: `st-${projectId}-qa`, name: 'Тестування', color: '#0EA5E9', position: 2, isDone: false, projectId, type: 'in_progress' as const },
  ];
  const all = [...mergeTaskStatusColumns([]), ...project('p1'), ...project('p2')];
  const tasks = [
    task({ id: 'personal', deadline: TODAY_ISO }),
    task({ id: 'p1-todo', projectId: 'p1', kanbanColumnId: 'st-p1-todo', deadline: TODAY_ISO }),
    task({ id: 'p2-todo', projectId: 'p2', kanbanColumnId: 'st-p2-todo', deadline: TODAY_ISO }),
    task({ id: 'p1-done', projectId: 'p1', kanbanColumnId: 'st-p1-done', status: 'done', deadline: TODAY_ISO }),
    task({ id: 'p2-qa', projectId: 'p2', kanbanColumnId: 'st-p2-qa', deadline: TODAY_ISO }),
  ];

  it('одна група на статус: за sourceStatusId, назвою, а потім типом', () => {
    const sections = buildStatusListSections(tasks, all, TODAY, 'all', true);
    // «У процесі» в списку першою — так упорядковує orderColumnsForList.
    expect(keys(sections)).toEqual([IN_PROGRESS_COLUMN_ID, ACTIVE_COLUMN_ID, DONE_COLUMN_ID]);
    expect(ids(sections[0])).toEqual(['p2-qa']);
    expect(ids(sections[1])).toEqual(['personal', 'p1-todo', 'p2-todo']);
    expect(ids(sections[2])).toEqual(['p1-done']);
  });

  it('список усередині проєкту лишає власні колонки проєкту', () => {
    const sections = buildStatusListSections(tasks.filter(t => t.projectId === 'p1'), all, TODAY, 'all');
    expect(keys(sections)).toEqual(['st-p1-todo', 'st-p1-done']);
  });
});
