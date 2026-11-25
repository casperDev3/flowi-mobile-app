/**
 * components/shared/ActionMenuHost.tsx — глобальний хост Android-меню дій
 * (utils/actionMenu.ts). Монтується один раз у app/_layout.tsx.
 *
 * Показує RN `Modal` (прозорий, fade) зі списком кнопок, коли
 * `showActionMenu` отримав більше 3 кнопок на Android (системний `Alert`
 * там обрізає решту). Апаратна «Назад» і тап по затемненню закривають меню
 * як «Скасувати». `onPress` кнопки викликається ПІСЛЯ закриття Modal
 * (ACTION_MENU_PRESS_DELAY_MS) — NEW-02: наступний аркуш не відкривається,
 * поки цей ще змонтований.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverlayScrim, OverlaySurface } from '@/components/ds/OverlaySurface';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import {
  ACTION_MENU_PRESS_DELAY_MS,
  type ActionMenuButton,
  type ActionMenuRequest,
  orderMenuButtons,
  registerActionMenuHost,
} from '@/utils/actionMenu';

export function ActionMenuHost() {
  const { t } = useDSTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const { isWide } = useResponsive();
  const [request, setRequest] = useState<ActionMenuRequest | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => registerActionMenuHost(next => {
    setRequest(next);
    setVisible(true);
  }), []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const close = useCallback((button?: ActionMenuButton) => {
    setVisible(false);
    const onPress = button?.onPress;
    if (!onPress) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      onPress();
    }, ACTION_MENU_PRESS_DELAY_MS);
  }, []);

  /** Back / тап поза меню — як кнопка «cancel» (її onPress, якщо є). */
  const dismiss = useCallback(() => {
    close(request?.buttons.find(b => b.style === 'cancel'));
  }, [close, request]);

  if (!request) return null;
  const buttons = orderMenuButtons(request.buttons);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
      onDismiss={() => setRequest(null)}
    >
      <View style={st.root}>
        <OverlayScrim onPress={dismiss} accessibilityLabel={buttons.find(b => b.style === 'cancel')?.text} />
        <View style={[st.column, sheetColumnStyle(isWide), { paddingBottom: insets.bottom + 12, maxHeight: Math.round(winH * 0.85) }]}>
          <OverlaySurface style={st.card}>
            <ScrollView bounces={false} contentContainerStyle={st.list}>
              <View style={st.header}>
                <Text style={[st.title, { color: t.text.primary }]} accessibilityRole="header">{request.title}</Text>
                {request.message ? (
                  <Text style={[st.message, { color: t.text.secondary }]}>{request.message}</Text>
                ) : null}
              </View>
              {buttons.map((button, i) => {
                const color = button.style === 'destructive' ? t.status.danger : t.text.primary;
                const isCancel = button.style === 'cancel';
                return (
                  <Pressable
                    key={`${i}:${button.text ?? ''}`}
                    accessibilityRole="button"
                    onPress={() => close(button)}
                    android_ripple={{ color: t.border.hairline }}
                    style={[st.row, { borderTopColor: t.border.hairline }]}
                  >
                    <Text style={[st.rowText, { color }, isCancel && st.cancelText]} numberOfLines={2}>
                      {button.text}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </OverlaySurface>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  // NAT-01: стеля — числом від вікна (відсоток від auto-батька не обмежує).
  column: { width: '100%', paddingHorizontal: 12 },
  card: { flexShrink: 1 },
  list: { paddingBottom: 4 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 4 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center' },
  row: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { fontSize: 16, textAlign: 'center' },
  cancelText: { fontWeight: '600' },
});
