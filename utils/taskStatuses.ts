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
/**
 * Куди завдання потрапляє після зупинки таймера: робота скінчилась, але
 * результат ще не приймали. Колонка системна, бо в цей стан завдання переводить
 * автоматика, а не людина, — і вона мусить існувати в кожного, хто натисне
 * «Стоп», а не лише в того, хто здогадався створити її руками.
 */
export const REVIEW_COLUMN_ID = 'status-review';
export const DONE_COLUMN_ID = 'status-done';

export const DEFAULT_TASK_STATUS_COLUMNS: readonly TaskStatusColumn[] = [
  { id: ACTIVE_COLUMN_ID, name: 'До роботи', color: '#6366F1', position: 0, isDone: false, system: true },
  { id: IN_PROGRESS_COLUMN_ID, name: 'У процесі', color: '#F59E0B', position: 1, isDone: false, system: true },
  { id: REVIEW_COLUMN_ID, name: 'На перевірці', color: '#0EA5E9', position: 2, isDone: false, system: true },
  { id: DONE_COLUMN_ID, name: 'Готово', color: '#10B981', position: 3, isDone: true, system: true },
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
  return [...merged.values()].sort(
    (left, right) =>
      left.position - right.position ||
      // При однаковій позиції вирішує ПОРЯДОК РОБОЧОГО ПОТОКУ, а не алфавіт.
      // Це не дрібниця: у користувача, який колись переставив колонки, збережене
      // «Готово» лишилось на позиції 2 — тій самій, що дістала нова системна
      // «На перевірці». За алфавітом 'status-done' < 'status-review', і завдання
      // приймали б уже після того, як воно оголошене завершеним.
      defaultOrder(left.id) - defaultOrder(right.id) ||
      left.id.localeCompare(right.id),
  );
}

/** Місце колонки в типовому потоці. Кастомні йдуть після системних. */
function defaultOrder(id: string): number {
  const index = DEFAULT_TASK_STATUS_COLUMNS.findIndex(column => column.id === id);
  return index < 0 ? DEFAULT_TASK_STATUS_COLUMNS.length : index;
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

/**
 * Порядок колонок для СПИСКІВ (екран дня, список завдань), а не для дошки.
 *
 * На дошці «У процесі» стоїть другою — після «До роботи», бо там важить шлях
 * зліва направо. У списку важить інше: спершу те, що робиться просто зараз.
 *
 * Правило живе тут, а не в кожному екрані окремо, з конкретної причини: копія
 * умови відбору завдань на «Сьогодні» вже одного разу мовчки розійшлася з
 * оригіналом, і група приходила заповненою, а рендерилась порожньою.
 */
export function orderColumnsForList(columns: TaskStatusColumn[]): TaskStatusColumn[] {
  return [...columns].sort((left, right) => {
    if (left.id === right.id) return 0;
    if (left.id === IN_PROGRESS_COLUMN_ID) return -1;
    if (right.id === IN_PROGRESS_COLUMN_ID) return 1;
    return left.position - right.position;
  });
}
