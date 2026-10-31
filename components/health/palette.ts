/**
 * components/health/palette.ts — палітра розділу «Здоровʼя» на токенах
 * Design System v2 (docs/design-system-v2.md).
 *
 * Ті самі ключі, що й у `HealthColors` (utils/healthTheme.ts), тож компоненти
 * розділу переходять на DS заміною одного виклику:
 *   getHealthColors(isDark)  →  getHealthDSColors(isDark)
 * Кольори метрик (HEALTH_ACCENTS) лишаються на ДАНИХ — кільцях і графіках;
 * елементи керування — action.primary / скло subtle.
 *
 * DS v2.1 (Liquid Glass): bg1/bg2 — основа mesh (плями малює <MeshBackground/>),
 * card — скло glass.surface (rgba; альфу НЕ дописувати), dim/track — скло
 * subtle, sheet — glass.surfaceStrong (під щільний текст форм; блюр додає
 * <GlassBackdrop/> усередині аркуша).
 */
import type { ViewStyle } from 'react-native';

import { glass, theme, type DSTheme } from '@/constants/theme';
import type { HealthColors } from '@/utils/healthTheme';

export function getHealthDSColors(isDark: boolean, reduceTransparency = false): HealthColors {
  const t = isDark ? theme.dark : theme.light;
  const g = isDark ? glass.dark : glass.light;
  return {
    bg1: g.mesh.base,
    bg2: g.mesh.base,
    border: t.border.hairline,
    text: t.text.primary,
    sub: t.text.secondary,
    dim: g.surfaceSubtle,
    sheet: g.surfaceStrong,
    track: g.surfaceSubtle,
    card: reduceTransparency ? g.solid.card : g.surface,
  };
}

/**
 * Токени DS за самою палітрою розділу — для компонентів, які отримують лише
 * `c` (без isDark) і не мають тягнути store/theme-context (їх імпортують
 * чисті тести). Розпізнає і DS-палітру, і легасі getHealthColors().
 */
export function dsTokensFor(c: Pick<HealthColors, 'bg1' | 'text'>): DSTheme {
  const dark =
    c.bg1 === theme.dark.bg.canvas || c.bg1 === glass.dark.mesh.base || c.bg1 === '#0C0C14' || c.text === theme.dark.text.primary;
  return dark ? theme.dark : theme.light;
}

/** Акцент модуля «Здоровʼя» у шарі скла (glass.moduleAccent.health). */
export const HEALTH_GLASS_ACCENT = 'coral' as const;

/**
 * Стилі скла (заливка + спекулярний обідок) БЕЗ хуків і без hooks/use-ds —
 * для компонентів розділу, які імпортують чисті тести (HealthEntryModal).
 * Ті самі значення, що ds.glass() у hooks/use-ds.ts.
 */
export function healthGlassStyles(isDark: boolean): { card: ViewStyle; strong: ViewStyle; subtle: ViewStyle } {
  const g = isDark ? glass.dark : glass.light;
  const rim = (fill: string, subtle = false): ViewStyle => ({
    backgroundColor: fill,
    borderWidth: 1,
    borderColor: subtle ? g.rimShade : g.rim,
    borderTopColor: g.rim,
    borderBottomColor: g.rimShade,
  });
  return { card: rim(g.surface), strong: rim(g.surfaceStrong), subtle: rim(g.surfaceSubtle, true) };
}

