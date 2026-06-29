import {
  endOfMonth, formatMonthYear, isInMonth, isSameDay, isSameMonth, nextMonth, prevMonth, startOfMonth,
} from '@/utils/dateUtils';

describe('dateUtils', () => {
  test('isSameDay ignores time', () => {
    expect(isSameDay(new Date(2026, 5, 29, 1), new Date(2026, 5, 29, 23))).toBe(true);
    expect(isSameDay(new Date(2026, 5, 29), new Date(2026, 5, 30))).toBe(false);
    expect(isSameDay(new Date(2026, 5, 29), new Date(2025, 5, 29))).toBe(false);
  });

  test('isSameMonth', () => {
    expect(isSameMonth(new Date(2026, 5, 1), new Date(2026, 5, 30))).toBe(true);
    expect(isSameMonth(new Date(2026, 5, 1), new Date(2026, 6, 1))).toBe(false);
  });

  test('startOfMonth / endOfMonth', () => {
    const s = startOfMonth(new Date(2026, 5, 15));
    expect(s.getDate()).toBe(1);
    expect(s.getHours()).toBe(0);
    const e = endOfMonth(new Date(2026, 5, 15)); // червень = 30 днів
    expect(e.getDate()).toBe(30);
    expect(e.getMonth()).toBe(5);
    // лютий 2024 (високосний) = 29
    expect(endOfMonth(new Date(2024, 1, 10)).getDate()).toBe(29);
  });

  test('prevMonth / nextMonth wrap year', () => {
    expect(prevMonth(new Date(2026, 0, 15)).getFullYear()).toBe(2025);
    expect(prevMonth(new Date(2026, 0, 15)).getMonth()).toBe(11);
    expect(nextMonth(new Date(2026, 11, 15)).getFullYear()).toBe(2027);
    expect(nextMonth(new Date(2026, 11, 15)).getMonth()).toBe(0);
  });

  test('isInMonth / formatMonthYear', () => {
    expect(isInMonth(new Date(2026, 5, 20), new Date(2026, 5, 1))).toBe(true);
    expect(isInMonth(new Date(2026, 6, 1), new Date(2026, 5, 1))).toBe(false);
    expect(formatMonthYear(new Date(2026, 3, 1), ['Січень', 'Лютий', 'Березень', 'Квітень'])).toBe('Квітень 2026');
  });
});
