import type { Task } from './taskUtils';

export interface TaskStatusColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  isDone: boolean;
  system?: boolean;
  updatedAt?: string;
}

export const ACTIVE_COLUMN_ID = 'status-active';
export const IN_PROGRESS_COLUMN_ID = 'status-in-progress';
export const DONE_COLUMN_ID = 'status-done';

export const DEFAULT_TASK_STATUS_COLUMNS: readonly TaskStatusColumn[] = [
  { id: ACTIVE_COLUMN_ID, name: 'До роботи', color: '#6366F1', position: 0, isDone: false, system: true },
  { id: IN_PROGRESS_COLUMN_ID, name: 'У процесі', color: '#F59E0B', position: 1, isDone: false, system: true },
  { id: DONE_COLUMN_ID, name: 'Готово', color: '#10B981', position: 2, isDone: true, system: true },
];

export function mergeTaskStatusColumns(saved: TaskStatusColumn[]): TaskStatusColumn[] {
  const merged = new Map(DEFAULT_TASK_STATUS_COLUMNS.map(column => [column.id, { ...column }]));
  for (const column of saved) {
    if (!column?.id || !column.name?.trim()) continue;
    const base = merged.get(column.id);
    merged.set(column.id, {
      ...(base ?? column),
      ...column,
      name: column.name.trim(),
      color: column.color || base?.color || '#7C3AED',
      position: Number.isFinite(column.position) ? column.position : (base?.position ?? merged.size),
      isDone: Boolean(column.isDone),
      system: Boolean(base),
    });
  }
  return [...merged.values()].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}

export function taskColumnId(task: Pick<Task, 'status' | 'kanbanColumnId'>, columns: TaskStatusColumn[]): string {
  if (task.kanbanColumnId) {
    const selected = columns.find(column => column.id === task.kanbanColumnId);
    if (selected && selected.isDone === (task.status === 'done')) return selected.id;
  }
  return task.status === 'done' ? DONE_COLUMN_ID : ACTIVE_COLUMN_ID;
}

export function taskStatusColumn(task: Pick<Task, 'status' | 'kanbanColumnId'>, columns: TaskStatusColumn[]): TaskStatusColumn {
  const id = taskColumnId(task, columns);
  return columns.find(column => column.id === id) ?? columns[0] ?? DEFAULT_TASK_STATUS_COLUMNS[0];
}
