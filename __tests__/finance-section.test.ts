/**
 * __tests__/finance-section.test.ts — допоміжні правила розділу «Фінанси»:
 * вкладки й вимкнені підмодулі (§2.3), бюджет по місяцях (§5.5), гроші
 * проєкту (§5.6, §10), оборот стрічки за періодом, операція проєкту (П2/П3).
 */
jest.mock('@/utils/uuid', () => ({ uuidV4: () => '00000000-0000-4000-8000-000000000000' }));

import type { Account } from '@/utils/accounts';
import { budgetMonthRows } from '@/utils/budgetMonths';
import { buildProjectTransaction, projectMoneyTotals, projectTransactions } from '@/utils/budgetProject';
import { resolvePeriod } from '@/utils/finance/period';
import { calcPeriodTotalsByCurrency } from '@/utils/financePeriod';
import { FINANCE_TABS, parseFinanceTab, visibleFinanceTabs } from '@/utils/financeTabs';
import { calcTotalsByCurrency, type Transaction } from '@/utils/financeUtils';
import { budgetSpentTotal } from '@/utils/projectOverview';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const accounts: Account[] = [
  { id: 'uah', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 0, createdAt: '' },
  { id: 'usd', name: 'USD', kind: 'card', currency: 'USD', openingBalance: 0, createdAt: '' },
];
const tx = (p: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount' | 'date'>): Transaction => ({
  category: '', note: '', accountId: 'uah', ...p,
});

describe('вкладки розділу', () => {
  test('порядок фіксований, типова — «Огляд»', () => {
    expect(FINANCE_TABS).toEqual(['overview', 'transactions', 'reports', 'budget', 'subscriptions', 'accounts']);
    expect(parseFinanceTab(undefined)).toBe('overview');
    expect(parseFinanceTab('reports')).toBe('reports');
    expect(parseFinanceTab(['budget'])).toBe('budget');
    expect(parseFinanceTab('nope')).toBe('overview');
  });

  test('вимкнений підмодуль ховає вкладку, а не розділ', () => {
    const visible = visibleFinanceTabs(['budget', 'banks']);
    expect(visible).toEqual(['overview', 'transactions', 'reports', 'subscriptions']);
    // Прихована вкладка через адресу → типова.
    expect(parseFinanceTab('budget', visible)).toBe('overview');
    expect(visibleFinanceTabs(['budget', 'subscriptions', 'banks'])).toEqual(['overview', 'transactions', 'reports']);
  });
});

describe('бюджет по місяцях', () => {
  test('кожен місяць — окремо, ліміт не складається; ракурс і валюта діють', () => {
    const txs = [
      tx({ id: '1', type: 'expense', amount: 300, category: 'Їжа', date: at(2026, 7, 3) }),
      tx({ id: '2', type: 'expense', amount: 900, category: 'Їжа', date: at(2026, 8, 3) }),
      tx({ id: '3', type: 'expense', amount: 50, category: 'Їжа', accountId: 'usd', date: at(2026, 8, 4) }),
      tx({ id: '4', type: 'expense', amount: 70, category: 'Їжа', projectId: 'p', date: at(2026, 9, 4) }),
      tx({ id: '5', type: 'transfer', amount: 1000, toAccountId: 'usd', date: at(2026, 9, 5) }),
    ];
    const limits = [
      { id: 'Їжа', category: 'Їжа', icon: 'fork.knife' as const, limit: 800 },
      { id: 'Кіно', category: 'Кіно', icon: 'tv.fill' as const, limit: 0 },
    ];
    const months = ['2026-07-01', '2026-08-01', '2026-09-01'];
    const rows = budgetMonthRows(limits, txs, accounts, months, 'UAH', 'personal');
    expect(rows).toHaveLength(1);
    expect(rows[0].cells).toEqual([
      { month: '2026-07-01', spent: 300, limit: 800 },
      { month: '2026-08-01', spent: 900, limit: 800 },
      { month: '2026-09-01', spent: 0, limit: 800 },
    ]);
  });
});

