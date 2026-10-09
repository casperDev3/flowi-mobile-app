import {
  SIDEBAR_WIDTH,
  screenContentWidth,
  sidebarVisible,
  DEFAULT_COLLAPSED_GROUP_IDS,
  NAV_GROUPS,
  groupHasActiveItem,
  isGroupCollapsed,
  isRouteActive,
  sanitizeCollapsedGroupIds,
  toggleCollapsedGroupId,
  menuNavGroups,
  moduleForPathname,
  disabledModuleForPathname,
  navGroupsFor,
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
  // Групи й дефолт згорнутості — ті самі осі, що й на вебі
  // (flowi-web-app/lib/nav-groups.ts): DEFAULT_COLLAPSED_GROUP_IDS = ['more', 'dev'].
  const personal = NAV_GROUPS.find(g => g.id === 'personal')!;
  const more = NAV_GROUPS.find(g => g.id === 'more')!;
  const dev = NAV_GROUPS.find(g => g.id === 'dev')!;
  const top = NAV_GROUPS.find(g => !g.id)!;

  it('групи без id не згортаються ніколи', () => {
    // Робота (найчастіші розділи) й Налаштування — те, заради чого сайдбар існує.
    expect(isGroupCollapsed(top, ['more', 'dev', 'personal', undefined as never])).toBe(false);
  });

  it('за замовчуванням згорнуті «Ще» й «Розробка», «Особисте» — ні', () => {
    expect(isGroupCollapsed(more, DEFAULT_COLLAPSED_GROUP_IDS)).toBe(true);
    expect(isGroupCollapsed(dev, DEFAULT_COLLAPSED_GROUP_IDS)).toBe(true);
    expect(isGroupCollapsed(personal, DEFAULT_COLLAPSED_GROUP_IDS)).toBe(false);
  });

  it('група з поточним розділом ЗГОРТАЄТЬСЯ (раніше тап мовчки нічого не робив)', () => {
    expect(isGroupCollapsed(more, ['more'])).toBe(true);
    expect(isGroupCollapsed(dev, ['dev'])).toBe(true);
    // Розгорнути назад — той самий тап.
    const once = toggleCollapsedGroupId([], 'more');
    expect(isGroupCollapsed(more, once)).toBe(true);
    expect(isGroupCollapsed(more, toggleCollapsedGroupId(once, 'more'))).toBe(false);
  });

  it('крапка активного розділу: лише для групи, де він лежить', () => {
    expect(groupHasActiveItem(more, '/containers')).toBe(true);
    expect(groupHasActiveItem(dev, '/feedback')).toBe(true);
    expect(groupHasActiveItem(more, '/projects')).toBe(false);
  });

  // Баг «Ще» на планшеті: 'nav_collapsed_groups' зі сховища не масив →
  // `.includes` / `.filter` кидали TypeError у рендері й на тапі.
  it.each([null, undefined, 'more', 42, true, { length: 2 }])('зіпсоване значення %p не кидає', raw => {
    expect(() => isGroupCollapsed(more, raw)).not.toThrow();
    expect(isGroupCollapsed(more, raw)).toBe(false);
    expect(() => toggleCollapsedGroupId(raw, 'more')).not.toThrow();
    expect(toggleCollapsedGroupId(raw, 'more')).toContain('more');
  });

  it('sanitizeCollapsedGroupIds: не масив → дефолт, масив → лише непорожні рядки без дублів', () => {
    expect(sanitizeCollapsedGroupIds(null)).toEqual([...DEFAULT_COLLAPSED_GROUP_IDS]);
    expect(sanitizeCollapsedGroupIds('more')).toEqual([...DEFAULT_COLLAPSED_GROUP_IDS]);
    expect(sanitizeCollapsedGroupIds(7)).toEqual([...DEFAULT_COLLAPSED_GROUP_IDS]);
    expect(sanitizeCollapsedGroupIds([])).toEqual([]);
    expect(sanitizeCollapsedGroupIds(['more', 'more', '', ' dev ', null, 3, {}])).toEqual(['more', 'dev']);
    // Старий формат-об'єкт.
    expect(sanitizeCollapsedGroupIds({ more: true, dev: false })).toEqual(['more']);
  });

  it('toggleCollapsedGroupId: порожній id нічого не змінює', () => {
    expect(toggleCollapsedGroupId(['dev'], '')).toEqual(['dev']);
    expect(toggleCollapsedGroupId(['dev'], 'more')).toEqual(['dev', 'more']);
    expect(toggleCollapsedGroupId(['dev', 'more'], 'dev')).toEqual(['more']);
  });

  it('сайдбар не мутує збережений стан при перемиканні', () => {
    const prev = Object.freeze(['more']) as readonly string[];
    expect(() => toggleCollapsedGroupId(prev, 'dev')).not.toThrow();
    expect(prev).toEqual(['more']);
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

describe('navGroupsFor — «Адміністрування workspace» (контракт §2.7)', () => {
  it('без прав адміна — той самий NAV_GROUPS, без нового пункту', () => {
    const groups = navGroupsFor(false);
    expect(groups).toBe(NAV_GROUPS);
    expect(groups.flatMap(g => g.items).some(i => i.route === '/admin-workspace')).toBe(false);
  });

  it('адміну — пункт додається саме в «Особисте», решта груп не чіпаються', () => {
    const groups = navGroupsFor(true);
    expect(groups.length).toBe(NAV_GROUPS.length);
    const personal = groups.find(g => g.id === 'personal')!;
    expect(personal.items[personal.items.length - 1].route).toBe('/admin-workspace');
    // Решта груп на своїх місцях — те саме посилання, що й у базовому
    // маніфесті (не перебудовані даремно).
    groups.forEach((group, i) => {
      if (group.id === 'personal') return;
      expect(group).toBe(NAV_GROUPS[i]);
    });
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

describe('«Записи часу» — не пункт меню (пункт 4/10)', () => {
  it('у маніфесті й сайдбарі немає /time-records — це дубль «Часу»', () => {
    const routes = NAV_GROUPS.flatMap(group => group.items).map(item => item.route);
    expect(routes).not.toContain('/time-records');
    const menu = menuNavGroups(NAV_GROUPS).flatMap(group => group.items).map(item => item.route);
    expect(menu).not.toContain('/time-records');
    expect(menu).toContain('/(tabs)/time');
  });
});

describe('moduleForPathname — заглушка за маршрутом (пункт 10)', () => {
  it('вкладки, включно з прихованою «Час»', () => {
    expect(moduleForPathname('/')).toEqual({ module: 'tasks', tab: true });
    expect(moduleForPathname('/explore')).toEqual({ module: 'finance', tab: true });
    expect(moduleForPathname('/health')).toEqual({ module: 'health', tab: true });
    expect(moduleForPathname('/time')).toEqual({ module: 'time', tab: true });
  });

  it('Stack-екрани модулів і їхні підекрани', () => {
    for (const [path, module] of [
      ['/meetings', 'meetings'], ['/notes', 'notes'], ['/projects', 'projects'],
      ['/workouts', 'workouts'], ['/training', 'training'], ['/containers', 'containers'],
      ['/budget', 'budget'], ['/subscriptions', 'subscriptions'],
      ['/project/p1/board', 'projects'], ['/health-sleep', 'health'],
    ] as const) {
      expect(moduleForPathname(path)).toEqual({ module, tab: false });
    }
  });

  it('системні маршрути — без модуля', () => {
    for (const path of ['/today', '/settings', '/settings-modules', '/feedback', '/login', '/notifications']) {
      expect(moduleForPathname(path)).toBeNull();
    }
  });

  it('кожен гейт обслуговує лише свою частину маршрутів', () => {
    expect(disabledModuleForPathname('/explore', ['finance'], 'tab')).toBe('finance');
    expect(disabledModuleForPathname('/explore', ['finance'], 'stack')).toBeNull();
    expect(disabledModuleForPathname('/meetings', ['meetings'], 'stack')).toBe('meetings');
    expect(disabledModuleForPathname('/meetings', ['meetings'], 'tab')).toBeNull();
    expect(disabledModuleForPathname('/explore', [], 'tab')).toBeNull();
    // «Ідеї та баги» не вимикаються: навіть збережене вимкнення не дає заглушки.
    expect(disabledModuleForPathname('/feedback', ['ideas'], 'stack')).toBeNull();
  });
});
