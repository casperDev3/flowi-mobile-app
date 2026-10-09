/**
 * store/invite-inbox.ts — іменні запрошення в проєкт з боку ЗАПРОШЕНОГО
 * (decision 7, контракт scratchpad/invite-api.md «Invitee endpoints»).
 *
 * Три входи в одну дію «Прийняти / Відхилити»:
 *  - картка `project.invite_pending` у центрі сповіщень (`payload.actions`);
 *  - екран «Запрошення» (`/invites`, deep link `ftrackingapp://invites?invite=`);
 *  - кнопки самого push (категорія `project_invite`, expo-notifications).
 *
 * Тут — лише спільна логіка без UI: виклик API, що робити після прийняття
 * (проєкт у «нещодавні» + синк), реєстрація категорії push і обробка натиску
 * на кнопку push. Екрани показують результат самі.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { refreshInbox } from '@/api/notifications';

import { addRecentProject, syncProject } from './project-sync';
import {
  acceptPendingInvite,
  classifyInviteError,
  declinePendingInvite,
  fetchMyInvites,
  type InviteFailure,
  type MyInvite,
} from './project-team';

export const INVITE_PUSH_CATEGORY = 'project_invite';
export const INVITE_EVENT_PENDING = 'project.invite_pending';

export type InviteDecision = 'accept' | 'decline';

export type InviteResponseResult =
  | { ok: true; decision: InviteDecision; projectId: string | null; alreadyMember: boolean }
  | { ok: false; decision: InviteDecision; failure: InviteFailure };

/** id запрошення з картки інбоксу: `payload.vars.invite_id`, запасний шлях — `payload.actions[].path`. */
export function inviteIdFromPayload(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  const vars = payload.vars as Record<string, unknown> | undefined;
  if (vars && typeof vars.invite_id === 'string' && vars.invite_id) return vars.invite_id;
  if (typeof payload.invite_id === 'string' && payload.invite_id) return payload.invite_id;
  const actions = payload.actions;
  if (Array.isArray(actions)) {
    for (const action of actions) {
      const path = (action as { path?: unknown })?.path;
      if (typeof path !== 'string') continue;
      const match = /\/invites\/([^/]+)\/(?:accept|decline)\/?$/.exec(path);
      if (match) {
        try { return decodeURIComponent(match[1]); } catch { return match[1]; }
      }
    }
  }
  return null;
}

/**
 * Прийняти/відхилити. Після прийняття проєкт одразу з'являється в
 * «нещодавніх» і починає синк — так само, як після входу за посиланням
 * (`app/invite.tsx`). Інбокс перечитується: сервер архівує картку запрошення.
 */
export async function respondToInvite(inviteId: string, decision: InviteDecision): Promise<InviteResponseResult> {
  try {
    if (decision === 'accept') {
      const result = await acceptPendingInvite(inviteId);
      const projectId = result.project?.id ?? null;
      if (projectId) {
        await addRecentProject(projectId);
        void syncProject(projectId);
      }
      void refreshInbox().catch(() => {});
      return { ok: true, decision, projectId, alreadyMember: !!result.already_member };
    }
    await declinePendingInvite(inviteId);
    void refreshInbox().catch(() => {});
    return { ok: true, decision, projectId: null, alreadyMember: false };
  } catch (error) {
    // Запрошення вже не живе (скасоване/відповіли з іншого пристрою) — картка
    // на сервері вже архівована, тож оновлений інбокс її прибере.
    void refreshInbox().catch(() => {});
    return { ok: false, decision, failure: classifyInviteError(error) };
  }
}

/**
 * GET /invites/mine/ — кличемо після входу/старту: сервер прив'язує до акаунта
 * запрошення, надіслані на цю пошту ДО реєстрації, і створює їм сповіщення.
 * Помилки ковтаються — це фонова дія, не причина ламати старт застосунку.
 */
export async function syncMyInvites(): Promise<MyInvite[]> {
  try {
    const list = await fetchMyInvites();
    if (list.length) void refreshInbox().catch(() => {});
    return list;
  } catch (e) {
    if (__DEV__) console.warn('[invites] /invites/mine/ не вдалось:', e);
    return [];
  }
}

/** Категорія push з кнопками «Прийняти»/«Відхилити» (контракт: `categoryId: 'project_invite'`). */
export async function registerInvitePushCategory(labels: { accept: string; decline: string }): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.setNotificationCategoryAsync(INVITE_PUSH_CATEGORY, [
      { identifier: 'accept', buttonTitle: labels.accept, options: { opensAppToForeground: true } },
      { identifier: 'decline', buttonTitle: labels.decline, options: { isDestructive: true, opensAppToForeground: true } },
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[invites] реєстрація категорії push не вдалась:', e);
  }
}

/** На рівні модуля: повторна підписка (зміна мови) не виконує той самий натиск удруге. */
const handledPushActions = new Set<string>();

/**
 * Натиск на кнопку push «Прийняти»/«Відхилити». Звичайний тап по пушу
 * (DEFAULT_ACTION_IDENTIFIER) обробляє `store/push.ts` — тут лише дві кнопки.
 * Повертає відписку.
 */
export function setupInvitePushActions(onResult: (result: InviteResponseResult) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const handle = (response: Notifications.NotificationResponse | null, coldStart = false) => {
    if (!response) return;
    // Застарілий «останній відгук» з попереднього запуску не виконуємо вдруге.
    if (coldStart && Date.now() - (response.notification.date || 0) > 10 * 60_000) return;
    const action = response.actionIdentifier;
    if (action !== 'accept' && action !== 'decline') return;
    const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
    const inviteId = inviteIdFromPayload(data);
    if (!inviteId) return;
    const key = `${response.notification.request.identifier}:${action}`;
    if (handledPushActions.has(key)) return;
    handledPushActions.add(key);
    void respondToInvite(inviteId, action).then(result => {
      onResult(result);
      if (result.ok && result.decision === 'accept' && result.projectId) {
        router.push({ pathname: '/project/[id]/overview', params: { id: result.projectId } } as never);
      }
    });
  };
  const sub = Notifications.addNotificationResponseReceivedListener(response => handle(response));
  // Холодний старт натиском на кнопку: слухач ще не існував.
  void Notifications.getLastNotificationResponseAsync().then(response => handle(response, true)).catch(() => {});
  return () => sub.remove();
}
