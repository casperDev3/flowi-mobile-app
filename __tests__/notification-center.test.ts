/**
 * __tests__/notification-center.test.ts — клієнт центру сповіщень
 * (api/notifications.ts, docs/specs/notifications-module.md §6, §10.3, §11).
 *
 * Чисті правила (злиття інбоксу, бейдж без подій вимкнених модулів,
 * оптимістична правка матриці, коли вимикати локальні нагадування) і стан
 * центру поверх замоканого HTTP-клієнта: WS-сигнал, оптимістичне
 * «прочитано», офлайн, вихід з акаунта.
 */

const mockStore = new Map<string, string>();
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  }),
  saveData: jest.fn(async (key: string, data: unknown) => {
    mockStore.set(key, JSON.stringify(data));
  }),
  subscribeToStorage: jest.fn(() => () => {}),
}));

let mockOnline = true;
jest.mock('@/store/app-mode', () => ({
  isOnlineMode: () => mockOnline,
  subscribeOnlineMode: () => () => {},
}));
jest.mock('@/store/api-config', () => ({ getApiBase: () => 'https://ws.example.com/api' }));
jest.mock('@/store/synced-storage', () => ({ saveSyncedValue: jest.fn(async () => {}) }));

type Opts = { method?: string; body?: unknown; auth?: boolean };
const mockApiFetch = jest.fn(async (_path: string, _opts?: Opts): Promise<unknown> => ({}));
jest.mock('@/store/api', () => ({
  apiFetch: (path: string, opts?: Opts) => mockApiFetch(path, opts),
}));

import {
  type InboxItem,
  type InboxPage,
  type PreferencesDoc,
  INBOX_CACHE_KEY,
  PREFERENCES_CACHE_KEY,
  SERVER_REMINDERS_KEY,
  applyPreferencesPatch,
  applyTopPage,
  categoryChannelPatch,
  compareVersions,
  formatHm,
  getInboxState,
  handleNotificationsSignal,
  isInboxItemVisible,
  markNotificationsRead,
  mergeInboxItems,
  parseCapability,
  parseHm,
  refreshInbox,
  resetNotificationCenter,
  serverReminderEvents,
  visibleUnreadCount,
} from '@/api/notifications';
import { SERVER_REMINDERS_KEY as STORE_SERVER_REMINDERS_KEY } from '@/store/notifications';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
}));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('@/store/push', () => ({
  ensurePushTokenRegistered: jest.fn(async () => {}),
  isForCurrentWorkspace: () => true,
}));

function item(seq: number, patch: Partial<InboxItem> = {}): InboxItem {
  return {
    id: `n-${seq}`,
    seq,
    category: 'tasks_projects',
    event_type: 'task.assigned',
    severity: 'info',
    title: `T${seq}`,
    body: '',
    actor: null,
    project: null,
    collection: 'tasks',
    local_id: `t-${seq}`,
    payload: {},
    collapse_count: 1,
    created_at: '2026-09-22T09:00:00Z',
    read_at: null,
    ...patch,
  };
}

function page(items: InboxItem[], patch: Partial<InboxPage> = {}): InboxPage {
  return {
    cursor: items.length ? Math.max(...items.map(i => i.seq)) : 0,
    unread_count: items.filter(i => !i.read_at).length,
    items,
    next_before: null,
    has_more: false,
    ...patch,
  };
}

function doc(): PreferencesDoc {
  return {
    revision: 3,
    enabled: true,
    push_enabled: true,
    email_enabled: false,
    quiet_hours: { enabled: true, start: '22:00', end: '08:00' },
    digest: { enabled: false, hour: 9 },
    timezone: 'Europe/Kyiv',
    lang: 'uk',
    meeting_lead_minutes: 15,
    channels: ['in_app', 'push', 'email'],
    categories: [{
      key: 'tasks_projects',
      label: 'Задачі та проєкти',
      channels: { in_app: true, push: true, email: false },
      events: [
        { key: 'task.assigned', label: '', channels: { in_app: true, push: true, email: false }, overridden: false },
        { key: 'task.commented', label: '', channels: { in_app: true, push: false, email: false }, overridden: true },
      ],
    }],
  };
}

beforeEach(async () => {
  mockStore.clear();
  mockOnline = true;
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async () => ({}));
  await resetNotificationCenter();
  mockStore.clear();
  mockStore.set('auth_user', JSON.stringify({ id: 7 }));
});

