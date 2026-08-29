/**
 * hooks/use-task-editor.ts
 *
 * Стан форми редагування завдання.
 *
 * До цього форма жила тринадцятьма окремими useState просто в екрані, і
 * перехід «завдання → форма» був розсипаний по JSX двадцятьма викликами
 * сеттерів поспіль. Тут це одне поле `draft` і один виклик `begin(task)`:
 * набір полів форми — цілісна річ, і міняється він теж цілісно.
 *
 * Хук навмисно НЕ вміє зберігати. Збереження чіпає список завдань і
 * вибране завдання, тобто стан екрана; сюди воно затягло б за собою
 * половину екрана. Хук віддає готову чернетку, екран її записує.
 */
import { useCallback, useMemo, useState } from 'react';

import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import type { Priority } from '@/utils/taskUtils';

/**
 * Мінімум, потрібний формі. Навмисно не повний Task: редактор не має
 * причин знати про підзавдання, історію чи записи часу, і залежність від
 * них зробила б його неперевірним без цілого завдання.
 */
export interface EditableTask {
  title: string;
  description?: string;
  priority: Priority;
  estimatedMinutes?: number;
  deadline?: string;
  projectId?: string;
  recurrence?: RecurrenceRule;
}

export interface TaskDraft {
  title: string;
  desc: string;
  priority: Priority;
  statusId: string;
  /**
   * Проєкт — частина чернетки, а не окреме поле завдання.
   *
   * Форма застосовує зміни при збереженні, і проєкт не має бути винятком:
   * інакше «Скасувати» повертало б назву й пріоритет, але лишало новий
   * проєкт — половина скасування, яку користувач не просив.
   */
  projectId: string | null;
  /** Години й хвилини — окремі рядки, бо це два поля вводу. */
  estHours: string;
  estMins: string;
  deadline: string | null;
  repeat: boolean;
  repeatFreq: RecurrenceRule['freq'];
  repeatInterval: number;
  repeatDays: number[];
  repeatEndType: 'never' | 'until';
  repeatUntil: string;
}

function emptyDraft(statusId: string): TaskDraft {
  return {
    title: '', desc: '', priority: 'medium', statusId, projectId: null,
    estHours: '', estMins: '', deadline: null,
    repeat: false, repeatFreq: 'weekly', repeatInterval: 1,
    repeatDays: [], repeatEndType: 'never', repeatUntil: '',
  };
}

/** Завдання → чернетка. Зворотне перетворення робить draftToPatch(). */
export function taskToDraft(task: EditableTask, statusId: string): TaskDraft {
  const total = task.estimatedMinutes ?? 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const rec = task.recurrence;
  return {
    title: task.title,
    desc: task.description ?? '',
    priority: task.priority,
    statusId,
    projectId: task.projectId ?? null,
    // Порожній рядок, а не '0': нуль у полі вводу читається як введене
    // значення, хоча користувач нічого не вводив.
    estHours: h > 0 ? String(h) : '',
    estMins:  m > 0 ? String(m) : '',
    deadline: task.deadline ?? null,
    repeat: !!rec,
    repeatFreq: rec?.freq ?? 'weekly',
    repeatInterval: rec?.interval ?? 1,
    repeatDays: rec?.daysOfWeek ?? [],
    repeatEndType: rec?.until ? 'until' : 'never',
    repeatUntil: rec?.until ?? '',
  };
}

/** Оцінка часу з чернетки у хвилинах. undefined, якщо не вказано. */
export function draftEstimatedMinutes(draft: TaskDraft): number | undefined {
  const h = parseInt(draft.estHours || '0', 10);
  const m = parseInt(draft.estMins || '0', 10);
  return h * 60 + m || undefined;
}

/** Правило повторення з чернетки. undefined, якщо повторення вимкнене. */
export function draftRecurrence(draft: TaskDraft): RecurrenceRule | undefined {
  if (!draft.repeat) return undefined;
  return {
    freq: draft.repeatFreq,
    interval: draft.repeatInterval,
    // Дні тижня мають сенс лише для тижневого повторення; для решти
    // частот вони лишилися б у даних як мовчазне сміття.
    daysOfWeek: draft.repeatFreq === 'weekly' && draft.repeatDays.length > 0 ? draft.repeatDays : undefined,
    until: draft.repeatEndType === 'until' && draft.repeatUntil ? draft.repeatUntil : undefined,
  };
}

export function useTaskEditor(defaultStatusId: string, today: Date) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(defaultStatusId));

  // Стан спливних елементів форми — не частина чернетки: він не
  // зберігається й мусить скидатися при кожному відкритті.
  const [showDeadlineCal, setShowDeadlineCal] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const patch = useCallback((part: Partial<TaskDraft>) => {
    setDraft(prev => ({ ...prev, ...part }));
  }, []);

  /** Почати з чистої форми — для створення нового завдання. */
  const reset = useCallback((statusId: string) => {
    setDraft(emptyDraft(statusId));
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setShowDeadlineCal(false);
    setShowProjectDropdown(false);
    setEditing(false);
  }, [today]);

  const begin = useCallback((task: EditableTask, statusId: string) => {
    setDraft(taskToDraft(task, statusId));
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setShowDeadlineCal(false);
    setShowProjectDropdown(false);
    setEditing(true);
  }, [today]);

  /** Вийти з режиму редагування, згорнувши все спливне. */
  const finish = useCallback(() => {
    setEditing(false);
    setShowDeadlineCal(false);
    setShowProjectDropdown(false);
  }, []);

  // Повертається мемоізований об'єкт: без цього кожен рендер давав би нове
  // посилання, і будь-який useCallback/useMemo, що залежить від редактора,
  // перераховувався б завжди — тобто був би мемоізацією лише на вигляд.
  return useMemo(() => ({
    editing, draft, patch, begin, reset, finish,
    showDeadlineCal, setShowDeadlineCal,
    showProjectDropdown, setShowProjectDropdown,
    calYear, setCalYear, calMonth, setCalMonth,
  }), [editing, draft, patch, begin, reset, finish, showDeadlineCal, showProjectDropdown, calYear, calMonth]);
}
