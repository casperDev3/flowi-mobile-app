/**
 * components/containers/theme.ts — кольори модуля «Контейнери» (CLAUDE.md:
 * акцент #F97316, фони #100A00/#1A1200 dark, #FFF7ED/#FFEDD5 light).
 */
import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const CONTAINERS_ACCENT = '#F97316';

export interface ContainersColors {
  isDark: boolean;
  bg1: string;
  bg2: string;
  border: string;
  text: string;
  sub: string;
  dim: string;
  sheet: string;
  card: string;
}

export function useContainersColors(): ContainersColors {
  const isDark = useColorScheme() === 'dark';
  return useMemo(() => ({
    isDark,
    bg1: isDark ? '#100A00' : '#FFF7ED',
    bg2: isDark ? '#1A1200' : '#FFEDD5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text: isDark ? '#F0EEFF' : '#1A1433',
    sub: isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
    sheet: isDark ? 'rgba(18,15,30,0.97)' : 'rgba(252,250,255,0.97)',
    card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)',
  }), [isDark]);
}
