/**
 * hooks/use-ds.ts — доступ до токенів Design System v2.
 *
 * Джерело темної теми — той самий ThemeProvider (store/theme-context), що й
 * у useColorScheme(): вибір користувача («світла/темна/системна») має
 * пріоритет над системною схемою. Тому `isDark` тут завжди збігається з
 * `useColorScheme() === 'dark'` у решті застосунку.
 *
 * @example
 *   const { t, isDark } = useDS();
 *   <View style={[ds.card(t, isDark), { gap: space[3] }]}>
 *     <Text style={[type.caption, { color: t.text.secondary }]}>…</Text>
 *   </View>
 */
import { useMemo } from 'react';
import type { TextStyle, ViewStyle } from 'react-native';

import {
  glass,
  radius,
  space,
  theme,
  touchTarget,
  type,
  type DSScheme,
  type DSTheme,
  type GlassAccent,
  type GlassTokens,
} from '@/constants/theme';
import { useReduceTransparency } from '@/hooks/use-reduce-transparency';
import { useTheme } from '@/store/theme-context';

export type { DSTheme, DSScheme, GlassTokens, GlassAccent };

export type UseDS = {
  t: DSTheme;
  isDark: boolean;
  scheme: DSScheme;
  /** Токени Liquid Glass для поточної схеми (constants/theme.ts `glass`). */
  g: GlassTokens;
  /** iOS «Зменшити прозорість» / веб prefers-reduced-transparency → скло суцільне. */
  reduceTransparency: boolean;
};

export function useDS(): UseDS {
  const { colorScheme } = useTheme();
  const reduceTransparency = useReduceTransparency();
  const scheme: DSScheme = colorScheme === 'dark' ? 'dark' : 'light';
  return useMemo(
    () => ({ t: theme[scheme], isDark: scheme === 'dark', scheme, g: glass[scheme], reduceTransparency }),
    [scheme, reduceTransparency],
  );
}

/** Токени за прапором isDark — для місць поза хуками (StyleSheet-фабрики, утиліти). */
export function dsTokens(isDark: boolean): DSTheme {
  return isDark ? theme.dark : theme.light;
}

/** Токени скла за прапором isDark — поза хуками. */
export function glassTokens(isDark: boolean): GlassTokens {
  return isDark ? glass.dark : glass.light;
}

/**
 * Невеликі стильові помічники — щоб однакові «рецепти» не розповзались
 * по екранах копіями. Повертають плоскі ViewStyle/TextStyle.
 */
