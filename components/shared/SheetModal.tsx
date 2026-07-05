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
 * Props:
 *   visible         — показати/сховати лист
 *   onClose         — callback після завершення анімації закриття
 *   children        — вміст листа (BlurView + форма тощо)
 *   maxHeight?      — (зарезервовано; висота контролюється children)
 *   backdropDismiss — тап по бекдропу закриває (default: true)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
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

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_H = Dimensions.get('window').height;
const SWIPE_THRESHOLD = 120;   // px
const VEL_THRESHOLD   = 800;   // px/s
const EXIT_MS         = 150;   // ms

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Зарезервовано; children самі контролюють свою висоту. */
  maxHeight?: number;
  /** Тап по бекдропу закриває лист (default: true). */
  backdropDismiss?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SheetModal({
  visible,
  onClose,
  children,
  backdropDismiss = true,
}: SheetModalProps) {
  const reduced = useReducedMotion() ?? false;

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
  const translateY      = useSharedValue(SCREEN_H);

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
      translateY.value = SCREEN_H;
      done();
      return;
    }

    backdropOpacity.value = withTiming(0, { duration: EXIT_MS });
    translateY.value = withTiming(SCREEN_H, { duration: EXIT_MS }, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [reduced, backdropOpacity, translateY]);

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
      translateY.value = SCREEN_H;
      return;
    }
    // Не анімуємо, якщо вже закриваємось
    if (isClosingRef.current) return;

    if (reduced) {
      backdropOpacity.value = 0.5;
      translateY.value = 0;
    } else {
      backdropOpacity.value = withTiming(0.5, { duration: Motion.duration.fast });
      translateY.value = withSpring(0, Motion.spring.gentle);
    }
    // backdropOpacity/translateY — стабільні SharedValue-об'єкти (refs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, reduced]);

  // ── Pan gesture лише на grabber-зоні ─────────────────────────────────────
  const panGesture = Gesture.Pan()
    .activeOffsetY([8, 9_999]) // лише навмисне тягнення вниз
    .onUpdate((e) => {
      // Переміщуємо лист слідом за пальцем (тільки вниз)
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > SWIPE_THRESHOLD || e.velocityY > VEL_THRESHOLD) {
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

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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
          <Pressable style={StyleSheet.absoluteFill} onPress={triggerClose} />
        )}

        {/* Контейнер листа (flex-end) */}
        <View style={styles.outer} pointerEvents="box-none">
          <Animated.View style={sheetStyle}>
            {/*
             * Pressable зупиняє поширення дотиків до backdrop dismiss-Pressable.
             * Дочірні ScrollView/TextInput/кнопки перехоплюють свої дотики
             * у звичному порядку (глибший view — вищий пріоритет у RN).
             */}
            <Pressable style={styles.wrapper} onPress={(e) => e.stopPropagation()}>

              {/* Grabber-зона: GestureDetector + handle + xmark */}
              <GestureDetector gesture={panGesture}>
                <View style={styles.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={styles.handle} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={triggerClose}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Закрити"
                      accessibilityRole="button"
                    >
                      <IconSymbol name="xmark" size={17} color="rgba(128,128,128,0.6)" />
                    </TouchableOpacity>
                  </View>
                </View>
              </GestureDetector>

              {/* Вміст (BlurView + ScrollView + форма) */}
              {children}

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
  outer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  wrapper: {
    paddingHorizontal: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(128,128,128,0.35)',
  },
});
