/**
 * components/calendar/calendarModel.ts — чиста модель екрана «Календар».
 *
 * Календар замінив «Наради»: на одній сітці стоять зустрічі (з розгорнутими
 * повторами), позначки завдань із дедлайном (особисті й проєктні) і АКТИВНІ
 * спринти моїх проєктів смугами кольору проєкту. Уся арифметика тут — без
 * React і без сховища, щоб її можна було покрити тестами: календарні межі
 * (тиждень з понеділка, 6 рядків місяця, перекриття нарад у часовій сітці)
 * найлегше зламати саме непомітно.
 *
 * Дати в моделі — ЛОКАЛЬНІ ключі `YYYY-MM-DD`. Дедлайн завдання лежить у
 * сховищі повним ISO (форма пише `new Date(y, m, d).toISOString()`), тож
 * день береться з локальних getFullYear/getMonth/getDate, а не зрізом рядка:
 * у UTC+2 північ 6 жовтня — це `2026-10-05T22:00:00Z`.
 */
import type { Meeting } from '@/utils/meetings';
import type { Sprint } from '@/utils/sprintUtils';
import { isMyTask, normalizePriority, type Task } from '@/utils/taskUtils';

// ─── Вид ──────────────────────────────────────────────────────────────────────

export type CalendarView = 'month' | 'week' | 'day';
export const CALENDAR_VIEWS: readonly CalendarView[] = ['month', 'week', 'day'];

/**
 * Типовий вид за шириною: телефон — місяць із крапками й списком дня під
 * ним; планшет (≥600pt) — тиждень із погодинною сіткою.
 */
export function defaultCalendarView(isWide: boolean): CalendarView {
  return isWide ? 'week' : 'month';
}

// ─── Дати ─────────────────────────────────────────────────────────────────────

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Локальна північ дня з ключа. Невалідний ключ — сьогодні. */
export function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return date;
}

export function addDaysKey(key: string, n: number): string {
  const d = keyToDate(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Понеділок тижня, до якого належить день. */
export function mondayKey(key: string): string {
  const d = keyToDate(key);
  const shift = (d.getDay() + 6) % 7;
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - shift));
}

