/**
 * __tests__/mobile-polish-header.test.tsx — шапка й острівець після правок
 * власника 01.11.2026 (телефон):
 *  · кнопки шапки — прості іконки: без кружка, тла, обідка й скла;
 *  · бургер меню розділу — лише три риски (44pt невидима ціль);
 *  · острівець табів вужчий — не ширше TAB_ISLAND_MAX_WIDTH, по центру;
 *  · смуга кнопок отримує scroll-edge тло лише після зсуву вмісту;
 *  · заголовок, що гортається, порожній без провайдера (стек-екрани, тести).
 */
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

import React from 'react';
import { StyleSheet, View } from 'react-native';

import { HEADER_BUTTON_HIT_SLOP, HeaderButton, plainLayout } from '@/components/shared/ScreenHeader';
import { ScrollHeaderProvider, ScrollHeaderSlot, useScrollHeaderScroll } from '@/components/shared/ScrollHeaderSlot';
import { TAB_ISLAND_MAX_WIDTH, TAB_ISLAND_SIDE, tabIslandInsets } from '@/constants/nav';
import { HEADER_SCROLL_EDGE, isScrolledPastEdge } from '@/hooks/use-header-scroll';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function render(node: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(node); });
  return tree;
}

const CHROME = ['backgroundColor', 'borderWidth', 'borderColor', 'borderRadius', 'shadowColor', 'shadowOpacity', 'elevation'];

describe('HeaderButton — проста іконка', () => {
  it('без власного тла й обідка; ціль дотику 36 + hitSlop = 44', () => {
    const tree = render(
      <HeaderButton onPress={() => {}} accessibilityLabel="Дзвіник"><View /></HeaderButton>,
    );
    const btn = tree.root.findAll((n: any) => n.props?.accessibilityLabel === 'Дзвіник' && n.props?.hitSlop)[0];
    const style = StyleSheet.flatten(btn.props.style);
    for (const k of CHROME) expect(style[k]).toBeUndefined();
    expect(style.width + HEADER_BUTTON_HIT_SLOP.left + HEADER_BUTTON_HIT_SLOP.right).toBe(44);
    expect(style.height + HEADER_BUTTON_HIT_SLOP.top + HEADER_BUTTON_HIT_SLOP.bottom).toBeGreaterThanOrEqual(44);
  });

  it('тло й рамки від екрана відкидаються, розкладка лишається', () => {
    const out = plainLayout({ backgroundColor: '#000', borderWidth: 1, borderColor: '#fff', borderRadius: 18, marginLeft: 'auto', shadowOpacity: 0.2 });
    expect(out).toEqual({ marginLeft: 'auto' });
  });

  it('стан перемикача озвучується, хоча тла більше немає', () => {
    const tree = render(
      <HeaderButton onPress={() => {}} accessibilityLabel="Пошук" accessibilityState={{ expanded: true }}><View /></HeaderButton>,
    );
    const btn = tree.root.findAll((n: any) => n.props?.accessibilityLabel === 'Пошук' && n.props?.hitSlop)[0];
    expect(btn.props.accessibilityState).toEqual({ expanded: true });
  });
});

describe('острівець табів — вужчий, по центру', () => {
  it('на 390pt — рівно TAB_ISLAND_MAX_WIDTH, поля порівну', () => {
    const { left, right } = tabIslandInsets(390);
    expect(390 - left - right).toBe(TAB_ISLAND_MAX_WIDTH);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
    expect(left).toBeGreaterThan(TAB_ISLAND_SIDE);
  });

  it('320–340pt для 4 вкладок', () => {
    expect(TAB_ISLAND_MAX_WIDTH).toBeGreaterThanOrEqual(320);
    expect(TAB_ISLAND_MAX_WIDTH).toBeLessThanOrEqual(340);
  });

  it('на вузькому вікні — не ближче TAB_ISLAND_SIDE (+ бічний safe-area) до краю', () => {
    expect(tabIslandInsets(320)).toEqual({ left: TAB_ISLAND_SIDE, right: TAB_ISLAND_SIDE });
    const land = tabIslandInsets(844, 47, 47);
    expect(land.left).toBeGreaterThanOrEqual(TAB_ISLAND_SIDE + 47);
    expect(844 - land.left - land.right).toBe(TAB_ISLAND_MAX_WIDTH);
  });
});

describe('прокрутка шапки', () => {
  it('scroll-edge лише після порогу', () => {
    expect(isScrolledPastEdge(0)).toBe(false);
    expect(isScrolledPastEdge(HEADER_SCROLL_EDGE)).toBe(false);
    expect(isScrolledPastEdge(HEADER_SCROLL_EDGE + 1)).toBe(true);
    expect(isScrolledPastEdge(-40)).toBe(false); // відтяжка pull-to-refresh
    expect(isScrolledPastEdge(NaN)).toBe(false);
  });

  it('гніздо порожнє без провайдера й малює заголовок із відступом контейнера з ним', () => {
    expect(render(<ScrollHeaderSlot insetX={20} />).toJSON()).toBeNull();

    const seen: number[] = [];
    let handler: unknown;
    function Probe() {
      handler = useScrollHeaderScroll();
      return <ScrollHeaderSlot insetX={20} />;
    }
    const onScrollY = jest.fn();
    render(
      <ScrollHeaderProvider render={x => { seen.push(x); return <View testID="hdr" />; }} onScrollY={onScrollY}>
        <Probe />
      </ScrollHeaderProvider>,
    );
    expect(seen).toContain(20);
    (handler as (e: unknown) => void)({ nativeEvent: { contentOffset: { y: 42 } } });
    expect(onScrollY).toHaveBeenCalledWith(42);
  });
});
