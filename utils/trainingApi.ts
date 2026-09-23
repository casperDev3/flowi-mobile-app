/**
 * utils/trainingApi.ts — REST-обгортка модуля тренувань
 * (flowi-server-app/core/training_views.py, training-module.md §8).
 *
 * Тим самим стилем, що `store/project-team.ts`: `OfflineError` і `ApiError`
 * летять далі — екран сам вирішує, як показати конкретний код
 * (`last_coach`, `user_not_found`, `invite_expired`, …). Потік синку групи —
 * у `utils/trainingSync.ts`; тут лише разові дії.
 */
import { apiFetch, ApiError, OfflineError } from '@/store/api';

import type {
  AssignResult,
  LeaderboardResponse,
  MemberProgressResponse,
  TrainingAssignment,
  TrainingGroupRecord,
  TrainingGroupSummary,
  TrainingInvite,
  TrainingInvitePreview,
  TrainingMember,
  TrainingRole,
} from './trainingTypes';

const enc = encodeURIComponent;
const base = (groupId: string) => `/training-groups/${enc(groupId)}`;

// ── Групи ──────────────────────────────────────────────────────────────────

export async function listTrainingGroups(): Promise<TrainingGroupSummary[]> {
  const res = await apiFetch<{ results: TrainingGroupSummary[] }>('/training-groups/');
  return Array.isArray(res?.results) ? res.results : [];
}

export async function createTrainingGroup(id: string, data: TrainingGroupRecord): Promise<TrainingGroupSummary> {
  return apiFetch<TrainingGroupSummary>('/training-groups/', { method: 'POST', body: { id, data } });
}

export async function getTrainingGroup(groupId: string): Promise<TrainingGroupSummary> {
  return apiFetch<TrainingGroupSummary>(`${base(groupId)}/`);
}

export async function patchTrainingGroup(
  groupId: string,
  body: { timezone?: string; week_start?: 0 | 1 },
): Promise<TrainingGroupSummary> {
  return apiFetch<TrainingGroupSummary>(`${base(groupId)}/`, { method: 'PATCH', body });
}

export async function deleteTrainingGroup(groupId: string): Promise<void> {
  await apiFetch(`${base(groupId)}/`, { method: 'DELETE' });
}

export async function transferCoach(groupId: string, userId: number): Promise<TrainingGroupSummary> {
  return apiFetch<TrainingGroupSummary>(`${base(groupId)}/transfer-coach/`, { method: 'POST', body: { user_id: userId } });
}

// ── Учасники ───────────────────────────────────────────────────────────────

export async function listTrainingMembers(groupId: string): Promise<TrainingMember[]> {
  const res = await apiFetch<{ results: TrainingMember[] }>(`${base(groupId)}/members/`);
  return Array.isArray(res?.results) ? res.results : [];
}

export async function setTrainingMemberRole(groupId: string, userId: number, role: TrainingRole): Promise<TrainingMember> {
  return apiFetch<TrainingMember>(`${base(groupId)}/members/${userId}/`, { method: 'PATCH', body: { role } });
}

/** Тренер видаляє учасника або учасник виходить сам (userId == мій). */
export async function removeTrainingMember(groupId: string, userId: number): Promise<void> {
  await apiFetch(`${base(groupId)}/members/${userId}/`, { method: 'DELETE' });
}

export async function getMemberProgress(
  groupId: string,
  userId: number,
  range: { from?: string; to?: string } = {},
): Promise<MemberProgressResponse> {
  const q = [range.from ? `from=${enc(range.from)}` : '', range.to ? `to=${enc(range.to)}` : ''].filter(Boolean).join('&');
  return apiFetch<MemberProgressResponse>(`${base(groupId)}/members/${userId}/progress/${q ? `?${q}` : ''}`);
}

// ── Запрошення ─────────────────────────────────────────────────────────────

export async function listTrainingInvites(groupId: string): Promise<TrainingInvite[]> {
  const res = await apiFetch<{ results: TrainingInvite[] }>(`${base(groupId)}/invites/`);
  return Array.isArray(res?.results) ? res.results : [];
}

export async function createTrainingInviteLink(
  groupId: string,
  role: TrainingRole,
  expiresInHours: number,
  maxUses: number | null = null,
): Promise<TrainingInvite> {
  return apiFetch<TrainingInvite>(`${base(groupId)}/invites/`, {
    method: 'POST',
    body: { role, expires_in_hours: expiresInHours, max_uses: maxUses },
  });
}

export async function inviteTrainingMemberByEmail(
  groupId: string,
  role: TrainingRole,
  email: string,
): Promise<{ kind: 'member_added'; member: TrainingMember }> {
  return apiFetch(`${base(groupId)}/invites/`, { method: 'POST', body: { role, email: email.trim() } });
}

export async function revokeTrainingInvite(groupId: string, inviteId: string): Promise<void> {
  await apiFetch(`${base(groupId)}/invites/${enc(inviteId)}/`, { method: 'DELETE' });
}

export async function previewTrainingInvite(token: string): Promise<TrainingInvitePreview> {
  return apiFetch<TrainingInvitePreview>('/training-groups/invites/preview/', {
    method: 'POST', body: { token }, auth: false,
  });
}

export async function acceptTrainingInvite(token: string): Promise<{ group: TrainingGroupSummary; already_member: boolean }> {
  return apiFetch('/training-groups/invites/accept/', { method: 'POST', body: { token } });
}

// ── Призначення (§5) ───────────────────────────────────────────────────────

export async function assignProgram(
  groupId: string,
  programId: string,
  body: { user_ids: number[]; start_date: string; week_count: number },
): Promise<AssignResult[]> {
  const res = await apiFetch<{ results: AssignResult[] }>(
    `${base(groupId)}/programs/${enc(programId)}/assign/`,
    { method: 'POST', body },
  );
  return Array.isArray(res?.results) ? res.results : [];
}

export async function revokeAssignment(groupId: string, assignmentId: string): Promise<void> {
  await apiFetch(`${base(groupId)}/assignments/${enc(assignmentId)}/`, { method: 'DELETE' });
}

export async function reexpandAssignment(groupId: string, assignmentId: string): Promise<TrainingAssignment> {
  return apiFetch(`${base(groupId)}/assignments/${enc(assignmentId)}/reexpand/`, { method: 'POST' });
}

// ── Лідерборд, квести ──────────────────────────────────────────────────────

export async function getLeaderboard(
  groupId: string,
  period: 'week' | 'all',
  week?: string,
): Promise<LeaderboardResponse> {
  const q = `period=${period}${period === 'week' && week ? `&week=${enc(week)}` : ''}`;
  return apiFetch<LeaderboardResponse>(`${base(groupId)}/leaderboard/?${q}`);
}

export async function recomputeQuest(groupId: string, questId: string): Promise<{ completed_now: number[] }> {
  return apiFetch(`${base(groupId)}/quests/${enc(questId)}/recompute/`, { method: 'POST' });
}

// ── Помилки ────────────────────────────────────────────────────────────────

export function trainingErrorCode(error: unknown): string | null {
  if (error instanceof OfflineError) return 'offline';
  if (error instanceof ApiError) return error.code || null;
  return null;
}

export function isOffline(error: unknown): boolean {
  if (error instanceof OfflineError) return true;
  return error instanceof ApiError && (error.code === 'network' || error.code === 'timeout');
}
