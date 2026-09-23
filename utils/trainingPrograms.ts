/**
 * utils/trainingPrograms.ts — конструктор програми: тижневий шаблон × N
 * тижнів із прогресією (training-module.md §3.3), імпорт з особистого
 * (§7.3) і ознака «програму змінено після розгортання» (§5.4).
 *
 * Усі функції чисті й повертають НОВІ обʼєкти — редактор тримає програму в
 * стані й зберігає лише натиском «Зберегти».
 */
import { progressed, sessionDate, trainingDays, type Progression } from './trainingXp';
import type {
  ProgramBlock,
  ProgramDay,
  TrainingAssignment,
  TrainingExercise,
  TrainingProgram,
} from './trainingTypes';

export const MAX_WEEKS = 52;
export const PROGRAM_COLORS = ['#EF4444', '#F97316', '#EAB308', '#10B981', '#0EA5E9', '#6366F1', '#A78BFA', '#EC4899'];

export function emptyProgram(id: string, name = ''): TrainingProgram {
  return { id, name, color: '#0EA5E9', weekCount: 4, notes: '', days: [] };
}

export function normalizeProgram(raw: Partial<TrainingProgram> | null | undefined, id: string): TrainingProgram {
  const p = raw ?? {};
  return {
    id,
    name: typeof p.name === 'string' ? p.name : '',
    color: typeof p.color === 'string' ? p.color : '#0EA5E9',
    weekCount: clampWeeks(p.weekCount),
    notes: typeof p.notes === 'string' ? p.notes : '',
    days: Array.isArray(p.days) ? p.days.filter(d => d && typeof d === 'object').map(normalizeDay) : [],
    ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
  };
}

function normalizeDay(d: ProgramDay): ProgramDay {
  return {
    dayOfWeek: Number(d.dayOfWeek) || 0,
    title: typeof d.title === 'string' ? d.title : '',
    type: typeof d.type === 'string' ? d.type : 'gym',
    estimatedMin: typeof d.estimatedMin === 'number' ? d.estimatedMin : null,
    blocks: Array.isArray(d.blocks) ? d.blocks.filter(b => b && typeof b === 'object') : [],
  };
}

export function clampWeeks(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 4;
  return Math.max(1, Math.min(MAX_WEEKS, n));
}

export function dayFor(program: TrainingProgram, dayOfWeek: number): ProgramDay | undefined {
  return program.days.find(d => d.dayOfWeek === dayOfWeek);
}

/** Вставити/замінити день (один запис на dayOfWeek — сервер бере перший). */
export function setDay(program: TrainingProgram, day: ProgramDay): TrainingProgram {
  const others = program.days.filter(d => d.dayOfWeek !== day.dayOfWeek);
  return { ...program, days: [...others, day].sort((a, b) => a.dayOfWeek - b.dayOfWeek) };
}

export function removeDay(program: TrainingProgram, dayOfWeek: number): TrainingProgram {
  return { ...program, days: program.days.filter(d => d.dayOfWeek !== dayOfWeek) };
}

export function ensureDay(program: TrainingProgram, dayOfWeek: number, defaults: Partial<ProgramDay> = {}): ProgramDay {
  return dayFor(program, dayOfWeek) ?? { dayOfWeek, title: '', type: 'gym', estimatedMin: 60, blocks: [], ...defaults };
}

export function blockFromExercise(ex: TrainingExercise, order: number): ProgramBlock {
  return {
    exerciseId: ex.id,
    name: ex.name,
    order,
    sets: ex.defaultSets && ex.defaultSets > 0 ? ex.defaultSets : 3,
    reps: ex.defaultReps && ex.defaultReps > 0 ? ex.defaultReps : 10,
    weightG: 0,
    restSec: ex.defaultRestSec && ex.defaultRestSec > 0 ? ex.defaultRestSec : 90,
    durationSec: null,
    progression: { mode: 'none' },
  };
}

