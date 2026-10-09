/**
 * components/today/TodaySectionGrid.tsx — сітка секцій головного екрана.
 *
 * Телефон — одна колонка рівно в порядку правила власника.
 * Планшет — masonry (components/shared/MasonryColumns): незалежні колонки,
 * кожна секція лягає в найкоротшу за виміряними висотами (onLayout). Раніше
 * тут були рядки по N: висота рядка дорівнювала найвищій картці, і під
 * нижчою сусідкою лишалась велика діра, а непарна кількість давала порожню
 * клітинку. Жадібний вибір найкоротшої колонки зберігає порядок читання
 * за верхнім краєм карток (див. sectionOrder.ts), перша секція — зліва вгорі.
 *
 * Відступ між секціями — ОДИН токен (TODAY_SECTION_GAP) і по вертикалі, і
 * між колонками; самі секції власного зовнішнього marginBottom не мають.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { MasonryColumns } from '@/components/shared/MasonryColumns';
import { Spacing } from '@/constants/tokens';

import { todayGridSegments, type TodayGridEntry } from './sectionOrder';

/** Єдиний відступ між секціями «Сьогодні» (вертикальний і між колонками). */
export const TODAY_SECTION_GAP = Spacing.md;

export interface TodaySectionEntry extends TodayGridEntry {
  node: React.ReactNode;
}

export function TodaySectionGrid({ items, columnCount, gap = TODAY_SECTION_GAP }: {
  items: readonly TodaySectionEntry[];
  columnCount: number;
  gap?: number;
}) {
  // Обгортка з marginBottom входить у виміряну висоту картки (onLayout
  // обгортки MasonryColumns), тож колонки рахуються разом із відступом.
  const wrap = (item: TodaySectionEntry) => ({
    key: item.key,
    node: <View style={{ marginBottom: gap }}>{item.node}</View>,
  });

  if (columnCount <= 1) {
    return <View>{items.map(item => <React.Fragment key={item.key}>{wrap(item).node}</React.Fragment>)}</View>;
  }
  return (
    <View>
      {todayGridSegments(items).map((segment, index) => (
        segment.fullWidth ? (
          <View key={segment.items[0].key} style={st.full}>{wrap(segment.items[0]).node}</View>
        ) : (
          <MasonryColumns
            // Стабільний ключ: поява/зникнення секції не перемонтовує блок
            // (виміри зберігаються, колонки не ховаються на новий кадр).
            key={`masonry-${index}`}
            items={segment.items.map(wrap)}
            columnCount={columnCount}
            columnGap={gap}
          />
        )
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  full: { width: '100%' },
});
