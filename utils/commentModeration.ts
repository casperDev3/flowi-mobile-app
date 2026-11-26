/**
 * utils/commentModeration.ts — скарги на коментарі й блокування авторів
 * (App Store Review Guideline 1.2, контент користувачів у спільних проєктах).
 *
 * Чисті функції без сховища й мережі — їх перевіряє
 * `__tests__/comment-moderation.test.ts`. Побічні ефекти (AsyncStorage,
 * черга звернень) — у `store/comment-moderation.ts`.
 *
 * Блокування — суто локальне: список лежить у ключі `blocked_users_v1`
 * (не синхронізується) і лише ховає коментарі/сповіщення автора на цьому
 * пристрої. Скарга йде наявним конвеєром «Ідеї та баги» як запис `bugs` —
 * сервер уже доставляє такі звернення розробникам.
 */
import type { Comment } from './comments';
import { DESCRIPTION_MAX, STEPS_MAX, TITLE_MAX, type Bug } from '@/components/feedback/model';

export const BLOCKED_USERS_KEY = 'blocked_users_v1';

export interface BlockedUser {
  /** `user.id` як рядок — той самий формат, що `Comment.authorId`. */
  userId: string;
  /** Ім'я на момент блокування — лише для списку в Налаштуваннях. */
  name?: string;
  blockedAt: string;
}

/**
 * Приводить збережене значення до `BlockedUser[]`: терпить голі рядки id
 * (простіша форма ключа), сміття й дублікати.
 */
export function normalizeBlockedUsers(raw: unknown): BlockedUser[] {
  if (!Array.isArray(raw)) return [];
  const out: BlockedUser[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    let item: BlockedUser | null = null;
    if (typeof entry === 'string' || typeof entry === 'number') {
      item = { userId: String(entry), blockedAt: '' };
    } else if (entry && typeof entry === 'object' && 'userId' in entry) {
      const e = entry as Partial<BlockedUser>;
      if (e.userId !== undefined && e.userId !== null && String(e.userId)) {
        item = { userId: String(e.userId), blockedAt: typeof e.blockedAt === 'string' ? e.blockedAt : '' };
        if (typeof e.name === 'string' && e.name) item.name = e.name;
      }
    }
    if (item && item.userId && !seen.has(item.userId)) {
      seen.add(item.userId);
      out.push(item);
    }
  }
  return out;
}

export function isUserBlocked(list: readonly BlockedUser[], userId: string | number | null | undefined): boolean {
  if (userId === null || userId === undefined) return false;
  const id = String(userId);
  return list.some(u => u.userId === id);
}

/** Додає автора (ідемпотентно: повторне блокування лише оновлює ім'я). */
export function addBlockedUser(list: readonly BlockedUser[], userId: string, name: string | undefined, now: string): BlockedUser[] {
  const id = String(userId);
  if (!id) return [...list];
  const existing = list.find(u => u.userId === id);
  if (existing) {
    return list.map(u => (u.userId === id && name ? { ...u, name } : u));
  }
  const item: BlockedUser = { userId: id, blockedAt: now };
  if (name) item.name = name;
  return [...list, item];
}

export function removeBlockedUser(list: readonly BlockedUser[], userId: string): BlockedUser[] {
  const id = String(userId);
  return list.filter(u => u.userId !== id);
}

/**
 * Розділяє коментарі на видимі й приховані (автор заблокований). Власні
 * коментарі ніколи не ховаються — навіть якщо id потрапив у список.
 */
export function partitionBlockedComments(
  comments: readonly Comment[],
  blocked: readonly BlockedUser[],
  currentUserId: string | null,
): { visible: Comment[]; hidden: Comment[] } {
  const visible: Comment[] = [];
  const hidden: Comment[] = [];
  for (const c of comments) {
    if (c.authorId !== currentUserId && isUserBlocked(blocked, c.authorId)) hidden.push(c);
    else visible.push(c);
  }
  return { visible, hidden };
}

/** Елементи (напр. сповіщення інбоксу) без тих, чий автор (`actor`) заблокований. */
export function withoutBlockedActors<T extends { actor: { id: number | string } | null }>(
  items: readonly T[],
  blocked: readonly BlockedUser[],
): T[] {
  if (!blocked.length) return [...items];
  return items.filter(item => !item.actor || !isUserBlocked(blocked, item.actor.id));
}

/** Чи показувати на коментарі дії «Поскаржитися»/«Заблокувати» — лише на чужих. */
export function canReportComment(comment: Comment, currentUserId: string | null): boolean {
  return !!currentUserId && comment.authorId !== currentUserId;
}

// ─── Скарга → запис `bugs` (конвеєр звернень, api/feedback.ts) ───────────────

export type CommentReportReason = 'spam' | 'abuse' | 'inappropriate' | 'other' | 'blocked';

export const COMMENT_REPORT_REASONS: readonly Exclude<CommentReportReason, 'blocked'>[] = ['spam', 'abuse', 'inappropriate', 'other'];

/** Скільки тексту коментаря кладемо в опис — решта поля лишається під метадані. */
const REPORTED_BODY_MAX = 2500;

export interface CommentReportInput {
  comment: Comment;
  reason: CommentReportReason;
  reporterId: string;
  authorName?: string;
  /** Локалізована назва звернення (`tr.commentsReportBugTitle`). */
  title: string;
  id: string;
  now: string;
}

/**
 * Запис `Bug` для скарги. Опис — для розробників, тож без локалізації:
 * стабільні ключі `Key: value`, які легко шукати в трекері.
 * steps/expected/actual заповнені, бо для баг-звернень вони обов'язкові
 * при надсиланні (`missingForSubmit`, feedback-inbox.md §10.2).
 */
export function buildCommentReportBug(input: CommentReportInput): Bug {
  const { comment, reason, reporterId, authorName, title, id, now } = input;
  const body = comment.body.length > REPORTED_BODY_MAX
    ? `${comment.body.slice(0, REPORTED_BODY_MAX)}…`
    : comment.body;
  const lines = [
    '[UGC REPORT] Objectionable comment (App Review 1.2) — review within 24h',
    `Reason: ${reason}`,
    `Project ID: ${comment.projectId}`,
    `Comment ID: ${comment.id}`,
    `Target: ${comment.targetType}/${comment.targetId}`,
    `Author ID: ${comment.authorId}${authorName ? ` (${authorName})` : ''}`,
    `Reporter ID: ${reporterId}`,
    `Comment created: ${comment.createdAt}`,
    '',
    'Comment text:',
    body,
  ];
  return {
    id,
    title: `${title}: ${reason}`.slice(0, TITLE_MAX),
    description: lines.join('\n').slice(0, DESCRIPTION_MAX),
    severity: reason === 'spam' || reason === 'other' ? 'major' : 'critical',
    fixed: false,
    createdAt: now,
    module: 'other',
    steps: `Open project ${comment.projectId}, ${comment.targetType} ${comment.targetId}, comment ${comment.id}.`.slice(0, STEPS_MAX),
    expected: 'Comment complies with community guidelines.',
    actual: `Reported by user ${reporterId} as: ${reason}.`,
  };
}
