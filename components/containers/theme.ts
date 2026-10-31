/**
 * components/containers/theme.ts — кольори модуля «Контейнери» на токенах
 * Design System v2 (docs/design-system-v2.md): canvas-фон, білі картки,
 * subtle-інпути, текст за рівнями. Власних тонованих фонів модуль більше не
 * має; акцент екрана — accent.amber (лише декор: іконки, рамки, крапки),
 * головні дії — pill action.primary.
 */
import { useMemo } from 'react';

import { glassStyles, type GlassStyles } from '@/components/finance/finPalette';
import { dsTokens, glassTokens, useDS, type DSTheme, type GlassTokens } from '@/hooks/use-ds';

/** Декоративний акцент модуля (accent.amber). Не для тексту й не під білий підпис. */
export const CONTAINERS_ACCENT = '#F6B93B';

/*
 * DS v2.1 (Liquid Glass): bg1/bg2 — основа mesh (плями — <MeshBackground/>),
 * card — скло glass.surface (rgba; альфу НЕ дописувати), dim — скло subtle,
 * sheet — surfaceStrong. Акцент модуля — amber: `accent` (ink, текст/іконки
 * на склі ≥ 4.5:1), `accentFill` (прогрес, крапки), `accentTint` (змивка).
 */

export interface ContainersColors {
  isDark: boolean;
  /** Повні токени DS — для pill-кнопок, статусів, placeholder тощо. */
  t: DSTheme;
  /** Токени Liquid Glass. */
  g: GlassTokens;
  /** Стилі скла (fill + rim). */
  gl: GlassStyles;
  /** ink акценту модуля (amber) — іконки/текст на склі. */
  accent: string;
  /** Тонована змивка акцентом (icon-chip, KPI, активний стан). */
  accentTint: string;
  bg1: string;
  bg2: string;
  border: string;
  text: string;
  sub: string;
  /** Лише placeholder / disabled / декор. */
  muted: string;
  dim: string;
  sheet: string;
  card: string;
}

export function containersColors(isDark: boolean, reduceTransparency = false): ContainersColors {
  const t = dsTokens(isDark);
  const g = glassTokens(isDark);
  return {
    isDark,
    t,
    g,
    gl: glassStyles(isDark, reduceTransparency),
    accent: g.accent.amber.ink,
    accentTint: g.accent.amber.tint,
    bg1: g.mesh.base,
    bg2: g.mesh.base,
    border: t.border.hairline,
    text: t.text.primary,
    sub: t.text.secondary,
    muted: t.text.muted,
    dim: g.surfaceSubtle,
    sheet: g.surfaceStrong,
    card: reduceTransparency ? g.solid.card : g.surface,
  };
}

export function useContainersColors(): ContainersColors {
  const { isDark, reduceTransparency } = useDS();
  return useMemo(() => containersColors(isDark, reduceTransparency), [isDark, reduceTransparency]);
}
