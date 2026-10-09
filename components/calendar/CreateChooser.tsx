/**
 * components/calendar/CreateChooser.tsx — «+» календаря: що створити.
 *
 * Два варіанти — «Зустріч» і «Завдання»; дата (і час, якщо тапнули годину
 * в сітці) вже підставлені з обраного дня/слота й видні в підзаголовку,
 * щоб людина бачила, КУДИ саме створює запис.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import type { Translations } from '@/store/translations';

import type { CalendarColors } from './palette';

export interface CreateChooserProps {
  visible: boolean;
  /** «Вівторок, 6 жовтня · 10:00» */
  subtitle: string;
  onClose: () => void;
  onMeeting: () => void;
  onTask: () => void;
  isDark: boolean;
  wide: boolean;
  c: CalendarColors;
  tr: Translations;
}

export function CreateChooser({ visible, subtitle, onClose, onMeeting, onTask, isDark, wide, c, tr }: CreateChooserProps) {
  const insets = useSafeAreaInsets();
  const option = (testID: string, icon: IconSymbolName, color: string, title: string, hint: string, onPress: () => void) => (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={[st.option, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={[st.icon, { backgroundColor: color + '1F' }]}>
        <IconSymbol name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{hint}</Text>
      </View>
      <IconSymbol name="chevron.right" size={13} color={c.sub} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={[st.overlay, wide ? st.overlayCenter : { justifyContent: 'flex-end', paddingBottom: insets.bottom + 12 }]}
        onPress={onClose}>
        <Pressable
          accessible={false}
          onPress={e => e.stopPropagation()}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={wide ? { width: 420 } : { marginHorizontal: 12 }}>
          <BlurView
            intensity={isDark ? 50 : 70}
            tint={isDark ? 'dark' : 'light'}
            style={[st.sheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(10,12,22,0.97)' : 'rgba(245,244,255,0.97)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{tr.calCreateTitle}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{subtitle}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
                style={[st.close, { backgroundColor: c.dim }]}>
                <IconSymbol name="xmark" size={14} color={c.sub} />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8 }}>
              {option('calendar-create-meeting', 'calendar.badge.plus', c.accent, tr.calCreateMeeting, tr.calCreateMeetingHint, onMeeting)}
              {option('calendar-create-task', 'checklist', '#7C3AED', tr.calCreateTask, tr.calCreateTaskHint, onTask)}
            </View>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  overlayCenter: { alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 16, overflow: 'hidden' },
  option: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: Atlas.radius.large, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
