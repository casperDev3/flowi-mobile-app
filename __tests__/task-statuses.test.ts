import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  applyColumnDoneChangeToTasks,
  mergeTaskStatusColumns,
  orderColumnsForList,
  subtaskToggleTransition,
  taskColumnId,
  taskStatusColumn,
  taskVisibleInList,
} from '../utils/taskStatuses';
import type { Task } from '../utils/taskUtils';

describe('task statuses', () => {
  it('merges synced custom statuses with the default workflow', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'review', name: 'На перевірці', color: '#EC4899', position: 1, isDone: false },
    ]);

    // Чотири системні + одна кастомна. «На перевірці» стала системною разом
    // із переходом «стоп таймера → перевірка», тож власна колонка з такою ж
    // назвою більше не єдина — вона просто лишається поруч.
    expect(columns).toHaveLength(5);
    expect(columns.map(column => column.id)).toEqual(expect.arrayContaining([
      ACTIVE_COLUMN_ID,
      IN_PROGRESS_COLUMN_ID,
      REVIEW_COLUMN_ID,
      DONE_COLUMN_ID,
      'review',
    ]));
  });

  it('системні колонки йдуть у порядку робочого потоку', () => {
    // Порядок несе сенс: завдання рухається зліва направо, і «На перевірці»
    // мусить стояти МІЖ роботою й готовністю, а не після неї.
    const ids = mergeTaskStatusColumns([]).map(column => column.id);
    expect(ids).toEqual([
      ACTIVE_COLUMN_ID,
      IN_PROGRESS_COLUMN_ID,
      REVIEW_COLUMN_ID,
      DONE_COLUMN_ID,
    ]);
  });

  it('«На перевірці» не опиняється після «Готово» при збігу позицій', () => {
    // Так виглядають дані користувача, який переставляв колонки ДО появи
    // перевірки: його «Готово» збереглося на позиції 2 — тій самій, що дістала
    // нова системна колонка. За алфавітом done стало б попереду review.
    const ids = mergeTaskStatusColumns([
      { id: DONE_COLUMN_ID, name: 'Готово', color: '#10B981', position: 2, isDone: true },
    ]).map(column => column.id);
    expect(ids.indexOf(REVIEW_COLUMN_ID)).toBeLessThan(ids.indexOf(DONE_COLUMN_ID));
  });

  it('у списках «У процесі» стоїть попереду решти', () => {
    // На дошці вона друга, у списку — перша: там важить шлях зліва направо,
    // тут — що робиться просто зараз. Правило спільне для екрана дня й списку
    // завдань саме тому, що копія цієї умови вже одного разу розійшлася.
    const ids = orderColumnsForList(mergeTaskStatusColumns([])).map(c => c.id);
    expect(ids[0]).toBe(IN_PROGRESS_COLUMN_ID);
    expect(ids.slice(1)).toEqual([ACTIVE_COLUMN_ID, REVIEW_COLUMN_ID, DONE_COLUMN_ID]);
  });

  it('порядок списку не мутує вхідний масив', () => {
    const columns = mergeTaskStatusColumns([]);
    const before = columns.map(c => c.id);
    orderColumnsForList(columns);
    expect(columns.map(c => c.id)).toEqual(before);
  });

  it('перевірка не рахується завершенням', () => {
    // isDone керує архівом і фільтрами: помилка тут ховала б завдання, яке
    // насправді ще чекає на приймання.
    const review = mergeTaskStatusColumns([]).find(c => c.id === REVIEW_COLUMN_ID);
    expect(review?.isDone).toBe(false);
  });

  it('resolves custom columns while keeping done state consistent', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'review', name: 'На перевірці', color: '#EC4899', position: 3, isDone: false },
    ]);
    const activeTask = { status: 'active' as const, kanbanColumnId: 'review' };
    const completedTask = { status: 'done' as const, kanbanColumnId: 'review' };

    expect(taskColumnId(activeTask, columns)).toBe('review');
    expect(taskColumnId(completedTask, columns)).toBe(DONE_COLUMN_ID);
    expect(taskStatusColumn(activeTask, columns).name).toBe('На перевірці');
  });
});

