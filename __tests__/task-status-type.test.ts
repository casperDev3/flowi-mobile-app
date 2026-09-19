/**
 * __tests__/task-status-type.test.ts — тип статусу (todo/in_progress/done) і
 * скоуп по проєкту в mergeTaskStatusColumns (WORKSPACE_PROJECTS_CONTRACT §3.3,
 * §3.7 «Особисте агрегує»).
 */
import {
  ACTIVE_COLUMN_ID,
  DEFAULT_TASK_STATUS_COLUMNS,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  boardColumnForTask,
  deriveStatusType,
  isTaskDoneByType,
  mergeTaskStatusColumns,
  newProjectStatusId,
  projectEquivalentColumn,
  resolvedStatusType,
  scopedColumnFor,
  scopedTaskStatusColumn,
  seedProjectStatusColumns,
  taskStatusType,
  type TaskStatusColumn,
} from '../utils/taskStatuses';
import type { Task } from '../utils/taskUtils';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't-1', title: 'T', status: 'active', subtasks: [], createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('deriveStatusType / resolvedStatusType', () => {
  it('isDone → done', () => {
    expect(deriveStatusType({ id: 'x', isDone: true })).toBe('done');
  });
  it('the in-progress system column → in_progress', () => {
    expect(deriveStatusType({ id: IN_PROGRESS_COLUMN_ID, isDone: false })).toBe('in_progress');
  });
  it('anything else → todo', () => {
    expect(deriveStatusType({ id: ACTIVE_COLUMN_ID, isDone: false })).toBe('todo');
  });
  it('resolvedStatusType prefers an explicit type over derivation', () => {
    expect(resolvedStatusType({ id: 'x', isDone: false, type: 'in_progress' })).toBe('in_progress');
  });
});

describe('mergeTaskStatusColumns — projectId scoping', () => {
  const saved: TaskStatusColumn[] = [
    { id: 'st-a', name: 'Проєктне', color: '#123', position: 0, isDone: false, projectId: 'p-1' },
    { id: 'custom', name: 'Особисте кастомне', color: '#456', position: 5, isDone: false },
  ];

  it('the personal (no scope) merge excludes project-owned columns', () => {
    const ids = mergeTaskStatusColumns(saved).map(c => c.id);
    expect(ids).not.toContain('st-a');
    expect(ids).toContain('custom');
    expect(ids).toContain(ACTIVE_COLUMN_ID);
  });

  it('a project-scoped merge returns only that project’s columns, no personal defaults', () => {
    const columns = mergeTaskStatusColumns(saved, 'p-1');
    expect(columns.map(c => c.id)).toEqual(['st-a']);
    expect(columns[0].type).toBe('todo');
  });

  it('a project scope with no matching columns returns empty, not personal defaults', () => {
    expect(mergeTaskStatusColumns(saved, 'p-does-not-exist')).toEqual([]);
  });

  it('every column in the personal merge carries a resolved type', () => {
    for (const column of mergeTaskStatusColumns(saved)) {
      expect(['todo', 'in_progress', 'done']).toContain(column.type);
    }
  });
});

