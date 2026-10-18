/**
 * components/notes/notesTheme.ts — палітра модуля нотаток.
 *
 * Єдине джерело — `getScreenColors('notes')` з constants/tokens.ts (власний
 * фіолетовий #A855F7, окремий від Завдань #7C3AED). Тут лише похідні
 * відтінки, яких токенам бракує для екрана-редактора: суцільна панель під
 * текстом (картка `card` напівпрозора — на ній погано читається довгий
 * текст), приглушена підкладка активних чипів і колір тексту на акценті.
 */
import { getScreenColors } from '@/constants/tokens';

export interface NotesPalette {
  bg: string;
  bg2: string;
  /** Суцільна панель редактора й аркушів. */
  panel: string;
  /** Напівпрозора картка списку. */
  card: string;
  text: string;
  sub: string;
  subStrong: string;
  border: string;
  accent: string;
  /**
   * Акцент для ТЕКСТУ й тонких гліфів. #A855F7 на світлому фоні дає ~4:1 —
   * замало для дрібного тексту (WCAG AA 4.5:1), тож у світлій темі текст
   * темніший (purple-700), у темній — світліший (purple-400).
   */
  accentText: string;
  /** Суцільна заливка під білим текстом (purple-600, ≥5:1 з білим). */
  accentStrong: string;
  /** Підкладка активного чипа / бейджа. */
  dim: string;
  /** Текст на суцільному акценті. */
  onAccent: string;
  danger: string;
}

export function notesPalette(isDark: boolean): NotesPalette {
  const base = getScreenColors('notes', isDark);
  return {
    bg: base.bg1,
    bg2: base.bg2,
    panel: isDark ? '#1A1022' : '#FFFFFF',
    card: base.card,
    text: base.text,
    sub: base.sub,
    subStrong: base.subStrong,
    border: base.border,
    accent: base.accent,
    accentText: isDark ? '#C084FC' : '#7E22CE',
    accentStrong: '#9333EA',
    dim: isDark ? 'rgba(168,85,247,0.18)' : 'rgba(168,85,247,0.10)',
    onAccent: '#FFFFFF',
    danger: isDark ? '#F87171' : '#DC2626',
  };
}

/** Кольори для PickerField (його власний контракт полів). */
export function pickerColorsFor(c: NotesPalette) {
  return { text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accentText, sheet: c.panel };
}

/** Кольори для NoteMarkdown. */
export function markdownColorsFor(c: NotesPalette) {
  return { text: c.text, sub: c.sub, border: c.border, accent: c.accentText, panel: c.panel };
}
