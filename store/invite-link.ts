/**
 * store/invite-link.ts — deep link `ftrackingapp://invite?...` (WORKSPACE_PROJECTS_PLAN.md
 * §4, контракт §4.3).
 *
 * Парсинг і сховище `pending_invite` (контракт §9.1) живуть окремо від
 * `app/invite.tsx`: сам екран лише читає параметри й малює UI, а розбір
 * посилання й довготривала памʼять «інвайт до входу» — чиста утиліта, яку
 * можна перевірити тестом без рендера.
 *
 * Формат (усі параметри `encodeURIComponent`, контракт §4.3):
 *   ftrackingapp://invite?ws=<origin>&p=<project_id>&t=<token>
 * `ws` — нормалізований origin workspace (без `/api`), як його віддає
 * `normalizeWorkspaceOrigin()` (store/workspace.ts).
 */
import { loadData, saveData } from './storage';

export interface ParsedInviteLink {
  ws: string;
  projectId: string;
  token: string;
}

/** Розбирає deep link АБО веб-URL запрошення. null — не запрошення (чи биті параметри). */
export function parseInviteLink(url: string): ParsedInviteLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Deep link: ftrackingapp://invite?... (host === 'invite', бо схема — не http/https).
  // Веб-URL: https://.../invite?... (pathname === '/invite').
  const isDeepLink = parsed.protocol === 'ftrackingapp:' && (parsed.hostname === 'invite' || parsed.pathname.replace(/^\/+/, '') === 'invite');
  const isWebLink = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.pathname.replace(/\/+$/, '') === '/invite';
  if (!isDeepLink && !isWebLink) return null;

  const ws = parsed.searchParams.get('ws');
  const projectId = parsed.searchParams.get('p');
  const token = parsed.searchParams.get('t');
  if (!ws || !projectId || !token) return null;
  return { ws, projectId, token };
}

// ─── `pending_invite` (контракт §9.1) ────────────────────────────────────────
const PENDING_INVITE_KEY = 'pending_invite';

export interface PendingInvite {
  ws: string;
  projectId: string;
  token: string;
  receivedAt: number;
}

export async function getPendingInvite(): Promise<PendingInvite | null> {
  return loadData<PendingInvite | null>(PENDING_INVITE_KEY, null);
}

export async function setPendingInvite(link: ParsedInviteLink): Promise<void> {
  const pending: PendingInvite = { ...link, receivedAt: Date.now() };
  await saveData(PENDING_INVITE_KEY, pending);
}

export async function clearPendingInvite(): Promise<void> {
  await saveData(PENDING_INVITE_KEY, null);
}
