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
import { isMyTask, type Task } from '../utils/taskUtils';

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

describe('§3.7 «Особисте агрегує» — задача проєкту зі своєю колонкою «У процесі»', () => {
  // allColumns — ВЕСЬ task_statuses (усі потоки), не звужений до особистого:
  // саме це раніше губило проєктні задачі (review finding «Today ... resolves
  // columns with mergeTaskStatusColumns(personal)»).
  const allColumns = [
    ...COLUMNS,
    { id: 'st-p1-doing', name: 'В роботі', color: '#111', position: 0, isDone: false, projectId: 'p-1', type: 'in_progress' as const },
    { id: 'st-p1-done', name: 'Зроблено', color: '#222', position: 1, isDone: true, projectId: 'p-1', type: 'done' as const },
  ];

  it('задача проєкту у власній in_progress-колонці — «сьогодні», навіть без дедлайну', () => {
    const t = task({ id: 'proj-doing', projectId: 'p-1', kanbanColumnId: 'st-p1-doing' });
    expect(isTodayTask(t, allColumns, TODAY)).toBe(true);
  });

  it('та сама задача групується окремою секцією («В роботі»), а не «До роботи»', () => {
    const t = task({ id: 'proj-doing', projectId: 'p-1', kanbanColumnId: 'st-p1-doing' });
    const { groups } = groupTodayTasks([t], allColumns, TODAY, 5);
    expect(groups.map(g => g.id)).toEqual(['st-p1-doing']);
    expect(groups[0].name).toBe('В роботі');
  });

  it('колонка іншого проєкту не протікає в задачу без dead/projectId, що збігся id', () => {
    // Задача БЕЗ projectId ніколи не бачить 'st-p1-doing' — інакше довільний
    // збіг id проєктної колонки міг би підмінити особистий статус.
    const t = task({ id: 'personal', kanbanColumnId: 'st-p1-doing' });
    expect(isTodayTask(t, allColumns, TODAY)).toBe(false);
  });
});

describe('isMyTask — §3.7 "моє" (особистий потік / assigneeId / createdBy)', () => {
  it('особистий потік (немає projectId) — завжди моє, байдуже до createdBy/assigneeId', () => {
    expect(isMyTask({ projectId: undefined, assigneeId: null, createdBy: 'someone-else' }, 'me')).toBe(true);
  });

  it('є assigneeId — рахує ТІЛЬКИ його, ігноруючи createdBy', () => {
    expect(isMyTask({ projectId: 'p-1', assigneeId: 'me', createdBy: 'someone-else' }, 'me')).toBe(true);
    expect(isMyTask({ projectId: 'p-1', assigneeId: 'someone-else', createdBy: 'me' }, 'me')).toBe(false);
  });

  it('assigneeId порожній — НЕ моє, навіть якщо я автор (лише призначене мені, запит 2026-09-22)', () => {
    expect(isMyTask({ projectId: 'p-1', assigneeId: null, createdBy: 'me' }, 'me')).toBe(false);
    expect(isMyTask({ projectId: 'p-1', assigneeId: undefined, createdBy: 'someone-else' }, 'me')).toBe(false);
  });

  it('без createdBy (легасі-запис до поля) і без assigneeId — НЕ моє, дослівно за контрактом (регресія з ревʼю)', () => {
    // review finding (minor): раніше `!task.createdBy || ...` рахував будь-яку
    // непризначену задачу без createdBy "моєю" для КОЖНОГО учасника команди —
    // легасі/мігровані задачі з'являлись би в «Сьогодні» всіх одночасно.
    // Контракт §3.7 вимагає дослівну рівність `createdBy == me`, без фолбеку.
    expect(isMyTask({ projectId: 'p-1', assigneeId: null, createdBy: undefined }, 'me')).toBe(false);
    expect(isMyTask({ projectId: 'p-1', assigneeId: null, createdBy: undefined }, 'me', { 'p-1': 'member' })).toBe(false);
  });

  it('без виконавця — не моє і власнику приєднаного проєкту; моє лише в НЕприєднаному проєкті (як веб joinedProjectIds)', () => {
    expect(isMyTask({ projectId: 'p-1', assigneeId: null, createdBy: undefined }, 'me', { 'p-1': 'owner' })).toBe(false);
    // Проєкт ще не на сервері (міграція §3.6 не відпрацювала) — запис лежить
    // в особистому потоці, тобто мій.
    expect(isMyTask({ projectId: 'p-9', assigneeId: null, createdBy: undefined }, 'me', { 'p-1': 'owner' })).toBe(true);
    expect(isMyTask({ projectId: 'p-9', assigneeId: 'other', createdBy: undefined }, 'me', { 'p-1': 'owner' })).toBe(false);
  });

  it('myUserId невідомий (ще не завантажено useAuth) — ховає задачі проєкту (без відомого "я" рівність неможлива)', () => {
    expect(isMyTask({ projectId: 'p-1', assigneeId: null, createdBy: 'anyone' }, null)).toBe(false);
  });

  it('groupTodayTasks: без myUserId (undefined) фільтр §3.7 не застосовується — сумісність із викликами без користувача', () => {
    const mine = task({ id: 'mine', projectId: 'p-1', deadline: TODAY_ISO, createdBy: 'me' });
    const other = task({ id: 'other', projectId: 'p-1', deadline: TODAY_ISO, createdBy: 'someone-else' });
    expect(groupTodayTasks([mine, other], COLUMNS, TODAY, 99).total).toBe(2);
  });

  it('groupTodayTasks: із myUserId лишає лише задачі проєкту, призначені мені', () => {
    const mine = task({ id: 'mine', projectId: 'p-1', deadline: TODAY_ISO, createdBy: 'someone-else', assigneeId: 'me' });
    const other = task({ id: 'other', projectId: 'p-1', deadline: TODAY_ISO, createdBy: 'someone-else' });
    const { total, groups } = groupTodayTasks([mine, other], COLUMNS, TODAY, 99, 'me');
    expect(total).toBe(1);
    expect(groups.flatMap(g => g.tasks.map(t => t.id))).toEqual(['mine']);
  });
});

