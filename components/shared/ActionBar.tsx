/**
 * components/shared/ActionBar.tsx — єдина композиція кнопок дій.
 *
 * Дії завдань та ідей розросталися кожна своїм стилем: футер картки мав 44pt
 * і радіус 12, командні дії — 46pt і flexGrow, TeamButton — padding 12 без
 * мінімальної висоти, іконки шапки — 16/17/14pt. На різних платформах це
 * давало різні відступи й «стрибання» рядка. Тут один набір мір (ACTION) і
 * чотири цеглинки:
 *
 *   ActionBar     — рядок дій: сталий проміжок, перенос, вирівнювання;
 *   ActionButton  — кнопка з підписом (і, за бажанням, іконкою), 44pt;
 *   IconAction    — квадратна іконка-дія 44×44 (шапки, рядки списків);
 *   ActionChip    — перемикач-фільтр (вибраний стан замість префікса «✓ »).
 *
 * Порядок дій у рядку — від другорядної до головної (зліва направо):
 * деструктивна → вторинні → основна. Тоді основна завжди під великим пальцем
 * праворуч, як у системних діалогах iOS/Android.
 *
 * Кольори — пропом `colors` або з ProjectPaletteContext (простір проєкту);
 * без обох — нейтральна палітра за темою.
 */
import React, { useContext } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ProjectPaletteContext } from '@/components/projects/ProjectPaletteContext';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ACTION } from './actionMetrics';

// Міри — окремим модулем без залежностей: їх імпортують і легкі шапки
// (TaskDetailHeader), яким не треба тягнути тему й сховище.
export { ACTION } from './actionMetrics';

export const ACTION_DANGER = '#EF4444';

export interface ActionColors {
  text: string;
  sub: string;
  accent: string;
  border: string;
  dim: string;
}

export type ActionTone = 'primary' | 'secondary' | 'danger' | 'neutral';

function useActionColors(colors?: ActionColors): ActionColors {
  const palette = useContext(ProjectPaletteContext);
  const dark = useColorScheme() === 'dark';
  return colors ?? palette ?? {
    text: dark ? '#F0EEFF' : '#1A1433',
    sub: dark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: dark ? '#C4ADFF' : '#6035B0',
    border: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
    dim: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };
}

/** Рядок дій. `wrap` — переносити на вузькому екрані замість стискати підписи. */
export function ActionBar({ children, wrap = true, align = 'start', style }: {
  children: React.ReactNode;
  wrap?: boolean;
  /** start — від лівого краю; end — до правого (футери, шапки); stretch — кнопки ділять ширину. */
  align?: 'start' | 'end' | 'stretch';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[
      st.bar,
      wrap && st.wrap,
      align === 'end' && st.end,
      style,
    ]}>
      {children}
    </View>
  );
}

export interface ActionButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconSymbolName;
  /** primary — заливка акцентом; secondary — акцентний контур; danger — червоний; neutral — сірий. */
  tone?: ActionTone;
  disabled?: boolean;
  /** Частка ширини в рядку (`align="stretch"`): основна дія — 2, решта — 1. */
  grow?: number;
  /** На всю ширину контейнера (одиночна дія у стовпці). */
  block?: boolean;
  selected?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  colors?: ActionColors;
  style?: StyleProp<ViewStyle>;
}

export function ActionButton({
  label, onPress, icon, tone = 'secondary', disabled = false, grow, block = false, selected,
  accessibilityLabel, accessibilityHint, colors, style,
}: ActionButtonProps) {
  const c = useActionColors(colors);
  const tint = tone === 'danger' ? ACTION_DANGER : tone === 'neutral' ? c.sub : c.accent;
  const filled = tone === 'primary';
  const fg = filled ? '#fff' : tone === 'neutral' ? c.text : tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}
      style={({ pressed }) => [
        st.btn,
        {
          backgroundColor: filled ? tint : tone === 'neutral' ? c.dim : tint + '14',
          borderColor: filled ? tint : tone === 'neutral' ? c.border : tint + '55',
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        grow !== undefined && { flexGrow: grow, flexBasis: 0 },
        block && st.block,
        style,
      ]}>
      {icon ? <IconSymbol name={icon} size={ACTION.icon} color={fg} /> : null}
      <Text numberOfLines={1} style={[st.label, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Іконка-дія 44×44. Однаковий розмір іконки на всіх шапках і рядках. */
export function IconAction({ icon, label, onPress, color, active, disabled = false, bordered = false, colors }: {
  icon: IconSymbolName;
  label: string;
  onPress: () => void;
  color?: string;
  /** Перемикач (напр. «Стежу») — озвучується як selected і підсвічується. */
  active?: boolean;
  disabled?: boolean;
  /** Обвідка — для окремої кнопки в шапці екрана, а не в групі іконок. */
  bordered?: boolean;
  colors?: ActionColors;
}) {
  const c = useActionColors(colors);
  const tint = color ?? (active ? c.accent : c.sub);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active === undefined ? { disabled } : { disabled, selected: active }}
      style={({ pressed }) => [
        st.icon,
        bordered && { borderWidth: 1, borderColor: c.border, backgroundColor: c.dim },
        { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 },
      ]}>
      <IconSymbol name={icon} size={ACTION.iconOnly} color={tint} />
    </Pressable>
  );
}

/** Чип-перемикач фільтра. Вибраний — заливка акцентом, а не «✓ » у тексті. */
export function ActionChip({ label, selected, onPress, icon, count, colors, accessibilityLabel }: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconSymbolName;
  count?: number;
  colors?: ActionColors;
  accessibilityLabel?: string;
}) {
  const c = useActionColors(colors);
  const fg = selected ? '#fff' : c.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (count === undefined ? label : `${label}, ${count}`)}
      accessibilityState={{ selected }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        st.chip,
        { backgroundColor: selected ? c.accent : c.dim, borderColor: selected ? c.accent : c.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      {icon ? <IconSymbol name={icon} size={13} color={selected ? '#fff' : c.sub} /> : null}
      <Text numberOfLines={1} style={[st.chipLabel, { color: fg }]}>{label}</Text>
      {count !== undefined ? <Text style={[st.chipCount, { color: selected ? '#fff' : c.sub }]}>{count}</Text> : null}
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar:   { flexDirection: 'row', alignItems: 'center', gap: ACTION.gap },
  wrap:  { flexWrap: 'wrap' },
  end:   { justifyContent: 'flex-end' },
  btn:   {
    minHeight: ACTION.height, borderRadius: ACTION.radius, borderWidth: 1, paddingHorizontal: ACTION.paddingX,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  block: { alignSelf: 'stretch' },
  label: { fontSize: ACTION.fontSize, fontWeight: '700', flexShrink: 1 },
  icon:  { width: ACTION.height, height: ACTION.height, borderRadius: ACTION.radius, alignItems: 'center', justifyContent: 'center' },
  chip:  {
    minHeight: ACTION.chipHeight, borderRadius: ACTION.radius, borderWidth: 1, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  chipCount: { fontSize: 12, fontWeight: '700' },
});