describe('taskStatusType — aggregation across projects (§3.7)', () => {
  const allColumns: TaskStatusColumn[] = [
    // Особисті дефолти йдуть автоматично через mergeTaskStatusColumns.
    { id: 'st-p1-doing', name: 'В роботі', color: '#1', position: 0, isDone: false, projectId: 'p-1', type: 'in_progress' },
    { id: 'st-p1-done', name: 'Зроблено', color: '#2', position: 1, isDone: true, projectId: 'p-1', type: 'done' },
    { id: 'st-p2-todo', name: 'Черга', color: '#3', position: 0, isDone: false, projectId: 'p-2' },
  ];

  it('resolves a project task against its OWN project’s columns', () => {
    const t = task({ projectId: 'p-1', kanbanColumnId: 'st-p1-doing' });
    expect(taskStatusType(t, allColumns)).toBe('in_progress');
    expect(isTaskDoneByType(t, allColumns)).toBe(false);
  });

  it('a done column in another project does not leak onto this task (unique ids notwithstanding)', () => {
    const t = task({ projectId: 'p-1', kanbanColumnId: 'st-p1-done' });
    expect(taskStatusType(t, allColumns)).toBe('done');
  });

  it('falls back to the personal system columns for a task without projectId', () => {
    const t = task({ kanbanColumnId: IN_PROGRESS_COLUMN_ID });
    expect(taskStatusType(t, allColumns)).toBe('in_progress');
  });

  it('falls back to top-level status when the column is unknown or not yet synced', () => {
    const active = task({ projectId: 'p-1', kanbanColumnId: 'st-missing', status: 'active' });
    const done = task({ projectId: 'p-1', kanbanColumnId: 'st-missing', status: 'done' });
    expect(taskStatusType(active, allColumns)).toBe('todo');
    expect(taskStatusType(done, allColumns)).toBe('done');
  });

  it('a task can never resolve to a column scoped to a DIFFERENT project than its own', () => {
    // st-p2-todo належить p-2; завдання з p-1 його не бачить навіть маючи
    // (гіпотетично) той самий kanbanColumnId — доказ через мутацію projectId.
    const crossed = task({ projectId: 'p-1', kanbanColumnId: 'st-p2-todo' });
    expect(taskStatusType(crossed, allColumns)).toBe('todo'); // fallback на status
  });
});

describe('newProjectStatusId / seedProjectStatusColumns (contract §3.3: копії статусів для нового проєкту)', () => {
  it('id статусу проєкту має вигляд st-<...>, а не status-* (легасі-особистий формат)', () => {
    const id = newProjectStatusId();
    expect(id.startsWith('st-')).toBe(true);
    expect(id.startsWith('status-')).toBe(false);
  });

  it('id завжди різні на послідовних викликах', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newProjectStatusId()));
    expect(ids.size).toBe(20);
  });

  it('копіює зведений особистий список 1-в-1 (назва/колір/позиція/isDone) з новими id і projectId', () => {
    const personal = mergeTaskStatusColumns([]); // типові чотири колонки
    const seeded = seedProjectStatusColumns(personal, 'p-1');
    expect(seeded).toHaveLength(personal.length);
    seeded.forEach((column, i) => {
      expect(column.projectId).toBe('p-1');
      expect(column.id).not.toBe(personal[i].id);
      expect(column.id.startsWith('st-')).toBe(true);
      expect(column.name).toBe(personal[i].name);
      expect(column.color).toBe(personal[i].color);
      expect(column.position).toBe(personal[i].position);
      expect(column.isDone).toBe(personal[i].isDone);
    });
  });

  it('type — похідний (isDone→done, IN_PROGRESS→in_progress, інше→todo), навіть якщо джерело його не мало', () => {
    const seeded = seedProjectStatusColumns(DEFAULT_TASK_STATUS_COLUMNS, 'p-1');
    const byName = (name: string) => seeded.find(c => c.name === name);
    expect(byName('До роботи')?.type).toBe('todo');
    expect(byName('У процесі')?.type).toBe('in_progress');
    expect(byName('Готово')?.type).toBe('done');
  });

  it('копії проєкту — окремі записи: mergeTaskStatusColumns(saved, projectId) бачить лише їх, не особисті', () => {
    const personal = mergeTaskStatusColumns([]);
    const seeded = seedProjectStatusColumns(personal, 'p-1');
    const scoped = mergeTaskStatusColumns(seeded, 'p-1');
    expect(scoped).toHaveLength(personal.length);
    expect(scoped.every(c => c.projectId === 'p-1')).toBe(true);
    // Особистий (без projectId) список цих копій не бачить.
    expect(mergeTaskStatusColumns(seeded).map(c => c.id)).toEqual(DEFAULT_TASK_STATUS_COLUMNS.map(c => c.id));
  });

  it('кожна копія несе sourceStatusId на особистий оригінал (contract §3.3)', () => {
    const personal = mergeTaskStatusColumns([]);
    const seeded = seedProjectStatusColumns(personal, 'p-1');
    seeded.forEach((column, i) => expect(column.sourceStatusId).toBe(personal[i].id));
  });
});

