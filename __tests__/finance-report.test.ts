/**
 * __tests__/finance-report.test.ts — формули розділу «Фінанси»
 * (flowi-web-app/docs/specs/finance-revamp.md §4–§6): період, класифікація
 * категорій, P&L і порівняння, Cash Flow факт і прогноз, регулярні доходи.
 *
 * Набір даних покриває обов'язкові випадки §8.3: від'ємна сума, операція без
 * рахунку, архівний рахунок, переказ у межах валюти, крос-валютний переказ,
 * майбутня операція, прострочена підписка, підписка з endDate, billingDay=31,
 * категорія без явних полів, категорія підписки → fixed, проєктна операція,
 * дохід у не-основній валюті, порожній попередній період.
 */
import { financeOverview } from '@/utils/financeOverview';
import type { Account } from '@/utils/accounts';
import type { Transaction } from '@/utils/financeUtils';
import type { Subscription } from '@/utils/subscriptions';
import { cashflowFact } from '@/utils/finance/cashflow';
import {
  buildCategoryIndex, categoryMeta, costKindOfTx, normalizeName, SEED_BY_NAME,
} from '@/utils/finance/classify';
import { avgDailyVariable, cashflowForecast, largestOutflowsUntil } from '@/utils/finance/forecast';
import {
  inRange, labelPeriod, labelPeriodLocalized, localDayKey, monthsOf, parseStoredPeriod, resolvePeriod, shiftPeriod,
  storedPeriodOf, type FinanceFilter,
} from '@/utils/finance/period';
import { buildPnl, comparePnl } from '@/utils/finance/pnl';
import {
  buildRecurringIncome, newRecurringIncomeId, nextOccurrences, normalizeRecurringIncome, occurrencesBetween,
  receiveRecurringIncome, recurringIncomeDraftError, recurringIncomeStatus, recurringIncomeToDraft,
  type RecurringIncome,
} from '@/utils/finance/recurring';

const NOW = new Date(2026, 8, 23, 12, 0, 0); // 23 вересня 2026, локальний полудень
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0).toISOString();

const accounts: Account[] = [
  { id: 'card', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 1000, createdAt: '2026-01-01' },
  { id: 'cash', name: 'Готівка', kind: 'cash', currency: 'UAH', openingBalance: 200, createdAt: '2026-01-01' },
  { id: 'usd', name: 'USD', kind: 'card', currency: 'USD', openingBalance: 100, createdAt: '2026-01-01' },
  { id: 'old', name: 'Стара', kind: 'card', currency: 'UAH', openingBalance: 50, archived: true, createdAt: '2026-01-01' },
];

const tx = (p: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'date'>): Transaction => ({
  category: '', note: '', accountId: '', ...p,
});

const transactions: Transaction[] = [
  tx({ id: 't1', type: 'income', amount: 10000, category: 'Зарплата', accountId: 'card', date: at(2026, 9, 1) }),
  tx({ id: 't2', type: 'expense', amount: 3000, category: 'Оренда', accountId: 'card', date: at(2026, 9, 5) }),
  // 1. від'ємна сума — напрям задає type
  tx({ id: 't3', type: 'expense', amount: -500, category: 'Їжа', accountId: 'card', date: at(2026, 9, 10) }),
  // 2. без рахунку
  tx({ id: 't4', type: 'expense', amount: 200, category: 'Кава', accountId: '', currency: 'UAH', date: at(2026, 9, 12) }),
  // 3. архівний рахунок
  tx({ id: 't5', type: 'expense', amount: 100, category: 'Їжа', accountId: 'old', date: at(2026, 9, 13) }),
  // 4. переказ у межах валюти
  tx({ id: 't6', type: 'transfer', amount: 1000, accountId: 'card', toAccountId: 'cash', date: at(2026, 9, 14) }),
  // 5. крос-валютний переказ
  tx({ id: 't7', type: 'transfer', amount: 50, toAmount: 2000, accountId: 'usd', toAccountId: 'card', date: at(2026, 9, 15) }),
  // 6. майбутня операція
  tx({ id: 't8', type: 'expense', amount: 1500, category: 'Ремонт', accountId: 'card', date: at(2026, 10, 10) }),
  // 11. категорія підписки → fixed
  tx({ id: 't9', type: 'expense', amount: 299, category: 'Сервіси', accountId: 'card', date: at(2026, 9, 9) }),
  // 12. проєктна операція
  tx({ id: 't10', type: 'expense', amount: 400, category: 'Їжа', accountId: 'card', projectId: 'p1', date: at(2026, 9, 16) }),
  // 13. дохід у не-основній валюті
  tx({ id: 't11', type: 'income', amount: 20, category: 'Фріланс', accountId: 'usd', date: at(2026, 9, 17) }),
  tx({ id: 't12', type: 'expense', amount: 600, category: 'Їжа', accountId: 'card', date: at(2026, 8, 10) }),
  tx({ id: 't13', type: 'expense', amount: 100, category: 'Транспорт', accountId: 'card', date: at(2026, 7, 20) }),
];

