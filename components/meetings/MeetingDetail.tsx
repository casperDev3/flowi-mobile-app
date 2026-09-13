/**
 * components/meetings/MeetingDetail.tsx — ПЕРЕГЛЯД зустрічі.
 *
 * Винесено з app/meetings.tsx (renderDetail), бо ту саму деталь тепер
 * відкриває й екран Завдань: тап по зустрічі там раніше одразу відкривав
 * форму редагування, і просто подивитися посилання чи нотатки без ризику
 * щось зачепити було нічим. Дві копії однієї деталі розійшлися б на першій
 * же правці — тому компонент один.
 *
 * Розбитий на дві частини під DetailPane:
 *   MeetingDetailHeader — липка шапка (назва, час, ✎, ✕), стоїть поза прокруткою;
 *   MeetingDetailBody   — дата, місце, посилання, нотатки, записи, таймер, дії.
 *
 * Приймає РОЗГОРНУТИЙ екземпляр (`meeting`) і ОРИГІНАЛ (`original`): дата й
 * позначка повтору показуються такими, як людина натиснула в списку, а
 * таймер, протрекований час і записи — властивість оригіналу, бо копії
 * повторів існують лише в памʼяті.
 */
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MeetingProjectChip, type MeetingChipProject } from '@/components/meetings/MeetingProjectChip';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { ActiveTimer } from '@/utils/activeTimers';
import { formatClock, formatDuration } from '@/utils/durationFormat';
import { localDateKey } from '@/utils/dateUtils';
import { meetingTrackedSeconds, type Meeting } from '@/utils/meetings';
import { elapsedSince } from '@/utils/taskTimer';

const ACCENT = '#6366F1';
const GREEN = '#10B981';
const RED = '#EF4444';
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export interface MeetingDetailColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
}

type DurationTr = Pick<Translations, 'unitHour' | 'unitHourLong' | 'unitMinute'>;

function durationUnits(tr: DurationTr) {
  return { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute };
}

