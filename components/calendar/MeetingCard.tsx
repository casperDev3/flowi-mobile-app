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
import { Atlas } from '@/constants/atlas';
import { useI18n } from '@/store/i18n';
import { formatDuration, type DurationUnits } from '@/utils/durationFormat';
import type { Meeting } from '@/utils/meetings';

import { CALENDAR_ACCENT, type CalendarColors } from './palette';

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
  const { tr } = useI18n();
  const dur = meetingDurationLabel(mtg.durationMinutes, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute });
  const mtgDt = new Date(`${mtg.date}T${mtg.time || '00:00'}`);
  const now = new Date();
  const isPast = mtgDt < now;
  const isNow = mtgDt <= now && new Date(mtgDt.getTime() + mtg.durationMinutes * 60000) > now;
  const hasRecordings = (mtg.recordings?.length ?? 0) > 0;

  return (
    <TouchableOpacity
      onPress={() => onPress(mtg)}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${mtg.time || ''} ${mtg.title}`.trim()}
      accessibilityState={{ selected }}>
      <View style={[st.card, {
        opacity: !selected && isPast && !isNow ? 0.55 : 1,
        backgroundColor: selected ? mtg.color + '20' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
      }]}>
        <View style={[st.bar, { width: selected ? 5 : 3, backgroundColor: mtg.color }]} />
        <View style={{ marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ alignItems: 'center', minWidth: 50 }}>
            <Text style={{ color: mtg.color, fontSize: 15, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.3 }}>{mtg.time || '--:--'}</Text>
            <Text style={{ color: mtg.color + 'AA', fontSize: 10, fontWeight: '600', marginTop: 1 }}>{dur}</Text>
          </View>
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: mtg.color + '28', marginVertical: 2 }} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {isNow && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mtg.color }} />}
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>{mtg.title}</Text>
              {isRecurring && <IconSymbol name="repeat" size={11} color={mtg.color + 'CC'} />}
              {tracking && <IconSymbol name="timer" size={11} color="#10B981" />}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <MeetingProjectChip project={project} textColor={c.text} />
              {mtg.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="mappin" size={10} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 11 }} numberOfLines={1}>{mtg.location}</Text>
                </View>
              ) : null}
              {mtg.link ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="link" size={10} color={CALENDAR_ACCENT} />
                  <Text style={{ color: CALENDAR_ACCENT, fontSize: 11, fontWeight: '600' }}>{tr.calJoin}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {onRecord && (
            <TouchableOpacity
              onPress={e => { e.stopPropagation(); onRecord(mtg); }}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={recordLabel}
              style={[st.iconBtn, { backgroundColor: hasRecordings ? 'rgba(99,102,241,0.15)' : c.dim }]}>
              <IconSymbol name={hasRecordings ? 'waveform' : 'mic'} size={13} color={hasRecordings ? CALENDAR_ACCENT : c.sub} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              onPress={e => { e.stopPropagation(); onDelete(mtg); }}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={deleteLabel}
              style={[st.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              <IconSymbol name="trash" size={13} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

const st = StyleSheet.create({
  card: { borderRadius: Atlas.radius.medium, paddingVertical: 10, paddingHorizontal: 8, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderTopLeftRadius: Atlas.radius.medium, borderBottomLeftRadius: Atlas.radius.medium },
  iconBtn: { width: 36, height: 36, borderRadius: Atlas.radius.small, alignItems: 'center', justifyContent: 'center' },
});
