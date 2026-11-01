/**
 * Layout System v2.4 — розкладка зон (components/layout-zones/zoneWidths.ts).
 */
import {
  ZONE_KEY_STEP, ZONE_MIN_WIDTH, resizeZoneWidth, sanitizeZoneSize, zoneWidths,
} from '@/components/layout-zones/zoneWidths';
import { parseZoneSizes } from '@/components/layout-zones/zoneSizes';
import { zone } from '@/constants/theme';

describe('zoneWidths', () => {
  it('телефон: деталі — нижній аркуш, статичної зони немає', () => {
    const w = zoneWidths({ windowWidth: 390, screenWidth: 390, wide: false, wantStatic: true, wantDynamic: true });
    expect(w.dynamicMode).toBe('sheet');
    expect(w.showDynamic).toBe(false);
    expect(w.showStatic).toBe(false);
    expect(w.mainWidth).toBe(390);
  });

  it('iPad 11" у портреті (834, рейка 76): панель деталей праворуч, головна ≥ mainMin', () => {
    const w = zoneWidths({ windowWidth: 834, screenWidth: 834 - 76, wide: true, wantStatic: true, wantDynamic: true });
    expect(w.dynamicMode).toBe('panel');
    expect(w.showDynamic).toBe(true);
    expect(w.showStatic).toBe(false);
    expect(w.mainWidth).toBeGreaterThanOrEqual(zone.mainMin);
  });

  it('iPad mini у портреті (744): панель не вміщається — аркуш', () => {
    const w = zoneWidths({ windowWidth: 744, screenWidth: 744 - 76, wide: true, wantStatic: false, wantDynamic: true });
    expect(w.dynamicMode).toBe('sheet');
    expect(w.showDynamic).toBe(false);
  });

  it('iPad 13" у ландшафті (1376, рейка): статична + головна + деталі; головна — найширша', () => {
    const w = zoneWidths({ windowWidth: 1376, screenWidth: 1376 - 76, wide: true, wantStatic: true, wantDynamic: true });
    expect(w.showStatic).toBe(true);
    expect(w.showDynamic).toBe(true);
    expect(w.mainWidth).toBeGreaterThan(w.dynamicWidth);
    expect(w.mainWidth).toBeGreaterThan(w.staticWidth);
  });

  it('повний сайдбар (232), без ручок-меж: правила «головна найширша» більше немає — три зони, поки головна ≥ mainMin', () => {
    // `handles: {}` — розкладка без ручок (ZoneLayout resizable={false}).
    const w = zoneWidths({ windowWidth: 1376, screenWidth: 1376 - 232, wide: true, wantStatic: true, wantDynamic: true, handles: {} });
    expect(w.showDynamic).toBe(true);
    expect(w.showStatic).toBe(true);
    expect(w.mainWidth).toBeGreaterThanOrEqual(zone.mainMin);
    // Головна вужча за панель деталей — це тепер дозволено.
    expect(w.mainWidth).toBeLessThan(w.dynamicWidth);
  });

  it('повний сайдбар на вужчому вікні: статична не вміщається за типових ширин', () => {
    const w = zoneWidths({ windowWidth: 1280, screenWidth: 1280 - 232, wide: true, wantStatic: true, wantDynamic: true });
    expect(w.showDynamic).toBe(true);
    expect(w.showStatic).toBe(false);
  });

  it('ручки-межі враховуються в «чи вміщається»: головна не стає вужчою за mainMin', () => {
    const handles = { static: 16, dynamic: 16 };
    // 1376 з повним сайдбаром: без ручок головна 380, з ручками була б 348 < 360.
    const w = zoneWidths({ windowWidth: 1376, screenWidth: 1376 - 232, wide: true, wantStatic: true, wantDynamic: true, handles });
    expect(w.showDynamic).toBe(true);
    expect(w.showStatic).toBe(false);
    expect(w.mainWidth).toBeGreaterThanOrEqual(zone.mainMin);
    // З рейкою (76) усі три зони вміщаються і головна ≥ mainMin.
    const rail = zoneWidths({ windowWidth: 1376, screenWidth: 1376 - 76, wide: true, wantStatic: true, wantDynamic: true, handles });
    expect(rail.showStatic && rail.showDynamic).toBe(true);
    expect(rail.mainWidth).toBeGreaterThanOrEqual(zone.mainMin);
  });

  it('нижче 1280 статична зона не стоїть поруч (живе на «Сьогодні»)', () => {
    const w = zoneWidths({ windowWidth: 1194, screenWidth: 1194 - 232, wide: true, wantStatic: true, wantDynamic: false });
    expect(w.showStatic).toBe(false);
  });

  it('закрита панель деталей віддає місце головній', () => {
    const open = zoneWidths({ windowWidth: 1194, screenWidth: 962, wide: true, wantStatic: false, wantDynamic: true });
    const closed = zoneWidths({ windowWidth: 1194, screenWidth: 962, wide: true, wantStatic: false, wantDynamic: false });
    expect(closed.mainWidth).toBe(962);
    expect(open.mainWidth).toBeLessThan(closed.mainWidth);
    expect(open.dynamicMode).toBe(closed.dynamicMode);
  });
});

