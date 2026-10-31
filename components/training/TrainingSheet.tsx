/**
 * components/training/TrainingSheet.tsx — аркуш-форма модуля тренувань.
 *
 * SheetModal + скло DS v2.1 (surfaceStrong + <GlassBackdrop/>) зі стелею висоти ЧИСЛОМ (useSheetSurface, NEW-01:
 * відсоток без прокрутки ховав кнопку «Зберегти») і ScrollView всередині.
 * Кнопки дії — у футері поза прокруткою, щоб завжди були видимі.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { radius, shadow, type } from '@/constants/theme';
import { useSheetSurface } from '@/hooks/use-content-width';

import type { TrainingColors } from './theme';
import { GlassBackdrop } from '@/components/ds';

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
      <View
        style={[styles.sheet, surface, { ...c.gl.strong, ...shadow[c.isDark ? 'dark' : 'light'].popover }]}>
        <GlassBackdrop style={{ borderRadius: radius.card, overflow: 'hidden' }} />
        <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>{title}</Text>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: { borderRadius: radius.card, padding: 24 },
  title: { ...type.h2, fontSize: 20, lineHeight: 26, marginBottom: 16 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
