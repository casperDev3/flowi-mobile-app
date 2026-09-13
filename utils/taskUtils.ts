import { isSameMonth } from './dateUtils';

/** Легасі-пріоритет: досі пишеться КОЖНИМ збереженням (dual-write, CONTRACT §B). */
export type LegacyPriority = 'high' | 'medium' | 'low';
/** P0 (найвищий) … P5 (найнижчий). */
export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5;
/** null = явно «без пріоритету». */
export type TaskPriority = PriorityLevel | null;
/** @deprecated аліас для наявних імпортів — використовуйте LegacyPriority. */
export type Priority = LegacyPriority;
export type Status = 'active' | 'done';
export type SortBy = 'status' | 'priority' | 'newest' | 'oldest' | 'name' | 'deadline';
export type Filter = 'all' | 'active' | 'done';

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  reminderAt?: string;
}

export interface TaskTimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
}

export type HistoryEventType =
  | 'created' | 'edited' | 'done' | 'active'
  | 'timer_start' | 'timer_stop'
  | 'subtask_add' | 'subtask_done' | 'subtask_undone';

export interface TaskHistoryEvent {
  id: string;
  at: string;
  type: HistoryEventType;
  note?: string;
}

export interface Task {
  id: string;
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
  title: string;
  /** Опційний: веб-клієнт пише undefined замість порожнього рядка, тож
   *  вважати поле обовʼязковим означало б падати на його даних. */
  description?: string;
  /** Легасі-поле. Може бути відсутнім (задачі з деталі проєкту старих збірок). */
  priority?: LegacyPriority;
  /** P0…P5 або null («без пріоритету»). Відсутнє = запис ще не зберігав новий клієнт. */
  priorityLevel?: TaskPriority;
  status: Status;
  kanbanColumnId?: string;
  subtasks: SubTask[];
  createdAt: string;
  startDate?: string;
  estimatedMinutes?: number;
  deadline?: string;
  projectId?: string;
  /**
   * Спринт проєкту (utils/sprintUtils.ts). Порожній/відсутній = беклог
   * проєкту — це НЕ помилка й не привід для міграції: усі наявні завдання
   * саме такі. У «Сьогодні» спринт не впливає ні на що: там тягне виключно
   * власний deadline завдання.
   */
  sprintId?: string;
  reminderAt?: string;
  timeEntries?: TaskTimeEntry[];
  history?: TaskHistoryEvent[];
}

// ─── Пріоритет P0–P5 (CONTRACT §B) ────────────────────────────────────────────
//
// Правила однакові з вебом (lib/priority.ts) — дані синхронізуються між
// клієнтами, тож будь-яка розбіжність тут означала б різний порядок і різні
// бейджі для того самого завдання на телефоні й у браузері.

export const PRIORITY_LEVELS: readonly PriorityLevel[] = [0, 1, 2, 3, 4, 5];
/** Нові завдання — P3 (→ 'medium', тобто старий типовий для старих клієнтів). */
export const DEFAULT_PRIORITY_LEVEL: PriorityLevel = 3;
export const PRIORITY_LEVEL_COLORS: Record<PriorityLevel, string> = {
  0: '#EF4444',
  1: '#F97316',
  2: '#F59E0B',
  3: '#3B82F6',
  4: '#64748B',
  5: '#94A3B8',
};
export const LEGACY_TO_LEVEL: Record<LegacyPriority, PriorityLevel> = { high: 1, medium: 3, low: 4 };
/** ≈15% альфа-суфікс для #RRGGBB. */
export const PRIORITY_BADGE_BG_ALPHA_HEX = '26';

export function isPriorityLevel(v: unknown): v is PriorityLevel {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5;
}

export function isLegacyPriority(v: unknown): v is LegacyPriority {
  return v === 'high' || v === 'medium' || v === 'low';
}

/** P0,P1 → high; P2,P3 → medium; P4,P5,null → low. */
export function toLegacyPriority(level: TaskPriority): LegacyPriority {
  if (level === 0 || level === 1) return 'high';
  if (level === 2 || level === 3) return 'medium';
  return 'low';
}

/**
 * Єдиний пріоритет запису з двох полів.
 *
 * Старі клієнти переписують `priority`, але зберігають (tasks) або гублять
 * (спільні елементи — сервер замінює data) `priorityLevel`. Тому розбіжність
 * між полями означає «старий клієнт змінив пріоритет після нас» — і перемагає
 * легасі-значення.
 */
