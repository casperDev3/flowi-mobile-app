import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetingFormSheet, MeetingFormData, RecurrenceRule } from '@/components/shared/MeetingFormSheet';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location?: string;
  link?: string;
  notes?: string;
  color: string;
  recurrence?: RecurrenceRule;
  _origId?: string; // runtime-only: set on expanded recurring instances
}

type Span = 'day' | 'week' | 'month' | 'quarter';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#6366F1';
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const MONTHS_UA_GEN = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
const WEEKDAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const WEEKDAYS_FULL = ['Понеділок','Вівторок','Середа','Четвер','П\'ятниця','Субота','Неділя'];
const SPAN_LABELS: Record<Span, string> = { day: 'День', week: 'Тиждень', month: 'Місяць', quarter: 'Квартал' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const today = new Date();
today.setHours(0, 0, 0, 0);

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function expandRecurring(meeting: Meeting, fromDate: Date, toDate: Date): Meeting[] {
  if (!meeting.recurrence) return [meeting];
  const { freq, interval, daysOfWeek, until } = meeting.recurrence;
  const instances: Meeting[] = [];
  const start = new Date(meeting.date + 'T00:00');
  const limitTs = until
    ? Math.min(new Date(until + 'T00:00').getTime(), toDate.getTime())
    : toDate.getTime();
  const limit = new Date(limitTs);

  if (freq === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    // align cursor to Monday of the week containing `start`
    const dow0 = start.getDay();
    const daysBack = dow0 === 0 ? 6 : dow0 - 1;
    let weekCursor = addDays(start, -daysBack);
    let safety = 0;
    while (weekCursor <= limit && safety < 300) {
      for (const dayIdx of [...daysOfWeek].sort((a, b) => a - b)) {
        const candidate = addDays(weekCursor, dayIdx);
        if (candidate >= start && candidate <= limit) {
          const dateStr = toDateStr(candidate);
          instances.push({ ...meeting, id: `${meeting.id}_${dateStr}`, date: dateStr, _origId: meeting.id });
        }
      }
      weekCursor = addDays(weekCursor, interval * 7);
      safety++;
    }
  } else {
    let current = new Date(start);
    let safety = 0;
    while (current <= limit && safety < 500) {
      const dateStr = toDateStr(current);
      instances.push({ ...meeting, id: `${meeting.id}_${dateStr}`, date: dateStr, _origId: meeting.id });
      switch (freq) {
        case 'daily':   current = addDays(current, interval); break;
        case 'weekly':  current = addDays(current, interval * 7); break;
        case 'monthly': { const n = new Date(current); n.setMonth(n.getMonth() + interval); current = n; break; }
        case 'yearly':  { const n = new Date(current); n.setFullYear(n.getFullYear() + interval); current = n; break; }
      }
      safety++;
    }
  }
  return instances;
}

function durLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} хв`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}г ${m}хв` : `${h} год`;
}