/** Сім днів тижня (Пн…Нд), у якому лежить день. */
export function weekDays(key: string): string[] {
  const start = mondayKey(key);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/**
 * Тижні місяця, кожен — сім ключів з понеділка. Рядків стільки, скільки
 * потрібно місяцю (4–6): порожній шостий рядок лише з'їдав би висоту
 * телефона під списком дня.
 */
export function monthMatrix(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = mondayKey(dateKey(first));
  const end = addDaysKey(mondayKey(dateKey(last)), 6);
  const rows: string[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const row = Array.from({ length: 7 }, (_, i) => addDaysKey(cursor, i));
    rows.push(row);
    cursor = addDaysKey(cursor, 7);
  }
  return rows;
}

/** Перший і останній ключ, що їх показує вид навколо опорного дня. */
export function viewRange(view: CalendarView, anchor: string): { start: string; end: string; days: string[] } {
  if (view === 'day') return { start: anchor, end: anchor, days: [anchor] };
  if (view === 'week') {
    const days = weekDays(anchor);
    return { start: days[0], end: days[6], days };
  }
  const d = keyToDate(anchor);
  const days = monthMatrix(d.getFullYear(), d.getMonth()).flat();
  return { start: days[0], end: days[days.length - 1], days };
}

/**
 * Зсув опорного дня на один період виду. Для місяця опора лишається тим
 * самим числом (обрізаним до довжини місяця): «31 січня → лютий» — 28-ме,
 * а не 3 березня, як дав би наївний setMonth.
 */
export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === 'day') return addDaysKey(anchor, direction);
  if (view === 'week') return addDaysKey(anchor, 7 * direction);
  const d = keyToDate(anchor);
  const target = new Date(d.getFullYear(), d.getMonth() + direction, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return dateKey(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
}

export interface PeriodLabels {
  months: readonly string[];
  monthsGenitive: readonly string[];
  weekdaysFull: readonly string[];
}

/** Підпис періоду в шапці: «Жовтень 2026», «5–11 жовтня 2026», «Вівторок, 6 жовтня». */
export function periodTitle(view: CalendarView, anchor: string, labels: PeriodLabels): string {
  const d = keyToDate(anchor);
  if (view === 'month') return `${labels.months[d.getMonth()]} ${d.getFullYear()}`;
  if (view === 'day') {
    return `${labels.weekdaysFull[(d.getDay() + 6) % 7]}, ${d.getDate()} ${labels.monthsGenitive[d.getMonth()]}`;
  }
  const days = weekDays(anchor);
  const a = keyToDate(days[0]);
  const b = keyToDate(days[6]);
  if (a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${labels.monthsGenitive[a.getMonth()]} ${a.getFullYear()}`;
  }
  return `${a.getDate()} ${labels.monthsGenitive[a.getMonth()]} – ${b.getDate()} ${labels.monthsGenitive[b.getMonth()]} ${b.getFullYear()}`;
}

/** Локальний день дедлайну (повний ISO або вже `YYYY-MM-DD`). */
export function taskDeadlineKey(task: Pick<Task, 'deadline'>): string | null {
  const raw = task.deadline;
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? dateKey(d) : null;
}

/**
 * Дедлайн для параметра `?deadline=` форми створення завдання: повний ISO
 * локальної півночі — у тій самій формі, яку пише календар самої форми.
 */
export function deadlineIsoForKey(key: string): string {
  return keyToDate(key).toISOString();
}

// ─── Проєкти й фільтр ─────────────────────────────────────────────────────────

/** Фільтр «лише особисте» (без проєкту). `null` — усе. */
export const PERSONAL_FILTER = '__personal__';
export type ProjectFilter = string | null;

export interface CalendarProject {
  id: string;
  name: string;
  color: string;
}

export function matchesProjectFilter(projectId: string | undefined | null, filter: ProjectFilter): boolean {
  if (filter === null) return true;
  if (filter === PERSONAL_FILTER) return !projectId;
  return projectId === filter;
}

/**
 * Мої проєкти: локальний список `projects` плюс кеш `workspace_projects`
 * (проєкти, куди мене запросили, локального запису можуть не мати).
 * Архівні не показуємо — ні в фільтрі, ні смугами спринтів.
 */
export function mergeCalendarProjects(
  local: readonly { id: string; name: string; color: string; archivedAt?: string }[],
  summaries: readonly { id: string; name: string; color: string; archived_at?: string | null }[],
): CalendarProject[] {
  const out = new Map<string, CalendarProject>();
  const archived = new Set<string>();
  for (const p of local ?? []) {
    if (!p?.id) continue;
    if (p.archivedAt) { archived.add(p.id); continue; }
    out.set(p.id, { id: p.id, name: p.name, color: p.color || '#7C3AED' });
  }
  for (const s of summaries ?? []) {
    if (!s?.id || out.has(s.id) || archived.has(s.id)) continue;
    if (s.archived_at) continue;
    out.set(s.id, { id: s.id, name: s.name, color: s.color || '#7C3AED' });
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Завдання ─────────────────────────────────────────────────────────────────

export interface CalendarTaskItem {
  task: Task;
  day: string;
  done: boolean;
  color: string;
  project: CalendarProject | null;
}

export interface TaskBucketOptions {
  filter: ProjectFilter;
  showDone: boolean;
  /** Лише мої проєктні завдання (§3.7). Без myUserId (локальний режим) не діє. */
  onlyMine: boolean;
  myUserId: string | null | undefined;
  roles?: Readonly<Record<string, string>>;
  isDone: (task: Task) => boolean;
  projects: ReadonlyMap<string, CalendarProject>;
  /** Колір особистих завдань (акцент «Завдань»). */
  personalColor: string;
  range?: { start: string; end: string };
}

/** Завдання з дедлайном, розкладені по днях. */
export function bucketTasks(tasks: readonly Task[], opts: TaskBucketOptions): Record<string, CalendarTaskItem[]> {
  const out: Record<string, CalendarTaskItem[]> = {};
  for (const task of tasks) {
    if (!task || task.backlogKind) continue;
    const day = taskDeadlineKey(task);
    if (!day) continue;
    if (opts.range && (day < opts.range.start || day > opts.range.end)) continue;
    if (!matchesProjectFilter(task.projectId, opts.filter)) continue;
    let project: CalendarProject | null = null;
    if (task.projectId) {
      project = opts.projects.get(task.projectId) ?? null;
      // Проєкт архівний чи вже не мій — його завдань у календарі немає.
      if (!project) continue;
      if (opts.onlyMine && opts.myUserId && !isMyTask(task, opts.myUserId, opts.roles)) continue;
    }
    const done = opts.isDone(task);
    if (done && !opts.showDone) continue;
    (out[day] ??= []).push({ task, day, done, color: project?.color ?? opts.personalColor, project });
  }
  for (const day of Object.keys(out)) {
    out[day].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const pa = normalizePriority(a.task) ?? 9;
      const pb = normalizePriority(b.task) ?? 9;
      if (pa !== pb) return pa - pb;
      return a.task.title.localeCompare(b.task.title);
    });
  }
  return out;
}

// ─── Зустрічі ─────────────────────────────────────────────────────────────────

export function meetingStartMinutes(m: Pick<Meeting, 'time'>): number {
  const match = /^(\d{1,2}):(\d{2})/.exec(m.time || '');
  if (!match) return 0;
  return Math.min(23 * 60 + 59, Number(match[1]) * 60 + Number(match[2]));
}

/** Розгорнуті зустрічі за днями, у порядку часу. */
export function bucketMeetings(expanded: readonly Meeting[], filter: ProjectFilter): Record<string, Meeting[]> {
  const out: Record<string, Meeting[]> = {};
  for (const m of expanded) {
    if (!matchesProjectFilter(m.projectId, filter)) continue;
    (out[m.date] ??= []).push(m);
  }
  for (const day of Object.keys(out)) {
    out[day].sort((a, b) => meetingStartMinutes(a) - meetingStartMinutes(b) || a.title.localeCompare(b.title));
  }
  return out;
}

export interface PositionedMeeting {
  meeting: Meeting;
  startMin: number;
  endMin: number;
  /** Колонка всередині групи перекриття і скільки їх у групі. */
  col: number;
  cols: number;
}

/**
 * Розкладка нарад одного дня в часовій сітці: наради, що перекриваються,
 * діляться шириною порівну (класична розкладка «кластерами»). Найкоротший
 * блок — 15 хв, інакше п'ятихвилинну нараду не було б у що натиснути.
 */
export function layoutDayMeetings(meetings: readonly Meeting[], minDuration = 15): PositionedMeeting[] {
  const items = meetings
    .map(meeting => {
      const startMin = meetingStartMinutes(meeting);
      const endMin = Math.min(24 * 60, startMin + Math.max(minDuration, meeting.durationMinutes || 0));
      return { meeting, startMin, endMin, col: 0, cols: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  let cluster: PositionedMeeting[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const it of cluster) it.cols = colEnds.length;
    cluster = []; colEnds = [];
  };
  for (const it of items) {
    if (it.startMin >= clusterEnd && cluster.length) flush();
    let col = colEnds.findIndex(end => end <= it.startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(it.endMin); } else colEnds[col] = it.endMin;
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  if (cluster.length) flush();
  return items;
}

// ─── Спринти ──────────────────────────────────────────────────────────────────

export interface SprintBar {
  sprint: Sprint;
  /** Номер спринта в проєкті за порядком створення — як у проєктному календарі. */
  number: number;
  project: CalendarProject;
  start: string;
  end: string;
}

function localDay(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? dateKey(d) : null;
}

/**
 * Активні (не закриті) спринти моїх проєктів. Датовані — смуги; недатовані
 * не малюються, а повертаються окремо — для підказки «вкажіть дати спринту».
 */
export function activeSprints(
  sprints: readonly Sprint[],
  projects: ReadonlyMap<string, CalendarProject>,
  filter: ProjectFilter,
  /** Календар проєкту показує й закриті спринти — історію проєкту. */
  opts: { includeClosed?: boolean } = {},
): { bars: SprintBar[]; undated: { sprint: Sprint; project: CalendarProject }[] } {
  const numbers = new Map<string, number>();
  const byProject = new Map<string, Sprint[]>();
  for (const s of sprints) {
    if (!s?.projectId) continue;
    (byProject.get(s.projectId) ?? byProject.set(s.projectId, []).get(s.projectId)!).push(s);
  }
  for (const list of byProject.values()) {
    list
      .slice()
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id))
      .forEach((s, i) => numbers.set(s.id, i + 1));
  }

  const bars: SprintBar[] = [];
  const undated: { sprint: Sprint; project: CalendarProject }[] = [];
  for (const sprint of sprints) {
    // Архівний спринт (archivedAt) прибраний з усіх списків — і з календаря теж.
    if (!sprint?.projectId || sprint.archivedAt || (sprint.closedAt && !opts.includeClosed)) continue;
    const project = projects.get(sprint.projectId);
    if (!project || !matchesProjectFilter(sprint.projectId, filter)) continue;
    const start = localDay(sprint.startDate);
    const end = localDay(sprint.endDate);
    if (!start || !end || end < start) { undated.push({ sprint, project }); continue; }
    bars.push({ sprint, number: numbers.get(sprint.id) ?? 1, project, start, end });
  }
  bars.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  return { bars, undated };
}

export interface SprintSegment {
  bar: SprintBar;
  /** 0-based колонка початку в рядку і скільки колонок займає. */
  startCol: number;
  span: number;
  lane: number;
  /** Спринт почався раніше / закінчиться пізніше за цей рядок. */
  continuesLeft: boolean;
  continuesRight: boolean;
}

/**
 * Смуги спринтів у рядку днів (тиждень місяця або тиждень сітки). Смуги, що
 * перекриваються, лягають у різні доріжки; що не влізло в maxLanes — у
 * `overflow` (кількість по колонках), щоб показати «+N».
 */
export function layoutSprintRow(
  bars: readonly SprintBar[],
  days: readonly string[],
  maxLanes = 3,
): { segments: SprintSegment[]; overflow: number[] } {
  const first = days[0];
  const last = days[days.length - 1];
  const laneEnds: number[] = [];
  const segments: SprintSegment[] = [];
  const overflow = days.map(() => 0);
  for (const bar of bars) {
    if (bar.end < first || bar.start > last) continue;
    const startCol = Math.max(0, days.findIndex(d => d >= bar.start));
    let endCol = days.length - 1;
    for (let i = days.length - 1; i >= 0; i -= 1) { if (days[i] <= bar.end) { endCol = i; break; } }
    let lane = laneEnds.findIndex(end => end < startCol);
    if (lane === -1) lane = laneEnds.length;
    if (lane >= maxLanes) {
      for (let i = startCol; i <= endCol; i += 1) overflow[i] += 1;
      continue;
    }
    laneEnds[lane] = endCol;
    segments.push({
      bar, startCol, span: endCol - startCol + 1, lane,
      continuesLeft: bar.start < first, continuesRight: bar.end > last,
    });
  }
  return { segments, overflow };
}

/** Спринти, що покривають день (для списку дня). */
export function sprintsOnDay(bars: readonly SprintBar[], day: string): SprintBar[] {
  return bars.filter(b => b.start <= day && b.end >= day);
}

// ─── Пошук ────────────────────────────────────────────────────────────────────

export interface CalendarSearchGroup {
  day: string;
  meetings: Meeting[];
  tasks: CalendarTaskItem[];
}

export interface CalendarSearchResult {
  /** Сьогодні й далі — за зростанням дати. */
  upcoming: CalendarSearchGroup[];
  /** Історія — від найсвіжішого. */
  past: CalendarSearchGroup[];
  total: number;
}

function normalizeQuery(q: string): string {
  return q.trim().toLocaleLowerCase();
}

function hit(query: string, ...fields: (string | undefined | null)[]): boolean {
  return fields.some(f => typeof f === 'string' && f.toLocaleLowerCase().includes(query));
}

/**
 * Пошук по календарю: зустрічі (і минулі — історія) та завдання з дедлайном.
 *
 * Повторювана зустріч дала б сотні збігів — по одному на кожен екземпляр.
 * Тому серія показується ОДИН раз: найближчим екземпляром від сьогодні, а
 * якщо серія вже скінчилась — останнім.
 */
export function searchCalendar(
  rawQuery: string,
  meetingsByDay: Readonly<Record<string, readonly Meeting[]>>,
  tasksByDay: Readonly<Record<string, readonly CalendarTaskItem[]>>,
  todayKey: string,
  limit = 60,
): CalendarSearchResult {
  const query = normalizeQuery(rawQuery);
  const empty: CalendarSearchResult = { upcoming: [], past: [], total: 0 };
  if (!query) return empty;

  const bestBySeries = new Map<string, Meeting>();
  const better = (cand: Meeting, cur: Meeting): boolean => {
    const cf = cand.date >= todayKey;
    const uf = cur.date >= todayKey;
    if (cf !== uf) return cf;
    return cf ? cand.date < cur.date : cand.date > cur.date;
  };
  // Екземпляри однієї серії мають ті самі title/notes/location — перевіряємо
  // збіг раз на серію (поки поля ті самі), а не на кожен із тисяч екземплярів.
  const seriesHit = new Map<string, { title: string; notes?: string; location?: string; ok: boolean }>();
  for (const list of Object.values(meetingsByDay)) {
    for (const m of list) {
      const series = m._origId ?? m.id;
      const cached = seriesHit.get(series);
      let ok: boolean;
      if (cached && cached.title === m.title && cached.notes === m.notes && cached.location === m.location) {
        ok = cached.ok;
      } else {
        ok = hit(query, m.title, m.notes, m.location);
        seriesHit.set(series, { title: m.title, notes: m.notes, location: m.location, ok });
      }
      if (!ok) continue;
      const cur = bestBySeries.get(series);
      if (!cur || better(m, cur)) bestBySeries.set(series, m);
    }
  }

  const groups = new Map<string, CalendarSearchGroup>();
  const group = (day: string) => {
    let g = groups.get(day);
    if (!g) { g = { day, meetings: [], tasks: [] }; groups.set(day, g); }
    return g;
  };
  for (const m of bestBySeries.values()) group(m.date).meetings.push(m);
  for (const [day, items] of Object.entries(tasksByDay)) {
    for (const item of items) {
      if (hit(query, item.task.title, item.task.description)) group(day).tasks.push(item);
    }
  }
  for (const g of groups.values()) {
    g.meetings.sort((a, b) => meetingStartMinutes(a) - meetingStartMinutes(b) || a.title.localeCompare(b.title));
  }

  const all = [...groups.values()];
  const upcoming = all.filter(g => g.day >= todayKey).sort((a, b) => a.day.localeCompare(b.day));
  const past = all.filter(g => g.day < todayKey).sort((a, b) => b.day.localeCompare(a.day));
  const total = all.reduce((n, g) => n + g.meetings.length + g.tasks.length, 0);
  return { upcoming: upcoming.slice(0, limit), past: past.slice(0, limit), total };
}
