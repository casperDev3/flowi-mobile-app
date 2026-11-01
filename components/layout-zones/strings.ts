/**
 * components/layout-zones/strings.ts — підписи каркаса зон (Layout System v2.4).
 *
 * Окремий маленький словник, а не store/translations.ts: каркас зон — спільна
 * інфраструктура, яку одночасно підключають кілька екранів, і її рядки мусять
 * бути однакові на всіх (паритет із вебом `layout-zones`). Мова — з useI18n().
 */
import { useI18n } from '@/store/i18n';

const uk = {
  viewList: 'Список',
  viewColumns: 'Колонки',
  viewSwitch: 'Вигляд',
  closePanel: 'Закрити панель',
  detailsPanel: 'Деталі',
  staticZone: 'Контекст',
  panelStatic: 'Статична зона',
  panelMain: 'Головна зона',
  panelDynamic: 'Панель деталей',
  panelsToggle: 'Панелі',
  selectRecord: 'Виберіть запис',
  selectRecordHint: 'Деталі відкриються тут.',
  retry: 'Повторити',
  loadFailed: 'Не вдалося завантажити',
  loading: 'Завантаження…',
  selectedN: (n: number) => `${n} вибрано`,
  actions: 'Дії',
  clearSelection: 'Скасувати вибір',
  expandSheet: 'Розгорнути на весь екран',
  collapseSheet: 'Згорнути',
  column: (i: number, n: number, name: string) => `Колонка ${i} з ${n}: ${name}`,
  rowActions: 'Дії з рядком',
  search: 'Пошук',
  menu: 'Меню',
  focusMode: 'Фокус',
};

type ZoneStrings = typeof uk;

const en: ZoneStrings = {
  viewList: 'List',
  viewColumns: 'Columns',
  viewSwitch: 'View',
  closePanel: 'Close panel',
  detailsPanel: 'Details',
  staticZone: 'Context',
  panelStatic: 'Static zone',
  panelMain: 'Main zone',
  panelDynamic: 'Details panel',
  panelsToggle: 'Panels',
  selectRecord: 'Select a record',
  selectRecordHint: 'Details will open here.',
  retry: 'Retry',
  loadFailed: 'Could not load',
  loading: 'Loading…',
  selectedN: (n: number) => `${n} selected`,
  actions: 'Actions',
  clearSelection: 'Clear selection',
  expandSheet: 'Expand to full screen',
  collapseSheet: 'Collapse',
  column: (i: number, n: number, name: string) => `Column ${i} of ${n}: ${name}`,
  rowActions: 'Row actions',
  search: 'Search',
  menu: 'Menu',
  focusMode: 'Focus',
};

export function zoneStrings(lang: string): ZoneStrings {
  return lang === 'en' ? en : uk;
}

export function useZoneStrings(): ZoneStrings {
  const { lang } = useI18n();
  return zoneStrings(lang);
}
