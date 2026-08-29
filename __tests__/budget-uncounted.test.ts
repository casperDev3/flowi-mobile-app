/**
 * __tests__/budget-uncounted.test.ts — що бюджет не порахував.
 *
 * Тест існує заради однієї межі: ліміт мусить лишатися чесним. Доти екран
 * показував зелене, коли частина витрат категорії просто не потрапляла в
 * підрахунок через іншу валюту.
 */

import type { Account } from '../utils/accounts';
import { budgetTxCurrency, formatUncounted, uncountedSpendByCategory } from '../utils/budgetUtils';
import type { Transaction } from '../utils/financeUtils';

const MONTH = new Date(2026, 7, 1);
const iso = (d: string) => new Date(d).toISOString();

const accounts: Account[] = [
  { id: 'uah', name: 'Готівка', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: iso('2026-01-01') },
  { id: 'usd', name: 'Картка', kind: 'card', currency: 'USD', openingBalance: 0, createdAt: iso('2026-01-01') },
  { id: 'eur', name: 'Євро', kind: 'cash', currency: 'EUR', openingBalance: 0, createdAt: iso('2026-01-01') },
];

function tx(over: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    category: 'Продукти',
    amount: 100,
    note: '',
    date: iso('2026-08-10'),
    accountId: 'uah',
    ...over,
  } as Transaction;
}

describe('uncountedSpendByCategory', () => {
  it('валюта ліміту в неврахованих не зʼявляється', () => {
    const out = uncountedSpendByCategory([tx({ id: '1' })], accounts, MONTH, 'UAH');
    expect(out).toEqual({});
  });

  it('чужа валюта потрапляє в розріз по категорії', () => {
    const out = uncountedSpendByCategory(
      [tx({ id: '1', accountId: 'usd', amount: 120 })],
      accounts, MONTH, 'UAH',
    );
    expect(out).toEqual({ Продукти: { USD: 120 } });
  });

  it('кілька валют в одній категорії підсумовуються окремо', () => {
    const out = uncountedSpendByCategory([
      tx({ id: '1', accountId: 'usd', amount: 120 }),
      tx({ id: '2', accountId: 'usd', amount: 30 }),
      tx({ id: '3', accountId: 'eur', amount: 45 }),
    ], accounts, MONTH, 'UAH');
    expect(out.Продукти).toEqual({ USD: 150, EUR: 45 });
  });

  it('переказ не є витратою в жодній валюті', () => {
    // Найлегша помилка тут — «усе, що не дохід»: тоді зняття доларів із картки
    // з’їдало б бюджет категорії, якої в переказу навіть немає.
    const out = uncountedSpendByCategory(
      [tx({ id: '1', accountId: 'usd', type: 'transfer', toAccountId: 'uah', amount: 100 })],
      accounts, MONTH, 'UAH',
    );
    expect(out).toEqual({});
  });

  it('дохід у чужій валюті теж не рахується', () => {
    const out = uncountedSpendByCategory(
      [tx({ id: '1', accountId: 'usd', type: 'income', amount: 500 })],
      accounts, MONTH, 'UAH',
    );
    expect(out).toEqual({});
  });

  it('інший місяць не потрапляє', () => {
    const out = uncountedSpendByCategory(
      [tx({ id: '1', accountId: 'usd', date: iso('2026-07-10') })],
      accounts, MONTH, 'UAH',
    );
    expect(out).toEqual({});
  });

  it('операція без рахунку бере валюту зі свого поля, а не з нізвідки', () => {
    // Записи до появи рахунків: accountId немає, currency лишилось.
    const out = uncountedSpendByCategory(
      [{ ...tx({ id: '1' }), accountId: undefined, currency: 'USD' } as unknown as Transaction],
      accounts, MONTH, 'UAH',
    );
    expect(out).toEqual({ Продукти: { USD: 100 } });
  });

  it('операція без валюти взагалі рахується в основній, а не в гривні', () => {
    // Регрес рахунків: замість «немає валюти → основна» з'явилося
    // «немає валюти → UAH». Для користувача з основною НЕ гривнею це
    // викидає з бюджету геть усі старі витрати — ліміти показують нулі,
    // а гроші перевтілюються в неврахованих «₴».
    const out = uncountedSpendByCategory(
      [{ ...tx({ id: '1' }), accountId: undefined, currency: undefined } as unknown as Transaction],
      accounts, MONTH, 'USD',
    );
    expect(out).toEqual({});
  });

  it('рахунок, якого немає у списку, не оголошується гривневим', () => {
    // Колекції приїжджають синком поодинці: операції вже тут, рахунків ще
    // немає. Вгадати валюту неможливо — але вгадувати саме UAH означає
    // додати долари до гривневого ліміту за номіналом.
    const out = uncountedSpendByCategory(
      [tx({ id: '1', accountId: 'ще-не-доїхав', amount: 120 })],
      accounts, MONTH, 'USD',
    );
    expect(out).toEqual({});
  });

  it('категорія на імʼя __proto__ не отруює Object.prototype', () => {
    // `out['__proto__'] = {}` не створює власного поля, а ПІДМІНЮЄ прототип;
    // гілка «поле вже є» тому пише суму просто в Object.prototype. Далі
    // кожен обʼєкт у застосунку має зайве поле — ламається не бюджет, а все.
    const out = uncountedSpendByCategory(
      [tx({ id: '1', category: '__proto__', accountId: 'usd', amount: 120 })],
      accounts, MONTH, 'UAH',
    );
    expect(({} as Record<string, unknown>).USD).toBeUndefined();
    // Літерал `{ __proto__: … }` теж призначає прототип, тож перевіряємо
    // ключі та вміст окремо, а не одним toEqual.
    expect(Object.keys(out)).toEqual(['__proto__']);
    expect(out['__proto__']).toEqual({ USD: 120 });
  });

  it('категорія на імʼя constructor не зникає зі звіту', () => {
    // `out['constructor']` успадкований і завжди truthy, тож сума йшла в
    // сам конструктор Object, а з Object.keys категорія зникала разом з нею.
    const out = uncountedSpendByCategory(
      [tx({ id: '1', category: 'constructor', accountId: 'usd', amount: 130 })],
      accounts, MONTH, 'UAH',
    );
    expect(Object.keys(out)).toEqual(['constructor']);
    expect((Object as unknown as Record<string, unknown>).USD).toBeUndefined();
  });
});

