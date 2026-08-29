import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import type { TimelineBucket } from '@/utils/projectStats';

/** Короткий місяць мовою інтерфейсу — свого словника місяців тут не тримаємо. */
function monthLabel(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale, { month: 'short' });
}

/**
 * Міні-шкала розкиду робіт у часі — RN-версія веб-компонента.
 *
 * Побудована на ДЕДЛАЙНАХ, а не на датах початку: перших майже ніколи немає,
 * через що діаграма Ганта малювала смуги в один день. Виконана частина
 * стовпчика приглушена — видно не лише «скільки було», а й «скільки закрито».
 *
 * Малюється звичайними View, без react-native-svg: 12 прямокутників і крапка
 * не варті ще однієї нативної залежності в збірці.
 */
export const ProjectTimeline = React.memo(function ProjectTimeline({
  buckets, color, label, surface, border, sub,
}: {
  buckets: TimelineBucket[];
  /** Колір проєкту — той самий, що в смузі прогресу. */
  color: string;
  /** Назва проєкту: потрапляє в підпис для читалки екрана. */
  label: string;
  /** Суцільне тло картки: ним «гаситься» виконана частина стовпчика. */
  surface: string;
  border: string;
  sub: string;
}) {
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  if (buckets.length === 0) return null;

  const peak = Math.max(1, ...buckets.map(bucket => bucket.count));
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const from = monthLabel(first.start, locale);
  const to = monthLabel(last.start, locale);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={total
        ? `${label}: ${tr.projectTimelineSpread} (${total}), ${from} — ${to}`
        : `${label}: ${tr.projectTimelineEmpty}`}>
      <View style={st.chart}>
        {buckets.map(bucket => {
          // Мінімум 12% — інакше відрізок з однією задачею перетворюється на
          // ниточку й не відрізняється від порожнього.
          const height = bucket.count ? Math.max(12, (bucket.count / peak) * 100) : 0;
          const donePart = bucket.count ? (bucket.done / bucket.count) * 100 : 0;
          return (
            <View key={bucket.start} style={st.column}>
              {bucket.count ? (
                <View style={[st.bar, { height: `${height}%`, backgroundColor: color }]}>
                  <View style={[st.barDone, { height: `${donePart}%`, backgroundColor: surface }]} />
                </View>
              ) : (
                <View style={[st.emptyTick, { backgroundColor: border }]} />
              )}
            </View>
          );
        })}
      </View>

      {/* Позначка «сьогодні» — окремим рядком під шкалою, а не абсолютною
          крапкою: картка має overflow:'hidden', і виліт за межі зрізало б. */}
      <View style={st.markerRow}>
        {buckets.map(bucket => (
          <View key={bucket.start} style={st.column}>
            {bucket.current ? <View style={[st.marker, { backgroundColor: color }]} /> : null}
          </View>
        ))}
      </View>

      <View style={st.labels}>
        <Text style={[st.labelText, { color: sub }]}>{from}</Text>
        <Text style={[st.labelText, { color: sub }]}>{to}</Text>
      </View>
    </View>
  );
});

const st = StyleSheet.create({
  chart:      { height: 34, flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  column:     { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar:        { width: '100%', borderRadius: 3, overflow: 'hidden' },
  // Приглушення, а не інший колір: стовпчик читається як «стільки було,
  // стільки закрито», і палітра лишається одна на картку.
  barDone:    { width: '100%', opacity: 0.6 },
  emptyTick:  { width: '100%', height: 2, borderRadius: 1 },
  markerRow:  { height: 5, flexDirection: 'row', gap: 3, marginTop: 3 },
  marker:     { width: 4, height: 4, borderRadius: 2 },
  labels:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  labelText:  { fontSize: 10, fontWeight: '600' },
});
