/**
 * components/shared/dsTheme.ts — токени DS v2 за прапором isDark, без хуків і
 * без імпорту theme-context (тож і без AsyncStorage): для компонентів, що
 * отримують isDark пропом і рендеряться в тестах без моків сховища.
 *
 * DS v2.1 (Liquid Glass): `dsGlass(isDark)` — токени скла, `glassFill(...)` —
 * заливка + спекулярний обідок скла (той самий рецепт, що `ds.glass` у
 * hooks/use-ds.ts, але без імпорту theme-context).
 */
import type { ViewStyle } from 'react-native';

import { glass, theme, type DSTheme, type GlassAccent, type GlassTokens } from '@/constants/theme';

export function dsTheme(isDark: boolean): DSTheme {
  return isDark ? theme.dark : theme.light;
}

export function dsGlass(isDark: boolean): GlassTokens {
  return isDark ? glass.dark : glass.light;
}

export type GlassFillVariant = 'card' | 'strong' | 'subtle';

/**
 * Скло без блюру: напівпрозора заливка + обідок (світліший верх, тінь знизу).
 * reduceTransparency → суцільна поверхня + hairline.
 */
export function glassFill(isDark: boolean, variant: GlassFillVariant = 'card', reduceTransparency = false): ViewStyle {
  const g = dsGlass(isDark);
  if (reduceTransparency) {
    return {
      backgroundColor: variant === 'subtle' ? g.solid.subtle : variant === 'strong' ? g.solid.strong : g.solid.card,
      borderWidth: variant === 'subtle' ? 0 : 1,
      borderColor: dsTheme(isDark).border.hairline,
    };
  }
  return {
    backgroundColor: variant === 'strong' ? g.surfaceStrong : variant === 'subtle' ? g.surfaceSubtle : g.surface,
    borderWidth: 1,
    borderColor: variant === 'subtle' ? g.rimShade : g.rim,
    borderTopColor: g.rim,
    borderBottomColor: g.rimShade,
  };
}

/** Тонована акцентом «змивка» поверх скла (KPI-картки, активні пункти). */
export function accentWash(isDark: boolean, accent: GlassAccent): ViewStyle {
  return { backgroundColor: dsGlass(isDark).accent[accent].tint };
}

/** М'яка розсіяна тінь скла (iOS); Android — без elevation (просвічує крізь скло). */
export function glassShadow(isDark: boolean): ViewStyle {
  return dsGlass(isDark).shadow;
}

// ─── glassOf(t) — скло за об'єктом токенів (без isDark і без хуків) ─────────

/**
 * «Зменшити прозорість» поза хуками: модульний прапорець, який оновлює
 * слухач AccessibilityInfo (iOS) / matchMedia (веб). Компонентам, що
 * мусять миттєво реагувати, — `useDSTheme().rt` / `useDS().reduceTransparency`.
 */
let rtNow = false;
let rtStarted = false;
function startRt() {
  if (rtStarted) return;
  rtStarted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AccessibilityInfo, Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-transparency: reduce)') : null;
      if (mq) { rtNow = mq.matches; mq.addEventListener?.('change', e => { rtNow = e.matches; }); }
      return;
    }
    AccessibilityInfo.isReduceTransparencyEnabled?.().then(v => { rtNow = !!v; }).catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', v => { rtNow = !!v; });
  } catch {
    // немає API (тести, Android) — лишаємо скло
  }
}

export type GlassOf = GlassTokens & {
  /** Щільне скло аркушів/модалок/поповерів над затемненим бекдропом (secondary ≥ 4.5:1). */
  sheet: string;
};

const SHEET_FILL = { light: 'rgba(255,255,255,0.88)', dark: 'rgba(30,30,36,0.88)' } as const;
const glassOfCache = new Map<string, GlassOf>();

/**
 * Токени скла за об'єктом DS-токенів `t` (theme.light / theme.dark):
 * `glassOf(t).surface` замість `t.surface.card`, `.surfaceSubtle` замість
 * `t.surface.subtle`, `.sheet` замість `t.surface.elevated`. «Зменшити
 * прозорість» → суцільні solid.* .
 */
export function glassOf(t: DSTheme): GlassOf {
  startRt();
  const isDark = t.bg.canvas === theme.dark.bg.canvas;
  const key = `${isDark ? 'd' : 'l'}${rtNow ? 1 : 0}`;
  const hit = glassOfCache.get(key);
  if (hit) return hit;
  const g = dsGlass(isDark);
  const v: GlassOf = rtNow
    ? { ...g, surface: g.solid.card, surfaceStrong: g.solid.strong, surfaceSubtle: g.solid.subtle, sheet: g.solid.strong }
    : { ...g, sheet: SHEET_FILL[isDark ? 'dark' : 'light'] };
  glassOfCache.set(key, v);
  return v;
}

/** Обідок скла для довільного блока (додати до заливки glassOf(t).*). */
export function glassRim(t: DSTheme, variant: GlassFillVariant = 'card'): ViewStyle {
  const isDark = t.bg.canvas === theme.dark.bg.canvas;
  const g = dsGlass(isDark);
  if (rtNow) return { borderWidth: variant === 'subtle' ? 0 : 1, borderColor: t.border.hairline };
  return {
    borderWidth: 1,
    borderColor: variant === 'subtle' ? g.rimShade : g.rim,
    borderTopColor: g.rim,
    borderBottomColor: g.rimShade,
  };
}

const DARK_FILLS = new Set<string>([
  glass.dark.surface, glass.dark.surfaceStrong, glass.dark.surfaceSubtle,
  glass.dark.solid.card, glass.dark.solid.strong, glass.dark.solid.subtle,
  SHEET_FILL.dark, theme.dark.surface.card, theme.dark.surface.elevated, theme.dark.surface.subtle,
]);

/**
 * Обідок скла за кольором заливки (`c.card` / `c.sheet` з палітри екрана):
 * схему визначає сама заливка, тож не треба тягнути isDark у кожен рядок.
 * `{ backgroundColor: c.card, ...glassRimFor(c.card) }`.
 */
export function glassRimFor(fill: string, variant: GlassFillVariant = 'card'): ViewStyle {
  return glassRim(DARK_FILLS.has(fill) ? theme.dark : theme.light, variant);
}

const GLASS_FILLS = new Set<string>([
  ...DARK_FILLS,
  glass.light.surface, glass.light.surfaceStrong, glass.light.surfaceSubtle,
  glass.light.solid.card, glass.light.solid.strong, glass.light.solid.subtle,
  SHEET_FILL.light, theme.light.surface.card, theme.light.surface.elevated, theme.light.surface.subtle,
]);

/** Чи заливка — скло/поверхня DS (а не акцент чи action.primary). */
export function isGlassFill(fill: string): boolean {
  return GLASS_FILLS.has(fill);
}
