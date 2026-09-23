/**
 * components/time/TimePalette.ts — палітра екрана «Час».
 *
 * Живе окремо, бо той самий набір кольорів тепер читають чотири компоненти
 * (екран, блок аномалій, форма запису, шухляда фільтрів). Передавати їх
 * розсипом пропів означало б чотири підписи по вісім рядків кожен, а
 * копіювати визначення — розійтися в темній темі на першій же правці.
 */

export interface TimeColors {
  bg1: string;
  bg2: string;
  card: string;
  border: string;
  text: string;
  sub: string;
  indigo: string;
  dim: string;
  sheet: string;
  danger: string;
  warn: string;
}

export function timeColors(isDark: boolean): TimeColors {
  return {
    bg1: isDark ? '#0C0C14' : '#F4F2FF',
    bg2: isDark ? '#14121E' : '#EAE6FF',
    card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
    text: isDark ? '#EEF0FF' : '#0D1033',
    sub: isDark ? 'rgba(238,240,255,0.62)' : 'rgba(13,16,51,0.58)',
    indigo: '#6366F1',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet: isDark ? 'rgba(10,12,24,0.98)' : 'rgba(250,251,255,0.98)',
    danger: '#EF4444',
    warn: '#F59E0B',
  };
}
