/**
 * __tests__/sheet-modal-layout.test.tsx — ширина bottom-sheet-а.
 *
 * Регрес: у Modal (окреме нативне вікно на весь екран) аркуш розтягувався
 * від краю до краю — на iPad у ландшафті це ~1170pt суцільної форми.
 * На телефоні поведінка мусить лишитись незмінною, а свайп, тап по бекдропу
 * й анімація translateY — робочими.
 */

const WINDOW = { width: 390, height: 844, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => WINDOW,
}));

// Модалка не читає маршрут, але useResponsive тягне expo-router транзитивно.
jest.mock('expo-router', () => ({ usePathname: () => '/' }));

// Нативного модуля жестів у jsdom немає; для компонування досить, щоб
// GestureDetector просто пропустив дітей крізь себе.
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});

import React from 'react';
import { Text } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function flat(style: any): any {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style ?? {};
}

const trees: any[] = [];

function open(onClose = jest.fn()) {
  let tree: any;
  act(() => {
    tree = create(
      <SheetModal visible onClose={onClose}>
        <Text>вміст</Text>
      </SheetModal>,
    );
  });
  trees.push(tree);
  return tree;
}

/** Аркуш — єдиний вузол, який несе transform: translateY. */
function sheetStyle(tree: any) {
  const node = tree.root.findAll((n: any) => {
    const st = flat(n.props?.style);
    return Array.isArray(st.transform) && 'translateY' in (st.transform[0] ?? {});
  })[0];
  return flat(node.props.style);
}

describe('SheetModal — ширина аркуша', () => {
  afterEach(() => {
    // Дерево тримає spring-анімацію Reanimated: без розмонтування jest
    // лишається з відкритим таймером після сьюта.
    act(() => { while (trees.length) trees.pop().unmount(); });
    WINDOW.width = 390;
    WINDOW.height = 844;
  });

  it('на планшеті в ландшафті — центрована колонка зі стелею', () => {
    WINDOW.width = 1194;
    WINDOW.height = 834;
    const st = sheetStyle(open());
    expect(st.maxWidth).toBe(CONTENT_MAX_WIDTH);
    expect(st.alignSelf).toBe('center');
    expect(st.width).toBe('100%');
  });

  it('на телефоні нічого не змінилось — повна ширина без стелі', () => {
    const st = sheetStyle(open());
    expect(st.width).toBe('100%');
    expect(st.maxWidth).toBeUndefined();
    expect(st.alignSelf).toBeUndefined();
  });

  it('анімований transform лишається останнім у масиві стилів', () => {
    // Порядок важливий: статичні стилі попереду, інакше вони затерли б
    // translateY і аркуш не з'їжджав би вниз.
    WINDOW.width = 1194;
    const st = sheetStyle(open());
    expect(st.transform[0].translateY).toBeDefined();
    expect(st.maxWidth).toBe(CONTENT_MAX_WIDTH);
  });

  it('контейнер аркуша не центрує вміст сам — інакше телефон би стиснуло', () => {
    WINDOW.width = 1194;
    const tree = open();
    const outer = tree.root.findAll((n: any) => {
      const st = flat(n.props?.style);
      return st.flex === 1 && st.justifyContent === 'flex-end';
    })[0];
    expect(outer).toBeDefined();
    expect(flat(outer.props.style).alignItems).toBeUndefined();
  });

  it('тап по бекдропу й далі закриває аркуш', () => {
    // Бічні поля на планшеті — єдиний спосіб закрити лист, окрім хрестика.
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      WINDOW.width = 1194;
      const tree = open(onClose);
      const dismiss = tree.root.findAll(
        (n: any) => n.props?.accessible === false
          && n.props?.importantForAccessibility === 'no'
          && typeof n.props?.onPress === 'function',
      )[0];
      expect(dismiss).toBeDefined();
      act(() => { dismiss.props.onPress(); });
      act(() => { jest.runAllTimers(); });
      expect(onClose).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
