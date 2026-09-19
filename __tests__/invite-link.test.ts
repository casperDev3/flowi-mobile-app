/**
 * __tests__/invite-link.test.ts — розбір deep link
 * `ftrackingapp://invite?ws=...&p=...&t=...` (WORKSPACE_PROJECTS_CONTRACT §4.3).
 * `parseInviteLink` сама по собі чиста, але живе в модулі поруч зі
 * сховищем — мокаємо AsyncStorage тим самим способом, що й інші тести
 * `store/*`, аби сам імпорт файлу не падав на нативному модулі.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import { parseInviteLink } from '../store/invite-link';
describe('parseInviteLink', () => {
  it('розбирає deep link зі схемою застосунку', () => {
    const url = 'ftrackingapp://invite?ws=https%3A%2F%2Fapi.flowi.casperdev.site&p=p-123&t=abc.def-ghi';
    expect(parseInviteLink(url)).toEqual({
      ws: 'https://api.flowi.casperdev.site',
      projectId: 'p-123',
      token: 'abc.def-ghi',
    });
  });

  it('розбирає веб-URL /invite', () => {
    const url = 'https://flowi.casperdev.site/invite?ws=https%3A%2F%2Fapi.example.com&p=p-1&t=tok';
    expect(parseInviteLink(url)).toEqual({ ws: 'https://api.example.com', projectId: 'p-1', token: 'tok' });
  });

  it('не запрошення — інший шлях/хост', () => {
    expect(parseInviteLink('ftrackingapp://invite')).toBeNull(); // нема параметрів
    expect(parseInviteLink('ftrackingapp://tasks?ws=a&p=b&t=c')).toBeNull();
    expect(parseInviteLink('https://flowi.casperdev.site/app/tasks?ws=a&p=b&t=c')).toBeNull();
  });

  it('відсутній обов’язковий параметр — null', () => {
    expect(parseInviteLink('ftrackingapp://invite?ws=https://a.com&p=p-1')).toBeNull(); // немає t
    expect(parseInviteLink('ftrackingapp://invite?p=p-1&t=tok')).toBeNull(); // немає ws
  });

  it('биті дані — не кидає, а віддає null', () => {
    expect(parseInviteLink('not a url at all')).toBeNull();
    expect(parseInviteLink('')).toBeNull();
  });
});
