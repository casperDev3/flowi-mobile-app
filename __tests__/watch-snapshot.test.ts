/**
 * utils/watchSnapshot.ts — знімок дня для годинника (watch-lockscreen-v1.md §4).
 * Сервер рахує ту саму схему (`watch/snapshot.py`); годинник бере найновіший.
 */
import { buildWatchSnapshot, type WatchSnapshotInput } from '@/utils/watchSnapshot';

// Локальний полудень — тести не залежать від поясу машини.
const NOW = new Date(2026, 9, 18, 12, 0, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const ME = '7';

function input(overrides: Partial<WatchSnapshotInput> = {}): WatchSnapshotInput {
  return { now: NOW, tz: 'Europe/Kyiv', lang: 'uk', user: { id: ME, name: 'Ihor' }, myUserId: ME, ...overrides };
}

describe('завдання', () => {
  const tasks = [
    { id: 'later', title: 'Б пізніше', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 12) },
    { id: 'timed', title: 'З часом', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 15), deadlineHasTime: true, deadlineTimeAt: at(18, 15) },
    { id: 'overdue-new', title: 'Прострочене 2', status: 'active', subtasks: [], createdAt: '', deadline: at(16, 12) },
    { id: 'overdue-old', title: 'Прострочене 1', status: 'active', subtasks: [], createdAt: '', deadline: at(10, 12) },
    { id: 'done-early', title: 'Готове рано', status: 'done', subtasks: [], createdAt: '', history: [{ id: 'd', at: at(18, 8), type: 'done' }] },
    { id: 'done-late', title: 'Готове пізно', status: 'done', subtasks: [], createdAt: '', history: [{ id: 'd', at: at(18, 10), type: 'done' }] },
    { id: 'tomorrow', title: 'Завтра', status: 'active', subtasks: [], createdAt: '', deadline: at(19, 12) },
    { id: 'backlog', title: 'Ідея', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 12), backlogKind: 'idea' },
    { id: 'review', title: 'Перевірка', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 13), reviewRequired: true },
    { id: 'viewer', title: 'Чуже', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 13), projectId: 'PV', assigneeId: ME },
    { id: 'proj', title: 'Проєктне', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 13), projectId: 'P', assigneeId: ME, recurrence: { freq: 'daily', interval: 1 } },
    { id: 'theirs', title: 'Не моє', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 13), projectId: 'P', assigneeId: '9' },
  ];

  it('мої сьогоднішні, у порядку §4, з лічильниками', () => {
    const snap = buildWatchSnapshot(input({
      tasks,
      projectRoles: { P: 'member', PV: 'viewer' },
      projects: [{ id: 'P', name: 'Сайт' }],
      activeTimers: [{ id: 'task:proj', taskId: 'proj', label: 'Проєктне', startedAt: at(18, 11) }],
    }));
    expect(snap.tasks.map(t => t.id)).toEqual([
      'overdue-old', 'overdue-new', 'timed', 'later', 'review', 'proj', 'done-late', 'done-early',
    ]);
    // «Перевірка» й «Проєктне» мають однаковий дедлайн — далі за назвою.
    expect(snap.taskCounts).toEqual({ done: 2, total: 8 });
    const byId = Object.fromEntries(snap.tasks.map(t => [t.id, t]));
    expect(byId['overdue-old'].overdue).toBe(true);
    expect(byId.timed.hasTime).toBe(true);
    expect(byId.review.canComplete).toBe(false);
    expect(byId['done-late'].canComplete).toBe(false);
    expect(byId.proj).toEqual(expect.objectContaining({
      projectId: 'P', projectName: 'Сайт', timerId: 'task:proj', recurring: true, canComplete: true,
    }));
  });
});

describe('звички, таймери', () => {
  it('doneToday і серія — як habitDoneToday/habitStreak', () => {
    const snap = buildWatchSnapshot(input({
      habits: [
        { id: 'h1', title: 'Вода', icon: 'drop.fill', color: '#0EA5E9', createdAt: '', log: [at(18, 8), at(17, 8), at(16, 8), at(14, 8)] },
        { id: 'h2', title: 'Біг', icon: 'figure.run', color: '#10B981', createdAt: '', log: [at(17, 8), at(16, 8)] },
      ],
    }));
    expect(snap.habits).toEqual([
      { id: 'h1', title: 'Вода', icon: 'drop.fill', color: '#0EA5E9', doneToday: true, streak: 3 },
      { id: 'h2', title: 'Біг', icon: 'figure.run', color: '#10B981', doneToday: false, streak: 2 },
    ]);
  });

  it('активні від найстаріших, час за сьогодні, останні мітки вільних сесій', () => {
    const snap = buildWatchSnapshot(input({
      activeTimers: [
        { id: 'adhoc:b', label: 'Пошта', startedAt: at(18, 11) },
        { id: 'adhoc:a', label: 'Читання', startedAt: at(18, 9) },
      ],
      timeEntries: [
        { id: 'e1', task: 'Спорт', duration: 600, date: at(18, 8) },
        { id: 'e2', task: 'Звіт', taskId: 't1', duration: 900, date: at(18, 7) },
        { id: 'e3', task: 'Пошта', duration: 300, date: at(17, 7) },
        { id: 'e4', task: 'Музика', duration: 300, date: at(16, 7) },
      ],
    }));
    expect(snap.timers.active.map(t => t.id)).toEqual(['adhoc:a', 'adhoc:b']);
    expect(snap.timers.trackedTodaySec).toBe(1500);
    expect(snap.timers.recentLabels).toEqual(['Пошта', 'Читання', 'Спорт']);
  });
});

