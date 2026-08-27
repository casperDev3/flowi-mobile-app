import { NAV_GROUPS, isRouteActive } from '../constants/nav';

describe('isRouteActive', () => {
  it('групу-дужки не видно в адресі', () => {
    // usePathname() віддає нормалізований шлях: група (tabs) з нього зникає.
    expect(isRouteActive('/(tabs)/explore', '/explore')).toBe(true);
    expect(isRouteActive('/(tabs)/health', '/health')).toBe(true);
  });

  it('корінь вкладок — це екран Завдань', () => {
    expect(isRouteActive('/(tabs)', '/')).toBe(true);
    expect(isRouteActive('/(tabs)', '/index')).toBe(true);
  });

  it('корінь НЕ підсвічується на інших екранах', () => {
    // Найлегша помилка тут — префіксне порівняння: '/'  є префіксом усього,
    // і Завдання світилися б активними на кожному екрані додатку.
    expect(isRouteActive('/(tabs)', '/explore')).toBe(false);
    expect(isRouteActive('/(tabs)', '/notes')).toBe(false);
  });

  it('Stack-екрани порівнюються як є', () => {
    expect(isRouteActive('/notes', '/notes')).toBe(true);
    expect(isRouteActive('/notes', '/ideas')).toBe(false);
  });

  it('схожі назви не сплутуються', () => {
    expect(isRouteActive('/(tabs)/time', '/time-records')).toBe(false);
    expect(isRouteActive('/time-records', '/time')).toBe(false);
  });
});

describe('NAV_GROUPS', () => {
  const items = NAV_GROUPS.flatMap(g => g.items);

  it('маршрути не дублюються', () => {
    const routes = items.map(i => i.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('рівно один пункт активний для будь-якого свого шляху', () => {
    // Інакше в сайдбарі підсвітяться два рядки одночасно.
    for (const item of items) {
      const pathname = item.route.replace('/(tabs)', '') || '/';
      const active = items.filter(i => isRouteActive(i.route, pathname));
      expect(active.map(a => a.route)).toEqual([item.route]);
    }
  });
});
