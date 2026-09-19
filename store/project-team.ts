/**
 * store/project-team.ts — команда проєкту (WORKSPACE_PROJECTS_PLAN.md §4,
 * контракт §4.2–4.3): учасники, ролі, запрошення.
 *
 * REST-обгортка навколо `apiFetch`, тим самим стилем, що й
 * `store/project-sync.ts` (§3): кожен виклик мовчки ковтає `OfflineError`
 * (команда — це те, що можна лише переглядати офлайн з кешу; змінювати роль/
 * запрошувати без мережі сенсу нема) і кидає `ApiError` далі — екран сам
 * вирішує, як показати конкретний код (contract §4.2/§4.3).
 *
 * Кеш `project_members_v1` (контракт §9.1) — лише читання імен для
 * @згадок/підписів у майбутньому; список у самому екрані Учасників завжди
 * читає мережу заново (роль/склад команди мусить бути точним, а не тим, що
 * лежало в кеші хвилину тому).
 */
import { apiFetch, ApiError, OfflineError } from './api';
import { loadData, saveData } from './storage';
import type { ProjectRole } from '@/constants/projectNav';

// ─── Типи (контракт §4.2–4.3) ────────────────────────────────────────────────
export interface TeamUserRef {
  id: number;
  name: string;
  email: string;
}

export interface MemberOut {
  user: TeamUserRef;
  role: ProjectRole;
  joined_at: string;
  invited_by: TeamUserRef | null;
}

export interface InviteOut {
  id: string;
  role: 'member' | 'viewer';
  expires_at: string;
  max_uses: number | null;
  uses: number;
  created_at: string;
  created_by: { id: number; name: string };
  /** Лише у відповіді POST — контракт §4.3. */
  token?: string;
  url?: string;
  deep_link?: string;
}

export interface InvitePreview {
  workspace: { id: string; name: string };
  project: { id: string; name: string; color: string };
  role: 'member' | 'viewer';
  invited_by: { name: string };
  expires_at: string;
}

const MEMBERS_CACHE_KEY = 'project_members_v1';

async function getMembersCache(): Promise<Record<string, MemberOut[]>> {
  return loadData<Record<string, MemberOut[]>>(MEMBERS_CACHE_KEY, {});
}

/**
 * Експортовано (review finding): екран Учасників сам знає точний результат
 * `changeMemberRole`/`removeProjectMember` (відповідь мутації чи локальний
 * фільтр) БЕЗ додаткового мережевого `fetchProjectMembers` — навіщо ще один
 * запит, коли зміна вже на руках. Без цього кеш лишався застарілим до
 * наступного відкриття екрана Учасників, і пікер виконавця бачив стару роль/
 * видаленого учасника.
 */
export async function setMembersCacheFor(projectId: string, members: MemberOut[]): Promise<void> {
  const cache = await getMembersCache();
  await saveData(MEMBERS_CACHE_KEY, { ...cache, [projectId]: members });
}

/** Кешовані учасники — для миттєвого рендера, поки мережевий список ще в польоті. */
export async function getCachedMembers(projectId: string): Promise<MemberOut[]> {
  const cache = await getMembersCache();
  return cache[projectId] ?? [];
}

// ─── Учасники (§4.2) ──────────────────────────────────────────────────────────

/** GET /projects/{id}/members/ — оновлює кеш. */
export async function fetchProjectMembers(projectId: string): Promise<MemberOut[]> {
  const res = await apiFetch<{ results: MemberOut[] }>(`/projects/${encodeURIComponent(projectId)}/members/`);
  const list = Array.isArray(res.results) ? res.results : [];
  await setMembersCacheFor(projectId, list);
  return list;
}

/** PATCH /projects/{id}/members/{userId}/ — власник змінює роль (member↔viewer). */
export async function changeMemberRole(
  projectId: string,
  userId: number,
  role: 'member' | 'viewer',
): Promise<MemberOut> {
  return apiFetch<MemberOut>(`/projects/${encodeURIComponent(projectId)}/members/${userId}/`, {
    method: 'PATCH',
    body: { role },
  });
}

