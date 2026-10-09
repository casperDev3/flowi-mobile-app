/**
 * components/calendar/RecordingModal.tsx — аудіозапис зустрічі.
 * Перенесено з app/meetings.tsx; стан запису (expo-av) лишається в екрані.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RecordingClock } from '@/components/shared/RecordingClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { useI18n } from '@/store/i18n';

import type { CalendarColors } from './palette';

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
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent
      onRequestClose={() => { if (isRecording) onStop(); else onClose(); }}>
      <Pressable accessible={false} style={st.overlay} onPress={() => { if (!isRecording) onClose(); }}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()}
          accessibilityViewIsModal importantForAccessibility="yes"
          style={[st.card, { backgroundColor: isDark ? '#12121E' : '#FFFFFF' }]}>
          <View style={[st.circle, { backgroundColor: isRecording ? '#EF4444' + '20' : c.dim, borderColor: isRecording ? '#EF4444' : c.border }]}>
            <IconSymbol name={isRecording ? 'stop.fill' : 'mic.fill'} size={32} color={isRecording ? '#EF4444' : c.sub} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#000', marginBottom: 6 }}>
            {isRecording ? tr.calRecRecording : tr.calRecAudio}
          </Text>
          <RecordingClock
            startedAt={startedAt}
            style={{ fontSize: 28, fontWeight: Atlas.type.headingWeight, color: isRecording ? '#EF4444' : c.accent,
              letterSpacing: 2, marginBottom: 24, fontVariant: ['tabular-nums'] }}
          />
          {isRecording ? (
            <TouchableOpacity onPress={onStop} accessibilityRole="button" style={[st.btn, { backgroundColor: '#EF4444' }]}>
              <IconSymbol name="stop.fill" size={16} color="#fff" />
              <Text style={st.btnText}>{tr.calRecStop}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onStart} accessibilityRole="button" style={[st.btn, { backgroundColor: c.accent }]}>
              <IconSymbol name="mic.fill" size={16} color="#fff" />
              <Text style={st.btnText}>{tr.calRecStart}</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' },
  card: { borderRadius: Atlas.radius.xlarge, padding: 28, alignItems: 'center', width: 280, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20 },
  circle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 2 },
  btn: { borderRadius: Atlas.radius.large, paddingVertical: 14, paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
