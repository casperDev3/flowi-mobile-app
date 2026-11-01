/**
 * components/notes/notesTheme.ts — палітра модуля нотаток.
 *
 * Лише з токенів Design System v2 (docs/design-system-v2.md): тло — mesh
 * екрана (`GlassScreen module="notes"`, тож тут прозоре), картки й редактор —
 * суцільні `surface.card` з м'якою тінню, акцент модуля «Нотатки» — amber
 * (`glass.accent.amber`: `ink` для тексту й гліфів, `tint` — підкладка
 * активного чипа). Головна дія — чорна pill `action.primary`, а не акцент.
 *
 * Палітру ділять усі компоненти нотаток (список, редактор, аркуші), тож
 * зміна акценту модуля — одне місце.
 */
import { getScreenColors } from '@/constants/tokens';
import { dsGlass, dsTheme, glassOf } from '@/components/shared/dsTheme';

export interface NotesPalette {
  /** Тло екрана — прозоре: під ним mesh (GlassScreen). */
  bg: string;
  bg2: string;
  /** Суцільна панель редактора й аркушів (surface.card). */
  panel: string;
  /** Картка списку (surface.card). */
  card: string;
  /** Вкладені поля й неактивні чипи (surface.subtle). */
  subtle: string;
  text: string;
  sub: string;
  subStrong: string;
  /** Роздільники — мінімально (border.hairline). */
  border: string;
  /** Акцент модуля (amber ink, #RRGGBB). */
  accent: string;
  /** Акцент для ТЕКСТУ й тонких гліфів (≥ 4.5:1 в обох темах). */
  accentText: string;
  /** Суцільна заливка головної дії (action.primary). */
  accentStrong: string;
  /** Підкладка активного чипа / бейджа (amber tint). */
  dim: string;
  /** Текст на `accentStrong` (text.onAction). */
  onAccent: string;
  danger: string;
  /** Фон аркуша PickerField («брудне скло» оверлеїв). */
  sheet: string;
}

export function notesPalette(isDark: boolean): NotesPalette {
  const base = getScreenColors('notes', isDark);
  const t = dsTheme(isDark);
  const amber = dsGlass(isDark).accent.amber;
  return {
    bg: 'transparent',
    bg2: 'transparent',
    panel: t.surface.card,
    card: t.surface.card,
    subtle: t.surface.subtle,
    text: t.text.primary,
    sub: t.text.secondary,
    subStrong: base.subStrong,
    border: t.border.hairline,
    accent: amber.ink,
    accentText: amber.ink,
    accentStrong: t.action.primary,
    dim: amber.tint,
    onAccent: t.text.onAction,
    danger: t.status.danger,
    sheet: glassOf(t).sheet,
  };
}

/** Кольори для PickerField (його власний контракт полів). */
export function pickerColorsFor(c: NotesPalette) {
  return { text: c.text, sub: c.sub, border: c.border, dim: c.subtle, accent: c.accentText, sheet: c.sheet };
}

/** Кольори для NoteMarkdown. */
export function markdownColorsFor(c: NotesPalette) {
  return { text: c.text, sub: c.sub, border: c.border, accent: c.accentText, panel: c.panel };
}
