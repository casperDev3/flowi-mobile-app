/**
 * __tests__/finance-category-options.test.ts — список категорій для пікера.
 *
 * Список будують ДВА клієнти (мобільний і веб) за одним правилом, тож правило
 * мусить бути перевірене окремо від екрана: розбіжність тут означала б, що на
 * телефоні категорія є, а в браузері її немає — на тих самих даних.
 *
 * Друга вимога — нічого зі старих даних не має зникати. Категорію могли
 * прибрати з керування або завести ще до появи колекції `categories`, а
 * операції під нею лишились.
 */

import {
  DEFAULT_CATEGORIES_UK,
  categoryNameIssue,
  categoryOptions,
  categoryPresets,
  usedCategoryNames,
} from '../utils/financeCategories';

const rows = [
  { id: 'expense:Їжа', type: 'expense', name: 'Їжа', icon: 'fork.knife' },
  { id: 'expense:Авто', type: 'expense', name: 'Авто', icon: 'car.fill' },
  { id: 'income:Зарплата', type: 'income', name: 'Зарплата', icon: 'briefcase.fill' },
];

const txs = [
  { type: 'expense', category: 'Їжа' },
  { type: 'expense', category: 'Ліки' },
  { type: 'expense', category: 'Бензин' },
  { type: 'income', category: 'Кешбек' },
  // Переказ категорії не має — його рядок у список потрапити не сміє.
  { type: 'transfer', category: 'Переказ' },
];

describe('categoryPresets', () => {
  test('бере збережені рядки свого типу і в їхньому порядку', () => {
    expect(categoryPresets(rows, 'expense', 'uk').map(c => c.name)).toEqual(['Їжа', 'Авто']);
    expect(categoryPresets(rows, 'income', 'uk').map(c => c.name)).toEqual(['Зарплата']);
  });

  test('порожня колекція — дефолти мови, а не порожнеча', () => {
    expect(categoryPresets([], 'expense', 'uk')).toEqual(DEFAULT_CATEGORIES_UK.expense);
  });
});

describe('usedCategoryNames', () => {
  test('лише свій тип, без дублів, за абеткою', () => {
    expect(usedCategoryNames(txs, 'expense')).toEqual(['Бензин', 'Їжа', 'Ліки']);
    expect(usedCategoryNames(txs, 'income')).toEqual(['Кешбек']);
  });

  test('порожні й пробільні назви не рахуються', () => {
    expect(usedCategoryNames([{ type: 'expense', category: '  ' }, { type: 'expense' }], 'expense')).toEqual([]);
  });
});

describe('categoryOptions', () => {
  test('збережені у своєму порядку, далі сироти з операцій за абеткою', () => {
    expect(categoryOptions(rows, txs, 'expense', 'uk').map(c => c.name))
      .toEqual(['Їжа', 'Авто', 'Бензин', 'Ліки']);
  });

  test('назва, що є і в колекції, і в операціях, не подвоюється', () => {
    const names = categoryOptions(rows, txs, 'expense', 'uk').map(c => c.name);
    expect(names.filter(name => name === 'Їжа')).toHaveLength(1);
  });

  test('сироті ставимо дефолтну іконку — взяти її нема звідки', () => {
    const liky = categoryOptions(rows, txs, 'expense', 'uk').find(c => c.name === 'Ліки');
    expect(liky?.icon).toBe('ellipsis.circle.fill');
  });

  test('порожня колекція: дефолти плюс те, під чим уже лежать операції', () => {
    const names = categoryOptions([], txs, 'expense', 'uk').map(c => c.name);
    expect(names.slice(0, DEFAULT_CATEGORIES_UK.expense.length))
      .toEqual(DEFAULT_CATEGORIES_UK.expense.map(c => c.name));
    expect(names).toContain('Ліки');
  });
});

describe('categoryNameIssue', () => {
  test('порожня назва', () => {
    expect(categoryNameIssue('expense', '   ', [])).toBe('empty');
  });

  test('дубль без огляду на регістр', () => {
    expect(categoryNameIssue('expense', ' їжа ', ['Їжа'])).toBe('duplicate');
  });

  test('межу рахуємо від повного id, а не від назви', () => {
    // id = `expense:` (8) + назва, межа — 64 символи.
    expect(categoryNameIssue('expense', 'я'.repeat(56), [])).toBeNull();
    expect(categoryNameIssue('expense', 'я'.repeat(57), [])).toBe('tooLong');
    // 'income:' коротший на символ — і назві дозволено на символ більше.
    expect(categoryNameIssue('income', 'я'.repeat(57), [])).toBeNull();
  });
});
