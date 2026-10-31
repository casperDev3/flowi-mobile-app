/**
 * components/finance/finPalette.ts — палітра розділу «Фінанси» на токенах
 * Design System v2 (docs/design-system-v2.md).
 *
 * Екрани фінансів (бюджет, скарбнички, підписки, статистика) і компоненти
 * розділу раніше тримали кожен свою копію «синьої» палітри з тонованими
 * фонами. Тепер усі беруть одне джерело: canvas-фон, білі картки, subtle-
 * інпути, текст за рівнями, статуси — з теми.
 *
 * `accent` — НЕ колір заливки кнопок: головні дії малюються pill
 * `action.primary` + `text.onAction`. `accent` — для гліфів і рамок
 * вибраного стану: DS v2.1 — ink акценту модуля (lime, ≥ 4.5:1 на склі).
 *
 * DS v2.1 (Liquid Glass): bg1/bg2 — основа mesh (<MeshBackground/>), card —
 * скло glass.surface (rgba; альфу НЕ дописувати), dim/input — скло subtle,
 * sheet — surfaceStrong (блюр — <GlassBackdrop/> в аркуші). Акцент модуля —
 * lime: `lime` — ink (іконки/текст на склі ≥ 4.5:1), `limeFill` — прогрес,
 * графіки, `limeTint` — змивка KPI / icon-chip.
 */
import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import { ds, dsTokens, glassTokens, useDS, type DSTheme, type GlassTokens } from '@/hooks/use-ds';

import type { FinColors } from './financeLabels';

/**
 * Готові стилі скла (заливка + спекулярний обідок, БЕЗ блюру й радіуса) —
 * для View/Pressable-карток, рядків, інпутів, аркушів. Блюр дає <GlassSurface>
 * / <Card> (великі картки) або <GlassBackdrop/> (аркуші). reduceTransparency →
 * суцільні поверхні.
 */
export interface GlassStyles {
  card: ViewStyle;
  strong: ViewStyle;
  subtle: ViewStyle;
}

export function glassStyles(isDark: boolean, reduceTransparency = false): GlassStyles {
  return {
    card: ds.glass(isDark, 'card', reduceTransparency),
    strong: ds.glass(isDark, 'strong', reduceTransparency),
    subtle: ds.glass(isDark, 'subtle', reduceTransparency),
  };
}

export interface FinPalette extends FinColors {
  t: DSTheme;
  g: GlassTokens;
  /** Стилі скла (fill + rim) поточної теми. */
  gl: GlassStyles;
  /** ink акценту модуля (lime) — іконки/текст на склі. */
  lime: string;
  /** fill акценту модуля — прогрес, кільця, графіки (≥ 3:1 на склі). */
  limeFill: string;
  /** Тонована змивка акцентом модуля. */
  limeTint: string;
  isDark: boolean;
  bg1: string;
  bg2: string;
  /** Лише placeholder / disabled / декор. */
  muted: string;
  input: string;
  amber: string;
  neutral: string;
  /** Тло головної дії й текст на ньому. */
  action: string;
  onAction: string;
  accentText: string;
}

export function finPalette(isDark: boolean, reduceTransparency = false): FinPalette {
  const t = dsTokens(isDark);
  const g = glassTokens(isDark);
  return {
    t,
    g,
    gl: glassStyles(isDark, reduceTransparency),
    lime: g.accent.lime.ink,
    limeFill: g.accent.lime.fill,
    limeTint: g.accent.lime.tint,
    isDark,
    bg1: g.mesh.base,
    bg2: g.mesh.base,
    card: reduceTransparency ? g.solid.card : g.surface,
    border: t.border.hairline,
    text: t.text.primary,
    sub: t.text.secondary,
    muted: t.text.muted,
    dim: g.surfaceSubtle,
    input: g.surfaceSubtle,
    sheet: g.surfaceStrong,
    accent: g.accent.lime.ink,
    accentText: t.text.primary,
    green: t.status.success,
    red: t.status.danger,
    amber: t.accent.amber,
    neutral: t.status.info,
    action: t.action.primary,
    onAction: t.text.onAction,
  };
}

/** Стилі скла поточної теми з урахуванням «Зменшити прозорість». */
export function useGlassStyles(): GlassStyles {
  const { isDark, reduceTransparency } = useDS();
  return useMemo(() => glassStyles(isDark, reduceTransparency), [isDark, reduceTransparency]);
}

/** Хук-обгортка: схема з теми застосунку (вибір користувача має пріоритет). */
export function useFinPalette(): FinPalette {
  const { isDark, reduceTransparency } = useDS();
  return useMemo(() => finPalette(isDark, reduceTransparency), [isDark, reduceTransparency]);
}
