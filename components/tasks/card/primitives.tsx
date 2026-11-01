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
 *
 * DS v2: група — вкладений блок (subtle, радіус 16) без рамки; чипи й кнопки —
 * pill; вибраний чип / головна кнопка — action.primary + text.onAction.
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
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { Atlas } from '@/constants/atlas';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { glassOf, glassRim, glassRimFor } from '@/components/shared/dsTheme';

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
      <View style={[st.group, { backgroundColor: c.dim }]}>
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
  const { t } = useDS();
  const valueTint = danger ? t.status.danger : empty ? c.sub : (valueColor ?? c.text);

  if (variant === 'chip') {
    const on = !empty;
    // Заповнений чип — pill action.primary; прострочений — coral-тінт.
    const fg = danger ? t.text.primary : on ? t.text.onAction : c.sub;
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        style={[st.chip, {
          borderColor: danger ? t.accent.coral : 'transparent',
          backgroundColor: danger ? t.accent.coral + '1F' : on ? t.action.primary : c.dim,
        }]}>
        {dotColor ? <View style={[st.dot, { backgroundColor: dotColor }]} /> : <IconSymbol name={icon} size={13} color={danger ? t.accent.coral : fg} />}
        <Text numberOfLines={1} style={{ color: fg, fontSize: 13, fontFamily: fontFamily.semibold, maxWidth: 150 }}>
          {on ? value : label}
        </Text>
      </TouchableOpacity>
    );
  }

  const content = (
    <>
      <View style={[st.iconBox, { backgroundColor: glassOf(t).surface, ...glassRim(t, 'card') }]}>
        <IconSymbol name={icon} size={14} color={danger ? t.status.danger : c.sub} />
      </View>
      <Text numberOfLines={1} style={[st.rowLabel, { color: c.sub }]}>{label}</Text>
      <View style={st.valueBox}>
        {dotColor && !empty ? <View style={[st.dot, { backgroundColor: dotColor }]} /> : null}
        <Text numberOfLines={1} style={[st.rowValue, { color: valueTint, fontFamily: empty ? fontFamily.medium : fontFamily.semibold }]}>
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
  const { t } = useDS();
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[st.row, disabled && { opacity: 0.6 }]}>
      <View style={[st.iconBox, { backgroundColor: glassOf(t).surface, ...glassRim(t, 'card') }]}>
        <IconSymbol name={icon} size={14} color={value ? c.text : c.sub} />
      </View>
      <Text numberOfLines={1} style={[st.rowLabel, { color: c.text, flex: 1, maxWidth: undefined }]}>{label}</Text>
      <View style={[st.track, { backgroundColor: value ? t.action.primary : t.text.muted }]}>
        <View style={[st.knob, { backgroundColor: value ? t.text.onAction : '#FFFFFF', alignSelf: value ? 'flex-end' : 'flex-start' }]} />
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
export function PropertySheet({ visible, title, onClose, children, colors: c, footer, isDark }: {
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
  const { t } = useDS();
  return (
    <Modal visible={visible} transparent animationType={isWide ? 'fade' : 'slide'} statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={[st.overlay, isWide && st.overlayWide]}>
          <Pressable
            accessible={false}
            style={[StyleSheet.absoluteFill, { backgroundColor: t.surface.overlay }]}
            onPress={onClose}
          />
          <View
            accessibilityViewIsModal
            style={[
              st.sheet,
              { backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong'), maxHeight: height * (isWide ? 0.8 : 0.86) },
              isWide
                ? st.sheetWide
                : { paddingBottom: Math.max(insets.bottom, 12) + 4 },
            ]}>
            <OverlayMaterial isDark={isDark} radius={isWide ? radius.card : { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }} />
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
  const tint = color ?? c.text;
  const { t } = useDS();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[st.option, { borderColor: active ? t.action.primary : 'transparent', backgroundColor: active ? glassOf(t).surface : c.dim }]}>
      {icon
        ? <IconSymbol name={icon} size={15} color={active ? tint : c.sub} />
        : color ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: active ? fontFamily.semibold : fontFamily.medium, color: c.text }}>{label}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: fontFamily.regular, color: c.sub, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      {active ? <IconSymbol name="checkmark" size={14} color={c.text} /> : null}
    </TouchableOpacity>
  );
}

/** Пара кнопок унизу аркуша: другорядна ліворуч, основна праворуч. */
export function SheetButtons({ secondary, primary, colors: c }: {
  secondary?: { label: string; onPress: () => void; destructive?: boolean };
  primary?: { label: string; onPress: () => void; disabled?: boolean };
  colors: CardColors;
}) {
  const { t } = useDS();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {secondary ? (
        <TouchableOpacity
          onPress={secondary.onPress}
          accessibilityRole="button"
          style={[st.btn, { flex: 1, backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
          <Text style={{ color: secondary.destructive ? t.status.danger : t.action.secondaryText, fontFamily: fontFamily.semibold }}>{secondary.label}</Text>
        </TouchableOpacity>
      ) : null}
      {primary ? (
        <TouchableOpacity
          onPress={primary.onPress}
          disabled={primary.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!primary.disabled }}
          style={[st.btn, { flex: 2, backgroundColor: primary.disabled ? t.state.disabledBg : t.action.primary }]}>
          <Text style={{ color: primary.disabled ? t.state.disabledText : t.text.onAction, fontFamily: fontFamily.semibold }}>{primary.label}</Text>
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
  btn: { minHeight: Atlas.controlHeight, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, gap: 6 },
});

const st = StyleSheet.create({
  groupWrap:  { marginTop: 14 },
  groupTitle: { fontSize: 12, fontFamily: fontFamily.semibold, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7, marginLeft: 2 },
  group:      { borderRadius: radius.nested, overflow: 'hidden' },
  sep:        { borderTopWidth: StyleSheet.hairlineWidth },
  row:        { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingHorizontal: 14, gap: 10 },
  iconBox:    { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  rowLabel:   { fontSize: 14, fontFamily: fontFamily.medium, flexShrink: 0, maxWidth: '45%' },
  valueBox:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  rowValue:   { fontSize: 14, textAlign: 'right', flexShrink: 1 },
  dot:        { width: 9, height: 9, borderRadius: 5 },
  track:      { width: 40, height: 24, borderRadius: 12, justifyContent: 'center', paddingHorizontal: 2 },
  knob:       { width: 20, height: 20, borderRadius: 10 },
  chip:     { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, gap: 6 },
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  overlayWide:{ justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet:      { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, paddingHorizontal: 20, paddingTop: 10 },
  sheetWide:  { width: '100%', maxWidth: 460, borderRadius: radius.card, paddingBottom: 20, paddingTop: 20 },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  sheetHead:  { flexDirection: 'row', alignItems: 'center', marginBottom: 12, minHeight: 32 },
  sheetTitle: { flex: 1, fontSize: 17, fontFamily: fontFamily.semibold },
  closeBtn:   { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  option:     { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: radius.nestedCompact, borderWidth: 1.5, paddingHorizontal: 14, gap: 10, marginBottom: 8 },
  footer:     { paddingTop: 12 },
  btn:        { minHeight: Atlas.controlHeight, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', paddingHorizontal: 18 },
});