function dayLabel(dateStr: string): string {
  const todayStr = toDateStr(today);
  const tomorrowStr = toDateStr(addDays(today, 1));
  if (dateStr === todayStr) return 'Сьогодні';
  if (dateStr === tomorrowStr) return 'Завтра';
  const d = new Date(dateStr + 'T00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} дн тому`;
  const dow = d.getDay();
  const dowIdx = dow === 0 ? 6 : dow - 1;
  return `${WEEKDAYS_FULL[dowIdx]}, ${d.getDate()} ${MONTHS_UA_GEN[d.getMonth()]}`;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

function useColors(isDark: boolean) {
  return {
    bg1:    isDark ? '#0A0C18' : '#EEF0FF',
    bg2:    isDark ? '#121525' : '#E2E5FF',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
    sheet:  isDark ? 'rgba(18,18,32,0.96)' : 'rgba(245,244,255,0.97)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    dim:    isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    text:   isDark ? '#F2F0FF' : '#1A1830',
    sub:    isDark ? 'rgba(210,205,255,0.45)' : 'rgba(80,70,140,0.55)',
    accent: ACCENT,
  };
}

// ─── CalendarGrid ─────────────────────────────────────────────────────────────

function CalendarGrid({ year, month, markedDays, selectedDate, onPrevMonth, onNextMonth, onSelectDay, c }: {
  year: number; month: number; markedDays: Set<string>; selectedDate: string | null;
  onPrevMonth: () => void; onNextMonth: () => void;
  onSelectDay: (d: Date) => void; c: ReturnType<typeof useColors>;
}) {
  const fd = (() => { const dow = new Date(year, month, 1).getDay(); return dow === 0 ? 6 : dow - 1; })();
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < fd; i++) cells.push(null);
  for (let i = 1; i <= dim; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = chunk(cells, 7);
  const todayStr = toDateStr(today);

  return (
    <View style={[{ borderRadius: 14, borderWidth: 1, padding: 12 }, { borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity onPress={onPrevMonth} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="chevron.left" size={18} color={c.sub} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 15, fontWeight: '700' }}>
          {MONTHS_UA[month]} {year}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="chevron.right" size={18} color={c.sub} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {WEEKDAYS_SHORT.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', marginBottom: 2 }}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={{ flex: 1 }} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isSel = selectedDate === dateStr;
            const hasMark = markedDays.has(dateStr);
            return (
              <TouchableOpacity key={di} onPress={() => onSelectDay(new Date(dateStr + 'T00:00'))}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}>
                <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSel ? ACCENT : 'transparent',
                  borderWidth: !isSel && isToday ? 1.5 : 0, borderColor: ACCENT }}>
                  <Text style={{ color: isSel ? '#fff' : isToday ? ACCENT : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                </View>
                {hasMark && !isSel && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT, marginTop: 1 }} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

function MeetingCard({ mtg, onPress, onDelete, isDark, c, showDate = false, isRecurring = false }: {
  mtg: Meeting; onPress: () => void; onDelete: () => void;
  isDark: boolean; c: ReturnType<typeof useColors>; showDate?: boolean; isRecurring?: boolean;
}) {
  const dur = durLabel(mtg.durationMinutes);
  const mtgDt = new Date(`${mtg.date}T${mtg.time || '00:00'}`);
  const now = new Date();
  const isPast = mtgDt < now;
  const isNow = mtgDt <= now && new Date(mtgDt.getTime() + mtg.durationMinutes * 60000) > now;
  const dateDisp = showDate ? dayLabel(mtg.date) : null;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.78}>
      <View style={[s.card, { opacity: isPast && !isNow ? 0.5 : 1, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)' }]}>
        {/* Left accent bar */}
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: mtg.color, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }} />

        <View style={{ marginLeft: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Time column */}
          <View style={{ alignItems: 'center', minWidth: 50 }}>
            <Text style={{ color: mtg.color, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }}>{mtg.time || '--:--'}</Text>
            <Text style={{ color: mtg.color + 'AA', fontSize: 10, fontWeight: '600', marginTop: 1 }}>{dur}</Text>
            {showDate && dateDisp && (
              <Text style={{ color: c.sub, fontSize: 9, fontWeight: '600', marginTop: 2, textAlign: 'center' }} numberOfLines={2}>{dateDisp}</Text>
            )}
          </View>

          {/* Thin separator */}
          <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: mtg.color + '28', marginVertical: 2 }} />

          {/* Info */}
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {isNow && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mtg.color, flexShrink: 0 }} />}
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>{mtg.title}</Text>
              {isRecurring && <IconSymbol name="repeat" size={11} color={mtg.color + 'CC'} />}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {mtg.location ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="mappin" size={10} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 11 }} numberOfLines={1}>{mtg.location}</Text>
                </View>
              ) : null}
              {mtg.link ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="link" size={10} color={ACCENT} />
                  <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '600' }}>Join</Text>
                </View>
              ) : null}
              {mtg.notes ? (
                <Text style={{ color: c.sub, fontSize: 11 }} numberOfLines={1}>{mtg.notes}</Text>
              ) : null}
            </View>
          </View>

          {/* Delete */}
          <TouchableOpacity onPress={e => { e.stopPropagation(); onDelete(); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="trash" size={12} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── WeekStrip ────────────────────────────────────────────────────────────────

function WeekStrip({ weekStart, meetingsByDate, selected, onSelect, c }: {
  weekStart: Date; meetingsByDate: Record<string, Meeting[]>;
  selected: string; onSelect: (s: string) => void;
  c: ReturnType<typeof useColors>;
}) {
  const todayStr = toDateStr(today);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i);
        const dStr = toDateStr(d);
        const cnt = (meetingsByDate[dStr] ?? []).length;
        const isSel = selected === dStr;
        const isToday = dStr === todayStr;
        const dow = d.getDay();
        const dowIdx = dow === 0 ? 6 : dow - 1;
        return (
          <TouchableOpacity key={dStr} onPress={() => onSelect(dStr)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
              backgroundColor: isSel ? ACCENT : isToday ? ACCENT + '15' : c.dim,
              borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: ACCENT }}>
            <Text style={{ color: isSel ? 'rgba(255,255,255,0.7)' : c.sub, fontSize: 10, fontWeight: '600' }}>
              {WEEKDAYS_SHORT[dowIdx]}
            </Text>
            <Text style={{ color: isSel ? '#fff' : isToday ? ACCENT : c.text, fontSize: 16, fontWeight: '700', marginTop: 2 }}>
              {d.getDate()}
            </Text>
            {cnt > 0 ? (
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSel ? 'rgba(255,255,255,0.8)' : ACCENT, marginTop: 3 }} />
            ) : (
              <View style={{ width: 6, height: 6, marginTop: 3 }} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MeetingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const c = useColors(isDark);

  // Data
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [initialized, setInitialized] = useState(false);

  // View span
  const [span, setSpan] = useState<Span>('week');

  // Week navigation
  const getWeekStart = (d: Date) => {
    const r = new Date(d);
    const dow = r.getDay();
    r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
    r.setHours(0, 0, 0, 0);
    return r;
  };
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));
  const [selectedDay, setSelectedDay] = useState(toDateStr(today));

  // Month/quarter navigation
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Add/edit modal
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState<MeetingFormData | null>(null);
  const [formPresetDate, setFormPresetDate] = useState<string | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    loadData<Meeting[]>('meetings', []).then(m => { setMeetings(m); setInitialized(true); });
  }, []));

  // Save on change
  const saveMeetings = useCallback((updated: Meeting[]) => {
    setMeetings(updated);
    if (initialized) saveData('meetings', updated);
  }, [initialized]);

  // ─── Computed ─────────────────────────────────────────────────────────────

  const expandedMeetings = useMemo(() => {
    const past = new Date(today); past.setFullYear(past.getFullYear() - 1);
    const future = new Date(today); future.setFullYear(future.getFullYear() + 2);
    const result: Meeting[] = [];
    meetings.forEach(m => {
      if (!m.recurrence) {
        result.push(m);
      } else {
        expandRecurring(m, past, future).forEach(inst => result.push(inst));
      }
    });
    return result;
  }, [meetings]);

  const meetingsByDate = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    expandedMeetings.forEach(m => {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
      map[m.date].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    });
    return map;
  }, [expandedMeetings]);

  const spanRange = useMemo(() => {
    const todayStr = toDateStr(today);
    if (span === 'day') return { start: selectedDay, end: selectedDay };
    if (span === 'week') {
      return { start: toDateStr(weekStart), end: toDateStr(addDays(weekStart, 6)) };
    }
    if (span === 'month') {
      const start = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
      const end = toDateStr(new Date(viewYear, viewMonth + 1, 0));
      return { start, end };
    }
    // quarter
    const qStart = new Date(viewYear, viewMonth, 1);
    const qEnd = new Date(viewYear, viewMonth + 3, 0);
    return { start: toDateStr(qStart), end: toDateStr(qEnd) };
  }, [span, selectedDay, weekStart, viewYear, viewMonth]);

  const spanMeetings = useMemo(() => {
    return expandedMeetings
      .filter(m => m.date >= spanRange.start && m.date <= spanRange.end)
      .sort((a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`));
  }, [expandedMeetings, spanRange]);

  const groupedMeetings = useMemo(() => {
    const groups: { date: string; label: string; items: Meeting[] }[] = [];
    spanMeetings.forEach(m => {
      const last = groups[groups.length - 1];
      if (last && last.date === m.date) {
        last.items.push(m);
      } else {
        groups.push({ date: m.date, label: dayLabel(m.date), items: [m] });
      }
    });
    return groups;
  }, [spanMeetings]);

  const stats = useMemo(() => {
    const total = spanMeetings.length;
    const mins = spanMeetings.reduce((s, m) => s + m.durationMinutes, 0);
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    const timeStr = hours > 0 ? `${hours}г${remMins ? ` ${remMins}хв` : ''}` : remMins ? `${remMins}хв` : '0хв';
    return { total, timeStr };
  }, [spanMeetings]);

  const dayMeetings = useMemo(() => (meetingsByDate[selectedDay] ?? []), [meetingsByDate, selectedDay]);

  const markedDays = useMemo(() => new Set(Object.keys(meetingsByDate)), [meetingsByDate]);

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  const openAdd = useCallback((presetDate?: string) => {
    setFormInitial(null);
    setFormPresetDate(presetDate);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((m: Meeting) => {
    setFormInitial({ id: m.id, title: m.title, date: m.date, time: m.time, durationMinutes: m.durationMinutes,
      location: m.location, link: m.link, notes: m.notes, color: m.color, recurrence: m.recurrence });
    setFormPresetDate(undefined);
    setShowForm(true);
  }, []);

  const handleFormSave = useCallback((data: MeetingFormData) => {
    if (data.id) {
      saveMeetings(meetings.map(m => m.id !== data.id ? m : {
        ...m, title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes,
        location: data.location, link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }));
    } else {
      saveMeetings([...meetings, { id: Date.now().toString(), title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location, link: data.link,
        notes: data.notes, color: data.color, recurrence: data.recurrence }]);
    }
    setShowForm(false);
  }, [meetings, saveMeetings]);

  const deleteMeeting = useCallback((id: string) => {
    Alert.alert('Видалити зустріч?', 'Цю дію не можна скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => saveMeetings(meetings.filter(m => m.id !== id)) },
    ]);
  }, [meetings, saveMeetings]);

  // ─── Span label ───────────────────────────────────────────────────────────

  const spanTitle = useMemo(() => {
    if (span === 'day') return dayLabel(selectedDay);
    if (span === 'week') {
      const ws = weekStart; const we = addDays(weekStart, 6);
      if (ws.getMonth() === we.getMonth())
        return `${ws.getDate()}–${we.getDate()} ${MONTHS_UA_GEN[ws.getMonth()]} ${ws.getFullYear()}`;
      return `${ws.getDate()} ${MONTHS_UA_GEN[ws.getMonth()]} – ${we.getDate()} ${MONTHS_UA_GEN[we.getMonth()]}`;
    }
    if (span === 'month') return `${MONTHS_UA[viewMonth]} ${viewYear}`;
    // quarter
    const qEnd = new Date(viewYear, viewMonth + 3, 0);
    return `${MONTHS_UA[viewMonth]} – ${MONTHS_UA[qEnd.getMonth()]} ${viewYear}`;
  }, [span, selectedDay, weekStart, viewYear, viewMonth]);

  // ─── Navigation helpers ───────────────────────────────────────────────────

  const goBack = () => {
    if (span === 'day') {
      const prev = addDays(new Date(selectedDay + 'T00:00'), -1);
      setSelectedDay(toDateStr(prev));
    } else if (span === 'week') {
      setWeekStart(w => addDays(w, -7));
      setSelectedDay(toDateStr(addDays(weekStart, -7)));
    } else {
      if (viewMonth === 0) { setViewMonth(9); setViewYear(y => y - 1); }
      else setViewMonth(m => m - (span === 'quarter' ? 3 : 1));
    }
  };

  const goFwd = () => {
    if (span === 'day') {
      const next = addDays(new Date(selectedDay + 'T00:00'), 1);
      setSelectedDay(toDateStr(next));
    } else if (span === 'week') {
      setWeekStart(w => addDays(w, 7));
      setSelectedDay(toDateStr(addDays(weekStart, 7)));
    } else {
      if (span === 'quarter') {
        if (viewMonth >= 9) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 3);
      } else {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
      }
    }
  };

  const goToday = () => {
    setSelectedDay(toDateStr(today));
    setWeekStart(getWeekStart(today));
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };

  const isCurrentPeriod = useMemo(() => {
    const todayStr = toDateStr(today);
    return todayStr >= spanRange.start && todayStr <= spanRange.end;
  }, [spanRange]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[c.bg1, c.bg2]} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* ── Header ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 10 }}>
          <TouchableOpacity onPress={() => router.back()}
            style={[s.hBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
            <IconSymbol name="chevron.left" size={18} color={c.sub} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>Зустрічі</Text>
          </View>
          <TouchableOpacity onPress={goToday}
            style={[s.hBtn, { borderColor: isCurrentPeriod ? ACCENT + '50' : c.border, backgroundColor: isCurrentPeriod ? ACCENT + '14' : c.dim }]}>
            <IconSymbol name="calendar" size={16} color={isCurrentPeriod ? ACCENT : c.sub} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openAdd()}
            style={[s.hBtn, { borderColor: ACCENT + '50', backgroundColor: ACCENT + '14' }]}>
            <IconSymbol name="plus" size={18} color={ACCENT} />
          </TouchableOpacity>
        </View>

        {/* ── Span tabs ── */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 14, backgroundColor: c.dim, borderRadius: 13, padding: 3 }}>
          {(Object.keys(SPAN_LABELS) as Span[]).map(key => (
            <TouchableOpacity key={key} onPress={() => setSpan(key)}
              style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 11,
                backgroundColor: span === key ? ACCENT : 'transparent' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: span === key ? '#fff' : c.sub }}>
                {SPAN_LABELS[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Period navigation ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 10 }}>
          <TouchableOpacity onPress={goBack}
            style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.left" size={15} color={c.sub} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 14, fontWeight: '700' }}>{spanTitle}</Text>
          <TouchableOpacity onPress={goFwd}
            style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.right" size={15} color={c.sub} />
          </TouchableOpacity>
        </View>

        {/* ── Stats row ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginBottom: 14 }}>
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
            style={[s.statCard, { borderColor: c.border, flex: 1 }]}>
            <Text style={{ color: ACCENT, fontSize: 22, fontWeight: '800' }}>{stats.total}</Text>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>зустрічей</Text>
          </BlurView>
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
            style={[s.statCard, { borderColor: c.border, flex: 1 }]}>
            <Text style={{ color: ACCENT, fontSize: 22, fontWeight: '800' }}>{stats.timeStr}</Text>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>загальний час</Text>
          </BlurView>
        </View>

        {/* ── Week strip ── */}
        {span === 'week' && (
          <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
            <WeekStrip weekStart={weekStart} meetingsByDate={meetingsByDate} selected={selectedDay} onSelect={setSelectedDay} c={c} />
          </View>
        )}

        {/* ── Content ── */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }} showsVerticalScrollIndicator={false}>

          {/* Day view: timeline */}
          {(span === 'day' || (span === 'week' && selectedDay)) && span !== 'month' && span !== 'quarter' && (() => {
            const list = span === 'day' ? (meetingsByDate[selectedDay] ?? []) : dayMeetings;
            return (
              <View>
                {list.length === 0 ? (
                  <TouchableOpacity onPress={() => openAdd(selectedDay)} activeOpacity={0.7}
                    style={[s.emptyBox, { borderColor: c.border }]}>
                    <IconSymbol name="calendar.badge.plus" size={28} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', marginTop: 10 }}>Немає зустрічей</Text>
                    <Text style={{ color: c.sub, fontSize: 12, opacity: 0.7, marginTop: 4 }}>Натисніть, щоб додати</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ gap: 8 }}>
                    {list.map(mtg => {
                      const origMtg = mtg._origId ? (meetings.find(m => m.id === mtg._origId) ?? mtg) : mtg;
                      return (
                        <MeetingCard key={mtg.id} mtg={mtg} isDark={isDark} c={c}
                          isRecurring={!!mtg._origId}
                          onPress={() => openEdit(origMtg)} onDelete={() => deleteMeeting(origMtg.id)} />
                      );
                    })}
                    <TouchableOpacity onPress={() => openAdd(selectedDay)} activeOpacity={0.7}
                      style={[s.addMoreBtn, { borderColor: c.border }]}>
                      <IconSymbol name="plus" size={13} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>Додати зустріч</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })()}

          {/* Month/Quarter view: grouped by date */}
          {(span === 'month' || span === 'quarter') && (
            <View>
              {groupedMeetings.length === 0 ? (
                <TouchableOpacity onPress={() => openAdd()} activeOpacity={0.7}
                  style={[s.emptyBox, { borderColor: c.border }]}>
                  <IconSymbol name="calendar.badge.plus" size={28} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', marginTop: 10 }}>Немає зустрічей</Text>
                  <Text style={{ color: c.sub, fontSize: 12, opacity: 0.7, marginTop: 4 }}>Натисніть, щоб додати</Text>
                </TouchableOpacity>
              ) : (
                groupedMeetings.map(group => (
                  <View key={group.date} style={{ marginBottom: 16 }}>
                    {/* Date header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
                        {group.label}
                      </Text>
                      <View style={{ backgroundColor: ACCENT + '18', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{group.items.length}</Text>
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      {group.items.map(mtg => {
                        const origMtg = mtg._origId ? (meetings.find(m => m.id === mtg._origId) ?? mtg) : mtg;
                        return (
                          <MeetingCard key={mtg.id} mtg={mtg} isDark={isDark} c={c}
                            isRecurring={!!mtg._origId}
                            onPress={() => openEdit(origMtg)} onDelete={() => deleteMeeting(origMtg.id)} />
                        );
                      })}
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={() => openAdd()} activeOpacity={0.85}
        style={[s.fab, { backgroundColor: ACCENT }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      <MeetingFormSheet
        visible={showForm}
        initial={formInitial}
        presetDate={formPresetDate}
        onClose={() => setShowForm(false)}
        onSave={handleFormSave}
        onDelete={formInitial?.id ? () => { deleteMeeting(formInitial!.id!); setShowForm(false); } : undefined}
        isDark={isDark}
        lang="uk"
        tr={{}}
        markedDays={markedDays}
      />
    </LinearGradient>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  hBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statCard: { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', overflow: 'hidden' },
  card:     { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 8, overflow: 'hidden' },
  emptyBox: { alignItems: 'center', paddingVertical: 48, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  addMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 10 },
  fab:      { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 48 : 28, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:    { borderRadius: 22, borderWidth: 1, padding: 16, overflow: 'hidden' },
  label:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', marginBottom: 6, marginTop: 12 },
  input:    { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  inp:      { borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: '600', borderWidth: 1.5 },
  pill:     { flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 },
  detailRow:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  row:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11 },
  chip:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  btn:      { paddingVertical: 11, borderRadius: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  fieldBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12 },
});
