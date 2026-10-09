/**
 * components/menu/theme.ts — палітра екрана «Меню».
 *
 * Ті самі фони, картки й рамки, що на «Фінансах» (app/(tabs)/explore.tsx),
 * щоб модуль не виглядав окремим застосунком. Акцент — блакитний #0EA5E9,
 * як у Фінансів і тренувань.
 */
import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const MENU_ACCENT = '#0EA5E9';
export const MENU_OK = '#10B981';
export const MENU_WARN = '#F59E0B';
export const MENU_ERR = '#EF4444';

export interface MenuColors {
  isDark: boolean;
  bg1: string;
  bg2: string;
  card: string;
  border: string;
  text: string;
  sub: string;
  faint: string;
  /** Фон сегментів/неактивних контролів. */
  dim: string;
  /** Фон підсвіченої клітинки (сьогодні) і нейтральних бейджів. */
  chip: string;
  /** Фон аркушів. */
  sheet: string;
  accent: string;
}

export function makeMenuColors(isDark: boolean): MenuColors {
  return {
    isDark,
    bg1: isDark ? '#0C0C14' : '#F4F2FF',
    bg2: isDark ? '#14121E' : '#EAE6FF',
    card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,170,240,0.4)',
    text: isDark ? '#F4F2FF' : '#0A0818',
    sub: isDark ? 'rgba(244,242,255,0.62)' : 'rgba(10,8,24,0.60)',
    faint: isDark ? 'rgba(244,242,255,0.4)' : 'rgba(10,8,24,0.42)',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    chip: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,8,24,0.06)',
    sheet: isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)',
    accent: MENU_ACCENT,
  };
}

export function useMenuColors(): MenuColors {
  const isDark = useColorScheme() === 'dark';
  return useMemo(() => makeMenuColors(isDark), [isDark]);
}
