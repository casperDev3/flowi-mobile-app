import {
  SIDEBAR_WIDTH,
  screenContentWidth,
  sidebarVisible,
  DEFAULT_COLLAPSED_GROUP_IDS,
  NAV_GROUPS,
  isGroupCollapsed,
  isRouteActive,
} from '../constants/nav';

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

describe('згортання груп сайдбара', () => {
  const tools = NAV_GROUPS.find(g => g.id === 'tools')!;
  const more = NAV_GROUPS.find(g => g.id === 'more')!;
  const top = NAV_GROUPS.find(g => !g.id)!;

  it('групи без id не згортаються ніколи', () => {
    // Найчастіші розділи й Налаштування — те, заради чого сайдбар існує.
    expect(isGroupCollapsed(top, ['more', 'tools', undefined as never], '/')).toBe(false);
  });

  it('за замовчуванням згорнуте лише «Ще»', () => {
    expect(isGroupCollapsed(more, DEFAULT_COLLAPSED_GROUP_IDS, '/')).toBe(true);
    expect(isGroupCollapsed(tools, DEFAULT_COLLAPSED_GROUP_IDS, '/')).toBe(false);
  });

  it('група з поточним розділом розгортається попри згорнутість', () => {
    // Інакше на екрані «Баги» жоден пункт не підсвічений, і незрозуміло, де ви.
    expect(isGroupCollapsed(more, ['more'], '/bugs')).toBe(false);
    expect(isGroupCollapsed(more, ['more'], '/notes')).toBe(false);
    // Розділ із СУСІДНЬОЇ групи такої поблажки не дає.
    expect(isGroupCollapsed(more, ['more'], '/projects')).toBe(true);
  });

  it('дефолт складається з наявних id, а не з вигаданих', () => {
    const ids = NAV_GROUPS.map(g => g.id).filter(Boolean);
    for (const id of DEFAULT_COLLAPSED_GROUP_IDS) expect(ids).toContain(id);
  });

  it('згорнути можна не все: частина пунктів лишається видимою завжди', () => {
    // Захист від «оптимізації», яка сховала б за розкривачками весь сайдбар.
    const alwaysVisible = NAV_GROUPS.filter(g => !g.id).flatMap(g => g.items);
    expect(alwaysVisible.length).toBeGreaterThanOrEqual(5);
  });
});

describe('ширина, доступна екрану', () => {
  it('на широкому екрані сайдбар забирає свої 232pt', () => {
    // Саме цього не враховували Контейнери: сітка будувала ряд на 720pt у
    // колонці 582pt і обрізала карти праворуч.
    expect(screenContentWidth(1194, true, '/containers', SIDEBAR_WIDTH)).toBe(1194 - SIDEBAR_WIDTH);
  });

  it('на телефоні нічого не віднімається', () => {
    expect(screenContentWidth(390, false, '/containers', SIDEBAR_WIDTH)).toBe(390);
  });

  it('на авторизаційних екранах сайдбара немає навіть на планшеті', () => {
    // Віднімати там 232pt означало б звужувати екран ні за що.
    for (const route of ['/welcome', '/login', '/register', '/forgot-password']) {
      expect(screenContentWidth(1194, true, route, SIDEBAR_WIDTH)).toBe(1194);
      expect(sidebarVisible(true, route)).toBe(false);
    }
  });

  it('ширина не буває відʼємною', () => {
    // Split View може дати вікно вужче за сам сайдбар.
    expect(screenContentWidth(180, true, '/containers', SIDEBAR_WIDTH)).toBe(0);
  });
});