/** Перенумерувати `order` за поточним порядком масиву (1-based). */
export function renumber(blocks: ProgramBlock[]): ProgramBlock[] {
  return blocks.map((b, i) => (b.order === i + 1 ? b : { ...b, order: i + 1 }));
}

export function sortedBlocks(day: ProgramDay): ProgramBlock[] {
  return [...day.blocks].sort((a, b) => a.order - b.order);
}

export function moveBlock(day: ProgramDay, index: number, delta: -1 | 1): ProgramDay {
  const blocks = sortedBlocks(day);
  const target = index + delta;
  if (target < 0 || target >= blocks.length) return day;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return { ...day, blocks: renumber(blocks) };
}

export function removeBlock(day: ProgramDay, index: number): ProgramDay {
  const blocks = sortedBlocks(day);
  blocks.splice(index, 1);
  return { ...day, blocks: renumber(blocks) };
}

export function replaceBlock(day: ProgramDay, index: number, block: ProgramBlock): ProgramDay {
  const blocks = sortedBlocks(day);
  blocks[index] = block;
  return { ...day, blocks: renumber(blocks) };
}

export function addBlock(day: ProgramDay, block: ProgramBlock): ProgramDay {
  return { ...day, blocks: renumber([...sortedBlocks(day), block]) };
}

/**
 * Тижні для прев'ю «тиждень 1 / 4 / 8» (0-based індекси), обрізані до
 * довжини програми. Коротша програма — перший, середній і останній.
 */
export function previewWeekIndexes(weekCount: number): number[] {
  const n = clampWeeks(weekCount);
  const wanted = n >= 8 ? [0, 3, 7] : [0, Math.floor((n - 1) / 2), n - 1];
  return [...new Set(wanted)].filter(w => w >= 0 && w < n);
}

export function blockPreview(block: ProgramBlock, weekIndex: number): { weightG: number; reps: number } {
  return progressed(block, weekIndex);
}

export type ProgramIssue = 'name' | 'weeks' | 'noDays';

export function validateProgram(program: TrainingProgram): ProgramIssue[] {
  const issues: ProgramIssue[] = [];
  if (!program.name.trim()) issues.push('name');
  if (!(program.weekCount >= 1 && program.weekCount <= MAX_WEEKS)) issues.push('weeks');
  if (!trainingDays(program).length) issues.push('noDays');
  return issues;
}

/** Скільки сесій дасть призначення: тренувальні дні × тижні. */
export function sessionCount(program: TrainingProgram, weekCount: number): number {
  return trainingDays(program).length * clampWeeks(weekCount);
}

/**
 * «Оновити в учасників» (§5.4): тренер змінив програму ПІСЛЯ розгортання —
 * ревізія запису `training_programs` виросла понад `sourceRevision`
 * призначення.
 */
export function assignmentNeedsReexpand(assignment: TrainingAssignment, programRevision: number | null): boolean {
  if (assignment.status !== 'active' || programRevision === null) return false;
  return programRevision > (assignment.sourceRevision ?? 0);
}

// ── Міст «особисте → група» (§7.3) ─────────────────────────────────────────

export interface PersonalExercise {
  id: string;
  name: string;
  muscleGroup?: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
}

export interface PersonalProgram {
  id: string;
  name: string;
  color?: string;
  exerciseIds: string[];
  reminderDays?: number[];
}

export function exerciseFromPersonal(p: PersonalExercise, id: string): TrainingExercise {
  return {
    id,
    name: p.name,
    ...(p.muscleGroup ? { muscleGroup: p.muscleGroup } : {}),
    equipment: 'other',
    videoUrl: null,
    defaultSets: p.sets && p.sets > 0 ? p.sets : 3,
    defaultReps: p.reps && p.reps > 0 ? p.reps : 10,
    defaultRestSec: p.restSec && p.restSec > 0 ? p.restSec : 90,
    sourceExerciseId: p.id,
  };
}

