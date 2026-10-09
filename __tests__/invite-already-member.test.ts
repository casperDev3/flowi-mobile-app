/**
 * __tests__/invite-already-member.test.ts — посилання на власний проєкт /
 * повторне запрошення (Invite API v2 §2): 410 для учасника несе
 * `already_member` + `project`, а екран /invite показує «Ви вже в цьому
 * проєкті» замість помилки чи «Готово!».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import { ApiError, OfflineError } from '../store/api';
import { alreadyMemberFromInviteError } from '../store/project-team';
import { pluralForm } from '../utils/activeTimersBar';

describe('alreadyMemberFromInviteError', () => {
  it('410 учасника → проєкт і поточна роль', () => {
    const err = new ApiError(410, 'invite_expired', 'expired', {
      code: 'invite_expired', reason: 'used_up', already_member: true, member_role: 'owner',
      project: { id: 'p1', name: 'Сайт', color: '#EF4444' },
    });
    expect(alreadyMemberFromInviteError(err)).toEqual({
      project: { id: 'p1', name: 'Сайт', color: '#EF4444' }, memberRole: 'owner',
    });
  });

  it('410 для чужого/анонімного — null (звичайна помилка «мертве запрошення»)', () => {
    expect(alreadyMemberFromInviteError(new ApiError(410, 'invite_expired', 'x', { reason: 'expired' }))).toBeNull();
    expect(alreadyMemberFromInviteError(new OfflineError())).toBeNull();
    expect(alreadyMemberFromInviteError(new Error('x'))).toBeNull();
  });

  it('невідома роль не протікає в UI', () => {
    const err = new ApiError(410, 'invite_expired', 'x', { already_member: true, member_role: 'god', project: { id: 'p1' } });
    expect(alreadyMemberFromInviteError(err)).toEqual({ project: { id: 'p1', name: '', color: '' }, memberRole: null });
  });
});

describe('множина «використання/разів»', () => {
  it.each([[1, 'one'], [2, 'few'], [4, 'few'], [5, 'many'], [11, 'many'], [14, 'many'], [21, 'one'], [22, 'few'], [0, 'many']])(
    '%i → %s', (n, form) => { expect(pluralForm(n as number, 'uk')).toBe(form); },
  );
});