export function normalizePriority(item: { priority?: unknown; priorityLevel?: unknown }): TaskPriority {
  const lvl = isPriorityLevel(item?.priorityLevel) ? item.priorityLevel : undefined;
  const isNull = item?.priorityLevel === null;
  const legacy = isLegacyPriority(item?.priority) ? item.priority : undefined;
  if (lvl !== undefined) {
    if (legacy !== undefined && toLegacyPriority(lvl) !== legacy) return LEGACY_TO_LEVEL[legacy];
    return lvl;
  }
  if (isNull) {
    if (legacy !== undefined && legacy !== toLegacyPriority(null)) return LEGACY_TO_LEVEL[legacy];
    return null;
  }
  if (legacy !== undefined) return LEGACY_TO_LEVEL[legacy];
  return null;
}

/** Dual-write патч для колекції `tasks`. ЗАВЖДИ розгортається в збережене завдання. */
export function priorityFields(level: TaskPriority): { priorityLevel: TaskPriority; priority: LegacyPriority } {
  return { priorityLevel: level, priority: toLegacyPriority(level) };
}

/**
 * Для спільних елементів групи: null → `{ priorityLevel: null }` БЕЗ ключа
 * `priority` (старий UI спільних списків не показує бейдж, коли priority нема).
 */
export function sharedPriorityFields(level: TaskPriority): { priorityLevel: TaskPriority; priority?: LegacyPriority } {
  if (level === null) return { priorityLevel: null };
  return { priorityLevel: level, priority: toLegacyPriority(level) };
}

export function priorityColor(level: TaskPriority): string | null {
  return isPriorityLevel(level) ? PRIORITY_LEVEL_COLORS[level] : null;
}

export function priorityBadgeBg(level: TaskPriority): string | null {
  const color = priorityColor(level);
  return color ? color + PRIORITY_BADGE_BG_ALPHA_HEX : null;
}

/** 'P0'..'P5', '' для «без пріоритету» (мовно-нейтральне). */
export function priorityLabel(level: TaskPriority): string {
  return isPriorityLevel(level) ? `P${level}` : '';
}

/** P0 першим … P5, без пріоритету — В КІНЦІ; рівні — 0. */
export function comparePriorityLevel(a: TaskPriority, b: TaskPriority): number {
  const ra = isPriorityLevel(a) ? a : 6;
  const rb = isPriorityLevel(b) ? b : 6;
  return ra - rb;
}

export function comparePriority(
  a: { priority?: unknown; priorityLevel?: unknown },
  b: { priority?: unknown; priorityLevel?: unknown },
): number {
  return comparePriorityLevel(normalizePriority(a), normalizePriority(b));
}

/** Порожній вибір = без фільтра; завдання без пріоритету не проходять непорожній вибір. */
export function matchesPriorityFilter(
  item: { priority?: unknown; priorityLevel?: unknown },
  selected: readonly PriorityLevel[],
): boolean {
  if (!selected.length) return true;
  const level = normalizePriority(item);
  return level !== null && selected.includes(level);
}

/** @deprecated легасі-ранг; нове сортування — comparePriority. */
export const PRIORITY_ORDER: Record<LegacyPriority, number> = { high: 0, medium: 1, low: 2 };

/** @deprecated легасі-кольори; нові бейджі — PRIORITY_LEVEL_COLORS / priorityColor. */
export const PRIORITY_COLORS: Record<LegacyPriority, string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#10B981',
};

export function getProgress(t: Task): number {
  if (t.status === 'done') return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
}

/**
 * Приймає структурний зріз, а не весь `Task`: екрани оголошують власні
 * інтерфейси завдання (з recurrence, recordings тощо), і номінально
 * несумісний тип змушував би або кастити, або тримати локальну копію правила.
 */
