/**
 * components/projects/SprintVelocity.tsx — таблиця велосіті під спринтами
 * проєкту (docs/specs/projects-analytics.md §6.1, §8.4).
 *
 * Числа — з velocityWindow() (utils/projectStatsMetrics.ts). Прогноз НІКОЛИ
 * не показується без розміру вибірки: число без «за скількома спринтами»
 * читається як обіцянка.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import type { VelocityWindow } from '@/utils/projectStatsMetrics';
import { fontFamily } from '@/constants/theme';

import { OmniPanel, OmniWeekBars } from './OmniPaletteKit';

export interface VelocityPalette {
  text: string;
  sub: string;
  border: string;
  dim: string;
}

function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function SprintVelocity({
  velocity, locale, palette,
}: {
  velocity: VelocityWindow;
  locale: string;
  palette: VelocityPalette;
}) {
  const { tr } = useI18n();
  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(String(value)), template);
  const shortDate = (iso: string | undefined) =>
    iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';

  return (
    // Omni (DS v2.2): суцільна bento-картка; над таблицею — штриховані
    // стовпці велосіті, останній закритий спринт — фірмовий градієнт.
    <OmniPanel
      title={tr.velocityTitle}
      subtitle={velocity.sampleSize > 0
        ? fill(tr.velocityAverage, { n: oneDecimal(velocity.avgVelocity), w: oneDecimal(velocity.avgWeeklyVelocity) })
        : undefined}
      palette={palette}
      style={{ marginTop: 8 }}>
      {velocity.rows.length > 1 ? (
        <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ marginBottom: 10 }}>
          <OmniWeekBars
            // Рядки — від найновішого; стовпці читаються зліва направо в часі.
            data={[...velocity.rows].reverse().map(row => ({ key: row.sprint.id, label: row.sprint.name, value: row.velocity }))}
            activeIndex={velocity.rows.length - 1}
            height={64}
            palette={palette}
          />
        </View>
      ) : null}

      {velocity.rows.length === 0 ? (
        <Text style={[st.note, { color: palette.sub }]}>{tr.velocityEmpty}</Text>
      ) : velocity.rows.map(row => (
        <View
          key={row.sprint.id}
          accessible
          accessibilityLabel={`${row.sprint.name}, ${shortDate(row.sprint.startDate)} – ${shortDate(row.sprint.endDate)}, `
            + `${fill(tr.velocityDays, { n: row.days })}, ${fill(tr.velocityTasks, { n: row.velocity })}`}
          style={[st.row, { borderTopColor: palette.border }]}>
          <Text numberOfLines={1} style={{ flex: 1.3, color: palette.text, fontSize: 12, fontFamily: fontFamily.semibold }}>{row.sprint.name}</Text>
          <Text numberOfLines={1} style={{ flex: 1.6, color: palette.sub, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] }}>
            {shortDate(row.sprint.startDate)} – {shortDate(row.sprint.endDate)}
          </Text>
          <Text style={[st.num, { color: palette.sub }]}>{fill(tr.velocityDays, { n: row.days })}</Text>
          <Text style={[st.num, { color: palette.text, fontFamily: fontFamily.semibold }]}>{fill(tr.velocityTasks, { n: row.velocity })}</Text>
        </View>
      ))}

      <Text style={[st.note, { color: palette.sub, marginTop: 10 }]}>
        {velocity.forecastWeeks !== null
          ? fill(tr.velocityForecast, { weeks: velocity.forecastWeeks, open: velocity.remainingWork, n: velocity.sampleSize })
          : `${tr.velocityNotEnough} · ${fill(tr.velocitySample, { n: velocity.sampleSize })}`}
      </Text>
      {velocity.undatedClosed > 0 ? (
        <Text style={[st.note, { color: palette.sub, marginTop: 4 }]}>
          {fill(tr.velocityUndated, { n: velocity.undatedClosed })}
        </Text>
      ) : null}
    </OmniPanel>
  );
}

const st = StyleSheet.create({
  note:  { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.regular },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  num:   { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'right', fontVariant: ['tabular-nums'], minWidth: 58 },
});
