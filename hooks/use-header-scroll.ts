/**
 * hooks/use-header-scroll.ts
 *
 * Стан «вміст заїхав під нерухому смугу кнопок шапки» для екранів-вкладок
 * телефона (11.2026): великий заголовок, KPI й фільтри гортаються разом із
 * вмістом (AppHeader part="body"), а смуга [☰] … [🔔] [аватар]
 * (AppHeader part="toolbar") стоїть на місці й отримує scroll-edge тло лише
 * після першого зсуву — інакше текст «бився» б об кнопки.
 *
 * Стан міняється лише на перетині порогу, а не на кожен кадр прокрутки —
 * ререндер шапки буває двічі за жест, а не 60 разів на секунду.
 *
 *   const hs = useHeaderScroll();
 *   <AppHeader {...p} part="toolbar" scrolled={hs.scrolled} />
 *   <ScrollView onScroll={hs.onScroll} scrollEventThrottle={16}>
 *     <AppHeader {...p} part="body" insetX={gutter} />
 */
import { useCallback, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** Зсув (pt), після якого вміст вважається «під смугою». */
export const HEADER_SCROLL_EDGE = 4;

/** Чиста частина: чи вміст уже під смугою при зсуві `y`. */
export function isScrolledPastEdge(y: number, edge = HEADER_SCROLL_EDGE): boolean {
  return Number.isFinite(y) && y > edge;
}

export function useHeaderScroll(edge = HEADER_SCROLL_EDGE) {
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(false);

  /** Зсув напряму — для компонентів, що віддають лише `y` (напр. onScrollY). */
  const onScrollY = useCallback((y: number) => {
    const next = isScrolledPastEdge(y, edge);
    if (next !== last.current) {
      last.current = next;
      setScrolled(next);
    }
  }, [edge]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => onScrollY(e.nativeEvent.contentOffset.y),
    [onScrollY],
  );

  /** Скинути (зміна вкладки/вигляду — новий список починається згори). */
  const reset = useCallback(() => onScrollY(0), [onScrollY]);

  return { scrolled, onScroll, onScrollY, reset };
}
