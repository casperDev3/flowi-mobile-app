/**
 * utils/trainingQuests.ts — квести групи (training-module.md §3.4–§3.5).
 *
 * Два типи: `measurable` (автопрогрес, `quest_progress` пише СЕРВЕР — клієнт
 * отримав би `server_owned`) і `checkbox` (учасник закриває сам, фото
 * опційне). Метрики, що читають дані здоровʼя, позначені `health: true`:
 * тренер бачить лише агрегат «38 / 50», ніколи окремі записи (§2.4).
 */
import type { Quest, QuestMetric, QuestProgress } from './trainingTypes';

export interface MetricInfo {
  metric: QuestMetric;
  /** Ключ одиниці в словнику (`tgUnit…`). */
  unitKey: 'tgUnitSessions' | 'tgUnitMinutes' | 'tgUnitKm' | 'tgUnitKg' | 'tgUnitSteps' | 'tgUnitHours';
  labelKey:
    | 'tgMetricSessionCount' | 'tgMetricWorkoutMinutes' | 'tgMetricDistance' | 'tgMetricVolume'
    | 'tgMetricSteps' | 'tgMetricSleep' | 'tgMetricWeightDelta';
  health: boolean;
}

export const QUEST_METRICS: readonly MetricInfo[] = [
  { metric: 'session_count', unitKey: 'tgUnitSessions', labelKey: 'tgMetricSessionCount', health: false },
  { metric: 'workout_minutes', unitKey: 'tgUnitMinutes', labelKey: 'tgMetricWorkoutMinutes', health: false },
  { metric: 'workout_distance_km', unitKey: 'tgUnitKm', labelKey: 'tgMetricDistance', health: false },
  { metric: 'total_volume_kg', unitKey: 'tgUnitKg', labelKey: 'tgMetricVolume', health: false },
  { metric: 'steps', unitKey: 'tgUnitSteps', labelKey: 'tgMetricSteps', health: true },
  { metric: 'sleep_hours', unitKey: 'tgUnitHours', labelKey: 'tgMetricSleep', health: true },
  { metric: 'weight_delta_kg', unitKey: 'tgUnitKg', labelKey: 'tgMetricWeightDelta', health: true },
];

export function metricInfo(metric: string | undefined): MetricInfo | undefined {
  return QUEST_METRICS.find(m => m.metric === metric);
}

export function progressId(questId: string, userId: number): string {
  return `${questId}:${userId}`;
}

export function isQuestActive(q: Quest, today: string): boolean {
  if (q.archivedAt) return false;
  if (q.dueDate && q.dueDate < today) return false;
  return true;
}

/**
 * Чи стосується квест користувача: порожній `assigneeIds` — усім учасникам
 * (роль member), як `quest_assignee_ids` на сервері.
 */
export function isAssignedTo(q: Quest, userId: number, role: 'coach' | 'member' | null): boolean {
  const ids = Array.isArray(q.assigneeIds) ? q.assigneeIds : [];
  if (!ids.length) return role === 'member';
  return ids.map(Number).includes(userId);
}

/** 0…1 для прогрес-бару. Для «мінус вага» ціль може бути відʼємною. */
export function progressFraction(q: Quest, p: QuestProgress | null | undefined): number {
  if (p?.completed) return 1;
  if (q.type !== 'measurable') return 0;
  const target = Number(q.targetValue ?? p?.targetValue ?? 0);
  const current = Number(p?.currentValue ?? 0);
  if (!Number.isFinite(target) || target === 0) return 0;
  const f = current / target;
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

export function formatMetricValue(value: number | undefined | null): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Запис прогресу чек-квеста: ТІЛЬКИ агрегати, без полів здоровʼя (§2.4). */
export function checkboxProgress(
  quest: Quest,
  userId: number,
  completed: boolean,
  photoUri: string | null,
  now: string,
): QuestProgress {
  return {
    id: progressId(quest.id, userId),
    questId: quest.id,
    userId,
    completed,
    completedAt: completed ? now : null,
    photoUri: completed ? photoUri : null,
  };
}

export type QuestIssue = 'title' | 'metric' | 'target' | 'dates';

export function validateQuest(q: Quest): QuestIssue[] {
  const issues: QuestIssue[] = [];
  if (!q.title.trim()) issues.push('title');
  if (q.type === 'measurable') {
    if (!metricInfo(q.metric)) issues.push('metric');
    if (!(typeof q.targetValue === 'number' && Number.isFinite(q.targetValue) && q.targetValue !== 0)) issues.push('target');
  }
  if (q.startDate && q.dueDate && q.dueDate < q.startDate) issues.push('dates');
  return issues;
}

// ── Запрошення ─────────────────────────────────────────────────────────────

export interface ParsedTrainingInvite {
  token: string;
  ws: string | null;
  groupId: string | null;
}

/**
 * Посилання (`…/invite/training?ws=&g=&t=` або `ftrackingapp://training-invite?…`)
 * чи просто токен, вставлений руками. Токен — `secrets.token_urlsafe(32)`.
 */
export function parseTrainingInvite(input: string): ParsedTrainingInvite | null {
  const raw = input.trim();
  if (!raw) return null;
  const q = raw.indexOf('?');
  if (q >= 0) {
    const params = new Map<string, string>();
    for (const part of raw.slice(q + 1).split('#')[0].split('&')) {
      const eq = part.indexOf('=');
      if (eq <= 0) continue;
      try {
        params.set(part.slice(0, eq), decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' ')));
      } catch {
        return null;
      }
    }
    const token = params.get('t');
    if (!token) return null;
    return { token, ws: params.get('ws') ?? null, groupId: params.get('g') ?? null };
  }
  if (/^[A-Za-z0-9_-]{16,128}$/.test(raw)) return { token: raw, ws: null, groupId: null };
  return null;
}