/**
 * Особиста програма → групова: один тренувальний день на кожен день із
 * `reminderDays` (без нагадувань — понеділок), `weekCount = 4`, без
 * прогресії. `exerciseMap` — особистий id → id групової вправи; вправи без
 * відповідника пропускаються.
 */
export function programFromPersonal(
  p: PersonalProgram,
  id: string,
  exerciseMap: ReadonlyMap<string, TrainingExercise>,
  personal: ReadonlyMap<string, PersonalExercise>,
): TrainingProgram {
  const days = (p.reminderDays && p.reminderDays.length ? [...new Set(p.reminderDays)] : [1])
    .filter(d => d >= 0 && d <= 6)
    .sort((a, b) => a - b);
  const none: Progression = { mode: 'none' };
  const blocks: ProgramBlock[] = [];
  for (const exId of p.exerciseIds ?? []) {
    const group = exerciseMap.get(exId);
    if (!group) continue;
    const src = personal.get(exId);
    blocks.push({
      exerciseId: group.id,
      name: group.name,
      order: blocks.length + 1,
      sets: src?.sets && src.sets > 0 ? src.sets : 3,
      reps: src?.reps && src.reps > 0 ? src.reps : 10,
      weightG: src?.weightKg && src.weightKg > 0 ? Math.round(src.weightKg * 1000) : 0,
      restSec: src?.restSec ?? 90,
      durationSec: src?.durationSec ?? null,
      progression: none,
    });
  }
  return {
    id,
    name: p.name,
    color: p.color ?? '#0EA5E9',
    weekCount: 4,
    notes: '',
    days: days.map(dayOfWeek => ({ dayOfWeek, title: p.name, type: 'gym', estimatedMin: 60, blocks })),
  };
}

// ── Виконання для тренера (§10.1 «% виконання») ────────────────────────────

/**
 * Дати сесій призначення — те саме розгортання, що робить сервер (§5.2):
 * `sessionDate(start, w, dayOfWeek)` для кожного тренувального дня × тижня.
 * Тренер сесій учасника не бачить (вони особисті), тож «скільки мало бути»
 * рахується з програми й призначення.
 */
export function assignmentSessionDates(assignment: TrainingAssignment, program: TrainingProgram): string[] {
  const out: string[] = [];
  const days = trainingDays(program);
  for (let w = 0; w < clampWeeks(assignment.weekCount); w += 1) {
    for (const day of days) out.push(sessionDate(assignment.startDate, w, day.dayOfWeek));
  }
  return out.sort();
}

export interface CompletionStats {
  due: number;
  completed: number;
  /** 0…100 або null, коли ще нічого не мало відбутись. */
  percent: number | null;
}

/**
 * % виконання учасника: закриті (`completed`) заплановані логи до `today`
 * включно / сесії, що мали відбутись до `today`. Відкликані призначення не
 * рахуються: після відкликання майбутні сесії зникли в учасника, а дату
 * відкликання клієнт не знає — краще недорахувати, ніж штрафувати.
 */
export function completionFor(
  userId: number,
  assignments: readonly TrainingAssignment[],
  programs: ReadonlyMap<string, TrainingProgram>,
  logs: readonly { userId: number | string; status: string; date: string; sessionLocalId?: string | null }[],
  today: string,
): CompletionStats {
  let due = 0;
  for (const a of assignments) {
    if (Number(a.userId) !== userId || a.status === 'revoked') continue;
    const program = programs.get(a.programId);
    if (!program) continue;
    due += assignmentSessionDates(a, program).filter(d => d <= today).length;
  }
  const completed = logs.filter(l =>
    Number(l.userId) === userId && l.status === 'completed' && !!l.sessionLocalId && l.date <= today,
  ).length;
  const done = Math.min(completed, due);
  return { due, completed, percent: due ? Math.round((done / due) * 100) : null };
}