/** «Сьогодні» / «Завтра» / «3 дн тому» / «Понеділок, 14 вересня». */
export function meetingDayLabel(
  dateStr: string,
  now: Date,
  tr: Pick<Translations, 'today' | 'tomorrow' | 'meetingDaysAgo'>,
  locale: string,
): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateStr === localDateKey(today)) return tr.today;
  if (dateStr === localDateKey(tomorrow)) return tr.tomorrow;
  const d = new Date(`${dateStr}T00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return tr.meetingDaysAgo.replace('{n}', String(Math.abs(diff)));
  const label = d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Шапка ────────────────────────────────────────────────────────────────────

export interface MeetingDetailHeaderProps {
  meeting: Meeting;
  original: Meeting;
  onEdit: () => void;
  onClose: () => void;
  /** Колонка праворуч (планшет) — без «ручки» листа. */
  isExpanded: boolean;
  colors: MeetingDetailColors;
  tr: Translations;
}

export function MeetingDetailHeader({ meeting, original, onEdit, onClose, isExpanded, colors: c, tr }: MeetingDetailHeaderProps) {
  const recurring = !!meeting._origId || !!original.recurrence;
  const dur = formatDuration(Math.max(0, meeting.durationMinutes || 0) * 60, durationUnits(tr));
  return (
    <View style={st.headerWrap}>
      {!isExpanded ? <View style={[st.handle, { backgroundColor: c.border }]} /> : null}
      <View style={st.headerRow}>
        <View style={[st.colorBar, { backgroundColor: meeting.color }]} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} accessibilityRole="header" style={[st.title, { color: c.text }]}>
            {meeting.title}
          </Text>
          <View style={st.timeRow}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: meeting.color }}>{meeting.time || '--:--'}</Text>
            <Text style={{ fontSize: 13, color: c.sub }}>·</Text>
            <Text style={{ fontSize: 13, color: c.sub }}>{dur}</Text>
            {recurring ? (
              <IconSymbol name="repeat" size={12} color={meeting.color + 'BB'} />
            ) : null}
          </View>
        </View>
        <TouchableOpacity
          onPress={onEdit}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={tr.edit}
          style={st.headerBtn}>
          <IconSymbol name="pencil" size={17} color={c.sub} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={tr.close}
          style={st.headerBtn}>
          <IconSymbol name="xmark" size={17} color={c.sub} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Тіло ─────────────────────────────────────────────────────────────────────

export interface MeetingDetailBodyProps {
  meeting: Meeting;
  original: Meeting;
  /** Проєкт серії (meetingProject(original, projects)); null/відсутній — без чипа. */
  project?: MeetingChipProject | null;
  /** Таймер ОРИГІНАЛУ, якщо йде. */
  timer?: ActiveTimer;
  onToggleTimer: () => void;
  onEdit: () => void;
  /** Без цих колбеків блок записів і кнопка «Записати» не показуються (екран Завдань). */
  onRecord?: () => void;
  onPlayRecording?: (uri: string) => void;
  onDeleteRecording?: (uri: string) => void;
  playingUri?: string | null;
  colors: MeetingDetailColors;
  tr: Translations;
  locale: string;
}

export function MeetingDetailBody({
  meeting, original, project, timer, onToggleTimer, onEdit, onRecord, onPlayRecording, onDeleteRecording, playingUri,
  colors: c, tr, locale,
}: MeetingDetailBodyProps) {
  const units = durationUnits(tr);
  const tracked = meetingTrackedSeconds(original);
  const recordings = original.recordings ?? [];
  const showRecordings = recordings.length > 0 && !!onPlayRecording;

  const openLink = () => {
    const raw = (meeting.link ?? '').trim();
    if (!raw) return;
    const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    Linking.openURL(url).catch(e => {
      if (__DEV__) console.warn('[meetings] не вдалося відкрити посилання:', e);
    });
  };

  return (
    <View>
      {/* Проєкт — рівень серії, тому з оригіналу (екземпляри успадковують). */}
      {project ? (
        <View style={{ marginBottom: 8 }}>
          <MeetingProjectChip project={project} textColor={c.text} size="md" maxWidth={320} />
        </View>
      ) : null}

      {/* Date */}
      <View style={[st.row, { backgroundColor: c.dim }]}>
        <IconSymbol name="calendar" size={15} color={c.sub} />
        <Text style={[st.rowText, { color: c.text }]}>{meetingDayLabel(meeting.date, new Date(), tr, locale)}</Text>
      </View>

      {/* Location */}
      {meeting.location ? (
        <View style={[st.row, { backgroundColor: c.dim }]}>
          <IconSymbol name="mappin" size={15} color={c.sub} />
          <Text style={[st.rowText, { color: c.text, flex: 1 }]}>{meeting.location}</Text>
        </View>
      ) : null}

      {/* Link */}
      {meeting.link ? (
        <TouchableOpacity
          onPress={openLink}
          accessibilityRole="link"
          accessibilityLabel={tr.meetingOpenLink}
          activeOpacity={0.75}
          style={[st.row, { backgroundColor: ACCENT + '12', borderWidth: 1, borderColor: ACCENT + '30' }]}>
          <IconSymbol name="link" size={15} color={ACCENT} />
          <Text style={[st.rowText, { color: ACCENT, flex: 1, fontWeight: '600' }]} numberOfLines={1}>
            {meeting.link}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Notes */}
      {meeting.notes ? (
        <View style={[st.row, { backgroundColor: c.dim, alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }]}>
          <IconSymbol name="note.text" size={15} color={c.sub} />
          <Text style={{ fontSize: 13, color: c.sub, marginLeft: 10, flex: 1, lineHeight: 19 }}>{meeting.notes}</Text>
        </View>
      ) : null}

      {/* Recordings */}
      {showRecordings ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={[st.sectionLabel, { color: c.sub }]}>
            {tr.meetingRecordings.replace('{n}', String(recordings.length))}
          </Text>
          {recordings.map((uri, idx) => (
            <View key={uri} style={[st.row, { backgroundColor: ACCENT + '10', marginBottom: 6, borderWidth: 1, borderColor: ACCENT + '25' }]}>
              <IconSymbol name="waveform" size={15} color={ACCENT} />
              <Text style={[st.rowText, { color: c.text, flex: 1, fontSize: 13 }]}>
                {tr.meetingRecordingItem.replace('{n}', String(idx + 1))}
              </Text>
              <TouchableOpacity
                onPress={() => onPlayRecording?.(uri)}
                accessibilityRole="button"
                style={[st.smallBtn, { backgroundColor: ACCENT + '20' }]}>
                <IconSymbol name={playingUri === uri ? 'pause.fill' : 'play.fill'} size={12} color={ACCENT} />
              </TouchableOpacity>
              {onDeleteRecording ? (
                <TouchableOpacity
                  onPress={() => onDeleteRecording(uri)}
                  accessibilityRole="button"
                  accessibilityLabel={tr.delete}
                  style={[st.smallBtn, { backgroundColor: RED + '15', marginLeft: 4 }]}>
                  <IconSymbol name="trash" size={12} color={RED} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {/* Таймер наради. Реєстр той самий, що у завдань (active_timers), тому
          запущена звідси нарада видно й на вкладці «Час», і в повноекранній
          сітці. Завершена сесія лягає в timeEntries ОРИГІНАЛУ. */}
      <View style={[st.row, {
        backgroundColor: timer ? GREEN + '12' : c.dim,
        borderWidth: timer ? 1 : 0, borderColor: GREEN + '40',
      }]}>
        <IconSymbol name="timer" size={15} color={timer ? GREEN : c.sub} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          {timer ? (
            <ElapsedClock
              running
              seconds={now => elapsedSince(timer.startedAt, now)}
              format={formatClock}
              style={{ fontSize: 15, fontWeight: '800', color: GREEN }}
            />
          ) : (
            <Text style={{ fontSize: 14, color: c.text }}>
              {tracked > 0 ? formatDuration(tracked, units) : tr.meetingNotTracked}
            </Text>
          )}
          {timer && tracked > 0 ? (
            <Text style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>
              {tr.meetingTrackedBefore.replace('{time}', formatDuration(tracked, units))}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={onToggleTimer}
          accessibilityRole="button"
          accessibilityLabel={timer ? tr.meetingTimerStopA11y : tr.meetingTimerStartA11y}
          style={[st.btn, {
            paddingHorizontal: 14, gap: 6,
            backgroundColor: (timer ? RED : GREEN) + '18',
            borderWidth: 1, borderColor: (timer ? RED : GREEN) + '40',
          }]}>
          <IconSymbol name={timer ? 'stop.fill' : 'play.fill'} size={13} color={timer ? RED : GREEN} />
          <Text style={{ color: timer ? RED : GREEN, fontSize: 13, fontWeight: '700' }}>
            {timer ? tr.meetingTimerStop : tr.meetingTimerStart}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {onRecord ? (
          <TouchableOpacity
            onPress={onRecord}
            accessibilityRole="button"
            style={[st.btn, { flex: 1, gap: 6, backgroundColor: ACCENT + '18', borderWidth: 1, borderColor: ACCENT + '40' }]}>
            <IconSymbol name="mic.fill" size={16} color={ACCENT} />
            <Text style={{ color: ACCENT, fontSize: 14, fontWeight: '700' }}>{tr.meetingRecord}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onEdit}
          accessibilityRole="button"
          style={[st.btn, { flex: 1, gap: 6, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
          <IconSymbol name="pencil" size={16} color={c.text} />
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{tr.edit}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  headerWrap:   { paddingBottom: 14 },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  colorBar:     { width: 4, alignSelf: 'stretch', minHeight: 44, borderRadius: 2 },
  title:        { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  timeRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  headerBtn:    { width: 28, alignItems: 'center', justifyContent: 'center' },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginBottom: 8 },
  rowText:      { fontSize: 14, marginLeft: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  smallBtn:     { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  btn:          { paddingVertical: 11, borderRadius: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
