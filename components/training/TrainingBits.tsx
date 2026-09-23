/**
 * components/training/TrainingBits.tsx — дрібні спільні блоки екранів
 * тренувань: картка (BlurView), заголовок секції, чип, кнопка, поле,
 * степер, порожній стан, плашка-повідомлення, тло екрана.
 *
 * Мінімальна ціль дотику — 44×44 (A11Y-08 у CLAUDE.md): розмір задає сам
 * контрол, а не hitSlop.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';

import { TG_ACCENT, TG_ERR, TG_WARN, type TrainingColors } from './theme';

export function ScreenBackground({ c }: { c: TrainingColors }) {
  return <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />;
}

export function Card({ c, children, style, accent }: {
  c: TrainingColors;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
}) {
  return (
    <BlurView
      intensity={c.isDark ? 22 : 42}
      tint={c.blurTint}
      style={[styles.card, { borderColor: accent ? accent + '55' : c.border }, style]}>
      {children}
    </BlurView>
  );
}

export function SectionTitle({ c, children, action }: {
  c: TrainingColors;
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionRow}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.sub }]}>{children}</Text>
      {action && (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" style={styles.sectionAction}>
          <Text style={{ color: TG_ACCENT, fontSize: 13, fontWeight: '700' }}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function Chip({ c, label, active, onPress, color = TG_ACCENT, icon, accessibilityLabel }: {
  c: TrainingColors;
  label: string;
  active?: boolean;
  onPress?: () => void;
  color?: string;
  icon?: IconSymbolName;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={onPress ? { selected: !!active } : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[
        styles.chip,
        { backgroundColor: active ? color + '22' : c.chip, borderColor: active ? color + '88' : c.border },
      ]}>
      {icon && <IconSymbol name={icon} size={13} color={active ? color : c.sub} />}
      <Text style={{ color: active ? color : c.sub, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, busy, color = TG_ACCENT, icon, style, variant = 'solid' }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  color?: string;
  icon?: IconSymbolName;
  style?: StyleProp<ViewStyle>;
  variant?: 'solid' | 'soft';
}) {
  const solid = variant === 'solid';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[
        styles.button,
        {
          backgroundColor: solid ? color : color + '18',
          borderColor: solid ? color : color + '55',
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}>
      {busy
        ? <ActivityIndicator color={solid ? '#fff' : color} />
        : (
          <>
            {icon && <IconSymbol name={icon} size={16} color={solid ? '#fff' : color} />}
            <Text style={{ color: solid ? '#fff' : color, fontSize: 15, fontWeight: '800' }}>{label}</Text>
          </>
        )}
    </TouchableOpacity>
  );
}

export function Field({ c, label, style, ...input }: TextInputProps & { c: TrainingColors; label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={[styles.fieldLabel, { color: c.sub }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, { color: c.text, backgroundColor: c.input, borderColor: c.border }]}
      />
    </View>
  );
}

export function Stepper({ c, label, value, onChange, min = 0, max = 999, step = 1, format }: {
  c: TrainingColors;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const shown = format ? format(value) : String(value);
  return (
    <View style={styles.stepper}>
      <Text style={[styles.fieldLabel, { color: c.sub, marginBottom: 6 }]} numberOfLines={1}>{label}</Text>
      <View style={[styles.stepperRow, { backgroundColor: c.input, borderColor: c.border }]}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          style={styles.stepperBtn}>
          <IconSymbol name="minus" size={14} color={c.text} />
        </TouchableOpacity>
        <Text
          accessibilityLabel={`${label}: ${shown}`}
          style={{ color: c.text, fontSize: 15, fontWeight: '800', minWidth: 36, textAlign: 'center' }}>
          {shown}
        </Text>
        <TouchableOpacity
          onPress={() => onChange(Math.min(max, value + step))}
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          style={styles.stepperBtn}>
          <IconSymbol name="plus" size={14} color={c.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function EmptyState({ c, icon, title, body, action }: {
  c: TrainingColors;
  icon: IconSymbolName;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: TG_ACCENT + '18' }]}>
        <IconSymbol name={icon} size={26} color={TG_ACCENT} />
      </View>
      <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center', marginTop: 6 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ c, text, tone = 'warn', onRetry, retryLabel }: {
  c: TrainingColors;
  text: string;
  tone?: 'warn' | 'error' | 'info';
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const color = tone === 'error' ? TG_ERR : tone === 'info' ? TG_ACCENT : TG_WARN;
  return (
    <Card c={c} accent={color} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="alert">
        <IconSymbol name={tone === 'info' ? 'info.circle.fill' : 'exclamationmark.triangle.fill'} size={16} color={color} />
        <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{text}</Text>
        {onRetry && retryLabel ? (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={styles.noticeRetry}>
            <Text style={{ color, fontSize: 13, fontWeight: '800' }}>{retryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );
}

export function ProgressBar({ c, fraction, color = TG_ACCENT }: { c: TrainingColors; fraction: number; color?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 8, borderRadius: 4, backgroundColor: c.chip, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 4 }} />
    </View>
  );
}

export function Avatar({ name, color = TG_ACCENT, size = 34 }: { name: string; color?: string; size?: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontWeight: '800', fontSize: size * 0.42 }}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 14 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionAction: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1,
  },
  badge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  button: {
    minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  stepper: { flex: 1, minWidth: 120 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1 },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  noticeRetry: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