const categories = [
  { id: 'expense:Кава', type: 'expense', name: 'Кава', icon: 'cup' },                                   // 10. без явних полів
  { id: 'expense:Ремонт', type: 'expense', name: 'Ремонт', icon: 'wrench', group: 'housing', cost: 'variable' },
  { id: 'expense:Сервіси', type: 'expense', name: 'Сервіси', icon: 'tv' },
];

const sub = (p: Partial<Subscription> & Pick<Subscription, 'id' | 'name' | 'amount' | 'nextPaymentDate'>): Subscription => ({
  currency: 'UAH', period: { every: 1, unit: 'month' }, reminderDaysBefore: 1, icon: 'repeat', color: '#000',
  history: [], createdAt: '2026-01-01', updatedAt: '2026-01-01', ...p,
});

const subscriptions: Subscription[] = [
  // 7. прострочена
  sub({ id: 's1', name: 'Netflix', amount: 299, nextPaymentDate: '2026-09-20', category: 'Сервіси' }),
  // 8 + 9. endDate у горизонті, billingDay = 31
  sub({ id: 's2', name: 'Gym', amount: 500, nextPaymentDate: '2026-10-31', billingDay: 31, endDate: '2026-12-15' }),
  sub({ id: 's3', name: 'Old', amount: 999, nextPaymentDate: '2026-09-25', archivedAt: '2026-05-01T00:00:00Z' }),
];

const incomes: RecurringIncome[] = [{
  id: 'ri-1', name: 'Зарплата', amount: 10000, currency: 'UAH', period: { every: 1, unit: 'month' },
  nextPaymentDate: '2026-10-01', billingDay: 1, icon: 'arrow.down.circle', color: '#10B981', history: [], createdAt: '2026-01-01',
}];

const sept = resolvePeriod('month', '', NOW);
const filter = (p: Partial<FinanceFilter> = {}): FinanceFilter => ({ period: sept, currency: 'UAH', scope: 'all', ...p });
const pnlInput = (f: FinanceFilter = filter()) => ({ transactions, accounts, categories, subscriptions, filter: f, primary: 'UAH' });

