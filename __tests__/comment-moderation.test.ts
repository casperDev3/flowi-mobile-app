/**
 * __tests__/comment-moderation.test.ts — скарги на коментарі й блокування
 * авторів (App Store Review Guideline 1.2): чисті правила
 * utils/commentModeration.ts.
 */
import { buildComment, type Comment } from '../utils/comments';
import {
  addBlockedUser,
  buildCommentReportBug,
  canReportComment,
  isUserBlocked,
  normalizeBlockedUsers,
  partitionBlockedComments,
  removeBlockedUser,
  withoutBlockedActors,
} from '../utils/commentModeration';
import { buildSubmitPayload, missingForSubmit } from '../components/feedback/model';

const NOW = '2026-11-26T10:00:00.000Z';

function comment(authorId: string, body = 'hello', createdAt = NOW): Comment {
  return buildComment({ projectId: 'p-1', targetType: 'task', targetId: 't-1', authorId, body, now: createdAt });
}

describe('blocked users list', () => {
  it('add / isBlocked / remove', () => {
    let list = addBlockedUser([], '42', 'Spammer', NOW);
    expect(isUserBlocked(list, '42')).toBe(true);
    expect(isUserBlocked(list, 42)).toBe(true);
    expect(isUserBlocked(list, '7')).toBe(false);
    expect(isUserBlocked(list, null)).toBe(false);
    list = removeBlockedUser(list, '42');
    expect(list).toEqual([]);
  });

  it('add is idempotent and refreshes the name', () => {
    const once = addBlockedUser([], '42', 'Old', NOW);
    const twice = addBlockedUser(once, '42', 'New', '2027-01-01T00:00:00.000Z');
    expect(twice).toHaveLength(1);
    expect(twice[0]).toEqual({ userId: '42', name: 'New', blockedAt: NOW });
  });

  it('normalize tolerates bare ids, junk and duplicates', () => {
    expect(normalizeBlockedUsers(null)).toEqual([]);
    expect(normalizeBlockedUsers('x')).toEqual([]);
    expect(normalizeBlockedUsers(['1', 2, { userId: '1' }, { foo: 1 }, { userId: '3', name: 'C', blockedAt: NOW }, null]))
      .toEqual([
        { userId: '1', blockedAt: '' },
        { userId: '2', blockedAt: '' },
        { userId: '3', name: 'C', blockedAt: NOW },
      ]);
  });
});

describe('filtering', () => {
  it('hides comments of blocked authors, never my own', () => {
    const mine = comment('me');
    const bad = comment('42');
    const ok = comment('7');
    const blocked = addBlockedUser(addBlockedUser([], '42', undefined, NOW), 'me', undefined, NOW);
    const { visible, hidden } = partitionBlockedComments([mine, bad, ok], blocked, 'me');
    expect(visible.map(c => c.id)).toEqual([mine.id, ok.id]);
    expect(hidden.map(c => c.id)).toEqual([bad.id]);
  });

  it('nothing blocked — everything visible', () => {
    const list = [comment('1'), comment('2')];
    expect(partitionBlockedComments(list, [], 'me').hidden).toEqual([]);
  });

  it('drops notifications whose actor is blocked', () => {
    const items = [
      { id: 'a', actor: { id: 42, name: 'X' } },
      { id: 'b', actor: { id: '7', name: 'Y' } },
      { id: 'c', actor: null },
    ];
    const blocked = addBlockedUser([], '42', undefined, NOW);
    expect(withoutBlockedActors(items, blocked).map(i => i.id)).toEqual(['b', 'c']);
  });

  it('report/block only on other people\'s comments', () => {
    expect(canReportComment(comment('42'), 'me')).toBe(true);
    expect(canReportComment(comment('me'), 'me')).toBe(false);
    expect(canReportComment(comment('42'), null)).toBe(false);
  });
});

describe('report payload', () => {
  const reported = comment('42', 'you are an idiot');
  const bug = buildCommentReportBug({
    comment: reported, reason: 'abuse', reporterId: 'me', authorName: 'Bob', title: 'Comment report', id: 'r1', now: NOW,
  });

  it('carries project, comment, author, reason and text', () => {
    expect(bug.id).toBe('r1');
    expect(bug.title).toBe('Comment report: abuse');
    expect(bug.description).toContain('Project ID: p-1');
    expect(bug.description).toContain(`Comment ID: ${reported.id}`);
    expect(bug.description).toContain('Author ID: 42 (Bob)');
    expect(bug.description).toContain('Reporter ID: me');
    expect(bug.description).toContain('Reason: abuse');
    expect(bug.description).toContain('you are an idiot');
    expect(bug.fixed).toBe(false);
  });

  it('is complete enough to submit through the feedback queue', () => {
    expect(missingForSubmit({
      kind: 'bug', title: bug.title, description: bug.description,
      steps: bug.steps ?? '', expected: bug.expected ?? '', actual: bug.actual ?? '',
    })).toEqual([]);
    const payload = buildSubmitPayload({ kind: 'bug', item: bug }, new Set());
    expect(payload.collection).toBe('bugs');
    expect(payload.local_id).toBe('r1');
    expect(payload.description).toContain('Comment text:');
  });

  it('truncates very long comment text within the description limit', () => {
    const long = buildCommentReportBug({
      comment: comment('42', 'x'.repeat(20_000)), reason: 'spam', reporterId: 'me', title: 'T', id: 'r2', now: NOW,
    });
    expect(long.description.length).toBeLessThanOrEqual(4000);
  });
});
