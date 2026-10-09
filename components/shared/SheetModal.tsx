/**
 * components/shared/SheetModal.tsx
 *
 * Реюзабельний bottom-sheet компонент.
 *
 * Анімація: backdrop opacity withTiming(0→0.5, fast)
 *           контент translateY withSpring(bottom→0, gentle)
 * Закриття: зворотнє (exit 150 ms) → onClose після анімації
 * Свайп:    GestureDetector (Pan) на grabber-зоні зверху листа;
 *           поріг 120 px або velocity > 800 px/s → закриття.
 * Reduced motion: без анімацій (миттєво).
 *
 * ШИРОКЕ ВІКНО (рішення 6): prop `presentation`
 *   'auto'   (default) — телефон: bottom-sheet; планшет: центрований діалог
 *   'sheet'  — завжди bottom-sheet (на широкому — центрована колонка внизу)
 *   'dialog' — на широкому центрований діалог (Layout.dialogMaxWidth)
 *   'side'   — на широкому панель праворуч на всю висоту (Layout.sidePanelWidth),
 *              виїжджає збоку, свайп праворуч закриває
 * На compact усі варіанти — bottom-sheet (resolveSheetPresentation).
 *
 * Props:
 *   visible         — показати/сховати лист
 *   onClose         — callback після завершення анімації закриття
 *   children        — вміст листа (BlurView + форма тощо)
 *   maxHeight?      — (зарезервовано; висота контролюється children)
 *   backdropDismiss — тап по бекдропу закриває (default: true)
 *   presentation    — див. вище (default: 'auto')
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Motion } from '@/constants/motion';
import { type SheetPresentation, Layout, resolveSheetPresentation } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dialogColumnStyle, sheetColumnStyle, sidePanelColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 120;   // px
const VEL_THRESHOLD   = 800;   // px/s
const EXIT_MS         = 150;   // ms
/** Діалог не їде з-за краю — лише трохи підіймається, проявляючись. */
const DIALOG_RISE     = 24;    // px

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Зарезервовано; children самі контролюють свою висоту. */
  maxHeight?: number;
  /** Тап по бекдропу закриває лист (default: true). */
  backdropDismiss?: boolean;
  /** Як показати на широкому вікні (default: 'auto' → діалог). */
  presentation?: SheetPresentation;
  /**
   * Де стоїть рядок «ручка + ✕».
   *   'outside' (default) — над вмістом, як завжди.
   *   'inside'  — SheetModal свій рядок НЕ малює; вміст ставить
   *               `<SheetHandle />` усередину власної картки. Для коротких
   *               карток (швидке створення): рядок над карткою висів у повітрі
   *               на бекдропі окремо від неї і з клавіатурою «стрибав» разом
   *               із прозорим проміжком.
   */
  handle?: 'outside' | 'inside';
}

interface SheetHandleContextValue {
  close: () => void;
  gesture: ReturnType<typeof Gesture.Pan>;
  showGrabber: boolean;
  closeLabel: string;
}

const SheetHandleContext = React.createContext<SheetHandleContextValue | null>(null);

/**
 * Рядок «ручка + ✕» усередині картки (SheetModal handle="inside").
 * Поза SheetModal нічого не малює — компонент можна лишати у вмісті, який
 * буває показаний і не аркушем (колонка планшета).
 */