describe('period', () => {
  test('пресети — календарні, межі включно', () => {
    expect(sept).toEqual({ from: '2026-09-01', to: '2026-09-30', key: 'month:2026-09', preset: 'month' });
    expect(resolvePeriod('prev_month', '', NOW).key).toBe('month:2026-08');
    expect(resolvePeriod('quarter', '', NOW)).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(resolvePeriod('year', '', NOW)).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod('custom', '2026-03-31..2026-01-01', NOW)).toMatchObject({ from: '2026-01-01', to: '2026-03-31', key: '2026-01-01..2026-03-31' });
    // Бите значення → типовий місяць, а не порожнеча.
    expect(resolvePeriod('custom', 'nonsense', NOW).key).toBe('month:2026-09');
  });

  test('попередній період: календарний для пресетів, тієї ж довжини для custom', () => {
    expect(shiftPeriod(sept, -1).key).toBe('month:2026-08');
    expect(shiftPeriod(resolvePeriod('month', '2026-01', NOW), -1).key).toBe('month:2025-12');
    expect(shiftPeriod(resolvePeriod('quarter', '', NOW), -1)).toMatchObject({ from: '2026-04-01', to: '2026-06-30' });
    expect(shiftPeriod(resolvePeriod('custom', '2026-09-10..2026-09-19', NOW), -1))
      .toMatchObject({ from: '2026-08-31', to: '2026-09-09' });
  });

  test('inRange — локальні доби, межі включно', () => {
    expect(localDayKey(at(2026, 9, 1, 0))).toBe('2026-09-01');
    expect(localDayKey('garbage')).toBeNull();
    expect(inRange(at(2026, 9, 30, 23), sept)).toBe(true);
    expect(inRange(at(2026, 10, 1, 0), sept)).toBe(false);
    expect(inRange('garbage', sept)).toBe(false);
  });

  test('збережений вибір: поточний — лише пресетом, інший — повним ключем', () => {
    expect(storedPeriodOf(sept, NOW)).toBe('month');
    // «Цей місяць», збережений у вересні, у жовтні означає жовтень.
    expect(parseStoredPeriod('month', new Date(2026, 9, 2)).key).toBe('month:2026-10');
    const july = resolvePeriod('month', '2026-07', NOW);
    expect(storedPeriodOf(july, NOW)).toBe('month:2026-07');
    expect(parseStoredPeriod(storedPeriodOf(july, NOW), NOW).key).toBe('month:2026-07');
    const custom = resolvePeriod('custom', '2026-01-05..2026-02-10', NOW);
    expect(parseStoredPeriod(storedPeriodOf(custom, NOW), NOW)).toEqual(custom);
    expect(parseStoredPeriod('weird:thing', NOW).key).toBe('month:2026-09');
    expect(parseStoredPeriod(null, NOW).key).toBe('month:2026-09');
  });

  test('місяці періоду і підпис', () => {
    expect(monthsOf(resolvePeriod('quarter', '', NOW))).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(labelPeriod(sept)).toBe('вересень 2026');
    expect(labelPeriod(resolvePeriod('quarter', '', NOW))).toBe('III квартал 2026');
    const months = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    const short = months.map(m => m.slice(0, 3).toLowerCase());
    expect(labelPeriodLocalized(sept, months, short)).toBe('Вересень 2026');
    expect(labelPeriodLocalized(resolvePeriod('custom', '2025-12-30..2026-01-02', NOW), months, short)).toBe('30 гру 2025 – 2 січ 2026');
  });
});

describe('classify', () => {
  test('посівна таблиця й нормалізація назви', () => {
    expect(normalizeName("  Здоров’я ")).toBe("здоров'я");
    expect(SEED_BY_NAME["здоров'я"]).toEqual({ group: 'health', cost: 'variable' });
    expect(categoryMeta({ type: 'expense', name: 'Комунальні' })).toMatchObject({ group: 'housing', cost: 'fixed', costSource: 'seed' });
    expect(categoryMeta({ type: 'expense', name: 'Utilities' })).toMatchObject({ group: 'housing', cost: 'fixed' });
    expect(categoryMeta({ type: 'income', name: 'Зарплата' })).toMatchObject({ group: 'salary', cost: 'variable' });
    expect(categoryMeta({ type: 'expense', name: 'Щось своє' })).toMatchObject({ group: 'other', cost: 'variable', costSource: 'default' });
  });

  test('явне значення перемагає похідне; биті значення ігноруються', () => {
    expect(categoryMeta({ type: 'expense', name: 'Їжа', group: 'health', cost: 'fixed' }))
      .toEqual({ group: 'health', cost: 'fixed', explicitGroup: true, costSource: 'explicit' });
    expect(categoryMeta({ type: 'expense', name: 'Їжа', group: 'bogus', cost: 42 }))
      .toEqual({ group: 'food', cost: 'variable', explicitGroup: false, costSource: 'seed' });
  });

  test('категорія неархівної підписки → fixed (але явне значення сильніше)', () => {
    const index = buildCategoryIndex(categories, subscriptions);
    expect(index.meta('expense', 'Сервіси')).toMatchObject({ cost: 'fixed', costSource: 'subscription' });
    expect(costKindOfTx({ type: 'expense', category: 'Ремонт' }, index)).toBe('variable');
    const explicit = buildCategoryIndex([{ type: 'expense', name: 'Сервіси', cost: 'variable' }], subscriptions);
    expect(explicit.meta('expense', 'Сервіси').cost).toBe('variable');
    // Архівна підписка правила не вмикає.
    const archivedOnly = buildCategoryIndex([], [{ category: 'Кава', archivedAt: 'x' }]);
    expect(archivedOnly.meta('expense', 'Кава')).toMatchObject({ cost: 'variable', costSource: 'default' });
  });
});

