/**
 * components/calendar/GoogleCalendarSheet.tsx — аркуш Google Calendar на
 * екрані календаря. Вміст — GoogleCalendarPanel (серверний OAuth, вибір
 * календарів, стан, синк, конфлікти, кошик, відключення); клієнтського
 * Client ID / PKCE більше немає.
 */
import { useAndroidBottomPad } from '@/hooks/use-android-nav-inset';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useSheetSurface } from '@/hooks/use-content-width';
import type { Meeting } from '@/utils/meetings';

import type { CalendarColors } from './palette';
import { GoogleCalendarPanel } from './GoogleCalendarPanel';
import type { GoogleCalendarSync } from './useGoogleCalendarSync';
import { radius } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';

export function GoogleCalendarSheet({ visible, onClose, gcal, isDark, c, trash, onRestoreLocal }: {
  visible: boolean;
  onClose: () => void;
  gcal: GoogleCalendarSync;
  isDark: boolean;
  c: CalendarColors;
  trash?: Meeting[];
  onRestoreLocal?: (meeting: Meeting) => void;
}) {
  const sheetSurface = useSheetSurface();
  const androidSheetPad = useAndroidBottomPad();
  const t = dsTokens(isDark);
  // Стеля — числом від висоти вікна, не відсотком (regression-e2 NAT-01).
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessible={false} style={[st.overlay, { backgroundColor: t.surface.overlay }]} onPress={onClose}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()} style={[st.sheetWrapper, androidSheetPad]} accessibilityViewIsModal importantForAccessibility="yes">
          <View style={[st.sheet, sheetSurface, { maxHeight: Math.round(height * 0.9), backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }]}>
            <OverlayMaterial isDark={isDark} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
              </View>
              <GoogleCalendarPanel gcal={gcal} isDark={isDark} trash={trash} onRestoreLocal={onRestoreLocal} />
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  sheet: { borderRadius: radius.card, padding: 20, overflow: 'hidden' },
});
