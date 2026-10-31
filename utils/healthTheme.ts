// Спільні кольори/акценти екранів «Здоров'я» (хаб + модулі)
import { theme } from '@/constants/theme';

export const HEALTH_ACCENTS = {
  water:  '#10B981', // зелений — основний акцент розділу
  cal:    '#F97316',
  weight: '#8B5CF6',
  sleep:  '#6366F1',
  mood:   '#F59E0B',
  steps:  '#0EA5E9',
  pulse:  '#EF4444',
  prot:   '#A855F7',
  prevention: '#14B8A6',
} as const;

// Зручні аліаси (як у старому коді)
export const ACCENT        = HEALTH_ACCENTS.water;
export const ACCENT_CAL    = HEALTH_ACCENTS.cal;
export const ACCENT_WEIGHT = HEALTH_ACCENTS.weight;
export const ACCENT_SLEEP  = HEALTH_ACCENTS.sleep;
export const ACCENT_MOOD   = HEALTH_ACCENTS.mood;
export const ACCENT_STEPS  = HEALTH_ACCENTS.steps;
export const ACCENT_PULSE  = HEALTH_ACCENTS.pulse;
export const ACCENT_PROT   = HEALTH_ACCENTS.prot;

export interface HealthColors {
  bg1: string; bg2: string; border: string; text: string;
  sub: string; dim: string; sheet: string; track: string;
  /** Суцільний фон картки — той самий, що у Фінансах (app/(tabs)/explore.tsx). */
  card: string;
}

/**
 * Палітра розділу «Здоровʼя» на токенах Design System v2 — ті самі, що на
 * екрані Фінансів (app/(tabs)/explore.tsx) і в components/health/palette.ts:
 * розділ не має виглядати окремим застосунком. Ключі стабільні — їх читає й
 * екран «Сьогодні».
 */
export function getHealthColors(isDark: boolean): HealthColors {
  const t = isDark ? theme.dark : theme.light;
  return {
    bg1:    t.bg.canvas,
    bg2:    t.bg.canvas,
    border: t.border.hairline,
    text:   t.text.primary,
    sub:    t.text.secondary,
    dim:    t.surface.subtle,
    sheet:  t.surface.elevated,
    track:  t.surface.subtle,
    card:   t.surface.card,
  };
}

// Ключі модалки/радіального вводу
export type RadialKey = 'water' | 'calories' | 'weight' | 'steps' | 'pulse';
export type ModalKey = RadialKey | 'sleep';

export const fmtSleep = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
};