describe('scopedColumnFor — колонка за БАЖАНИМ типом (чекбокс/тумблер)', () => {
  const seeded = seedProjectStatusColumns(mergeTaskStatusColumns([]), 'p-1');

  it('особисте (без projectId): done → системна DONE, todo → системна ACTIVE', () => {
    expect(scopedColumnFor([], undefined, 'done')?.id).toBe(DONE_COLUMN_ID);
    expect(scopedColumnFor([], undefined, 'todo')?.id).toBe(ACTIVE_COLUMN_ID);
  });

  it('проєкт: та сама логіка, але серед ЙОГО копій', () => {
    const done = scopedColumnFor(seeded, 'p-1', 'done');
    const todo = scopedColumnFor(seeded, 'p-1', 'todo');
    expect(done?.projectId).toBe('p-1');
    expect(done?.isDone).toBe(true);
    expect(todo?.projectId).toBe('p-1');
    expect(todo?.isDone).toBe(false);
  });

  it('легасі-проєкт без власних колонок — undefined, а не чужа підміна', () => {
    expect(scopedColumnFor(seeded, 'p-does-not-exist', 'done')).toBeUndefined();
  });
});

describe('projectEquivalentColumn — обраний статус → еквівалент у проєкті', () => {
  const personal = mergeTaskStatusColumns([]);
  const seeded = seedProjectStatusColumns(personal, 'p-1');
  const allColumns = [...personal, ...seeded];

  it('без projectId повертає обране як є', () => {
    const chosen = personal.find(c => c.id === ACTIVE_COLUMN_ID);
    expect(projectEquivalentColumn(chosen, allColumns, undefined)).toBe(chosen);
  });

  it('з projectId мапить через sourceStatusId на копію проєкту', () => {
    const chosenDone = personal.find(c => c.id === DONE_COLUMN_ID);
    const equivalent = projectEquivalentColumn(chosenDone, allColumns, 'p-1');
    expect(equivalent?.projectId).toBe('p-1');
    expect(equivalent?.isDone).toBe(true);
    expect(equivalent?.sourceStatusId).toBe(DONE_COLUMN_ID);
  });

  it('легасі-проєкт без власних колонок лишає обране як є', () => {
    const chosen = personal.find(c => c.id === ACTIVE_COLUMN_ID);
    expect(projectEquivalentColumn(chosen, allColumns, 'p-legacy')).toBe(chosen);
  });
});

describe('boardColumnForTask / scopedTaskStatusColumn — дошка не губить задачу', () => {
  const seeded = seedProjectStatusColumns(mergeTaskStatusColumns([]), 'p-1');
  const doneCol = seeded.find(c => c.isDone)!;
  const todoCol = seeded.find(c => !c.isDone)!;

  it('kanbanColumnId, що не існує серед boardColumns — падає на isDone-відповідну колонку, а не завжди першу', () => {
    const done = boardColumnForTask({ status: 'done', kanbanColumnId: 'st-deleted' }, seeded);
    expect(done?.id).toBe(doneCol.id);
    const active = boardColumnForTask({ status: 'active', kanbanColumnId: 'st-deleted' }, seeded);
    expect(active?.id).toBe(todoCol.id);
  });

  it('kanbanColumnId, що існує — повертається як є', () => {
    expect(boardColumnForTask({ status: 'active', kanbanColumnId: todoCol.id }, seeded)?.id).toBe(todoCol.id);
  });

  it('scopedTaskStatusColumn звужує до ВЛАСНОГО проєкту завдання серед усіх потоків разом', () => {
    const allColumns = [...mergeTaskStatusColumns([]), ...seeded];
    const column = scopedTaskStatusColumn({ status: 'active', kanbanColumnId: todoCol.id, projectId: 'p-1' }, allColumns);
    expect(column.id).toBe(todoCol.id);
  });
});
