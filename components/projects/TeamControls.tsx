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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ProjectPaletteContext } from './ProjectPaletteContext';

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
  const dark = useColorScheme() === 'dark';
  const palette = useContext(ProjectPaletteContext);
  const text = palette?.text ?? (dark ? '#F0EEFF' : '#302341');
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: palette?.sub ?? text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        editable={editable}
        multiline={multiline}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholderTextColor="#817095"
        style={{
          borderWidth: 1, borderColor: palette?.border ?? '#9E93B2', borderRadius: ACTION.radius,
          paddingHorizontal: 12, paddingVertical: 10, color: text, backgroundColor: palette?.dim,
          minHeight: multiline ? 80 : ACTION.height, opacity: editable ? 1 : 0.7,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}
