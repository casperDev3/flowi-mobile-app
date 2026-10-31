import { copyMeeting } from '@/utils/meetingSharing';
/**
 * components/calendar/MeetingCard.tsx — картка зустрічі у списку дня календаря.
 *
 * Перенесена з app/meetings.tsx без зміни вигляду: календар успадкував
 * «Наради», і та сама нарада мусить виглядати впізнавано.
 *
 * Мемоізована: у списку дня карток буває багато, а колбеки приймають саму
 * зустріч аргументом — інлайн-стрілка на кожну картку ламала б порівняння.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MeetingProjectChip, type MeetingChipProject } from '@/components/meetings/MeetingProjectChip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { formatDuration, type DurationUnits } from '@/utils/durationFormat';
import type { Meeting } from '@/utils/meetings';

import type { CalendarColors } from './palette';
import { fontFamily, radius } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

/** Тривалість наради одиницями зі словника («1 год», «1 hr»). */
export function meetingDurationLabel(minutes: number, units: DurationUnits): string {
  return formatDuration(minutes * 60, units);
}

export const MeetingCard = React.memo(function MeetingCard({
  mtg, onPress, onDelete, onRecord, isDark, c, isRecurring = false, selected = false, tracking = false, project = null,
  deleteLabel, recordLabel,
}: {
  mtg: Meeting;
  onPress: (m: Meeting) => void;
  onDelete?: (m: Meeting) => void;
  onRecord?: (m: Meeting) => void;
  isDark: boolean;
  c: CalendarColors;
  isRecurring?: boolean;
  selected?: boolean;
  /** Іде таймер цієї наради. Керування — у деталі, тут лише позначка. */
  tracking?: boolean;
  /** Проєкт серії; null — без чипа. */
  project?: MeetingChipProject | null;
  deleteLabel: string;
  recordLabel: string;
}) {
  const { tr, lang } = useI18n();
  const dur = meetingDurationLabel(mtg.durationMinutes, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute });
  const mtgDt = new Date(`${mtg.date}T${mtg.time || '00:00'}`);
  const now = new Date();
  const isPast = mtgDt < now;
  const isNow = mtgDt <= now && new Date(mtgDt.getTime() + mtg.durationMinutes * 60000) > now;
  const hasRecordings = (mtg.recordings?.length ?? 0) > 0;
  const t = dsTokens(isDark);

  return (
    <TouchableOpacity
      onPress={() => onPress(mtg)}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${mtg.time || ''} ${mtg.title}`.trim()}
      accessibilityState={{ selected }}>
      <View style={[st.card, {
        opacity: !selected && isPast && !isNow ? 0.55 : 1,
        // DS v2: картка surface.card без бічної смуги; колір наради — крапка
        // біля часу, вибрана — subtle-тло з тонкою рамкою кольору наради.
        backgroundColor: selected ? glassOf(t).surfaceSubtle : c.card,
        borderWidth: selected ? 1.5 : 0,
        borderColor: mtg.color,
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ alignItems: 'center', minWidth: 52 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mtg.color }} />
              <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>{mtg.time || '--:--'}</Text>
            </View>
            <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'], marginTop: 1 }}>{dur}</Text>
          </View>
          <View style={{ width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: c.border, marginVertical: 2 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {isNow && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent.coral }} />}
              <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, flex: 1 }} numberOfLines={1}>{mtg.title}</Text>
              {isRecurring && <IconSymbol name="repeat" size={11} color={c.sub} />}
              {tracking && <IconSymbol name="timer" size={11} color={t.status.success} />}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <MeetingProjectChip project={project} textColor={c.text} />
              {mtg.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="mappin" size={10} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular }} numberOfLines={1}>{mtg.location}</Text>
                </View>
              ) : null}
              {mtg.link ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="link" size={10} color={c.accent} />
                  <Text style={{ color: c.accent, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.calJoin}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === 'en' ? 'Copy meeting details' : 'Копіювати інформацію про зустріч'} onPress={e => { e.stopPropagation(); void copyMeeting(mtg, lang === 'en'); }} style={[st.iconBtn, { backgroundColor: c.dim }]}>
            <IconSymbol name="doc.on.doc" size={16} color={c.sub} />
          </TouchableOpacity>
          {onRecord && (
            <TouchableOpacity
              onPress={e => { e.stopPropagation(); onRecord(mtg); }}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={recordLabel}
              style={[st.iconBtn, { backgroundColor: hasRecordings ? t.accent.lavenderSoft : c.dim }]}>
              <IconSymbol name={hasRecordings ? 'waveform' : 'mic'} size={13} color={hasRecordings ? c.accent : c.sub} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={e => { e.stopPropagation(); onDelete(mtg); }}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={deleteLabel}
              style={[st.iconBtn, { backgroundColor: c.dim }]}>
              <IconSymbol name="trash" size={13} color={t.status.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const st = StyleSheet.create({
  card: { borderRadius: radius.nested, paddingVertical: 12, paddingHorizontal: 12, overflow: 'hidden' },
  iconBtn: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