describe('subtaskToggleTransition', () => {
  const subs = (...done: boolean[]) => done.map((d, i) => ({ id: String(i), title: String(i), done: d }));

  it('відмітка НЕ останньої підзадачі не чіпає ані статус, ані колонку', () => {
    // Через це завдання й «падало» з «У процесі» в «До роботи»: одна закрита
    // підзадача з шести переписувала колонку, хоча робота тривала далі.
    const task = { status: 'active' as const, kanbanColumnId: IN_PROGRESS_COLUMN_ID };
    expect(subtaskToggleTransition(task, subs(true, false, false))).toBeNull();
  });

  it('зняття відмітки теж нікуди не веде', () => {
    const task = { status: 'active' as const, kanbanColumnId: REVIEW_COLUMN_ID };
    expect(subtaskToggleTransition(task, subs(true, false))).toBeNull();
  });

  it('остання закрита підзадача веде «На перевірку», а не в «Готово»', () => {
    // Підзадачі скінчились, але результат ще не приймали — завдання чекає
    // на приймання, а не оголошується завершеним.
    const task = { status: 'active' as const, kanbanColumnId: IN_PROGRESS_COLUMN_ID };
    expect(subtaskToggleTransition(task, subs(true, true, true))).toEqual({
      status: 'active',
      kanbanColumnId: REVIEW_COLUMN_ID,
    });
  });

  it('статус лишається active — «На перевірці» це не завершення', () => {
    // isDone колонки перевірки = false; 'done' тут завершив би завдання
    // за спиною користувача й сховав його з активних фільтрів.
    const out = subtaskToggleTransition({ status: 'active', kanbanColumnId: ACTIVE_COLUMN_ID }, subs(true));
    expect(out?.status).toBe('active');
    expect(mergeTaskStatusColumns([]).find(c => c.id === out?.kanbanColumnId)?.isDone).toBe(false);
  });

  it('веде на перевірку з будь-якої колонки, не лише з «У процесі»', () => {
    const custom = { status: 'active' as const, kanbanColumnId: 'blocked' };
    expect(subtaskToggleTransition(custom, subs(true, true))?.kanbanColumnId).toBe(REVIEW_COLUMN_ID);
  });

  it('завершене завдання відмітка підзадачі не воскрешає', () => {
    const task = { status: 'done' as const, kanbanColumnId: DONE_COLUMN_ID };
    expect(subtaskToggleTransition(task, subs(true, true))).toBeNull();
    expect(subtaskToggleTransition(task, subs(true, false))).toBeNull();
  });

  it('завдання без підзавдань нікуди не рухається', () => {
    // every() на порожньому масиві дає true — без окремої перевірки видалення
    // останньої підзадачі відправляло б завдання на перевірку саме собою.
    expect(subtaskToggleTransition({ status: 'active' }, [])).toBeNull();
  });
});

describe('taskVisibleInList', () => {
  const NOW = new Date(2026, 7, 30, 12, 0);
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => {
    const d = new Date(NOW);
    d.setDate(d.getDate() - n);
    return d;
  };

  const base = {
    id: 't', title: 'Завдання', priority: 'medium' as const,
    subtasks: [], createdAt: iso(daysAgo(30)),
  };
  const active = { ...base, status: 'active' as const };
  /** Завершене СЬОГОДНІ — свіже за будь-якого вікна. */
  const done = {
    ...base, status: 'done' as const,
    history: [{ id: 'h', at: iso(NOW), type: 'done' as const }],
  };
  const doneDaysAgo = (n: number) => ({
    ...base, status: 'done' as const,
    history: [{ id: 'h', at: iso(daysAgo(n)), type: 'done' as const }],
  });

  it('у групуванні за статусом завершені лишаються при базовому фільтрі', () => {
    // Саме тут ховалась причина, чому група «Готово» не з’являлась ніколи:
    // filter='active' викидав завершені ще до групування.
    expect(taskVisibleInList(done, 'active', 'status', NOW)).toBe(true);
    expect(taskVisibleInList(active, 'active', 'status', NOW)).toBe(true);
  });

  it('свіже завершене видно при БУДЬ-ЯКОМУ сортуванні — як includeRecentlyDone у вебі', () => {
    // Раніше завершені лишались лише в групуванні за статусом, і лічильник
    // «Усі» на мобільному був менший, ніж у вебі на тих самих даних.
    expect(taskVisibleInList(done, 'active', 'deadline', NOW)).toBe(true);
    expect(taskVisibleInList(done, 'active', 'newest', NOW)).toBe(true);
    expect(taskVisibleInList(done, 'active', 'priority', NOW)).toBe(true);
    // Вирішує вікно свіжості: старіше за нього — лише в Архіві.
    expect(taskVisibleInList(doneDaysAgo(5), 'active', 'deadline', NOW)).toBe(false);
  });

  it('фільтр «Готово» показує лише завершені навіть у статусному режимі', () => {
    expect(taskVisibleInList(done, 'done', 'status', NOW)).toBe(true);
    expect(taskVisibleInList(active, 'done', 'status', NOW)).toBe(false);
  });

  it('фільтр «Усі» пропускає все', () => {
    expect(taskVisibleInList(done, 'all', 'deadline', NOW)).toBe(true);
    expect(taskVisibleInList(active, 'all', 'deadline', NOW)).toBe(true);
  });

  it('завершене старіше за вікно зі списку зникає', () => {
    // Список завдань — про роботу, а не про історію. Старіше живе в Архіві.
    expect(taskVisibleInList(doneDaysAgo(0), 'active', 'status', NOW)).toBe(true);
    expect(taskVisibleInList(doneDaysAgo(1), 'active', 'status', NOW)).toBe(true);
    expect(taskVisibleInList(doneDaysAgo(2), 'active', 'status', NOW)).toBe(false);
    expect(taskVisibleInList(doneDaysAgo(9), 'all', 'deadline', NOW)).toBe(false);
  });

  it('вікно рахується в календарних добах, а не в годинах', () => {
    // Закрите вчора о 23:50 мусить бути видно вранці, а не зникати через
    // дванадцять годин.
    const lateYesterday = new Date(2026, 7, 29, 23, 50);
    const task = {
      ...base, status: 'done' as const,
      history: [{ id: 'h', at: lateYesterday.toISOString(), type: 'done' as const }],
    };
    expect(taskVisibleInList(task, 'active', 'status', new Date(2026, 7, 30, 8, 0))).toBe(true);
  });

  it('завершене без жодної дати вважається старим', () => {
    // Вигадати йому «сьогодні» означало б назавжди прибити його до верху.
    expect(taskVisibleInList({ ...base, status: 'done' as const }, 'all', 'deadline', NOW)).toBe(false);
  });

  it('кастомна колонка не пролізає нижче «Готово»', () => {
    // Позиція на дошці в користувача може бути будь-яка, але в списку
    // завершене — підсумок, і нижче нього нічого не буває.
    const ids = orderColumnsForList(mergeTaskStatusColumns([
      { id: 'blocked', name: 'Заблоковано', color: '#EF4444', position: 9, isDone: false },
    ])).map(c => c.id);
    expect(ids[ids.length - 1]).toBe(DONE_COLUMN_ID);
  });

  it('«Готово» стоїть останньою групою після «На перевірці»', () => {
    // Порядок груп у списку задає orderColumnsForList — перевіряємо саме те,
    // що бачить користувач: перевірка передує готовому.
    const ids = orderColumnsForList(mergeTaskStatusColumns([])).map(c => c.id);
    expect(ids[ids.length - 1]).toBe(DONE_COLUMN_ID);
    expect(ids.indexOf(REVIEW_COLUMN_ID)).toBeLessThan(ids.indexOf(DONE_COLUMN_ID));
  });
});

