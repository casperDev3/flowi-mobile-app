/**
 * components/calendar/RecordingModal.tsx — аудіозапис зустрічі.
 * Перенесено з app/meetings.tsx; стан запису (expo-av) лишається в екрані.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RecordingClock } from '@/components/shared/RecordingClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';

import type { CalendarColors } from './palette';
import { fontFamily, radius, shadow, type } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';

export function RecordingModal({ visible, isRecording, startedAt, onStart, onStop, onClose, isDark, c }: {
  visible: boolean;
  isRecording: boolean;
  startedAt: number | null;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
  isDark: boolean;
  c: CalendarColors;
}) {
  const { tr } = useI18n();
  const t = dsTokens(isDark);
  // DS v2: запис — coral (алерт/індикатор), годинник — display-цифри,
  // обидві дії — pill action.primary (coral-тло не тримає 4.5:1 з текстом),
  // «Стоп» вирізняє coral-іконка.
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent
      onRequestClose={() => { if (isRecording) onStop(); else onClose(); }}>
      <Pressable accessible={false} style={[st.overlay, { backgroundColor: t.surface.overlay }]} onPress={() => { if (!isRecording) onClose(); }}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()}
          accessibilityViewIsModal importantForAccessibility="yes"
          style={[st.card, { backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }, shadow[isDark ? 'dark' : 'light'].popover]}>
          <View style={[st.circle, { backgroundColor: isRecording ? t.accent.coral + '1F' : c.dim }]}>
            <IconSymbol name={isRecording ? 'stop.fill' : 'mic.fill'} size={32} color={isRecording ? t.accent.coral : c.sub} />
          </View>
          <Text style={[type.h2, { fontSize: 18, color: t.text.primary, marginBottom: 6 }]}>
            {isRecording ? tr.calRecRecording : tr.calRecAudio}
          </Text>
          <RecordingClock
            startedAt={startedAt}
            style={[type.displaySm, { color: isRecording ? t.accent.coral : t.text.primary, marginBottom: 24 }]}
          />
          {isRecording ? (
            <TouchableOpacity onPress={onStop} accessibilityRole="button" style={[st.btn, { backgroundColor: t.action.primary }]}>
              <IconSymbol name="stop.fill" size={16} color={t.accent.coral} />
              <Text style={[st.btnText, { color: t.text.onAction }]}>{tr.calRecStop}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onStart} accessibilityRole="button" style={[st.btn, { backgroundColor: t.action.primary }]}>
              <IconSymbol name="mic.fill" size={16} color={t.text.onAction} />
              <Text style={[st.btnText, { color: t.text.onAction }]}>{tr.calRecStart}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.card, padding: 28, alignItems: 'center', width: 300 },
  circle: { width: 80, height: 80, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  btn: { borderRadius: radius.pill, minHeight: 48, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 15, fontFamily: fontFamily.semibold },
});
