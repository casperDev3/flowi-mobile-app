/**
 * components/shared/ListDetailLayout.tsx — список + деталь одним викликом.
 *
 * Поверх DetailPane: вирішує, коли деталь — колонка, а коли — модалка, і
 * яка в колонки ширина. Екрану лишається передати список і вміст деталі.
 *
 *   const ld = useListDetail();            // { wide, detailWidth, listWidth }
 *   <ListDetailLayout
 *     list={<FlatList … numColumns={ld.wide ? 1 : 2} />}
 *     open={!!selected} onClose={() => setSelected(null)}
 *     isDark={isDark} sheetColor={c.sheet} borderColor={c.border}
 *     maxHeight={height * 0.88} scrollRef={detailRef}
 *     empty={<TodayPanel />}               // що в колонці, коли нічого не вибрано
 *     header={<DetailTabs />}>
 *     <TaskDetail … />
 *   </ListDetailLayout>
 *
 * Колонка — з `expanded` (≥840) за замовчуванням; `wideFrom="medium"` для
 * екранів, де деталь вузька й вистачає 600pt. Ширина колонки росте на дуже
 * широкому вікні (detailColumnWidthFor). Нижче порогу деталь — модальний
 * лист DetailPane (як на телефоні).
 */
import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { DetailPane, type DetailPaneProps } from '@/components/shared/DetailPane';
import { type SizeClass, detailColumnWidthFor } from '@/constants/tokens';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';

export type ListDetailThreshold = Exclude<SizeClass, 'compact'>;

export interface ListDetailInfo {
  /** Деталь показується колонкою поруч зі списком. */
  wide: boolean;
  /** Ширина колонки деталі (0, коли не wide). */
  detailWidth: number;
  /** Ширина, що лишається списку (екран мінус сайдбар мінус деталь). */
  listWidth: number;
}

/** Чиста функція для тестів і для екранів без компонента. */
export function listDetailInfo(
  sizeClass: SizeClass,
  windowWidth: number,
  screenWidth: number,
  wideFrom: ListDetailThreshold = 'expanded',
): ListDetailInfo {
  const wide = wideFrom === 'medium' ? sizeClass !== 'compact' : sizeClass === 'expanded';
  const detailWidth = wide ? detailColumnWidthFor(windowWidth) : 0;
  return { wide, detailWidth, listWidth: Math.max(screenWidth - detailWidth, 0) };
}

export function useListDetail(wideFrom: ListDetailThreshold = 'expanded'): ListDetailInfo {
  const { sizeClass, width } = useResponsive();
  const screenWidth = useScreenWidth();
  return listDetailInfo(sizeClass, width, screenWidth, wideFrom);
}

export interface ListDetailLayoutProps extends Omit<DetailPaneProps, 'wide' | 'columnWidth'> {
  /** Ліва частина: список/сітка разом із власною прокруткою й шапкою. */
  list: React.ReactNode;
  wideFrom?: ListDetailThreshold;
  style?: StyleProp<ViewStyle>;
}

export function ListDetailLayout({ list, wideFrom = 'expanded', style, ...pane }: ListDetailLayoutProps) {
  const { wide, detailWidth } = useListDetail(wideFrom);
  return (
    <View style={[st.root, style]}>
      <View style={st.list}>{list}</View>
      <DetailPane {...pane} wide={wide} columnWidth={wide ? detailWidth : undefined} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  // minWidth:0 — щоб довгий рядок у списку не виштовхнув колонку деталі.
  list: { flex: 1, minWidth: 0 },
});
