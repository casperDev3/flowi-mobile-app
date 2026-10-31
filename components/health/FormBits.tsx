import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  interpolateColor, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useMotion } from '@/hooks/use-motion';

export function Empty({ c, text, icon = 'tray' }: { c: any; text: string; icon?: string }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <IconSymbol name={icon as any} size={38} color={c.sub} />
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 12, fontFamily: fontFamily.medium }}>{text}</Text>
    </View>
  );
}

export function Field({ label, value, onChange, placeholder, autoFocus, c, keyboardType, multiline }: {
  label: string; value: string; onChange: (t: string) => void; placeholder?: string;
  autoFocus?: boolean; c: any; keyboardType?: any; multiline?: boolean;
}) {
  const { t } = useDS();
  return (
    <>
      <Text style={[s.label, { color: c.sub }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.text.muted}
        autoFocus={autoFocus} keyboardType={keyboardType} multiline={multiline}
        style={[s.input, { color: c.text, backgroundColor: c.dim, minHeight: multiline ? 70 : undefined, textAlignVertical: multiline ? 'top' : 'center' }]} />
    </>
  );
}

// ─── Animated segment option ──────────────────────────────────────────────────
function SegmentOption<T extends string>({
  option, isActive, onChange, color, c,
}: {
  option: { key: T; label: string };
  isActive: boolean;
  onChange: (v: T) => void;
  color: string;
  c: any;
}) {
  const { reduced } = useMotion();
  const { t } = useDS();
  const progress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, { duration: reduced ? 0 : 200 });
  }, [isActive, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const animStyle = useAnimatedStyle(() => ({
    // Активний сегмент — pill action.primary (DS v2); color лишився в API.
    backgroundColor: interpolateColor(progress.value, [0, 1], [c.dim, t.action.primary]),
  }));

  return (
    <Pressable
      onPress={() => onChange(option.key)}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={option.label}
      style={{ flex: 1 }}
    >
      <Animated.View style={[s.seg, animStyle]}>
        <Text style={{ color: isActive ? t.text.onAction : c.text, fontFamily: fontFamily.semibold, fontSize: 13 }}>
          {option.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** Прості сегментні кнопки вибору з анімованим переходом між варіантами */
export function Segment<T extends string>({ label, options, value, onChange, color, c }: {
  label: string; options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; color: string; c: any;
}) {
  return (
    <>
      <Text style={[s.label, { color: c.sub }]}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map(o => (
          <SegmentOption
            key={o.key}
            option={o}
            isActive={o.key === value}
            onChange={onChange}
            color={color}
            c={c}
          />
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8, marginTop: 14 },
  input: { fontSize: 15, fontFamily: fontFamily.regular, borderRadius: radius.control, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 },
  seg:   { textAlign: 'center', borderRadius: radius.pill, minHeight: 44, paddingVertical: 11, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
