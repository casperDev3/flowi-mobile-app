/**
 * components/health/HealthLayout.tsx — компонування вкладок «Здоровʼя» на
 * планшеті (рішення 6).
 *
 * Вкладки — це вертикальні стрічки секцій (картка «сьогодні», динаміка,
 * нагадування…). На телефоні так і лишається: одна колонка з полями 16pt.
 * На широкому вікні та сама стрічка розтягувалась у смугу на 720pt посеред
 * порожнього екрана, а динаміка опинялась на третьому екрані прокрутки.
 *
 * Тепер, коли екрану (вікно мінус сайдбар) вистачає на дві читабельні
 * колонки, вкладка ділить секції на ліву («сьогодні» + її динаміка) і праву
 * (супутні показники, нагадування). Стеля ширини — Layout.wideMaxWidth, поля —
 * Layout.gutter за класом вікна.
 *
 *   const lay = useHealthTabLayout();
 *   <ScrollView contentContainerStyle={[lay.contentStyle, { paddingBottom }]}>
 *     <HealthColumns twoCol={lay.twoCol} left={<>…</>} right={<>…</>} />
 *   </ScrollView>
 *
 * Поріг рахується від ширини ЕКРАНА, а не вікна: iPad mini у портреті з
 * рейкою сайдбара дає ~670pt — дві колонки по 320pt там уже тісні для карток
 * із графіками, тож лишається одна.
 *
 * Самі вкладки розділу (components/health/tabs/*) уже не ділять секції на
 * «ліву/праву», а кладуть картки в MasonryColumns — див. useHealthTabGrid()
 * нижче. useHealthTabLayout + HealthColumns лишаються для екранів
 * налаштувань розділу (профіль, Apple Health).
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { type WideModalStyles, wideModalStyles } from '@/components/finance/wideModal';
import { Layout, type SizeClass } from '@/constants/tokens';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';

/** Ширина екрана, з якої вкладка ділиться на дві колонки. */
export const HEALTH_TWO_COLUMN_FROM = 700;

/** Чиста функція для тестів: чи ділити вкладку на колонки. */
export function healthTwoColumn(screenWidth: number): boolean {
  return screenWidth >= HEALTH_TWO_COLUMN_FROM;
}

export interface HealthTabLayout {
  /** Дві колонки секцій. */
  twoCol: boolean;
  /** contentContainerStyle для ScrollView вкладки: стеля ширини + поля. */
  contentStyle: ViewStyle;
  /** Відступ першого заголовка правої колонки: на одному рівні з лівою. */
  firstRightTop: number | undefined;
}

export function useHealthTabLayout(): HealthTabLayout {
  const screenWidth = useScreenWidth();
  const { sizeClass } = useResponsive();
  const twoCol = healthTwoColumn(screenWidth);
  return {
    twoCol,
    contentStyle: {
      width: '100%',
      alignSelf: 'center',
      maxWidth: twoCol ? Layout.wideMaxWidth : Layout.readingMaxWidth,
      paddingHorizontal: Layout.gutter[sizeClass],
    },
    firstRightTop: twoCol ? 8 : undefined,
  };
}

/**
 * Дві колонки секцій або, на вузькому, ті самі секції одна під одною в тому
 * самому порядку (ліва, потім права) — порядок читання для VoiceOver
 * однаковий в обох режимах.
 */
export function HealthColumns({ twoCol, left, right, gap = 20, style }: {
  twoCol: boolean;
  left: React.ReactNode;
  right: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (!twoCol) return <>{left}{right}</>;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', columnGap: gap }, style]}>
      {/* minWidth:0 — довгий рядок не виштовхує сусідню колонку. */}
      <View style={{ flex: 1, minWidth: 0 }}>{left}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{right}</View>
    </View>
  );
}

// ─── Вкладки розділу «Здоровʼя»: masonry як на решті екранів ───────────────

/**
 * Бічні поля вкладок — ті самі 20pt, що й у ScreenHeader та на Фінансах.
 * Раніше тут були поля за класом вікна (16/20/24), і картки вкладки стояли
 * не на одній лінії із заголовком сторінки.
 */
export const HEALTH_TAB_GUTTER = 20;

/**
 * Колонки карток вкладки: телефон — одна, планшет (medium і expanded) — дві.
 * Рішення власника: на планшеті картки здоровʼя — дві незалежні колонки
 * (MasonryColumns), без дір під нижчою сусідкою.
 */
export function healthTabColumns(sizeClass: SizeClass): number {
  return sizeClass === 'compact' ? 1 : 2;
}

/** contentContainerStyle вкладки: поля як у Фінансах, на планшеті — стеля ширини. */
export function healthTabContentStyle(isWide: boolean): ViewStyle {
  return isWide
    ? { paddingHorizontal: HEALTH_TAB_GUTTER, paddingTop: 8, width: '100%', maxWidth: Layout.wideMaxWidth, alignSelf: 'center' }
    : { paddingHorizontal: HEALTH_TAB_GUTTER, paddingTop: 8 };
}

export interface HealthTabGrid {
  /** 1 на телефоні, 2 на планшеті — для MasonryColumns. */
  columnCount: number;
  contentStyle: ViewStyle;
  isWide: boolean;
}

export function useHealthTabGrid(): HealthTabGrid {
  const { sizeClass, isWide } = useResponsive();
  return {
    columnCount: healthTabColumns(sizeClass),
    contentStyle: healthTabContentStyle(isWide),
    isWide,
  };
}

/**
 * Рукописні модалки розділу (швидкий ввід, записи, форми профілактики) на
 * широкому вікні — центрованим діалогом, як SheetModal 'auto'. Без цього
 * форма на iPad тягнулась смугою на всю ширину, притиснута до низу.
 * Правило спільне з фінансами: components/finance/wideModal.ts.
 */
export function useWideModal(): WideModalStyles {
  const { isWide } = useResponsive();
  return wideModalStyles(isWide);
}
