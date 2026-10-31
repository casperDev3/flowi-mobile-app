/**
 * components/calendar/palette.ts — кольори екрана «Календар».
 *
 * DS v2.1: фон — mesh, картки — скло (glassOf(t).surface), аркуші — щільне скло,
 * акцент — info (ink). Нижче — історичний опис v2.
 * DS v2: фон — bg.canvas, картки — surface.card, вкладені/неактивні —
 * surface.subtle, текст — text.primary/secondary. Акцент календаря — та сама
 * глибока лаванда, що в «Завдань»/«Часу» (getScreenColors): нею позначено
 * «сьогодні» й посилання; ВИБРАНИЙ стан (день, сегмент, головна дія) —
 * action.primary + text.onAction, як усюди в DS.
 */
import { useMemo } from 'react';

import { theme } from '@/constants/theme';
import { glassOf } from '@/components/shared/dsTheme';

/** Світлий акцент календаря (лишився для статичних споживачів). */
export const CALENDAR_ACCENT = '#6D4CF5';
/** Особисті завдання — акцент «Завдань». */
export const PERSONAL_TASK_COLOR = '#6D4CF5';

export interface CalendarColors {
  bg1: string;
  bg2: string;
  card: string;
  sheet: string;
  border: string;
  dim: string;
  text: string;
  sub: string;
  /** Завжди #RRGGBB — споживачі дописують альфу (`accent + '14'`). */
  accent: string;
  /** Лінії сітки — тонші за рамки карток. */
  grid: string;
  /** Вибраний стан / головна дія (DS action.primary). */
  action: string;
  /** Текст і іконки на `action`. */
  onAction: string;
  /** Плейсхолдер / декоративний текст (НЕ підписи). */
  muted: string;
  /** DS v2.1: вибраний сегмент / день / чип — суцільний info (акцент календаря). */
  select: string;
  /** Текст і іконки на `select` (onSolid, #111113). */
  onSelect: string;
  /** Тонована info-змивка (сьогодні, активні мітки). */
  tint: string;
}

export function calendarColors(isDark: boolean): CalendarColors {
  // Напряму з constants/theme, а не через hooks/use-ds: палітру імпортують
  // модулі, що рендеряться в тестах без мока AsyncStorage.
  const t = isDark ? theme.dark : theme.light;
  return {
    bg1:    t.bg.canvas,
    bg2:    t.bg.canvas,
    card:   glassOf(t).surface,
    sheet:  glassOf(t).sheet,
    border: t.border.hairline,
    dim:    glassOf(t).surfaceSubtle,
    text:   t.text.primary,
    sub:    t.text.secondary,
    // DS v2.1: акцент календаря/зустрічей — info (glass.moduleAccent.calendar).
    accent: glassOf(t).accent.info.ink,
    grid:   t.border.hairline,
    action: t.action.primary,
    onAction: t.text.onAction,
    muted:  t.text.muted,
    select:   glassOf(t).accent.info.solid,
    onSelect: glassOf(t).accent.info.onSolid,
    tint:     glassOf(t).accent.info.tint,
  };
}

/**
 * Стабільне посилання, поки не змінилась тема: картки під React.memo
 * порівнюють пропси за посиланням.
 */
export function useCalendarColors(isDark: boolean): CalendarColors {
  return useMemo(() => calendarColors(isDark), [isDark]);
}
