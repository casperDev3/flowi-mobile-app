/**
 * components/shared/sidebar-strings.ts — підписи сайдбара планшета (шпилька,
 * закріплені розділи, межі зон). Маленький словник поруч із компонентами, як
 * components/layout-zones/strings.ts: ці рядки бачить лише планшет, а мова —
 * з useI18n().
 */
import { useI18n } from '@/store/i18n';

const uk = {
  pinSidebar: 'Закріпити бічне меню',
  unpinSidebar: 'Відкріпити бічне меню',
  pinSidebarHint: 'Закріплене меню не згортається і не перекриває вміст',
  pinSection: (name: string) => `Закріпити «${name}» угорі`,
  unpinSection: (name: string) => `Відкріпити «${name}»`,
  pinAction: 'Закріпити',
  unpinAction: 'Відкріпити',
  pinnedGroup: 'Закріплені',
  pinnedSettingsRow: 'Закріплені розділи сайдбару',
  pinnedSettingsTitle: 'Закріплені розділи',
  pinnedSettingsIntro:
    'Закріплені розділи стоять у бічному меню планшета одразу під «Сьогодні», зі шпилькою. ' +
    'Торкніться шпильки біля розділу в меню — і він повернеться на своє місце. ' +
    'Утримання пункту меню теж закріплює чи відкріплює його. Вибір синхронізується між пристроями.',
  pinnedSettingsHiddenNote: 'Вимкнені модулі в меню не показуються, навіть якщо закріплені',
  moduleOff: 'Модуль вимкнено — у меню не показується',
  pinnedCount: (n: number) => `${n}`,
  resizeStatic: 'Межа статичної зони',
  resizeDynamic: 'Межа панелі деталей',
  resizeHint: 'Перетягніть, щоб змінити ширину. Подвійний дотик — типова ширина.',
  resizeWider: 'Ширше',
  resizeNarrower: 'Вужче',
  resizeReset: 'Типова ширина',
};

export type SidebarStrings = typeof uk;

const en: SidebarStrings = {
  pinSidebar: 'Pin sidebar',
  unpinSidebar: 'Unpin sidebar',
  pinSidebarHint: 'A pinned sidebar stays open and does not cover content',
  pinSection: (name: string) => `Pin “${name}” to top`,
  unpinSection: (name: string) => `Unpin “${name}”`,
  pinAction: 'Pin',
  unpinAction: 'Unpin',
  pinnedGroup: 'Pinned',
  pinnedSettingsRow: 'Pinned sidebar sections',
  pinnedSettingsTitle: 'Pinned sections',
  pinnedSettingsIntro:
    'Pinned sections sit in the tablet sidebar right under “Today”, with a pin. ' +
    'Tap the pin next to a section in the sidebar to return it to its place. ' +
    'Long-pressing a sidebar item also pins or unpins it. Synced across devices.',
  pinnedSettingsHiddenNote: 'Disabled modules never show in the sidebar, even if pinned',
  moduleOff: 'Module is off — hidden from the sidebar',
  pinnedCount: (n: number) => `${n}`,
  resizeStatic: 'Static zone edge',
  resizeDynamic: 'Details panel edge',
  resizeHint: 'Drag to change the width. Double-tap for the default width.',
  resizeWider: 'Wider',
  resizeNarrower: 'Narrower',
  resizeReset: 'Default width',
};

export function sidebarStrings(lang: string): SidebarStrings {
  return lang === 'en' ? en : uk;
}

export function useSidebarStrings(): SidebarStrings {
  const { lang } = useI18n();
  return sidebarStrings(lang);
}