describe('злиття інбоксу', () => {
  it('той самий id замінюється (злиття подій піднімає seq), порядок — seq спадно', () => {
    const merged = mergeInboxItems([item(1), item(2)], [item(1, { seq: 5, body: 'злито' })]);
    expect(merged.map(i => i.seq)).toEqual([5, 2]);
    expect(merged[0].body).toBe('злито');
  });

  it('верхня сторінка прибирає з кешу заархівоване на іншому пристрої в її діапазоні, старше лишає', () => {
    const cached = [item(10), item(9), item(8), item(3)];
    // Сервер: 10 і 8 є, 9 заархівували; сторінка покриває seq ≥ 8 (has_more).
    const result = applyTopPage(cached, page([item(10), item(8)], { has_more: true, next_before: 8 }));
    expect(result.map(i => i.seq)).toEqual([10, 8, 3]);
  });

  it('порожня остання сторінка означає порожній інбокс', () => {
    expect(applyTopPage([item(1)], page([]))).toEqual([]);
  });
});

describe('модулі інтерфейсу (ui_preferences)', () => {
  it('подія вимкненого модуля не видна; призначення на нараду — модуль «Наради»', () => {
    expect(isInboxItemVisible(item(1), ['projects'])).toBe(false);
    expect(isInboxItemVisible(item(1), ['finance'])).toBe(true);
    expect(isInboxItemVisible(item(2, { collection: 'meetings' }), ['meetings'])).toBe(false);
    expect(isInboxItemVisible(item(3, { event_type: 'subscription.due_today' }), ['subscriptions'])).toBe(false);
    expect(isInboxItemVisible(item(4, { event_type: 'registration.requested' }), ['projects', 'tasks'])).toBe(true);
  });

  it('бейдж віднімає непрочитані події вимкнених модулів, але не йде в мінус', () => {
    const items = [item(1), item(2, { event_type: 'meeting.reminder', collection: 'meetings' }), item(3, { read_at: 'x' })];
    expect(visibleUnreadCount(5, items, [])).toBe(5);
    expect(visibleUnreadCount(5, items, ['meetings'])).toBe(4);
    expect(visibleUnreadCount(0, items, ['meetings', 'projects'])).toBe(0);
  });
});

describe('налаштування', () => {
  it('категорія діє на події без власного вибору, власний вибір не чіпає', () => {
    const next = applyPreferencesPatch(doc(), { categories: { tasks_projects: { push: false } } });
    const [assigned, commented] = next.categories[0].events;
    expect(next.categories[0].channels.push).toBe(false);
    expect(assigned.channels.push).toBe(false);
    expect(commented.overridden).toBe(true);
  });

  it('`events: {code: null}` скидає подію до категорії', () => {
    const next = applyPreferencesPatch(doc(), { events: { 'task.commented': null } });
    const commented = next.categories[0].events[1];
    expect(commented.overridden).toBe(false);
    expect(commented.channels.push).toBe(true);
  });

  it('правка категорії знімає розбіжні вибори подій, щоб справді діяти на всі', () => {
    expect(categoryChannelPatch(doc(), 'tasks_projects', 'push', true)).toEqual({
      categories: { tasks_projects: { push: true } },
      events: { 'task.commented': { push: null } },
    });
    expect(categoryChannelPatch(doc(), 'tasks_projects', 'push', false)).toEqual({
      categories: { tasks_projects: { push: false } },
    });
  });

  it('час тихих годин обгортається через північ', () => {
    expect(formatHm(parseHm('00:00')! - 30)).toBe('23:30');
    expect(formatHm(parseHm('23:30')! + 60)).toBe('00:30');
    expect(parseHm('25:00')).toBeNull();
  });
});

describe('серверні нагадування замість локальних (§10.3)', () => {
  const capability = parseCapability({
    protocol: 1,
    channels: ['in_app', 'push_expo'],
    server_reminders: ['task.reminder', 'task.deadline_soon', 'meeting.reminder', 'subscription.due_today'],
  });

  it('вимикаються лише ті, що клієнт уміє замінити, і лише на достатній збірці з push', () => {
    expect(serverReminderEvents({ capability, appVersion: '1.2.0', deviceRegistered: true }))
      .toEqual(['task.reminder', 'meeting.reminder', 'subscription.due_today']);
    // Збірці нижче порогу сервер не шле нагадувань — локальні мусять лишитись.
    expect(serverReminderEvents({ capability, appVersion: '1.1.0', deviceRegistered: true })).toEqual([]);
    // Пристрій без push-реєстрації сервер не досягне.
    expect(serverReminderEvents({ capability, appVersion: '1.3.0', deviceRegistered: false })).toEqual([]);
    // Старий сервер без модуля.
    expect(serverReminderEvents({ capability: null, appVersion: '9.0.0', deviceRegistered: true })).toEqual([]);
  });

  it('порівняння версій — числове, не рядкове', () => {
    expect(compareVersions('1.10.0', '1.2.0')).toBe(1);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
  });

  it('ключ рішення однаковий у HTTP-шарі й у планувальнику локальних нагадувань', () => {
    expect(STORE_SERVER_REMINDERS_KEY).toBe(SERVER_REMINDERS_KEY);
  });
});

