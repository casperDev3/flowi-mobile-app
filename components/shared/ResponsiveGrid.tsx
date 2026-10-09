/**
 * components/shared/ResponsiveGrid.tsx — картки рядами по 1/2/3 колонки.
 *
 * Два способи визначити кількість колонок:
 *   1. За класом вікна (default): compact 1 / medium 2 / expanded 3,
 *      або власна мапа `columns={{ compact: 1, medium: 2, expanded: 4 }}`.
 *   2. За місцем: `minItemWidth={280}` — колонок стільки, скільки влазить
 *      карток не вужчих за 280pt у ВИМІРЯНІЙ ширині контейнера (onLayout).
 *      Це правильний вибір усередині list+detail, де ширина списку не
 *      дорівнює ширині вікна. До першого виміру — правило 1.
 *
 * Рядки, а не flexWrap з відсотками: комірки рядка мають flex:1 і однакову
 * ширину за будь-якого gap, а неповний останній рядок добивається
 * порожніми комірками, щоб картки не розтягувались на всю ширину.
 *
 * Висоти в рядку вирівнюються по найвищій (alignItems:'stretch') — для
 * карток різної висоти без «драбини» є MasonryColumns.
 *
 * Ключі: беремо `key` дітей; діти без ключа отримують індекс.
 */
import React, { useCallback, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { type BySizeClass, Layout, chunkRows, gridColumnsFor } from '@/constants/tokens';
import { useResponsive } from '@/hooks/use-responsive';

export interface ResponsiveGridProps {
  children: React.ReactNode;
  /** Колонки за класом вікна (default: Layout.gridColumns = 1/2/3). */
  columns?: BySizeClass<number>;
  /** Мінімальна ширина картки — вмикає підбір колонок за виміряною шириною. */
  minItemWidth?: number;
  /** Стеля колонок (default 4). */
  maxColumns?: number;
  /** Проміжок між картками по обох осях (default Layout.gridGap). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ResponsiveGrid({
  children, columns, minItemWidth, maxColumns, gap = Layout.gridGap, style, testID,
}: ResponsiveGridProps) {
  const { sizeClass } = useResponsive();
  const [measured, setMeasured] = useState<number | undefined>(undefined);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setMeasured(prev => (prev === w ? prev : w));
  }, []);

  const n = gridColumnsFor({
    sizeClass, containerWidth: measured, minItemWidth, gap, columns, maxColumns,
  });

  const items = React.Children.toArray(children).filter(Boolean);
  const rows = chunkRows(items, n);

  return (
    <View testID={testID} style={[{ rowGap: gap }, style]} onLayout={minItemWidth ? onLayout : undefined}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', columnGap: gap, alignItems: 'stretch' }}>
          {row.map((child, ci) => (
            <View
              key={React.isValidElement(child) && child.key != null ? String(child.key) : `c${ri}-${ci}`}
              style={{ flex: 1, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {/* Порожні комірки: неповний рядок тримає ту саму ширину карток. */}
          {Array.from({ length: n - row.length }, (_, i) => (
            <View key={`pad${i}`} style={{ flex: 1, minWidth: 0 }} accessible={false} importantForAccessibility="no-hide-descendants" />
          ))}
        </View>
      ))}
    </View>
  );
}
