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

// I18N-06: SheetModal бере підпис «Закрити» з tr.*, тож тягне store/i18n,
// а той — AsyncStorage. У jsdom нативного модуля немає.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

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

  it('обгортка аркуша вміє стискатись', () => {
    // NAT-01: без flexShrink обгортка з відступами не віддає висоту
    // внутрішньому ScrollView, і низ форми виїздить за край екрана.
    const tree = open();
    const wrapper = tree.root.findAll((n: any) => n.props?.accessibilityViewIsModal === true)[0];
    expect(wrapper).toBeDefined();
    expect(flat(wrapper.props.style).flexShrink).toBe(1);
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

describe('SheetModal — доступність аркуша', () => {
  afterEach(() => {
    act(() => { while (trees.length) trees.pop().unmount(); });
  });

  /**
   * NAT-03. На пристрої ВЕСЬ аркуш був ОДНИМ елементом доступності: дерево
   * форми «Нове завдання» — 22 вузли, з них один 402×736 із підписом на
   * ~400 символів («Закрити, Нове завдання, Назва, … Скасувати, Додати»).
   * Жодного керованого контролу всередині — створити задачу з VoiceOver
   * неможливо. Склеював піддерево Pressable-обгортка, що існує лише заради
   * stopPropagation: Pressable з onPress на iOS сам стає елементом
   * доступності.
   */
  it('обгортка stopPropagation не є елементом доступності', () => {
    const tree = open();
    const wrapper = tree.root.findAll((n: any) => n.props?.accessibilityViewIsModal === true)[0];
    expect(wrapper).toBeDefined();
    expect(wrapper.props.accessible).toBe(false);
  });

  it('при цьому вона й далі зупиняє поширення дотику', () => {
    // accessible={false} не чіпає обробник: інакше тап по полях аркуша
    // провалювався б у backdrop і закривав форму.
    const tree = open();
    const wrapper = tree.root.findAll((n: any) => n.props?.accessibilityViewIsModal === true)[0];
    expect(typeof wrapper.props.onPress).toBe('function');
    const stop = jest.fn();
    act(() => { wrapper.props.onPress({ stopPropagation: stop }); });
    expect(stop).toHaveBeenCalled();
  });

  it('модальна ізоляція лишилась на тій самій обгортці', () => {
    // «Перевірені позитиви» нативного звіту: при відкритому аркуші в дереві
    // немає жодного вузла фонового екрана. Цю ізоляцію дає рівно
    // accessibilityViewIsModal, і зняти її разом з accessible не можна.
    const tree = open();
    // Рахуємо лише host-вузли: Pressable віддає той самий проп крізь кілька
    // рівнів React-обгорток, і всі вони знайшлись би як окремі збіги.
    const modals = tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.accessibilityViewIsModal === true,
    );
    expect(modals.length).toBe(1);
    expect(modals[0].props.accessible).toBe(false);
  });

  it('хрестик «Закрити» лишається окремою кнопкою', () => {
    // Він був частиною злиплого підпису; тепер мусить бути власним вузлом.
    const tree = open();
    const close = tree.root.findAll(
      (n: any) => n.props?.accessibilityRole === 'button' && n.props?.accessibilityLabel === 'Закрити',
    )[0];
    expect(close).toBeDefined();
    expect(close.props.accessible).not.toBe(false);
  });
});