describe('P&L', () => {
  test('вересень, UAH, усі ракурси: перекази й інші валюти не входять', () => {
    const { totals, groups, unclassifiedCategories, uncounted } = buildPnl(pnlInput());
    expect(unclassifiedCategories).toEqual(['Кава']);
    expect(uncounted).toEqual([{ currency: 'USD', income: 20, expense: 0, count: 1 }]);
    expect(totals).toEqual({
      currency: 'UAH',
      income: 10000,
      fixedExpense: 3299,          // Оренда (посів) + Сервіси (правило підписки)
      variableExpense: 1200,       // Їжа 500 (від'ємна) + Кава 200 (без рахунку) + Їжа 100 (архів) + Їжа 400 (проєкт)
      expense: 4499,
      net: 5501,
      savingsRate: 0.5501,
      // Лише «Кава»: без явної ознаки, без посіву й без підписки.
      unclassifiedExpense: 200,
      unclassifiedCount: 1,
    });
    const housing = groups.find(g => g.group === 'housing' && g.cost === 'fixed');
    expect(housing).toMatchObject({ value: 3000, categories: [{ name: 'Оренда', value: 3000 }] });
    expect(groups[0].value).toBeGreaterThanOrEqual(groups[groups.length - 1].value);
    expect(groups.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1, 6);
  });

  test('ракурси: особисті без проєкту, проєктні — лише проєкт; savingsRate null без доходу', () => {
    expect(buildPnl(pnlInput(filter({ scope: 'personal' }))).totals.variableExpense).toBe(800);
    const project = buildPnl(pnlInput(filter({ scope: 'project' }))).totals;
    expect(project).toMatchObject({ income: 0, expense: 400, net: -400, savingsRate: null });
  });

  test('інша валюта — окремий звіт', () => {
    expect(buildPnl(pnlInput(filter({ currency: 'USD' }))).totals).toMatchObject({ income: 20, expense: 0, savingsRate: 1 });
  });

  test('порівняння: попередній місяць, середнє за наявні повні періоди, pct=null на нулі', () => {
    const cmp = comparePnl(pnlInput());
    expect(cmp.previous).toMatchObject({ income: 0, expense: 600, variableExpense: 600 });
    expect(cmp.basis).toBe(2); // історія з 20 липня: серпень і липень є, червня нема
    expect(cmp.average3).toMatchObject({ income: 0, expense: 350, savingsRate: null });
    const income = cmp.delta.find(d => d.field === 'income')!;
    expect(income).toEqual({ field: 'income', abs: 10000, pct: null });
    const expense = cmp.delta.find(d => d.field === 'expense')!;
    expect(expense.pct).toBeCloseTo((4499 - 600) / 600, 8);
    // savingsRate: попередній без доходу — різниці немає (null), а не «+55 п.п.».
    expect(cmp.delta.find(d => d.field === 'savingsRate')).toEqual({ field: 'savingsRate', abs: null, pct: null });
  });

  test('14. порожній попередній період — pct null, basis 0', () => {
    const cmp = comparePnl({ ...pnlInput(), transactions: [transactions[0]] });
    expect(cmp.basis).toBe(0);
    expect(cmp.delta.every(d => d.pct === null)).toBe(true);
  });

  test('порядок підсумовування не впливає на результат', () => {
    const a = buildPnl(pnlInput());
    const b = buildPnl({ ...pnlInput(), transactions: [...transactions].reverse() });
    expect(b).toEqual(a);
  });
});

