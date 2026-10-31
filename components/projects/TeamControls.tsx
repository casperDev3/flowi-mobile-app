/**
 * components/projects/TeamControls.tsx — кнопка й поле командних екранів
 * простору проєкту (Беклог, Обговорення, Моя робота, Навантаження).
 *
 * TeamButton — тонка обгортка над спільною ActionButton
 * (components/shared/ActionBar.tsx): ті самі 44pt, радіус і відступи, що в
 * картці завдання, замість власних padding 12 без мінімальної висоти.
 * Окрема кнопка в стовпці тягнеться на всю ширину (`block`), у ActionBar —
 * за вмістом.
 */
import React, { useContext } from 'react';
import { Text, TextInput, View } from 'react-native';

import { ActionButton, ACTION, type ActionTone } from '@/components/shared/ActionBar';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import { useDS } from '@/hooks/use-ds';
import { ProjectPaletteContext } from './ProjectPaletteContext';
import { fontFamily, radius } from '@/constants/theme';
import { glassOf } from '@/components/shared/dsTheme';

export function TeamButton({ label, onPress, disabled = false, icon, tone = 'secondary', block = true, grow }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: IconSymbolName;
  tone?: ActionTone;
  /** На всю ширину стовпця (за замовчуванням). У ActionBar — false. */
  block?: boolean;
  grow?: number;
}) {
  return <ActionButton label={label} onPress={onPress} disabled={disabled} icon={icon} tone={tone} block={block} grow={grow} />;
}

export function TeamInput({ label, value, onChange, editable = true, multiline = false, numeric = false }: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  editable?: boolean;
  multiline?: boolean;
  numeric?: boolean;
}) {
  const { t } = useDS();
  const palette = useContext(ProjectPaletteContext);
  const text = palette?.text ?? t.text.primary;
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: palette?.sub ?? t.text.secondary, fontSize: 12, fontFamily: fontFamily.medium }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholderTextColor={t.text.muted}
        style={{
          // DS v2: поле — subtle-тло без рамки, радіус контрола.
          borderRadius: radius.control, fontFamily: fontFamily.regular, fontSize: 14,
          paddingHorizontal: 14, paddingVertical: 10, color: text, backgroundColor: palette?.dim ?? glassOf(t).surfaceSubtle,
          minHeight: multiline ? 80 : ACTION.height, opacity: editable ? 1 : 0.7,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
