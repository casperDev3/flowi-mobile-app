/**
 * components/time/TimeKpi.tsx — KPI сторінки «Час».
 *
 * Три числа й розподіл за проєктами. Рахує їх не цей файл, а чистий
 * `utils/timeEntries.ts` — дзеркало вебового `lib/time-entries.ts`: KPI, що
 * розходиться між телефоном і браузером, підриває довіру до всіх решти цифр.
 *
 * Поділу за змінами доби тут немає: «скільки часу пішло ввечері» нікому не
 * відповідало на робоче питання, а місце займало більше за всі три KPI разом.
 */

import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TimeColors } from '@/components/time/TimePalette';
import type { Translations } from '@/store/translations';
import type { ProjectShare } from '@/utils/timeEntries';

export interface TimeKpiProps {
  c: TimeColors;
  isDark: boolean;
  totalSeconds: number;
  averageTaskSeconds: number;
  recordCount: number;
  breakdown: ProjectShare[];
  formatDuration: (seconds: number) => string;
  tr: Translations;
}

/** Скільки проєктів показуємо смужками; решта — рядком «ще N». */
const TOP_PROJECTS = 5;

export function TimeKpi({
  c,
  isDark,
  totalSeconds,
  averageTaskSeconds,
  recordCount,
  breakdown,
  formatDuration,
  tr,
}: TimeKpiProps) {
  const top = breakdown.slice(0, TOP_PROJECTS);
  const rest = breakdown.slice(TOP_PROJECTS);
  const restSeconds = rest.reduce((sum, item) => sum + item.seconds, 0);

  return (
    <View>
      <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card }]}>
        <StatCell value={totalSeconds > 0 ? formatDuration(totalSeconds) : '—'} label={tr.totalLabel} color={c.indigo} sub={c.sub} />
        <View style={{ width: 1, backgroundColor: c.border }} />
        <StatCell
          value={averageTaskSeconds > 0 ? formatDuration(averageTaskSeconds) : '—'}
          label={tr.timeAverageTask}
          color="#10B981"
          sub={c.sub}
        />
        <View style={{ width: 1, backgroundColor: c.border }} />
        <StatCell value={String(recordCount)} label={tr.sessionsCount} color={c.warn} sub={c.sub} />
      </View>

      {top.length > 0 && (
        <BlurView
          intensity={isDark ? 18 : 35}
          tint={isDark ? 'dark' : 'light'}
          style={[s.card, { borderColor: c.border, marginTop: 12 }]}>
          <Text style={[s.cardTitle, { color: c.sub }]}>{tr.timeProjectBreakdown}</Text>
          {top.map(item => (
            <View key={item.projectId ?? 'personal'} style={{ marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 12, fontWeight: '600', marginLeft: 8, flex: 1 }}>
                  {item.name}
                </Text>
                <Text style={{ color: c.sub, fontSize: 10, marginRight: 8 }}>{Math.round(item.share * 100)}%</Text>
                <Text style={{ color: item.color, fontSize: 12, fontWeight: '700' }}>{formatDuration(item.seconds)}</Text>
              </View>
              <View style={s.progressBg}>
                {/* Мінімум 2% ширини: смужка на 0.4% не читається як смужка,
                    а рядок без неї виглядає як помилка малювання. */}
                <View style={[s.progressFill, { width: `${Math.max(2, Math.round(item.share * 100))}%`, backgroundColor: item.color }]} />
              </View>
            </View>
          ))}
          {rest.length > 0 && (
            <Text style={{ color: c.sub, fontSize: 11, marginTop: 12 }}>
              {tr.timeMoreProjects.replace('{count}', String(rest.length))} · {formatDuration(restSeconds)}
            </Text>
          )}
        </BlurView>
      )}
    </View>
  );
}

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 }}>
      <Text numberOfLines={1} style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text numberOfLines={2} style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  statsRow: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  cardTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  progressBg: { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
