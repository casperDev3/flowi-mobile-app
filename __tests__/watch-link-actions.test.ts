/**
 * store/watch-link.ts — `actions` від годинника (watch-lockscreen-v1.md §6.1):
 * черга іншого акаунта не пишеться в дані поточного (без ack → годинник іде на сервер).
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}));

import { answerWatchMessage } from '@/store/watch-link';

const session = { authed: true, userId: '7', userName: 'Me', lang: 'uk' as const };

function noteAction() {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'note_create',
    at: new Date(Date.now() - 2000).toISOString(),
    tz: 'Europe/Kyiv',
    source: 'watch',
    payload: { text: 'Hello' },
  };
}

beforeEach(() => mockStore.clear());

it('не відповідає на дії чужого акаунта і нічого не пише', async () => {
  const reply = await answerWatchMessage(
    { t: 'actions', body: JSON.stringify({ actions: [noteAction()], userId: '8' }) }, session,
  );
  expect(reply).toBeNull();
  expect(mockStore.get('notes')).toBeUndefined();
});

it('застосовує дії свого акаунта', async () => {
  const reply = await answerWatchMessage(
    { t: 'actions', body: JSON.stringify({ actions: [noteAction()], userId: '7', watchId: 'w1' }) }, session,
  );
  expect(reply?.t).toBe('ack');
  const body = JSON.parse(reply!.body);
  expect(body.results[0].status).toBe('applied');
  expect(JSON.parse(mockStore.get('notes') ?? '[]')).toHaveLength(1);
});

it('без userId (NATIVE CONTRACT) — не відповідає і нічого не пише', async () => {
  for (const userId of [undefined, '', null]) {
    mockStore.clear();
    const reply = await answerWatchMessage(
      { t: 'actions', body: JSON.stringify({ actions: [noteAction()], userId }) }, session,
    );
    expect(reply).toBeNull();
    expect(mockStore.get('notes')).toBeUndefined();
  }
});

describe('відкликаний годинник (SW1)', () => {
  const revoke = (watchId = 'w1') => mockStore.set('watch_link_v1', JSON.stringify({
    watchId, sessionId: null, provisionedAt: null, state: 'revoked',
  }));

  it('дії цього годинника не застосовуються — відповідь «вийшли»', async () => {
    revoke();
    for (const watchId of ['w1', undefined]) {
      const reply = await answerWatchMessage(
        { t: 'actions', body: JSON.stringify({ actions: [noteAction()], userId: '7', ...(watchId ? { watchId } : {}) }) },
        session,
      );
      expect(reply?.t).toBe('signedOut');
      expect(JSON.parse(reply!.body).reason).toBe('revoked');
    }
    expect(mockStore.get('notes')).toBeUndefined();
  });

  it('snapshotRequest відкликаному — «вийшли», без знімка', async () => {
    revoke();
    const reply = await answerWatchMessage({ t: 'snapshotRequest', body: '{}' }, session);
    expect(reply?.t).toBe('signedOut');
    expect(reply?.body).toContain('revoked');
  });

  it('інший (новий) годинник не блокується', async () => {
    revoke('old');
    const reply = await answerWatchMessage(
      { t: 'actions', body: JSON.stringify({ actions: [noteAction()], userId: '7', watchId: 'new' }) }, session,
    );
    expect(reply?.t).toBe('ack');
  });
});