export function isOverdue(task: Pick<Task, 'deadline' | 'status'>): boolean {
  if (!task.deadline || task.status === 'done') return false;
  const d = new Date(task.deadline);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

export function deadlineDiff(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function deadlineColor(task: Task, fallback: string): string {
  if (!task.deadline || task.status === 'done') return fallback;
  const diff = deadlineDiff(task.deadline);
  if (diff < 0) return '#EF4444';
  if (diff <= 1) return '#F59E0B';
  return fallback;
}

export function filterTasksByMonth(tasks: Task[], month: Date): Task[] {
  return tasks.filter(t => {
    const created = isSameMonth(new Date(t.createdAt), month);
    const deadline = t.deadline ? isSameMonth(new Date(t.deadline), month) : false;
    const isActive = t.status === 'active';
    // Show active tasks from any month so nothing gets lost
    return created || deadline || isActive;
  });
}

export function sortTasks(tasks: Task[], by: SortBy): Task[] {
  return [...tasks].sort((a, b) => {
    switch (by) {
      // Усередині статусної групи порядок задає пріоритет: сам статус уже
      // винесений у заголовок групи й сортувати за ним удруге нема сенсу.
      case 'status':
      case 'priority':
        return comparePriority(a, b);
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name':
        return a.title.localeCompare(b.title);
      case 'deadline': {
        const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aD - bD;
      }
      default:
        return 0;
    }
  });
}

/**
 * Чи підходить завдання під пошуковий запит (назва або опис).
 *
 * `description` свідомо читається через ?? '': веб-клієнт пише туди undefined
 * замість порожнього рядка, і пряме звертання до .toLowerCase() валило пошук
 * на кожному завданні, створеному у вебі без опису.
 */
export function taskMatchesSearch(
  task: Pick<Task, 'title' | 'description'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (task.title ?? '').toLowerCase().includes(q)
    || (task.description ?? '').toLowerCase().includes(q);
}

export function applyTaskFilters(
  tasks: Task[],
  {
    filter,
    search,
    projectId,
    priority,
    priorities,
    dateFilter,
  }: {
    filter: Filter;
    search: string;
    projectId?: string;
    /** @deprecated одиночний легасі-фільтр: збігається з рівнями, що мапляться в це легасі-значення. */
    priority?: LegacyPriority;
    /** Мультивибір P0…P5; порожній = без фільтра. */
    priorities?: readonly PriorityLevel[];
    dateFilter?: string | null;
  },
): Task[] {
  return tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (!taskMatchesSearch(t, search)) return false;
    if (projectId && t.projectId !== projectId) return false;
    if (priority && isLegacyPriority(priority)) {
      // Легасі-фільтр означає всю легасі-групу: 'high' = P0 і P1 (а не лише P1).
      const level = normalizePriority(t);
      if (level === null || toLegacyPriority(level) !== priority) return false;
    }
    if (priorities && !matchesPriorityFilter(t, priorities)) return false;
    if (dateFilter) {
      const tDate = new Date(t.createdAt).toDateString();
      if (tDate !== dateFilter) return false;
    }
    return true;
  });
}

/**
 * Коли завдання завершили.
 *
 * Окремого поля під це немає, тож ідемо ланцюжком від найточнішого до
 * найгрубішого: остання подія 'done' в історії → updatedAt → нічого. Остання
 * ланка важлива: у завдання, закритого до появи історії, дати завершення
 * просто не існує, і вигадувати її (наприклад, беручи createdAt) означало б
 * витягувати на екран дня випадкові старі завдання.
 */
export function completedAt(task: Task): Date | null {
  const events = (task.history ?? []).filter(event => event.type === 'done');
  const last = events[events.length - 1];
  if (last?.at) return new Date(last.at);
  if (task.updatedAt) return new Date(task.updatedAt);
  return null;
}

/** Скільки днів завершене завдання лишається в списку завдань. Старіше — в Архіві. */
export const DONE_VISIBLE_DAYS = 2;

/**
 * Чи завершене завдання ще «свіже».
 *
 * Список завдань — про роботу, а не про історію: сотня закритих справ під
 * активними ховає те, заради чого екран відкривають. Вікно рахується в
 * КАЛЕНДАРНИХ добах, а не в годинах: закрите вчора ввечері мусить бути видно
 * зранку, а не зникати через двадцять годин.
 *
 * Завдання без жодної дати завершення (закрите до появи історії) вважається
 * старим: вигадувати йому «сьогодні» означало б назавжди прибити його до
 * верху списку.
 */
export function completedWithinDays(
  task: Task,
  days: number = DONE_VISIBLE_DAYS,
  now: Date = new Date(),
): boolean {
  const at = completedAt(task);
  if (!at) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(startOfToday);
  from.setDate(from.getDate() - (days - 1));
  return at.getTime() >= from.getTime();
}
