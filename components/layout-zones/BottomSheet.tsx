/**
 * components/layout-zones/BottomSheet.tsx — нижній аркуш деталей телефона
 * (Layout System v2.4, сторінка 09 специфікації: «Деталі на ~60% висоти,
 * список видно. Свайп угору — на весь екран»).
 *
 * Дві точки зупинки: peek (zone.sheetPeek ≈ 60% вікна) і full (≈ 94%).
 *   • тягнення ручки/шапки вгору → full; вниз із full → peek; вниз із peek
 *     далі порогу (120pt або швидкий змах) → закриття;
 *   • тап по затемненню, ✕, системне «Назад» — закриття;
 *   • VoiceOver: ручка — кнопка «Розгорнути / Згорнути» з діями
 *     increment/decrement; accessibilityViewIsModal тримає фокус усередині.
 * «Брудне скло»: OverlaySurface + OverlayScrim. «Зменшити рух» — без пружин.
 *
 * Шапка й низ — липкі (поза прокруткою), як у DetailPane: вкладки й кнопки
 * «Видалити / Виконано» лишаються на місці на обох висотах.
 *
 *   <BottomSheet visible={!!sel} onClose={close} header={<Tabs/>} footer={<Actions/>}
 *                scrollRef={ref} accessibilityLabel="Деталі">…</BottomSheet>
 */
import { NavigationContext } from '@react-navigation/native';
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverlayScrim, OverlaySurface } from '@/components/ds/OverlaySurface';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { Motion } from '@/constants/motion';
import { radius, zone } from '@/constants/theme';
import { useI18n } from '@/store/i18n';

import { useZoneStrings } from './strings';

const CLOSE_DISTANCE = 120;
const VELOCITY = 800;
const EXIT_MS = 160;

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Липка шапка над прокруткою (вкладки, заголовок). */
  header?: React.ReactNode;
  /** Липкий низ (дії). */
  footer?: React.ReactNode;
  /** Частка висоти вікна в початковому стані (за замовч. zone.sheetPeek). */
  peek?: number;
  /** Частка висоти в розгорнутому стані (за замовч. zone.sheetFull). */
  full?: number;
  /** Ref прокрутки тіла (скидати на початок при зміні запису). */
  scrollRef?: React.RefObject<ScrollView | null>;
  /** Не загортати тіло в ScrollView (вміст прокручується сам). */
  scroll?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  /**
   * Власна ✕ у рядку ручки (за замовч. так). false — коли шапка вмісту вже
   * має свою ✕ (TaskDetailHeader): дві кнопки закриття поруч — шум.
   */
  showClose?: boolean;
}

