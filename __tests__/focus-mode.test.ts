import fs from 'fs';
import path from 'path';

import { SIDEBAR_HIDDEN_ON } from '../constants/nav';
import {
  FAB_CLEARANCE,
  TAB_ROUTES,
  focusBadgeLabel,
  focusButtonOffsets,
  focusButtonVisible,
  isTabScreen,
} from '../utils/focusMode';

describe('focusButtonVisible на екранах входу', () => {
  it('гостю кнопки немає на жодній ширині', () => {
    // Гість ще не авторизований — таймерів у нього не буває.
    for (const route of SIDEBAR_HIDDEN_ON) {
      expect(focusButtonVisible(route, true, 3)).toBe(false);
      expect(focusButtonVisible(route, false, 3)).toBe(false);
    }
  });

  it('на планшеті кнопка є, поки йде хоч один таймер', () => {
    for (const route of ['/', '/today', '/explore', '/notes', '/budget', '/meetings']) {
      expect(focusButtonVisible(route, true, 1)).toBe(true);
    }
  });
});

describe('isTabScreen', () => {
  it('корінь вкладок — це екран Завдань', () => {
    expect(isTabScreen('/')).toBe(true);
    expect(isTabScreen('/index')).toBe(true);
  });

  it('Stack-екрани панелі табів не мають', () => {
    for (const route of ['/notes', '/projects', '/budget', '/time-records', '/health-sleep']) {
      expect(isTabScreen(route)).toBe(false);
    }
  });

  it('схожі назви не сплутуються', () => {
    // '/time' — вкладка, '/time-records' — окремий Stack-екран без табів.
    expect(isTabScreen('/time')).toBe(true);
    expect(isTabScreen('/time-records')).toBe(false);
  });

  it('перелічені всі файли з app/(tabs)', () => {
    // Новий екран-вкладка інакше мовчки дістав би відступ Stack-екрана, і
    // кнопка сховалася б під панеллю табів.
    const dir = path.join(__dirname, '..', 'app', '(tabs)');
    const screens = fs.readdirSync(dir)
      .filter(f => f.endsWith('.tsx') && f !== '_layout.tsx')
      .map(f => f.replace(/\.tsx$/, ''));

    const missing = screens.filter(name =>
      name === 'index' ? !isTabScreen('/') : !isTabScreen(`/${name}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('focusButtonOffsets', () => {
  const insets = { bottom: 34, right: 0 };

  it('на екрані вкладок кнопка стоїть над панеллю табів', () => {
    // Панель напівпрозора й накриває контент (position: 'absolute'),
    // а зверху ще FAB_CLEARANCE — під кнопкою стоїть власний FAB екрана.
    expect(focusButtonOffsets({ pathname: '/today', isWide: false, insets, tabBarHeight: 88 }).bottom)
      .toBe(100 + FAB_CLEARANCE);
  });

  it('домашній індикатор не додається двічі', () => {
    // TAB_BAR_HEIGHT уже враховує його — insets.bottom згори дав би 134pt.
    const { bottom } = focusButtonOffsets({ pathname: '/', isWide: false, insets, tabBarHeight: 88 });
    expect(bottom).toBeLessThan(insets.bottom + 88 + FAB_CLEARANCE);
  });

  it('на Stack-екрані панелі немає — відступ від безпечного поля', () => {
    expect(focusButtonOffsets({ pathname: '/notes', isWide: false, insets, tabBarHeight: 88 }).bottom)
      .toBe(50 + FAB_CLEARANCE);
  });

  it('на широкому екрані панелі немає навіть на вкладці', () => {
    // Там її роль перебирає сайдбар.
    expect(focusButtonOffsets({ pathname: '/today', isWide: true, insets, tabBarHeight: 88 }).bottom)
      .toBe(50 + FAB_CLEARANCE);
  });

  it('кнопка піднята над власним FAB екрана, а не накриває його', () => {
    // Сім екранів малюють свою дію в тому самому куті: right: 20, 52pt.
    const { bottom } = focusButtonOffsets({
      pathname: '/notes', isWide: true, insets, tabBarHeight: 88,
    });
    expect(bottom).toBeGreaterThanOrEqual(insets.bottom + 16 + 52);
  });

  it('виріз у ландшафті з’їдає праве поле', () => {
    const { right } = focusButtonOffsets({
      pathname: '/notes', isWide: false, insets: { bottom: 21, right: 59 }, tabBarHeight: 88,
    });
    expect(right).toBe(75);
  });
});

describe('focusButtonVisible', () => {
  it('без активних таймерів кнопки немає', () => {
    // Режим показує те, що йде просто зараз. Кнопка, яка веде в порожню
    // сітку, обіцяє, що там щось є.
    expect(focusButtonVisible('/today', true, 0)).toBe(false);
    expect(focusButtonVisible('/notes', true, 0)).toBe(false);
  });

  it('сміття замість кількості кнопку не показує', () => {
    expect(focusButtonVisible('/today', true, Number.NaN)).toBe(false);
    expect(focusButtonVisible('/today', true, -1)).toBe(false);
  });

  it('на телефоні плаваючої кнопки немає — вхід лишається на вкладці «Час»', () => {
    expect(focusButtonVisible('/today', false, 2)).toBe(false);
    expect(focusButtonVisible('/notes', false, 2)).toBe(false);
  });

  it('на широкому екрані з активним таймером кнопка є', () => {
    expect(focusButtonVisible('/today', true, 1)).toBe(true);
    expect(focusButtonVisible('/notes', true, 5)).toBe(true);
  });

  it('на екранах входу її немає навіть на планшеті з таймером', () => {
    for (const route of ['/welcome', '/login', '/register', '/forgot-password']) {
      expect(focusButtonVisible(route, true, 3)).toBe(false);
    }
  });
});

describe('focusBadgeLabel', () => {
  it('нуль бейджа не малює', () => {
    expect(focusBadgeLabel(0)).toBeNull();
    expect(focusBadgeLabel(-1)).toBeNull();
  });

  it('звичайна кількість — це число', () => {
    expect(focusBadgeLabel(1)).toBe('1');
    expect(focusBadgeLabel(9)).toBe('9');
  });

  it('понад дев\'ять стискається — та сама межа, що у вебі', () => {
    // Межа мусить збігатися з lib/focus-mode.ts focusBadgeText: різні пороги
    // на двох клієнтах дали б різний підпис на тих самих даних.
    expect(focusBadgeLabel(10)).toBe('9+');
    expect(focusBadgeLabel(1234)).toBe('9+');
  });

  it('сміття не перетворюється на бейдж', () => {
    expect(focusBadgeLabel(Number.NaN)).toBeNull();
  });
});

describe('TAB_ROUTES', () => {
  it('без дублікатів', () => {
    expect(new Set(TAB_ROUTES).size).toBe(TAB_ROUTES.length);
  });
});
