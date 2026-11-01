/**
 * Layout System v2.4 — розкладка зон (components/layout-zones/zoneWidths.ts).
 */
import { zoneWidths } from '@/components/layout-zones/zoneWidths';
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

  it('повний сайдбар (232) не лишає місця третій зоні — головна лишається найширшою', () => {
    const w = zoneWidths({ windowWidth: 1376, screenWidth: 1376 - 232, wide: true, wantStatic: true, wantDynamic: true });
    expect(w.showDynamic).toBe(true);
    expect(w.showStatic).toBe(false);
    expect(w.mainWidth).toBeGreaterThan(w.dynamicWidth);
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
