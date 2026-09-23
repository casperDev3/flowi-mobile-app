/**
 * utils/trainingXp.ts — детерміновані формули модуля тренувань
 * (flowi-server-app/docs/specs/training-module.md §6).
 *
 * Дзеркало `flowi-server-app/core/training_xp.py` рядок у рядок; третє
 * дзеркало — `flowi-web-app/lib/training-xp.ts`. Паритет стереже спільна
 * фікстура (`__tests__/fixtures/training-xp-cases.json`, копія
 * `core/training_fixtures/training-xp-cases.json`).
 *
 * Усі проміжні величини — ЦІЛІ: вага в грамах, множник у базисних пунктах
 * (10000 == ×1.0), ділення лише `Math.floor` (як `//` у Python). Float дав
 * би розбіжності між мовами вже на третьому тижні прогресії.
 *
 * Клієнт НЕ є джерелом істини ні для XP, ні для прогресії: сесії приходять
 * уже розгорнутими сервером (§4.2), а XP рахує книга `TrainingXpEvent`. Тут
 * ці формули потрібні для прев'ю в редакторі програми («тиждень 1 / 4 / 8»)
 * і для офлайн-оцінки «+55 XP» до того, як сервер підтвердить нарахування.
 */

export const XP_SESSION_BASE = 50;
export const XP_SESSION_MIN = 10;
export const XP_SESSION_MAX = 200;
export const XP_QUEST_MIN = 10;
export const XP_QUEST_MAX = 300;
export const BASE_BP = 10000;
export const STREAK_STEP_DAYS = 3;
export const STREAK_STEP_BP = 1000;
export const STREAK_MAX_BP = 20000;
export const ROUND_G = 500;

export const PROGRESSION_MODES = ['none', 'linear_weight', 'linear_reps', 'percent'] as const;
export type ProgressionMode = (typeof PROGRESSION_MODES)[number];

export interface Progression {
  mode?: ProgressionMode | string;
  everyWeeks?: number;
  stepG?: number;
  capG?: number | null;
  stepReps?: number;
  capReps?: number | null;
  percentBp?: number;
}

export interface ProgressedBlockInput {
  weightG?: number | null;
  reps?: number | null;
  progression?: Progression | null;
}

/**
 * Ціле з довільного JSON-значення — копія `_int` із Python.
 *
 * Булеві — сміття (у Python `bool` підклас `int`, у JS `true * 2 == 2`; щоб
 * не покладатись на цей збіг, обидві сторони трактують їх як відсутні).
 * Дробові зрізаються до нуля (`Math.trunc` == `int(float)`).
 */
export function toInt(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || typeof value === 'boolean') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }
  return fallback;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// ── §6.1 XP ────────────────────────────────────────────────────────────────

export function multiplierBp(streakDaysBefore: unknown): number {
  const steps = Math.floor(Math.max(0, toInt(streakDaysBefore)) / STREAK_STEP_DAYS);
  return Math.min(BASE_BP + STREAK_STEP_BP * steps, STREAK_MAX_BP);
}

export function awardXp(baseXp: unknown, streakDaysBefore: unknown): number {
  return Math.floor((Math.max(0, toInt(baseXp)) * multiplierBp(streakDaysBefore)) / BASE_BP);
}

export interface XpRules {
  sessionBase?: number | string | null;
  questMin?: number | string | null;
  questMax?: number | string | null;
}

export function sessionBaseXp(xpRules: XpRules | null | undefined): number {
  const rules = xpRules && typeof xpRules === 'object' ? xpRules : {};
  const raw = rules.sessionBase;
  if (raw === null || raw === undefined) return XP_SESSION_BASE;
  return clamp(toInt(raw, XP_SESSION_BASE), XP_SESSION_MIN, XP_SESSION_MAX);
}

export function questBaseXp(xpReward: unknown, xpRules?: XpRules | null): number {
  const rules = xpRules && typeof xpRules === 'object' ? xpRules : {};
  let lo = clamp(toInt(rules.questMin, XP_QUEST_MIN), XP_QUEST_MIN, XP_QUEST_MAX);
  let hi = clamp(toInt(rules.questMax, XP_QUEST_MAX), XP_QUEST_MIN, XP_QUEST_MAX);
  if (hi < lo) [lo, hi] = [hi, lo];
  return clamp(toInt(xpReward, lo), lo, hi);
}

// ── §6.2 Стрік ─────────────────────────────────────────────────────────────
// Дні — рядки 'YYYY-MM-DD': лексикографічний порядок == хронологічний.