export function SheetHandle({ color = 'rgba(128,128,128,0.6)' }: { color?: string }) {
  const ctx = React.useContext(SheetHandleContext);
  if (!ctx) return null;
  return (
    <GestureDetector gesture={ctx.gesture}>
      <View style={[styles.handleRow, styles.handleRowInside]}>
        <View style={{ flex: 1 }} />
        {ctx.showGrabber && <View style={styles.handle} />}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <TouchableOpacity
            onPress={ctx.close}
            style={styles.closeBtn}
            accessibilityLabel={ctx.closeLabel}
            accessibilityRole="button"
          >
            <IconSymbol name="xmark" size={17} color={color} />
          </TouchableOpacity>
        </View>
      </View>
    </GestureDetector>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SheetModal({
  visible,
  onClose,
  children,
  backdropDismiss = true,
  presentation = 'auto',
  handle = 'outside',
}: SheetModalProps) {
  const reduced = useReducedMotion() ?? false;
  const { width, height, isWide, sizeClass } = useResponsive();
  const mode = resolveSheetPresentation(presentation, sizeClass);
  // I18N-06: ця модалка обгортає КОЖНУ шторку застосунку, тож
  // захардкоджене «Закрити» озвучувало українською й англійський інтерфейс.
  const { tr } = useI18n();
  const isDark = useColorScheme() === 'dark';
  /**
   * На широкому вікні рядок «ручка + ✕» висить над карткою на бекдропі —
   * сірий гліф без підкладки там майже не видно (аудит iPad). Тож ✕ отримує
   * власну суцільну круглу підкладку. Телефонний аркуш лишається як був.
   */
  const closeChip = mode !== 'sheet' || isWide;

  /**
   * Дистанція, на яку лист їде за нижній край екрана.
   *
   * Живе в ref, а не просто в змінній рендеру, через ефект входу нижче:
   * додати висоту в його deps означало б переграти spring-анімацію
   * при кожному повороті екрана з уже відкритим листом. Ref дає свіже
   * значення на момент виклику, не чіпаючи момент запуску анімацій.
   */
  const offscreenFor = (m: typeof mode) =>
    m === 'side' ? Math.min(Layout.sidePanelWidth, width) : m === 'dialog' ? DIALOG_RISE : height;
  const offscreenRef = useRef(offscreenFor(mode));
  offscreenRef.current = offscreenFor(mode);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  /**
   * `mounted` — утримує Modal у DOM під час exit-анімації.
   * Встановлюється в true при відкритті, в false після exit-анімації.
   */
  const [mounted, setMounted] = useState(false);
  const isClosingRef = useRef(false);

  // Завжди тримаємо актуальний onClose без додавання в useCallback deps.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const backdropOpacity = useSharedValue(0);
  /** Зсув листа: по Y для sheet/dialog, по X для side. */
  const translateY      = useSharedValue(offscreenRef.current);
  /** Прозорість вмісту — анімується лише в діалозі; аркуш і панель завжди 1. */
  const contentOpacity  = useSharedValue(mode === 'dialog' ? 0 : 1);

  // ── Анімація закриття (стабільна — deps змінюються рідко) ─────────────────
  const triggerClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const done = () => {
      setMounted(false);
      onCloseRef.current();
    };

    if (reduced) {
      backdropOpacity.value = 0;
      translateY.value = offscreenRef.current;
      done();
      return;
    }

    backdropOpacity.value = withTiming(0, { duration: EXIT_MS });
    if (modeRef.current === 'dialog') contentOpacity.value = withTiming(0, { duration: EXIT_MS });
    translateY.value = withTiming(offscreenRef.current, { duration: EXIT_MS }, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [reduced, backdropOpacity, translateY, contentOpacity]);

  /**
   * Екран під аркушем втратив фокус (диплінк віджета, перехід на іншу
   * вкладку/маршрут). RN Modal — окреме нативне вікно поверх УСЬОГО, тож без
   * цього аркуш (напр. «Фільтри» фінансів) лишався висіти над новим екраном.
   * Закриваємо миттєво, без exit-анімації: екрана під ним уже не видно.
   */
  const navigation = React.useContext(NavigationContext);
  useEffect(() => {
    if (!navigation || !mounted) return;
    return navigation.addListener('blur', () => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      backdropOpacity.value = 0;
      translateY.value = offscreenRef.current;
      setMounted(false);
      onCloseRef.current();
    });
  }, [navigation, mounted, backdropOpacity, translateY]);

  // ── Монтуємо при відкритті ────────────────────────────────────────────────
  useEffect(() => {
    if (visible && !mounted) {
      isClosingRef.current = false;
      setMounted(true);
    }
  }, [visible, mounted]);

  // ── Зовнішнє закриття: батько встановив visible=false ─────────────────────
  useEffect(() => {
    if (!visible && mounted && !isClosingRef.current) {
      triggerClose();
    }
  }, [visible, mounted, triggerClose]);

  // ── Анімація входу після монтування ──────────────────────────────────────
  useEffect(() => {
    if (!mounted) {
      // Скидаємо для наступного відкриття
      backdropOpacity.value = 0;
      translateY.value = offscreenRef.current;
      contentOpacity.value = modeRef.current === 'dialog' ? 0 : 1;
      return;
    }
    // Не анімуємо, якщо вже закриваємось
    if (isClosingRef.current) return;

    if (reduced) {
      backdropOpacity.value = 0.5;
      translateY.value = 0;
      contentOpacity.value = 1;
    } else {
      backdropOpacity.value = withTiming(0.5, { duration: Motion.duration.fast });
      translateY.value = withSpring(0, Motion.spring.gentle);
      contentOpacity.value = withTiming(1, { duration: Motion.duration.fast });
    }
    // backdropOpacity/translateY — стабільні SharedValue-об'єкти (refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, reduced]);

  // ── Pan gesture лише на grabber-зоні ─────────────────────────────────────
  // sheet — тягнемо вниз; side — праворуч; діалог свайпом не закривається
  // (хрестик, Esc/back і тап по бекдропу).
  const horizontal = mode === 'side';
  const panBase = Gesture.Pan().enabled(mode !== 'dialog');
  const panGesture = (horizontal
    ? panBase.activeOffsetX([8, 9_999])   // лише навмисне тягнення праворуч
    : panBase.activeOffsetY([8, 9_999]))  // лише навмисне тягнення вниз
    .onUpdate((e) => {
      // Переміщуємо лист слідом за пальцем (тільки до краю, з якого виїхав)
      const t = horizontal ? e.translationX : e.translationY;
      if (t > 0) {
        translateY.value = t;
      }
    })
    .onEnd((e) => {
      const t = horizontal ? e.translationX : e.translationY;
      const v = horizontal ? e.velocityX : e.velocityY;
      if (t > SWIPE_THRESHOLD || v > VEL_THRESHOLD) {
        // Закриваємо
        runOnJS(triggerClose)();
      } else {
        // Повертаємо у відкрите положення
        translateY.value = withSpring(0, Motion.spring.gentle);
        backdropOpacity.value = withTiming(0.5, { duration: Motion.duration.fast });
      }
    });

  // ── Animated styles ───────────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => (
    horizontal
      ? { transform: [{ translateX: translateY.value }] }
      : { transform: [{ translateY: translateY.value }], opacity: contentOpacity.value }
  ));

  /**
   * Ширина колонки береться з useResponsive() — тобто з ВІКНА, а не з
   * screenContentWidth(): Modal у RN — окреме нативне вікно на весь екран,
   * сайдбара в ньому немає, і віднімання його 232pt зсунуло б аркуш ліворуч
   * від центру.
   *
   * Статичні стилі стоять ПЕРЕД анімованим: Reanimated дописує transform
   * поверх масиву, і зворотний порядок з'їв би translateY.
   */
  const columnStyle =
    mode === 'side' ? sidePanelColumnStyle(width)
    : mode === 'dialog' ? dialogColumnStyle()
    : sheetColumnStyle(isWide);
  const outerStyle =
    mode === 'side' ? styles.outerSide
    : mode === 'dialog' ? styles.outerDialog
    : styles.outer;
  const wrapperStyle =
    mode === 'side' ? [styles.wrapper, styles.wrapperSide]
    : mode === 'dialog' ? [styles.wrapper, styles.wrapperDialog]
    : styles.wrapper;

  // ── Рендер ────────────────────────────────────────────────────────────────
  if (!mounted) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={triggerClose}
    >
      {/* RN Modal — окреме нативне вікно: жестам потрібен власний root. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop — тільки візуальний, без перехоплення дотиків */}
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
          pointerEvents="none"
        />

        {/* Dismiss-область (за листом) */}
        {backdropDismiss && (
          <Pressable
            accessible={false}
            importantForAccessibility="no"
            style={StyleSheet.absoluteFill}
            onPress={triggerClose}
          />
        )}

        {/* Контейнер листа (flex-end) */}
        <View style={outerStyle} pointerEvents="box-none">
          <Animated.View style={[columnStyle, sheetStyle]}>
            {/*
             * Pressable зупиняє поширення дотиків до backdrop dismiss-Pressable.
             * Дочірні ScrollView/TextInput/кнопки перехоплюють свої дотики
             * у звичному порядку (глибший view — вищий пріоритет у RN).
             *
             * accessible={false} ОБОВ'ЯЗКОВЕ. Pressable з onPress на iOS
             * сам стає елементом доступності й склеює ВСЕ піддерево в один
             * вузол: VoiceOver читає аркуш однією фразою на 40+ підписів і
             * не має всередині жодного керованого контролу (NAT-03). Тут
             * Pressable існує лише заради stopPropagation — озвучувати в
             * ньому нічого. На onPress і на accessibilityViewIsModal прапорець
             * не впливає: модальна ізоляція лишається на цій самій обгортці.
             */}
            <Pressable
              style={wrapperStyle}
              onPress={(e) => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              importantForAccessibility="yes"
            >

              {/* Grabber-зона: GestureDetector + handle + xmark */}
              {handle === 'outside' && (
              <GestureDetector gesture={panGesture}>
                <View style={styles.handleRow}>
                  <View style={{ flex: 1 }} />
                  {/* Ручка лише в аркуші: діалог не тягнуть, а панель
                      тягнуть убік — горизонтальна риска обіцяла б інше. */}
                  {mode === 'sheet' && <View style={styles.handle} />}
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={triggerClose}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={tr.close}
                      accessibilityRole="button"
                      testID="sheet-close"
                      style={closeChip
                        ? [styles.closeChip, { backgroundColor: isDark ? '#2C2C2E' : '#FFFFFF' }]
                        : undefined}
                    >
                      <IconSymbol
                        name="xmark"
                        size={closeChip ? 15 : 17}
                        color={closeChip ? (isDark ? '#F2F2F7' : '#1C1C1E') : 'rgba(128,128,128,0.6)'}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              </GestureDetector>
              )}

              {/* Вміст (BlurView + ScrollView + форма) */}
              <SheetHandleContext.Provider value={{ close: triggerClose, gesture: panGesture, showGrabber: mode === 'sheet', closeLabel: tr.close }}>
                {children}
              </SheetHandleContext.Provider>

            </Pressable>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
  // alignItems тут НЕ ставимо: 'center' стиснув би аркуш до ширини вмісту
  // на телефоні. Центрування робить сам аркуш через alignSelf.
  outer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  // Діалог: по центру з полями, щоб бекдроп лишався видимим з усіх боків.
  outerDialog: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  // Панель: притиснута праворуч на всю висоту.
  outerSide: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  // flexShrink: 1 — щоб аркуш, вищий за вікно (клавіатура + довга форма),
  // віддавав висоту внутрішньому ScrollView замість виїзду за край екрана.
  // Див. sheetSurfaceStyle у hooks/use-content-width.ts.
  wrapper: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    flexShrink: 1,
  },
  wrapperDialog: {
    paddingBottom: 0,
  },
  wrapperSide: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 28 : 16,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  // Усередині картки: без власних бокових полів (їх дає картка), ✕ — 44×44.
  handleRowInside: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 32,
    marginTop: -8,
    marginBottom: 4,
  },
  closeBtn: {
    width: 44,
    height: 44,
    marginRight: -12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ✕ на широкому вікні: суцільне коло, видиме на затемненому бекдропі.
  closeChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(128,128,128,0.35)',
  },
});
