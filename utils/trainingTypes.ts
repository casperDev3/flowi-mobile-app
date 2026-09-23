/**
 * utils/trainingTypes.ts — форми записів модуля тренувань
 * (flowi-server-app/docs/specs/training-module.md §3–§4, §8).
 *
 * Усі поля, яких могло не бути в ранніх записах, — опційні: записи
 * приходять синком як голий JSON, і клієнт мусить читати будь-який з них.
 * Вага — завжди ЦІЛІ грами (`weightG`), ніколи кілограми у float (§3.3).
 */
import type { Progression, XpRules } from './trainingXp';

export type TrainingRole = 'coach' | 'member';

export interface TrainingPerson {
  id: number;
  name: string;
  email: string;
}

/** `GET /training-groups/` — рядок списку груп. */
export interface TrainingGroupSummary {
  id: string;
  name: string;
  color: string;
  description?: string;
  timezone: string;
  week_start: number;
  role: TrainingRole;
  coach: TrainingPerson | null;
  member_count: number;
  cursor: number;
  xp_total: number;
  streak_days: number;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
}

// ── Записи групового потоку (§3) ───────────────────────────────────────────

export interface TrainingGroupRecord {
  id: string;
  name?: string;
  color?: string;
  description?: string;
  timezone?: string;
  weekStart?: number;
  xpRules?: XpRules;
  archivedAt?: string | null;
  updatedAt?: string;
}

export type EquipmentKind = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio' | 'other';

export interface TrainingExercise {
  id: string;
  name: string;
  muscleGroup?: string;
  equipment?: EquipmentKind | string;
  videoUrl?: string | null;
  defaultSets?: number;
  defaultReps?: number;
  defaultRestSec?: number;
  sourceExerciseId?: string;
  updatedAt?: string;
}

export interface ProgramBlock {
  exerciseId: string;
  /** Знімок назви на випадок, якщо вправу потім видалять з бібліотеки. */
  name?: string;
  order: number;
  sets: number;
  reps: number;
  weightG: number;
  restSec?: number | null;
  durationSec?: number | null;
  progression?: Progression;
}

export type SessionType = 'gym' | 'run' | 'bike' | 'swim' | 'yoga' | 'walk' | 'other';

export interface ProgramDay {
  /** 0=Нд…6=Сб — як `WorkoutProgram.reminderDays`. */
  dayOfWeek: number;
  title?: string;
  type?: SessionType | string;
  estimatedMin?: number | null;
  blocks: ProgramBlock[];
}

export interface TrainingProgram {
  id: string;
  name: string;
  color?: string;
  weekCount: number;
  notes?: string;
  days: ProgramDay[];
  updatedAt?: string;
}

export type AssignmentStatus = 'active' | 'completed' | 'revoked';

/** Дзеркало `TrainingProgramAssignment`, пише лише сервер. */
export interface TrainingAssignment {
  id: string;
  groupId?: string;
  programId: string;
  programName?: string;
  userId: number;
  assignedBy?: number | null;
  startDate: string;
  weekCount: number;
  status: AssignmentStatus;
  expandedAt?: string | null;
  sourceRevision?: number | null;
  sessionCount?: number;
  updatedAt?: string;
}

export type QuestType = 'measurable' | 'checkbox';

export type QuestMetric =
  | 'session_count'
  | 'workout_minutes'
  | 'workout_distance_km'
  | 'total_volume_kg'
  | 'steps'
  | 'sleep_hours'
  | 'weight_delta_kg';

export interface Quest {
  id: string;
  type: QuestType;
  title: string;
  description?: string;
  metric?: QuestMetric;
  targetValue?: number;
  unit?: string;
  startDate?: string | null;
  dueDate?: string | null;
  xpReward?: number;
  assigneeIds?: number[];
  photoRequired?: boolean;
  archivedAt?: string | null;
  updatedAt?: string;
}

export interface QuestProgress {
  /** `${questId}:${userId}` — похідний, щоб два пристрої злились в один. */
  id: string;
  questId: string;
  userId: number;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  completed: boolean;
  completedAt?: string | null;
  /** Лише локальний шлях (відкрите питання §11.5): тренер фото не бачить. */
  photoUri?: string | null;
  computedAt?: string;
  updatedAt?: string;
}

