/**
 * components/training/TrainingSheet.tsx — аркуш-форма модуля тренувань.
 *
 * SheetModal + BlurView зі стелею висоти ЧИСЛОМ (useSheetSurface, NEW-01:
 * відсоток без прокрутки ховав кнопку «Зберегти») і ScrollView всередині.
 * Кнопки дії — у футері поза прокруткою, щоб завжди були видимі.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { useSheetSurface } from '@/hooks/use-content-width';

import type { TrainingColors } from './theme';

export function TrainingSheet({ visible, onClose, c, title, children, footer }: {
  visible: boolean;
  onClose: () => void;
  c: TrainingColors;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const surface = useSheetSurface();
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <BlurView
        intensity={c.isDark ? 50 : 70}
        tint={c.blurTint}
        style={[styles.sheet, surface, { borderColor: c.border, backgroundColor: c.isDark ? 'rgba(20,18,30,0.86)' : 'rgba(250,249,255,0.9)' }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </BlurView>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: { borderRadius: 24, borderWidth: 1, padding: 18, overflow: 'hidden' },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
