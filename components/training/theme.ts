/**
 * components/training/theme.ts — палітра модуля тренувань на токенах
 * Design System v2 (docs/design-system-v2.md).
 *
 * Фон — `bg.canvas`, картки — суцільний `surface.card`, поля й чипи —
 * `surface.subtle`, текст — `text.primary/secondary`. Акцент модуля
 * (`TG_ACCENT`) лишився лише для іконок, бейджів і даних; головні дії —
 * pill `action.primary` (див. PrimaryButton у TrainingBits).
 *
 * DS v2.1 (Liquid Glass): bg1/bg2 — основа mesh (<MeshBackground/>), card —
 * скло glass.surface (rgba; альфу НЕ дописувати), input/chip — скло subtle.
 * Акцент модуля — success (moduleAccent.training): `accent` — ink (текст/
 * іконки на склі), `accentTint` — змивка для icon-chip / KPI / активного стану.
 */
import { useMemo } from 'react';

import { glass, theme, type DSTheme, type GlassTokens } from '@/constants/theme';
import { glassStyles, type GlassStyles } from '@/components/finance/finPalette';
import { useDS } from '@/hooks/use-ds';

/** Акцент модуля — status.info: тримає білий підпис і читається в обох темах. */
export const TG_ACCENT = theme.light.status.info;
/** XP / бонуси — бурштин (прогрес, gauge). */
export const TG_XP = theme.light.accent.amber;
export const TG_OK = theme.light.status.success;
export const TG_WARN = theme.light.status.warning;
export const TG_ERR = theme.light.status.danger;

export interface TrainingColors {
  isDark: boolean;
  /** Токени DS v2 поточної теми — для action/accent/state. */
  t: DSTheme;
  /** Токени Liquid Glass. */
  g: GlassTokens;
  /** Стилі скла (fill + rim). */
  gl: GlassStyles;
  accent: string;
  accentTint: string;
  bg1: string;
  bg2: string;
  text: string;
  sub: string;
  /** Лише placeholder / декоративні іконки (text.muted, < 4.5:1). */
  faint: string;
  border: string;
  card: string;
  input: string;
  chip: string;
  blurTint: 'dark' | 'light';
}

export function makeTrainingColors(isDark: boolean, reduceTransparency = false): TrainingColors {
  const t = isDark ? theme.dark : theme.light;
  const g = isDark ? glass.dark : glass.light;
  return {
    isDark,
    t,
    g,
    gl: glassStyles(isDark, reduceTransparency),
    accent: g.accent.success.ink,
    accentTint: g.accent.success.tint,
    bg1: g.mesh.base,
    bg2: g.mesh.base,
    text: t.text.primary,
    sub: t.text.secondary,
    faint: t.text.muted,
    border: t.border.hairline,
    card: reduceTransparency ? g.solid.card : g.surface,
    input: g.surfaceSubtle,
    chip: g.surfaceSubtle,
    blurTint: isDark ? 'dark' : 'light',
  };
}

export function useTrainingColors(): TrainingColors {
  const { isDark, reduceTransparency } = useDS();
  return useMemo(() => makeTrainingColors(isDark, reduceTransparency), [isDark, reduceTransparency]);
}

/** Підстановка `{name}` у рядки словника. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
