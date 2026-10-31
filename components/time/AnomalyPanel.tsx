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

import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { TimeColors } from '@/components/time/TimePalette';
import { fontFamily, radius, space, type as dsType } from '@/constants/theme';
import type { Lang, Translations } from '@/store/translations';
import {
  entrySeconds,
  outlierFactor,
  trimmedSeconds,
  type AnomalyEntry,
  type AnomalyKind,
  type AnomalyReport,
} from '@/utils/timeAnomalies';
import type { TimeRecord } from '@/utils/timeEntries';
import { GlassSurface } from '@/components/ds';

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
    // Алерт DS v2: біла картка, корал — лише тіком-іконкою й крапками причин.
    <GlassSurface radius={radius.cardCompact} style={s.card}>
      <View style={s.headRow}>
        <View style={[s.headIcon, { backgroundColor: c.t.accent.coral + '1F' }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color={c.t.accent.coral} />
        </View>
        <Text style={[s.headTitle, { color: c.text }]}>
          {tr.anomalyCheckTitle
            .replace('{count}', String(reports.length))
            .replace('{noun}', recordsNoun(reports.length, tr, lang))}
        </Text>
      </View>

      {visible.map(({ entry, kinds, typicalSeconds }) => {
        const trim = trimmedSeconds(entry);
        const outlier = outlierText(entry, kinds, typicalSeconds, tr, lang, formatDuration);
        return (
          <View key={entry.id} style={[s.row, { borderTopColor: c.border }]}>
            <Text numberOfLines={1} style={[s.rowTitle, { color: c.text }]}>
              {entry.task?.trim() || tr.untitled}
            </Text>
            <Text style={[s.rowMeta, { color: c.sub }]}>
              {formatDate(entry.date)} · {formatDuration(entry.duration)}
            </Text>
            <View style={s.kindRow}>
              {kinds.map(kind => (
                <View key={kind} style={[s.kindPill, { backgroundColor: c.dim }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.t.accent.coral, marginRight: 5 }} />
                  <Text style={[s.kindText, { color: c.text }]}>{anomalyLabel(kind, tr)}</Text>
                </View>
              ))}
            </View>
            {outlier ? <Text style={[s.rowMeta, { color: c.text, marginTop: 6 }]}>{outlier}</Text> : null}
            <View style={s.actions}>
              {/* «Обрізати» є не завжди: коротку сесію обрізати нема куди, і
                  кнопка, що нічого не робить, гірша за її відсутність. */}
              {trim !== null && (
                <QuickAction
                  icon="scissors"
                  label={tr.anomalyTrimTo.replace('{duration}', formatDuration(trim))}
                  color={c.text}
                  border={c.dim}
                  onPress={() => onTrim(entry, trim)}
                />
              )}
              <QuickAction
                icon="pencil"
                label={tr.duration}
                color={c.text}
                border={c.dim}
                onPress={() => onEditDuration(entry)}
              />
              <QuickAction
                icon="checkmark"
                label={tr.anomalyMarkNormal}
                color={c.text}
                border={c.dim}
                onPress={() => onMarkNormal(entry)}
              />
              <QuickAction
                icon="trash"
                label={tr.delete}
                color={c.danger}
                border={c.dim}
                onPress={() => onDelete(entry)}
              />
            </View>
          </View>
        );
      })}

      {(hidden > 0 || expanded) && (
        <TouchableOpacity onPress={() => setExpanded(v => !v)} style={s.moreBtn}>
          <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>
            {expanded ? tr.collapseList : tr.anomalyShowMore.replace('{count}', String(hidden))}
          </Text>
        </TouchableOpacity>
      )}
    </GlassSurface>
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
  /** Тло pill-кнопки (surface.subtle). */
  border: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.action, { backgroundColor: border }]}>
      <IconSymbol name={icon} size={12} color={color} />
      <Text numberOfLines={1} style={{ color, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 5, ...dsType.numeric }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * «×3,1 від звичного · зазвичай 25 хв» — для викиду; `null`, коли запис не
 * викид або порівнювати не було з чим. Спільне для блоку й рядка списку
 * (`app/(tabs)/time.tsx`), щоб обидва казали те саме.
 */
export function outlierText(
  entry: AnomalyEntry,
  kinds: readonly AnomalyKind[],
  typicalSeconds: number | null,
  tr: Translations,
  lang: Lang,
  formatDuration: (seconds: number) => string,
): string | null {
  if (!kinds.includes('outlier') || !typicalSeconds) return null;
  const factor = outlierFactor(entrySeconds(entry), typicalSeconds);
  if (factor === null) return null;
  const factorText = lang === 'uk' ? String(factor).replace('.', ',') : String(factor);
  return tr.timeRowOutlier.replace('{factor}', factorText).replace('{typical}', formatDuration(typicalSeconds));
}

/**
 * Причини аномалії рядком для рядка списку: назви порушень, а викид — з
 * множником і типовою сесією замість загального «довше за звичне».
 */
export function anomalyReasonText(
  entry: AnomalyEntry,
  kinds: readonly AnomalyKind[],
  typicalSeconds: number | null,
  tr: Translations,
  lang: Lang,
  formatDuration: (seconds: number) => string,
): string {
  const outlier = outlierText(entry, kinds, typicalSeconds, tr, lang, formatDuration);
  return kinds
    .filter(kind => !(kind === 'outlier' && outlier))
    .map(kind => anomalyLabel(kind, tr))
    .concat(outlier ? [outlier] : [])
    .join(' · ');
}

/** Назва порушення — зі словника, щоб збігалась із вебом і з рештою інтерфейсу. */
export function anomalyLabel(kind: AnomalyKind, tr: Translations): string {
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
  card: { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headIcon: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headTitle: { ...dsType.h2, marginLeft: 10, flex: 1 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 12 },
  rowTitle: { fontSize: 14, fontFamily: fontFamily.semibold },
  rowMeta: { ...dsType.caption, marginTop: 2, ...dsType.numeric },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  kindPill: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  kindText: { fontSize: 11, fontFamily: fontFamily.semibold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: 36, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  moreBtn: { alignItems: 'center', paddingTop: 12 },
});
