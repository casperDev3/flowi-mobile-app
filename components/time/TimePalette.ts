/**
 * components/time/TimePalette.ts — палітра екрана «Час».
 *
 * Живе окремо, бо той самий набір кольорів тепер читають чотири компоненти
 * (екран, блок аномалій, форма запису, шухляда фільтрів). Передавати їх
 * розсипом пропів означало б чотири підписи по вісім рядків кожен, а
 * копіювати визначення — розійтися в темній темі на першій же правці.
 */

import { glassStyles, type GlassStyles } from '@/components/finance/finPalette';
import { dsTokens, glassTokens, type DSTheme, type GlassTokens } from '@/hooks/use-ds';

/**
 * Значення — токени Design System v2 (docs/design-system-v2.md): canvas-фон,
 * непрозорі картки, текст за рівнями. `indigo` лишився назвою поля (на нього
 * спираються споживачі), але це акцент екрана «Час» — глибока лаванда, що
 * тримає білий підпис (див. getScreenColors('time')).
 *
 * DS v2.1 (Liquid Glass): bg1/bg2 — основа mesh, card — скло glass.surface
 * (rgba, альфу НЕ дописувати), dim — скло subtle, sheet — surfaceStrong.
 * `indigo` — ink акценту модуля «Час» (amber): #RRGGBB, ≥ 4.5:1 як текст/
 * іконка на склі в обох темах. НЕ фон під білий підпис (у темній він світлий).
 */
export interface TimeColors {
  /** Повні токени DS — для pill-кнопок, чипів, станів. */
  t: DSTheme;
  /** Токени Liquid Glass (акценти, rim, mesh). */
  g: GlassTokens;
  /** Стилі скла (fill + rim). */
  gl: GlassStyles;
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
  /** Лише placeholder / disabled / декор. */
  muted: string;
}

export function timeColors(isDark: boolean, reduceTransparency = false): TimeColors {
  const t = dsTokens(isDark);
  const g = glassTokens(isDark);
  return {
    t,
    g,
    gl: glassStyles(isDark, reduceTransparency),
    bg1: g.mesh.base,
    bg2: g.mesh.base,
    card: reduceTransparency ? g.solid.card : g.surface,
    border: t.border.hairline,
    text: t.text.primary,
    sub: t.text.secondary,
    indigo: g.accent.amber.ink,
    dim: g.surfaceSubtle,
    sheet: g.surfaceStrong,
    danger: t.status.danger,
    warn: t.status.warning,
    muted: t.text.muted,
  };
}
