/**
 * components/shared/MasonryColumns.tsx — картки в N незалежних колонках.
 *
 * Кожна картка лягає в найкоротшу колонку за ВИМІРЯНИМИ висотами (onLayout),
 * вихідний порядок — тай-брейк. Сама розкладка — чисті функції з
 * utils/masonry.ts; тут лише виміри й рендер.
 *
 * Проти мерехтіння:
 *  - до першого повного виміру колонки невидимі (opacity 0): перша розкладка
 *    рахується «наосліп» (round-robin), і без цього картки один кадр стояли б
 *    не на своїх місцях, а потім перестрибували;
 *  - виміри одного кадру зводяться в один перерахунок (requestAnimationFrame);
 *  - колонки перераховуються лише коли висота змінилась суттєво
 *    (MASONRY_REASSIGN_THRESHOLD) — дрібний ріст картки колонка поглинає сама.
 *
 * Одна колонка — просто стос карток, без вимірів і прихованого кадру.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import {
  heightsChangedMaterially,
  masonrySignature,
  nextMasonryLayout,
  type MasonryLayout,
} from '@/utils/masonry';

export interface MasonryEntry {
  key: string;
  node: React.ReactNode;
}

/** Страховка: якщо якась картка так і не повідомила висоту — показати як є. */
const REVEAL_FALLBACK_MS = 400;

export function MasonryColumns({ items, columnCount, columnGap = 12 }: {
  items: readonly MasonryEntry[];
  columnCount: number;
  /** Проміжок між колонками. Вертикальний відступ — справа самих карток. */
  columnGap?: number;
}) {
  const multi = columnCount > 1;
  const keys = items.map(item => item.key);
  const signature = masonrySignature(keys, columnCount);
  const keysRef = useRef(keys);
  // Layout-ефект, а не запис у рендері: onLayout приходить після коміту,
  // тож flush уже бачить актуальні ключі.
  useLayoutEffect(() => { keysRef.current = keys; });

  const heightsRef = useRef<Record<string, number | undefined>>({});
  const layoutRef = useRef<MasonryLayout | null>(null);
  const frameRef = useRef<number | null>(null);
  const [version, setVersion] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const layout = useMemo(() => {
    const next = nextMasonryLayout(layoutRef.current, keys, heightsRef.current, columnCount);
    layoutRef.current = next;
    return next;
    // signature покриває ключі й кількість колонок; version — нові виміри.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, version]);

  const flush = useCallback(() => {
    frameRef.current = null;
    const heights = heightsRef.current;
    const current = keysRef.current;
    const prevLayout = layoutRef.current;
    if (!prevLayout || heightsChangedMaterially(prevLayout.basis, heights, current)) {
      setVersion(v => v + 1);
    }
    if (current.every(key => heights[key] !== undefined)) setRevealed(true);
  }, []);

  const onItemLayout = useCallback((key: string, e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (heightsRef.current[key] === h) return;
    heightsRef.current[key] = h;
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(flush);
  }, [flush]);

  useEffect(() => () => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
  }, []);

  useEffect(() => {
    if (!multi || revealed) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [multi, revealed]);

  if (!multi) {
    return <View>{items.map(item => <React.Fragment key={item.key}>{item.node}</React.Fragment>)}</View>;
  }

  const byKey = new Map(items.map(item => [item.key, item.node]));
  return (
    <View style={[st.row, { columnGap, opacity: revealed ? 1 : 0 }]}>
      {layout.columns.map((column, index) => (
        <View key={index} style={st.column}>
          {column.map(key => (
            <View key={key} onLayout={e => onItemLayout(key, e)}>
              {byKey.get(key)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  // flex-start: колонка не тягнеться до висоти сусідки.
  row:    { flexDirection: 'row', alignItems: 'flex-start' },
  column: { flex: 1, minWidth: 0 },
});
