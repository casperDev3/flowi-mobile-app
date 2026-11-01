/**
 * __tests__/title-menu.test.tsx — бургер меню розділу в рядку заголовка
 * (11.2026) і лічильник KPI з підписом ПІД числом.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiSet: jest.fn(async () => {}),
  multiRemove: jest.fn(async () => {}),
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));
const mockWindow = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

// View у jest-пресеті RN — мок із порожнім measureInWindow; даємо йому
// геометрію: кнопка 44×44 праворуч у рядку заголовка на 390pt.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockNativeMethods = require('react-native/jest/MockNativeMethods');
const mockMeasure = (cb: (x: number, y: number, w: number, h: number) => void) => cb(326, 96, 44, 44);

import { KpiCounter } from '@/components/ds/PageHeader';
import { TitleMenuButton, TITLE_MENU_BUTTON_SIZE } from '@/components/shared/TitleMenu';

function render(el: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => { r = create(el); });
  return r;
}

const byTestId = (r: ReactTestRenderer, id: string) =>
  r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string');

describe('TitleMenuButton', () => {
  beforeEach(() => {
    (MockNativeMethods.default ?? MockNativeMethods).measureInWindow.mockImplementation(mockMeasure);
  });

  it('кнопка 44×44 з підписом «Опції: <заголовок>»', () => {
    const r = render(<TitleMenuButton title="Фінанси" menu={{ items: [{ label: 'Історія', onPress: () => {} }] }} />);
    const btn = byTestId(r, 'title-menu-button')[0];
    expect(btn.props.accessibilityLabel).toBe('Опції: Фінанси');
    expect(btn.props.accessibilityRole).toBe('button');
    const style = StyleSheet.flatten(typeof btn.props.style === 'function' ? btn.props.style({ pressed: false }) : btn.props.style);
    expect(style.width).toBe(TITLE_MENU_BUTTON_SIZE);
    expect(style.height).toBe(44);
  });

  it('onPress-режим відкриває меню екрана, власного поповера немає', () => {
    const onPress = jest.fn();
    const r = render(<TitleMenuButton title="Завдання" menu={{ onPress }} />);
    act(() => { byTestId(r, 'title-menu-button')[0].props.onPress(); });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(byTestId(r, 'title-menu')).toHaveLength(0);
  });

  it('items-режим: пункт закриває меню й виконує дію; деструктивний — menuitem', () => {
    const history = jest.fn();
    const remove = jest.fn();
    const r = render(
      <TitleMenuButton
        title="Здоров'я"
        menu={{ items: [
          { label: 'Історія', icon: 'clock.arrow.circlepath', onPress: history, testID: 'mi-history' },
          { label: 'Видалити', icon: 'trash', onPress: remove, destructive: true, separatorBefore: true, testID: 'mi-del' },
        ] }}
      />,
    );
    act(() => { byTestId(r, 'title-menu-button')[0].props.onPress(); });
    const menu = byTestId(r, 'title-menu');
    expect(menu.length).toBeGreaterThan(0);
    // Поповер під кнопкою, правим краєм до її правого краю (390 − 370 = 20).
    const ms = StyleSheet.flatten(menu[0].props.style);
    expect(ms.top).toBe(96 + 44 + 8);
    expect(ms.right).toBe(20);
    const item = byTestId(r, 'mi-history')[0] as ReactTestInstance;
    expect(item.props.accessibilityRole).toBe('menuitem');
    act(() => { item.props.onPress(); });
    expect(history).toHaveBeenCalledTimes(1);
    expect(byTestId(r, 'title-menu')).toHaveLength(0);
  });
});

describe('KpiCounter — підпис під числом', () => {
  it('число, потім підпис, потім дельта — в одній колонці', () => {
    const r = render(<KpiCounter value={16} label="Задачі на тиждень" delta="3 прострочено" deltaTone="down" testID="kpi" />);
    const texts = r.root.findAll(n => (n.type as unknown) === 'Text').map(n => {
      const c = n.props.children;
      return Array.isArray(c) ? c.join('') : String(c);
    });
    expect(texts).toEqual(['16', 'Задачі на тиждень', '3 прострочено']);
    const col = r.root.findAll(n => (n.type as unknown) === 'View' && StyleSheet.flatten(n.props.style)?.flexDirection === 'column');
    expect(col.length).toBeGreaterThan(0);
    expect(r.root.findAll(n => n.props.testID === 'kpi' && n.props.accessible)[0].props.accessibilityLabel).toBe('16, Задачі на тиждень, 3 прострочено');
  });
});
