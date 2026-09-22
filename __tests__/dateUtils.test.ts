import {
  endOfMonth, formatMonthYear, isInMonth, isSameDay, isSameMonth, localDateKey, nextMonth,
  parseLocalDateInput, prevMonth, resolveTimelineDatePatch, startOfMonth,
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

  test('parseLocalDateInput: північ ЛОКАЛЬНОГО часового поясу, не UTC', () => {
    const d = parseLocalDateInput('2026-09-20')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });

  test('parseLocalDateInput: невалідний формат/календарна дата → null, а не "перекочована"', () => {
    expect(parseLocalDateInput('2026-13-01')).toBeNull(); // місяця 13 нема
    expect(parseLocalDateInput('2026-02-30')).toBeNull(); // лютий 30 нема
    expect(parseLocalDateInput('не дата')).toBeNull();
    expect(parseLocalDateInput('')).toBeNull();
  });
});

describe('resolveTimelineDatePatch (review finding: Таймлайн проєкту зсував дату на день для UTC+2/+3)', () => {
  test('localDateKey зберігає той самий день, що показувала форма, для UTC-північі попереднього дня', () => {
    // 2026-09-20 00:00 у UTC+3 — це збережений ISO `2026-09-19T21:00:00.000Z`.
    // Стара `.slice(0, 10)` показала б «2026-09-19» — на день раніше.
    const storedUtcMidnightOfPrevDay = new Date('2026-09-19T21:00:00.000Z');
    expect(localDateKey(storedUtcMidnightOfPrevDay)).not.toBe(
      storedUtcMidnightOfPrevDay.toISOString().slice(0, 10),
    );
  });

  test('«Зберегти» без правок — patch порожній (ні startDate, ні deadline), навіть round-trip того самого дня', () => {
    const patch = resolveTimelineDatePatch({
      start: '2026-09-20', deadline: '2026-09-25',
      origStart: '2026-09-20', origDeadline: '2026-09-25',
    });
    expect(patch.ok).toBe(true);
    expect('startDate' in patch).toBe(false);
    expect('deadline' in patch).toBe(false);
  });

  test('правка лише старту — деталь дедлайну НЕ повертається (раніше мовчки зсувалась)', () => {
    const patch = resolveTimelineDatePatch({
      start: '2026-09-21', deadline: '2026-09-25',
      origStart: '2026-09-20', origDeadline: '2026-09-25',
    });
    expect(patch.ok).toBe(true);
    expect(patch.startDate).toBe(new Date(2026, 8, 21).toISOString());
    expect('deadline' in patch).toBe(false);
  });

  test('порожнє змінене поле → null (прибрати дату), незмінене порожнє лишається "не чіпати"', () => {
    const patch = resolveTimelineDatePatch({
      start: '', deadline: '',
      origStart: '2026-09-20', origDeadline: '',
    });
    expect(patch.ok).toBe(true);
    expect(patch.startDate).toBeNull();
    expect('deadline' in patch).toBe(false);
  });

  test('невалідна змінена дата перериває збереження (не чистить поле мовчки)', () => {
    const patch = resolveTimelineDatePatch({
      start: '2026-13-01', deadline: '2026-09-25',
      origStart: '2026-09-20', origDeadline: '2026-09-25',
    });
    expect(patch.ok).toBe(false);
  });
});
