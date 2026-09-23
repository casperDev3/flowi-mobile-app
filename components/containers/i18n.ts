/**
 * components/containers/i18n.ts — дрібні помічники над tr.ctr*: підстановка
 * `{n}`/`{name}` і відмінювання лічильника речей (1 річ / 2 речі / 5 речей).
 */
import type { Translations } from '@/store/translations';
import { pluralIndexUk, STATUS_COLORS, type ItemStatus, type PlaceKind } from '@/utils/containers';

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

/** «5 речей» / «5 items». Англійська — одна форма множини. */
export function itemsCount(tr: Translations, n: number, lang: string): string {
  if (lang === 'uk') return `${n} ${[tr.ctrItemsOne, tr.ctrItemsFew, tr.ctrItemsMany][pluralIndexUk(n)]}`;
  return `${n} ${n === 1 ? tr.ctrItemsOne : tr.ctrItemsMany}`;
}

export function statusLabel(tr: Translations, status: ItemStatus): string {
  return status === 'lent' ? tr.ctrStatusLent : status === 'discarded' ? tr.ctrStatusDiscarded : tr.ctrStatusInBox;
}

export function placeKindLabel(tr: Translations, kind: PlaceKind): string {
  switch (kind) {
    case 'room': return tr.ctrPlaceKindRoom;
    case 'furniture': return tr.ctrPlaceKindFurniture;
    case 'shelf': return tr.ctrPlaceKindShelf;
    default: return tr.ctrPlaceKindOther;
  }
}

/** Іконки лише з мапінгу components/ui/icon-symbol.tsx (див. __tests__/icon-mapping.test.ts). */
export function placeKindIcon(kind: PlaceKind): 'house.fill' | 'archivebox.fill' | 'rectangle.stack' | 'folder' {
  switch (kind) {
    case 'room': return 'house.fill';
    case 'furniture': return 'archivebox.fill';
    case 'shelf': return 'rectangle.stack';
    default: return 'folder';
  }
}

export { STATUS_COLORS };