describe('Cash Flow — факт', () => {
  const fact = cashflowFact({ transactions, accounts, filter: filter(), primary: 'UAH', now: NOW });

  test('відкриття й суцільний ряд до сьогодні', () => {
    expect(fact.opening).toBe(500); // картка 1000−600−100 + готівка 200
    expect(fact.points).toHaveLength(23);
    expect(fact.points[0].day).toBe('2026-09-01');
    expect(fact.points[22].day).toBe('2026-09-23');
    expect(fact.points[1]).toEqual({ day: '2026-09-02', inflow: 0, outflow: 0, balance: 10500 });
  });

  test('приплив/відплив — оборот; баланс — активні рахунки з переказами', () => {
    expect(fact.inflow).toBe(10000);
    expect(fact.outflow).toBe(4499);
    const d14 = fact.points.find(p => p.day === '2026-09-14')!;
    const d13 = fact.points.find(p => p.day === '2026-09-13')!;
    expect(d14.balance).toBe(d13.balance); // переказ у межах валюти — нуль
    const d15 = fact.points.find(p => p.day === '2026-09-15')!;
    expect(d15.balance - d14.balance).toBe(2000); // крос-валютний переказ змінює баланс
    expect(d15.inflow).toBe(0); // але не є доходом
    // Кінець ряду = «На рахунках» із financeOverview.
    const overview = financeOverview({ txs: transactions, accounts, primary: 'UAH', now: NOW });
    expect(fact.points[22].balance).toBe(overview.totalByCurrency.UAH);
    expect(fact.points[22].balance).toBe(8301);
  });

  test('ракурс не впливає на баланс', () => {
    const personal = cashflowFact({ transactions, accounts, filter: filter({ scope: 'personal' }), primary: 'UAH', now: NOW });
    expect(personal.points.map(p => p.balance)).toEqual(fact.points.map(p => p.balance));
    expect(personal.outflow).toBe(4099);
  });
});

describe('Cash Flow — прогноз', () => {
  const base = {
    transactions, accounts, categories, subscriptions, recurringIncomes: incomes,
    currency: 'UAH', primary: 'UAH', now: NOW,
  };

  test('середні змінні: 90 повних днів, ділимо на 90 завжди', () => {
    const avg = avgDailyVariable(base);
    expect(avg.total).toBe(1900);
    expect(avg.value).toBe(Math.round((1900 / 90) * 1e8) / 1e8);
    expect(avg.basis).toBe('ok');
    const thin = avgDailyVariable({ ...base, transactions: [transactions[2]] });
    expect(thin.basis).toBe('thin');
  });

  test('30 днів: прострочене — сьогодні одним входженням, події, закриття', () => {
    const f = cashflowForecast({ ...base, horizonDays: 30 });
    expect(f.opening).toBe(8301);
    expect(f.points).toHaveLength(31);
    const today = f.points[0];
    expect(today.day).toBe('2026-09-23');
    expect(today.events).toEqual([
      { day: '2026-09-23', kind: 'subscription', amount: -299, label: 'Netflix', sourceId: 's1', overdue: true },
    ]);
    expect(today.balance).toBe(8002);
    const kinds = f.points.flatMap(p => p.events).filter(e => e.kind !== 'variable').map(e => `${e.day}:${e.kind}:${e.amount}`);
    expect(kinds).toEqual([
      '2026-09-23:subscription:-299',
      '2026-10-01:recurring_income:10000',
      '2026-10-10:planned_tx:-1500',
      '2026-10-20:subscription:-299',
    ]);
    const avg = f.avgDailyVariable;
    expect(f.closing).toBeCloseTo(8002 + 10000 - 1500 - 299 - 30 * avg, 6);
    expect(f.shortfall).toBeNull();
  });

  test('90 днів: billingDay=31 і endDate обрізають підписку', () => {
    const f = cashflowForecast({ ...base, horizonDays: 90 });
    const gym = f.points.flatMap(p => p.events).filter(e => e.sourceId === 's2').map(e => e.day);
    expect(gym).toEqual(['2026-10-31', '2026-11-30']);
    // Архівна підписка не входить.
    expect(f.points.flatMap(p => p.events).some(e => e.sourceId === 's3')).toBe(false);
  });

  test('попередження: перший мінус і найбільші списання до нього', () => {
    const f = cashflowForecast({
      ...base,
      transactions: [tx({ id: 'x', type: 'income', amount: 100, accountId: 'card', date: at(2026, 9, 1), category: 'Інше' })],
      accounts: [{ ...accounts[0], openingBalance: 0 }],
      recurringIncomes: [],
      subscriptions: [sub({ id: 'rent', name: 'Оренда', amount: 5000, nextPaymentDate: '2026-10-05' })],
      horizonDays: 30,
    });
    expect(f.shortfall).toEqual({ day: '2026-10-05', balance: -4900 });
    expect(largestOutflowsUntil(f, '2026-10-05').map(e => e.label)).toEqual(['Оренда']);
  });
});

