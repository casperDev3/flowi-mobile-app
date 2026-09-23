/**
 * utils/timeEntries.ts — форма запису часу, фільтри, сортування і KPI екрана
 * «Час».
 *
 * Чистий модуль, дзеркало вебового `lib/time-entries.ts`: екран і сторінка
 * мусять рахувати «усього за період» і «середню тривалість задачі» одним
 * правилом, інакше два клієнти показують різні числа на тих самих даних.
 *
 * Джерело даних одне — колекція `time_entries`. Записи, що раніше жили в
 * `task.timeEntries`, переносить сюди `utils/timeMigration.ts`.
 */

import type { Shift } from './activeTimers';

/**
 * Запис часу так, як його бачить екран.
 *
 * `shift` лишився ЛИШЕ читанням старих даних: поділу на ранок/день/вечір/ніч у
 * продукті більше немає, нові записи це поле не пишуть, і жоден підсумок за ним
 * не рахується.
 */
export interface TimeRecord {
  id: string;
  task: string;
  duration: number;
  /** ISO кінця сесії (CLAUDE.md: у сховищі — ISO-рядки, не 'YYYY-MM-DD'). */
  date: string;
  /** Належність проєкту (WORKSPACE_PROJECTS_CONTRACT §3.3) — опційна. */
  projectId?: string;
  /** Задача, з якої пішла сесія. Є в перенесених записів. */
  taskId?: string;
  startedAt?: string;
  endedAt?: string;
  note?: string;
  /** «Це нормально» з блоку аномалій. */
  markedNormal?: boolean;
  /** ЛЕГАСІ: читаємо, але не пишемо. */
  shift?: Shift;
  updatedAt?: string;
}

export type TimePeriod = 'today' | 'week' | 'month' | 'all';
export type TimeSort = 'date-desc' | 'date-asc' | 'duration-desc' | 'duration-asc';
export type TimeGrouping = 'list' | 'project';

export const TIME_PERIODS: TimePeriod[] = ['today', 'week', 'month', 'all'];
export const TIME_SORTS: TimeSort[] = ['date-desc', 'date-asc', 'duration-desc', 'duration-asc'];

