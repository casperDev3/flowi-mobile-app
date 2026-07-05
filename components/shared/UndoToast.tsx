/**
 * components/shared/UndoToast.tsx
 *
 * Легкий тост-знизу з кнопкою «Скасувати».
 * Авто-зникнення через 4 с. Поява/зникнення через Animated.timing opacity + translateY.
 *
 * API:
 *   const { show: showUndo, element: undoElement } = useUndoToast(isTab);
 *   showUndo('Завдання виконано', () => { ... });
 *   // У JSX: <View style={{ flex: 1 }}>{undoElement}</View>
 */

import { BlurView } from 'expo-blur';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';

// ─── Тривалість показу ───────────────────────────────────────────────────────
const TOAST_DURATION_MS = 4000;
const ANIM_DURATION_MS = 200;

interface ToastData {
  message: string;
  onUndo: () => void;
}

interface UndoToastApi {
  show: (message: string, onUndo: () => void) => void;
  element: React.ReactElement;
}

/**
 * @param isTab - true якщо екран є вкладкою (таб-бар знизу); false для Stack-скрінів.
 */
export function useUndoToast(isTab = true): UndoToastApi {
  const { tr } = useI18n();
  const isDark = useColorScheme() === 'dark';

  const [toastData, setToastData] = useState<ToastData | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUndoRef = useRef<(() => void) | null>(null);

  // Очищення при unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: ANIM_DURATION_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 20, duration: ANIM_DURATION_MS, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setToastData(null);
    });
  }, [opacity, translateY]);

  const show = useCallback((message: string, onUndo: () => void) => {
    // Скидаємо попередній таймер
    if (timerRef.current) clearTimeout(timerRef.current);

    onUndoRef.current = onUndo;

    // Оновлюємо дані та показуємо анімацію
    setToastData({ message, onUndo });
    opacity.setValue(0);
    translateY.setValue(20);

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: ANIM_DURATION_MS, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: ANIM_DURATION_MS, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(hide, TOAST_DURATION_MS);
  }, [opacity, translateY, hide]);

  const handleUndo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onUndoRef.current?.();
    hide();
  }, [hide]);

  // ── Позиція над таб-баром чи над дном Stack-скріну ──
  const bottom = isTab
    ? (Platform.OS === 'ios' ? 100 : 80)
    : 40;

  const c = {
    border: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    accent: '#7C3AED',
  };

  const element: React.ReactElement = toastData ? (
    <Animated.View
      style={[st.container, { bottom, opacity, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={isDark ? 45 : 65}
        tint={isDark ? 'dark' : 'light'}
        style={[st.card, { borderColor: c.border }]}
      >
        <Text style={[st.message, { color: c.text }]} numberOfLines={1}>
          {toastData.message}
        </Text>
        <TouchableOpacity
          onPress={handleUndo}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={tr.undo}
        >
          <Text style={[st.undoBtn, { color: c.accent }]}>{tr.undo}</Text>
        </TouchableOpacity>
      </BlurView>
    </Animated.View>
  ) : <></>;

  return { show, element };
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
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  undoBtn: {
    fontSize: 14,
    fontWeight: '700',
  },
});
