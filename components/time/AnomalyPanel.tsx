/**
 * components/time/AnomalyPanel.tsx — блок «Перевір N записів».
 *
 * Показує лише те, що справді треба переглянути: правила — у чистому модулі
 * `utils/timeAnomalies.ts` (дзеркало вебового `lib/time-anomalies.ts`), тут
 * тільки показ і швидкі дії.
 *
 * Дій рівно чотири, і всі вони — з одного дотику: обрізати, змінити
 * тривалість, видалити, позначити нормальним. «Позначити нормальним» пише
 * прапорець у САМ запис, тож рішення переживає перезапуск і їде на інші
 * пристрої разом із записом, а не живе в памʼяті екрана.
 */

import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { TimeColors } from '@/components/time/TimePalette';
import type { Lang, Translations } from '@/store/translations';
import { trimmedSeconds, type AnomalyKind, type AnomalyReport } from '@/utils/timeAnomalies';
import type { TimeRecord } from '@/utils/timeEntries';

export interface AnomalyPanelProps {
  reports: AnomalyReport<TimeRecord>[];
  tr: Translations;
  /** Потрібна саме мова, а не лише словник: форма «запис/записи/записів» різна. */
  lang: Lang;
  c: TimeColors;
  isDark: boolean;
  formatDuration: (seconds: number) => string;
  formatDate: (iso: string) => string;
  onTrim: (entry: TimeRecord, seconds: number) => void;
  onEditDuration: (entry: TimeRecord) => void;
  onDelete: (entry: TimeRecord) => void;
  onMarkNormal: (entry: TimeRecord) => void;
}

/** Скільки рядків показуємо одразу. Решта — за «Показати всі». */
const PREVIEW = 3;

export function AnomalyPanel({
  reports,
  tr,
  lang,
  c,
  isDark,
  formatDuration,
  formatDate,
  onTrim,
  onEditDuration,
  onDelete,
  onMarkNormal,
}: AnomalyPanelProps) {
  const [expanded, setExpanded] = useState(false);
  if (!reports.length) return null;

  const visible = expanded ? reports : reports.slice(0, PREVIEW);
  const hidden = reports.length - visible.length;

  return (
    <BlurView
      intensity={isDark ? 22 : 40}
      tint={isDark ? 'dark' : 'light'}
      style={[s.card, { borderColor: c.warn + '55' }]}>
      <View style={s.headRow}>
        <View style={[s.headIcon, { backgroundColor: c.warn + '22' }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color={c.warn} />
        </View>
        <Text style={[s.headTitle, { color: c.text }]}>
          {tr.anomalyCheckTitle
            .replace('{count}', String(reports.length))
            .replace('{noun}', recordsNoun(reports.length, tr, lang))}
        </Text>
      </View>

      {visible.map(({ entry, kinds }) => {
        const trim = trimmedSeconds(entry);
        return (
          <View key={entry.id} style={[s.row, { borderColor: c.border }]}>
            <Text numberOfLines={1} style={[s.rowTitle, { color: c.text }]}>
              {entry.task?.trim() || tr.untitled}
            </Text>
            <Text style={[s.rowMeta, { color: c.sub }]}>
              {formatDate(entry.date)} · {formatDuration(entry.duration)}
            </Text>
            <View style={s.kindRow}>
              {kinds.map(kind => (
                <View key={kind} style={[s.kindPill, { borderColor: c.warn + '55', backgroundColor: c.warn + '18' }]}>
                  <Text style={[s.kindText, { color: c.warn }]}>{anomalyLabel(kind, tr)}</Text>
                </View>
              ))}
            </View>
            <View style={s.actions}>
              {/* «Обрізати» є не завжди: коротку сесію обрізати нема куди, і
                  кнопка, що нічого не робить, гірша за її відсутність. */}
              {trim !== null && (
                <QuickAction
                  icon="arrow.down.trend"
                  label={tr.anomalyTrimTo.replace('{duration}', formatDuration(trim))}
                  color={c.indigo}
                  border={c.border}
                  onPress={() => onTrim(entry, trim)}
                />
              )}
              <QuickAction
                icon="pencil"
                label={tr.duration}
                color={c.indigo}
                border={c.border}
                onPress={() => onEditDuration(entry)}
              />
              <QuickAction
                icon="checkmark"
                label={tr.anomalyMarkNormal}
                color="#10B981"
                border={c.border}
                onPress={() => onMarkNormal(entry)}
              />
              <QuickAction
                icon="trash"
                label={tr.delete}
                color={c.danger}
                border={c.border}
                onPress={() => onDelete(entry)}
              />
            </View>
          </View>
        );
      })}

      {(hidden > 0 || expanded) && (
        <TouchableOpacity onPress={() => setExpanded(v => !v)} style={s.moreBtn}>
          <Text style={{ color: c.indigo, fontSize: 13, fontWeight: '700' }}>
            {expanded ? tr.collapseList : tr.anomalyShowMore.replace('{count}', String(hidden))}
          </Text>
        </TouchableOpacity>
      )}
    </BlurView>
  );
}

function QuickAction({
  icon,
  label,
  color,
  border,
  onPress,
}: {
  icon: IconSymbolName;
  label: string;
  color: string;
  border: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.action, { borderColor: border }]}>
      <IconSymbol name={icon} size={12} color={color} />
      <Text numberOfLines={1} style={{ color, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Назва порушення — зі словника, щоб збігалась із вебом і з рештою інтерфейсу. */
function anomalyLabel(kind: AnomalyKind, tr: Translations): string {
  if (kind === 'long') return tr.anomalyLong;
  if (kind === 'midnight') return tr.anomalyMidnight;
  if (kind === 'outlier') return tr.anomalyOutlier;
  return tr.anomalyShort;
}

/**
 * «1 запис», «3 записи», «7 записів» — без цього заголовок читається калькою.
 *
 * Правило словʼянське, тож англійська йде окремою гілкою: за ним «21 record»
 * вийшло б в однині.
 */
function recordsNoun(count: number, tr: Translations, lang: Lang): string {
  if (lang !== 'uk') return count === 1 ? tr.anomalyRecordOne : tr.anomalyRecordMany;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return tr.anomalyRecordMany;
  const mod10 = count % 10;
  if (mod10 === 1) return tr.anomalyRecordOne;
  if (mod10 >= 2 && mod10 <= 4) return tr.anomalyRecordFew;
  return tr.anomalyRecordMany;
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  headIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 15, fontWeight: '800', marginLeft: 9, flex: 1 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  kindPill: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  kindText: { fontSize: 10, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  action: { flexDirection: 'row', alignItems: 'center', borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  moreBtn: { alignItems: 'center', paddingTop: 12 },
});
