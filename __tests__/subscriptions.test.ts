/**
 * __tests__/subscriptions.test.ts — правила підписок (CONTRACT.md §G.2/G.4).
 *
 * Логіка мусить збігатися з вебом (lib/subscriptions.ts): ті самі відповіді
 * на ті самі дані. Перевіряються РІШЕННЯ: дата наступного циклу, статус,
 * що дописується в історію, як рахуються суми і які нагадування плануються.
 */

import {
  DEFAULT_REMINDER_DAYS,
  IOS_PENDING_NOTIFICATION_LIMIT,
  MAX_SUBSCRIPTION_REMINDERS,
  RESERVED_NOTIFICATION_SLOTS,
  subscriptionReminderBudget,
  REMINDER_DAY_OPTIONS,
  UNITS_PER_YEAR,
  addDaysKey,
  addPeriod,
  applySubscriptionDraft,
  archiveSubscription,
  daysBetween,
  daysInMonth,
  draftFromSubscription,
  emptySubscriptionDraft,
  formatPeriod,
  formatSubscriptionMoney,
  formatTotalsLine,
  limitSubscriptionReminders,
  mergeSubscriptionWrite,
  monthlyEquivalent,
  newSubscriptionId,
  normalizeSubscription,
  normalizeSubscriptions,
  parseAmountInput,
  rebaseSubscriptionDraft,
  renewSubscription,
  restoreSubscription,
  sortSubscriptions,
  subscriptionReminderPlan,
  subscriptionLink,
  subscriptionStatus,
  subscriptionsForProject,
  totalsByCurrency,
  ukPluralIndex,
  upcomingPayments,
  yearlyEquivalent,
  type Subscription,
} from '@/utils/subscriptions';

function sub(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1',
    name: 'Netflix',
    amount: 10,
    currency: 'USD',
    period: { every: 1, unit: 'month' },
    nextPaymentDate: '2026-09-20',
    reminderDaysBefore: 1,
    icon: 'tv.fill',
    color: '#EF4444',
    history: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  };
}

describe('константи', () => {
  it('збігаються з контрактом', () => {
    expect([...REMINDER_DAY_OPTIONS]).toEqual([0, 1, 3, 7]);
    expect(DEFAULT_REMINDER_DAYS).toBe(1);
    expect(UNITS_PER_YEAR).toEqual({ day: 365, week: 52, month: 12, year: 1 });
  });

  it('id має формат sub-… і не довший за 64 символи', () => {
    const a = newSubscriptionId();
    const b = newSubscriptionId();
    expect(a).toMatch(/^sub-[0-9a-z]+-[0-9a-z]+-[0-9a-z]{8}$/);
    expect(a.length).toBeLessThanOrEqual(64);
    expect(a).not.toBe(b);
  });
});