describe('вільна зміна ширини зон (без min/max, лише підлога)', () => {
  const ipad13 = { windowWidth: 1376, screenWidth: 1376 - 76, wide: true, wantStatic: true, wantDynamic: true } as const;

  it('resizeZoneWidth: без старих меж 300–600 — лише підлога і «скільки є місця»', () => {
    expect(resizeZoneWidth(380, 400)).toBe(780);
    expect(resizeZoneWidth(380, -1000)).toBe(ZONE_MIN_WIDTH);
    expect(resizeZoneWidth(380, 900, 900)).toBe(900);
    expect(resizeZoneWidth(380, ZONE_KEY_STEP)).toBe(380 + ZONE_KEY_STEP);
    expect(resizeZoneWidth(Number.NaN, 0)).toBe(ZONE_MIN_WIDTH);
    // Навіть якщо місця менше за підлогу — зона не зникає.
    expect(resizeZoneWidth(300, 0, 40)).toBe(ZONE_MIN_WIDTH);
  });

  it('панель деталей ширша за головну — дозволено (немає «головна найширша»)', () => {
    const w = zoneWidths({ ...ipad13, sizes: { dynamic: 700 } });
    expect(w.dynamicWidth - zone.gap).toBe(700);
    expect(w.showStatic).toBe(true);
    expect(w.mainWidth).toBeLessThan(w.dynamicWidth);
    expect(w.mainWidth).toBeGreaterThanOrEqual(ZONE_MIN_WIDTH);
  });

  it('вузька статична — до підлоги, не нижче', () => {
    const w = zoneWidths({ ...ipad13, sizes: { static: 40 } });
    expect(w.staticWidth - zone.gap).toBe(ZONE_MIN_WIDTH);
  });

  it('тягнення не ховає зони: ширина впливає лише на розмір, не на «чи стоїть поруч»', () => {
    const plain = zoneWidths(ipad13);
    const huge = zoneWidths({ ...ipad13, sizes: { static: 900, dynamic: 900 } });
    expect(huge.showStatic).toBe(plain.showStatic);
    expect(huge.showDynamic).toBe(plain.showDynamic);
    expect(huge.dynamicMode).toBe(plain.dynamicMode);
  });

  it('не вміщається (поворот, Split View) — стискається спершу статична, головна ≥ підлоги', () => {
    const handles = { static: 16, dynamic: 16 };
    const w = zoneWidths({ ...ipad13, sizes: { static: 900, dynamic: 900 }, handles });
    expect(w.mainWidth).toBeGreaterThanOrEqual(ZONE_MIN_WIDTH);
    expect(w.staticWidth - zone.gap).toBeGreaterThanOrEqual(ZONE_MIN_WIDTH);
    expect(w.dynamicWidth - zone.gap).toBeGreaterThanOrEqual(ZONE_MIN_WIDTH);
    expect(w.staticWidth + w.dynamicWidth + w.mainWidth + handles.static + handles.dynamic).toBe(ipad13.screenWidth);
    // Стискалась лише статична (її вистачило) — панель деталей лишилась як є,
    // а головна отримала рівно підлогу.
    expect(w.dynamicWidth - zone.gap).toBe(900);
    expect(w.mainWidth).toBe(ZONE_MIN_WIDTH);
    // Коли й статична на підлозі — далі стискається панель.
    const tight = zoneWidths({ ...ipad13, screenWidth: 1156, sizes: { static: 900, dynamic: 900 }, handles });
    expect(tight.showStatic && tight.showDynamic).toBe(true);
    expect(tight.staticWidth - zone.gap).toBe(ZONE_MIN_WIDTH);
    expect(tight.dynamicWidth - zone.gap).toBe(860);
    expect(tight.mainWidth).toBe(ZONE_MIN_WIDTH);
  });

  it('телефон: розміри ігноруються, усе як було', () => {
    const w = zoneWidths({ windowWidth: 390, screenWidth: 390, wide: false, wantStatic: true, wantDynamic: true, sizes: { dynamic: 500 } });
    expect(w).toEqual({ dynamicMode: 'sheet', showStatic: false, staticWidth: 0, showDynamic: false, dynamicWidth: 0, mainWidth: 390 });
  });

  it('збережені ширини: сміття відкидається, мале піднімається до підлоги', () => {
    expect(sanitizeZoneSize('300')).toBeUndefined();
    expect(sanitizeZoneSize(-5)).toBeUndefined();
    expect(sanitizeZoneSize(50)).toBe(ZONE_MIN_WIDTH);
    expect(parseZoneSizes({ default: { static: 250.4, dynamic: 'x' }, bad: 3 })).toEqual({ default: { static: 250 } });
    expect(parseZoneSizes(null)).toEqual({});
  });
});
