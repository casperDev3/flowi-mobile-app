/**
 * components/projects/SprintBurndown.tsx — згоряння одного датованого спринта
 * (docs/specs/projects-analytics.md §6.2, §8.4).
 *
 * Нічого не рахує: ряд приходить готовим із sprintBurndown()
 * (utils/projectStatsMetrics.ts). Малюється звичайними View, як решта
 * мобільних графіків (ProjectTimeline, WeekBars): факт — стовпчиком «лишилось»
 * на кінець кожної доби, ідеал — тонкою рискою на тій самій висоті осі. Точки
 * після сьогодні порожні: у майбутньому фактів немає, і нуль там був би
 * неправдою.
 *
 * Під графіком — обовʼязкові супутні числа: поточний обсяг (ідеал стоїть на
 * ньому, бо історії належності до спринта в даних немає), задачі без дати
 * завершення і закриті ще до старту.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import type { Burndown } from '@/utils/projectStatsMetrics';

export interface BurndownPalette {
  text: string;
  sub: string;
  border: string;
}

const HEIGHT = 96;

function dayLabel(key: string, months: readonly string[]): string {
  const [, month, day] = key.split('-').map(Number);
  return `${day} ${months[(month || 1) - 1] ?? ''}`;
}

export const SprintBurndown = React.memo(function SprintBurndown({
  burndown, color, palette,
}: {
  burndown: Burndown;
  color: string;
  palette: BurndownPalette;
}) {
  const { tr } = useI18n();
  const fill = (template: string, values: Record<string, number>) =>
    Object.entries(values).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(String(value)), template);

  const footnotes = [
    fill(tr.burndownScope, { n: burndown.scope }),
    burndown.undated ? fill(tr.burndownNoDoneDate, { n: burndown.undated }) : '',
    burndown.carriedIn ? fill(tr.burndownCarriedIn, { n: burndown.carriedIn }) : '',
  ].filter(Boolean).join(' · ');

  if (burndown.insufficient) {
    return (
      <View style={{ marginTop: 8 }}>
        <Text style={[st.note, { color: palette.sub }]}>
          {fill(tr.burndownInsufficient, { n: burndown.undated, total: burndown.scope })}
        </Text>
        <Text style={[st.note, { color: palette.sub, marginTop: 4 }]}>{footnotes}</Text>
      </View>
    );
  }

  const peak = Math.max(1, burndown.scope);
  const current = burndown.actual[burndown.todayIndex];
  const spoken = `${tr.burndownTitle}. ${tr.burndownIdeal}: ${burndown.scope} → 0. `
    + `${tr.burndownActual}: ${current ?? burndown.scope}. ${footnotes}`;
  const first = burndown.dayKeys[0];
  const last = burndown.dayKeys[burndown.dayKeys.length - 1];

  return (
    <View style={{ marginTop: 8 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={spoken}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: HEIGHT, gap: 2 }}>
          {burndown.ideal.map((ideal, index) => {
            const actual = burndown.actual[index];
            return (
              <View key={index} style={{ flex: 1, height: HEIGHT, justifyContent: 'flex-end' }}>
                {actual !== null ? (
                  <View
                    style={{
                      height: actual ? Math.max(2, (actual / peak) * HEIGHT) : 2,
                      borderRadius: 2,
                      backgroundColor: actual ? color : palette.border,
                      opacity: index === burndown.todayIndex ? 1 : 0.7,
                    }}
                  />
                ) : null}
                {/* Ідеал — риска на своїй висоті поверх стовпчика. */}
                <View
                  style={{
                    position: 'absolute', left: 0, right: 0,
                    bottom: Math.min(HEIGHT - 2, (ideal / peak) * HEIGHT),
                    height: 2, borderRadius: 1, backgroundColor: palette.sub,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={[st.axis, { color: palette.sub }]}>{first ? dayLabel(first, tr.monthsShort) : ''}</Text>
          <Text style={[st.axis, { color: palette.sub }]}>{last ? dayLabel(last, tr.monthsShort) : ''}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
        <View style={st.legend}>
          <View style={{ width: 10, height: 8, borderRadius: 2, backgroundColor: color }} />
          <Text style={[st.note, { color: palette.sub }]}>{tr.burndownActual}</Text>
        </View>
        <View style={st.legend}>
          <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: palette.sub }} />
          <Text style={[st.note, { color: palette.sub }]}>{tr.burndownIdeal}</Text>
        </View>
      </View>
      <Text style={[st.note, { color: palette.sub, marginTop: 4 }]}>{footnotes}</Text>
    </View>
  );
});

const st = StyleSheet.create({
  note:   { fontSize: 11, lineHeight: 15 },
  axis:   { fontSize: 9, fontWeight: '600' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
