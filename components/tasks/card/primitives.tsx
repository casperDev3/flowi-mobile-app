import { Atlas } from '@/constants/atlas';
/**
 * components/tasks/card/primitives.tsx — цеглинки картки завдання.
 *
 * Картка завдання (особистого й проєктного — одна) складається з рядків
 * властивостей «іконка · підпис · значення ›». Рядок нічого не редагує сам:
 * натискання відкриває аркуш (PropertySheet) з вибором — списком, календарем,
 * степпером. Так поле завжди займає рівно один рядок, а не розсип чипів, і
 * некритичні поля не витісняють головне за межу екрана.
 *
 * Той самий тригер уміє бути й чипом (`variant="chip"`) — для короткої форми
 * створення, де поруч стоять лише дедлайн, пріоритет і проєкт.
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';

export interface CardColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
  sheet: string;
}

export type TriggerVariant = 'row' | 'chip';

/**
 * Висота картки завдання-аркуша на телефоні — частка вікна (P2: стала
 * висота, щоб лист не стрибав між вкладками). Та сама для особистої й
 * проєктної картки.
 */
export const TASK_CARD_SHEET_RATIO = 0.85;

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

// ─── Група рядків ────────────────────────────────────────────────────────────

/** Обрамлення кількох рядків в одну «плитку» з тонкими роздільниками. */
export function PropertyGroup({ title, children, colors: c }: {
  title?: string;
  children: React.ReactNode;
  colors: Pick<CardColors, 'sub' | 'border' | 'dim'>;
}) {
  // null/false-діти (умовні поля) не мають давати порожніх роздільників.
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <View style={st.groupWrap}>
      {title ? <Text style={[st.groupTitle, { color: c.sub }]}>{title}</Text> : null}
      <View style={[st.group, { borderColor: c.border, backgroundColor: c.dim }]}>
        {items.map((child, i) => (
          <View key={i} style={i > 0 ? [st.sep, { borderTopColor: c.border }] : undefined}>{child}</View>
        ))}
      </View>
    </View>
  );
}

// ─── Тригер: рядок або чип ───────────────────────────────────────────────────

export interface FieldTriggerProps {
  variant?: TriggerVariant;
  icon: IconSymbolName;
  label: string;
  /** Підпис значення. Порожній — показуємо `placeholder` приглушено. */
  value?: string | null;
  placeholder?: string;
  /** Колір значення (напр. колір проєкту чи пріоритету). */
  valueColor?: string;
  /** Крапка перед значенням (колір проєкту/статусу). */
  dotColor?: string;
  /** Відсутній — рядок лише для читання (без шеврона й без натискання). */
  onPress?: () => void;
  colors: CardColors;
  /** Акцент (прострочений дедлайн тощо). */
  tone?: 'normal' | 'danger';
}

