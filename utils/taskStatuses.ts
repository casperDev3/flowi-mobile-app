import { DONE_VISIBLE_DAYS, completedWithinDays } from './taskUtils';
import type { Filter, SortBy, Status, SubTask, Task } from './taskUtils';

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
    // Завершене — завжди наприкінці, незалежно від позиції на дошці. У списку
    // «Готово» це підсумок дня, а не етап потоку: кастомна колонка, яку
    // користувач поставив після неї, інакше опинялась би нижче зробленого.
    if (left.isDone !== right.isDone) return left.isDone ? 1 : -1;
    return left.position - right.position;
  });
}
/**
 * Куди веде завдання відмітка підзавдання.
 *
 * `null` означає «не чіпати статус завдання взагалі» — і це головна відповідь
 * тут. Раніше кожне перемикання переписувало status і kanbanColumnId, тож одна
 * закрита підзадача з шести викидала завдання з «У процесі» назад у «До
 * роботи»: людина відмічала прогрес, а натомість втрачала стан роботи.
 *
 * Рухає завдання ЛИШЕ закриття останньої підзадачі, і рухає в «На перевірці»,
 * а не в «Готово»: підзадачі скінчились, але результат ще не приймали. Саме
 * тому status лишається 'active' — колонка перевірки має isDone=false, і
 * поставити тут 'done' означало б завершити завдання за спиною користувача.
 *
 * Правило живе в утиліті, бо його копії стоять на двох екранах (список завдань
 * і окремий екран підзавдань) і одного разу вже мовчки розійшлися.
 *
 * @param subtasksAfterToggle підзавдання ПІСЛЯ перемикання, а не до нього.
 */
export function subtaskToggleTransition(
  task: Pick<Task, 'status' | 'kanbanColumnId'>,
  subtasksAfterToggle: readonly Pick<SubTask, 'done'>[],
): { status: Status; kanbanColumnId: string } | null {
  // Завершене завдання галочка в підзавданні не воскрешає: вихід із «Готово» —
  // окреме свідоме рішення, а не побічний ефект відмітки в списку.
  if (task.status === 'done') return null;
  // Зняття відмітки нікуди не веде: незакрита підзадача лишає завдання там,
  // де воно було, включно з колонкою, яку користувач виставив руками.
  if (subtasksAfterToggle.length === 0) return null;
  if (!subtasksAfterToggle.every(sub => sub.done)) return null;
  return { status: 'active', kanbanColumnId: REVIEW_COLUMN_ID };
}

/**
 * Чи лишається завдання в списку при вибраному фільтрі та групуванні.
 *
 * Виняток один і він навмисний: групування за статусом — це погляд на дошку,
 * а не на список активного. Дошка без колонки «Готово» неповна — не видно, що
 * вже зроблено, і немає де зняти помилкову відмітку. Базовий фільтр 'active'
 * ховав завершені завжди, тож група «Готово» не з'являлась ніколи.
 *
 * Для сортувань за датою поділ інший (по днях), і там 'active' лишається
 * дослівним: домішувати туди завершені означало б засмічувати кожен день.
 */
export function taskVisibleInList(
  task: Task,
  filter: Filter,
  sort: SortBy,
  now: Date = new Date(),
): boolean {
  if (task.status !== 'done') {
    return filter === 'all' || task.status === filter;
  }

  // Завершене видно, лише поки воно свіже. Список завдань — про роботу, а не
  // про історію: сотня закритих справ ховає те, заради чого екран відкривають.
  // Старіше живе в Архіві, і саме туди по нього й ідуть.
  const visible = filter === 'all' || filter === 'done'
    || (filter === 'active' && sort === 'status');
  return visible && completedWithinDays(task, DONE_VISIBLE_DAYS, now);
}
