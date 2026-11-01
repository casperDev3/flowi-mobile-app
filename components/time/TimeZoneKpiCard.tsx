/**
 * components/time/TimeZoneKpiCard.tsx — KPI обраного періоду в статичній
 * зоні екрана «Час» на ПЛАНШЕТІ (Layout System v2.4).
 *
 * Ті самі три числа, що й у шапці (AppHeader kpis): коли статична зона стоїть
 * поруч, шапка їх не показує — числа живуть тут, у колонці контексту. Телефон
 * цього компонента не бачить.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BentoCard } from '@/components/ds';
import { fontFamily } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import type { Translations } from '@/store/translations';

/**
 * Рядок KPI для вузької колонки (статична зона ~300pt): число над підписом,
 * 32pt замість 48pt шапки — «1г 12хв» поруч із підписом у 300pt обрізалось
 * до «1г 1…». Стеля Dynamic Type та сама, що в KpiCounter.
 */
function ZoneKpi({ value, label }: { value: string; label: string }) {
  const { t } = useDS();
  return (
    <View accessible accessibilityLabel={`${value}, ${label}`} style={st.kpi}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}
        style={[st.value, { color: t.text.primary }]}>{value}</Text>
      <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[st.label, { color: t.text.secondary }]}>{label}</Text>
    </View>
  );
}

export function TimeZoneKpiCard({ title, total, average, typical, tr }: {
  /** Підпис періоду («Тиждень»). */
  title: string;
  /** Готові рядки (тире, коли записів немає). */
  total: string;
  average: string;
  typical: string;
  tr: Pick<Translations, 'totalLabel' | 'timeAverageTask' | 'timeTypicalSession'>;
}) {
  return (
    <BentoCard compact title={title} icon="clock.fill" accent="amber" testID="time-static-kpis">
      <View style={{ gap: 12 }}>
        <ZoneKpi value={total} label={tr.totalLabel} />
        <ZoneKpi value={average} label={tr.timeAverageTask} />
        <ZoneKpi value={typical} label={tr.timeTypicalSession} />
      </View>
    </BentoCard>
  );
}

const st = StyleSheet.create({
  kpi: { gap: 2 },
  value: { fontFamily: fontFamily.light, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  label: { fontSize: 12, lineHeight: 15, fontFamily: fontFamily.medium },
});
