/**
 * __tests__/top-inset.test.ts — верхній інсет хедера.
 *
 * Регрес, який ці кейси стережуть: хедер малювався під статус-баром.
 * На Android це траплялося назавжди — WindowInsetsCompat віддавав top=0,
 * і фолбеку не було; на iOS — лише на кадрах до нативного коміту padding.
 */
import { resolveTopInset } from '../hooks/use-top-inset';

describe('resolveTopInset', () => {
  it('на iOS віддає інсет як є', () => {
    // StatusBar.currentHeight там завжди undefined і в формулу не входить.
    expect(resolveTopInset(59, 'ios', undefined)).toBe(59);
    expect(resolveTopInset(20, 'ios', 44)).toBe(20);
  });

  it('на Android з нульовим інсетом бере висоту статус-бара', () => {
    // Саме той випадок, коли хедер сідав упритул до годинника.
    expect(resolveTopInset(0, 'android', 24)).toBe(24);
  });

  it('на Android не занижує реальний інсет до висоти статус-бара', () => {
    // Виріз більший за смугу статусу — Math.max лишає більше з двох
    // і нічого не подвоює.
    expect(resolveTopInset(48, 'android', 24)).toBe(48);
  });

  it('на Android переживає відсутню висоту статус-бара', () => {
    // currentHeight типізовано як number|undefined і на частині прошивок
    // приходить порожнім — це не привід віддати NaN у paddingTop.
    expect(resolveTopInset(31, 'android', null)).toBe(31);
    expect(resolveTopInset(31, 'android', undefined)).toBe(31);
    expect(resolveTopInset(0, 'android', undefined)).toBe(0);
  });

  it('невідома платформа поводиться як iOS', () => {
    // web у Expo: StatusBar.currentHeight там сенсу не має.
    expect(resolveTopInset(12, 'web', 99)).toBe(12);
  });
});
