import {
  budgetSpentThisMonth, currentSprint, currentSprintStats, hoursThisWeekSeconds, startOfWeek,
} from '../utils/projectOverview';
import type { Sprint } from '../utils/sprintUtils';
import type { Transaction } from '../utils/financeUtils';
import type { Account } from '../utils/accounts';

describe('startOfWeek', () => {
  it('понеділок для середини тижня (середа)', () => {
    // 2026-09-16 — середа.
    const mon = startOfWeek(new Date(2026, 8, 16, 15, 30));
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(14);
  });

  it('неділя лишається в СВОЄМУ тижні (понеділок перед нею), а не в наступному', () => {
    // 2026-09-20 — неділя.
    const mon = startOfWeek(new Date(2026, 8, 20));
    expect(mon.getDate()).toBe(14);
  });
});

describe('hoursThisWeekSeconds', () => {
  const now = new Date(2026, 8, 16, 12); // середа
  it('рахує лише проєкт і лише з понеділка поточного тижня', () => {
    const entries = [
      { projectId: 'p1', duration: 3600, date: '2026-09-14' }, // понеділок — входить
      { projectId: 'p1', duration: 1800, date: '2026-09-10' }, // минулий тиждень — ні
      { projectId: 'p2', duration: 900, date: '2026-09-15' },  // чужий проєкт — ні
    ];
    expect(hoursThisWeekSeconds(entries, 'p1', now)).toBe(3600);
  });

  it('порожній список — 0, а не NaN', () => {
    expect(hoursThisWeekSeconds([], 'p1', now)).toBe(0);
  });
});

describe('currentSprint / currentSprintStats', () => {
  const sprints: Sprint[] = [
    { id: 's1', projectId: 'p1', name: 'Тиждень 1', createdAt: '2026-01-01T00:00:00Z' },
    { id: 's2', projectId: 'p1', name: 'Тиждень 2', createdAt: '2026-01-08T00:00:00Z' },
    { id: 's0', projectId: 'p1', name: 'Закритий', createdAt: '2025-12-01T00:00:00Z', closedAt: '2025-12-15T00:00:00Z' },
  ];

  it('перший ВІДКРИТИЙ спринт у порядку створення', () => {
    expect(currentSprint(sprints, 'p1')?.id).toBe('s1');
  });

  it('null, коли відкритих немає', () => {
    expect(currentSprint(sprints, 'p2')).toBeNull();
  });

  it('прогрес рахує лише задачі поточного спринта', () => {
    const tasks = [
      { id: 't1', status: 'done', sprintId: 's1' },
      { id: 't2', status: 'active', sprintId: 's1' },
      { id: 't3', status: 'done', sprintId: 's2' },
    ];
    const stats = currentSprintStats(sprints, tasks, 'p1');
    expect(stats?.sprint.id).toBe('s1');
    expect(stats).toMatchObject({ total: 2, done: 1 });
  });
});

describe('budgetSpentThisMonth', () => {
  const accounts: Account[] = [{ id: 'a1', name: 'Картка', kind: 'card', currency: 'USD', openingBalance: 0, createdAt: '2026-01-01' }];

  it('сумує лише витрати цього проєкту, цього місяця, у валюті бюджету', () => {
    const now = new Date(2026, 8, 15);
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', category: 'x', amount: 100, note: '', date: '2026-09-05', accountId: 'a1', projectId: 'p1' },
      { id: 't2', type: 'expense', category: 'x', amount: 50, note: '', date: '2026-08-05', accountId: 'a1', projectId: 'p1' }, // інший місяць
      { id: 't3', type: 'expense', category: 'x', amount: 20, note: '', date: '2026-09-06', accountId: 'a1', projectId: 'p2' }, // чужий проєкт
      { id: 't4', type: 'income', category: 'x', amount: 999, note: '', date: '2026-09-06', accountId: 'a1', projectId: 'p1' }, // не витрата
    ];
    expect(budgetSpentThisMonth(txs, accounts, 'p1', 'USD', now)).toBe(100);
  });

  it('витрати в іншій валюті не додаються (неврахований залишок, як в особистого бюджету)', () => {
    const now = new Date(2026, 8, 15);
    const uahAccount: Account[] = [{ id: 'a2', name: 'Готівка', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: '2026-01-01' }];
    const txs: Transaction[] = [
      { id: 't1', type: 'expense', category: 'x', amount: 500, note: '', date: '2026-09-05', accountId: 'a2', projectId: 'p1' },
    ];
    expect(budgetSpentThisMonth(txs, uahAccount, 'p1', 'USD', now)).toBe(0);
  });
});
