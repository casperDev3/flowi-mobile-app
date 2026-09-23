/**
 * store/training-socket.ts — живі сигнали груп тренувань
 * (flowi-server-app/docs/specs/training-module.md §2.5).
 *
 *  - `ws/training-group/{id}/` — канал однієї групи: `sync_changed`,
 *    `xp_changed`, `members_changed`, `access_revoked` (+ close 4403),
 *    `group_deleted`. Сокет лише СИГНАЛИТЬ: даних не несе, у відповідь екран
 *    робить звичайний `syncGroup` (utils/trainingSync.ts).
 *  - `training_groups_changed` на `ws/user/` — членство в групах змінилось;
 *    той самий принцип, що `projects_changed`. Приходить через сокет
 *    особистого синку (store/sync-engine.tsx), який лише викликає
 *    `emitTrainingGroupsChanged()`.
 *
 * Сокет групи відкривається, лише поки екран групи змонтований
 * (`useGroupStream`): груп на людину одиниці, а постійний сокет на кожну —
 * марна батарея. Решту часу працює синк на фокусі.
 */
import { getFreshAccessToken, refreshSession } from './api';
import { getWorkspaceIncompatibility, getWsBase } from './api-config';
import { isOnlineMode } from './app-mode';

export type TrainingSocketSignal =
  | { type: 'sync_changed' | 'xp_changed' | 'members_changed'; groupId: string }
  | { type: 'gone'; groupId: string; reason: 'access_revoked' | 'group_deleted' | 'closed_4403' | 'closed_4404' };

const RESYNC_TYPES = new Set(['sync_changed', 'xp_changed', 'members_changed']);

/** Розбір одного повідомлення каналу групи. Чиста функція — для тестів. */
export function parseTrainingSocketMessage(groupId: string, raw: unknown): TrainingSocketSignal | null {
  if (typeof raw !== 'string') return null;
  let msg: { type?: unknown };
  try {
    msg = JSON.parse(raw) as { type?: unknown };
  } catch {
    return null;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return null;
  if (RESYNC_TYPES.has(msg.type)) {
    return { type: msg.type as 'sync_changed' | 'xp_changed' | 'members_changed', groupId };
  }
  if (msg.type === 'access_revoked' || msg.type === 'group_deleted') {
    return { type: 'gone', groupId, reason: msg.type };
  }
  return null;
}

/**
 * Відкрити сокет групи й тримати його живим до виклику повернутої функції.
 * Перепідключення з експоненційною паузою (до 30 с); 4401 — спершу оновити
 * токен; 4403/4404 — доступу більше немає, далі не стукаємо.
 */
export function openTrainingGroupSocket(
  groupId: string,
  onSignal: (signal: TrainingSocketSignal) => void,
): () => void {
  let cancelled = false;
  let socket: WebSocket | null = null;
  let opening = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleReconnect = () => {
    if (cancelled || reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void open();
    }, delay);
  };

  const open = async () => {
    if (cancelled || socket || opening || !groupId || !isOnlineMode() || getWorkspaceIncompatibility()) return;
    opening = true;
    let token: string | null = null;
    try {
      token = await getFreshAccessToken();
    } catch {
      token = null;
    } finally {
      opening = false;
    }
    if (cancelled || socket || !token || !isOnlineMode() || getWorkspaceIncompatibility()) {
      if (!cancelled && !token) scheduleReconnect();
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${getWsBase()}/training-group/${encodeURIComponent(groupId)}/`, ['flowi-jwt', token]);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      // Поки сокета не було, сигнали губились — одна підтяжка на відкритті.
      onSignal({ type: 'sync_changed', groupId });
    };
    ws.onmessage = (event: { data?: unknown }) => {
      const signal = parseTrainingSocketMessage(groupId, event?.data);
      if (signal) onSignal(signal);
    };
    ws.onerror = () => { /* onclose однаково спрацює */ };
    ws.onclose = (event: { code?: number }) => {
      if (socket === ws) socket = null;
      if (cancelled) return;
      if (event?.code === 4403 || event?.code === 4404) {
        onSignal({ type: 'gone', groupId, reason: event.code === 4403 ? 'closed_4403' : 'closed_4404' });
        return;
      }
      if (event?.code === 4401) {
        void refreshSession().then(outcome => {
          if (cancelled || outcome === 'invalid') return;
          if (outcome === 'ok') attempt = 0;
          scheduleReconnect();
        });
        return;
      }
      scheduleReconnect();
    };
  };

  void open();

  return () => {
    cancelled = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    const ws = socket;
    socket = null;
    if (ws) {
      try { ws.close(); } catch { /* уже закритий */ }
    }
  };
}

// ── training_groups_changed (ws/user/) ─────────────────────────────────────

const groupsChangedListeners = new Set<() => void>();

/** Підписка екранів списку груп на сигнал `training_groups_changed`. */
export function subscribeTrainingGroupsChanged(listener: () => void): () => void {
  groupsChangedListeners.add(listener);
  return () => { groupsChangedListeners.delete(listener); };
}

/** Викликає рушій особистого синку, коли на ws/user/ прийшов цей сигнал. */
export function emitTrainingGroupsChanged(): void {
  for (const listener of [...groupsChangedListeners]) {
    try {
      listener();
    } catch (e) {
      if (__DEV__) console.warn('[training-socket] слухач training_groups_changed упав:', e);
    }
  }
}
