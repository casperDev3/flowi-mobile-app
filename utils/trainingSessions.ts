/**
 * utils/trainingSessions.ts — персональні сесії групових тренувань
 * (training-module.md §4) і те, що з них пишеться при закритті (§4.3).
 *
 * Сесія живе в ОСОБИСТОМУ ключі `training_sessions` (сервер розгортає її
 * туди при призначенні). Закриваючи її, клієнт пише три записи однією
 * логічною дією:
 *   1. сама сесія: `status`, `actual`, `logLocalId`, `workoutLocalId`;
 *   2. звичайний `Workout` у журнал (`workouts`) — щоб групове тренування
 *      зʼявилось у статистиці й журналі, які вже працюють;
 *   3. `workout_logs` у потік групи — те, що бачить тренер.
 *
 * id обох похідних записів ПОХІДНІ від id сесії: повторне закриття (або
 * закриття з другого пристрою) оновлює ті самі записи, а не насипає дублі.
 * Для журналу це ще й захист від подвійного рахунку спалених калорій:
 * «Спалено» = `calories_out` + калорії з `workouts` (utils/healthUtils.ts
 * burnedForDay), і другий Workout за ту саму сесію додав би їх удруге.
 * Окремого `calories_out` сесія НЕ пише з тієї ж причини.
 */
import type {
  LogExercise,
  LogSet,
  LogStatus,
  PlannedExercise,
  SessionActual,
  SessionStatus,
  TrainingSession,
  WorkoutLog,
} from './trainingTypes';

// ── Дні ────────────────────────────────────────────────────────────────────

/**
 * 'YYYY-MM-DD' у заданому поясі. Межа доби групи — її `timezone` (§1.1),
 * а не пояс пристрою: інакше учасник у відрядженні бачив би «сьогодні» не
 * той день, за який сервер рахує стрік.
 */
export function dayKeyInZone(date: Date, timeZone?: string | null): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(date);
      const get = (type: string) => parts.find(p => p.type === type)?.value;
      const y = get('year'); const m = get('month'); const d = get('day');
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      // Невідомий пояс або Intl без timeZone — падаємо на пояс пристрою.
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isSessionOpen(s: Pick<TrainingSession, 'status'>): boolean {
  return s.status === 'planned';
}

export function isSessionDone(s: Pick<TrainingSession, 'status'>): boolean {
  return s.status === 'completed' || s.status === 'partial';
}

/** Коректна (з полями, без яких екран не намалює) сесія з голого JSON. */
export function isValidSession(raw: unknown): raw is TrainingSession {
  if (!raw || typeof raw !== 'object') return false;
  const s = raw as Partial<TrainingSession>;
  return typeof s.id === 'string' && typeof s.groupId === 'string' && typeof s.date === 'string';
}

export function sessionsForGroup(all: readonly unknown[], groupId: string): TrainingSession[] {
  return all
    .filter(isValidSession)
    .filter(s => s.groupId === groupId)
    .sort((a, b) => (a.date === b.date ? (a.dayOfWeek ?? 0) - (b.dayOfWeek ?? 0) : a.date < b.date ? -1 : 1));
}

/** Сьогоднішня сесія: спершу ще відкрита, інакше будь-яка за сьогодні. */
export function todaySession(sessions: readonly TrainingSession[], today: string): TrainingSession | null {
  const onDay = sessions.filter(s => s.date === today);
  return onDay.find(isSessionOpen) ?? onDay[0] ?? null;
}

export function nextSession(sessions: readonly TrainingSession[], today: string): TrainingSession | null {
  return sessions.find(s => s.date > today && isSessionOpen(s)) ?? null;
}

/**
 * Сесії, які треба позначити `missed` (§4.2): лишились `planned` у дні,
 * що вже минули. Проставляє КЛІЄНТ — серверного нічного джоба немає.
 */
export function sessionsToMarkMissed(sessions: readonly TrainingSession[], today: string): string[] {
  return sessions.filter(s => s.status === 'planned' && s.date < today).map(s => s.id);
}

export function applyMissed<T extends { id: string; status?: string; updatedAt?: string }>(
  all: T[],
  ids: ReadonlySet<string>,
): T[] {
  if (!ids.size) return all;
  let changed = false;
  const next = all.map(s => {
    if (!ids.has(s.id) || s.status !== 'planned') return s;
    changed = true;
    return { ...s, status: 'missed' };
  });
  return changed ? next : all;
}

/** Сім днів тижня, що містить `today`, з першим днем `weekStart` (1=Пн, 0=Нд). */
export function weekDays(today: string, weekStart: number): string[] {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay();
  const back = (dow - (weekStart === 0 ? 0 : 1) + 7) % 7;
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - back + i);
    out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

// ── Вага ───────────────────────────────────────────────────────────────────

/** Грами → «72.5» (один знак, без «.0»). Обчислень у кг ніде немає (§3.3). */
export function formatKg(weightG: number | null | undefined): string {
  const g = typeof weightG === 'number' && Number.isFinite(weightG) ? weightG : 0;
  const tenths = Math.round(g / 100);
  const whole = Math.trunc(tenths / 10);
  const frac = Math.abs(tenths % 10);
  return frac ? `${whole}.${frac}` : String(whole);
}

/** «72,5» / «72.5» → 72500 г. Некоректне → null. */
export function parseKgToG(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!normalized) return 0;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [whole, frac = ''] = normalized.split('.');
  const g = Number(whole) * 1000 + Math.round(Number(`0.${frac || '0'}`) * 1000);
  return Number.isFinite(g) ? g : null;
}

// ── Виконання ──────────────────────────────────────────────────────────────

