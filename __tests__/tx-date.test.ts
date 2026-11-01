/**
 * __tests__/tx-date.test.ts — дата операції з обраного дня (форма Фінансів і
 * бюджету проєкту). Дзеркало правила веб transaction-form.tsx.
 */
import { txDateForDayKey, txDayKey, txSaveDayKey } from '@/utils/txDate';

describe('txDateForDayKey', () => {
  const now = new Date(2026, 9, 18, 15, 45, 12);

  test('нова операція: обраний день о поточній годині', () => {
    expect(txDateForDayKey('2026-10-17', undefined, now)).toBe(new Date(2026, 9, 17, 15, 45, 12).toISOString());
    expect(txDateForDayKey('2026-12-01', undefined, now)).toBe(new Date(2026, 11, 1, 15, 45, 12).toISOString());
  });

  test('правка: той самий день — рядок дати байт-у-байт той самий', () => {
    const original = new Date(2026, 9, 10, 8, 5).toISOString();
    expect(txDateForDayKey(txDayKey(original), original, now)).toBe(original);
  });

  test('правка: інший день — година оригіналу зберігається', () => {
    const original = new Date(2026, 9, 10, 8, 5).toISOString();
    expect(txDateForDayKey('2026-09-30', original, now)).toBe(new Date(2026, 8, 30, 8, 5).toISOString());
  });

  test('битий ключ: нова — зараз, правка — оригінал', () => {
    const original = new Date(2026, 9, 10, 8, 5).toISOString();
    expect(txDateForDayKey('nope', undefined, now)).toBe(now.toISOString());
    expect(txDateForDayKey('nope', original, now)).toBe(original);
  });

  test('txDayKey — локальний день; бита дата — сьогодні', () => {
    expect(txDayKey(new Date(2026, 0, 2, 23, 59).toISOString())).toBe('2026-01-02');
    expect(txDayKey('garbage', now)).toBe('2026-10-18');
    expect(txDayKey(undefined, now)).toBe('2026-10-18');
  });
});

describe('ревʼю 2026-10-18', () => {
  test('легасі-дата без часу — той самий день (без зсуву на захід від UTC)', () => {
    expect(txDayKey('2026-10-18')).toBe('2026-10-18');
    expect(txDayKey('2026-01-01')).toBe('2026-01-01');
  });

  test('форма, лишена відкритою за північ: нечіпаний день — сьогодні на момент збереження', () => {
    const afterMidnight = new Date(2026, 9, 19, 0, 3);
    expect(txSaveDayKey('2026-10-18', false, afterMidnight)).toBe('2026-10-19');
    expect(txDateForDayKey(txSaveDayKey('2026-10-18', false, afterMidnight), undefined, afterMidnight))
      .toBe(afterMidnight.toISOString());
  });

  test('день, обраний людиною, лишається', () => {
    expect(txSaveDayKey('2026-10-18', true, new Date(2026, 9, 19, 0, 3))).toBe('2026-10-18');
  });
});
