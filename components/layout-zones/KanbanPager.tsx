/**
 * components/layout-zones/KanbanPager.tsx — режим «Колонки» головної зони
 * (Layout System v2.4).
 *
 *   телефон (paging) — ОДНА колонка на екран, горизонтальний свайп
 *     (pagingEnabled) і крапки колонок над дошкою (рішення 06). Крапка — кнопка
 *     44×44 «Колонка 2 з 4: У роботі», тап переходить до колонки;
 *   планшет — колонки поруч (ширина `columnWidth`), горизонтальна прокрутка,
 *     коли не вміщаються.
 * Колонка — суцільна bento-картка (surface.card, вміст — не скло): шапка
 * «назва · N» + власна вертикальна прокрутка тіла.
 *
 *   <KanbanPager columns={[{ key, title, count }]} renderColumn={col => …}
 *                paging={isCompact} footer={…} />
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent, type StyleProp, type ViewStyle,
} from 'react-native';

import { useDSTheme } from '@/components/shared/useDSTheme';
import { fontFamily, radius, space } from '@/constants/theme';

import { useZoneStrings } from './strings';

export interface KanbanColumn {
  key: string;
  title: string;
  count?: number;
  /** Колір крапки статусу (#RRGGBB). */
  color?: string;
}

export function KanbanPager<C extends KanbanColumn>({
  columns, renderColumn, paging, columnWidth = 300, contentBottom = 24, gutter = 20, style, testID, onIndexChange,
}: {
  columns: readonly C[];
  /** Вміст тіла колонки (картки). Прокрутку дає сам KanbanPager. */
  renderColumn: (col: C, index: number) => React.ReactNode;
  /** Одна колонка на екран зі свайпом (телефон). */
  paging: boolean;
  /** Ширина колонки поруч (планшет). */
  columnWidth?: number;
  /** Нижній відступ тіла колонки (таб-бар, FAB). */
  contentBottom?: number;
  /** Бічне поле головної зони. */
  gutter?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  onIndexChange?: (i: number) => void;
}) {
  const { t } = useDSTheme();
  const s = useZoneStrings();
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollView>(null);

  const go = useCallback((i: number) => {
    setIndex(i);
    onIndexChange?.(i);
    ref.current?.scrollTo({ x: i * w, animated: true });
  }, [w, onIndexChange]);

  const onEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!w) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / w);
    if (i !== index) { setIndex(i); onIndexChange?.(i); }
  }, [w, index, onIndexChange]);

  const column = (col: C, i: number, width: number) => (
    <View key={col.key} style={{ width, paddingHorizontal: paging ? gutter : 0 }}>
      <View style={[st.col, { backgroundColor: t.surface.card }]}>
        <View style={st.colHead} accessibilityRole="header">
          {col.color ? <View style={[st.dot, { backgroundColor: col.color }]} /> : null}
          <Text numberOfLines={1} style={[st.colTitle, { color: t.text.primary }]}>{col.title}</Text>
          {col.count != null ? (
            <View style={[st.countPill, { backgroundColor: t.surface.subtle }]}>
              <Text style={[st.countText, { color: t.text.secondary }]}>{col.count}</Text>
            </View>
          ) : null}
        </View>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: space[2], paddingBottom: contentBottom }}>
          {renderColumn(col, i)}
        </ScrollView>
      </View>
    </View>
  );

  if (!paging) {
    return (
      <ScrollView
        testID={testID}
        horizontal
        style={style}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[3], paddingHorizontal: gutter, paddingTop: space[3] }}>
        {columns.map((c, i) => column(c, i, columnWidth))}
      </ScrollView>
    );
  }

  return (
    <View testID={testID} style={[{ flex: 1 }, style]} onLayout={e => setW(Math.round(e.nativeEvent.layout.width))}>
      {/* Крапки колонок (рішення 06) */}
      <View style={st.dots} accessibilityRole="tablist">
        {columns.map((c, i) => {
          const on = i === index;
          return (
            <Pressable
              key={c.key}
              onPress={() => go(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={s.column(i + 1, columns.length, c.title)}
              style={st.dotBtn}>
              <View style={[on ? st.dotOn : st.dotOff, { backgroundColor: on ? t.action.primary : t.text.muted }]} />
            </Pressable>
          );
        })}
      </View>
      {w > 0 ? (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
          style={{ flex: 1 }}>
          {columns.map((c, i) => column(c, i, w))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  col: { flex: 1, borderRadius: radius.card, padding: space[3], gap: space[2] },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  colTitle: { flex: 1, fontSize: 14, fontFamily: fontFamily.semibold },
  countPill: { minWidth: 24, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  dotBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dotOn: { width: 18, height: 8, borderRadius: 4 },
  dotOff: { width: 8, height: 8, borderRadius: 4 },
});
