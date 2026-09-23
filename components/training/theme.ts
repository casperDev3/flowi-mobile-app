/**
 * components/training/theme.ts — палітра модуля тренувань
 * (training-module.md §10.1): акцент `#0EA5E9` (той самий, що в
 * app/workouts.tsx), фони `#0C0C14 / #14121E` dark · `#F4F2FF / #EAE6FF` light.
 */
import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const TG_ACCENT = '#0EA5E9';
export const TG_XP = '#F59E0B';
export const TG_OK = '#10B981';
export const TG_WARN = '#F59E0B';
export const TG_ERR = '#EF4444';

export interface TrainingColors {
  isDark: boolean;
  bg1: string;
  bg2: string;
  text: string;
  sub: string;
  faint: string;
  border: string;
  card: string;
  input: string;
  chip: string;
  blurTint: 'dark' | 'light';
}

export function makeTrainingColors(isDark: boolean): TrainingColors {
  return isDark
    ? {
      isDark, bg1: '#0C0C14', bg2: '#14121E', text: '#F5F3FF', sub: 'rgba(245,243,255,0.66)',
      faint: 'rgba(245,243,255,0.4)', border: 'rgba(255,255,255,0.1)', card: 'rgba(255,255,255,0.05)',
      input: 'rgba(255,255,255,0.07)', chip: 'rgba(255,255,255,0.08)', blurTint: 'dark',
    }
    : {
      isDark, bg1: '#F4F2FF', bg2: '#EAE6FF', text: '#1C1830', sub: 'rgba(28,24,48,0.66)',
      faint: 'rgba(28,24,48,0.42)', border: 'rgba(28,24,48,0.1)', card: 'rgba(255,255,255,0.6)',
      input: 'rgba(28,24,48,0.05)', chip: 'rgba(28,24,48,0.06)', blurTint: 'light',
    };
}

export function useTrainingColors(): TrainingColors {
  const isDark = useColorScheme() === 'dark';
  return useMemo(() => makeTrainingColors(isDark), [isDark]);
}

/** Підстановка `{name}` у рядки словника. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}
