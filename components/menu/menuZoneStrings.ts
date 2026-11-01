/**
 * components/menu/menuZoneStrings.ts — підписи зон екрана «Меню» на
 * ПЛАНШЕТІ (Layout System v2.4: статична «Група й тиждень», динамічна «День»).
 *
 * Окремий словник (як components/projects/projectZoneStrings.ts): зони —
 * лише планшетна розкладка цього екрана. Українська — основна.
 */
import { useI18n } from '@/store/i18n';

const uk = {
  dayDetails: 'День меню',
  summary: 'Зведення тижня',
  summaryA11y: 'Зведення тижня меню',
  dishes: 'Страв заплановано',
  daysWithMenu: 'Днів із меню',
  emptySlots: 'Порожніх прийомів',
  members: 'Учасників',
  role: 'Моя роль',
  owner: 'Власник',
  member: 'Учасник',
  requests: 'Звернення',
  requestsOpen: 'Відкрити звернення',
  requestsA11y: 'Звернення на розгляді: {n}. Відкрити вкладку «Звернення»',
  groups: 'Групи',
  groupsA11y: 'Групи меню',
  groupSelectA11y: 'Перейти до групи «{name}»',
  archived: 'Архів',
  selectHint: 'Показує страви дня в панелі праворуч',
};

const en: typeof uk = {
  dayDetails: 'Menu day',
  summary: 'Week summary',
  summaryA11y: 'Menu week summary',
  dishes: 'Dishes planned',
  daysWithMenu: 'Days with menu',
  emptySlots: 'Empty meals',
  members: 'Members',
  role: 'My role',
  owner: 'Owner',
  member: 'Member',
  requests: 'Requests',
  requestsOpen: 'Open requests',
  requestsA11y: 'Pending requests: {n}. Open the Requests tab',
  groups: 'Groups',
  groupsA11y: 'Menu groups',
  groupSelectA11y: 'Go to group “{name}”',
  archived: 'Archive',
  selectHint: 'Shows the day’s dishes in the panel on the right',
};

export type MenuZoneStrings = typeof uk;

export function menuZoneStrings(lang: string): MenuZoneStrings {
  return lang === 'en' ? en : uk;
}

export function useMenuZoneStrings(): MenuZoneStrings {
  const { lang } = useI18n();
  return menuZoneStrings(lang);
}

export function fillMenuZone(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
