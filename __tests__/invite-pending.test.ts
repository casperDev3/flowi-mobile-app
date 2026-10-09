/**
 * __tests__/invite-pending.test.ts — іменні запрошення (decision 7):
 * розбір причини «мертвого» запрошення, id запрошення з картки інбоксу/push,
 * deep link `ftrackingapp://invites?invite=`.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/store/project-sync', () => ({ addRecentProject: jest.fn(async () => {}), syncProject: jest.fn(async () => {}) }));
jest.mock('@/api/notifications', () => ({ refreshInbox: jest.fn(async () => {}) }));

import { ApiError, OfflineError } from '../store/api';
import { inviteIdFromPayload } from '../store/invite-inbox';
import { inviteFailureText } from '../store/invite-messages';
import { classifyInviteError } from '../store/project-team';
import { deepLinkRoute } from '../utils/pushLink';

describe('classifyInviteError', () => {
  it('410 з reason — конкретна причина', () => {
    const e = new ApiError(410, 'invite_expired', 'gone', { code: 'invite_expired', reason: 'revoked' });
    expect(classifyInviteError(e)).toEqual({ kind: 'dead', reason: 'revoked' });
  });
  it('410 без reason (старий сервер) — unknown', () => {
    expect(classifyInviteError(new ApiError(410, 'invite_expired', 'gone'))).toEqual({ kind: 'dead', reason: 'unknown' });
  });
  it('невідома причина не ламає розбір', () => {
    const e = new ApiError(410, 'invite_expired', 'gone', { reason: 'alien' });
    expect(classifyInviteError(e)).toEqual({ kind: 'dead', reason: 'unknown' });
  });
  it('403 invite_wrong_account / 404 / offline', () => {
    expect(classifyInviteError(new ApiError(403, 'invite_wrong_account', 'x'))).toEqual({ kind: 'wrong_account' });
    expect(classifyInviteError(new ApiError(404, 'invite_invalid', 'x'))).toEqual({ kind: 'invalid' });
    expect(classifyInviteError(new OfflineError())).toEqual({ kind: 'offline' });
  });
  it('кожна причина має власний текст', () => {
    const tr = new Proxy({}, { get: (_t, key) => `t:${String(key)}` }) as never;
    expect(inviteFailureText({ kind: 'dead', reason: 'used_up' }, tr)).toBe('t:inviteReasonUsedUp');
    expect(inviteFailureText({ kind: 'dead', reason: 'unknown' }, tr)).toBe('t:inviteExpired');
    expect(inviteFailureText({ kind: 'wrong_account' }, tr)).toBe('t:inviteWrongAccount');
  });
});

describe('inviteIdFromPayload', () => {
  it('з vars.invite_id', () => {
    expect(inviteIdFromPayload({ vars: { invite_id: 'abc' } })).toBe('abc');
  });
  it('з push data.invite_id', () => {
    expect(inviteIdFromPayload({ invite_id: 'p1' })).toBe('p1');
  });
  it('запасний шлях — з path дії', () => {
    expect(inviteIdFromPayload({ actions: [{ id: 'accept', path: '/api/invites/u-1/accept/' }] })).toBe('u-1');
  });
  it('нічого — null', () => {
    expect(inviteIdFromPayload({})).toBeNull();
    expect(inviteIdFromPayload(null)).toBeNull();
  });
});

describe('deepLinkRoute invites', () => {
  it('веде на екран запрошень з фокусом', () => {
    expect(deepLinkRoute('ftrackingapp://invites?invite=u-1')).toBe('/invites?invite=u-1');
    expect(deepLinkRoute('ftrackingapp://invites')).toBe('/invites');
  });
});