export function streakBefore(day: string, plannedDays: Iterable<string>, closedDays: Iterable<string>): number {
  const closed = new Set(closedDays);
  const planned = new Set([...plannedDays, ...closed]);
  const earlier = [...planned].filter(d => d < day).sort().reverse();
  let count = 0;
  for (const d of earlier) {
    if (!closed.has(d)) break;
    count += 1;
  }
  return count;
}

export function currentStreak(
  today: string,
  plannedDays: Iterable<string>,
  closedDays: Iterable<string>,
): { streak: number; lastDay: string | null } {
  const closed = new Set(closedDays);
  let streak = streakBefore(today, plannedDays, closed);
  if (closed.has(today)) streak += 1;
  const past = [...closed].filter(d => d <= today).sort();
  return { streak, lastDay: past.length ? past[past.length - 1] : null };
}

// ── §6.3 Прогресія навантаження ───────────────────────────────────────────

export function roundHalfUp(valueG: number, step: number = ROUND_G): number {
  return Math.floor((valueG + Math.floor(step / 2)) / step) * step;
}

/** `{weightG, reps}` блоку для тижня `weekIndex` (0-based). */
export function progressed(block: ProgressedBlockInput | null | undefined, weekIndex: unknown): { weightG: number; reps: number } {
  const b = block && typeof block === 'object' ? block : {};
  const p: Progression = b.progression && typeof b.progression === 'object' ? b.progression : {};
  const mode = p.mode || 'none';
  const every = Math.max(1, toInt(p.everyWeeks, 1));
  const k = Math.floor(Math.max(0, toInt(weekIndex)) / every);
  let weightG = toInt(b.weightG);
  let reps = toInt(b.reps);

  if (mode === 'linear_weight') {
    weightG += toInt(p.stepG) * k;
    if (p.capG !== null && p.capG !== undefined) weightG = Math.min(weightG, toInt(p.capG));
  } else if (mode === 'linear_reps') {
    reps += toInt(p.stepReps) * k;
    if (p.capReps !== null && p.capReps !== undefined) reps = Math.min(reps, toInt(p.capReps));
  } else if (mode === 'percent') {
    const pctBp = toInt(p.percentBp);
    for (let i = 0; i < k; i += 1) {
      weightG = roundHalfUp(Math.floor((weightG * (BASE_BP + pctBp)) / BASE_BP));
    }
    if (p.capG !== null && p.capG !== undefined) weightG = Math.min(weightG, toInt(p.capG));
  }
  return { weightG: Math.max(0, weightG), reps: Math.max(1, reps) };
}

// ── §5.2 Розгортання тижневого шаблону в дати ─────────────────────────────

function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function formatDay(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(day: string, n: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + n);
  return formatDay(date);
}

/** 0=Нд…6=Сб — нумерація `dayOfWeek` програми і `Date.getDay()`. */
export function jsWeekday(day: string): number {
  return parseDay(day).getUTCDay();
}

/** `start + 7*w + ((dayOfWeek − weekday(start)) mod 7)`. */
export function sessionDate(startDate: string, weekIndex: unknown, dayOfWeek: unknown): string {
  const offset = (((toInt(dayOfWeek) - jsWeekday(startDate)) % 7) + 7) % 7;
  return addDays(startDate, 7 * toInt(weekIndex) + offset);
}

export interface DayWithBlocks {
  dayOfWeek?: number;
  blocks?: unknown[];
}

/** Дні з непорожніми блоками, по одному на dayOfWeek (перший виграє), за порядком. */
export function trainingDays<T extends DayWithBlocks>(program: { days?: T[] } | null | undefined): T[] {
  const days = program && Array.isArray(program.days) ? program.days : [];
  const out = new Map<number, T>();
  for (const day of days) {
    // Паритет із сервером (isinstance(day, dict)) і вебом: масив — не день.
    if (!day || typeof day !== 'object' || Array.isArray(day)) continue;
    const dow = toInt(day.dayOfWeek, -1);
    if (dow < 0 || dow > 6 || out.has(dow)) continue;
    const blocks = day.blocks;
    if (!Array.isArray(blocks) || !blocks.some(b => !!b && typeof b === 'object' && !Array.isArray(b))) continue;
    out.set(dow, day);
  }
  return [...out.keys()].sort((a, b) => a - b).map(k => out.get(k) as T);
}

/** ISO-тиждень `YYYY-Www` для дати 'YYYY-MM-DD'. */
export function isoWeekLabel(day: string): string {
  const date = parseDay(day);
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Понеділок ISO-тижня, що містить `day`. */
export function isoWeekMonday(day: string): string {
  const dow = jsWeekday(day);
  return addDays(day, -((dow + 6) % 7));
}
