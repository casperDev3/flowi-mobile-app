import fs from 'fs';
import path from 'path';

import { SIDEBAR_HIDDEN_ON } from '../constants/nav';
import {
  TAB_ROUTES,
  focusBadgeLabel,
  focusButtonOffsets,
  focusButtonVisible,
  isTabScreen,
} from '../utils/focusMode';

describe('focusButtonVisible', () => {
  it('на екранах входу кнопки немає', () => {
    // Гість ще не авторизований — таймерів у нього не буває.
    for (const route of SIDEBAR_HIDDEN_ON) {
      expect(focusButtonVisible(route)).toBe(false);
    }
  });

  it('на решті екранів кнопка є завжди', () => {
    // Правило «показувати лише коли таймер іде» скасовано свідомо: режим
    // мусить відкриватись звідусіль, і порожній стан у ньому вже є.
    for (const route of ['/', '/today', '/explore', '/notes', '/budget', '/meetings']) {
      expect(focusButtonVisible(route)).toBe(true);
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
  const insets = { bottom: 34, left: 0 };

  it('на екрані вкладок кнопка стоїть над панеллю табів', () => {
    // Панель напівпрозора й накриває контент (position: 'absolute').
    expect(focusButtonOffsets({ pathname: '/today', isWide: false, insets, tabBarHeight: 88 }).bottom)
      .toBe(100);
  });

  it('домашній індикатор не додається двічі', () => {
    // TAB_BAR_HEIGHT уже враховує його — insets.bottom згори дав би 134pt.
    const { bottom } = focusButtonOffsets({ pathname: '/', isWide: false, insets, tabBarHeight: 88 });
    expect(bottom).toBeLessThan(insets.bottom + 88);
  });

  it('на Stack-екрані панелі немає — відступ від безпечного поля', () => {
    expect(focusButtonOffsets({ pathname: '/notes', isWide: false, insets, tabBarHeight: 88 }).bottom)
      .toBe(50);
  });

  it('на широкому екрані панелі немає навіть на вкладці', () => {
    // Там її роль перебирає сайдбар.
    expect(focusButtonOffsets({ pathname: '/today', isWide: true, insets, tabBarHeight: 88 }).bottom)
      .toBe(50);
  });

  it('виріз у ландшафті з’їдає ліве поле', () => {
    const { left } = focusButtonOffsets({
      pathname: '/notes', isWide: false, insets: { bottom: 21, left: 59 }, tabBarHeight: 88,
    });
    expect(left).toBe(75);
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
