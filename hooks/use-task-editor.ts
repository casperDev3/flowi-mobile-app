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
import {
  DEFAULT_PRIORITY_LEVEL,
  normalizePriority,
  type LegacyPriority,
  type TaskPriority,
} from '@/utils/taskUtils';

/**
 * Мінімум, потрібний формі. Навмисно не повний Task: редактор не має
 * причин знати про підзавдання, історію чи записи часу, і залежність від
 * них зробила б його неперевірним без цілого завдання.
 */
export interface EditableTask {
  title: string;
  description?: string;
  /** Може бути відсутнім у старих даних (задачі з деталі проєкту, CONTRACT §D.4.4). */
  priority?: LegacyPriority;
  /** P0…P5 / null; відсутнє — запис ще не зберігав новий клієнт (CONTRACT §B). */
  priorityLevel?: TaskPriority;
  estimatedMinutes?: number;
  deadline?: string;
  projectId?: string;
  /** Спринт проєкту (utils/sprintUtils.ts); відсутній = беклог. */
  sprintId?: string;
  recurrence?: RecurrenceRule;
  /** Виконавець (контракт §4.5) — рядковий `user.id`, як і скрізь у синку. */
  assigneeId?: string | null;
}

export interface TaskDraft {
  title: string;
  desc: string;
  /** Рівень пріоритету; збереження пише priorityFields(priorityLevel) (dual-write). */
  priorityLevel: TaskPriority;
  statusId: string;
  /**
   * Проєкт — частина чернетки, а не окреме поле завдання.
   *
   * Форма застосовує зміни при збереженні, і проєкт не має бути винятком:
   * інакше «Скасувати» повертало б назву й пріоритет, але лишало новий
   * проєкт — половина скасування, яку користувач не просив.
   */
  projectId: string | null;
  /**
   * Спринт (CONTRACT §D.3). null = «Беклог». При правці — task.sprintId
   * ДОСЛІВНО (навіть закритий/чужий), щоб збереження без змін нікуди задачу не
   * переносило. Зміна проєкту у формі скидає його в null.
   */
  sprintId: string | null;
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
  /**
   * Виконавець (контракт §4.5). Поле форми, а не самого завдання: як і
   * проєкт/спринт, застосовується лише при збереженні — «Скасувати» не має
   * лишати нового виконавця, обраного, а потім відкинутого разом з рештою
   * правки.
   */
  assigneeId: string | null;
}

function emptyDraft(statusId: string): TaskDraft {
  return {
    title: '', desc: '', priorityLevel: DEFAULT_PRIORITY_LEVEL, statusId, projectId: null, sprintId: null,
    estHours: '', estMins: '', deadline: null,
    repeat: false, repeatFreq: 'weekly', repeatInterval: 1,
    repeatDays: [], repeatEndType: 'never', repeatUntil: '',
    assigneeId: null,
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
    // Єдине правило читання двох полів (CONTRACT §B.3). Задача без валідного
    // пріоритету показується «без пріоритету» — форма тепер має цей варіант,
    // а збереження пише валідне легасі-значення для старих клієнтів.
    priorityLevel: normalizePriority(task),
    statusId,
    projectId: task.projectId ?? null,
    sprintId: task.sprintId ?? null,
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
    assigneeId: task.assigneeId ?? null,
  };
}

/** Проєкт і спринт завдання на момент відкриття правки (null — створення). */
export interface TaskDraftOriginal {
  projectId: string | null;
  sprintId: string | null;
}

/**
 * Спринт, від якого будуються варіанти поля «Спринт» (дзеркало веб
 * task-form.tsx currentSprintId): обраний у чернетці, а якщо обрано «Беклог»
 * і проєкт не мінявся — вихідний спринт задачі. Інакше закритий/чужий спринт
 * зникав би зі списку від одного тапу по «Беклогу», і повернутись до нього
 * можна було б лише скасувавши всю правку.
 */
