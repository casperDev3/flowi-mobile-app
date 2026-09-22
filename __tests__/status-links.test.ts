/**
 * __tests__/status-links.test.ts — статуси проєкту ↔ особистого простору.
 *
 * 1. Терпиме читання: веб (і старі збірки) писав у задачі проєкту ОСОБИСТІ id
 *    (`status-in-progress`, `status-review`, `status-done`). На телефоні й
 *    планшеті такі задачі показувались як «До роботи», хоча на вебі — «У
 *    процесі». Тепер особистий id зводиться до еквівалента в проєкті.
 * 2. Зв'язок статусів: однакова назва → явний зв'язок; немає — null
 *    (інтерактивний шлях питає людину). Копія — лише запасний показ.
 */
import {
  displayFallbackPersonal,
  normStatusName,
  personalForProjectColumn,
  projectForPersonalColumn,
  withStatusLink,
} from '@/utils/statusLinks';
import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  boardColumnForTask,
  mergeTaskStatusColumns,
  personalDisplayColumn,
  personalEquivalentStrict,
  projectColumnIdFor,
  projectEquivalentColumn,
  projectEquivalentStrict,
  restoredColumnIdForTask,
  seedProjectStatusColumns,
  subtaskToggleTransition,
  taskStatusType,
  type TaskStatusColumn,
} from '@/utils/taskStatuses';

const PID = 'p1';
const SEEDED = seedProjectStatusColumns(mergeTaskStatusColumns([]), PID);
const byName = (name: string) => SEEDED.find(c => c.name === name)!;

describe('терпиме читання особистих id у задачах проєкту (web → mobile)', () => {
  const all: TaskStatusColumn[] = [...SEEDED];
  const scoped = mergeTaskStatusColumns(all, PID);

  test.each([
    [IN_PROGRESS_COLUMN_ID, 'active', 'У процесі', 'in_progress'],
    [REVIEW_COLUMN_ID, 'active', 'На перевірці', 'todo'],
    [DONE_COLUMN_ID, 'done', 'Готово', 'done'],
    [ACTIVE_COLUMN_ID, 'active', 'До роботи', 'todo'],
  ] as const)('%s → колонка проєкту «%s»', (id, status, expectedName, expectedType) => {
    const task = { projectId: PID, status, kanbanColumnId: id } as const;
    expect(boardColumnForTask(task, scoped, all)?.name).toBe(expectedName);
    expect(personalDisplayColumn(task, all).name).toBe(expectedName);
    expect(taskStatusType(task, all)).toBe(expectedType);
  });

  test('у проєкті без копій (кастомні назви) «У процесі» зводиться за типом, а не падає в «До роботи»', () => {
    const custom: TaskStatusColumn[] = [
      { id: 'st-a', name: 'Backlog', color: '#000', position: 0, isDone: false, type: 'todo', projectId: PID },
      { id: 'st-b', name: 'Doing', color: '#000', position: 1, isDone: false, type: 'in_progress', projectId: PID },
      { id: 'st-c', name: 'Shipped', color: '#000', position: 2, isDone: true, type: 'done', projectId: PID },
    ];
    const cols = mergeTaskStatusColumns(custom, PID);
    expect(boardColumnForTask({ status: 'active', kanbanColumnId: IN_PROGRESS_COLUMN_ID }, cols, custom)?.id).toBe('st-b');
    // «На перевірці» без такої колонки — ближче до «у роботі», ніж до беклогу.
    expect(boardColumnForTask({ status: 'active', kanbanColumnId: REVIEW_COLUMN_ID }, cols, custom)?.id).toBe('st-b');
    expect(boardColumnForTask({ status: 'done', kanbanColumnId: DONE_COLUMN_ID }, cols, custom)?.id).toBe('st-c');
    expect(taskStatusType({ projectId: PID, status: 'active', kanbanColumnId: IN_PROGRESS_COLUMN_ID }, custom)).toBe('in_progress');
  });

  test('зведений id не суперечить status: done-задача з особистим «У процесі» не стає активною', () => {
    const task = { projectId: PID, status: 'done' as const, kanbanColumnId: IN_PROGRESS_COLUMN_ID };
    expect(boardColumnForTask(task, scoped, all)?.isDone).toBe(true);
  });

  test('відновлення з архіву переписує особистий id на колонку проєкту', () => {
    const task = { projectId: PID, status: 'done' as const, kanbanColumnId: IN_PROGRESS_COLUMN_ID };
    expect(restoredColumnIdForTask(task, all)).toBe(byName('У процесі').id);
  });

  test('автоматика (підзавдання → «На перевірці») пише колонку проєкту', () => {
    expect(projectColumnIdFor(REVIEW_COLUMN_ID, all, PID)).toBe(byName('На перевірці').id);
    expect(projectColumnIdFor(REVIEW_COLUMN_ID, all, undefined)).toBe(REVIEW_COLUMN_ID);
    const t = subtaskToggleTransition({ status: 'active', kanbanColumnId: byName('У процесі').id, projectId: PID }, [{ done: true }], all);
    expect(t).toEqual({ status: 'active', kanbanColumnId: byName('На перевірці').id });
  });
});

