// Спільні кольори/акценти екранів «Здоров'я» (хаб + модулі)

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
 * Палітра розділу «Здоровʼя». Фон, рамки, текст і картки — ті самі, що на
 * екрані Фінансів (еталон вигляду застосунку): розділ не має виглядати
 * окремим застосунком. Ключі стабільні — їх читає й екран «Сьогодні».
 */
export function getHealthColors(isDark: boolean): HealthColors {
  return {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,170,240,0.4)',
    text:   isDark ? '#F4F2FF' : '#0A0818',
    sub:    isDark ? 'rgba(244,242,255,0.62)' : 'rgba(10,8,24,0.60)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)',
    track:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
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
