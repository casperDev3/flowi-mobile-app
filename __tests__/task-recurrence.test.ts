/**
 * nextRecurrenceDate переїхав з app/(tabs)/index.tsx у utils/taskRecurrence.ts
 * (watch-lockscreen-v1.md §3.1 п.6). Сервер має порт (`watch/recurrence.py`)
 * з тими самими особливостями — ці очікування фіксують алгоритм дослівно.
 */
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import { nextRecurrenceDate } from '@/utils/taskRecurrence';

const rule = (r: Partial<RecurrenceRule>): RecurrenceRule => ({ freq: 'daily', interval: 1, ...r });

describe('nextRecurrenceDate', () => {
  it('daily: +interval днів', () => {
    expect(nextRecurrenceDate('2026-10-18', rule({ freq: 'daily' }))).toBe('2026-10-19');
  });

  it('weekly без днів: +7·interval', () => {
    expect(nextRecurrenceDate('2026-10-18', rule({ freq: 'weekly' }))).toBe('2026-10-25');
  });

  it('weekly з днями (0=Пн): найближчий пізніший день цього тижня', () => {
    // 2026-10-19 — понеділок → середа того ж тижня.
    expect(nextRecurrenceDate('2026-10-19', rule({ freq: 'weekly', daysOfWeek: [0, 2] }))).toBe('2026-10-21');
    // Неділя — далі в тижні нічого: перший обраний день через interval тижнів.
    expect(nextRecurrenceDate('2026-10-18', rule({ freq: 'weekly', daysOfWeek: [0, 2] }))).toBe('2026-10-19');
  });

  it('weekly з днями й interval=2: після останнього дня — понеділок через тиждень', () => {
    expect(nextRecurrenceDate('2026-10-21', rule({ freq: 'weekly', interval: 2, daysOfWeek: [0, 2] }))).toBe('2026-11-02');
  });

  it('monthly/yearly — переповнення як у Date (31 січня → 3 березня)', () => {
    expect(nextRecurrenceDate('2026-01-31', rule({ freq: 'monthly' }))).toBe('2026-03-03');
    expect(nextRecurrenceDate('2024-02-29', rule({ freq: 'yearly' }))).toBe('2025-03-01');
  });

  it('until обрізає серію', () => {
    expect(nextRecurrenceDate('2026-10-18', rule({ freq: 'daily', interval: 3, until: '2026-10-20' }))).toBeNull();
    expect(nextRecurrenceDate('2026-10-18', rule({ freq: 'daily', interval: 2, until: '2026-10-20' }))).toBe('2026-10-20');
  });
});
