/**
 * components/training/TrainingBits.tsx — дрібні спільні блоки екранів
 * тренувань: картка, заголовок секції, чип, кнопка, поле, степер, порожній
 * стан, плашка-повідомлення, тло екрана. Стиль — Design System v2:
 * суцільні картки без рамок, pill-кнопки й чипи, тонкі табличні цифри.
 *
 * Мінімальна ціль дотику — 44×44 (A11Y-08 у CLAUDE.md): розмір задає сам
 * контрол, а не hitSlop.
 */
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
import { fontFamily, radius, shadow, space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

import { TG_ACCENT, TG_ERR, TG_WARN, TG_XP, type TrainingColors } from './theme';
import { MeshBackground } from '@/components/ds';
import { useGlassStyles } from '@/components/finance/finPalette';

/** Фон екрана — кольоровий mesh DS v2.1 (скло карток має що заломлювати). */
export function ScreenBackground({ c }: { c: TrainingColors }) {
  void c;
  return <MeshBackground />;
}

export function Card({ c, children, style, accent }: {
  c: TrainingColors;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: string;
}) {
  return (
    <View
      style={[
        styles.card,
        // Omni (DS v2.2): суцільна bento-картка (surface.card + м'яка тінь, без
        // рамки) — скло лишається функціональному шару (шапка, аркуші).
        { backgroundColor: c.t.surface.card, ...shadow[c.isDark ? 'dark' : 'light'].card },
        // Стан (виконано / увага) — тонована рамка акцентом + легка змивка.
        accent ? { borderWidth: 1, borderColor: accent + '66', borderTopColor: accent + '66', borderBottomColor: accent + '66' } : null,
        style,
      ]}>
      {accent ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: accent + '14', borderRadius: radius.cardCompact }]} /> : null}
      {children}
    </View>
  );
}

export function SectionTitle({ c, children, action }: {
  c: TrainingColors;
  children: React.ReactNode;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionRow}>
      {/* DS v2.1: крапка акценту модуля перед заголовком секції. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.g.accent.success.fill }} />
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: c.text }]}>{children}</Text>
      </View>
      {action && (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" style={styles.sectionAction}>
          <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>{action.label}</Text>
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
        // Активний чип — pill action.primary; color лишився в API для сумісності.
        { backgroundColor: active ? c.t.action.primary : c.chip },
      ]}>
      {icon && <IconSymbol name={icon} size={13} color={active ? c.t.text.onAction : (color !== TG_ACCENT ? color : c.sub)} />}
      <Text style={{ color: active ? c.t.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  const { t } = useDS();
  // Тон — лише тло; підпис завжди text.primary (бурштин/лайм не тримають текст).
  return (
    <View style={[styles.badge, { backgroundColor: color + '29' }]}>
      <Text style={{ color: t.text.primary, fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled, busy, color, icon, style, variant = 'solid', textColor }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  color?: string;
  icon?: IconSymbolName;
  style?: StyleProp<ViewStyle>;
  variant?: 'solid' | 'soft';
  /** Колір підпису для solid з власним тлом (напр. біла pill на темній картці). */
  textColor?: string;
}) {
  const { t } = useDS();
  const gs = useGlassStyles();
  const solid = variant === 'solid';
  // Без явного кольору — головна дія DS: pill action.primary / вторинна subtle.
  const tone = color ?? (solid ? t.action.primary : t.action.secondaryText);
  const fg = solid ? (textColor ?? (color ? '#fff' : t.text.onAction)) : tone;
  const bg = solid ? tone : color ? color + '18' : (gs.subtle.backgroundColor as string);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[
        styles.button,
        { backgroundColor: disabled ? t.state.disabledBg : bg },
        style,
      ]}>
      {busy
        ? <ActivityIndicator color={fg} />
        : (
          <>
            {icon && <IconSymbol name={icon} size={16} color={disabled ? t.state.disabledText : fg} />}
            <Text style={[type.label, { color: disabled ? t.state.disabledText : fg, fontSize: 15 }]}>{label}</Text>
          </>
        )}
    </TouchableOpacity>
  );
}

export function Field({ c, label, style,
  required,
  error,
  ...input }: TextInputProps & { c: TrainingColors; label: string;
  required?: boolean;
  error?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={[styles.fieldLabel, { color: c.sub }]}>{label}
        {required ? <Text style={{ color: TG_ERR }}> *</Text> : null}
      </Text>
      <TextInput
        placeholderTextColor={c.faint}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, { color: c.text, backgroundColor: c.input }, error ? { borderWidth: 1, borderColor: TG_ERR } : null]}
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
      <View style={[styles.stepperRow, { backgroundColor: c.input }]}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          style={styles.stepperBtn}>
          <IconSymbol name="minus" size={14} color={c.text} />
        </TouchableOpacity>
        <Text
          accessibilityLabel={`${label}: ${shown}`}
          style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], minWidth: 36, textAlign: 'center' }}>
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
      <View style={[styles.emptyIcon, { backgroundColor: c.accentTint }]}>
        <IconSymbol name={icon} size={26} color={c.accent} />
      </View>
      <Text style={[type.h2, { color: c.text, fontSize: 17, textAlign: 'center' }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[type.body, { color: c.sub, textAlign: 'center', marginTop: 6 }]}>
          {body}
        </Text>
      ) : null}
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
    <Card c={c} style={{ marginBottom: 12, backgroundColor: color + '14', ...(c.isDark ? null : { shadowOpacity: 0, elevation: 0 }) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityRole="alert">
        <IconSymbol name={tone === 'info' ? 'info.circle.fill' : 'exclamationmark.triangle.fill'} size={16} color={color} />
        <Text style={{ color: c.text, fontSize: 13, flex: 1 }}>{text}</Text>
        {onRetry && retryLabel ? (
          <TouchableOpacity onPress={onRetry} accessibilityRole="button" style={styles.noticeRetry}>
            <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>
              {retryLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </Card>
  );
}

export function ProgressBar({ c, fraction, color = TG_XP }: { c: TrainingColors; fraction: number; color?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.chip, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: radius.pill }} />
    </View>
  );
}

export function Avatar({ name, color = TG_ACCENT, size = 34 }: { name: string; color?: string; size?: number }) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '26', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontFamily: fontFamily.semibold, fontSize: size * 0.42 }}>
        {letter}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  sectionTitle: { ...type.h2 },
  sectionAction: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  button: {
    minHeight: 48, borderRadius: radius.pill, flexDirection: 'row', gap: 8,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20,
  },
  fieldLabel: { ...type.caption, fontFamily: fontFamily.medium, marginBottom: 6 },
  input: { minHeight: 44, borderRadius: radius.control, paddingHorizontal: 14, fontSize: 15, fontFamily: fontFamily.regular },
  stepper: { flex: 1, minWidth: 120 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radius.pill },
  stepperBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  noticeRetry: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
});
