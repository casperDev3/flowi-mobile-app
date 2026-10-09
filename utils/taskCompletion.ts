/**
 * utils/taskCompletion.ts — «готово» ↔ «не готово» без втрати стану.
 *
 * Раніше зняття позначки «виконано» завжди кидало завдання в першу колонку
 * («До роботи») і скидало ВСІ підзавдання в «не виконано»: задача, що була
 * «У процесі» з трьома закритими підзавданнями з п'яти, після випадкової
 * галочки й відміни поверталась на старт.
 *
 * Тепер у момент завершення в подію історії `done` дописується, звідки задача
 * прийшла (`reopen`): колонка статусу і підзавдання, які на той момент були
 * відкриті (їх закриває closeSubtasksOnDone). Зняття позначки читає останню
 * таку подію.
 *
 * Чому в історії, а не окремим полем завдання: сервер для виконавця
 * проєктної задачі пропускає лише фіксований набір полів
 * (`teamwork_policy.EXECUTION_FIELDS` — серед них `history`), і нове поле
 * відхилялось би як `forbidden_task_fields`. Історію клієнти й так
 * дописують при кожній зміні статусу, тож додаткова властивість у події не
 * ламає ні синк, ні веб (той її просто не читає).
 */
import type { TaskStatusColumn } from './taskStatuses';
import type { SubTask, Task, TaskHistoryEvent } from './taskUtils';

export interface TaskReopenInfo {
  /** Колонка статусу до завершення. */
  columnId?: string;
  /** Підзавдання, відкриті до завершення (їх закрило «готово»). */
  openSubtaskIds?: string[];
}

/** Що запамʼятати в події `done`. Порожньо — нічого цінного (нема колонки й відкритих підзавдань). */
export function reopenInfoFor(task: Pick<Task, 'kanbanColumnId' | 'subtasks' | 'status'>): TaskReopenInfo | undefined {
  if (task.status === 'done') return undefined;
  const openSubtaskIds = (task.subtasks ?? []).filter(s => !s.done).map(s => s.id);
  const info: TaskReopenInfo = {};
  if (task.kanbanColumnId) info.columnId = task.kanbanColumnId;
  if (openSubtaskIds.length) info.openSubtaskIds = openSubtaskIds;
  return info.columnId || info.openSubtaskIds ? info : undefined;
}

/**
 * Дописує до ОСТАННЬОЇ події історії інформацію для відновлення. Викликається
 * одразу після `appendHistory(t, 'done')`, тож остання подія — саме ця.
 */
export function withReopenInfo(history: TaskHistoryEvent[], before: Pick<Task, 'kanbanColumnId' | 'subtasks' | 'status'>): TaskHistoryEvent[] {
  const info = reopenInfoFor(before);
  if (!info || !history.length) return history;
  const last = history[history.length - 1];
  if (last.type !== 'done') return history;
  return [...history.slice(0, -1), { ...last, reopen: info }];
}

/** Остання подія `done` з інформацією для відновлення. */
export function lastReopenInfo(task: Pick<Task, 'history'>): TaskReopenInfo | undefined {
  const history = task.history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    const event = history[i];
    if (event.type === 'done') return event.reopen;
  }
  return undefined;
}

/**
 * Колонка, в яку повертається завдання при знятті «готово»: попередня, якщо
 * вона ще існує серед колонок цього простору й не є «готово»; інакше —
 * `fallback` (перша «до роботи» простору).
 */
export function reopenColumnId(
  task: Pick<Task, 'history'>,
  columns: readonly TaskStatusColumn[],
  fallback: string | undefined,
): string | undefined {
  const prev = lastReopenInfo(task)?.columnId;
  if (prev) {
    const column = columns.find(c => c.id === prev);
    if (column && !column.isDone) return column.id;
  }
  return fallback;
}

/**
 * Підзавдання після зняття «готово»: ті, що були відкриті до завершення,
 * знову відкриті; решта (закриті людиною свідомо) лишаються закритими.
 * Без збереженої інформації підзавдання НЕ чіпаються взагалі — скинути всі
 * в «не виконано» означало б стерти чужий прогрес.
 */
export function reopenSubtasks(task: Pick<Task, 'history' | 'subtasks'>): SubTask[] {
  const open = lastReopenInfo(task)?.openSubtaskIds;
  if (!open?.length) return task.subtasks;
  const ids = new Set(open);
  return task.subtasks.map(s => (ids.has(s.id) && s.done ? { ...s, done: false } : s));
}
