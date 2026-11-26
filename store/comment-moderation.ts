/**
 * store/comment-moderation.ts — побічні ефекти модерації коментарів
 * (App Store Review Guideline 1.2): локальний список заблокованих авторів
 * і надсилання скарги через наявну чергу звернень (api/feedback.ts).
 *
 * Чисті правила — `utils/commentModeration.ts`.
 */
import { useEffect, useState } from 'react';
import { Dimensions, Platform } from 'react-native';

import { enqueueFeedback } from '@/api/feedback';
import { buildContext, type FeedbackRecord } from '@/components/feedback/model';
import { CLIENT_VERSION, getCachedWorkspace } from '@/store/api-config';
import { loadDataResult, saveDataChecked, subscribeToStorage } from '@/store/storage';
import { withStorageLock } from '@/store/storage-lock';
import { updateSynced } from '@/store/synced-storage';
import type { Comment } from '@/utils/comments';
import {
  addBlockedUser,
  BLOCKED_USERS_KEY,
  buildCommentReportBug,
  normalizeBlockedUsers,
  removeBlockedUser,
  type BlockedUser,
  type CommentReportReason,
} from '@/utils/commentModeration';

export async function loadBlockedUsers(): Promise<BlockedUser[]> {
  const res = await loadDataResult<unknown>(BLOCKED_USERS_KEY, []);
  return normalizeBlockedUsers(res.value);
}

/**
 * Читання-зміна-запис під блокуванням ключа. Якщо читання впало — НЕ пишемо
 * поверх fallback (CLAUDE.md, ERR-01): помилка йде нагору.
 */
async function mutateBlockedUsers(fn: (list: BlockedUser[]) => BlockedUser[]): Promise<BlockedUser[]> {
  return withStorageLock(BLOCKED_USERS_KEY, async () => {
    const res = await loadDataResult<unknown>(BLOCKED_USERS_KEY, []);
    if (!res.ok) throw res.error;
    const next = fn(normalizeBlockedUsers(res.value));
    await saveDataChecked(BLOCKED_USERS_KEY, next);
    return next;
  });
}

export function blockUser(userId: string, name?: string): Promise<BlockedUser[]> {
  return mutateBlockedUsers(list => addBlockedUser(list, userId, name, new Date().toISOString()));
}

export function unblockUser(userId: string): Promise<BlockedUser[]> {
  return mutateBlockedUsers(list => removeBlockedUser(list, userId));
}

/** Живий список заблокованих (перечитується на кожен запис ключа). */
export function useBlockedUsers(): BlockedUser[] {
  const [list, setList] = useState<BlockedUser[]>([]);
  useEffect(() => {
    let mounted = true;
    const reload = () => {
      void loadBlockedUsers()
        .then(next => { if (mounted) setList(next); })
        .catch(e => { if (__DEV__) console.warn('[moderation] читання заблокованих не вдалося:', e); });
    };
    reload();
    const unsub = subscribeToStorage(key => { if (key === BLOCKED_USERS_KEY) reload(); });
    return () => { mounted = false; unsub(); };
  }, []);
  return list;
}

/**
 * Скарга на коментар: запис `bugs` + постановка в чергу звернень — той самий
 * шлях, що й «Надіслати» у формі «Ідеї та баги» (app/feedback.tsx `saveForm`
 * → `enqueueFeedback`). Черга сама повторює спроби офлайн.
 */
export async function submitCommentReport(params: {
  comment: Comment;
  reason: CommentReportReason;
  reporterId: string;
  authorName?: string;
  title: string;
  locale: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const bug = buildCommentReportBug({
    comment: params.comment,
    reason: params.reason,
    reporterId: params.reporterId,
    authorName: params.authorName,
    title: params.title,
    id,
    now,
  });
  await updateSynced<FeedbackRecord>('bugs', fresh => [bug, ...fresh]);
  const context = buildContext({
    windowWidth: Dimensions.get('window').width,
    appVersion: CLIENT_VERSION,
    screen: `/project/${params.comment.projectId}/comments`,
    osName: Platform.OS,
    osVersion: String(Platform.Version ?? ''),
    locale: params.locale,
    workspace: getCachedWorkspace()?.name ?? null,
  });
  await enqueueFeedback('bug', id, context);
}