export function BottomSheet({
  visible, onClose, children, header, footer, peek = zone.sheetPeek, full = zone.sheetFull,
  scrollRef, scroll = true, accessibilityLabel, testID, showClose = true,
}: BottomSheetProps) {
  const reduced = useReducedMotion() ?? false;
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useDSTheme();
  const { tr } = useI18n();
  const s = useZoneStrings();

  const peekH = Math.round(winH * peek);
  const fullH = Math.round(Math.min(winH * full, winH - insets.top - 8));

  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const sheetH = useSharedValue(peekH);
  const ty = useSharedValue(peekH);
  const scrim = useSharedValue(0);
  const startH = useSharedValue(peekH);

  const finish = useCallback(() => {
    setMounted(false);
    setExpanded(false);
    onCloseRef.current();
  }, []);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (reduced) {
      scrim.value = 0;
      finish();
      return;
    }
    scrim.value = withTiming(0, { duration: EXIT_MS });
    ty.value = withTiming(sheetH.value, { duration: EXIT_MS }, done => { if (done) runOnJS(finish)(); });
  }, [reduced, finish, scrim, ty, sheetH]);

  const snapTo = useCallback((toFull: boolean) => {
    const target = toFull ? fullH : peekH;
    setExpanded(toFull);
    ty.value = reduced ? 0 : withSpring(0, Motion.spring.gentle);
    sheetH.value = reduced ? target : withSpring(target, Motion.spring.gentle);
  }, [fullH, peekH, reduced, sheetH, ty]);

  // Відкриття / зовнішнє закриття.
  useEffect(() => {
    if (visible && !mounted) {
      closingRef.current = false;
      sheetH.value = peekH;
      ty.value = reduced ? 0 : peekH;
      scrim.value = reduced ? 1 : 0;
      setExpanded(false);
      setMounted(true);
    } else if (!visible && mounted && !closingRef.current) {
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted]);

  useEffect(() => {
    if (!mounted || closingRef.current || reduced) return;
    ty.value = withSpring(0, Motion.spring.gentle);
    scrim.value = withTiming(1, { duration: Motion.duration.fast });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Поворот / зміна вікна з відкритим аркушем — тримаємо поточну точку.
  useEffect(() => {
    if (!mounted) return;
    sheetH.value = expanded ? fullH : peekH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekH, fullH]);

  // Екран під аркушем втратив фокус (перехід на інший маршрут) — закрити
  // миттєво: RN Modal — окреме вікно, і без цього висів би над новим екраном.
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation || !mounted) return;
    return navigation.addListener('blur', () => {
      if (closingRef.current) return;
      closingRef.current = true;
      finish();
    });
  }, [navigation, mounted, finish]);

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onBegin(() => { startH.value = sheetH.value; })
    .onUpdate(e => {
      const next = startH.value - e.translationY;
      if (next >= peekH) {
        sheetH.value = Math.min(next, fullH + 24);
        ty.value = 0;
      } else {
        sheetH.value = peekH;
        ty.value = peekH - next;
      }
    })
    .onEnd(e => {
      const h = sheetH.value;
      if (ty.value > CLOSE_DISTANCE || (e.velocityY > VELOCITY && h <= peekH + 4)) {
        runOnJS(close)();
        return;
      }
      const toFull = e.velocityY < -VELOCITY || (e.velocityY <= VELOCITY && h > (peekH + fullH) / 2);
      runOnJS(snapTo)(toFull);
    });

  const sheetStyle = useAnimatedStyle(() => ({ height: sheetH.value, transform: [{ translateY: ty.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  if (!mounted) return null;

  const handleRow = (
      <View style={st.handleRow}>
        <View style={{ width: 44 }} />
        <Pressable
          onPress={() => snapTo(!expanded)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? s.collapseSheet : s.expandSheet}
          accessibilityState={{ expanded }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => {
            if (e.nativeEvent.actionName === 'increment') snapTo(true);
            else if (expanded) snapTo(false);
            else close();
          }}
          hitSlop={{ top: 8, bottom: 8 }}
          style={st.grabberHit}>
          <View style={[st.grabber, { backgroundColor: t.text.muted }]} />
        </Pressable>
        {showClose ? (
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={tr.close}
            testID={testID ? `${testID}-close` : 'bottom-sheet-close'}
            style={st.closeBtn}>
            <IconSymbol name="xmark" size={16} color={t.text.secondary} />
          </Pressable>
        ) : <View style={{ width: 44 }} />}
      </View>
  );

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <OverlayScrim onPress={close} accessibilityLabel={tr.close} />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.kav}
          pointerEvents="box-none">
          <Animated.View style={[st.sheetBox, sheetStyle]}>
            <OverlaySurface
              testID={testID}
              accessibilityViewIsModal
              accessibilityLabel={accessibilityLabel}
              radius={radius.card}
              style={[st.surface, { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
              {/* Тягнути можна і за ручку, і за шапку (один GestureDetector). */}
              <GestureDetector gesture={pan}>
                <View>
                  {handleRow}
                  {header ? <View style={st.header}>{header}</View> : null}
                </View>
              </GestureDetector>
              {scroll ? (
                <ScrollView
                  ref={scrollRef}
                  style={st.body}
                  contentContainerStyle={st.bodyContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  {children}
                </ScrollView>
              ) : (
                <View style={st.body}>{children}</View>
              )}
              {footer ? (
                <View style={[st.footer, { borderTopColor: t.border.hairline, paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>
              ) : (
                <View style={{ height: insets.bottom }} />
              )}
            </OverlaySurface>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const st = StyleSheet.create({
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheetBox: { width: '100%' },
  surface: { flex: 1 },
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, minHeight: 44 },
  grabberHit: { flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 2.5, opacity: 0.6 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 4 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
