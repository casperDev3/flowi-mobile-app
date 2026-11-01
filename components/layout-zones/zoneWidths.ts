/**
 * components/layout-zones/zoneWidths.ts — що з зон вміщається поруч
 * (Layout System v2.4). Чиста функція без React: її беруть ZoneLayout, екрани
 * (щоб знати, чи деталь — панель, чи аркуш) і тести.
 */
import { zone } from '@/constants/theme';

/** Чиста функція: що вміщається поруч (для тестів і екранів без компонента). */
export function zoneWidths(opts: {
  windowWidth: number;
  screenWidth: number;
  wide: boolean;
  wantStatic: boolean;
  wantDynamic: boolean;
}): ZoneWidths {
  const { windowWidth, screenWidth, wide, wantStatic, wantDynamic } = opts;
  if (!wide) {
    return { dynamicMode: 'sheet', showStatic: false, staticWidth: 0, showDynamic: false, dynamicWidth: 0, mainWidth: screenWidth };
  }
  const panelWidth = windowWidth >= zone.dynamicLargeFrom ? zone.dynamicLarge
    : windowWidth < zone.dynamicCompactBelow ? zone.dynamicCompact : zone.dynamic;
  // Панель деталей має пріоритет над статичною зоною: вона — відповідь на дію
  // людини (вибір запису), статична — лише фон.
  // Головна зона ЗАВЖДИ найширша: не вужча за mainMin і за саму панель.
  const dynamicMode: 'panel' | 'sheet' = screenWidth - panelWidth - zone.gap >= Math.max(zone.mainMin, panelWidth) ? 'panel' : 'sheet';
  const showDynamic = wantDynamic && dynamicMode === 'panel';
  const dynamicWidth = showDynamic ? panelWidth + zone.gap : 0;
  const mainWithStatic = screenWidth - dynamicWidth - zone.static - zone.gap;
  const canStatic = wantStatic && windowWidth >= zone.staticFrom
    && mainWithStatic >= Math.max(zone.mainMin, dynamicWidth, zone.static + zone.gap);
  const staticWidth = canStatic ? zone.static + zone.gap : 0;
  return {
    dynamicMode,
    showStatic: canStatic,
    staticWidth,
    showDynamic,
    dynamicWidth,
    mainWidth: Math.max(screenWidth - staticWidth - dynamicWidth, 0),
  };
}

export interface ZoneWidths {
  /** Де показуються деталі: панель праворуч чи нижній аркуш. */
  dynamicMode: 'panel' | 'sheet';
  showStatic: boolean;
  /** Ширина статичної зони разом із проміжком (0 — не показується). */
  staticWidth: number;
  showDynamic: boolean;
  /** Ширина панелі деталей разом із проміжком (0 — не показується). */
  dynamicWidth: number;
  mainWidth: number;
}

