/**
 * Аркуш модуля: SheetModal + скло DS v2.1 (surfaceStrong + <GlassBackdrop/>) зі стелею
 * висоти ЧИСЛОМ (useSheetSurface, NEW-01) і ScrollView всередині; кнопки дії —
 * pill у футері поза прокруткою.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, touchTarget, type as dsType } from '@/constants/theme';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';

import type { ContainersColors } from './theme';
import { GlassBackdrop } from '@/components/ds';

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
      <View style={[styles.sheet, surface, { ...c.gl.strong }, shadow[c.isDark ? 'dark' : 'light'].popover]}>
        <GlassBackdrop style={{ borderRadius: 24, overflow: 'hidden' }} />
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
      </View>
    </SheetModal>
  );
}

export function SheetButton({ label, onPress, c, primary, color, disabled, flex = 1 }: {
  label: string;
  onPress: () => void;
  c: ContainersColors;
  /** Головна дія — pill action.primary; без неї — вторинна (subtle) pill. */
  primary?: boolean;
  /** @deprecated Легасі: будь-який колір тепер означає головну дію (DS v2 — без кольорових заливок). */
  color?: string;
  disabled?: boolean;
  flex?: number;
}) {
  const isPrimary = !!primary || !!color;
  const bg = disabled ? (isPrimary ? c.t.state.disabledBg : c.dim) : isPrimary ? c.t.action.primary : (c.gl.subtle.backgroundColor as string);
  const fg = disabled ? c.t.state.disabledText : isPrimary ? c.t.text.onAction : c.t.action.secondaryText;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.btn, { flex, backgroundColor: bg }]}>
      <Text style={[dsType.label, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SheetLabel({ text, c,
  required = false,
}: { text: string; c: ContainersColors;
  required?: boolean;
}) {
  return (
    <Text style={[styles.label, { color: c.sub }]}>{text.toUpperCase()}
      {required ? <Text style={{ color: c.t.status.danger }}> *</Text> : null}
    </Text>
  );
}

export const sheetStyles = StyleSheet.create({
  input: { borderRadius: radius.control, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular, marginBottom: 2 },
});

const styles = StyleSheet.create({
  sheet: { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { flex: 1, fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold },
  close: { width: touchTarget, height: touchTarget, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  label: { fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
});
