/**
 * components/ds/SegmentedProgress.tsx — сегментний прогрес Omni.
 *
 * ≈15 маленьких заокруглених сегментів; заповнені — кольором фірмового
 * градієнта у своїй позиції (фіолет → бурштин), порожні — тихий subtle-трек.
 * Відсоток праворуч (необов'язково). Для скрінрідера — progressbar зі значенням.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { signatureAt } from '@/components/ds/Signature';
import { fontFamily, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type SegmentedProgressProps = {
  /** 0..1 */
  value: number;
  /** Кількість сегментів (за замовч. 15, як в Omni). */
  segments?: number;
  /** Висота сегмента. */
  height?: number;
  /** Підпис ліворуч над смугою (напр. «Прогрес»). */
  label?: string;
  /** Показати «NN%» праворуч від підпису. */
  showValue?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedProgress({
  value, segments = 15, height = 10, label, showValue = false, accessibilityLabel, testID, style,
}: SegmentedProgressProps) {
  const { t, g, reduceTransparency } = useDS();
  const v = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const filled = Math.round(v * segments);
  const pct = Math.round(v * 100);
  const track = reduceTransparency ? t.surface.subtle : g.surfaceSubtle;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={style}>
      {(label || showValue) ? (
        <View style={st.head}>
          {label ? <Text style={[type.caption, { color: t.text.secondary, flex: 1 }]} numberOfLines={1}>{label}</Text> : <View style={{ flex: 1 }} />}
          {showValue ? (
            <Text style={[st.value, { color: t.text.primary }]}>{pct}%</Text>
          ) : null}
        </View>
      ) : null}
      <View style={st.row}>
        {Array.from({ length: segments }, (_, i) => (
          <View
            key={i}
            style={[
              st.seg,
              { height, borderRadius: height / 2 },
              i < filled
                ? { backgroundColor: signatureAt(t, segments > 1 ? i / (segments - 1) : 0) }
                : { backgroundColor: track, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.hairline },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6, gap: 8 },
  value: { fontFamily: fontFamily.semibold, fontSize: 13, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1 },
});
