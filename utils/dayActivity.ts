/**
 * utils/dayActivity.ts — «графік активності дня» для колонки «Сьогодні»
 * (components/tasks/TasksTodayPane.tsx).
 *
 * Збирає відстежений за день час з трьох джерел:
 *   task.timeEntries / meeting.timeEntries — завершені сесії;
 *   active_timers — сесія, що триває (кінець = «зараз»).
 * Кожна сесія обрізається межами дня, тож сесія, що почалась учора ввечері,
 * сьогодні показується з 00:00.
 *
 * Тут лише арифметика у хвилинах від початку дня — малює її
 * components/tasks/DayActivityTimeline.tsx.
 */
import type { ActiveTimer } from '@/utils/activeTimers';
import type { TimeEntry } from '@/utils/taskTimer';

export type DayActivityKind = 'task' | 'meeting' | 'free';

export interface DayActivityBlock {
  id: string;
  kind: DayActivityKind;
  label: string;
  /** Хвилини від початку дня, [startMin, endMin). */
  startMin: number;
  endMin: number;
  running: boolean;
}

interface TimedSource {
  id: string;
  title: string;
  timeEntries?: readonly TimeEntry[];
}

export interface DayActivityInput {
  tasks: readonly TimedSource[];
  /** СИРІ зустрічі (оригінали серій): екземпляри повторів ділять timeEntries оригіналу. */
  meetings: readonly TimedSource[];
  timers: readonly ActiveTimer[];
  day: Date;
  now: Date;
}

const DAY_MIN = 24 * 60;

function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function clip(startTs: number, endTs: number, base: number): { startMin: number; endMin: number } | null {
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || endTs <= startTs) return null;
  const startMin = Math.max(0, (startTs - base) / 60000);
  const endMin = Math.min(DAY_MIN, (endTs - base) / 60000);
  return endMin > startMin ? { startMin, endMin } : null;
}

export function buildDayActivity({ tasks, meetings, timers, day, now }: DayActivityInput): DayActivityBlock[] {
  const base = dayStart(day);
  const out: DayActivityBlock[] = [];

  const addEntries = (kind: DayActivityKind, src: TimedSource) => {
    for (const e of src.timeEntries ?? []) {
      const start = Date.parse(e.startedAt);
      // endedAt є завжди після переїзду на реєстр; для старих записів —
      // від тривалості (а відкритий запис без тривалості пропускається).
      const end = e.endedAt ? Date.parse(e.endedAt) : start + Math.max(0, e.duration || 0) * 1000;
      const span = clip(start, end, base);
      if (span) out.push({ id: `${src.id}:${e.id}`, kind, label: src.title, ...span, running: false });
    }
  };
  for (const t of tasks) addEntries('task', t);
  for (const m of meetings) addEntries('meeting', m);

  for (const timer of timers) {
    const span = clip(Date.parse(timer.startedAt), now.getTime(), base);
    if (!span) continue;
    const kind: DayActivityKind = timer.taskId ? 'task' : timer.meetingId ? 'meeting' : 'free';
    out.push({ id: `timer:${timer.id}`, kind, label: timer.label, ...span, running: true });
  }

  return out.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}

/** Сумарні хвилини відстеженого часу (перекриття рахуються один раз). */
export function trackedMinutes(blocks: readonly Pick<DayActivityBlock, 'startMin' | 'endMin'>[]): number {
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  let total = 0;
  let curStart = -1;
  let curEnd = -1;
  for (const b of sorted) {
    if (b.startMin > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = b.startMin;
      curEnd = b.endMin;
    } else if (b.endMin > curEnd) {
      curEnd = b.endMin;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total;
}

export const DEFAULT_TIMELINE_START_HOUR = 6;
export const DEFAULT_TIMELINE_END_HOUR = 23;

/**
 * Межі годинної сітки: типово 06:00–23:00, але розширюються, щоб у кадрі
 * були всі блоки (нічна нарада чи сесія таймера) і лінія «зараз».
 */
export function timelineHourRange(
  spans: readonly { startMin: number; endMin: number }[],
  nowMin: number | null,
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_TIMELINE_START_HOUR;
  let endHour = DEFAULT_TIMELINE_END_HOUR;
  const points: number[] = [];
  for (const s of spans) points.push(s.startMin, s.endMin);
  if (nowMin != null) points.push(nowMin);
  for (const p of points) {
    startHour = Math.min(startHour, Math.floor(p / 60));
    endHour = Math.max(endHour, Math.ceil(p / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) };
}