describe('гроші проєкту за весь час', () => {
  const txs = [
    tx({ id: 'e1', type: 'expense', amount: 100, projectId: 'p', date: at(2026, 1, 1) }),
    tx({ id: 'e2', type: 'expense', amount: 40, projectId: 'p', accountId: 'usd', date: at(2026, 2, 1) }),
    tx({ id: 'i1', type: 'income', amount: 500, projectId: 'p', date: at(2026, 3, 1) }),
    tx({ id: 'i2', type: 'income', amount: 7, projectId: 'p', accountId: 'usd', date: at(2026, 3, 2) }),
    tx({ id: 'o', type: 'expense', amount: 999, projectId: 'other', date: at(2026, 3, 3) }),
    tx({ id: 't', type: 'transfer', amount: 5, projectId: 'p', toAccountId: 'usd', date: at(2026, 3, 4) }),
  ];

  test('витрачено = budgetSpentTotal; доходи окремо; інші валюти — «не враховано»', () => {
    const totals = projectMoneyTotals(txs, accounts, 'p', 'UAH');
    expect(totals.spent).toBe(budgetSpentTotal(txs, accounts, 'p', 'UAH'));
    expect(totals).toEqual({ spent: 100, income: 500, net: 400, uncounted: { USD: { income: 7, expense: 40 } } });
  });

  test('списки доходів і витрат проєкту — найновіші першими', () => {
    expect(projectTransactions(txs, 'p', 'income').map(t => t.id)).toEqual(['i2', 'i1']);
    expect(projectTransactions(txs, 'p', 'expense').map(t => t.id)).toEqual(['e2', 'e1']);
  });

  test('операція проєкту несе рахунок, валюту рахунку і projectId', () => {
    const now = new Date(2026, 8, 23, 12);
    expect(buildProjectTransaction({ type: 'expense', amount: '0', category: '', note: '', account: accounts[0], projectId: 'p', now })).toBeNull();
    const made = buildProjectTransaction({ type: 'income', amount: '1 200,5', category: ' Гонорар ', note: ' аванс ', account: accounts[1], projectId: 'p', now });
    expect(made).toEqual({
      id: '00000000-0000-4000-8000-000000000000',
      type: 'income',
      category: 'Гонорар',
      amount: 1200.5,
      note: 'аванс',
      date: now.toISOString(),
      accountId: 'usd',
      currency: 'USD',
      projectId: 'p',
    });
  });
});

describe('оборот стрічки за періодом', () => {
  const txs = [
    tx({ id: 'a', type: 'income', amount: 1000, date: at(2026, 8, 20) }),
    tx({ id: 'b', type: 'expense', amount: 200, date: at(2026, 9, 2) }),
    tx({ id: 'c', type: 'income', amount: 50, date: at(2026, 9, 30) }),
    tx({ id: 'd', type: 'expense', amount: 10, date: at(2026, 10, 1) }),
    tx({ id: 'e', type: 'transfer', amount: 999, toAccountId: 'usd', date: at(2026, 9, 3) }),
  ];
  const cur = () => 'UAH';

  test('для одного місяця — те саме, що calcTotalsByCurrency', () => {
    const sept = resolvePeriod('month', '2026-09', new Date(2026, 8, 1));
    expect(calcPeriodTotalsByCurrency(txs, sept, cur)).toEqual(calcTotalsByCurrency(txs, new Date(2026, 8, 1), cur));
  });

  test('квартал: оборот за весь період, carryover — до його початку', () => {
    const q3 = resolvePeriod('quarter', '2026-09', new Date(2026, 8, 1));
    expect(calcPeriodTotalsByCurrency(txs, q3, cur)).toEqual({ UAH: { income: 1050, expense: 200, carryover: 0, balance: 850 } });
  });
});
