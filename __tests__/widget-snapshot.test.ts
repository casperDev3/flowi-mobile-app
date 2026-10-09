/**
 * Знімок для iOS-віджета (utils/widgetSnapshot.ts) і його запис
 * (store/widget-sync.ts) — числа мусять збігатися з тим, що показує «Сьогодні».
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import {
  buildWidgetSnapshot,
  widgetRoleMap,
  widgetSnapshotSignature,
  WIDGET_SNAPSHOT_KEY,
} from '@/utils/widgetSnapshot';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const NOW = new Date(2026, 9, 7, 15, 30, 0);
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 7 + dayOffset, h, m).toISOString();

describe('buildWidgetSnapshot — фінанси сьогодні', () => {
  const accounts = [
    { id: 'uah', name: 'Картка', currency: 'UAH', kind: 'card' },
    { id: 'usd', name: 'Долари', currency: 'USD', kind: 'cash' },
  ];
  const tx = (over: Record<string, unknown>) => ({
    id: Math.random().toString(36), type: 'expense', category: 'x', amount: 100, note: '', date: at(10), accountId: 'uah', ...over,
  });

  it('рахує дохід і витрати лише сьогодні й лише в основній валюті, без переказів', () => {
    const s = buildWidgetSnapshot({
      now: NOW, authed: true, accounts, primaryCurrency: 'UAH',
      transactions: [
        tx({ type: 'income', amount: 1200 }),
        tx({ amount: 300 }),
        tx({ amount: '150' }), // рядок із синку
        tx({ amount: 999, date: at(10, 0, -1) }), // вчора
        tx({ amount: 50, accountId: 'usd' }), // інша валюта
        tx({ type: 'transfer', amount: 500, toAccountId: 'usd' }),
      ],
    });
    expect(s.finance).toEqual({ currency: 'UAH', symbol: '₴', decimals: 2, income: 1200, expense: 450 });
  });

  it('бере символ з власних валют і переживає сміття замість масивів', () => {
    const s = buildWidgetSnapshot({
      now: NOW, authed: true, primaryCurrency: 'EUR',
      currencies: [{ code: 'EUR', symbol: '€', kind: 'fiat', decimals: 2 }],
      accounts: [{ id: 'eur', currency: 'EUR' }],
      transactions: [tx({ accountId: 'eur', amount: 20 })],
      tasks: 'broken', timeEntries: null, activeTimers: {},
    });
    expect(s.finance.symbol).toBe('€');
    expect(s.finance.expense).toBe(20);
    expect(s.tasks).toEqual({ done: 0, total: 0 });
    expect(s.time).toEqual({ trackedSec: 0, running: null });
  });
});

describe('buildWidgetSnapshot — завдання дня', () => {
  const doneToday = { id: 'a', title: 'a', status: 'done', history: [{ type: 'done', at: at(9) }] };
  const doneYesterday = { id: 'b', title: 'b', status: 'done', history: [{ type: 'done', at: at(9, 0, -1) }] };
  const dueToday = { id: 'c', title: 'c', status: 'active', deadline: at(18) };
  const overdue = { id: 'd', title: 'd', status: 'active', deadline: at(12, 0, -2) };
  const backlog = { id: 'e', title: 'e', status: 'active' };
  const someoneElse = { id: 'f', title: 'f', status: 'active', deadline: at(18), projectId: 'p1', assigneeId: 'u2' };
  const mineInProject = { id: 'g', title: 'g', status: 'active', deadline: at(18), projectId: 'p1', assigneeId: 'u1' };

  it('done/total — мої сьогоднішні (isTodayTask + isMyTask)', () => {
    const s = buildWidgetSnapshot({
      now: NOW, authed: true, myUserId: 'u1', projectRoles: { p1: 'member' },
      tasks: [doneToday, doneYesterday, dueToday, overdue, backlog, someoneElse, mineInProject],
    });
    expect(s.tasks).toEqual({ done: 1, total: 4 });
  });

  it('без відомого користувача фільтр «моє» не діє (як groupTodayTasks)', () => {
    const s = buildWidgetSnapshot({ now: NOW, authed: true, tasks: [dueToday, someoneElse] });
    expect(s.tasks).toEqual({ done: 0, total: 2 });
  });
});

describe('buildWidgetSnapshot — час і кроки', () => {
  it('сума time_entries за сьогодні і найсвіжіший активний таймер', () => {
    const s = buildWidgetSnapshot({
      now: NOW, authed: true,
      timeEntries: [
        { id: '1', duration: 1800, date: at(9) },
        { id: '2', duration: 600, date: at(11) },
        { id: '3', duration: 7200, date: at(20, 0, -1) },
        { id: '4', duration: 'bad', date: at(12) },
      ],
      activeTimers: [
        { id: 't1', label: 'Старий', startedAt: at(13) },
        { id: 't2', label: '  Звіт  ', startedAt: at(15) },
        { id: 't3', label: 'Битий', startedAt: 'nope' },
      ],
    });
    expect(s.time.trackedSec).toBe(2400);
    expect(s.time.running).toEqual({ label: 'Звіт', startedAt: at(15), count: 2 });
  });

  it('кроки — запасне значення з записів здоровʼя, ціль 10 000', () => {
    const s = buildWidgetSnapshot({
      now: NOW, authed: true,
      healthEntries: [
        { id: 'h1', type: 'steps', value: 4000, date: at(8) },
        { id: 'h2', type: 'steps', value: 1500, date: at(12) },
        { id: 'h3', type: 'steps', value: 9000, date: at(8, 0, -1) },
      ],
    });
    expect(s.steps).toEqual({ value: 5500, goal: 10000 });
  });
});

describe('buildWidgetSnapshot — сесія, мова, підпис', () => {
  it('після виходу — жодних цифр акаунта', () => {
    const s = buildWidgetSnapshot({
      now: NOW, authed: false, lang: 'en',
      transactions: [{ id: 'x', type: 'income', amount: 5, date: at(10), accountId: '' }],
      tasks: [{ id: 'c', status: 'active', deadline: at(18) }],
    });
    expect(s.authed).toBe(false);
    expect(s.lang).toBe('en');
    expect(s.finance.income).toBe(0);
    expect(s.tasks.total).toBe(0);
    expect(s.day).toBe('2026-10-07');
  });

  it('невідома мова → українська; підпис не залежить від generatedAt', () => {
    const a = buildWidgetSnapshot({ now: NOW, authed: true, lang: 'de' });
    const b = buildWidgetSnapshot({ now: new Date(NOW.getTime() + 1000), authed: true, lang: 'de' });
    expect(a.lang).toBe('uk');
    expect(widgetSnapshotSignature(a)).toBe(widgetSnapshotSignature(b));
  });

  it('widgetRoleMap: стан синку перекриває workspace_projects', () => {
    expect(widgetRoleMap({ p1: { role: 'viewer' }, p3: { role: 'bogus' } }, [{ id: 'p1', role: 'owner' }, { id: 'p2', role: 'member' }]))
      .toEqual({ p1: 'viewer', p2: 'member' });
  });
});

describe('writeWidgetSnapshot', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sync = require('@/store/widget-sync') as typeof import('@/store/widget-sync');

  beforeEach(async () => {
    await AsyncStorage.clear();
  });
  afterEach(() => sync.__setWidgetBridgeForTests(undefined));

  it('пише JSON у міст і перезавантажує віджет лише коли знімок змінився', async () => {
    const write = jest.fn();
    const reload = jest.fn();
    sync.__setWidgetBridgeForTests({ write, reload });
    await AsyncStorage.setItem('time_entries', JSON.stringify([{ id: '1', duration: 60, date: NOW.toISOString() }]));

    expect(await sync.writeWidgetSnapshot({ authed: true, myUserId: 'u1' }, NOW)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0]).time.trackedSec).toBe(60);

    expect(await sync.writeWidgetSnapshot({ authed: true, myUserId: 'u1' }, NOW)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);

    expect(await sync.writeWidgetSnapshot({ authed: false }, NOW)).toBe(true);
    expect(JSON.parse(write.mock.calls[1][0]).authed).toBe(false);
  });

  it('без нативного мосту (Android/веб) — no-op', async () => {
    sync.__setWidgetBridgeForTests(null);
    expect(await sync.writeWidgetSnapshot({ authed: true }, NOW)).toBe(false);
  });

  it('на не-iOS міст навіть не завантажується', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
    try {
      sync.__setWidgetBridgeForTests(undefined);
      expect(await sync.writeWidgetSnapshot({ authed: true }, NOW)).toBe(false);
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
    }
  });

  it('ключ знімка збігається з тим, що читає Swift', () => {
    expect(WIDGET_SNAPSHOT_KEY).toBe('flowi_widget_snapshot_v1');
  });
});
