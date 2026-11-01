import { copyMeeting } from '@/utils/meetingSharing';
/**
 * components/tasks/TasksTodayPane.tsx — права колонка екрана Завдань на
 * широкому вікні, коли жодне завдання не вибране (рішення власника, п. 3).
 *
 * Порожня колонка «Оберіть завдання» нічого не давала; тут замість неї —
 * «Сьогодні»: зустрічі дня і графік активності дня (зустрічі за часом +
 * відстежений таймерами час, лінія «зараз»). Завдань тут навмисно немає —
 * вони вже в списку ліворуч (рішення власника 2026-10-07). Тап по зустрічі
 * відкриває її перегляд.
 *
 * Зустрічі приходять уже вибраними й упорядкованими з екрана (ті самі, що в
 * статистиці «Сьогодні» над списком); сесії таймерів колонка збирає сама
 * (buildDayActivity) — щоб блок сесії, що йде, ріс разом із годинником.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DayActivityTimeline } from '@/components/tasks/DayActivityTimeline';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { ActiveTimer } from '@/utils/activeTimers';
import { isSameDay } from '@/utils/dateUtils';
import { buildDayActivity, trackedMinutes, type DayActivityInput } from '@/utils/dayActivity';
import { formatDuration } from '@/utils/durationFormat';
import type { Meeting, TodayMeetingPhase } from '@/utils/meetings';
import { fontFamily, radius, shadow, type, type DSTheme, type GlassAccent } from '@/constants/theme';
import { dsTokensForText } from '@/components/tasks/dsTokensForText';
import { dsGlass } from '@/components/shared/dsTheme';
import type { IconSymbolName } from '@/components/ui/icon-symbol';

export interface TasksTodayPaneProps {
  today: Date;
  locale: string;
  /** Зустрічі дня з фазою (orderTodayMeetings). */
  meetings: readonly { meeting: Meeting; phase: TodayMeetingPhase }[];
  /**
   * Джерела відстеженого часу для графіка: завдання і СИРІ зустрічі (з їхніми
   * timeEntries) та таймери, що йдуть.
   */
  activitySources: {
    tasks: DayActivityInput['tasks'];
    meetings: DayActivityInput['meetings'];
    timers: readonly ActiveTimer[];
  };
  onOpenMeeting: (meeting: Meeting) => void;
  onOpenCalendar: () => void;
  colors: { text: string; sub: string; border: string; dim: string; accent: string };
  tr: Translations;
  /** Лише для тестів: зафіксований «зараз». */
  now?: Date;
}

/** «Зараз» з кроком у хвилину — частіше графіку оновлюватись нема сенсу. */
function useMinuteClock(fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed) { setNow(fixed); return; }
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [fixed]);
  return now;
}

