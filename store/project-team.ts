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

export type InviteKind = 'link' | 'email';
export type EmailInviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface InviteOut {
  id: string;
  /** Сервер до decision 7 поля не віддавав — відсутнє = 'link'. */
  kind?: InviteKind;
  role: 'manager' | 'member' | 'viewer';
  expires_at: string;
  max_uses: number | null;
  uses: number;
  created_at: string;
  created_by: { id: number; name: string };
  /** Лише у відповіді POST — контракт §4.3. */
  token?: string;
  url?: string;
  deep_link?: string;
  // ── лише kind='email' (іменне запрошення, що чекає «Прийняти/Відхилити») ──
  email?: string;
  status?: EmailInviteStatus;
  account_exists?: boolean;
  invitee?: TeamUserRef | null;
  send_count?: number;
  last_sent_at?: string | null;
  email_sent?: boolean;
  responded_at?: string | null;
  /** Лише в списку `pending` GET /invites/. */
  expired?: boolean;
}

export interface InvitePreview {
  workspace: { id: string; name: string };
  project: { id: string; name: string; color: string };
  kind?: InviteKind;
  role: 'manager' | 'member' | 'viewer';
  invited_by: { name: string } | null;
  expires_at: string;
  /** Маска адреси іменного запрошення (`t***@domain`). */
  email_hint?: string;
  /** Invite API v2 §2 — лише коли прев'ю запитано з токеном (сервер ігнорує битий токен). */
  authenticated?: boolean;
  /** Поточний користувач уже в проєкті — показати «Ви вже в цьому проєкті». */
  already_member?: boolean;
  /** ПОТОЧНА роль користувача в проєкті (роль запрошення лишається в `role`). */
  member_role?: 'owner' | 'manager' | 'member' | 'viewer' | null;
  /** Лише email-запрошення: адресоване цьому акаунту? null — анонімно. */
  for_current_user?: boolean | null;
}

/**
 * Причина `410 invite_expired` (сервер додає `reason`, старі сервери — ні).
 * `unknown` — 410 без причини: показуємо загальне «Термін дії сплив».
 */
export type InviteDeadReason =
  | 'expired' | 'used_up' | 'revoked' | 'cancelled' | 'accepted' | 'declined' | 'project_deleted' | 'unknown';

/** Розбирає помилку прев'ю/прийняття в стабільний код для екрана. */
export type InviteFailure =
  | { kind: 'dead'; reason: InviteDeadReason }
  | { kind: 'invalid' }
  | { kind: 'wrong_account' }
  | { kind: 'offline' }
  | { kind: 'other'; message: string | null };

const DEAD_REASONS: readonly InviteDeadReason[] = ['expired', 'used_up', 'revoked', 'cancelled', 'accepted', 'declined', 'project_deleted'];

export function classifyInviteError(error: unknown): InviteFailure {
  if (error instanceof OfflineError) return { kind: 'offline' };
  if (error instanceof ApiError) {
    if (error.status === 410 || error.code === 'invite_expired') {
      const raw = typeof error.details?.reason === 'string' ? (error.details.reason as string) : '';
      const reason = (DEAD_REASONS as readonly string[]).includes(raw) ? (raw as InviteDeadReason) : 'unknown';
      return { kind: 'dead', reason };
    }
    if (error.code === 'invite_wrong_account') return { kind: 'wrong_account' };
    if (error.status === 404 || error.code === 'invite_invalid') return { kind: 'invalid' };
    return { kind: 'other', message: error.message || null };
  }
  return { kind: 'other', message: null };
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
  role: 'manager' | 'member' | 'viewer',
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
export async function removeProjectMember(projectId: string, userId: number, replacementId?: number): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/members/${userId}/`, { method: 'DELETE', body: replacementId ? {replacement_id:replacementId}:undefined });
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
  role: 'manager' | 'member' | 'viewer',
  expiresInHours: number,
  maxUses: number | null = null,
): Promise<InviteOut> {
  return apiFetch<InviteOut>(`/projects/${encodeURIComponent(projectId)}/invites/`, {
    method: 'POST',
    body: { role, expires_in_hours: expiresInHours, max_uses: maxUses },
  });
}

/**
 * Відповідь на запрошення поштою (decision 7): людину НЕ додано одразу —
 * створено іменне запрошення, що чекає «Прийняти/Відхилити». Лист сервер
 * шле лише з налаштованим SMTP (`email_configured`), тож `email_sent`
 * чесно каже, чи пішов лист.
 */
export interface InviteByEmailResult {
  kind: 'invite_pending';
  invite: InviteOut;
  already_pending: boolean;
  account_exists: boolean;
  notified: boolean;
  email_sent: boolean;
  email_configured: boolean;
}

/**
 * POST /projects/{id}/invites/ з email — іменне запрошення (для будь-якої адреси).
 * `flow: 'pending'` — сигнал серверу, що цей клієнт знає pending-запрошення:
 * без нього мобільний клієнт ≤ 1.2.0 вважається старим і отримує легасі-
 * гілку «додати одразу» (див. invite-api-v2, core/team_views.py).
 */
export async function inviteByEmail(
  projectId: string,
  role: 'manager' | 'member' | 'viewer',
  email: string,
): Promise<InviteByEmailResult> {
  return apiFetch<InviteByEmailResult>(`/projects/${encodeURIComponent(projectId)}/invites/`, {
    method: 'POST',
    body: { role, email: email.trim(), flow: 'pending' },
  });
}

export interface ProjectInvitesState {
  /** Активні посилання. */
  links: InviteOut[];
  /** Іменні запрошення поштою, що чекають відповіді («Очікують»). */
  pending: InviteOut[];
  emailConfigured: boolean;
}

/** GET /projects/{id}/invites/ — посилання + «Очікують» + чи налаштована пошта. */
export async function loadProjectInvites(projectId: string): Promise<ProjectInvitesState> {
  const res = await apiFetch<{ results?: InviteOut[]; pending?: InviteOut[]; email_configured?: boolean }>(
    `/projects/${encodeURIComponent(projectId)}/invites/`,
  );
  return {
    links: Array.isArray(res.results) ? res.results.filter(i => (i.kind ?? 'link') === 'link') : [],
    pending: Array.isArray(res.pending) ? res.pending : [],
    emailConfigured: res.email_configured === true,
  };
}

export interface ResendInviteResult {
  invite: InviteOut;
  account_exists: boolean;
  notified: boolean;
  email_sent: boolean;
  email_configured: boolean;
}

/** POST /projects/{id}/invites/{inviteId}/resend/ — нове сповіщення щоразу (кулдаун 60 с → 429). */
export async function resendProjectInvite(projectId: string, inviteId: string): Promise<ResendInviteResult> {
  return apiFetch<ResendInviteResult>(
    `/projects/${encodeURIComponent(projectId)}/invites/${encodeURIComponent(inviteId)}/resend/`,
    { method: 'POST' },
  );
}

/** GET /projects/{id}/invites/ — активні посилання (без token/url — лише список для керування). */
export async function listProjectInvites(projectId: string): Promise<InviteOut[]> {
  const res = await apiFetch<{ results: InviteOut[] }>(`/projects/${encodeURIComponent(projectId)}/invites/`);
  return Array.isArray(res.results) ? res.results : [];
}

/** DELETE /projects/{id}/invites/{inviteId}/ — відкликати посилання / скасувати запрошення поштою. */
export async function revokeProjectInvite(projectId: string, inviteId: string): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/invites/${encodeURIComponent(inviteId)}/`, { method: 'DELETE' });
}

