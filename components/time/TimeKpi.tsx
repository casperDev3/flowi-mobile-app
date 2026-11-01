/**
 * components/time/TimeKpi.tsx — KPI сторінки «Час».
 *
 * Чотири числа й розподіл за проєктами. «Середнє на задачу» і «Звичайна
 * сесія» стоять поруч навмисно: середнє тягне вгору одна забута на ніч сесія,
 * медіана — ні, і розрив між ними сам підказує, що в списку є що перевірити. Рахує їх не цей файл, а чистий
 * `utils/timeEntries.ts` — дзеркало вебового `lib/time-entries.ts`: KPI, що
 * розходиться між телефоном і браузером, підриває довіру до всіх решти цифр.
 *
 * Поділу за змінами доби тут немає: «скільки часу пішло ввечері» нікому не
 * відповідало на робоче питання, а місце займало більше за всі три KPI разом.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { TimeColors } from '@/components/time/TimePalette';
import { fontFamily, radius, space, type as dsType } from '@/constants/theme';
import type { Translations } from '@/store/translations';
import type { ProjectShare } from '@/utils/timeEntries';
import { BentoCard, GlassSurface } from '@/components/ds';

export interface TimeKpiProps {
  c: TimeColors;
  isDark: boolean;
  totalSeconds: number;
  averageTaskSeconds: number;
  /** Медіана тривалості записів вибірки (utils/timeAnomalies.typicalSessionSeconds). */
  typicalSessionSeconds: number;
  recordCount: number;
  breakdown: ProjectShare[];
  formatDuration: (seconds: number) => string;
  tr: Translations;
}

/** Скільки проєктів показуємо смужками; решта — рядком «ще N». */
const TOP_PROJECTS = 5;

export function TimeKpi(props: TimeKpiProps) {
  return (
    <View>
      <TimeKpiTiles {...props} />
      <TimeProjectBreakdown {...props} style={{ marginTop: 12 }} />
    </View>
  );
}

/**
 * Чотири числа одним рядком. Окремим компонентом, бо на широкому екрані
 * (components/time/… + app/(tabs)/time.tsx) плитки стоять угорі на всю
 * ширину, а розподіл — у правій колонці.
 */
export function TimeKpiTiles({
  c,
  totalSeconds,
  averageTaskSeconds,
  typicalSessionSeconds,
  recordCount,
  formatDuration,
  tr,
  large,
}: Omit<TimeKpiProps, 'breakdown' | 'isDark'> & { large?: boolean }) {
  // DS v2: KPI — великі тонкі цифри одним кольором (text.primary), без
  // кольорового кодування; роздільники — hairline.
  const cell = { sub: c.sub, large, color: c.text };
  const divider = <View style={{ width: StyleSheet.hairlineWidth, marginVertical: 14, backgroundColor: c.border }} />;
  return (
    <GlassSurface radius={radius.cardCompact} tint="amber" style={s.statsRow}>
      <StatCell value={totalSeconds > 0 ? formatDuration(totalSeconds) : '—'} label={tr.totalLabel} {...cell} />
      {divider}
      <StatCell
        value={averageTaskSeconds > 0 ? formatDuration(averageTaskSeconds) : '—'}
        label={tr.timeAverageTask}
        {...cell}
      />
      {divider}
      <StatCell
        value={typicalSessionSeconds > 0 ? formatDuration(typicalSessionSeconds) : '—'}
        label={tr.timeTypicalSession}
        {...cell}
      />
      {divider}
      <StatCell value={String(recordCount)} label={tr.sessionsCount} {...cell} />
    </GlassSurface>
  );
}

/** Розподіл за проєктами; без проєктів у вибірці — нічого. */
export function TimeProjectBreakdown({
  c,
  isDark,
  breakdown,
  formatDuration,
  tr,
  style,
}: Pick<TimeKpiProps, 'c' | 'isDark' | 'breakdown' | 'formatDuration' | 'tr'> & { style?: ViewStyle }) {
  const top = breakdown.slice(0, TOP_PROJECTS);
  const rest = breakdown.slice(TOP_PROJECTS);
  const restSeconds = rest.reduce((sum, item) => sum + item.seconds, 0);
  if (top.length === 0) return null;

  return (
    // Omni: bento-картка з шапкою; смужки — кольором проєкту (це дані).
    <BentoCard compact icon="chart.pie.fill" accent="amber" title={tr.timeProjectBreakdown} style={style}>
      {top.map((item, i) => (
        <View key={item.projectId ?? 'personal'} style={{ marginTop: i === 0 ? 0 : 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
            <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.medium, marginLeft: 8, flex: 1 }}>
              {item.name}
            </Text>
            <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, marginRight: 8, ...dsType.numeric }}>{Math.round(item.share * 100)}%</Text>
            <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, ...dsType.numeric }}>{formatDuration(item.seconds)}</Text>
          </View>
          <View style={[s.progressBg, { backgroundColor: c.t.surface.subtle }]}>
            {/* Мінімум 2% ширини: смужка на 0.4% не читається як смужка,
                а рядок без неї виглядає як помилка малювання. */}
            <View style={[s.progressFill, { width: `${Math.max(2, Math.round(item.share * 100))}%`, backgroundColor: item.color }]} />
          </View>
        </View>
      ))}
      {rest.length > 0 && (
        <Text style={{ ...dsType.caption, color: c.sub, marginTop: 12, ...dsType.numeric }}>
          {tr.timeMoreProjects.replace('{count}', String(rest.length))} · {formatDuration(restSeconds)}
        </Text>
      )}
    </BentoCard>
  );
}

function StatCell({ value, label, color, sub, large }: { value: string; label: string; color: string; sub: string; large?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: large ? 22 : 16, paddingHorizontal: 4 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit
        style={{ color, fontFamily: fontFamily.light, fontSize: large ? 32 : 22, lineHeight: large ? 36 : 26,
          letterSpacing: large ? -0.64 : -0.44, ...dsType.numeric }}>{value}</Text>
      <Text numberOfLines={2} style={{ ...dsType.caption, color: sub, fontSize: large ? 12 : 11, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  statsRow: { flexDirection: 'row', borderRadius: radius.cardCompact },
  card: { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact },
  cardTitle: { ...dsType.h2 },
  progressBg: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: radius.pill },
});
