import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  mergeTaskStatusColumns,
  taskColumnId,
  taskStatusColumn,
} from '../utils/taskStatuses';

describe('task statuses', () => {
  it('merges synced custom statuses with the default workflow', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'review', name: 'На перевірці', color: '#EC4899', position: 1, isDone: false },
    ]);

    expect(columns).toHaveLength(4);
    expect(columns.map(column => column.id)).toEqual(expect.arrayContaining([
      ACTIVE_COLUMN_ID,
      IN_PROGRESS_COLUMN_ID,
      DONE_COLUMN_ID,
      'review',
    ]));
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
