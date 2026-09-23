/**
 * Аркуш модуля: SheetModal + BlurView зі стелею висоти ЧИСЛОМ (useSheetSurface,
 * NEW-01) і ScrollView всередині; кнопки дії — у футері поза прокруткою.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';

import type { ContainersColors } from './theme';

export function ContainersSheet({ visible, onClose, c, title, children, footer }: {
  visible: boolean;
  onClose: () => void;
  c: ContainersColors;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const surface = useSheetSurface();
  const { tr } = useI18n();
  return (
    <SheetModal visible={visible} onClose={onClose}>
      <BlurView intensity={c.isDark ? 55 : 75} tint={c.isDark ? 'dark' : 'light'}
        style={[styles.sheet, surface, { borderColor: c.border, backgroundColor: c.sheet }]}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[styles.title, { color: c.text }]} numberOfLines={2}>{title}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
            style={[styles.close, { backgroundColor: c.dim }]}>
            <IconSymbol name="xmark" size={15} color={c.sub} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </BlurView>
    </SheetModal>
  );
}

export function SheetButton({ label, onPress, c, color, disabled, flex = 1 }: {
  label: string;
  onPress: () => void;
  c: ContainersColors;
  /** Заливка головної дії; без неї — нейтральна кнопка. */
  color?: string;
  disabled?: boolean;
  flex?: number;
}) {
  const filled = !!color && !disabled;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.btn, { flex, backgroundColor: filled ? color : c.dim }]}>
      <Text style={{ color: filled ? '#fff' : c.sub, fontWeight: filled ? '700' : '600' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SheetLabel({ text, c }: { text: string; c: ContainersColors }) {
  return <Text style={[styles.label, { color: c.sub }]}>{text.toUpperCase()}</Text>;
}

export const sheetStyles = StyleSheet.create({
  input: { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500', marginBottom: 2 },
});

const styles = StyleSheet.create({
  sheet: { borderRadius: 24, borderWidth: 1, padding: 18, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { flex: 1, fontSize: 19, fontWeight: '800' },
  close: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  label: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
});