/**
 * POST /invites/preview/ — public, але викликається на АКТИВНОМУ workspace
 * (той, куди щойно перейшли за `ws=` з посилання, §4.3 обробка (a)/(b)):
 * `apiFetch` сам бере поточний `getApiBase()`. Помилки: `404 invite_invalid`,
 * `410 invite_expired` — екран `/invite` показує їх текстом, не кидає далі.
 */
export async function previewInvite(token: string, opts: { withAuth?: boolean } = {}): Promise<InvitePreview> {
  // `withAuth` (Invite API v2 §2): токен необов'язковий і сервер НІКОЛИ не
  // відповідає 401 на прев'ю, тож автентифікований виклик безпечний — зате
  // сервер скаже `already_member` для власного проєкту.
  return apiFetch<InvitePreview>('/invites/preview/', { method: 'POST', body: { token }, auth: !!opts.withAuth });
}

/**
 * 410 `invite_expired` для автентифікованого учасника (Invite API v2 §2):
 * сервер додає `already_member: true` і `project` — запрошення мертве, але
 * людина вже в проєкті, тож показуємо «Ви вже в цьому проєкті», а не помилку.
 */
export function alreadyMemberFromInviteError(
  error: unknown,
): { project: { id: string; name: string; color: string } | null; memberRole: InvitePreview['member_role'] } | null {
  if (!(error instanceof ApiError) || error.details?.already_member !== true) return null;
  const raw = error.details.project as { id?: unknown; name?: unknown; color?: unknown } | undefined;
  const project = raw && typeof raw.id === 'string'
    ? { id: raw.id, name: typeof raw.name === 'string' ? raw.name : '', color: typeof raw.color === 'string' ? raw.color : '' }
    : null;
  const role = error.details.member_role;
  return {
    project,
    memberRole: role === 'owner' || role === 'manager' || role === 'member' || role === 'viewer' ? role : null,
  };
}

/** POST /invites/accept/ — auth, той самий workspace, що й у токені. */
export async function acceptInvite(token: string): Promise<{ project: unknown; already_member: boolean }> {
  return apiFetch('/invites/accept/', { method: 'POST', body: { token } });
}

// ─── Мої запрошення (той, кого запросили поштою) ──────────────────────────────

export interface MyInvite {
  id: string;
  kind: 'email';
  status: EmailInviteStatus;
  role: 'manager' | 'member' | 'viewer';
  email: string;
  project: { id: string; name: string; color: string };
  invited_by: { id: number; name: string } | null;
  created_at: string;
  last_sent_at: string | null;
  expires_at: string;
}

/**
 * GET /invites/mine/ — запрошення, що чекають МОЄЇ відповіді. Побічно сервер
 * «прив'язує» запрошення, надіслані на мою пошту до появи акаунта, і створює
 * їм сповіщення — тому кличемо після входу/старту застосунку.
 */
export async function fetchMyInvites(): Promise<MyInvite[]> {
  const res = await apiFetch<{ results?: MyInvite[] }>('/invites/mine/');
  return Array.isArray(res.results) ? res.results : [];
}

/** POST /invites/{id}/accept/ — ідемпотентно. */
export async function acceptPendingInvite(inviteId: string): Promise<{ project: { id: string; name?: string } | null; already_member: boolean }> {
  return apiFetch(`/invites/${encodeURIComponent(inviteId)}/accept/`, { method: 'POST' });
}

/** POST /invites/{id}/decline/ — ідемпотентно. */
export async function declinePendingInvite(inviteId: string): Promise<void> {
  await apiFetch(`/invites/${encodeURIComponent(inviteId)}/decline/`, { method: 'POST' });
}

/** Людський opис причини помилки — спільний для екрана Учасників і /invite. */
export function teamErrorDetail(error: unknown): string | null {
  if (error instanceof ApiError) return error.message || error.code;
  if (error instanceof OfflineError) return null; // викликач сам вирішує offline-текст
  return null;
}
