/**
 * components/containers/qr.ts — звідки наліпка і як резолвити скан по мережі.
 *
 * Адреса наліпки — веб ЦЬОГО workspace (`webUrl`, інакше origin сервера):
 * self-host друкує свій домен, не чужий (§6.1). Без workspace id наліпку не
 * друкуємо: той самий слаг у двох просторах відкрив би не ту коробку.
 */
import { ApiError, apiFetch, OfflineError } from '@/store/api';
import { getCachedWorkspace } from '@/store/api-config';

export function qrContext(): { origin: string; workspaceId: string | null } {
  const ws = getCachedWorkspace();
  return {
    origin: (ws?.webUrl || ws?.origin || '').replace(/\/+$/, ''),
    workspaceId: ws?.workspaceId ?? null,
  };
}

export type RemoteResolve =
  | { status: 'found'; containerId: string }
  | { status: 'not_found' }
  | { status: 'offline' };

/**
 * Один запит по слагу (§6.2 п.6): `GET /api/containers/resolve/?slug=` →
 * `{containerId}` або 404. «Не знайшли» і «не змогли подивитись» — різні
 * відповіді: мережева помилка — це `offline`, а не «нічого немає».
 */
export async function resolveSlugRemote(slug: string): Promise<RemoteResolve> {
  try {
    const body = await apiFetch<{ containerId?: string }>(`/containers/resolve/?slug=${encodeURIComponent(slug)}`);
    return body?.containerId ? { status: 'found', containerId: body.containerId } : { status: 'not_found' };
  } catch (e) {
    if (e instanceof OfflineError) return { status: 'offline' };
    if (e instanceof ApiError && e.status === 404) return { status: 'not_found' };
    return { status: 'offline' };
  }
}
