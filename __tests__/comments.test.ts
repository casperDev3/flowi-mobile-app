/**
 * __tests__/comments.test.ts — @згадки й правила прав на коментар
 * (WORKSPACE_PROJECTS_CONTRACT.md §4.4).
 */
import {
  buildComment,
  canDeleteComment,
  canEditComment,
  commentsForTarget,
  formatMention,
  parseMentionIds,
  renderCommentBody,
  type Comment,
} from '../utils/comments';

describe('formatMention / parseMentionIds', () => {
  it('форматує й розбирає одну згадку', () => {
    const text = `Гляньте, будь ласка ${formatMention('42', "Ім'я Прізвище")}`;
    expect(parseMentionIds(text)).toEqual(['42']);
  });

  it('кілька згадок без дублікатів', () => {
    const text = `${formatMention('1', 'A')} і ${formatMention('2', 'B')} і знову ${formatMention('1', 'A')}`;
    expect(parseMentionIds(text)).toEqual(['1', '2']);
  });

  it('без згадок — порожній список', () => {
    expect(parseMentionIds('звичайний текст без @ згадок')).toEqual([]);
  });
});

describe('renderCommentBody', () => {
  it('розбиває текст на сегменти навколо згадки', () => {
    const body = `до ${formatMention('7', 'Petro')} після`;
    expect(renderCommentBody(body)).toEqual([
      { text: 'до ' },
      { text: 'Petro', mentionUserId: '7' },
      { text: ' після' },
    ]);
  });

  it('без згадок — один сегмент', () => {
    expect(renderCommentBody('просто текст')).toEqual([{ text: 'просто текст' }]);
  });
});

describe('commentsForTarget', () => {
  const base = (overrides: Partial<Comment>): Comment => ({
    id: 'cm-1', projectId: 'p-1', targetType: 'task', targetId: 't-1',
    authorId: '1', body: 'x', mentions: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  it('фільтрує по цілі й сортує за часом створення', () => {
    const list: Comment[] = [
      base({ id: 'a', targetId: 't-1', createdAt: '2026-01-02T00:00:00Z' }),
      base({ id: 'b', targetId: 't-2', createdAt: '2026-01-01T00:00:00Z' }),
      base({ id: 'c', targetId: 't-1', createdAt: '2026-01-01T00:00:00Z' }),
    ];
    expect(commentsForTarget(list, 'task', 't-1').map(c => c.id)).toEqual(['c', 'a']);
  });

  it('різний targetType з тим самим targetId не змішується', () => {
    const list: Comment[] = [
      base({ id: 'a', targetType: 'task', targetId: 'x' }),
      base({ id: 'b', targetType: 'meeting', targetId: 'x' }),
    ];
    expect(commentsForTarget(list, 'meeting', 'x').map(c => c.id)).toEqual(['b']);
  });
});

describe('buildComment', () => {
  it('витягує mentions із тексту й ставить createdAt=updatedAt', () => {
    const comment = buildComment({
      projectId: 'p-1', targetType: 'task', targetId: 't-1', authorId: '1',
      body: `привіт ${formatMention('2', 'B')}`, now: '2026-01-01T00:00:00Z',
    });
    expect(comment.mentions).toEqual(['2']);
    expect(comment.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(comment.updatedAt).toBe('2026-01-01T00:00:00Z');
    expect(comment.id.startsWith('cm-')).toBe(true);
    expect(comment.editedAt).toBeUndefined();
  });
});

describe('canEditComment / canDeleteComment (contract §4.1)', () => {
  const comment: Comment = {
    id: 'cm-1', projectId: 'p-1', targetType: 'task', targetId: 't-1',
    authorId: '1', body: 'x', mentions: [], createdAt: 'now', updatedAt: 'now',
  };

  it('редагувати може лише автор', () => {
    expect(canEditComment(comment, '1')).toBe(true);
    expect(canEditComment(comment, '2')).toBe(false);
  });

  it('видаляти може автор або власник проєкту', () => {
    expect(canDeleteComment(comment, '1', false)).toBe(true);
    expect(canDeleteComment(comment, '2', false)).toBe(false);
    expect(canDeleteComment(comment, '2', true)).toBe(true);
  });
});
