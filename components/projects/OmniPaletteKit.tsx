/**
 * components/projects/OmniPaletteKit.tsx — Omni-примітиви (DS v2.2) для
 * компонентів, що знають лише ПАЛІТРУ екрана, а не тему.
 *
 * Аналітика проєктів (ProjectAnalytics, ProjectTimeline…) рендериться в
 * юніт-тестах без мока сховища, тож `useDS()` (→ theme-context →
 * AsyncStorage) їй недоступний — а саме на ньому стоять BentoCard,
 * SectionTabs і HatchedBars із `components/ds`. Тут — ті самі візуальні
 * правила Omni, але тема виводиться з кольору тексту палітри
 * (`dsTokensForText`), як уже робить решта аналітики:
 *
 *   OmniPanel     — суцільна bento-картка: icon-chip + назва 16/600, підзаголовок;
 *   OmniPillTabs  — pill-вкладки (активна — чорна pill action.primary);
 *   OmniWeekBars  — штриховані стовпці, поточний — фірмовий градієнт.
 */
import React, { useId, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { dsTokensForText } from '@/components/tasks/dsTokensForText';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, theme } from '@/constants/theme';

export interface OmniPalette { text: string; sub: string; border: string }

const isDarkFor = (text: string) => dsTokensForText(text) === theme.dark;

export function OmniPanel({
  title, subtitle, icon = 'chart.bar.fill', palette, right, children, style,
}: {
  title: string;
  subtitle?: string;
  icon?: IconSymbolName;
  palette: OmniPalette;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = dsTokensForText(palette.text);
  const dark = isDarkFor(palette.text);
  return (
    <View style={[st.panel, { backgroundColor: t.surface.card }, shadow[dark ? 'dark' : 'light'].card, style]}>
      <View style={st.head}>
        <View style={[st.chip, { backgroundColor: t.surface.subtle }]}>
          <IconSymbol name={icon} size={15} color={palette.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={[st.title, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text numberOfLines={2} style={[st.subtitle, { color: palette.sub }]}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function OmniPillTabs<K extends string>({
  tabs, value, onChange, palette, accessibilityLabel, style,
}: {
  tabs: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  palette: OmniPalette;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = dsTokensForText(palette.text);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={style}
      contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {tabs.map(tab => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              st.pill,
              { backgroundColor: active ? t.action.primary : t.surface.card, opacity: pressed ? 0.75 : 1 },
            ]}>
            <Text numberOfLines={1} style={{ color: active ? t.text.onAction : t.text.secondary, fontSize: 13, fontFamily: fontFamily.semibold }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Двоколонкова сітка від 600pt ширини контейнера (як BentoGrid medium). */
export function OmniTwoColumns({ children, gap = 12 }: { children: React.ReactNode; gap?: number }) {
  const [w, setW] = useState(0);
  const cols = w >= 600 ? 2 : 1;
  const colW = cols === 2 ? (w - gap) / 2 : undefined;
  const items = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {items.map((child, i) => (
        <View key={(child as React.ReactElement).key ?? i} style={{ width: colW ?? '100%' }}>{child}</View>
      ))}
    </View>
  );
}

/**
 * Стовпці Omni: неактивні — сірі зі скісним штрихом, активний — вертикальний
 * фірмовий градієнт (t.gradient.signature). Підписи під стовпцями. Для
 * читалки — нічого: озвучку дає обгортка-виклик одним підписом.
 */
export function OmniWeekBars({
  data, activeIndex, height = 70, palette,
}: {
  data: { key: string; label: string; value: number; strong?: boolean }[];
  activeIndex: number;
  height?: number;
  palette: OmniPalette;
}) {
  const t = dsTokensForText(palette.text);
  const dark = isDarkFor(palette.text);
  const [w, setW] = useState(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const n = Math.max(1, data.length);
  const gap = n > 8 ? 3 : 6;
  const barW = w > 0 ? Math.max(4, (w - gap * (n - 1)) / n) : 0;
  const peak = Math.max(1, ...data.map(d => d.value));
  const hatch = dark ? 'rgba(255,255,255,0.16)' : 'rgba(17,17,19,0.12)';
  const barBg = dark ? 'rgba(255,255,255,0.05)' : 'rgba(17,17,19,0.035)';
  const sig = t.gradient.signature;
  const r = Math.min(barW / 2, 6);
  return (
    <View>
      <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? (
          <Svg width={w} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Defs>
              <Pattern id={`h-${uid}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                <Line x1={0} y1={0} x2={0} y2={6} stroke={hatch} strokeWidth={2} />
              </Pattern>
              <LinearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={sig[0]} />
                <Stop offset="1" stopColor={sig[sig.length - 1]} />
              </LinearGradient>
            </Defs>
            {data.map((d, i) => {
              // Порожній тиждень лишається видимою рискою, а не зникає:
              // провал у ряді — це і є відповідь «нічого не закрили».
              const h = d.value ? Math.max(6, (d.value / peak) * height) : 3;
              const x = i * (barW + gap);
              const y = height - h;
              const active = i === activeIndex && d.value > 0;
              return active ? (
                <Rect key={d.key} x={x} y={y} width={barW} height={h} rx={r} ry={r} fill={`url(#g-${uid})`} />
              ) : (
                <React.Fragment key={d.key}>
                  <Rect x={x} y={y} width={barW} height={h} rx={r} ry={r} fill={d.value ? barBg : palette.border} />
                  {d.value ? <Rect x={x} y={y} width={barW} height={h} rx={r} ry={r} fill={`url(#h-${uid})`} /> : null}
                </React.Fragment>
              );
            })}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap, marginTop: 5 }}>
        {data.map(d => (
          <Text
            key={d.key}
            numberOfLines={1}
            style={{
              flex: 1, textAlign: 'center', fontSize: 9, fontVariant: ['tabular-nums'],
              fontFamily: fontFamily.semibold,
              color: d.strong ? palette.text : palette.sub,
            }}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  panel: { borderRadius: radius.card, padding: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, minHeight: 36 },
  chip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.semibold },
  subtitle: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.regular },
  pill: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center' },
});
