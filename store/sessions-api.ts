/**
 * store/sessions-api.ts — сесії акаунта і токени годинника
 * (docs/specs/watch-lockscreen-v1.md §5.3).
 *
 *   • GET    /auth/sessions/            — активні входи (поточний першим);
 *   • DELETE /auth/sessions/<id>/       — завершити чужу сесію (свою — лише «Вийти»);
 *   • POST   /auth/watch-session/       — окрема пара токенів для Apple Watch.
 *
 * Входи до появи сесій (токени без `sid`) сервер не показує — про них
 * `legacy_note` і рядок «Старіші входи тут не показані».
 */
import { apiFetch } from './api';

export type SessionKind = 'mobile' | 'web' | 'watch' | 'other';

export interface SessionOut {
  id: string;
  kind: SessionKind;
  platform: string;
  name: string;
  app_version: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
}

export interface WatchSessionOut {
  session: SessionOut;
  access: string;
  refresh: string;
}

const KINDS: readonly SessionKind[] = ['mobile', 'web', 'watch', 'other'];

/** Терплячий розбір рядка сесії: невідомий kind → 'other', биті рядки відкидаються. */
export function normalizeSession(raw: unknown): SessionOut | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id: r.id,
    kind: KINDS.includes(r.kind as SessionKind) ? (r.kind as SessionKind) : 'other',
    platform: text(r.platform),
    name: text(r.name),
    app_version: text(r.app_version),
    created_at: text(r.created_at),
    last_seen_at: text(r.last_seen_at),
    current: r.current === true,
  };
}

export async function listSessions(): Promise<SessionOut[]> {
  const data = await apiFetch<{ sessions?: unknown }>('/auth/sessions/');
  const rows = Array.isArray(data?.sessions) ? data.sessions : [];
  return rows.map(normalizeSession).filter((s): s is SessionOut => s !== null);
}

export async function revokeSession(id: string): Promise<void> {
  await apiFetch<void>(`/auth/sessions/${encodeURIComponent(id)}/`, { method: 'DELETE' });
}

export async function provisionWatchSession(watchId: string, deviceName = 'Apple Watch'): Promise<WatchSessionOut> {
  const data = await apiFetch<{ session?: unknown; access?: unknown; refresh?: unknown }>(
    '/auth/watch-session/',
    { method: 'POST', body: { watch_id: watchId, device_name: deviceName } },
  );
  const session = normalizeSession(data?.session);
  if (!session || typeof data.access !== 'string' || typeof data.refresh !== 'string') {
    throw new Error('watch-session: unexpected response shape');
  }
  return { session, access: data.access, refresh: data.refresh };
}
