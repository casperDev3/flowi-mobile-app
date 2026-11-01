/**
 * components/layout-zones/ZoneLayout.tsx — каркас зон Layout System v2.4
 * (нативний відповідник вебового `ZoneLayout`, ті самі назви пропів).
 *
 * П'ять зон: Header · Navigation · Static · Main · Dynamic. Header і
 * Navigation дає застосунок (AppHeader у main, NavSidebar-рейка в
 * app/_layout.tsx); ZoneLayout розкладає три вмістові:
 *
 *   iPad / широке вікно (не compact):
 *     [static?] ┃ [main] ┃ [dynamic — деталі, закривається ✕]
 *     • static стоїть поруч лише від zone.staticFrom (1280pt вікна) і коли
 *       main лишається ≥ zone.mainMin за типових ширин; інакше статична зона
 *       живе на вкладці «Сьогодні» (екран її просто не передає / вона ховається тут);
 *     • ┃ — межі (ZoneResizeHandle): ширину статичної й панелі деталей
 *       тягнуть вільно, без min/max і без «головна найширша» — лише підлога
 *       ZONE_MIN_WIDTH (120pt) для кожної зони. Ширини — локально на пристрої
 *       (zoneSizes.ts, `layout_zone_sizes_v1`), ключ — `sizeKey`;
 *     • dynamic з'являється справа ПІСЛЯ вибору запису і закривається ✕ —
 *       список розтягується;
 *     • FAB «+» — у правому нижньому куті main;
 *     • PanelToggles (три крапки) — під main, якщо екран дав `panels`.
 *   Телефон (compact):
 *     main на весь екран; dynamic — нижній аркуш BottomSheet (~60% → весь
 *     екран); static не показується (вона — вкладка «Сьогодні»).
 *
 * Зони незалежні: стан завантаження/помилки кожна малює сама (ZoneStates),
 * і жодна не блокує сусідню.
 *
 *   <ZoneLayout
 *     main={<List/>}
 *     dynamic={sel ? <Details/> : null} dynamicOpen={!!sel} onCloseDynamic={close}
 *     dynamicHeader={<Tabs/>} dynamicFooter={<Actions/>}
 *     static={<TodayPane/>} showStatic={zone.panels.static}
 *     panels={zone.panels} onTogglePanel={zone.togglePanel}
 *     fab={<AddFab/>} overlay={<BulkActionBar …/>} />
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { fontFamily, radius, space, zone } from '@/constants/theme';
import { useMotion } from '@/hooks/use-motion';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import type { ZonePanel } from '@/hooks/use-zone-state';

import { useSidebarStrings } from '@/components/shared/sidebar-strings';

import { BottomSheet } from './BottomSheet';
import { DEFAULT_ZONE_SIZE_KEY, setZoneSize, useZoneSizes } from './zoneSizes';
import { ZoneResizeHandle } from './ZoneResizeHandle';
import { ZONE_HANDLE_WIDTH, ZONE_MIN_WIDTH, zoneWidths } from './zoneWidths';
import { PanelToggles } from './PanelToggles';
import { useZoneStrings } from './strings';

export { zoneWidths, type ZoneWidths } from './zoneWidths';

export interface ZoneLayoutProps {
  /** Головна зона (список / дошка) разом із власною шапкою й прокруткою. */
  main: React.ReactNode;
  /** Вміст динамічної зони (деталі вибраного запису). */
  dynamic?: React.ReactNode;
  dynamicOpen: boolean;
  onCloseDynamic: () => void;
  /** Липка шапка панелі/аркуша деталей (вкладки). */
  dynamicHeader?: React.ReactNode;
  /** Липкий низ панелі/аркуша деталей (дії). */
  dynamicFooter?: React.ReactNode;
  /** Озвучення панелі («Деталі завдання»). */
  dynamicLabel?: string;
  /** Ref прокрутки тіла деталей. */
  dynamicScrollRef?: React.RefObject<ScrollView | null>;
  /**
   * Власний рядок панелі «ДЕТАЛІ … ✕» (за замовч. так). false — коли
   * dynamicHeader уже має ✕ (TaskDetailHeader): тоді й аркуш телефона без ✕.
   */
  dynamicChrome?: boolean;
  /** Статична зона (контекст: зустрічі дня, KPI). Лише широке вікно ≥ 1280. */
  static?: React.ReactNode;
  showStatic?: boolean;
  /** Перемикачі панелей (три крапки під main). Без них — не показуються. */
  panels?: { static: boolean; dynamic: boolean };
  onTogglePanel?: (p: ZonePanel) => void;
  /** Плаваюча «+» у правому нижньому куті main. */
  fab?: React.ReactNode;
  /** Плаваючий шар над main (BulkActionBar). */
  overlay?: React.ReactNode;
  /**
   * Межі між зонами можна тягнути (планшет, за замовч. так). Ширини —
   * спільні для всіх розділів, якщо екран не дав власний `sizeKey`.
   */
  resizable?: boolean;
  sizeKey?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ZoneLayout({
  main, dynamic, dynamicOpen, onCloseDynamic, dynamicHeader, dynamicFooter, dynamicLabel, dynamicScrollRef,
  dynamicChrome = true, static: staticZone, showStatic = true, panels, onTogglePanel, fab, overlay,
  resizable = true, sizeKey = DEFAULT_ZONE_SIZE_KEY, style, testID,
}: ZoneLayoutProps) {
  const ss = useSidebarStrings();
  const sizes = useZoneSizes(sizeKey);
  const { t } = useDSTheme();
  const s = useZoneStrings();
  const motion = useMotion();
  const insets = useSafeAreaInsets();
  const { isWide, width } = useResponsive();
  const screenWidth = useScreenWidth();

  const w = zoneWidths({
    windowWidth: width,
    screenWidth,
    wide: isWide,
    wantStatic: !!staticZone && showStatic,
    wantDynamic: dynamicOpen && !!dynamic,
    sizes: resizable ? sizes : undefined,
    handles: resizable ? { static: ZONE_HANDLE_WIDTH, dynamic: ZONE_HANDLE_WIDTH } : {},
  });
  // Стеля для кожної межі: решта зон (зокрема головна) — не вужче підлоги.
  const handlesWidth = resizable ? (w.showStatic ? ZONE_HANDLE_WIDTH : 0) + (w.showDynamic ? ZONE_HANDLE_WIDTH : 0) : 0;
  const staticMax = screenWidth - w.dynamicWidth - handlesWidth - zone.gap - ZONE_MIN_WIDTH;
  const dynamicMax = screenWidth - w.staticWidth - handlesWidth - zone.gap - ZONE_MIN_WIDTH;
  // Ліва крапка має сенс лише там, де статична зона взагалі вміщається.
  const staticAvailable = !!staticZone && isWide && width >= zone.staticFrom;

  if (!isWide || w.dynamicMode === 'sheet') {
    return (
      <View testID={testID} style={[st.root, style]}>
        <View style={st.main}>
          {isWide && panels && onTogglePanel ? <View style={st.mainBody}>{main}</View> : main}
          {isWide && panels && onTogglePanel ? (
            // Окрема смуга під main, а не поверх: крапки не перекривають кнопки в картках.
            <View style={st.togglesBar}>
              <PanelToggles panels={panels} onToggle={onTogglePanel} staticAvailable={false} testID="zone-panel-toggles" />
            </View>
          ) : null}
          {fab}
          {overlay}
        </View>
        <BottomSheet
          visible={dynamicOpen && !!dynamic}
          onClose={onCloseDynamic}
          header={dynamicHeader}
          footer={dynamicFooter}
          scrollRef={dynamicScrollRef}
          showClose={dynamicChrome}
          accessibilityLabel={dynamicLabel ?? s.detailsPanel}
          testID={testID ? `${testID}-sheet` : 'zone-sheet'}>
          {dynamic}
        </BottomSheet>
      </View>
    );
  }

  return (
    <View testID={testID} style={[st.root, st.row, style]}>
      {w.showStatic ? (
        <Animated.View
          entering={motion.entering(FadeIn.duration(160))}
          accessibilityLabel={s.staticZone}
          style={[st.static, { width: w.staticWidth, paddingTop: insets.top + space[3] }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space[6] }}>
            {staticZone}
          </ScrollView>
        </Animated.View>
      ) : null}
      {w.showStatic && resizable ? (
        <ZoneResizeHandle
          width={w.staticWidth - zone.gap}
          direction={1}
          maxWidth={staticMax}
          onResize={(next, save) => setZoneSize(sizeKey, 'static', next, save)}
          onReset={() => setZoneSize(sizeKey, 'static', undefined)}
          label={ss.resizeStatic}
          testID="zone-resize-static"
        />
      ) : null}

      <View style={[st.main, { minWidth: Math.min(zone.mainMin, w.mainWidth) }]}>
        {panels && onTogglePanel ? <View style={st.mainBody}>{main}</View> : main}
        {panels && onTogglePanel ? (
          <View style={st.togglesBar}>
            <PanelToggles panels={panels} onToggle={onTogglePanel} staticAvailable={staticAvailable} testID="zone-panel-toggles" />
          </View>
        ) : null}
        {fab}
        {overlay}
      </View>

      {w.showDynamic && resizable ? (
        <ZoneResizeHandle
          width={w.dynamicWidth - zone.gap}
          direction={-1}
          maxWidth={dynamicMax}
          onResize={(next, save) => setZoneSize(sizeKey, 'dynamic', next, save)}
          onReset={() => setZoneSize(sizeKey, 'dynamic', undefined)}
          label={ss.resizeDynamic}
          testID="zone-resize-dynamic"
        />
      ) : null}
      {w.showDynamic ? (
        <Animated.View
          entering={motion.entering(SlideInRight.duration(200))}
          accessibilityLabel={dynamicLabel ?? s.detailsPanel}
          style={[
            st.dynamic,
            { width: w.dynamicWidth - zone.gap, marginTop: insets.top + space[2], marginBottom: Math.max(insets.bottom, space[3]), backgroundColor: t.surface.card },
          ]}>
          {dynamicChrome ? (
          <View style={st.dynHead}>
            <Text numberOfLines={1} style={[st.dynTitle, { color: t.text.secondary }]}>{dynamicLabel ?? s.detailsPanel}</Text>
            <Pressable
              onPress={onCloseDynamic}
              accessibilityRole="button"
              accessibilityLabel={s.closePanel}
              testID="zone-dynamic-close"
              style={({ pressed }) => [st.closeBtn, { backgroundColor: t.surface.subtle, opacity: pressed ? 0.7 : 1 }]}>
              <IconSymbol name="xmark" size={14} color={t.text.primary} />
            </Pressable>
          </View>
          ) : null}
          {dynamicHeader ? <View style={[st.dynHeader, dynamicChrome ? null : { paddingTop: space[4] }]}>{dynamicHeader}</View> : null}
          <ScrollView
            ref={dynamicScrollRef}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={st.dynBody}>
            {dynamic}
          </ScrollView>
          {dynamicFooter ? (
            <View style={[st.dynFooter, { borderTopColor: t.border.hairline }]}>{dynamicFooter}</View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row' },
  main: { flex: 1, minWidth: 0 },
  static: { paddingLeft: zone.gap, paddingRight: 0 },
  // Динамічна зона — вміст, а не оверлей: суцільна bento-картка (surface.card),
  // не скло (DS: скло лише функціональний шар).
  dynamic: { marginRight: zone.gap, borderRadius: radius.card, overflow: 'hidden' },
  dynHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: space.cardPaddingCompact, paddingRight: 6, paddingTop: 6, minHeight: 50 },
  dynTitle: { flex: 1, fontSize: 12, fontFamily: fontFamily.semibold, letterSpacing: 0.4, textTransform: 'uppercase' },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dynHeader: { paddingHorizontal: space.cardPaddingCompact, paddingBottom: 4 },
  dynBody: { paddingHorizontal: space.cardPaddingCompact, paddingBottom: 32, paddingTop: 4 },
  dynFooter: { paddingHorizontal: space.cardPaddingCompact, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  mainBody: { flex: 1, minHeight: 0 },
  togglesBar: { alignItems: 'center', paddingTop: 6, paddingBottom: 10 },
});