export const ds = {
  /**
   * Скляна картка БЕЗ власного блюру (для рядків списків і місць, де не можна
   * обгорнути в <GlassSurface>): напівпрозора заливка glass.surface +
   * спекулярний обідок (світліший верх) + м'яка тінь. Під нею має бути
   * MeshBackground. reduceTransparency → суцільна surface.card.
   * Повний ефект (блюр / нативне Liquid Glass) — <GlassSurface>/<Card>.
   */
  card(t: DSTheme, isDark: boolean, opts?: { compact?: boolean; padded?: boolean; reduceTransparency?: boolean }): ViewStyle {
    const compact = opts?.compact ?? false;
    return {
      ...ds.glass(isDark, 'card', opts?.reduceTransparency),
      borderRadius: compact ? radius.cardCompact : radius.card,
      ...(opts?.padded === false ? null : { padding: compact ? space.cardPaddingCompact : space.cardPadding }),
      ...glass[isDark ? 'dark' : 'light'].shadow,
    };
  },
  /**
   * Заливка + обідок скла без радіуса/відступів — будь-яка форма.
   * variant: card (glass.surface) | strong (surfaceStrong — під щільний текст,
   * модалки, шапки) | subtle (surfaceSubtle — вкладене, інпути, чипи).
   */
  glass(isDark: boolean, variant: 'card' | 'strong' | 'subtle' = 'card', reduceTransparency = false): ViewStyle {
    const g = glass[isDark ? 'dark' : 'light'];
    if (reduceTransparency) {
      return {
        backgroundColor: variant === 'subtle' ? g.solid.subtle : variant === 'strong' ? g.solid.strong : g.solid.card,
        borderWidth: variant === 'subtle' ? 0 : 1,
        borderColor: theme[isDark ? 'dark' : 'light'].border.hairline,
      };
    }
    return {
      backgroundColor: variant === 'strong' ? g.surfaceStrong : variant === 'subtle' ? g.surfaceSubtle : g.surface,
      borderWidth: 1,
      borderColor: variant === 'subtle' ? g.rimShade : g.rim,
      borderTopColor: g.rim,
      borderBottomColor: g.rimShade,
    };
  },
  /** Тонована акцентом «змивка» (KPI-картка, icon-chip): додати поверх ds.glass. */
  accentWash(isDark: boolean, accent: GlassAccent): ViewStyle {
    return { backgroundColor: glass[isDark ? 'dark' : 'light'].accent[accent].tint };
  },
  /** Вкладений блок усередині картки — скло subtle без блюру. */
  nested(t: DSTheme, compact = false, isDark = t.bg.canvas === theme.dark.bg.canvas): ViewStyle {
    return {
      ...ds.glass(isDark, 'subtle'),
      borderRadius: compact ? radius.nestedCompact : radius.nested,
      padding: space[4],
    };
  },
  /** Поле вводу: скло subtle з обідком, мінімум 44pt. */
  input(t: DSTheme, isDark = t.bg.canvas === theme.dark.bg.canvas): TextStyle {
    return {
      // Скло — ViewStyle; для поля вводу ті самі поля сумісні з TextStyle.
      ...(ds.glass(isDark, 'subtle') as TextStyle),
      borderRadius: radius.control,
      minHeight: touchTarget,
      paddingHorizontal: space[4],
      color: t.text.primary,
      fontFamily: type.body.fontFamily,
      fontSize: 15,
    };
  },
  /** Головна pill-кнопка (чорна у світлій, світла у темній). */
  pillButton(t: DSTheme, variant: 'primary' | 'secondary' | 'ghost' = 'primary'): ViewStyle {
    return {
      minHeight: touchTarget,
      paddingHorizontal: space[5],
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: space[2],
      ...(variant === 'secondary'
        ? ds.glass(t.bg.canvas === theme.dark.bg.canvas, 'subtle')
        : { backgroundColor: variant === 'primary' ? t.action.primary : 'transparent' }),
    };
  },
  /** Колір підпису для pillButton того ж варіанта. */
  pillText(t: DSTheme, variant: 'primary' | 'secondary' | 'ghost' = 'primary'): TextStyle {
    return {
      ...type.label,
      color: variant === 'primary' ? t.text.onAction : t.action.secondaryText,
    };
  },
  /**
   * Чип / неактивний таб: скло subtle; активний — action.primary + text.onAction,
   * або (з accent) суцільна заливка акценту + onSolid (#111113).
   */
  chip(t: DSTheme, active = false, accent?: GlassAccent): ViewStyle {
    const isDark = t.bg.canvas === theme.dark.bg.canvas;
    const g = glass[isDark ? 'dark' : 'light'];
    return {
      minHeight: 36,
      paddingHorizontal: space[4],
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      ...(active
        ? { backgroundColor: accent ? g.accent[accent].solid : t.action.primary, borderWidth: 1, borderColor: 'transparent' }
        : ds.glass(isDark, 'subtle')),
    };
  },
  chipText(t: DSTheme, active = false, accent?: GlassAccent): TextStyle {
    const isDark = t.bg.canvas === theme.dark.bg.canvas;
    const color = active ? (accent ? glass[isDark ? 'dark' : 'light'].accent[accent].onSolid : t.text.onAction) : t.text.primary;
    return { ...type.caption, fontFamily: type.label.fontFamily, fontSize: 13, color };
  },
  /**
   * Фон екрана: суцільна основа mesh (glass.mesh.base). Самі кольорові плями
   * малює <MeshBackground/> (або <GlassScreen>) першим дочірнім елементом.
   */
  screen(t: DSTheme): ViewStyle {
    const isDark = t.bg.canvas === theme.dark.bg.canvas;
    return { flex: 1, backgroundColor: glass[isDark ? 'dark' : 'light'].mesh.base };
  },
  /** Видимий фокус (клавіатура на планшеті / вебі): 2px lavender. */
  focusRing(t: DSTheme): ViewStyle {
    return { borderWidth: 2, borderColor: t.focus.ring };
  },
} as const;