export function TasksTodayPane({
  today, locale, meetings, activitySources, onOpenMeeting, onOpenCalendar, colors: c, tr, now: fixedNow,
}: TasksTodayPaneProps) {
  const t = dsTokensForText(c.text);
  const units = { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute };
  // Велика лише перша літера: textTransform 'capitalize' давав «1 Листопада».
  const dateRaw = today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1);
  const now = useMinuteClock(fixedNow);

  const { tasks: srcTasks, meetings: srcMeetings, timers } = activitySources;
  const activity = useMemo(
    () => buildDayActivity({ tasks: srcTasks, meetings: srcMeetings, timers, day: today, now }),
    [srcTasks, srcMeetings, timers, today, now],
  );
  const tracked = trackedMinutes(activity);
  const timelineMeetings = useMemo(() => meetings.map(r => r.meeting), [meetings]);
  const isToday = isSameDay(now, today);
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : null;

  return (
    <View style={st.root} testID="tasks-today-pane">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.content}>
        <Text accessibilityRole="header" style={[st.title, { color: c.text }]}>{tr.today}</Text>
        <Text style={[st.date, { color: c.sub }]}>{dateLabel}</Text>

        {/* ── Зустрічі дня ── Omni: ЄДИНА «темна» виділена картка екрана
            Завдань (як Meeting-картка референсу): рядки зустрічей і біла
            pill «Відкрити календар» унизу. */}
        <PaneCard
          t={t}
          variant="dark"
          title={tr.todayPaneMeetings}
          icon="calendar"
          accent="info"
          right={meetings.length > 0 ? <CountPill value={String(meetings.length)} /> : undefined}>
          <PaneMeetings
            meetings={meetings}
            locale={locale}
            units={units}
            onOpenMeeting={onOpenMeeting}
            tr={tr}
            nowColor={t.accent.coral}
          />
          <CalendarCta label={tr.todayPaneOpenCalendar} onPress={onOpenCalendar} />
        </PaneCard>

        {/* ── Графік активності дня ── */}
        <PaneCard
          t={t}
          title={tr.todayPaneActivity}
          icon="chart.bar.fill"
          accent="lavender"
          right={tracked > 0
            ? <CountPill value={`${tr.todayPaneTracked} ${formatDuration(Math.round(tracked) * 60, units)}`} />
            : undefined}>
          <DayActivityTimeline
            meetings={timelineMeetings}
            activity={activity}
            nowMin={nowMin}
            onOpenMeeting={onOpenMeeting}
            colors={c}
            tr={tr}
          />
          {activity.length === 0 && (
            <Text style={[st.trackHint, { color: c.sub }]}>{tr.todayPaneNoTracked}</Text>
          )}
        </PaneCard>

        <Text style={[st.hint, { color: c.sub }]}>{tr.detailEmptyHint}</Text>
      </ScrollView>
    </View>
  );
}

// ─── Картка колонки (Omni bento) ─────────────────────────────────────────────
//
// Локальний двійник BentoCard з components/ds: той тягне useDS() →
// store/theme-context → AsyncStorage, а колонка рендериться в юніт-тестах
// без мока сховища (див. dsTokensForText). Вигляд той самий: суцільна
// картка, шапка «icon-chip + назва» і праворуч лічильник; variant «dark» —
// виділена темна картка (t.featured) з білою pill-дією.

type PaneColors = {
  text: string; textSecondary: string; chipBg: string; nestedBg: string; actionBg: string; actionText: string;
};
const PaneColorsContext = createContext<PaneColors | null>(null);
function usePaneColors(): PaneColors {
  const ctx = useContext(PaneColorsContext);
  if (!ctx) throw new Error('usePaneColors поза PaneCard');
  return ctx;
}

function PaneCard({ t, variant = 'default', title, icon, accent, right, children }: {
  t: DSTheme;
  variant?: 'default' | 'dark';
  title: string;
  icon: IconSymbolName;
  accent: GlassAccent;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const isDarkTheme = t === dsTokensForText('#FFFFFF');
  const a = dsGlass(isDarkTheme).accent[accent];
  const dark = variant === 'dark';
  const colors: PaneColors = dark
    ? {
      text: t.featured.text, textSecondary: t.featured.textSecondary,
      chipBg: 'rgba(255,255,255,0.12)', nestedBg: 'rgba(255,255,255,0.08)',
      actionBg: t.featured.action, actionText: t.featured.actionText,
    }
    : {
      text: t.text.primary, textSecondary: t.text.secondary,
      chipBg: t.surface.subtle, nestedBg: t.surface.subtle,
      actionBg: t.action.primary, actionText: t.text.onAction,
    };
  return (
    <View style={[
      st.card,
      { backgroundColor: dark ? t.featured.bg : t.surface.card },
      shadow[isDarkTheme ? 'dark' : 'light'][dark ? 'popover' : 'card'],
    ]}>
      <PaneColorsContext.Provider value={colors}>
        <View style={st.cardHead}>
          <View style={[st.cardChip, { backgroundColor: dark ? colors.chipBg : a.tint }]}>
            <IconSymbol name={icon} size={16} color={dark ? colors.text : a.ink} />
          </View>
          <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.6} style={[st.cardTitle, { color: colors.text }]}>{title}</Text>
          {right}
        </View>
        {children}
      </PaneColorsContext.Provider>
    </View>
  );
}

