/**
 * __tests__/budget-presets.test.ts — пресети бюджету мусять збігатися з
 * категоріями, під якими реально лежать операції.
 *
 * Бюджет звіряє витрати з лімітами за РЯДКОМ назви категорії. Доки пресети
 * були зашиті українською, англійський інтерфейс давав сім порожніх
 * українських рядків і окремий авто-доданий «Food»: ліміт, поставлений на
 * «Їжа», не зменшувався ніколи, а українські рядки ще й осідали в
 * 'budget_limits' та в outbox синхронізації.
 */

import {
  DEFAULT_CATEGORIES_EN,
  DEFAULT_CATEGORIES_UK,
  defaultCategories,
  expenseCategoryPresets,
} from '../utils/financeCategories';

describe('пресети без збережених категорій', () => {
  test('англійський інтерфейс — англійські пресети', () => {
    expect(expenseCategoryPresets([], 'en').map(c => c.name))
      .toEqual(DEFAULT_CATEGORIES_EN.expense.map(c => c.name));
  });

  test('український інтерфейс — українські пресети', () => {
    expect(expenseCategoryPresets([], 'uk').map(c => c.name))
      .toEqual(DEFAULT_CATEGORIES_UK.expense.map(c => c.name));
  });

  test('джерело пресетів те саме, що й у фінансів', () => {
    // Копія списку в екрані бюджету і була причиною розбіжності — тепер
    // обидва екрани беруть його з одного місця.
    expect(expenseCategoryPresets([], 'en').map(c => c.name))
      .toEqual(defaultCategories('en').expense.map(c => c.name));
  });

  test('англійська витрата має свій рядок у бюджеті, а не порожні українські', () => {
    const names = expenseCategoryPresets([], 'en').map(c => c.name);
    expect(names).toContain('Food');
    expect(names).not.toContain('Їжа');
  });
});

describe('пресети зі збережених категорій', () => {
  const rows = [
    { id: 'expense:Food', type: 'expense', name: 'Food', icon: 'fork.knife' },
    { id: 'expense:Cats', type: 'expense', name: 'Cats', icon: 'pawprint.fill' },
    { id: 'income:Salary', type: 'income', name: 'Salary', icon: 'briefcase.fill' },
  ];

  test('беремо витратні категорії користувача, а не дефолти', () => {
    expect(expenseCategoryPresets(rows, 'uk').map(c => c.name)).toEqual(['Food', 'Cats']);
  });

  test('іконка користувача зберігається', () => {
    expect(expenseCategoryPresets(rows, 'uk').find(c => c.name === 'Cats')?.icon)
      .toBe('pawprint.fill');
  });

  test('порожні й биті рядки не створюють категорій-привидів', () => {
    const dirty = [
      { id: '', type: 'expense', name: '', icon: 'fork.knife' },
      { id: 'expense:Food', type: 'expense', name: 'Food', icon: '' },
    ];
    const presets = expenseCategoryPresets(dirty as any, 'en');
    expect(presets.map(c => c.name)).toEqual(['Food']);
    expect(presets[0].icon).toBeTruthy();
  });

  test('лише доходи збережені — витрати падають на дефолти мови', () => {
    const onlyIncome = [{ id: 'income:Salary', type: 'income', name: 'Salary', icon: 'briefcase.fill' }];
    expect(expenseCategoryPresets(onlyIncome, 'en').map(c => c.name))
      .toEqual(DEFAULT_CATEGORIES_EN.expense.map(c => c.name));
  });
});