describe('регулярні доходи', () => {
  test('входження з nextPaymentDate, endDate обрізає', () => {
    const item = { nextPaymentDate: '2026-01-31', period: { every: 1, unit: 'month' as const }, billingDay: 31, endDate: '2026-04-15' };
    expect(nextOccurrences(item, 10)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(occurrencesBetween(item, '2026-02-01', '2026-12-31')).toEqual(['2026-02-28', '2026-03-31']);
  });

  test('«Отримано» — звичайний дохід + зсув дати, історія доповнюється', () => {
    const { income, transaction } = receiveRecurringIncome(incomes[0], {
      id: 'tx-1', accountId: 'card', currency: 'UAH', fallbackCategory: 'Інше', now: NOW,
    });
    expect(income.nextPaymentDate).toBe('2026-11-01');
    expect(income.history).toHaveLength(1);
    expect(income.history[0]).toMatchObject({ date: '2026-10-01', amount: 10000 });
    expect(transaction).toMatchObject({ id: 'tx-1', type: 'income', amount: 10000, accountId: 'card', category: 'Інше', note: 'Зарплата' });
    expect(localDayKey(transaction.date)).toBe('2026-10-01');
    expect(transaction.projectId).toBeUndefined();
  });

  test('статус, нормалізація, чернетка', () => {
    expect(recurringIncomeStatus(incomes[0], '2026-09-23')).toBe('active');
    expect(recurringIncomeStatus(incomes[0], '2026-10-02')).toBe('overdue');
    expect(recurringIncomeStatus({ ...incomes[0], archivedAt: 'x' }, '2026-09-23')).toBe('archived');
    expect(normalizeRecurringIncome({ id: 'ri-x', name: '', nextPaymentDate: '2026-01-01' })).toBeNull();
    const n = normalizeRecurringIncome({ id: 'ri-x', name: ' Бонус ', nextPaymentDate: '2026-01-01', amount: '50', extra: 1 })!;
    expect(n).toMatchObject({ name: 'Бонус', amount: 50, currency: 'UAH', period: { every: 1, unit: 'month' }, extra: 1 });
    const draft = { ...recurringIncomeToDraft(null, { currency: 'UAH', today: '2026-10-05' }), name: 'Оренда від квартирантів', amount: '0' };
    expect(recurringIncomeDraftError(draft)).not.toBeNull();
    const ok = { ...draft, amount: '8000,50', category: 'Інше' };
    expect(recurringIncomeDraftError(ok)).toBeNull();
    const built = buildRecurringIncome(ok, null, { id: newRecurringIncomeId(), now: NOW });
    expect(built).toMatchObject({ amount: 8000.5, billingDay: 5, categoryId: 'income:Інше', history: [] });
    expect(built.id).toMatch(/^ri-[0-9a-f-]{36}$/);
    // Правка зберігає історію й невідомі поля.
    const edited = buildRecurringIncome({ ...ok, amount: '9000' }, { ...built, history: [{ date: '2026-09-05', amount: 1 }], extra: 1 } as RecurringIncome, { id: 'ignored', now: NOW });
    expect(edited).toMatchObject({ id: built.id, amount: 9000, extra: 1 });
    expect(edited.history).toHaveLength(1);
  });
});
