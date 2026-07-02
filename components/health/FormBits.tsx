import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

export function Empty({ c, text, icon = 'tray' }: { c: any; text: string; icon?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <IconSymbol name={icon as any} size={38} color={c.sub} />
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Field({ label, value, onChange, placeholder, autoFocus, c, keyboardType, multiline }: {
  label: string; value: string; onChange: (t: string) => void; placeholder?: string;
  autoFocus?: boolean; c: any; keyboardType?: any; multiline?: boolean;
}) {
  return (
    <>
      <Text style={[s.label, { color: c.sub }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.sub}
        autoFocus={autoFocus} keyboardType={keyboardType} multiline={multiline}
        style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.dim, minHeight: multiline ? 70 : undefined, textAlignVertical: multiline ? 'top' : 'center' }]} />
    </>
  );
}

/** Прості сегментні кнопки вибору */
export function Segment<T extends string>({ label, options, value, onChange, color, c }: {
  label: string; options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; color: string; c: any;
}) {
  return (
    <>
      <Text style={[s.label, { color: c.sub }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map(o => (
          <View key={o.key} style={{ flex: 1 }}>
            <Text onPress={() => onChange(o.key)}
              style={[s.seg, { color: value === o.key ? color : c.text, borderColor: value === o.key ? color : c.border, backgroundColor: value === o.key ? color + '20' : c.dim }]}>
              {o.label}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input: { fontSize: 15, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  seg:   { textAlign: 'center', fontSize: 13, fontWeight: '700', borderRadius: 12, borderWidth: 1.5, paddingVertical: 11, overflow: 'hidden' },
});