describe('«Готово» на сьогодні — строго за подією done', () => {
  it('виконана без події done, але з сьогоднішнім updatedAt — НЕ сьогоднішня', () => {
    // Перезапис (синк, міграція, правка) зсуває updatedAt — це не завершення.
    const stale = { status: 'done', updatedAt: TODAY_ISO, history: [] } as unknown as Task;
    expect(isTodayTask(stale, COLUMNS, TODAY)).toBe(false);
  });

  it('подія done сьогодні — сьогоднішня; учора — ні', () => {
    const today = { status: 'done', history: [{ id: '1', type: 'done', at: TODAY_ISO }] } as unknown as Task;
    const yesterday = { status: 'done', history: [{ id: '1', type: 'done', at: YESTERDAY }] } as unknown as Task;
    expect(isTodayTask(today, COLUMNS, TODAY)).toBe(true);
    expect(isTodayTask(yesterday, COLUMNS, TODAY)).toBe(false);
  });
});

describe('withCompletionEvent — шар запису гарантує подію done', () => {
  const { withCompletionEvent } = jest.requireActual('../utils/taskUtils');
  const AT = TODAY_ISO;

  it('перехід у done без події — дописує done', () => {
    const next = withCompletionEvent({ status: 'active', history: [] }, { status: 'done', history: [] }, AT);
    expect(next.history.map((e: { type: string }) => e.type)).toEqual(['done']);
    expect(next.history[0].at).toBe(AT);
  });

  it('шлях сам записав done — не дублює', () => {
    const next = withCompletionEvent(
      { status: 'active', history: [] },
      { status: 'done', history: [{ id: 'x', type: 'done', at: AT }] },
      AT,
    );
    expect(next.history).toHaveLength(1);
  });

  it('уже була виконана (правка назви) — нічого не додає', () => {
    const prev = { status: 'done', history: [{ id: 'x', type: 'done', at: YESTERDAY }] };
    expect(withCompletionEvent(prev, { ...prev }, AT).history).toHaveLength(1);
  });
});