describe('applyColumnDoneChangeToTasks (мінор з ревʼю: cycleType у app/project/[id]/settings.tsx)', () => {
  const task = (over: Partial<Task> & { id: string }): Task => ({
    title: over.id, status: 'active', subtasks: [], createdAt: new Date().toISOString(), ...over,
  });

  it('переносить у "done" лише задачі цієї колонки, лишаючи решту без змін', () => {
    const tasks = [
      task({ id: 't1', kanbanColumnId: 'col-a', status: 'active' }),
      task({ id: 't2', kanbanColumnId: 'col-b', status: 'active' }),
      task({ id: 't3', status: 'active' }), // без kanbanColumnId — теж не чіпаємо
    ];
    const { tasks: next, becameDoneIds } = applyColumnDoneChangeToTasks(tasks, 'col-a', true);
    expect(next.find(t => t.id === 't1')?.status).toBe('done');
    expect(next.find(t => t.id === 't2')?.status).toBe('active');
    expect(next.find(t => t.id === 't3')?.status).toBe('active');
    expect(becameDoneIds).toEqual(['t1']);
  });

  it('повертає колонку в "active", коли тип змінили назад із "done"', () => {
    const tasks = [task({ id: 't1', kanbanColumnId: 'col-a', status: 'done' })];
    const { tasks: next, becameDoneIds } = applyColumnDoneChangeToTasks(tasks, 'col-a', false);
    expect(next[0].status).toBe('active');
    expect(becameDoneIds).toEqual([]); // це не перехід У "done" — таймер зупиняти нема сенсу
  });

  it('задача, вже позначена "done" раніше, не потрапляє в becameDoneIds повторно', () => {
    const tasks = [task({ id: 't1', kanbanColumnId: 'col-a', status: 'done' })];
    const { becameDoneIds } = applyColumnDoneChangeToTasks(tasks, 'col-a', true);
    expect(becameDoneIds).toEqual([]);
  });

  it('не створює нових обʼєктів для задач, яких не торкнулось (референційна стабільність)', () => {
    const untouched = task({ id: 't2', kanbanColumnId: 'col-b', status: 'active' });
    const { tasks: next } = applyColumnDoneChangeToTasks([untouched], 'col-a', true);
    expect(next[0]).toBe(untouched);
  });
});