/** Лічильник у шапці картки: нейтральна pill у кольорах картки. */
function CountPill({ value }: { value: string }) {
  const b = usePaneColors();
  return (
    <View style={[st.countPill, { backgroundColor: b.chipBg }]}>
      <Text style={{ color: b.text, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

/**
 * Рядки зустрічей усередині картки — кольори беруть з usePaneColors(), тож
 * на темній картці текст білий (≥ 4.5:1), а вкладені рядки — напівпрозорі
 * білі підкладки.
 */
function PaneMeetings({ meetings, locale, units, onOpenMeeting, tr, nowColor }: {
  meetings: TasksTodayPaneProps['meetings'];
  locale: string;
  units: { hour: string; hourLong: string; minute: string };
  onOpenMeeting: (meeting: Meeting) => void;
  tr: Translations;
  nowColor: string;
}) {
  const b = usePaneColors();
  if (meetings.length === 0) {
    return <Text style={[st.empty, { color: b.textSecondary, backgroundColor: b.nestedBg }]}>{tr.todayPaneNoMeetings}</Text>;
  }
  return (
    <View style={{ gap: 6 }}>
      {meetings.map(({ meeting, phase }) => {
        const duration = formatDuration(Math.max(0, meeting.durationMinutes) * 60, units);
        return (
          <TouchableOpacity
            key={meeting.id}
            onPress={() => onOpenMeeting(meeting)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`${meeting.time || ''} ${meeting.title}, ${duration}`.trim()}
            style={[st.meetingRow, { backgroundColor: b.nestedBg, opacity: phase === 'past' ? 0.6 : 1 }]}>
            <View style={[st.meetingBar, { backgroundColor: meeting.color }]} />
            <Text style={[st.meetingTime, { color: b.text }]}>{meeting.time || '--:--'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {phase === 'current' && <View style={[st.nowDot, { backgroundColor: nowColor }]} />}
                <Text numberOfLines={1} style={{ flex: 1, color: b.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{meeting.title}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr.copyText} onPress={event => { event.stopPropagation(); void copyMeeting(meeting, locale.startsWith('en')); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><IconSymbol name="doc.on.doc" size={16} color={b.textSecondary} /></TouchableOpacity>
              </View>
              <Text numberOfLines={1} style={[type.caption, type.numeric, { color: b.textSecondary, marginTop: 2 }]}>
                {duration}{meeting.location ? ` · ${meeting.location}` : ''}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={12} color={b.textSecondary} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Біла pill-дія на темній картці (Omni «Start Meeting»). */
function CalendarCta({ label, onPress }: { label: string; onPress: () => void }) {
  const b = usePaneColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.calendarBtn, { backgroundColor: b.actionBg }]}>
      <IconSymbol name="calendar" size={16} color={b.actionText} />
      <Text style={{ color: b.actionText, fontSize: 14, fontFamily: fontFamily.semibold }}>{label}</Text>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  // DetailPane центрує порожній стан — колонці «Сьогодні» потрібна вся висота й ширина.
  root:        { flex: 1, alignSelf: 'stretch' },
  content:     { paddingBottom: 40 },
  title:       { fontSize: 28, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  date:        { fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2, marginBottom: 6 },
  card:        { marginTop: 16, borderRadius: radius.cardCompact, padding: 16 },
  cardHead:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, minHeight: 36 },
  cardChip:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  cardTitle:   { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.semibold, flex: 1 },
  countPill:   { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  empty:       { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'center', borderRadius: radius.nested, overflow: 'hidden', paddingVertical: 16, paddingHorizontal: 12 },
  meetingRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: radius.nested, paddingVertical: 8, paddingLeft: 14, paddingRight: 10, overflow: 'hidden' },
  meetingBar:  { width: 8, height: 8, borderRadius: 4 },
  meetingTime: { fontSize: 14, fontFamily: fontFamily.medium, minWidth: 42, fontVariant: ['tabular-nums'] },
  nowDot:      { width: 6, height: 6, borderRadius: 3 },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 18, marginTop: 14 },
  trackHint:   { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 6 },
  hint:        { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 16 },
});
