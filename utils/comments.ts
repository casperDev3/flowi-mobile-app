/**
 * utils/comments.ts — коментарі та @згадки (WORKSPACE_PROJECTS_PLAN.md §4,
 * контракт §4.4).
 *
 * Колекція `comments` існує ЛИШЕ в потоці проєкту (PROJECT_ONLY_COLLECTIONS,
 * utils/projectStream.ts) — особистих завдань/нарад коментарі не торкаються.
 * Чисті функції тут (парсинг згадок, сортування, фільтр по цілі) винесені
 * окремо від UI (`components/shared/CommentsSection.tsx`), щоб їх можна було
 * перевірити без рендера.
 */
import { uuidV4 } from './uuid';

export type CommentTargetType = 'task' | 'meeting';

export interface Comment {
  id: string;
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  /** `user.id` як рядок — той самий формат, що й скрізь у синку (контракт §0.5). */
  authorId: string;
  /** Markdown; згадка в тексті — `@[Ім'я](user:42)` (контракт §4.4). */
  body: string;
  /** Учасники, згадані в `body` — авторитетний список для push, не похідний з тексту при показі. */
  mentions: string[];
  createdAt: string;
  updatedAt: string;
  editedAt?: string;
}

export const COMMENT_BODY_MAX_LENGTH = 10_000;

export function newCommentId(): string {
  return `cm-${uuidV4()}`;
}

/** `@[Ім'я](user:42)` — глобальний пошук по тексту, `Ім'я` — будь-що без `)` чи `]`. */
const MENTION_PATTERN = /@\[([^\]]+)\]\(user:([^)]+)\)/g;

export function formatMention(userId: string, name: string): string {
  return `@[${name}](user:${userId})`;
}

/** Усі `user:id` зі `@[Ім'я](user:id)` у тексті, без дублікатів, у порядку появи. */
export function parseMentionIds(body: string): string[] {
  const ids: string[] = [];
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const id = match[2];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

interface RenderSegment {
  text: string;
  mentionUserId?: string;
}

/**
 * Розбиває тіло коментаря на звичайний текст і згадки — для рендера, де
 * згадку треба виділити (жирним/кольором), а не показувати як
 * `@[Ім'я](user:42)` буквально.
 */
export function renderCommentBody(body: string): RenderSegment[] {
  const segments: RenderSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ text: body.slice(lastIndex, index) });
    segments.push({ text: match[1], mentionUserId: match[2] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < body.length) segments.push({ text: body.slice(lastIndex) });
  return segments;
}

/** Коментарі однієї цілі (завдання/наради), найстаріший — першим (стрічка обговорення). */
export function commentsForTarget(
  comments: readonly Comment[],
  targetType: CommentTargetType,
  targetId: string,
): Comment[] {
  return comments
    .filter(c => c.targetType === targetType && c.targetId === targetId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function buildComment(params: {
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  authorId: string;
  body: string;
  now: string;
}): Comment {
  const { projectId, targetType, targetId, authorId, body, now } = params;
  return {
    id: newCommentId(),
    projectId,
    targetType,
    targetId,
    authorId,
    body,
    mentions: parseMentionIds(body),
    createdAt: now,
    updatedAt: now,
  };
}

/** Чи може `userId` видалити цей коментар — контракт §4.1: автор завжди, власник проєкту — будь-чий. */
export function canDeleteComment(comment: Comment, userId: string, isOwner: boolean): boolean {
  return comment.authorId === userId || isOwner;
}

/** Чи може `userId` редагувати цей коментар — контракт §4.1/§4.4: лише автор. */
export function canEditComment(comment: Comment, userId: string): boolean {
  return comment.authorId === userId;
}
