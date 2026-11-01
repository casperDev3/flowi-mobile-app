/**
 * components/calendar/CreateChooser.tsx — «+» календаря: що створити.
 *
 * Два варіанти — «Зустріч» і «Завдання»; дата (і час, якщо тапнули годину
 * в сітці) вже підставлені з обраного дня/слота й видні в підзаголовку,
 * щоб людина бачила, КУДИ саме створює запис.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

import { PERSONAL_TASK_COLOR, type CalendarColors } from './palette';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassRimFor } from '@/components/shared/dsTheme';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';

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
      style={[st.option, { backgroundColor: c.dim }]}>
      <View style={[st.icon, { backgroundColor: color + '1F' }]}>
        <IconSymbol name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{title}</Text>
        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, marginTop: 2 }}>{hint}</Text>
      </View>
      <IconSymbol name="chevron.right" size={12} color={c.sub} />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={[st.overlay, { backgroundColor: dsTokens(isDark).surface.overlay }, wide ? st.overlayCenter : { justifyContent: 'flex-end', paddingBottom: insets.bottom + 12 }]}
        onPress={onClose}>
        <Pressable
          accessible={false}
          onPress={e => e.stopPropagation()}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={wide ? { width: 420 } : { marginHorizontal: 12 }}>
          {/* DS v2: непрозорий surface.elevated замість блюру — frosted лише для promo/AI. */}
          <View style={[st.sheet, { backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }, shadow[isDark ? 'dark' : 'light'].popover]}>
            <OverlayMaterial isDark={isDark} radius={radius.card} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold }}>{tr.calCreateTitle}</Text>
                <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2 }}>{subtitle}</Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
                style={[st.close, { backgroundColor: c.dim }]}>
                <IconSymbol name="xmark" size={14} color={c.sub} />
              </TouchableOpacity>
            </View>
            <View style={{ gap: 8 }}>
              {option('calendar-create-meeting', 'calendar.badge.plus', c.accent, tr.calCreateMeeting, tr.calCreateMeetingHint, onMeeting)}
              {option('calendar-create-task', 'checklist', PERSONAL_TASK_COLOR, tr.calCreateTask, tr.calCreateTaskHint, onTask)}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1 },
  overlayCenter: { alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: radius.card, padding: 20 },
  option: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.nested, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  close: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