describe('стан центру', () => {
  it('офлайн-режим — жодного запиту, статус offline', async () => {
    mockOnline = false;
    await refreshInbox();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(getInboxState().status).toBe('offline');
  });

  it('404 від старого сервера — «модуля немає», а не помилка', async () => {
    mockApiFetch.mockImplementation(async () => { throw Object.assign(new Error('nf'), { status: 404 }); });
    await refreshInbox();
    expect(getInboxState().status).toBe('unavailable');
  });

  it('сторінка потрапляє в стан і кеш власника', async () => {
    mockApiFetch.mockImplementation(async () => page([item(2), item(1)]));
    await refreshInbox();
    expect(getInboxState().items.map(i => i.id)).toEqual(['n-2', 'n-1']);
    expect(getInboxState().serverUnread).toBe(2);
    const cached = JSON.parse(mockStore.get(INBOX_CACHE_KEY)!);
    expect(cached).toMatchObject({ origin: 'https://ws.example.com/api', userId: '7', cursor: 2 });
  });

  it('«прочитано» — оптимістично, лічильник уточнює сервер', async () => {
    mockApiFetch.mockImplementation(async () => page([item(2), item(1)]));
    await refreshInbox();
    let resolvePost: (v: unknown) => void = () => {};
    mockApiFetch.mockImplementation((path: string) => (path.endsWith('/read/')
      ? new Promise(resolve => { resolvePost = resolve; })
      : Promise.resolve({})));
    const pending = markNotificationsRead(['n-2']);
    expect(getInboxState().serverUnread).toBe(1);
    expect(getInboxState().items.find(i => i.id === 'n-2')?.read_at).not.toBeNull();
    resolvePost({ unread_count: 1, cursor: 2 });
    await pending;
    const readCall = mockApiFetch.mock.calls.find(([path]) => path === '/notifications/read/');
    expect(readCall?.[1]).toEqual({ method: 'POST', body: { ids: ['n-2'] } });
  });

  it('WS-сигнал ставить бейдж одразу і тягне список; чужий тип ігнорується', async () => {
    jest.useFakeTimers();
    try {
      mockApiFetch.mockImplementation(async () => page([item(4)]));
      expect(handleNotificationsSignal({ type: 'sync_changed' })).toBe(false);
      expect(handleNotificationsSignal({ type: 'notifications_changed', cursor: 4, unread: 9 })).toBe(true);
      expect(getInboxState().serverUnread).toBe(9);
      expect(mockApiFetch).not.toHaveBeenCalled();
      jest.advanceTimersByTime(350);
    } finally {
      jest.useRealTimers();
    }
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(mockApiFetch.mock.calls.some(([path]) => path.startsWith('/notifications/?'))).toBe(true);
  });

  it('новіша ревізія налаштувань з іншого пристрою — перечитуємо', async () => {
    mockApiFetch.mockImplementation(async () => doc());
    handleNotificationsSignal({ type: 'notifications_changed', settings_revision: 4 });
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(mockApiFetch.mock.calls.some(([path]) => path === '/notifications/preferences/')).toBe(true);
  });

  it('вихід з акаунта стирає інбокс, налаштування і рішення про серверні нагадування', async () => {
    mockApiFetch.mockImplementation(async () => page([item(1)]));
    await refreshInbox();
    mockStore.set(SERVER_REMINDERS_KEY, JSON.stringify({ events: ['task.reminder'] }));
    await resetNotificationCenter();
    expect(getInboxState().items).toEqual([]);
    expect(JSON.parse(mockStore.get(INBOX_CACHE_KEY)!)).toBeNull();
    expect(JSON.parse(mockStore.get(PREFERENCES_CACHE_KEY)!)).toBeNull();
    expect(JSON.parse(mockStore.get(SERVER_REMINDERS_KEY)!)).toBeNull();
  });
});
