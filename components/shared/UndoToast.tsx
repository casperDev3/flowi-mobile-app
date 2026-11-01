import { fontFamily, radius } from '@/constants/theme';
/**
 * components/shared/UndoToast.tsx
 *
 * Легкий тост-знизу з кнопкою «Скасувати».
 * Авто-зникнення через 4 с. Поява/зникнення — лише фейд (Animated.timing opacity,
 * Motion.popup), без виїзду знизу; «Зменшити рух» — миттєво.
 *
 * API:
 *   const { show: showUndo, element: undoElement } = useUndoToast(isTab);
 *   showUndo('Завдання виконано', () => { ... });
 *   showUndo('Скопійовано');   // без onUndo — коротке підтвердження без кнопки
 *   // У JSX: <View style={{ flex: 1 }}>{undoElement}</View>
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useDSTheme } from '@/components/shared/useDSTheme';
import { Motion } from '@/constants/motion';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useI18n } from '@/store/i18n';

// ─── Тривалість показу ───────────────────────────────────────────────────────
const TOAST_DURATION_MS = 4000;
/** Тост без «Скасувати» (напр. «Скопійовано») — лише підтвердження, довше не треба. */
const INFO_TOAST_DURATION_MS = 1800;

interface ToastData {
  message: string;
  /** Без onUndo тост лише підтверджує дію — кнопки «Скасувати» немає. */
  onUndo?: () => void;
}

interface UndoToastApi {
  show: (message: string, onUndo?: () => void) => void;
  element: React.ReactElement;
  /**
   * Тост зараз на екрані. Екрани з FAB ховають кнопку, поки він показаний:
   * тост стоїть над таб-баром рівно там, де «+», і кнопка стирчала поверх
   * нього (P2 аудиту 2026-10).
   */
  visible: boolean;
}

/**
 * @param isTab - true якщо екран є вкладкою (таб-бар знизу); false для Stack-скрінів.
 */
export function useUndoToast(isTab = true): UndoToastApi {
  const { tr } = useI18n();
  const { t, isDark } = useDSTheme();
  const reduced = useReduceMotion();

  const [toastData, setToastData] = useState<ToastData | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUndoRef = useRef<(() => void) | null>(null);

  // Очищення при unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const hide = useCallback(() => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: reduced ? 0 : Motion.popup.exit,
      easing: Motion.easing.out,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setToastData(null);
    });
  }, [opacity, reduced]);

  const show = useCallback((message: string, onUndo?: () => void) => {
    // Скидаємо попередній таймер
    if (timerRef.current) clearTimeout(timerRef.current);

    onUndoRef.current = onUndo ?? null;

    // Оновлюємо дані та показуємо анімацію
    setToastData({ message, onUndo });
    // Лише проявлення на місці; «Зменшити рух» — одразу видимий.
    opacity.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: Motion.popup.enter,
        easing: Motion.easing.out,
        useNativeDriver: true,
      }).start();
    }

    timerRef.current = setTimeout(hide, onUndo ? TOAST_DURATION_MS : INFO_TOAST_DURATION_MS);
  }, [opacity, hide, reduced]);

  const handleUndo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndoRef.current?.();
    hide();
  }, [hide]);

  // ── Позиція над таб-баром чи над дном Stack-скріну ──
  const bottom = isTab
    ? (Platform.OS === 'ios' ? 100 : 80)
    : 40;

  // DS v2: тост — інвертована pill-плашка (action.primary + text.onAction);
  // «Скасувати» — лайм на чорному, глибока лаванда на світлому.
  const c = {
    bg:     t.action.primary,
    text:   t.text.onAction,
    accent: isDark ? '#6D4CF5' : t.accent.lime,
  };

  const element: React.ReactElement = toastData ? (
    <Animated.View
      style={[st.container, { bottom, opacity }]}
      pointerEvents="box-none"
    >
      <View style={[st.card, { backgroundColor: c.bg }]}>
        <Text style={[st.message, { color: c.text }]} numberOfLines={1}>
          {toastData.message}
        </Text>
        {toastData.onUndo ? (
        <TouchableOpacity
          onPress={handleUndo}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={tr.undo}
        >
          <Text style={[st.undoBtn, { color: c.accent }]}>{tr.undo}</Text>
        </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  ) : <></>;

  return { show, element, visible: toastData !== null };
}

const st = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.pill,
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#111113',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  message: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
    flex: 1,
    marginRight: 12,
  },
  undoBtn: {
    fontSize: 14,
    fontFamily: fontFamily.semibold,
  },
});