describe('formatUncounted', () => {
  const symbol = (code: string) => ({ USD: '$', EUR: '€' }[code] ?? code);

  it('найбільша сума йде першою', () => {
    // Найважливіша неврахована валюта — найбільша; її треба побачити одразу.
    expect(formatUncounted({ EUR: 45, USD: 150 }, symbol, 'uk-UA')).toBe('150 $ · 45 €');
  });

  it('нулі не показуємо', () => {
    expect(formatUncounted({ USD: 0, EUR: 45 }, symbol, 'uk-UA')).toBe('45 €');
  });

  it('порожньо — порожній рядок, а не «undefined»', () => {
    expect(formatUncounted(undefined, symbol, 'uk-UA')).toBe('');
    expect(formatUncounted({}, symbol, 'uk-UA')).toBe('');
  });

  it('розряди групуються за мовою інтерфейсу, а не завжди по-українськи', () => {
    // 'uk-UA' був зашитий у рядок: в англійському UI тисячі розділялися
    // нерозривним пробілом посеред англійського речення.
    const uk = formatUncounted({ USD: 1234567 }, symbol, 'uk-UA');
    const en = formatUncounted({ USD: 1234567 }, symbol, 'en-US');
    expect(en).toContain('1,234,567');
    expect(uk).not.toBe(en);
  });
});

describe('budgetTxCurrency', () => {
  it('рахунок — джерело істини', () => {
    expect(budgetTxCurrency(tx({ id: '1', accountId: 'usd' }), accounts, 'UAH')).toBe('USD');
  });

  it('без рахунку працює успадковане поле currency', () => {
    expect(budgetTxCurrency(
      { ...tx({ id: '1' }), accountId: undefined, currency: 'EUR' } as unknown as Transaction,
      accounts, 'UAH',
    )).toBe('EUR');
  });

  it('коли валюти взяти нізвідки — це основна валюта, а не UAH', () => {
    expect(budgetTxCurrency(
      { ...tx({ id: '1' }), accountId: undefined, currency: undefined } as unknown as Transaction,
      accounts, 'USD',
    )).toBe('USD');
  });
});
