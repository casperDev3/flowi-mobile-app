/**
 * components/ds/HatchedBars.tsx — стовпчики Omni («Task Completion»).
 *
 * Неактивні стовпці — сірі зі скісним штрихуванням, активний — заливка
 * фірмовим градієнтом (вертикально, згори фіолет) з чорною pill-підказкою
 * значення над ним. На кожному стовпці — крапка-маркер. Підписи під
 * стовпцями — caption text.secondary.
 *
 * react-native-svg: штрих — <Pattern>, градієнт — <LinearGradient>.
 * Колонки — Pressable лише коли передано onSelect (ціль дотику — уся висота
 * колонки, ширина ≥ 44 на типовій ширині; інакше — лише скрінрідер-елементи).
 * Порожні дані (усі 0) — сірі «пеньки» мінімальної висоти, без підказки.
 */
import React, { useId, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type HatchedBar = {
  /** Підпис під стовпцем («Пн», «Чер»). */
  label: string;
  value: number;
  /** Текст підказки й a11y-значення (за замовч. — value). */
  display?: string;
};

export type HatchedBarsProps = {
  data: HatchedBar[];
  /** Активний стовпець (градієнт + підказка). За замовч. — останній ненульовий. */
  activeIndex?: number;
  onSelect?: (index: number) => void;
  /** Чорна pill-підказка над активним стовпцем (вимкніть у вузьких плитках). */
  showTooltip?: boolean;
  /** Висота області стовпців (без підписів і підказки). */
  height?: number;
  /** Підпис графіка для скрінрідера. */
  accessibilityLabel: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const TOOLTIP_PILL_H = 24;
const LABEL_H = 20;
const MIN_BAR = 10;

export function HatchedBars({
  data, activeIndex, onSelect, showTooltip = true, height = 120, accessibilityLabel, testID, style,
}: HatchedBarsProps) {
  const { t, isDark } = useDS();
  const [w, setW] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const max = Math.max(0, ...data.map(d => d.value));
  const fallbackActive = (() => {
    for (let i = data.length - 1; i >= 0; i--) if (data[i].value > 0) return i;
    return -1;
  })();
  const active = activeIndex ?? fallbackActive;
  const n = Math.max(1, data.length);
  // Вузька плитка (Сьогодні → «Таймер» у пів ширини): менший проміжок,
  // інакше стовпці стають смужками, а підписи «пн/вт» — «п…».
  const gap = n > 8 || (w > 0 && w < 240) ? 6 : 10;
  const barW = w > 0 ? Math.max(8, (w - gap * (n - 1)) / n) : 0;
  // Підпис ширший за стовпець — лишаємо першу літеру (П В С Ч П С Н).
  const shortLabels = barW > 0 && barW < 22;
  const hatch = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(17,17,19,0.12)';
  const barBg = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(17,17,19,0.035)';
  const r = Math.min(barW / 2, radius.nested);
  // Без підказки місце над стовпцями не резервуємо.
  const TOOLTIP_H = showTooltip ? TOOLTIP_PILL_H : 0;

  const heights = data.map(d => (max > 0 ? Math.max(MIN_BAR, (d.value / max) * height) : MIN_BAR));

  return (
    <View testID={testID} style={style} accessibilityLabel={accessibilityLabel} accessible={!onSelect} onLayout={onLayout}>
      <View style={{ height: height + TOOLTIP_H + 8 }}>
        {w > 0 ? (
          <Svg width={w} height={height + TOOLTIP_H + 8} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <Pattern id={`hatch-${uid}`} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
                <Line x1={0} y1={0} x2={0} y2={7} stroke={hatch} strokeWidth={2.2} />
              </Pattern>
              <LinearGradient id={`sig-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.gradient.signature[0]} />
                <Stop offset="1" stopColor={t.gradient.signature[t.gradient.signature.length - 1]} />
              </LinearGradient>
            </Defs>
            {data.map((d, i) => {
              const x = i * (barW + gap);
              const h = heights[i];
              const y = TOOLTIP_H + 8 + (height - h);
              const isActive = i === active && max > 0;
              return (
                <React.Fragment key={`${d.label}:${i}`}>
                  {isActive ? (
                    <Rect x={x} y={y} width={barW} height={h} rx={r} ry={r} fill={`url(#sig-${uid})`} />
                  ) : (
                    <>
                      <Rect x={x} y={y} width={barW} height={h} rx={r} ry={r} fill={barBg} />
                      <Rect x={x} y={y} width={barW} height={h} rx={r} ry={r} fill={`url(#hatch-${uid})`} />
                    </>
                  )}
                  {max > 0 ? (
                    <Circle
                      cx={x + barW / 2}
                      cy={y + Math.min(8, h / 2)}
                      r={3.5}
                      fill={isActive ? '#FFFFFF' : t.text.primary}
                      stroke={isActive ? t.text.primary : 'none'}
                      strokeWidth={isActive ? 1.5 : 0}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
          </Svg>
        ) : null}

        {/* Підказка над активним стовпцем — чорна pill (action.primary). */}
        {showTooltip && w > 0 && active >= 0 && max > 0 ? (() => {
          const x = active * (barW + gap) + barW / 2;
          const text = data[active].display ?? String(data[active].value);
          const top = Math.max(0, TOOLTIP_H + 8 + (height - heights[active]) - TOOLTIP_H - 6);
          return (
            <View pointerEvents="none" style={[st.tipWrap, { top, left: Math.max(0, Math.min(w - 96, x - 48)) }]}>
              <View style={[st.tip, { backgroundColor: t.action.primary }]}>
                <Text numberOfLines={1} allowFontScaling={false} style={[st.tipText, { color: t.text.onAction }]}>{text}</Text>
              </View>
            </View>
          );
        })() : null}

        {/* Колонки-кнопки (лише з onSelect): уся висота, ширина колонки. */}
        {onSelect && w > 0 ? (
          <View style={StyleSheet.absoluteFill}>
            {data.map((d, i) => (
              <Pressable
                key={`p:${d.label}:${i}`}
                onPress={() => onSelect(i)}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}: ${d.display ?? d.value}`}
                accessibilityState={{ selected: i === active }}
                style={{ position: 'absolute', top: 0, bottom: 0, left: i * (barW + gap) - gap / 2, width: barW + gap }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <View style={[st.labels, { height: LABEL_H, gap }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {data.map((d, i) => (
          <Text
            key={`l:${d.label}:${i}`}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={[
              st.label,
              { width: barW || undefined, flex: barW ? undefined : 1, color: i === active ? t.text.primary : t.text.secondary },
              i === active ? { fontFamily: fontFamily.semibold } : null,
            ]}>
            {shortLabels ? d.label.slice(0, 1).toUpperCase() : d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  tipWrap: { position: 'absolute', width: 96, alignItems: 'center' },
  tip: { height: TOOLTIP_PILL_H, borderRadius: radius.pill, paddingHorizontal: 12, justifyContent: 'center' },
  tipText: { fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  labels: { flexDirection: 'row', marginTop: 8 },
  label: { fontSize: 11, lineHeight: 14, textAlign: 'center', fontFamily: fontFamily.medium },
});
