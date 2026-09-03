/**
 * __tests__/task-list-sections.test.ts — межа між «сьогодні» і «майбутнім»
 * у списку завдань, згрупованому за статусом.
 *
 * Баг, який тут зафіксовано: статусні групи збирали завдання з БУДЬ-ЯКИМ
 * дедлайном, тож справа на завтра чи на листопад стояла в «До роботи» поруч
 * із сьогоднішньою. Друга половина тестів стежить, щоб правило не розійшлося
 * з правилом екрана дня — розходження копій тут уже траплялось.
 */

import {
  belongsInStatusGroups,
  buildStatusListSections,
} from '../utils/taskListSections';
import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  mergeTaskStatusColumns,
  type TaskStatusColumn,
} from '../utils/taskStatuses';
import { groupTodayTasks } from '../utils/todayGroups';
import type { Task } from '../utils/taskUtils';

const COLUMNS = mergeTaskStatusColumns([]);
/** 3 вересня 2026, четвер. Локальний полудень — щоб зсув зони нічого не з'їв. */
const TODAY = new Date(2026, 8, 3, 12, 0, 0);

const day = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0).toISOString();
const TOMORROW = day(2026, 8, 4);
const NEXT_WEEK = day(2026, 8, 10);
const NEXT_MONTH = day(2026, 9, 15);
const YESTERDAY = day(2026, 8, 2);
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