/** Початкова розкладка підходів із плану — усі «не виконано». */
export function initialActual(planned: readonly PlannedExercise[]): LogExercise[] {
  return [...planned]
    .sort((a, b) => a.order - b.order)
    .map(p => ({
      exerciseId: p.exerciseId,
      name: p.name,
      sets: Array.from({ length: Math.max(1, p.sets ?? 1) }, (_, i): LogSet => ({
        setIndex: i + 1,
        reps: p.reps,
        weightG: p.weightG,
        rpe: null,
        done: false,
      })),
    }));
}

export function countSets(exercises: readonly LogExercise[]): { done: number; total: number } {
  let done = 0; let total = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) { total += 1; if (s.done) done += 1; }
  }
  return { done, total };
}

/** Об'єм: Σ reps × weightG лише виконаних підходів (як `_set_volume_g` сервера). */
export function totalVolumeG(exercises: readonly LogExercise[]): number {
  let volume = 0;
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (s.done === false) continue;
      volume += Math.trunc(s.reps || 0) * Math.trunc(s.weightG || 0);
    }
  }
  return volume;
}

/** Усе виконано → completed; щось → partial; нічого → skipped. */
export function statusFromSets(exercises: readonly LogExercise[]): LogStatus {
  const { done, total } = countSets(exercises);
  if (total > 0 && done === total) return 'completed';
  if (done > 0) return 'partial';
  return 'skipped';
}

export function durationMinutes(startedAt: string | null | undefined, completedAt: string): number {
  if (!startedAt) return 0;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 0;
}

export function logIdForSession(sessionId: string): string {
  return `wl-${sessionId}`.slice(0, 64);
}

export function workoutIdForSession(sessionId: string): string {
  return `tw-${sessionId}`.slice(0, 64);
}

export interface FinishInput {
  session: TrainingSession;
  exercises: LogExercise[];
  status: LogStatus;
  userId: number;
  startedAt: string | null;
  completedAt: string;
  /** Якщо людина сама ввела тривалість — вона важливіша за різницю часу. */
  durationMin?: number | null;
  memberNote?: string | null;
  calories?: number | null;
  /** Оцінка XP (офлайн-дзеркало); джерело істини — книга на сервері. */
  xpEstimate?: number;
  /**
   * Наявний лог цієї сесії (повторне закриття). Його `coachNote` належить
   * тренеру і лишається як є — як `buildCompletion.existingLog` у вебі.
   */
  existingLog?: Pick<WorkoutLog, 'coachNote'> | null;
}

export interface FinishRecords {
  session: TrainingSession;
  log: WorkoutLog;
  /** null — сесія пропущена: у журнал тренувань пропуск не пишемо. */
  workout: Record<string, unknown> | null;
}

const WORKOUT_TYPES = new Set(['run', 'bike', 'swim', 'gym', 'yoga', 'walk', 'other']);

export function buildFinishRecords(input: FinishInput): FinishRecords {
  const { session, exercises, status, userId, startedAt, completedAt } = input;
  const durationMin = input.durationMin && input.durationMin > 0
    ? Math.round(input.durationMin)
    : durationMinutes(startedAt, completedAt);
  const volume = totalVolumeG(exercises);
  const logId = logIdForSession(session.id);
  const workoutId = workoutIdForSession(session.id);
  const note = input.memberNote?.trim() ? input.memberNote.trim() : null;
  const calories = input.calories && input.calories > 0 ? Math.round(input.calories) : null;
  const xp = status === 'completed' ? Math.max(0, input.xpEstimate ?? 0) : 0;

  const actual: SessionActual = {
    startedAt,
    completedAt,
    durationMin,
    exercises,
    totalVolumeG: volume,
    memberNote: note,
    calories,
  };
  const sessionStatus: SessionStatus = status;
  const nextSession: TrainingSession = {
    ...session,
    status: sessionStatus,
    actual,
    logLocalId: logId,
    workoutLocalId: status === 'skipped' ? session.workoutLocalId ?? null : workoutId,
    xpAwarded: xp,
  };

  const log: WorkoutLog = {
    id: logId,
    userId,
    groupId: session.groupId,
    sessionLocalId: session.id,
    assignmentId: session.assignmentId ?? null,
    programId: session.programId ?? null,
    title: session.title ?? '',
    date: session.date,
    startedAt,
    completedAt,
    durationMin,
    status,
    exercises,
    totalVolumeG: volume,
    memberNote: note,
    coachNote: input.existingLog?.coachNote ?? null,
    xpAwarded: xp,
  };

  const type = typeof session.type === 'string' && WORKOUT_TYPES.has(session.type) ? session.type : 'gym';
  const workout = status === 'skipped' ? null : {
    id: workoutId,
    type,
    title: session.title || session.programName || '',
    durationMin,
    ...(calories ? { calories } : {}),
    ...(note ? { note } : {}),
    // Дата журналу — полудень дня сесії в пристроєвому часі: журнал ділить
    // тренування по днях через isSameDay, і північ у UTC для східних поясів
    // лягла б на попередній день.
    date: new Date(`${session.date}T12:00:00`).toISOString(),
    programId: session.programId,
    sessionId: session.id,
    groupId: session.groupId,
  };

  return { session: nextSession, log, workout };
}

/**
 * Нотатка тренера в чужому лозі — лише `coachNote` (§2.3): сервер відхилить
 * мутацію, у якій змінилось будь-яке інше поле. Тому беремо дані рівно такі,
 * як бачить сервер, і міняємо одне поле.
 */
export function withCoachNote(log: WorkoutLog, note: string): WorkoutLog {
  const trimmed = note.trim();
  return { ...log, coachNote: trimmed ? trimmed : null };
}
