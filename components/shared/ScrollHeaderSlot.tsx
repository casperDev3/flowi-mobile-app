/**
 * components/shared/ScrollHeaderSlot.tsx — «гніздо» для заголовка, що
 * гортається разом із вмістом (телефон, 11.2026).
 *
 * Екрани з кількома вкладками (Здоров'я, Фінанси) не мають одного списку:
 * кожна вкладка — свій ScrollView у своєму компоненті. Щоб великий заголовок,
 * KPI й фільтри гортались із вмістом БУДЬ-ЯКОЇ вкладки, екран кладе
 * `AppHeader part="body"` у провайдер, а прокрутка вкладки ставить
 * <ScrollHeaderSlot insetX={…}/> першим дитям і бере onScroll з
 * useScrollHeaderScroll() — так нерухома смуга кнопок знає, коли показати
 * scroll-edge тло.
 *
 *   // екран
 *   <ScrollHeaderProvider render={insetX => <AppHeader {...p} part="body" insetX={insetX} />}
 *                         onScrollY={hs.onScrollY}>
 *     <OverviewTab … />
 *   </ScrollHeaderProvider>
 *
 *   // вкладка
 *   const onHeaderScroll = useScrollHeaderScroll();
 *   <ScrollView onScroll={onHeaderScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingHorizontal: 20 }}>
 *     <ScrollHeaderSlot insetX={20} />
 *
 * Без провайдера (стек-екран, що вбудовує ту саму вкладку; тести) гніздо
 * порожнє, а onScroll — undefined: поведінка компонента не змінюється.
 */
import React, { createContext, useContext, useMemo } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

interface SlotValue {
  render: (insetX: number) => React.ReactNode;
  onScroll?: ScrollHandler;
}

const SlotContext = createContext<SlotValue | null>(null);

export function ScrollHeaderProvider({ render, onScrollY, children }: {
  /** Заголовок для гнізда; `insetX` — горизонтальний відступ контейнера. */
  render: (insetX: number) => React.ReactNode;
  /** Зсув прокрутки вкладки (useHeaderScroll().onScrollY). */
  onScrollY?: (y: number) => void;
  children: React.ReactNode;
}) {
  const value = useMemo<SlotValue>(() => ({
    render,
    onScroll: onScrollY ? (e => onScrollY(e.nativeEvent.contentOffset.y)) : undefined,
  }), [render, onScrollY]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/** Заголовок екрана першим елементом прокрутки (або нічого без провайдера). */
export function ScrollHeaderSlot({ insetX = 0 }: { insetX?: number }) {
  const ctx = useContext(SlotContext);
  return ctx ? <>{ctx.render(insetX)}</> : null;
}

/** onScroll для прокрутки з гніздом (undefined без провайдера). */
export function useScrollHeaderScroll(): ScrollHandler | undefined {
  return useContext(SlotContext)?.onScroll;
}
