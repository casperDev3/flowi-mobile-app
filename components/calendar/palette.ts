/**
 * components/calendar/palette.ts — кольори екрана «Календар».
 *
 * Фони й акцент — ті самі, що були в «Нарад» (індиго «Часу»): календар
 * успадкував їхнє місце в навігації, і зміна гами виглядала б як інший
 * розділ, а не той самий, що виріс.
 */
import { useMemo } from 'react';

export const CALENDAR_ACCENT = '#6366F1';
/** Особисті завдання — акцент «Завдань». */
export const PERSONAL_TASK_COLOR = '#7C3AED';

export interface CalendarColors {
  bg1: string;
  bg2: string;
  card: string;
  sheet: string;
  border: string;
  dim: string;
  text: string;
  sub: string;
  accent: string;
  /** Лінії сітки — тонші за рамки карток. */
  grid: string;
}

export function calendarColors(isDark: boolean): CalendarColors {
  return {
    bg1:    isDark ? '#0A0C18' : '#EEF0FF',
    bg2:    isDark ? '#121525' : '#E2E5FF',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
    sheet:  isDark ? 'rgba(18,18,32,0.96)' : 'rgba(245,244,255,0.97)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    dim:    isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    text:   isDark ? '#F2F0FF' : '#1A1830',
    sub:    isDark ? 'rgba(210,205,255,0.62)' : 'rgba(80,70,140,0.58)',
    accent: CALENDAR_ACCENT,
    grid:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  };
}

/**
 * Стабільне посилання, поки не змінилась тема: картки під React.memo
 * порівнюють пропси за посиланням.
 */
export function useCalendarColors(isDark: boolean): CalendarColors {
  return useMemo(() => calendarColors(isDark), [isDark]);
}
