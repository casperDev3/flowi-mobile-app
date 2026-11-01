/**
 * components/layout-zones/zoneWidths.ts — що з зон вміщається поруч і якої
 * вони ширини (Layout System v2.4). Чиста функція без React: її беруть
 * ZoneLayout, екрани (щоб знати, чи деталь — панель, чи аркуш) і тести.
 *
 * ДВА РІЗНІ ПИТАННЯ (11.2026, рішення власника «прибери обмеження»):
 *   1. ЧИ стоїть зона поруч (панель чи аркуш, чи вміщається статична) —
 *      вирішується за ТИПОВИМИ ширинами й zone.mainMin, як і раніше; правило
 *      «головна завжди найширша» прибрано. Тягнення меж на це НЕ впливає:
 *      ширша панель не ховає статичну зону і не перетворюється на аркуш.
 *   2. ЯКОЇ ширини видимі зони — вибір людини (перетягування межі), без
 *      min/max і без «головна найширша». Лишається тільки технічна підлога
 *      ZONE_MIN_WIDTH, щоб жодна зона (і головна теж) не зникла під ручкою;
 *      сховати зону цілком — перемикачами панелей.
 */
import { zone } from '@/constants/theme';

/** Технічна підлога ширини будь-якої зони (pt): менше — зона «зникає» під ручкою. */
export const ZONE_MIN_WIDTH = 120;

/** Крок межі з VoiceOver (increment/decrement) і клавіатури, pt. */
export const ZONE_KEY_STEP = 16;

/** Ширина ручки-межі між зонами (pt). Тягнеться пальцем/курсором на всю висоту. */
export const ZONE_HANDLE_WIDTH = 16;

/** Збережені людиною ширини бічних зон (без проміжку). */
export interface ZoneSizes {
  static?: number;
  dynamic?: number;
}

/** Ширина динамічної панелі за замовчуванням для ширини вікна. */
export function defaultDynamicWidth(windowWidth: number): number {
  return windowWidth >= zone.dynamicLargeFrom ? zone.dynamicLarge
    : windowWidth < zone.dynamicCompactBelow ? zone.dynamicCompact : zone.dynamic;
}

/**
 * Нова ширина зони після кроку межі. БЕЗ min/max — лише підлога
 * ZONE_MIN_WIDTH і стеля «не більше, ніж є місця», щоб сусідні зони
 * (зокрема головна) лишились не вужчими за ту саму підлогу.
 */
export function resizeZoneWidth(current: number, delta: number, maxAvailable = Number.POSITIVE_INFINITY): number {
  const base = Number.isFinite(current) ? current : ZONE_MIN_WIDTH;
  const next = base + (Number.isFinite(delta) ? delta : 0);
  const ceiling = Math.max(ZONE_MIN_WIDTH, Number.isFinite(maxAvailable) ? maxAvailable : next);
  return Math.round(Math.min(ceiling, Math.max(ZONE_MIN_WIDTH, next)));
}

/** Збережене значення → придатна ширина або undefined (сміття / нуль / мінус). */
export function sanitizeZoneSize(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.round(Math.max(ZONE_MIN_WIDTH, raw));
}

/** Чиста функція: що вміщається поруч (для тестів і екранів без компонента). */
export function zoneWidths(opts: {
  windowWidth: number;
  screenWidth: number;
  wide: boolean;
  wantStatic: boolean;
  wantDynamic: boolean;
  /** Ширини, які людина виставила перетягуванням межі (необов'язково). */
  sizes?: ZoneSizes;
  /** Скільки місця забирають ручки-межі між зонами (за замовч. — ZONE_HANDLE_WIDTH, як у ZoneLayout). */
  handles?: { static?: number; dynamic?: number };
}): ZoneWidths {
  const { windowWidth, screenWidth, wide, wantStatic, wantDynamic } = opts;
  if (!wide) {
    return { dynamicMode: 'sheet', showStatic: false, staticWidth: 0, showDynamic: false, dynamicWidth: 0, mainWidth: screenWidth };
  }
  const panelWidth = defaultDynamicWidth(windowWidth);
  // 1. ЧИ стоять зони поруч — за типовими ширинами. Панель деталей має
  // пріоритет над статичною зоною: вона — відповідь на дію людини (вибір
  // запису), статична — лише фон.
  // Ручки-межі теж забирають місце в головної: без них у рішенні «чи
  // вміщається» головна з усіма зонами опинялась би на 32pt вужчою за mainMin.
  // За замовчуванням — ручки ZoneLayout (resizable за замовч. так), щоб екрани,
  // які питають «панель чи аркуш / чи є статична», бачили те саме, що й
  // ZoneLayout. Без ручок — явно `handles: {}`.
  const handleDyn = Math.max(0, opts.handles ? opts.handles.dynamic ?? 0 : ZONE_HANDLE_WIDTH);
  const handleStat = Math.max(0, opts.handles ? opts.handles.static ?? 0 : ZONE_HANDLE_WIDTH);
  const dynamicMode: 'panel' | 'sheet' = screenWidth - panelWidth - zone.gap - handleDyn >= zone.mainMin ? 'panel' : 'sheet';
  const showDynamic = wantDynamic && dynamicMode === 'panel';
  const defaultDyn = showDynamic ? panelWidth + zone.gap + handleDyn : 0;
  const canStatic = wantStatic && windowWidth >= zone.staticFrom
    && screenWidth - defaultDyn - zone.static - zone.gap - handleStat >= zone.mainMin;

  // 2. ЯКОЇ ширини — вибір людини з підлогою ZONE_MIN_WIDTH для кожної зони.
  const hStatic = canStatic ? handleStat : 0;
  const hDynamic = showDynamic ? handleDyn : 0;
  let dyn = showDynamic ? sanitizeZoneSize(opts.sizes?.dynamic) ?? panelWidth : 0;
  let stat = canStatic ? sanitizeZoneSize(opts.sizes?.static) ?? zone.static : 0;
  const fixed = (showDynamic ? zone.gap : 0) + (canStatic ? zone.gap : 0) + hStatic + hDynamic;
  // Місце для бічних зон: усе, крім проміжків, ручок і підлоги головної.
  const room = Math.max(0, screenWidth - fixed - ZONE_MIN_WIDTH);
  if (dyn + stat > room) {
    // Не вміщається (вікно звузилось / повернули планшет): стискаємо спершу
    // статичну (вона лише контекст), потім панель — кожну не нижче підлоги.
    // Збережене людиною не переписується — це лише те, що видно зараз.
    const over = dyn + stat - room;
    const fromStatic = canStatic ? Math.min(over, Math.max(0, stat - ZONE_MIN_WIDTH)) : 0;
    stat -= fromStatic;
    const rest = over - fromStatic;
    if (rest > 0 && showDynamic) dyn = Math.max(ZONE_MIN_WIDTH, dyn - rest);
  }
  const dynamicWidth = showDynamic ? Math.round(dyn) + zone.gap : 0;
  const staticWidth = canStatic ? Math.round(stat) + zone.gap : 0;
  return {
    dynamicMode,
    showStatic: canStatic,
    staticWidth,
    showDynamic,
    dynamicWidth,
    mainWidth: Math.max(screenWidth - staticWidth - dynamicWidth - hStatic - hDynamic, 0),
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
