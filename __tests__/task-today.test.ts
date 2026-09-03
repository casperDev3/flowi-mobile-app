/**
 * __tests__/task-today.test.ts — єдине правило «чи це робота на сьогодні».
 *
 * Раніше правило існувало двома копіями (екран дня і список завдань), і копії
 * розходились: список вважав сьогоднішнім УСЕ без дедлайну і все завершене за
 * вікном у два дні. Через це вкладка завдань за замовчуванням показувала весь
 * беклог. Тести нижче фіксують саме межі — і окремо перевіряють, що екран дня
 * питає те саме правило, а не власну копію.
 */

import {
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  mergeTaskStatusColumns,
} from '../utils/taskStatuses';
import { isTodayTask } from '../utils/taskToday';
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

beforeAll(() => {
  // isOverdue звіряється з реальним «зараз», а не з переданим `today`, тож без
  // фіксованого годинника «майбутнє» в тестах поступово ставало б простроченим.
  jest.useFakeTimers();
  jest.setSystemTime(TODAY);
});

afterAll(() => {
  jest.useRealTimers();
});

describe('isTodayTask', () => {
  it('дедлайн сьогодні — це сьогодні', () => {
    expect(isTodayTask(task({ id: 'a', deadline: TODAY_ISO }), COLUMNS, TODAY)).toBe(true);
  });

  it('прострочене — це сьогодні, а не вчорашній день', () => {
    expect(isTodayTask(task({ id: 'a', deadline: YESTERDAY }), COLUMNS, TODAY)).toBe(true);
  });

  it('дедлайн завтра — не сьогодні', () => {
    expect(isTodayTask(task({ id: 'a', deadline: TOMORROW }), COLUMNS, TODAY)).toBe(false);
  });

  it('завдання без дедлайну — НЕ сьогодні', () => {
    // Головна зміна правила. Беклог — це не денна робота; доти він сидів у
    // статусних групах і робив вкладку завдань списком геть усього.
    expect(isTodayTask(task({ id: 'a' }), COLUMNS, TODAY)).toBe(false);
  });

  it('«У процесі» з майбутнім дедлайном — сьогодні', () => {
    const t = task({ id: 'a', deadline: NEXT_WEEK, kanbanColumnId: IN_PROGRESS_COLUMN_ID });
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(true);
  });

  it('«На перевірці» з майбутнім дедлайном — теж сьогодні', () => {
    // Окремий тест навмисно: саме пропуск цієї колонки й був тим мовчазним
    // розходженням двох копій правила.
    const t = task({ id: 'a', deadline: NEXT_WEEK, kanbanColumnId: REVIEW_COLUMN_ID });
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(true);
  });

  it('майбутнє в кастомній не-done колонці — не сьогодні', () => {
    // Виняток стосується лише двох системних колонок роботи, а не будь-якої
    // колонки, яку користувач створив сам.
    const columns = mergeTaskStatusColumns([
      { id: 'custom', name: 'Обговорення', color: '#EC4899', position: 5, isDone: false },
    ]);
    const t = task({ id: 'a', deadline: TOMORROW, kanbanColumnId: 'custom' });
    expect(isTodayTask(t, columns, TODAY)).toBe(false);
  });

  it('завершене сьогодні — сьогодні', () => {
    const t = task({
      id: 'a', status: 'done', deadline: NEXT_WEEK,
      history: [{ id: 'h', at: TODAY_ISO, type: 'done' }],
    });
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(true);
  });

  it('завершене вчора — НЕ сьогодні', () => {
    // Вікно DONE_VISIBLE_DAYS охоплює ще й учора, і в погляді «весь список»
    // це доречно. У денному — ні: вчорашня закрита справа висить серед
    // сьогоднішніх і виглядає як незавершена робота.
    const t = task({
      id: 'a', status: 'done',
      history: [{ id: 'h', at: YESTERDAY, type: 'done' }],
    });
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(false);
  });

  it('завершене без жодної дати завершення — не сьогодні', () => {
    // completedAt віддає null, і вигадувати такій задачі «сьогодні» означало б
    // прибити її до денного екрана назавжди.
    const t = task({ id: 'a', status: 'done' });
    delete (t as Partial<Task>).updatedAt;
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(false);
  });

  it('зіпсована дата не вважається сьогоднішньою', () => {
    expect(isTodayTask(task({ id: 'a', deadline: 'не-дата' }), COLUMNS, TODAY)).toBe(false);
  });
});

describe('узгодженість з екраном «Сьогодні»', () => {
  // Страховка від мовчазного розходження: екран дня і список завдань мусять
  // однаково відповідати на питання «чи це робота на сьогодні».
  const cases: { name: string; task: Task }[] = [
    { name: 'дедлайн сьогодні', task: task({ id: 'a', deadline: TODAY_ISO }) },
    { name: 'прострочене', task: task({ id: 'b', deadline: YESTERDAY }) },
    { name: 'у процесі з майбутнім дедлайном', task: task({ id: 'c', deadline: NEXT_MONTH, kanbanColumnId: IN_PROGRESS_COLUMN_ID }) },
    { name: 'на перевірці з майбутнім дедлайном', task: task({ id: 'd', deadline: NEXT_WEEK, kanbanColumnId: REVIEW_COLUMN_ID }) },
    { name: 'завершене сьогодні', task: task({ id: 'e', status: 'done', deadline: NEXT_WEEK, history: [{ id: 'h', at: TODAY_ISO, type: 'done' }] }) },
  ];

  it.each(cases)('$name: екран дня бере рівно те саме', ({ task: t }) => {
    const today = groupTodayTasks([t], COLUMNS, TODAY, 99);
    expect(today.groups.length).toBeGreaterThan(0);
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(true);
  });

  const excluded: { name: string; task: Task }[] = [
    { name: 'беклог без дедлайну', task: task({ id: 'x' }) },
    { name: 'дедлайн завтра', task: task({ id: 'y', deadline: TOMORROW }) },
  ];

  it.each(excluded)('$name: екран дня не бере — і правило теж', ({ task: t }) => {
    const today = groupTodayTasks([t], COLUMNS, TODAY, 99);
    expect(today.total).toBe(0);
    expect(isTodayTask(t, COLUMNS, TODAY)).toBe(false);
  });
});