export function FieldTrigger({
  variant = 'row', icon, label, value, placeholder, valueColor, dotColor, onPress, colors: c, tone = 'normal',
}: FieldTriggerProps) {
  const empty = !value;
  const shown = value || placeholder || '';
  const danger = tone === 'danger';
  const valueTint = danger ? '#EF4444' : empty ? c.sub : (valueColor ?? c.text);

  if (variant === 'chip') {
    const on = !empty;
    const tint = danger ? '#EF4444' : on ? (valueColor ?? c.accent) : c.sub;
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        style={[st.chip, {
          borderColor: on ? tint + '66' : c.border,
          backgroundColor: on ? tint + '18' : c.dim,
        }]}>
        {dotColor ? <View style={[st.dot, { backgroundColor: dotColor }]} /> : <IconSymbol name={icon} size={13} color={tint} />}
        <Text numberOfLines={1} style={{ color: on ? tint : c.sub, fontSize: 13, fontWeight: '600', maxWidth: 150 }}>
          {on ? value : label}
        </Text>
      </TouchableOpacity>
    );
  }

  const content = (
    <>
      <View style={[st.iconBox, { backgroundColor: c.border }]}>
        <IconSymbol name={icon} size={14} color={danger ? '#EF4444' : c.sub} />
      </View>
      <Text numberOfLines={1} style={[st.rowLabel, { color: c.sub }]}>{label}</Text>
      <View style={st.valueBox}>
        {dotColor && !empty ? <View style={[st.dot, { backgroundColor: dotColor }]} /> : null}
        <Text numberOfLines={1} style={[st.rowValue, { color: valueTint, fontWeight: empty ? '500' : '600' }]}>
          {shown}
        </Text>
      </View>
      {onPress ? <IconSymbol name="chevron.right" size={13} color={c.sub} /> : <View style={{ width: 13 }} />}
    </>
  );

  if (!onPress) {
    return (
      <View style={st.row} accessible accessibilityLabel={`${label}: ${shown}`}>
        {content}
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${shown}`}
      style={st.row}>
      {content}
    </TouchableOpacity>
  );
}

/** Рядок-перемикач («Потрібна перевірка», «Заблоковано»). Весь рядок — ціль дотику. */
export function ToggleRow({ icon, label, value, onChange, disabled, colors: c }: {
  icon: IconSymbolName;
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  colors: CardColors;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[st.row, disabled && { opacity: 0.6 }]}>
      <View style={[st.iconBox, { backgroundColor: c.border }]}>
        <IconSymbol name={icon} size={14} color={value ? c.accent : c.sub} />
      </View>
      <Text numberOfLines={1} style={[st.rowLabel, { color: c.text, flex: 1, maxWidth: undefined }]}>{label}</Text>
      <View style={[st.track, { backgroundColor: value ? c.accent : c.border }]}>
        <View style={[st.knob, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Аркуш вибору ────────────────────────────────────────────────────────────

/**
 * Аркуш з вибором для одного поля. На телефоні — знизу, на широкому вікні —
 * діалог по центру: аркуш на всю ширину планшета дав би рядки завдовжки з екран.
 *
 * Свій Modal (як і PickerField): у деталі на телефоні він відкривається поверх
 * модального листа деталі — цей шлях уже перевірений у застосунку.
 */
export function PropertySheet({ visible, title, onClose, children, colors: c, isDark, footer }: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Липкий низ (кнопки «Очистити/Готово»), поза прокруткою. */
  footer?: React.ReactNode;
  colors: CardColors;
  isDark: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { isWide, height } = useResponsive();
  const { tr } = useI18n();
  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[st.overlay, isWide && st.overlayWide]}>
          <Pressable
            accessible={false}
            style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.28)' }]}
            onPress={onClose}
          />
          <View
            accessibilityViewIsModal
            style={[
              st.sheet,
              { backgroundColor: c.sheet, borderColor: c.border, maxHeight: height * (isWide ? 0.8 : 0.86) },
              isWide
                ? st.sheetWide
                : { paddingBottom: Math.max(insets.bottom, 12) + 4 },
            ]}>
            {!isWide ? <View style={[st.handle, { backgroundColor: c.border }]} /> : null}
            <View style={st.sheetHead}>
              <Text accessibilityRole="header" style={[st.sheetTitle, { color: c.text }]} numberOfLines={1}>{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={HIT} accessibilityRole="button" accessibilityLabel={tr.close} style={st.closeBtn}>
                <IconSymbol name="xmark" size={16} color={c.sub} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
              {children}
            </ScrollView>
            {footer ? <View style={st.footer}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Рядок варіанта в аркуші — 48pt, галочка на обраному (не лише колір). */
export function OptionRow({ label, active, onPress, color, icon, colors: c, sub }: {
  label: string;
  active: boolean;
  onPress: () => void;
  color?: string;
  icon?: IconSymbolName;
  /** Другий рядок підпису (дати спринту, пошта учасника). */
  sub?: string;
  colors: CardColors;
}) {
  const tint = color ?? c.accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[st.option, { borderColor: active ? tint : c.border, backgroundColor: active ? tint + '14' : 'transparent' }]}>
      {icon
        ? <IconSymbol name={icon} size={15} color={active ? tint : c.sub} />
        : color ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: active ? tint : c.text }}>{label}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 12, color: c.sub, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      {active ? <IconSymbol name="checkmark" size={14} color={tint} /> : null}
    </TouchableOpacity>
  );
}

/** Пара кнопок унизу аркуша: другорядна ліворуч, основна праворуч. */
export function SheetButtons({ secondary, primary, colors: c }: {
  secondary?: { label: string; onPress: () => void; destructive?: boolean };
  primary?: { label: string; onPress: () => void; disabled?: boolean };
  colors: CardColors;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {secondary ? (
        <TouchableOpacity
          onPress={secondary.onPress}
          accessibilityRole="button"
          style={[st.btn, { flex: 1, backgroundColor: secondary.destructive ? 'rgba(239,68,68,0.1)' : c.dim }]}>
          <Text style={{ color: secondary.destructive ? '#EF4444' : c.sub, fontWeight: '600' }}>{secondary.label}</Text>
        </TouchableOpacity>
      ) : null}
      {primary ? (
        <TouchableOpacity
          onPress={primary.onPress}
          disabled={primary.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!primary.disabled }}
          style={[st.btn, { flex: 2, backgroundColor: c.accent, opacity: primary.disabled ? 0.5 : 1 }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{primary.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Заголовок секції всередині вкладки («Таймер», «Історія»). */
export function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return <Text accessibilityRole="header" style={[st.groupTitle, { color, marginTop: 18 }]}>{children}</Text>;
}

export const cardStyles = StyleSheet.create({
  btn: { minHeight: Atlas.controlHeight, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 12, borderRadius: Atlas.radius.medium, borderWidth: 1, gap: 6 },
});

const st = StyleSheet.create({
  groupWrap:  { marginTop: 14 },
  groupTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7, marginLeft: 2 },
  group:      { borderRadius: Atlas.radius.large, borderWidth: 1, overflow: 'hidden' },
  sep:        { borderTopWidth: StyleSheet.hairlineWidth },
  row:        { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 12, gap: 10 },
  iconBox:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: 14, fontWeight: '500', flexShrink: 0, maxWidth: '45%' },
  valueBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  rowValue:   { fontSize: 14, textAlign: 'right', flexShrink: 1 },
  dot:        { width: 9, height: 9, borderRadius: 5 },
  track:      { width: 40, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  knob:       { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  chip:     { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 12, borderRadius: Atlas.radius.medium, borderWidth: 1, gap: 6 },
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  overlayWide:{ justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:      { borderTopLeftRadius: Atlas.radius.xlarge, borderTopRightRadius: Atlas.radius.xlarge, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
  sheetWide:  { width: '100%', maxWidth: 460, borderRadius: Atlas.radius.xlarge, paddingBottom: 16, paddingTop: 16 },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetHead:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12, minHeight: 32 },
  sheetTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  closeBtn:   { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  option:     { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: Atlas.radius.medium, borderWidth: 1, paddingHorizontal: 13, gap: 10, marginBottom: 7 },
  footer:     { paddingTop: 12 },
  btn:        { minHeight: Atlas.controlHeight, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 14 },
});