describe('дати', () => {
  it('daysInMonth враховує високосні роки', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('addDaysKey переходить через місяць і рік', () => {
    expect(addDaysKey('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysKey('bad', 3)).toBe('bad');
  });

  it('daysBetween — цілі дні, знак за напрямком', () => {
    expect(daysBetween('2026-09-13', '2026-09-20')).toBe(7);
    expect(daysBetween('2026-09-20', '2026-09-13')).toBe(-7);
    // через перехід на зимовий час (жовтень) — все одно цілі дні
    expect(daysBetween('2026-10-20', '2026-10-30')).toBe(10);
    expect(Number.isNaN(daysBetween('x', '2026-01-01'))).toBe(true);
  });
});

describe('addPeriod', () => {
  it('дні й тижні', () => {
    expect(addPeriod('2026-09-13', { every: 10, unit: 'day' })).toBe('2026-09-23');
    expect(addPeriod('2026-09-13', { every: 2, unit: 'week' })).toBe('2026-09-27');
  });

  it('місяці з обрізанням дня і якорем billingDay', () => {
    expect(addPeriod('2026-01-31', { every: 1, unit: 'month' })).toBe('2026-02-28');
    // без якоря день «сповзає» до 28
    expect(addPeriod('2026-02-28', { every: 1, unit: 'month' })).toBe('2026-03-28');
    // з якорем 31 — повертається на 31
    expect(addPeriod('2026-02-28', { every: 1, unit: 'month' }, 31)).toBe('2026-03-31');
    expect(addPeriod('2026-11-15', { every: 3, unit: 'month' })).toBe('2027-02-15');
  });

  it('роки: 29 лютого → 28 лютого', () => {
    expect(addPeriod('2024-02-29', { every: 1, unit: 'year' })).toBe('2025-02-28');
    expect(addPeriod('2025-02-28', { every: 3, unit: 'year' }, 29)).toBe('2028-02-29');
  });

  it('every < 1 чи NaN → 1; невалідна дата — без змін', () => {
    expect(addPeriod('2026-09-13', { every: 0, unit: 'day' })).toBe('2026-09-14');
    expect(addPeriod('2026-09-13', { every: NaN, unit: 'week' })).toBe('2026-09-20');
    expect(addPeriod('2026-13-01', { every: 1, unit: 'month' })).toBe('2026-13-01');
  });
});

describe('subscriptionStatus', () => {
  const today = '2026-09-13';
  it('day of payment is still active; past is overdue', () => {
    expect(subscriptionStatus(sub({ nextPaymentDate: today }), today)).toBe('active');
    expect(subscriptionStatus(sub({ nextPaymentDate: '2026-09-12' }), today)).toBe('overdue');
    expect(subscriptionStatus(sub({ nextPaymentDate: '2026-10-01' }), today)).toBe('active');
  });

  it('archivedAt або минула дата завершення → archived', () => {
    expect(subscriptionStatus(sub({ archivedAt: '2026-09-01T00:00:00Z' }), today)).toBe('archived');
    expect(subscriptionStatus(sub({ endDate: '2026-09-12', nextPaymentDate: '2026-09-01' }), today)).toBe('archived');
    expect(subscriptionStatus(sub({ endDate: today }), today)).toBe('active');
  });
});

describe('renew / archive / restore', () => {
  const now = new Date('2026-09-13T12:00:00.000Z');

  it('продовження: один період, історія, сума за замовчуванням', () => {
    const s = sub({ nextPaymentDate: '2026-09-10', note: 'keep', extra: 'from-web' } as Partial<Subscription>);
    const next = renewSubscription(s, { now });
    expect(next.nextPaymentDate).toBe('2026-10-10');
    expect(next.amount).toBe(10);
    expect(next.history).toEqual([{ date: '2026-09-10', amount: 10, currency: 'USD', renewedAt: now.toISOString() }]);
    expect(next.note).toBe('keep');
    expect((next as unknown as { extra: string }).extra).toBe('from-web');
    // вихідний об'єкт не мутується
    expect(s.history).toEqual([]);
  });

  it('нова ціна переписує amount і йде в історію', () => {
    const next = renewSubscription(sub({ history: [{ date: '2026-08-20', amount: 9 }] }), { amount: 12, now });
    expect(next.amount).toBe(12);
    expect(next.history).toHaveLength(2);
    expect(next.history[1]).toMatchObject({ date: '2026-09-20', amount: 12 });
  });

  it('якір billingDay береться з підписки', () => {
    const next = renewSubscription(sub({ nextPaymentDate: '2026-02-28', billingDay: 31 }), { now });
    expect(next.nextPaymentDate).toBe('2026-03-31');
  });

  it('архівування і відновлення', () => {
    const archived = archiveSubscription(sub(), now);
    expect(archived.archivedAt).toBe(now.toISOString());
    const restored = restoreSubscription(archived, '2026-09-13');
    expect('archivedAt' in restored).toBe(false);
    expect(subscriptionStatus(restored, '2026-09-13')).toBe('active');
  });

  it('відновлення прибирає минулу дату завершення, майбутню лишає', () => {
    const ended = sub({ endDate: '2026-09-01' });
    const restored = restoreSubscription(ended, '2026-09-13');
    expect('endDate' in restored).toBe(false);
    const future = restoreSubscription(sub({ endDate: '2026-12-01', archivedAt: 'x' }), '2026-09-13');
    expect(future.endDate).toBe('2026-12-01');
  });
});

describe('суми', () => {
  it('нормалізація довільних періодів', () => {
    expect(yearlyEquivalent({ amount: 10, period: { every: 1, unit: 'month' } })).toBe(120);
    expect(monthlyEquivalent({ amount: 120, period: { every: 1, unit: 'year' } })).toBe(10);
    expect(yearlyEquivalent({ amount: 30, period: { every: 3, unit: 'month' } })).toBe(120);
    expect(yearlyEquivalent({ amount: 1, period: { every: 5, unit: 'day' } })).toBe(73);
    expect(yearlyEquivalent({ amount: 2, period: { every: 2, unit: 'week' } })).toBe(52);
  });

  it('totalsByCurrency: без архівних, без конвертації, monthly desc', () => {
    const today = '2026-09-13';
    const rows = totalsByCurrency([
      sub({ id: 'a', currency: 'USD', amount: 10 }),
      sub({ id: 'b', currency: 'USD', amount: 22 }),
      sub({ id: 'c', currency: 'UAH', amount: 450 }),
      sub({ id: 'd', currency: 'UAH', amount: 1000, archivedAt: 'x' }),
      sub({ id: 'e', currency: 'EUR', amount: 120, period: { every: 1, unit: 'year' } }),
    ], today);
    expect(rows.map(r => r.currency)).toEqual(['UAH', 'USD', 'EUR']);
    expect(rows[0]).toEqual({ currency: 'UAH', monthly: 450, yearly: 5400 });
    expect(rows[1]).toEqual({ currency: 'USD', monthly: 32, yearly: 384 });
    expect(rows[2].monthly).toBeCloseTo(10);
  });

  it('однакові monthly — за кодом валюти', () => {
    const rows = totalsByCurrency([sub({ id: 'a', currency: 'USD' }), sub({ id: 'b', currency: 'EUR' })], '2026-09-13');
    expect(rows.map(r => r.currency)).toEqual(['EUR', 'USD']);
  });
});

describe('списки', () => {
  const today = '2026-09-13';

  it('sortSubscriptions: дата, назва, id', () => {
    const sorted = sortSubscriptions([
      sub({ id: '3', name: 'Б', nextPaymentDate: '2026-09-20' }),
      sub({ id: '2', name: 'А', nextPaymentDate: '2026-09-20' }),
      sub({ id: '1', name: 'Я', nextPaymentDate: '2026-09-14' }),
      sub({ id: '0', name: 'А', nextPaymentDate: '2026-09-20' }),
    ]);
    expect(sorted.map(s => s.id)).toEqual(['1', '0', '2', '3']);
  });

  it('upcomingPayments: прострочені й найближчі 7 днів, без архівних', () => {
    const rows = upcomingPayments([
      sub({ id: 'late', nextPaymentDate: '2026-09-10' }),
      sub({ id: 'today', nextPaymentDate: today }),
      sub({ id: 'edge', nextPaymentDate: '2026-09-20' }),
      sub({ id: 'far', nextPaymentDate: '2026-09-21' }),
      sub({ id: 'arch', nextPaymentDate: '2026-09-14', archivedAt: 'x' }),
    ], today);
    expect(rows.map(r => r.subscription.id)).toEqual(['late', 'today', 'edge']);
    expect(rows[0]).toMatchObject({ daysUntil: -3, status: 'overdue' });
    expect(rows[1]).toMatchObject({ daysUntil: 0, status: 'active' });
    expect(upcomingPayments([sub({ nextPaymentDate: '2026-09-21' })], today, 30)).toHaveLength(1);
  });

  it('subscriptionsForProject', () => {
    const list = [sub({ id: 'a', projectId: 'p1' }), sub({ id: 'b', projectId: 'p2' }), sub({ id: 'c' })];
    expect(subscriptionsForProject(list, 'p1').map(s => s.id)).toEqual(['a']);
    expect(subscriptionsForProject(list, '')).toEqual([]);
  });
});

describe('formatPeriod', () => {
  it('українська множина', () => {
    expect(formatPeriod({ every: 1, unit: 'month' })).toBe('щомісяця');
    expect(formatPeriod({ every: 1, unit: 'day' })).toBe('щодня');
    expect(formatPeriod({ every: 1, unit: 'week' })).toBe('щотижня');
    expect(formatPeriod({ every: 1, unit: 'year' })).toBe('щороку');
    expect(formatPeriod({ every: 3, unit: 'month' })).toBe('кожні 3 місяці');
    expect(formatPeriod({ every: 5, unit: 'day' })).toBe('кожні 5 днів');
    expect(formatPeriod({ every: 11, unit: 'week' })).toBe('кожні 11 тижнів');
    expect(formatPeriod({ every: 21, unit: 'day' })).toBe('кожні 21 день');
    expect(formatPeriod({ every: 2, unit: 'year' })).toBe('кожні 2 роки');
    expect(formatPeriod({ every: 12, unit: 'month' })).toBe('кожні 12 місяців');
  });

  it('англійська', () => {
    expect(formatPeriod({ every: 1, unit: 'month' }, 'en')).toBe('monthly');
    expect(formatPeriod({ every: 2, unit: 'week' }, 'en')).toBe('every 2 weeks');
  });

  it('ukPluralIndex', () => {
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 111].map(ukPluralIndex)).toEqual([0, 1, 1, 2, 2, 2, 2, 0, 1, 2, 2]);
  });
});

describe('normalizeSubscription', () => {
  it('заповнює відсутні поля і зберігає невідомі', () => {
    const n = normalizeSubscription({ id: 'x', name: 'Spotify', amount: 5, nextPaymentDate: '2026-09-20', futureField: 1 });
    expect(n).toMatchObject({
      id: 'x', currency: 'UAH', period: { every: 1, unit: 'month' }, reminderDaysBefore: 1, history: [],
    });
    expect((n as unknown as { futureField: number }).futureField).toBe(1);
  });

  it('відкидає записи без id і не-масиви', () => {
    expect(normalizeSubscription(null)).toBeNull();
    expect(normalizeSubscription({ name: 'no id' })).toBeNull();
    expect(normalizeSubscriptions({ not: 'array' })).toEqual([]);
    expect(normalizeSubscriptions([{ id: 'a', name: 'A', nextPaymentDate: '2026-09-20' }, 5, null])).toHaveLength(1);
  });

  it('як у вебі: без назви або з битою датою оплати — приховано', () => {
    expect(normalizeSubscription({ id: 'a', name: '', nextPaymentDate: '2026-09-20' })).toBeNull();
    expect(normalizeSubscription({ id: 'a', name: '   ', nextPaymentDate: '2026-09-20' })).toBeNull();
    expect(normalizeSubscription({ id: 'a', name: 'A' })).toBeNull();
    expect(normalizeSubscription({ id: 'a', name: 'A', nextPaymentDate: '2026-02-30' })).toBeNull();
    expect(normalizeSubscriptions([
      { id: 'a', name: 'A', nextPaymentDate: '2026-09-20', amount: 5 },
      { id: 'b', name: '', nextPaymentDate: '2026-09-20', amount: 5 },
      { id: 'c', name: 'C', nextPaymentDate: '', amount: 5 },
    ]).map(x => x.id)).toEqual(['a']);
    expect(normalizeSubscription({ id: 'a', name: ' A ', nextPaymentDate: '2026-09-20' })?.name).toBe('A');
  });

  it('reminderDaysBefore = 0 лишається нулем', () => {
    expect(normalizeSubscription({ id: 'a', name: 'A', nextPaymentDate: '2026-09-20', reminderDaysBefore: 0 })?.reminderDaysBefore).toBe(0);
  });
});

describe('subscriptionReminderPlan', () => {
  // 13 вересня 2026, 08:00 локального часу
  const now = new Date(2026, 8, 13, 8, 0, 0);

  it('архівна — нічого', () => {
    expect(subscriptionReminderPlan(sub({ archivedAt: 'x' }), now)).toEqual([]);
  });

  it('активна: за N днів і в день оплати о 9:00', () => {
    const plan = subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-20', reminderDaysBefore: 3 }), now);
    // Одна підписка — не більше 4 слотів ОС (before + due + 2 follow-up).
    expect(plan.map(p => p.id)).toEqual([
      'sub_s1_before', 'sub_s1_due', 'sub_s1_overdue_1', 'sub_s1_overdue_3',
    ]);
    expect(plan[0].fireAt).toEqual(new Date(2026, 8, 17, 9, 0, 0));
    expect(plan[1].fireAt).toEqual(new Date(2026, 8, 20, 9, 0, 0));
  });

  it('0 днів — лише в день оплати; минулі моменти не плануються', () => {
    const noFollowUps = (plan: ReturnType<typeof subscriptionReminderPlan>) => plan.filter(p => p.kind !== 'overdue');
    expect(noFollowUps(subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-20', reminderDaysBefore: 0 }), now)).map(p => p.kind))
      .toEqual(['due']);
    // «за 1 день» = сьогодні 9:00, ще попереду (зараз 8:00)
    expect(noFollowUps(subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-14', reminderDaysBefore: 1 }), now)).map(p => p.kind))
      .toEqual(['before', 'due']);
    const late = new Date(2026, 8, 13, 10, 0, 0);
    expect(noFollowUps(subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-13', reminderDaysBefore: 7 }), late))).toEqual([]);
  });

  it('активна: разові «Прострочено» на +1 і +3 дні о 9:00, не пізніше дати завершення', () => {
    const late = new Date(2026, 8, 13, 10, 0, 0);
    // день оплати — сьогодні, 9:00 вже минула: лишаються лише наступні дні
    const plan = subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-13', reminderDaysBefore: 0 }), late);
    expect(plan.map(p => p.id)).toEqual(['sub_s1_overdue_1', 'sub_s1_overdue_3']);
    expect(plan.every(p => p.kind === 'overdue' && !p.daily)).toBe(true);
    expect(plan[0].fireAt).toEqual(new Date(2026, 8, 14, 9, 0, 0));
    expect(plan[1].fireAt).toEqual(new Date(2026, 8, 16, 9, 0, 0));
    const ending = subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-20', reminderDaysBefore: 0, endDate: '2026-09-22' }), now);
    expect(ending.map(p => p.id)).toEqual(['sub_s1_due', 'sub_s1_overdue_1', 'sub_s1_end']);
  });

  it('прострочена — щоденне нагадування', () => {
    expect(subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-10' }), now)).toEqual([
      { id: 'sub_s1_overdue', kind: 'overdue', daily: { hour: 9, minute: 0 } },
    ]);
  });

  it('дата завершення — за 7 днів', () => {
    const plan = subscriptionReminderPlan(sub({ nextPaymentDate: '2026-09-20', reminderDaysBefore: 0, endDate: '2026-10-01' }), now)
      .filter(p => !p.id.includes('_overdue_'));
    expect(plan.map(p => p.id)).toEqual(['sub_s1_due', 'sub_s1_end']);
    expect(plan[1].fireAt).toEqual(new Date(2026, 8, 24, 9, 0, 0));
  });
});

describe('limitSubscriptionReminders', () => {
  const now = new Date(2026, 8, 13, 8, 0, 0);

  it('лише в межах вікна, щоденні першими, найближчі разові, стеля', () => {
    const specs = [
      { id: 'sub_far_due', kind: 'due' as const, fireAt: new Date(2026, 10, 30, 9, 0, 0) },
      { id: 'sub_b_due', kind: 'due' as const, fireAt: new Date(2026, 8, 20, 9, 0, 0) },
      { id: 'sub_x_overdue', kind: 'overdue' as const, daily: { hour: 9, minute: 0 } },
      { id: 'sub_a_before', kind: 'before' as const, fireAt: new Date(2026, 8, 15, 9, 0, 0) },
      { id: 'sub_past', kind: 'due' as const, fireAt: new Date(2026, 8, 12, 9, 0, 0) },
    ];
    expect(limitSubscriptionReminders(specs, now).map(s => s.id))
      .toEqual(['sub_x_overdue', 'sub_a_before', 'sub_b_due']);
    expect(limitSubscriptionReminders(specs, now, { max: 2 }).map(s => s.id))
      .toEqual(['sub_x_overdue', 'sub_a_before']);
    expect(limitSubscriptionReminders(specs, now, { horizonDays: 90 }).map(s => s.id))
      .toContain('sub_far_due');
  });

  it('20 підписок не займають більше 20 слотів ОС', () => {
    const plans = Array.from({ length: 20 }, (_, i) =>
      subscriptionReminderPlan(sub({ id: `s${i}`, nextPaymentDate: addDaysKey('2026-09-14', i), reminderDaysBefore: 1 }), now)).flat();
    const limited = limitSubscriptionReminders(plans, now);
    expect(plans.length).toBeGreaterThan(20);
    expect(limited).toHaveLength(20);
    const times = limited.map(s => s.fireAt!.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('subscriptionReminderBudget', () => {
  it('iOS: бюджет від уже запланованих чужих нагадувань, із запасом 10 слотів', () => {
    expect(subscriptionReminderBudget('ios', 0)).toBe(MAX_SUBSCRIPTION_REMINDERS);
    expect(subscriptionReminderBudget('ios', 34)).toBe(20);
    expect(subscriptionReminderBudget('ios', 44)).toBe(10);
    expect(subscriptionReminderBudget('ios', 54)).toBe(0);
    expect(subscriptionReminderBudget('ios', 80)).toBe(0);
  });

  it('Android або невідома кількість — звичайна стеля', () => {
    expect(subscriptionReminderBudget('android', 60)).toBe(MAX_SUBSCRIPTION_REMINDERS);
    expect(subscriptionReminderBudget('ios', null)).toBe(MAX_SUBSCRIPTION_REMINDERS);
  });

  it('разом із чужими не перевищує ліміт iOS', () => {
    const now = new Date(2026, 8, 13, 8, 0, 0);
    const plans = Array.from({ length: 10 }, (_, i) =>
      subscriptionReminderPlan(sub({ id: `s${i}`, nextPaymentDate: addDaysKey('2026-09-14', i), reminderDaysBefore: 1 }), now)).flat();
    const others = 50;
    const limited = limitSubscriptionReminders(plans, now, { max: subscriptionReminderBudget('ios', others) });
    expect(limited.length + others).toBeLessThanOrEqual(IOS_PENDING_NOTIFICATION_LIMIT - RESERVED_NOTIFICATION_SLOTS);
  });
});

describe('mergeSubscriptionWrite — пише від сирого запису', () => {
  const raw = {
    id: 's1', name: 'Netflix', amount: '10', nextPaymentDate: '2026-09-20',
    period: { every: 1, unit: 'fortnight', anchor: 'x' },
    history: [{ date: '2026-08-20', amount: 10 }, { when: '2026-07-20', paid: 10 }],
    futureField: 7,
  } as Record<string, unknown>;

  it('продовження: невідомі записи історії й сирі значення лишаються', () => {
    const n = normalizeSubscription(raw)!;
    const out = mergeSubscriptionWrite(raw, n, renewSubscription(n, { now: new Date('2026-09-13T12:00:00Z') }));
    expect(out.history).toEqual([
      { date: '2026-08-20', amount: 10 },
      { when: '2026-07-20', paid: 10 },
      { date: '2026-09-20', amount: 10, currency: 'UAH', renewedAt: '2026-09-13T12:00:00.000Z' },
    ]);
    expect(out.period).toEqual(raw.period);
    expect(out.amount).toBe('10');
    expect('currency' in out).toBe(false);
    expect(out.futureField).toBe(7);
    expect(out.nextPaymentDate).toBe('2026-10-20');
  });

  it('архів і відновлення: історію не чіпає, прибрані поля видаляє', () => {
    const n = normalizeSubscription(raw)!;
    const archived = mergeSubscriptionWrite(raw, n, archiveSubscription(n, new Date('2026-09-13T12:00:00Z')));
    expect(archived.history).toBe(raw.history);
    expect(archived.archivedAt).toBe('2026-09-13T12:00:00.000Z');
    const n2 = normalizeSubscription(archived)!;
    const restored = mergeSubscriptionWrite(archived, n2, restoreSubscription(n2, '2026-09-13'));
    expect('archivedAt' in restored).toBe(false);
    expect(restored.history).toBe(raw.history);
  });

  it('правка: незмінені поля лишаються сирими, змінені пишуться', () => {
    const n = normalizeSubscription(raw)!;
    const res = applySubscriptionDraft(n, { ...draftFromSubscription(n), name: 'Netflix HD' }, { now: new Date('2026-09-13T12:00:00Z') });
    if (!res.ok) throw new Error('expected ok');
    const out = mergeSubscriptionWrite(raw, n, res.subscription);
    expect(out.name).toBe('Netflix HD');
    expect(out.history).toBe(raw.history);
    expect(out.amount).toBe('10');
    expect(out.period).toEqual(raw.period);
    expect(out.futureField).toBe(7);
  });
});

describe('rebaseSubscriptionDraft — синк під час відкритої форми', () => {
  const now = new Date('2026-09-13T12:00:00.000Z');

  it('продовження з іншого пристрою не відкочується, правка користувача застосовується', () => {
    const opened = sub({ nextPaymentDate: '2026-01-31', billingDay: 31, amount: 10 });
    const original = draftFromSubscription(opened);
    const edited = { ...original, note: 'сімейний план' };
    // тим часом на вебі: «Продовжено» з новою сумою
    const fresh = renewSubscription(opened, { amount: 12, now });
    expect(fresh.nextPaymentDate).toBe('2026-02-28');
    const rebased = rebaseSubscriptionDraft(original, edited, draftFromSubscription(fresh));
    const res = applySubscriptionDraft(fresh, rebased, { now });
    if (!res.ok) throw new Error('expected ok');
    expect(res.subscription.nextPaymentDate).toBe('2026-02-28');
    expect(res.subscription.amount).toBe(12);
    expect(res.subscription.billingDay).toBe(31);
    expect(res.subscription.history).toHaveLength(1);
    expect(res.subscription.note).toBe('сімейний план');
  });

  it('змінене користувачем поле перемагає свіже', () => {
    const opened = sub({ amount: 10 });
    const original = draftFromSubscription(opened);
    const edited = { ...original, amount: '15' };
    const fresh = draftFromSubscription({ ...opened, amount: 12, name: 'Netflix Premium' });
    const rebased = rebaseSubscriptionDraft(original, edited, fresh);
    expect(rebased.amount).toBe('15');
    expect(rebased.name).toBe('Netflix Premium');
  });
});

describe('форма: applySubscriptionDraft', () => {
  const now = new Date('2026-09-13T12:00:00.000Z');
  const newId = () => 'sub-new';

  it('створення: усі поля з чернетки, billingDay = день дати, порожні необовʼязкові відсутні', () => {
    const draft = { ...emptySubscriptionDraft({ today: '2026-09-13', currency: 'USD' }), name: '  Spotify ', amount: '9,99', nextPaymentDate: '2026-09-30' };
    const res = applySubscriptionDraft(null, draft, { now, newId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.subscription).toEqual({
      id: 'sub-new', name: 'Spotify', amount: 9.99, currency: 'USD', period: { every: 1, unit: 'month' },
      nextPaymentDate: '2026-09-30', billingDay: 30, reminderDaysBefore: 1, icon: 'repeat', color: '#8B5CF6',
      history: [], createdAt: now.toISOString(), updatedAt: now.toISOString(),
    });
  });

  it('правка: зберігає історію, archivedAt, createdAt і невідомі поля; очищені поля видаляє', () => {
    const existing = {
      ...sub({ nextPaymentDate: '2026-02-28', billingDay: 31, projectId: 'p1', note: 'n', url: 'x.com', category: 'Їжа', categoryId: 'expense:Їжа', history: [{ date: '2026-01-31', amount: 10 }] }),
      futureField: { a: 1 },
    } as Subscription;
    const draft = { ...draftFromSubscription(existing), name: 'Netflix HD', projectId: null, note: '', url: '', category: null };
    const res = applySubscriptionDraft(existing, draft, { now });
    if (!res.ok) throw new Error('expected ok');
    const s = res.subscription as Subscription & { futureField?: unknown };
    expect(s.id).toBe('s1');
    expect(s.name).toBe('Netflix HD');
    expect(s.history).toEqual(existing.history);
    expect(s.createdAt).toBe(existing.createdAt);
    expect(s.futureField).toEqual({ a: 1 });
    // дата не змінилась — якір 31 лишається
    expect(s.billingDay).toBe(31);
    for (const key of ['projectId', 'note', 'url', 'category', 'categoryId', 'endDate']) {
      expect(key in s).toBe(false);
    }
  });

  it('правка дати оновлює billingDay', () => {
    const existing = sub({ nextPaymentDate: '2026-09-20', billingDay: 20 });
    const res = applySubscriptionDraft(existing, { ...draftFromSubscription(existing), nextPaymentDate: '2026-09-25' }, { now });
    expect(res.ok && res.subscription.billingDay).toBe(25);
  });

  it('категорія пише і дзеркало categoryId', () => {
    const res = applySubscriptionDraft(null, { ...emptySubscriptionDraft({ today: '2026-09-13', currency: 'UAH' }), name: 'A', amount: '1', category: 'Розваги' }, { now, newId });
    expect(res.ok && res.subscription.categoryId).toBe('expense:Розваги');
  });

  it('помилки валідації', () => {
    const base = { ...emptySubscriptionDraft({ today: '2026-09-13', currency: 'UAH' }), name: 'A', amount: '10' };
    expect(applySubscriptionDraft(null, { ...base, name: '  ' }, { now })).toEqual({ ok: false, error: 'invalid' });
    expect(applySubscriptionDraft(null, { ...base, amount: '0' }, { now })).toEqual({ ok: false, error: 'invalid' });
    expect(applySubscriptionDraft(null, { ...base, amount: 'abc' }, { now })).toEqual({ ok: false, error: 'invalid' });
    expect(applySubscriptionDraft(null, { ...base, every: '0' }, { now })).toEqual({ ok: false, error: 'invalid' });
    expect(applySubscriptionDraft(null, { ...base, nextPaymentDate: '2026-02-30' }, { now })).toEqual({ ok: false, error: 'invalid' });
    expect(applySubscriptionDraft(null, { ...base, endDate: '2026-09-01' }, { now })).toEqual({ ok: false, error: 'endBeforeNext' });
  });

  it('parseAmountInput і subscriptionLink', () => {
    expect(parseAmountInput('1 200,5')).toBe(1200.5);
    expect(parseAmountInput('.5')).toBe(0.5);
    expect(Number.isNaN(parseAmountInput('1,2,3'))).toBe(true);
    expect(subscriptionLink('netflix.com')).toBe('https://netflix.com');
    expect(subscriptionLink('http://a.b')).toBe('http://a.b');
    expect(subscriptionLink('javascript:alert(1)')).toBeNull();
    expect(subscriptionLink('  ')).toBeNull();
  });
});

describe('formatSubscriptionMoney / formatTotalsLine', () => {
  const currencies = [
    { code: 'UAH', symbol: '₴', kind: 'fiat' as const, decimals: 2 },
    { code: 'BTC', symbol: '₿', kind: 'crypto' as const, decimals: 8 },
  ];
  it('не губить копійки й не падає на крипті', () => {
    expect(formatSubscriptionMoney(9.99, 'USD', currencies, 'en-US')).toContain('9.99');
    expect(formatSubscriptionMoney(0.0005, 'BTC', currencies, 'en-US')).toBe('₿ 0.0005');
    expect(formatTotalsLine([{ currency: 'USD', monthly: 32, yearly: 384 }], 'monthly', '/міс', currencies, 'en-US')).toMatch(/32\/міс$/);
  });
});
