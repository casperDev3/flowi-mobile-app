/**
 * __tests__/finance-report-parity.test.ts — паритет формул розділу «Фінанси»
 * з вебом (flowi-web-app/docs/specs/finance-revamp.md §8.3).
 *
 * Фікстура `fixtures/finance-report-parity.json` — ПОБАЙТОВА копія
 * flowi-web-app/lib/__fixtures__/finance-report-parity.json. `expected` у ній
 * пораховано вебовими модулями (lib/finance/*); тут ті самі вхідні дані
 * проходять через мобільні utils/finance/* і мусять дати рівно ті самі числа.
 * `computeParity` — дослівний порт lib/__fixtures__/finance-report-parity.build.mjs.
 *
 * Правило релізу: зміна формули починається з фікстури на вебі; копія сюди
 * правиться в тому самому заході.
 */
import fs from 'fs';
import path from 'path';

import type { Account } from '@/utils/accounts';
import { cashflowFact } from '@/utils/finance/cashflow';
import { cashflowForecast } from '@/utils/finance/forecast';
import { parsePeriodParam, type FinanceFilter } from '@/utils/finance/period';
import { buildPnl, comparePnl } from '@/utils/finance/pnl';
import { normalizeRecurringIncomes } from '@/utils/finance/recurring';
import type { Transaction } from '@/utils/financeUtils';
import type { Subscription } from '@/utils/subscriptions';
import type { MoneyScope } from '@/utils/budgetScope';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'finance-report-parity.json');
const raw = fs.readFileSync(FIXTURE_PATH, 'utf8');
const fixture = JSON.parse(raw);

/** 'YYYY-MM-DD' → місцевий полудень: «сьогодні» не з'їжджає в жодному поясі. */
function fixtureNow(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function computeParity(input: typeof fixture) {
  const now = fixtureNow(input.now);
  const period = parsePeriodParam(input.filter.period, now);
  const filter: FinanceFilter = { period, currency: input.filter.currency, scope: input.filter.scope as MoneyScope };
  const base = {
    transactions: input.transactions as Transaction[],
    accounts: input.accounts as Account[],
    categories: input.categories as unknown[],
    subscriptions: input.subscriptions as Subscription[],
    primary: input.primary as string,
  };
  const recurringIncomes = normalizeRecurringIncomes(input.recurring_incomes);
  const cashflow = cashflowFact({ ...base, filter, now });
  const forecast = (horizonDays: 30 | 90) => cashflowForecast({
    ...base,
    recurringIncomes,
    currency: filter.currency,
    now,
    horizonDays,
  });
  const byScope = Object.fromEntries((['all', 'personal', 'project'] as const).map(scope => [
    scope,
    buildPnl({ ...base, filter: { ...filter, scope } }).totals,
  ]));
  return {
    period,
    pnl: buildPnl({ ...base, filter }),
    pnlByScope: byScope,
    comparison: comparePnl({ ...base, filter }),
    comparisonProject: comparePnl({ ...base, filter: { ...filter, scope: 'project' } }),
    cashflow: {
      opening: cashflow.opening,
      inflow: cashflow.inflow,
      outflow: cashflow.outflow,
      count: cashflow.points.length,
      first: cashflow.points.slice(0, 5),
      last: cashflow.points.slice(-5),
    },
    forecast30: forecast(30),
    forecast90: forecast(90),
  };
}

const actual = JSON.parse(JSON.stringify(computeParity(fixture)));

describe('паритет із вебом: finance-report-parity.json', () => {
  test('копія фікстури збігається з вебовим оригіналом (коли веб поруч)', () => {
    const webPath = path.join(__dirname, '..', '..', 'flowi-web-app', 'lib', '__fixtures__', 'finance-report-parity.json');
    if (!fs.existsSync(webPath)) return; // CI без сусіднього репозиторію
    expect(raw).toBe(fs.readFileSync(webPath, 'utf8'));
  });

  test('період', () => { expect(actual.period).toEqual(fixture.expected.period); });
  test('P&L', () => { expect(actual.pnl).toEqual(fixture.expected.pnl); });
  test('P&L у трьох ракурсах', () => { expect(actual.pnlByScope).toEqual(fixture.expected.pnlByScope); });
  test('порівняння', () => { expect(actual.comparison).toEqual(fixture.expected.comparison); });
  test('порівняння проєкту (порожній попередній період)', () => {
    expect(actual.comparisonProject).toEqual(fixture.expected.comparisonProject);
  });
  test('Cash Flow — факт', () => { expect(actual.cashflow).toEqual(fixture.expected.cashflow); });
  test('прогноз на 30 днів', () => { expect(actual.forecast30).toEqual(fixture.expected.forecast30); });
  test('прогноз на 90 днів', () => { expect(actual.forecast90).toEqual(fixture.expected.forecast90); });
});