export interface LogSet {
  setIndex: number;
  reps: number;
  weightG: number;
  rpe?: number | null;
  done: boolean;
}

export interface LogExercise {
  exerciseId: string;
  name: string;
  sets: LogSet[];
}

export type LogStatus = 'completed' | 'partial' | 'skipped';

export interface WorkoutLog {
  id: string;
  userId: number;
  groupId?: string;
  sessionLocalId?: string | null;
  assignmentId?: string | null;
  programId?: string | null;
  title?: string;
  date: string;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMin?: number;
  status: LogStatus;
  exercises: LogExercise[];
  totalVolumeG?: number;
  memberNote?: string | null;
  coachNote?: string | null;
  xpAwarded?: number;
  updatedAt?: string;
}

export interface TrainingComment {
  id: string;
  authorId: number | string;
  targetType: 'workout_log' | 'quest' | 'program';
  targetId: string;
  body: string;
  mentions?: number[];
  createdAt?: string;
  updatedAt?: string;
}

// ── Персональний потік: training_sessions (§4.2) ───────────────────────────

export type SessionStatus = 'planned' | 'completed' | 'partial' | 'skipped' | 'missed';

export interface PlannedExercise {
  exerciseId: string;
  name: string;
  order: number;
  sets: number | null;
  reps: number;
  weightG: number;
  restSec?: number | null;
  durationSec?: number | null;
}

export interface SessionActual {
  startedAt?: string | null;
  completedAt?: string | null;
  durationMin?: number;
  exercises: LogExercise[];
  totalVolumeG?: number;
  memberNote?: string | null;
  calories?: number | null;
}

export interface TrainingSession {
  id: string;
  groupId: string;
  groupName?: string;
  assignmentId?: string;
  programId?: string;
  programName?: string;
  weekIndex?: number;
  dayOfWeek?: number;
  date: string;
  title?: string;
  type?: SessionType | string;
  estimatedMin?: number | null;
  status: SessionStatus;
  plannedExercises: PlannedExercise[];
  actual?: SessionActual | null;
  logLocalId?: string | null;
  workoutLocalId?: string | null;
  xpAwarded?: number;
  sourceRevision?: number;
  updatedAt?: string;
}

// ── REST-відповіді (§8) ────────────────────────────────────────────────────

export interface TrainingMember {
  user: TrainingPerson;
  role: TrainingRole;
  joined_at: string;
  invited_by: TrainingPerson | null;
  xp_total: number;
  streak_days: number;
  streak_last_day: string | null;
}

export interface TrainingInvite {
  id: string;
  role: TrainingRole;
  expires_at: string;
  max_uses: number | null;
  uses: number;
  created_at: string;
  created_by: TrainingPerson | null;
  token?: string;
  url?: string;
  deep_link?: string;
}

export interface TrainingInvitePreview {
  workspace: { id: string; name: string };
  group: { id: string; name: string; color: string };
  role: TrainingRole;
  invited_by: { name: string } | null;
  expires_at: string;
}

export interface LeaderboardRow {
  rank: number;
  user: TrainingPerson;
  role?: TrainingRole;
  xp: number;
  sessions: number;
  quests: number;
  streak_days: number;
  is_me: boolean;
}

export interface LeaderboardResponse {
  period: 'week' | 'all';
  week?: string;
  from?: string;
  to?: string;
  results: LeaderboardRow[];
  me: { rank: number; xp: number } | null;
}

export interface XpEventOut {
  kind: 'session' | 'quest';
  source_local_id: string;
  occurred_on: string;
  base_xp: number;
  multiplier_bp: number;
  xp: number;
}

export interface MemberProgressResponse {
  member: TrainingMember;
  workout_logs: { local_id: string; revision: number; data: WorkoutLog }[];
  quest_progress: { local_id: string; data: QuestProgress }[];
  xp_events: XpEventOut[];
}

export interface AssignResult {
  id?: string;
  user_id: number;
  program_id?: string;
  start_date?: string;
  week_count?: number;
  status?: AssignmentStatus;
  session_count?: number;
  already_assigned?: boolean;
  error?: string;
}
