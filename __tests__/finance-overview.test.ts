/**
 * __tests__/finance-overview.test.ts — одне джерело цифр для «Сьогодні» і
 * «Фінансів» (запит 2026-09-22: «на домашній сторінці все правильно, а на
 * екрані фінансів на 3000 більше»).
 *
 * Причина була не в арифметиці, а в тому, що два екрани показували різні
 * величини під одним словом «баланс»: головна — оборот місяця, «Фінанси» —
 * баланс рахунків (початковий залишок + уся історія). Тепер обидва беруть
 * числа з financeOverview(), а фікстура спільна з вебом, щоб клієнти не
 * розійшлись знову.
 */
import fs from 'fs';
import path from 'path';

import {
  accountBalance,
  accountBalanceBreakdown,
  findTransferPairCandidate,
  markAsTransferAccounts,
  reconciledOpeningBalance,
  type Account,
} from '@/utils/accounts';
import { financeOverview } from '@/utils/financeOverview';
import type { Transaction } from '@/utils/financeUtils';

import fixture from './fixtures/finance-parity.json';

const accounts = fixture.accounts as unknown as Account[];
const txs = fixture.transactions as unknown as Transaction[];
const now = new Date(fixture.now);

describe('financeOverview — спільна фікстура web/mobile', () => {
  const overview = financeOverview({ txs, accounts, primary: fixture.primary, now });

  test('баланси рахунків', () => {
    expect(overview.balances).toEqual(fixture.expected.balances);
  });

  test('«На рахунках» по валютах — лише активні рахунки', () => {
    expect(overview.totalByCurrency).toEqual(fixture.expected.totalByCurrency);
  });

  test('«Сальдо місяця» — окрема величина, не баланс', () => {
    expect(overview.month).toEqual(fixture.expected.month);
  });

  test('операції без рахунку і майбутні — пораховані й видимі', () => {
    expect(overview.unassigned.count).toBe(fixture.expected.unassignedCount);
    expect(overview.unassigned.ids).toEqual(['t10']);
    expect(overview.future.count).toBe(fixture.expected.futureCount);
  });

  test('«Звідки ця сума» сходиться до балансу', () => {
    const b = overview.breakdowns.card;
    expect(b).toEqual(fixture.expected.cardBreakdown);
    expect(b.opening + b.income - b.expense + b.transfersIn - b.transfersOut).toBe(b.balance);
  });

  test('інваріант: «На рахунках» = сума балансів активних рахунків (те, що бачить «Фінанси»)', () => {
    const uah = accounts.filter(a => !a.archived && a.currency === 'UAH').reduce((s, a) => s + overview.balances[a.id], 0);
    expect(overview.totalByCurrency.UAH).toBe(uah);
  });
});

describe('accountBalance — сумісність і захист від зламаних сум', () => {
  test('без asOf майбутні рахуються (стара поведінка викликів без дати)', () => {
    const card = accounts.find(a => a.id === 'card')!;
    expect(accountBalance(card, txs)).toBe(8200);
    expect(accountBalance(card, txs, { asOf: now })).toBe(8600);
  });

  test('рядкова сума не склеюється, від’ємна не подвоює розбіжність', () => {
    const cash = accounts.find(a => a.id === 'cash')!;
    expect(accountBalanceBreakdown(cash, txs).expense).toBe(450);
  });
});

describe('«Звірити з реальним залишком»', () => {
  test('новий початковий залишок дає рівно реальний баланс, історія не чіпається', () => {
    const card = accounts.find(a => a.id === 'card')!;
    // Типова помилка: у «Початковий залишок» ввели ПОТОЧНИЙ залишок, хоча
    // історія вже прив'язана до рахунку, — вона рахується двічі.
    const { opening, delta } = reconciledOpeningBalance(card, txs, 5600, { asOf: now });
    expect(delta).toBe(-3000);
    expect(opening).toBe(0);
    expect(accountBalance({ ...card, openingBalance: opening }, txs, { asOf: now })).toBe(5600);
  });
});

describe('«Позначити як переказ» — напрям і друга половина пари', () => {
  const A: Account = { id: 'A', name: 'A', kind: 'card', currency: 'UAH', openingBalance: 0, createdAt: '' };
  const B: Account = { id: 'B', name: 'B', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: '' };
  // Старий переказ A → B, записаний парою.
  const outHalf: Transaction = { id: 'out', type: 'expense', category: '', amount: 1000, note: '', date: '2026-09-10T12:00:00', accountId: 'A' };
  const inHalf: Transaction = { id: 'in', type: 'income', category: '', amount: 1000, note: '', date: '2026-09-10T13:00:00', accountId: 'B' };

  test('витрата лишається джерелом', () => {
    expect(markAsTransferAccounts(outHalf, 'B')).toEqual({ accountId: 'A', toAccountId: 'B' });
  });

  test('ДОХІД стає призначенням — гроші прийшли на його рахунок', () => {
    expect(markAsTransferAccounts(inHalf, 'A')).toEqual({ accountId: 'A', toAccountId: 'B' });
  });

  test('позначили дохід + прибрали запропоновану другу половину → баланси як до переказу-пари', () => {
    const pair = findTransferPairCandidate([outHalf, inHalf], inHalf, 'A', [A, B]);
    expect(pair?.id).toBe('out');
    const transfer: Transaction = { ...inHalf, type: 'transfer', ...markAsTransferAccounts(inHalf, 'A') };
    const after = [transfer];
    expect(accountBalance(A, after)).toBe(-1000);
    expect(accountBalance(B, after)).toBe(1000);
  });

  test('інша сума чи далека дата — не кандидат', () => {
    const far: Transaction = { ...outHalf, id: 'far', date: '2026-09-15T12:00:00' };
    const other: Transaction = { ...outHalf, id: 'other', amount: 999 };
    expect(findTransferPairCandidate([far, other, inHalf], inHalf, 'A', [A, B])).toBeUndefined();
  });
});

describe('гард: обидва екрани беруть головні цифри з financeOverview', () => {
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  test('«Сьогодні» не рахує фінанси сама', () => {
    const src = read('app/(tabs)/today.tsx');
    expect(src).toMatch(/financeOverview\(/);
    expect(src).not.toMatch(/\bcalcTotals\(/);
    expect(src).not.toMatch(/\baccountBalance\(/);
  });

  test('«Фінанси» беруть баланси рахунків з financeOverview', () => {
    const src = read('app/(tabs)/explore.tsx');
    expect(src).toMatch(/financeOverview\(/);
    expect(src).not.toMatch(/\baccountBalance\(/);
  });
});