describe('зв’язок статусів: назва → явний зв’язок (копія — лише запасний показ)', () => {
  const personal = mergeTaskStatusColumns([]);
  const projectCols: TaskStatusColumn[] = [
    { id: 'st-1', name: ' у  процесі ', color: '#000', position: 0, isDone: false, type: 'in_progress', projectId: PID },
    { id: 'st-2', name: 'QA', color: '#000', position: 1, isDone: false, type: 'todo', projectId: PID },
    { id: 'st-3', name: 'Done!', color: '#000', position: 2, isDone: true, type: 'done', projectId: PID, sourceStatusId: DONE_COLUMN_ID },
  ];

  test('нормалізація назви', () => {
    expect(normStatusName('  У   Процесі ')).toBe('у процесі');
  });

  test('однакова назва — туди, без питань', () => {
    expect(personalForProjectColumn(projectCols[0], personal)?.id).toBe(IN_PROGRESS_COLUMN_ID);
    expect(projectForPersonalColumn(personal.find(c => c.id === IN_PROGRESS_COLUMN_ID)!, projectCols, PID)?.id).toBe('st-1');
  });

  test('копія (sourceStatusId) з іншою назвою — розбіжність (питати), показ — за копією', () => {
    // Дзеркало вебу (lib/status-links.ts): сильні збіги — лише назва і зв'язок.
    expect(personalForProjectColumn(projectCols[2], personal)).toBeNull();
    expect(displayFallbackPersonal(projectCols[2], personal)?.id).toBe(DONE_COLUMN_ID);
  });

  test('нормалізація назви як на вебі: апостроф і регістр', () => {
    expect(normStatusName('  Обов’язкове   ЗАВДАННЯ ')).toBe("обов'язкове завдання");
  });

  test('зв’язок ексклюзивний: колонка проєкту відповідає рівно одній особистій', () => {
    const active = personal.find(c => c.id === ACTIVE_COLUMN_ID)!;
    const review = personal.find(c => c.id === REVIEW_COLUMN_ID)!;
    const first = withStatusLink<TaskStatusColumn>([...personal], active, PID, 'st-2');
    const second = withStatusLink<TaskStatusColumn>(first, review, PID, 'st-2');
    expect(second.find(c => c.id === ACTIVE_COLUMN_ID)?.projectLinks).toEqual({});
    expect(second.find(c => c.id === REVIEW_COLUMN_ID)?.projectLinks).toEqual({ [PID]: ['st-2'] });
    expect(personalForProjectColumn(projectCols[1], mergeTaskStatusColumns(second))?.id).toBe(REVIEW_COLUMN_ID);
  });

  test('розбіжність — null (питати), а показ падає на тип', () => {
    expect(personalForProjectColumn(projectCols[1], personal)).toBeNull();
    expect(displayFallbackPersonal(projectCols[1], personal)?.id).toBe(ACTIVE_COLUMN_ID);
    const review = personal.find(c => c.id === REVIEW_COLUMN_ID)!;
    expect(projectForPersonalColumn(review, projectCols, PID)).toBeNull();
  });

  test('збережена відповідь працює в обидва боки і переживає mergeTaskStatusColumns', () => {
    const review = personal.find(c => c.id === REVIEW_COLUMN_ID)!;
    const stored = withStatusLink<TaskStatusColumn>([...projectCols], review, PID, 'st-2');
    // Системна колонка, якої не було у сховищі, додається разом зі зв'язком.
    expect(stored.find(c => c.id === REVIEW_COLUMN_ID)?.projectLinks).toEqual({ [PID]: ['st-2'] });
    const merged = mergeTaskStatusColumns(stored);
    expect(personalForProjectColumn(projectCols[1], merged)?.id).toBe(REVIEW_COLUMN_ID);
    expect(projectForPersonalColumn(merged.find(c => c.id === REVIEW_COLUMN_ID)!, projectCols, PID)?.id).toBe('st-2');
    // Повторне збереження того самого — без змін (той самий масив).
    expect(withStatusLink(stored, merged.find(c => c.id === REVIEW_COLUMN_ID)!, PID, 'st-2')).toBe(stored);
  });

  test('strict-обгортки над усім task_statuses', () => {
    const all = [...projectCols];
    const review = personal.find(c => c.id === REVIEW_COLUMN_ID)!;
    expect(projectEquivalentStrict(review, all, PID)).toBeNull();
    expect(projectEquivalentStrict(review, all, undefined)).toBe(review);
    // Нестрога версія (неінтерактивні шляхи) падає на тип.
    expect(projectEquivalentColumn(review, all, PID)?.id).toBe('st-2');
    expect(personalEquivalentStrict(projectCols[1], all)).toBeNull();
    const linked = withStatusLink<TaskStatusColumn>(all, review, PID, 'st-2');
    expect(projectEquivalentStrict(review, linked, PID)?.id).toBe('st-2');
    expect(personalEquivalentStrict(projectCols[1], linked)?.id).toBe(REVIEW_COLUMN_ID);
  });
});