/**
 * DELETE /projects/{id}/members/{userId}/ — власник видаляє будь-кого (крім
 * себе), або сам учасник виходить (userId == власний). `409 owner_cannot_leave`
 * — власник спершу мусить передати власність (`transferProjectOwnership`).
 */
export async function removeProjectMember(projectId: string, userId: number): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/members/${userId}/`, { method: 'DELETE' });
}

/** POST /projects/{id}/transfer-ownership/ (§3.2) — передати власність іншому учаснику. */
export async function transferProjectOwnership(projectId: string, userId: number): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/transfer-ownership/`, {
    method: 'POST',
    body: { user_id: userId },
  });
}

// ─── Запрошення (§4.3) ────────────────────────────────────────────────────────

/**
 * POST /projects/{id}/invites/ — посилання: роль + термін дії (1–720 год) +
 * опційний ліміт використань. Токен/url/deep_link приходять ЛИШЕ в цій
 * відповіді (контракт §4.3) — власник мусить одразу поділитись, повторний
 * `GET /invites/` їх більше не покаже.
 */
export async function createInviteLink(
  projectId: string,
  role: 'member' | 'viewer',
  expiresInHours: number,
  maxUses: number | null = null,
): Promise<InviteOut> {
  return apiFetch<InviteOut>(`/projects/${encodeURIComponent(projectId)}/invites/`, {
    method: 'POST',
    body: { role, expires_in_hours: expiresInHours, max_uses: maxUses },
  });
}

export type InviteByEmailResult =
  | { kind: 'member_added'; member: MemberOut };

/** POST /projects/{id}/invites/ з email — акаунт уже існує, додається одразу. */
export async function inviteByEmail(
  projectId: string,
  role: 'member' | 'viewer',
  email: string,
): Promise<InviteByEmailResult> {
  return apiFetch<InviteByEmailResult>(`/projects/${encodeURIComponent(projectId)}/invites/`, {
    method: 'POST',
    body: { role, email: email.trim() },
  });
}

/** GET /projects/{id}/invites/ — активні посилання (без token/url — лише список для керування). */
export async function listProjectInvites(projectId: string): Promise<InviteOut[]> {
  const res = await apiFetch<{ results: InviteOut[] }>(`/projects/${encodeURIComponent(projectId)}/invites/`);
  return Array.isArray(res.results) ? res.results : [];
}

/** DELETE /projects/{id}/invites/{inviteId}/ — відкликати посилання. */
export async function revokeProjectInvite(projectId: string, inviteId: string): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/invites/${encodeURIComponent(inviteId)}/`, { method: 'DELETE' });
}

/**
 * POST /invites/preview/ — public, але викликається на АКТИВНОМУ workspace
 * (той, куди щойно перейшли за `ws=` з посилання, §4.3 обробка (a)/(b)):
 * `apiFetch` сам бере поточний `getApiBase()`. Помилки: `404 invite_invalid`,
 * `410 invite_expired` — екран `/invite` показує їх текстом, не кидає далі.
 */
export async function previewInvite(token: string): Promise<InvitePreview> {
  return apiFetch<InvitePreview>('/invites/preview/', { method: 'POST', body: { token }, auth: false });
}

/** POST /invites/accept/ — auth, той самий workspace, що й у токені. */
export async function acceptInvite(token: string): Promise<{ project: unknown; already_member: boolean }> {
  return apiFetch('/invites/accept/', { method: 'POST', body: { token } });
}

/** Людський opис причини помилки — спільний для екрана Учасників і /invite. */
export function teamErrorDetail(error: unknown): string | null {
  if (error instanceof ApiError) return error.message || error.code;
  if (error instanceof OfflineError) return null; // викликач сам вирішує offline-текст
  return null;
}