export function recordSeconds(entry: TimeRecord): number {
  const value = Number(entry?.duration);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function recordTimeMs(entry: TimeRecord): number {
  const ms = Date.parse(entry?.endedAt ?? entry?.date ?? '');
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Початок періоду, мілісекунди; `null` — «весь час».
 *
 * `now` — ОБОВ'ЯЗКОВИЙ аргумент виклику, а не `new Date()` на рівні модуля:
 * саме модульна константа «сьогодні» застрягала після півночі, і екран до ранку
 * підписував учорашній день як сьогоднішній.
 */
export function periodStartMs(period: TimePeriod, now: Date): number | null {
  if (period === 'all') return null;
  const start = new Date(now.getTime());
  start.setHours(0, 0, 0, 0);
  if (period === 'week') start.setDate(start.getDate() - 6);
  if (period === 'month') start.setDate(start.getDate() - 29);
  return start.getTime();
}

export interface TimeFilters {
  period: TimePeriod;
  projectId: string | null;
  taskKey: string | null;
}

/** Ключ задачі для фільтра: id, коли він є, інакше назва. */
export function recordTaskKey(entry: TimeRecord): string {
  if (entry?.taskId) return `id:${entry.taskId}`;
  return `title:${(entry?.task ?? '').trim().toLowerCase()}`;
}

export function filterRecords(
  records: readonly TimeRecord[],
  filters: TimeFilters,
  now: Date,
): TimeRecord[] {
  const from = periodStartMs(filters.period, now);
  return (records ?? []).filter(entry => {
    if (!entry) return false;
    if (from !== null && recordTimeMs(entry) < from) return false;
    if (filters.projectId && (entry.projectId ?? null) !== filters.projectId) return false;
    if (filters.taskKey && recordTaskKey(entry) !== filters.taskKey) return false;
    return true;
  });
}

export function sortRecords(records: readonly TimeRecord[], sort: TimeSort): TimeRecord[] {
  const list = [...(records ?? [])];
  // Стабільний добір за id: без нього два записи з однаковою міткою часу
  // міняються місцями на кожному перерахунку і список «мерехтить».
  const tie = (a: TimeRecord, b: TimeRecord) => String(a.id).localeCompare(String(b.id));
  switch (sort) {
    case 'date-asc':
      return list.sort((a, b) => recordTimeMs(a) - recordTimeMs(b) || tie(a, b));
    case 'duration-desc':
      return list.sort((a, b) => recordSeconds(b) - recordSeconds(a) || tie(a, b));
    case 'duration-asc':
      return list.sort((a, b) => recordSeconds(a) - recordSeconds(b) || tie(a, b));
    default:
      return list.sort((a, b) => recordTimeMs(b) - recordTimeMs(a) || tie(a, b));
  }
}

export function totalSeconds(records: readonly TimeRecord[]): number {
  return (records ?? []).reduce((sum, entry) => sum + recordSeconds(entry), 0);
}

/**
 * Середня тривалість ЗАДАЧІ, а не запису: сума всіх сесій, поділена на число
 * різних задач. Саме це питають, коли питають «скільки в середньому йде
 * задача» — середнє по записах відповідало б на інше питання.
 */
export function averageTaskSeconds(records: readonly TimeRecord[]): number {
  const list = records ?? [];
  const tasks = new Set(list.filter(entry => recordSeconds(entry) > 0).map(recordTaskKey));
  if (!tasks.size) return 0;
  return Math.round(totalSeconds(list) / tasks.size);
}

export interface ProjectLike {
  id: string;
  name: string;
  color: string;
}

export interface ProjectShare {
  projectId: string | null;
  name: string;
  color: string;
  seconds: number;
  /** Частка від загального, 0…1. */
  share: number;
}

export interface ProjectGroup extends Omit<ProjectShare, 'share'> {
  items: TimeRecord[];
}

/** Групи за проєктом — спільна основа для розподілу й для режиму «Групи». */
function collectByProject(
  records: readonly TimeRecord[],
  projects: readonly ProjectLike[],
  personalLabel: string,
  personalColor: string,
): ProjectGroup[] {
  const byId = new Map((projects ?? []).map(project => [project.id, project]));
  const groups = new Map<string, ProjectGroup>();
  for (const entry of records ?? []) {
    const key = entry.projectId ?? '';
    let group = groups.get(key);
    if (!group) {
      const project = key ? byId.get(key) : undefined;
      group = {
        projectId: key || null,
        name: project?.name ?? (key ? 'Видалений проєкт' : personalLabel),
        color: project?.color ?? personalColor,
        seconds: 0,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(entry);
    group.seconds += recordSeconds(entry);
  }
  return Array.from(groups.values()).sort((a, b) => b.seconds - a.seconds);
}

/** Розподіл за проєктами, найбільші зверху; записи без проєкту — окремим рядком. */
export function projectBreakdown(
  records: readonly TimeRecord[],
  projects: readonly ProjectLike[],
  personalLabel = 'Особисте',
  personalColor = '#6366F1',
): ProjectShare[] {
  const total = totalSeconds(records);
  return collectByProject(records, projects, personalLabel, personalColor)
    .filter(group => group.seconds > 0)
    .map(group => ({
      projectId: group.projectId,
      name: group.name,
      color: group.color,
      seconds: group.seconds,
      share: total > 0 ? group.seconds / total : 0,
    }));
}

/** Групи проєктів — режим «Групи за проєктом». */
export function groupByProject(
  records: readonly TimeRecord[],
  projects: readonly ProjectLike[],
  personalLabel = 'Особисте',
  personalColor = '#6366F1',
): ProjectGroup[] {
  return collectByProject(records, projects, personalLabel, personalColor);
}

export interface DayGroup {
  key: string;
  ms: number;
  items: TimeRecord[];
  seconds: number;
}

/** yyyy-mm-dd за ЛОКАЛЬНИМ часом (не `toISOString`, він у UTC). */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Групи днів у порядку, у якому вже відсортовано список. */
export function groupByDay(records: readonly TimeRecord[]): DayGroup[] {
  const groups: DayGroup[] = [];
  const index = new Map<string, DayGroup>();
  for (const entry of records ?? []) {
    const ms = recordTimeMs(entry);
    const key = dayKey(ms);
    let group = index.get(key);
    if (!group) {
      group = { key, ms, items: [], seconds: 0 };
      index.set(key, group);
      groups.push(group);
    }
    group.items.push(entry);
    group.seconds += recordSeconds(entry);
  }
  return groups;
}

export interface TaskOption {
  key: string;
  label: string;
  seconds: number;
}

/** Задачі, що є у вибірці, — для фільтра «за задачею». */
export function taskOptions(records: readonly TimeRecord[]): TaskOption[] {
  const map = new Map<string, TaskOption>();
  for (const entry of records ?? []) {
    const key = recordTaskKey(entry);
    const option = map.get(key);
    if (option) option.seconds += recordSeconds(entry);
    else map.set(key, { key, label: entry.task?.trim() || 'Без назви', seconds: recordSeconds(entry) });
  }
  return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds);
}