export function draftCurrentSprintId(
  draft: Pick<TaskDraft, 'projectId' | 'sprintId'>,
  original: TaskDraftOriginal | null,
): string | null {
  if (draft.sprintId) return draft.sprintId;
  if (original && original.projectId === draft.projectId) return original.sprintId || null;
  return null;
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

/** Групи полів форми — одиниці «користувач це змінив». */
export type DraftFieldGroup =
  | 'title' | 'desc' | 'priority' | 'status' | 'project' | 'sprint'
  | 'estimate' | 'deadline' | 'recurrence' | 'assignee';

/**
 * Які поля форми користувач реально змінив від моменту відкриття.
 *
 * Поки форма відкрита, завдання може змінитись деінде (веб, інший пристрій), і
 * список на екрані оновлюється наживо. Форма — ні: чернетка лишається тією, яку
 * людина бачить. Тому при збереженні пишуться ЛИШЕ змінені тут поля — інакше
 * незмінена в формі назва перезаписала б нову назву з вебу старою
 * (last write wins по полю, а не по запису).
 *
 * `initial` null — створення: «змінено» все.
 */
export function editedDraftFields(initial: TaskDraft | null, draft: TaskDraft): Set<DraftFieldGroup> {
  const all: DraftFieldGroup[] = [
    'title', 'desc', 'priority', 'status', 'project', 'sprint', 'estimate', 'deadline', 'recurrence', 'assignee',
  ];
  if (!initial) return new Set(all);
  const changed = new Set<DraftFieldGroup>();
  if (initial.title.trim() !== draft.title.trim()) changed.add('title');
  if (initial.desc.trim() !== draft.desc.trim()) changed.add('desc');
  if (initial.priorityLevel !== draft.priorityLevel) changed.add('priority');
  if (initial.statusId !== draft.statusId) changed.add('status');
  if (initial.projectId !== draft.projectId) changed.add('project');
  if (initial.sprintId !== draft.sprintId) changed.add('sprint');
  if ((initial.assigneeId ?? null) !== (draft.assigneeId ?? null)) changed.add('assignee');
  if (draftEstimatedMinutes(initial) !== draftEstimatedMinutes(draft)) changed.add('estimate');
  if (initial.deadline !== draft.deadline) changed.add('deadline');
  if (JSON.stringify(draftRecurrence(initial) ?? null) !== JSON.stringify(draftRecurrence(draft) ?? null)) {
    changed.add('recurrence');
  }
  return changed;
}

export function useTaskEditor(defaultStatusId: string, today: Date) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(defaultStatusId));
  /** Проєкт/спринт задачі до правки — див. draftCurrentSprintId. */
  const [original, setOriginal] = useState<TaskDraftOriginal | null>(null);
  /** Чернетка на момент відкриття правки — див. editedDraftFields. null — створення. */
  const [initial, setInitial] = useState<TaskDraft | null>(null);

  // Стан спливних елементів форми — не частина чернетки: він не
  // зберігається й мусить скидатися при кожному відкритті.
  const [showDeadlineCal, setShowDeadlineCal] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const patch = useCallback((part: Partial<TaskDraft>) => {
    setDraft(prev => ({ ...prev, ...part }));
  }, []);

  /**
   * Почати з чистої форми — для створення нового завдання.
   * `preset` — наперед обраний проєкт/спринт (створення зі спринта в деталі проєкту).
   */
  const reset = useCallback((statusId: string, preset?: Partial<Pick<TaskDraft, 'projectId' | 'sprintId'>>) => {
    setDraft({ ...emptyDraft(statusId), ...preset });
    setOriginal(null);
    setInitial(null);
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth());
    setShowDeadlineCal(false);
    setShowProjectDropdown(false);
    setEditing(false);
  }, [today]);

  const begin = useCallback((task: EditableTask, statusId: string) => {
    const start = taskToDraft(task, statusId);
    setDraft(start);
    setInitial(start);
    setOriginal({ projectId: task.projectId ?? null, sprintId: task.sprintId ?? null });
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
    editing, draft, original, initial, patch, begin, reset, finish,
    showDeadlineCal, setShowDeadlineCal,
    showProjectDropdown, setShowProjectDropdown,
    calYear, setCalYear, calMonth, setCalMonth,
  }), [editing, draft, original, initial, patch, begin, reset, finish, showDeadlineCal, showProjectDropdown, calYear, calMonth]);
}