describe('фінанси', () => {
  it('топ-6 категорій за 90 днів, доповнення збереженими й типовими; рахунок останньої витрати', () => {
    const tx = (category: string, day: number, accountId = 'a1') =>
      ({ id: `${category}${day}`, type: 'expense', category, amount: 1, note: '', date: at(day, 10), accountId });
    const snap = buildWatchSnapshot(input({
      transactions: [
        tx('Кава', 10), tx('Кава', 11), tx('Таксі', 12), tx('Таксі', 13), tx('Книги', 14, 'a2'),
        { ...tx('Стара', 1), date: new Date(2026, 3, 1).toISOString() },
        { ...tx('Зарплата', 15), type: 'income' },
      ],
      categories: [
        { id: 'expense:Кава', type: 'expense', name: 'Кава', icon: 'cup.and.saucer.fill' },
        { id: 'expense:Подарунки', type: 'expense', name: 'Подарунки', icon: 'gift.fill' },
      ],
      accounts: [
        { id: 'a1', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 0, createdAt: '' },
        { id: 'a2', name: 'Готівка', kind: 'cash', currency: 'EUR', openingBalance: 0, createdAt: '' },
        { id: 'a3', name: 'Архів', kind: 'card', currency: 'UAH', openingBalance: 0, createdAt: '', archived: true },
      ],
      currencies: [{ code: 'EUR', symbol: '€', kind: 'fiat', decimals: 2 }],
    }));
    // Таксі й Кава по 2 — свіжіше використана йде першою.
    expect(snap.finance.categories.map(c => c.name)).toEqual(['Таксі', 'Кава', 'Книги', 'Подарунки', 'Їжа', 'Транспорт']);
    expect(snap.finance.categories[1].icon).toBe('cup.and.saucer.fill');
    expect(snap.finance.defaultAccountId).toBe('a2');
    expect(snap.finance.accounts).toEqual([
      { id: 'a2', name: 'Готівка', currency: 'EUR', symbol: '€', decimals: 2, kind: 'cash' },
      { id: 'a1', name: 'Картка', currency: 'UAH', symbol: '₴', decimals: 2, kind: 'card' },
    ]);
  });

  it('без витрат — правило defaultAccountId (не заощадження)', () => {
    const snap = buildWatchSnapshot(input({
      lang: 'en',
      accounts: [
        { id: 's', name: 'Saving', kind: 'savings', currency: 'USD', openingBalance: 0, createdAt: '' },
        { id: 'c', name: 'Cash', kind: 'cash', currency: 'USD', openingBalance: 0, createdAt: '' },
      ],
    }));
    expect(snap.finance.defaultAccountId).toBe('c');
    expect(snap.finance.categories.map(c => c.name)).toEqual(['Food', 'Transport', 'Entertainment', 'Health', 'Utilities', 'Clothing']);
  });
});

describe('зустрічі', () => {
  it('сьогодні й завтра з повторами, за часом; скасовані — ні', () => {
    const snap = buildWatchSnapshot(input({
      meetings: [
        { id: 'm1', title: 'Стендап', date: '2026-10-01', time: '09:30', durationMinutes: 15, color: '#000', recurrence: { freq: 'daily', interval: 1 } },
        { id: 'm2', title: 'Демо', date: '2026-10-18', time: '08:00', durationMinutes: 60, color: '#000', location: ' Зал ' },
        { id: 'm3', title: 'Скасована', date: '2026-10-18', time: '10:00', durationMinutes: 60, color: '#000', integrationCancelled: true },
        { id: 'm4', title: 'Післязавтра', date: '2026-10-20', time: '10:00', durationMinutes: 60, color: '#000' },
      ],
    }));
    expect(snap.meetings.map(m => m.key)).toEqual(['m2@2026-10-18', 'm1@2026-10-18', 'm1@2026-10-19']);
    expect(snap.meetings[0]).toEqual({
      key: 'm2@2026-10-18', meetingId: 'm2', title: 'Демо', date: '2026-10-18', time: '08:00',
      durationMinutes: 60, startsAt: at(18, 8), location: 'Зал',
    });
  });

  it('обгортка: версія, джерело, доба, мова', () => {
    const snap = buildWatchSnapshot(input({ lang: 'fr' }));
    expect(snap).toEqual(expect.objectContaining({
      v: 1, source: 'phone', generatedAt: NOW.toISOString(), day: '2026-10-18', tz: 'Europe/Kyiv', lang: null,
      user: { id: ME, name: 'Ihor' },
    }));
  });
});