/** Підпис денної секції в тестах — сам ключ дати, щоб перевіряти саме порядок. */
const label = (d: Date) => `d:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

beforeAll(() => {
  // isOverdue звіряється з реальним «зараз», а не з переданим `today`, тож без
  // фіксованого годинника «майбутнє» в тестах поступово ставало б простроченим.
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('belongsInStatusGroups', () => {
  it('дедлайн сьогодні лишається в статусних групах', () => {
    expect(belongsInStatusGroups(task({ id: 'a', deadline: TODAY_ISO }), COLUMNS, TODAY)).toBe(true);
  });

  it('дедлайн завтра йде в денну секцію, а не в статуси', () => {
    // Власне баг: «завтра» — це не «до роботи на сьогодні».
    expect(belongsInStatusGroups(task({ id: 'a', deadline: TOMORROW }), COLUMNS, TODAY)).toBe(false);
  });

  it('дедлайн через місяць теж не потрапляє в статуси', () => {
    expect(belongsInStatusGroups(task({ id: 'a', deadline: NEXT_MONTH }), COLUMNS, TODAY)).toBe(false);
  });

  it('завдання без дедлайну лишається в статусах', () => {
    // Беклог — це не «майбутній день»: у того, хто дедлайнів не ставить,
    // винесення таких завдань униз лишило б базовий екран порожнім.
    expect(belongsInStatusGroups(task({ id: 'a' }), COLUMNS, TODAY)).toBe(true);
  });

  it('«У процесі» з майбутнім дедлайном лишається в статусах', () => {
    const t = task({ id: 'a', deadline: NEXT_WEEK, kanbanColumnId: IN_PROGRESS_COLUMN_ID });
    expect(belongsInStatusGroups(t, COLUMNS, TODAY)).toBe(true);
  });

  it('«На перевірці» з майбутнім дедлайном теж лишається в статусах', () => {
    // Окремий тест навмисно: пропустити цю колонку — рівно те мовчазне
    // розходження з todayGroups, від якого застерігають коментарі там.
    const t = task({ id: 'a', deadline: NEXT_WEEK, kanbanColumnId: REVIEW_COLUMN_ID });
    expect(belongsInStatusGroups(t, COLUMNS, TODAY)).toBe(true);
  });

  it('завершене з майбутнім дедлайном лишається в «Готово»', () => {
    const t = task({ id: 'a', status: 'done', deadline: NEXT_WEEK });
    expect(belongsInStatusGroups(t, COLUMNS, TODAY)).toBe(true);
  });

  it('завершене з учорашнім дедлайном лишається в «Готово»', () => {
    const t = task({ id: 'a', status: 'done', deadline: YESTERDAY });
    expect(belongsInStatusGroups(t, COLUMNS, TODAY)).toBe(true);
  });

  it('прострочене активне лишається в статусах, а не творить учорашню секцію', () => {
    expect(belongsInStatusGroups(task({ id: 'a', deadline: YESTERDAY }), COLUMNS, TODAY)).toBe(true);
  });

  it('майбутнє в кастомній не-done колонці все одно йде в денну секцію', () => {
    // Виняток стосується лише двох системних колонок роботи, а не будь-якої
    // колонки, яку користувач створив сам.
    const columns = mergeTaskStatusColumns([
      { id: 'custom', name: 'Обговорення', color: '#EC4899', position: 5, isDone: false },
    ]);
    const t = task({ id: 'a', deadline: TOMORROW, kanbanColumnId: 'custom' });
    expect(belongsInStatusGroups(t, columns, TODAY)).toBe(false);
  });
});

describe('buildStatusListSections', () => {
  it('усі статусні секції стоять перед усіма денними', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'future', deadline: TOMORROW }),
        task({ id: 'today', deadline: TODAY_ISO }),
        task({ id: 'backlog' }),
      ],
      COLUMNS, TODAY, label,
    );
    expect(sections.map(section => section.key)).toEqual([ACTIVE_COLUMN_ID, 'day:2026-09-04']);
    expect(sections[0].tasks.map(t => t.id)).toEqual(['today', 'backlog']);
    expect(sections[1].tasks.map(t => t.id)).toEqual(['future']);
  });

  it('«У процесі» перша серед статусних, «Готово» остання', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'done', status: 'done' }),
        task({ id: 'plain' }),
        task({ id: 'running', kanbanColumnId: IN_PROGRESS_COLUMN_ID }),
      ],
      COLUMNS, TODAY, label,
    );
    expect(sections.map(section => section.key)).toEqual([
      IN_PROGRESS_COLUMN_ID, ACTIVE_COLUMN_ID, DONE_COLUMN_ID,
    ]);
  });

  it('денні секції йдуть за зростанням дати незалежно від порядку на вході', () => {
    const sections = buildStatusListSections(
      [
        task({ id: 'week', deadline: NEXT_WEEK }),
        task({ id: 'month', deadline: NEXT_MONTH }),
        task({ id: 'tomorrow', deadline: TOMORROW }),
      ],
      COLUMNS, TODAY, label,
    );
    expect(sections.map(section => section.key)).toEqual([
      'day:2026-09-04', 'day:2026-09-10', 'day:2026-10-15',
    ]);
  });

  it('порожні колонки не дають секцій', () => {
    const sections = buildStatusListSections([task({ id: 'a' })], COLUMNS, TODAY, label);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe(ACTIVE_COLUMN_ID);
  });

  it('підпис денної секції бере передана функція, а не сама утиліта', () => {
    const sections = buildStatusListSections(
      [task({ id: 'a', deadline: TOMORROW })],
      COLUMNS, TODAY, () => 'Завтра-з-i18n',
    );
    expect(sections[0].label).toBe('Завтра-з-i18n');
  });

  it('ключ денної секції не стикається з id кастомної колонки', () => {
    // Користувач може назвати колонку як завгодно, зокрема датою; без
    // префікса день і колонка злилися б в одну секцію.
    const columns = mergeTaskStatusColumns([
      { id: '2026-09-04', name: 'Дивна колонка', color: '#EC4899', position: 5, isDone: false },
    ]);
    const sections = buildStatusListSections(
      [
        task({ id: 'inColumn', kanbanColumnId: '2026-09-04' }),
        task({ id: 'onDay', deadline: TOMORROW }),
      ],
      columns, TODAY, label,
    );
    expect(sections.map(section => section.key)).toEqual(['2026-09-04', 'day:2026-09-04']);
    expect(sections[0].tasks.map(t => t.id)).toEqual(['inColumn']);
    expect(sections[1].tasks.map(t => t.id)).toEqual(['onDay']);
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
      COLUMNS, TODAY, label,
    );
    expect(sections[0].tasks.map(t => t.id)).toEqual(['high', 'low', 'medium']);
  });

  it('колір секції приходить із колонки, у денної його немає', () => {
    const sections = buildStatusListSections(
      [task({ id: 'today', deadline: TODAY_ISO }), task({ id: 'future', deadline: TOMORROW })],
      COLUMNS, TODAY, label,
    );
    expect(sections[0].color).toBe(COLUMNS.find(c => c.id === ACTIVE_COLUMN_ID)?.color);
    expect(sections[1].color).toBeUndefined();
  });
});

describe('зіпсована дата', () => {
  it('неспарсовний дедлайн лишає завдання в статусах, а не творить секцію «Invalid Date»', () => {
    // Усі порівняння з Invalid Date дають false, тож без окремої перевірки
    // завдання падало в денний бакет із ключем «day:NaN-NaN-NaN», а той через
    // лексикографічне сортування ставав ОСТАННЬОЮ секцією списку.
    const broken = task({ id: 'broken', deadline: 'не-дата' });
    expect(belongsInStatusGroups(broken, COLUMNS, TODAY)).toBe(true);

    const sections = buildStatusListSections([broken], COLUMNS, TODAY, label);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe(ACTIVE_COLUMN_ID);
  });
});

describe('узгодженість з екраном «Сьогодні»', () => {
  // Страховка від мовчазного розходження двох правил: усе, що екран дня
  // вважає сьогоднішнім, мусить лишитись у статусних групах списку.
  const cases: { name: string; columns?: TaskStatusColumn[]; task: Task }[] = [
    { name: 'дедлайн сьогодні', task: task({ id: 'a', deadline: TODAY_ISO }) },
    { name: 'прострочене', task: task({ id: 'b', deadline: YESTERDAY }) },
    { name: 'у процесі з майбутнім дедлайном', task: task({ id: 'c', deadline: NEXT_MONTH, kanbanColumnId: IN_PROGRESS_COLUMN_ID }) },
    { name: 'на перевірці з майбутнім дедлайном', task: task({ id: 'd', deadline: NEXT_WEEK, kanbanColumnId: REVIEW_COLUMN_ID }) },
    { name: 'завершене сьогодні', task: task({ id: 'e', status: 'done', deadline: NEXT_WEEK, history: [{ id: 'h', at: TODAY_ISO, type: 'done' }] }) },
  ];

  it.each(cases)('$name: те, що бере екран дня, лишається в статусах', ({ task: t, columns }) => {
    const cols = columns ?? COLUMNS;
    const today = groupTodayTasks([t], cols, TODAY, 99);
    expect(today.groups.length).toBeGreaterThan(0);
    expect(belongsInStatusGroups(t, cols, TODAY)).toBe(true);
  });
});
