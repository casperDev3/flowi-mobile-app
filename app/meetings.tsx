import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetingFormSheet, MeetingFormData, RecurrenceRule } from '@/components/shared/MeetingFormSheet';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isOnlineMode } from '@/store/app-mode';
import { cancelMeetingNotification, scheduleMeetingNotification } from '@/store/notifications';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';

// ─── expo-av conditional (install with: npx expo install expo-av) ────────────
let AVAudio: any = null;
try { AVAudio = require('expo-av').Audio; } catch {}

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
  _origId?: string;    // runtime-only: set on expanded recurring instances
  gcalId?: string;     // Google Calendar event ID (for dedup)
  recordings?: string[]; // local audio file URIs
}

type Span = 'day' | 'week' | 'month' | 'quarter';

// ─── Google Calendar config ───────────────────────────────────────────────────
const GCAL_REDIRECT    = 'ftrackingapp://auth';
const GCAL_SCOPES      = 'https://www.googleapis.com/auth/calendar.readonly';
const GCAL_TOKEN_KEY   = 'gcal_access_token';
const GCAL_REFRESH_KEY = 'gcal_refresh_token';
const GCAL_EXPIRY_KEY  = 'gcal_token_expiry';
const GCAL_CLIENT_KEY  = 'gcal_client_id';

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function generateVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let r = '';
  for (let i = 0; i < 128; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function encodeParams(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function pkceChallenge(verifier: string): Promise<string> {
  try {
    const data = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch {
    return verifier; // fallback to plain (less secure but functional)
  }
}

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
    sub:    isDark ? 'rgba(210,205,255,0.62)' : 'rgba(80,70,140,0.58)',
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

function MeetingCard({ mtg, onPress, onDelete, onRecord, isDark, c, showDate = false, isRecurring = false }: {
  mtg: Meeting; onPress: () => void; onDelete: () => void; onRecord?: () => void;
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

          {/* Record */}
          {onRecord && (
            <TouchableOpacity onPress={e => { e.stopPropagation(); onRecord(); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 28, height: 28, borderRadius: 8,
                backgroundColor: (mtg.recordings?.length ?? 0) > 0 ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.07)',
                alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol name={(mtg.recordings?.length ?? 0) > 0 ? 'waveform' : 'mic'} size={12}
                color={(mtg.recordings?.length ?? 0) > 0 ? ACCENT : c.sub} />
            </TouchableOpacity>
          )}

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

  // Detail popup
  const [selectedMtg, setSelectedMtg]     = useState<Meeting | null>(null);

  // Add/edit modal
  const [showForm, setShowForm]           = useState(false);
  const [formInitial, setFormInitial]     = useState<MeetingFormData | null>(null);
  const [formPresetDate, setFormPresetDate] = useState<string | undefined>(undefined);

  // Google Calendar
  const [gcalClientId, setGcalClientId]   = useState('');
  const [gcalClientInput, setGcalClientInput] = useState('');
  const gcalClientIdRef = useRef('');
  const [gcalToken, setGcalToken]         = useState<string | null>(null);
  const [gcalImporting, setGcalImporting] = useState(false);
  const [gcalLastSync, setGcalLastSync]   = useState<string | null>(null);
  const [showGcalSheet, setShowGcalSheet] = useState(false);
  const [gcalImportCount, setGcalImportCount] = useState(0);

  // Recording
  const [recordingMtgId, setRecordingMtgId] = useState<string | null>(null);
  const [isRecording, setIsRecording]     = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingUri, setPlayingUri]       = useState<string | null>(null);
  const recordingRef = useRef<any>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<any>(null);

  useFocusEffect(useCallback(() => {
    loadData<Meeting[]>('meetings', []).then(m => { setMeetings(m); setInitialized(true); });
    // Load GCal config
    AsyncStorage.getItem(GCAL_CLIENT_KEY).then(id => {
      const cid = id ?? '';
      setGcalClientId(cid);
      gcalClientIdRef.current = cid;
    });
    AsyncStorage.getItem(GCAL_TOKEN_KEY).then(t => setGcalToken(t));
    AsyncStorage.getItem('gcal_last_sync').then(t => setGcalLastSync(t));
  }, []));

  // Save on change
  const saveMeetings = useCallback((updated: Meeting[]) => {
    setMeetings(updated);
    if (initialized) void saveSynced('meetings', updated);
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

  // ─── Google Calendar ──────────────────────────────────────────────────────

  const saveGcalClientId = useCallback(async (id: string) => {
    const trimmed = id.trim();
    await AsyncStorage.setItem(GCAL_CLIENT_KEY, trimmed);
    setGcalClientId(trimmed);
    gcalClientIdRef.current = trimmed;
    setGcalClientInput('');
  }, []);

  const connectGoogleCalendar = useCallback(async () => {
    if (!isOnlineMode()) { Alert.alert('Офлайн', 'Недоступно в офлайн-режимі'); return; }
    const clientId = gcalClientIdRef.current;
    if (!clientId) return;
    try {
      const verifier   = generateVerifier();
      const challenge  = await pkceChallenge(verifier);
      const authUrl    = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(GCAL_REDIRECT)}&` +
        `response_type=code&scope=${encodeURIComponent(GCAL_SCOPES)}&` +
        `code_challenge=${challenge}&code_challenge_method=S256&` +
        `access_type=offline&prompt=consent`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, GCAL_REDIRECT);
      if (result.type !== 'success') return;

      const codeMatch = result.url.match(/[?&]code=([^&]+)/);
      const code = codeMatch ? decodeURIComponent(codeMatch[1]) : null;
      if (!code) throw new Error('No auth code');

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeParams({
          code,
          client_id: clientId,
          redirect_uri: GCAL_REDIRECT,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(tokenData.error_description ?? 'Token exchange failed');

      await AsyncStorage.setItem(GCAL_TOKEN_KEY,   tokenData.access_token);
      await AsyncStorage.setItem(GCAL_REFRESH_KEY, tokenData.refresh_token ?? '');
      await AsyncStorage.setItem(GCAL_EXPIRY_KEY,
        String(Date.now() + (tokenData.expires_in ?? 3600) * 1000));

      setGcalToken(tokenData.access_token);
      setShowGcalSheet(false);
      setTimeout(() => importFromGoogleCalendar(tokenData.access_token), 300);
    } catch (e: any) {
      if (__DEV__) console.warn('[gcal] connect error:', e);
      Alert.alert('Помилка підключення', e?.message ?? 'Спробуйте ще раз.');
    }
  }, []);

  const getValidGcalToken = useCallback(async (): Promise<string | null> => {
    const expiry = await AsyncStorage.getItem(GCAL_EXPIRY_KEY);
    if (expiry && Date.now() < Number(expiry) - 60000) {
      return await AsyncStorage.getItem(GCAL_TOKEN_KEY);
    }
    // Try refresh
    const refreshToken = await AsyncStorage.getItem(GCAL_REFRESH_KEY);
    const clientId = gcalClientIdRef.current;
    if (!refreshToken || !clientId) return null;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeParams({
          refresh_token: refreshToken,
          client_id: clientId,
          grant_type: 'refresh_token',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error('Refresh failed');
      await AsyncStorage.setItem(GCAL_TOKEN_KEY, data.access_token);
      await AsyncStorage.setItem(GCAL_EXPIRY_KEY, String(Date.now() + (data.expires_in ?? 3600) * 1000));
      setGcalToken(data.access_token);
      return data.access_token;
    } catch {
      return null;
    }
  }, []);

  const importFromGoogleCalendar = useCallback(async (token?: string) => {
    if (!isOnlineMode()) return;
    const accessToken = token ?? await getValidGcalToken();
    if (!accessToken) {
      Alert.alert('Потрібна авторизація', 'Підключіть Google Calendar.');
      return;
    }
    setGcalImporting(true);
    try {
      const now        = new Date();
      const timeMin    = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const timeMax    = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&` +
        `singleEvents=true&orderBy=startTime&maxResults=250`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`GCal API ${res.status}`);
      const data = await res.json();

      let importedCount = 0;
      const current = await loadData<Meeting[]>('meetings', []);
      const existing = new Set(current.map(m => m.gcalId).filter(Boolean));
      const toAdd: Meeting[] = [];

      for (const ev of (data.items ?? []) as any[]) {
        if (ev.status === 'cancelled') continue;
        if (existing.has(ev.id)) continue;

        const startRaw: string = ev.start?.dateTime ?? ev.start?.date ?? '';
        const endRaw: string   = ev.end?.dateTime   ?? ev.end?.date   ?? '';
        if (!startRaw) continue;

        const startDt  = new Date(startRaw);
        const endDt    = new Date(endRaw || startRaw);
        const dateStr  = toDateStr(startDt);
        const timeStr  = ev.start?.dateTime
          ? `${String(startDt.getHours()).padStart(2,'0')}:${String(startDt.getMinutes()).padStart(2,'0')}`
          : '00:00';
        const duration = Math.round((endDt.getTime() - startDt.getTime()) / 60000) || 60;

        toAdd.push({
          id:              `gcal_${ev.id}`,
          gcalId:          ev.id,
          title:           ev.summary ?? 'Без назви',
          date:            dateStr,
          time:            timeStr,
          durationMinutes: Math.max(5, duration),
          location:        ev.location,
          link:            ev.hangoutLink ?? ev.htmlLink,
          notes:           ev.description ? ev.description.replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
          color:           '#6366F1',
        });
        importedCount++;
      }

      if (toAdd.length > 0) {
        const updated = [...current, ...toAdd];
        saveMeetings(updated);
      }

      const syncTime = new Date().toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      await AsyncStorage.setItem('gcal_last_sync', syncTime);
      setGcalLastSync(syncTime);
      setGcalImportCount(importedCount);
    } catch (e: any) {
      if (__DEV__) console.warn('[gcal] import error:', e);
      Alert.alert('Помилка синхронізації', e?.message ?? 'Спробуйте пізніше.');
    } finally {
      setGcalImporting(false);
    }
  }, [getValidGcalToken, saveMeetings]);

  const disconnectGoogleCalendar = useCallback(() => {
    Alert.alert('Відключити Google Calendar?', 'Вже імпортовані зустрічі залишаться.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Відключити', style: 'destructive', onPress: async () => {
        await AsyncStorage.multiRemove([GCAL_TOKEN_KEY, GCAL_REFRESH_KEY, GCAL_EXPIRY_KEY, 'gcal_last_sync']);
        setGcalToken(null); setGcalLastSync(null); setShowGcalSheet(false);
      }},
    ]);
  }, []);

  // ─── Recording ────────────────────────────────────────────────────────────

  const startRecording = useCallback(async (mtgId: string) => {
    if (!AVAudio) {
      Alert.alert('Потрібен пакет', 'Встановіть: npx expo install expo-av');
      return;
    }
    try {
      const { granted } = await AVAudio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Немає дозволу', 'Дозвольте доступ до мікрофону в налаштуваннях.'); return; }
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await AVAudio.Recording.createAsync(AVAudio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setRecordingMtgId(mtgId);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (e: any) {
      if (__DEV__) console.warn('[record] start error:', e);
      Alert.alert('Помилка запису', e?.message);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri && recordingMtgId) {
        const origId = recordingMtgId.includes('_') ? recordingMtgId.split('_')[0] : recordingMtgId;
        saveMeetings(meetings.map(m => m.id === origId
          ? { ...m, recordings: [...(m.recordings ?? []), uri] }
          : m
        ));
      }
      setRecordingMtgId(null);
      setRecordingSeconds(0);
    } catch (e: any) {
      if (__DEV__) console.warn('[record] stop error:', e);
    }
  }, [recordingMtgId, meetings, saveMeetings]);

  const playRecording = useCallback(async (uri: string) => {
    if (!AVAudio) return;
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; setPlayingUri(null); }
      if (playingUri === uri) return;
      const { sound } = await AVAudio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlayingUri(uri);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) { setPlayingUri(null); sound.unloadAsync(); soundRef.current = null; }
      });
    } catch (e: any) {
      if (__DEV__) console.warn('[record] play error:', e);
    }
  }, [playingUri]);

  const deleteRecording = useCallback((mtgId: string, uri: string) => {
    Alert.alert('Видалити запис?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => {
        saveMeetings(meetings.map(m => m.id === mtgId
          ? { ...m, recordings: (m.recordings ?? []).filter(r => r !== uri) }
          : m
        ));
      }},
    ]);
  }, [meetings, saveMeetings]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

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
    let savedId: string;
    if (data.id) {
      // Cancel old notification before re-scheduling
      cancelMeetingNotification(data.id);
      saveMeetings(meetings.map(m => m.id !== data.id ? m : {
        ...m, title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes,
        location: data.location, link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }));
      savedId = data.id;
    } else {
      savedId = Date.now().toString();
      saveMeetings([...meetings, { id: savedId, title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location, link: data.link,
        notes: data.notes, color: data.color, recurrence: data.recurrence }]);
    }
    // Schedule notification 15 min before (non-recurring meetings with a specific time only)
    if (!data.recurrence && data.time) {
      scheduleMeetingNotification(savedId, data.title, data.date, data.time);
    }
    setShowForm(false);
  }, [meetings, saveMeetings]);

  const deleteMeeting = useCallback((id: string) => {
    Alert.alert('Видалити зустріч?', 'Цю дію не можна скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => {
        cancelMeetingNotification(id);
        saveMeetings(meetings.filter(m => m.id !== id));
      }},
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
          <TouchableOpacity onPress={() => setShowGcalSheet(true)}
            style={[s.hBtn, { borderColor: gcalToken ? '#34A853' + '50' : c.border, backgroundColor: gcalToken ? '#34A853' + '15' : c.dim }]}>
            {gcalImporting
              ? <ActivityIndicator size="small" color="#34A853" />
              : <IconSymbol name={gcalToken ? 'checkmark.circle.fill' : 'arrow.triangle.2.circlepath'} size={17} color={gcalToken ? '#34A853' : c.sub} />}
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
          {(span === 'day' || (span === 'week' && selectedDay)) && (() => {
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
                          onPress={() => setSelectedMtg(origMtg)}
                          onDelete={() => deleteMeeting(origMtg.id)}
                          onRecord={() => setRecordingMtgId(origMtg.id)} />
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
                            onPress={() => setSelectedMtg(origMtg)}
                            onDelete={() => deleteMeeting(origMtg.id)}
                            onRecord={() => setRecordingMtgId(origMtg.id)} />
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

      {/* ── Meeting Detail Modal ── */}
      <Modal visible={!!selectedMtg} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setSelectedMtg(null)}>
        <Pressable style={s.overlay} onPress={() => setSelectedMtg(null)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            {selectedMtg && (
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
                style={[s.sheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(10,10,20,0.98)' : 'rgba(245,244,255,0.98)' }]}>

                {/* Handle */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                </View>

                {/* Color bar + title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                  <View style={{ width: 4, height: 44, borderRadius: 2, backgroundColor: selectedMtg.color }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: c.text, letterSpacing: -0.4 }}>
                      {selectedMtg.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: selectedMtg.color }}>
                        {selectedMtg.time || '--:--'}
                      </Text>
                      <Text style={{ fontSize: 13, color: c.sub }}>·</Text>
                      <Text style={{ fontSize: 13, color: c.sub }}>{durLabel(selectedMtg.durationMinutes)}</Text>
                      {selectedMtg._origId && (
                        <IconSymbol name="repeat" size={12} color={selectedMtg.color + 'BB'} />
                      )}
                    </View>
                  </View>
                </View>

                {/* Date */}
                <View style={[s.detailRow, { backgroundColor: c.dim, borderRadius: 12, marginBottom: 8 }]}>
                  <IconSymbol name="calendar" size={15} color={c.sub} />
                  <Text style={{ fontSize: 14, color: c.text, marginLeft: 10 }}>{dayLabel(selectedMtg.date)}</Text>
                </View>

                {/* Location */}
                {selectedMtg.location ? (
                  <View style={[s.detailRow, { backgroundColor: c.dim, borderRadius: 12, marginBottom: 8 }]}>
                    <IconSymbol name="mappin" size={15} color={c.sub} />
                    <Text style={{ fontSize: 14, color: c.text, marginLeft: 10, flex: 1 }}>{selectedMtg.location}</Text>
                  </View>
                ) : null}

                {/* Link */}
                {selectedMtg.link ? (
                  <View style={[s.detailRow, { backgroundColor: ACCENT + '12', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: ACCENT + '30' }]}>
                    <IconSymbol name="link" size={15} color={ACCENT} />
                    <Text style={{ fontSize: 14, color: ACCENT, marginLeft: 10, flex: 1, fontWeight: '600' }} numberOfLines={1}>
                      {selectedMtg.link}
                    </Text>
                  </View>
                ) : null}

                {/* Notes */}
                {selectedMtg.notes ? (
                  <View style={[s.detailRow, { backgroundColor: c.dim, borderRadius: 12, marginBottom: 8, alignItems: 'flex-start', paddingTop: 12, paddingBottom: 12 }]}>
                    <IconSymbol name="note.text" size={15} color={c.sub} />
                    <Text style={{ fontSize: 13, color: c.sub, marginLeft: 10, flex: 1, lineHeight: 19 }}>
                      {selectedMtg.notes}
                    </Text>
                  </View>
                ) : null}

                {/* Recordings */}
                {(selectedMtg.recordings?.length ?? 0) > 0 && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, color: c.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      ЗАПИСИ ({selectedMtg.recordings!.length})
                    </Text>
                    {selectedMtg.recordings!.map((uri, idx) => (
                      <View key={uri} style={[s.detailRow, { backgroundColor: ACCENT + '10', borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: ACCENT + '25' }]}>
                        <IconSymbol name="waveform" size={15} color={ACCENT} />
                        <Text style={{ fontSize: 13, color: c.text, marginLeft: 10, flex: 1 }}>
                          Запис {idx + 1}
                        </Text>
                        <TouchableOpacity onPress={() => playRecording(uri)}
                          style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
                          <IconSymbol name={playingUri === uri ? 'pause.fill' : 'play.fill'} size={12} color={ACCENT} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { deleteRecording(selectedMtg.id, uri); setSelectedMtg(m => m ? { ...m, recordings: (m.recordings ?? []).filter(r => r !== uri) } : null); }}
                          style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                          <IconSymbol name="trash" size={12} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                  {/* Record */}
                  <TouchableOpacity
                    onPress={() => { setSelectedMtg(null); setTimeout(() => setRecordingMtgId(selectedMtg.id), 300); }}
                    style={[s.btn, { flex: 1, backgroundColor: ACCENT + '18', borderWidth: 1, borderColor: ACCENT + '40' }]}>
                    <IconSymbol name="mic.fill" size={16} color={ACCENT} />
                    <Text style={{ color: ACCENT, fontSize: 14, fontWeight: '700' }}>Записати</Text>
                  </TouchableOpacity>

                  {/* Edit */}
                  <TouchableOpacity
                    onPress={() => { setSelectedMtg(null); setTimeout(() => openEdit(selectedMtg), 300); }}
                    style={[s.btn, { flex: 1, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
                    <IconSymbol name="pencil" size={16} color={c.text} />
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>Редагувати</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* ── Google Calendar Sheet ── */}
      <Modal visible={showGcalSheet} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setShowGcalSheet(false)}>
        <Pressable style={s.overlay} onPress={() => setShowGcalSheet(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
              style={[s.sheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(10,12,22,0.98)' : 'rgba(240,240,255,0.98)', maxHeight: '90%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* Handle */}
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                </View>

                {/* Google icon + title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#4285F4' + '18',
                    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4285F4' + '30' }}>
                    <IconSymbol name="calendar" size={22} color="#4285F4" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>Google Calendar</Text>
                    <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>
                      {gcalToken ? 'Підключено' : gcalClientId ? 'Client ID налаштовано' : 'Налаштуйте підключення'}
                    </Text>
                  </View>
                  {gcalToken && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#34A853' }} />}
                </View>

                {/* ── STATE 1: No Client ID — setup form ── */}
                {!gcalClientId && (
                  <>
                    {/* Steps */}
                    <View style={{ backgroundColor: c.dim, borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 }}>
                      {[
                        ['1', 'Відкрийте console.cloud.google.com'],
                        ['2', 'Увімкніть Google Calendar API'],
                        ['3', 'Створіть OAuth 2.0 Client ID\n(тип: iOS, Bundle ID: com.casper3.f-tracking-app)'],
                        ['4', 'Скопіюйте Client ID і вставте нижче'],
                      ].map(([n, text]) => (
                        <View key={n} style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#4285F4' + '20',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#4285F4' }}>{n}</Text>
                          </View>
                          <Text style={{ fontSize: 13, color: c.sub, flex: 1, lineHeight: 19 }}>{text}</Text>
                        </View>
                      ))}
                    </View>

                    <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontWeight: '500' }}>Google OAuth Client ID</Text>
                    <TextInput
                      placeholder="xxxxx.apps.googleusercontent.com"
                      placeholderTextColor={c.sub}
                      value={gcalClientInput}
                      onChangeText={setGcalClientInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[s.inp, { backgroundColor: c.dim, color: c.text, borderColor: c.border, marginBottom: 12 }]}
                    />

                    <TouchableOpacity
                      onPress={() => gcalClientInput.trim() && saveGcalClientId(gcalClientInput)}
                      style={[s.btn, { backgroundColor: gcalClientInput.trim() ? '#4285F4' : c.dim, marginBottom: 10 }]}>
                      <IconSymbol name="checkmark" size={16} color={gcalClientInput.trim() ? '#fff' : c.sub} />
                      <Text style={{ color: gcalClientInput.trim() ? '#fff' : c.sub, fontSize: 15, fontWeight: '700' }}>
                        Зберегти Client ID
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setShowGcalSheet(false)}
                      style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }]}>
                      <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STATE 2: Client ID set, not connected ── */}
                {gcalClientId && !gcalToken && (
                  <>
                    <View style={{ backgroundColor: '#4285F4' + '10', borderRadius: 12, padding: 12, marginBottom: 16,
                      borderWidth: 1, borderColor: '#4285F4' + '25' }}>
                      <Text style={{ fontSize: 11, color: c.sub, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>CLIENT ID</Text>
                      <Text style={{ fontSize: 13, color: c.text, marginTop: 4 }} numberOfLines={1}>
                        {gcalClientId.length > 40 ? gcalClientId.slice(0, 37) + '...' : gcalClientId}
                      </Text>
                    </View>

                    <Text style={{ fontSize: 14, color: c.sub, lineHeight: 20, marginBottom: 20 }}>
                      Підключіть Google Calendar, щоб автоматично імпортувати зустрічі.
                    </Text>

                    <TouchableOpacity onPress={() => { setShowGcalSheet(false); connectGoogleCalendar(); }}
                      style={[s.btn, { backgroundColor: '#4285F4', marginBottom: 10 }]}>
                      <IconSymbol name="person.badge.plus" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Підключити Google</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => { saveGcalClientId(''); setGcalClientInput(''); }}
                      style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }]}>
                      <IconSymbol name="pencil" size={15} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>Змінити Client ID</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STATE 3: Connected ── */}
                {gcalToken && (
                  <>
                    {gcalLastSync && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
                        paddingVertical: 10, borderRadius: 12, backgroundColor: '#34A853' + '10',
                        borderWidth: 1, borderColor: '#34A853' + '30', marginBottom: 16 }}>
                        <IconSymbol name="checkmark.circle.fill" size={16} color="#34A853" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>Остання синхронізація</Text>
                          <Text style={{ fontSize: 12, color: c.sub, marginTop: 1 }}>{gcalLastSync}</Text>
                        </View>
                        {gcalImportCount > 0 && (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: '#34A853' + '20' }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#34A853' }}>+{gcalImportCount} нових</Text>
                          </View>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => { setShowGcalSheet(false); importFromGoogleCalendar(); }}
                      disabled={gcalImporting}
                      style={[s.btn, { backgroundColor: '#4285F4', marginBottom: 10 }]}>
                      {gcalImporting
                        ? <ActivityIndicator color="#fff" />
                        : <>
                            <IconSymbol name="arrow.triangle.2.circlepath" size={16} color="#fff" />
                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Синхронізувати зараз</Text>
                          </>}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={disconnectGoogleCalendar}
                      style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border, marginBottom: 8 }]}>
                      <IconSymbol name="xmark.circle" size={16} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>Відключити</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => { saveGcalClientId(''); setGcalClientInput(''); }}
                      style={[s.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.border }]}>
                      <IconSymbol name="pencil" size={15} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>Змінити Client ID</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Recording Modal ── */}
      <Modal visible={!!recordingMtgId} transparent animationType="fade" statusBarTranslucent
        onRequestClose={() => { if (isRecording) stopRecording(); else setRecordingMtgId(null); }}>
        <Pressable style={[s.overlay, { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)' }]}
          onPress={() => { if (!isRecording) setRecordingMtgId(null); }}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ backgroundColor: isDark ? '#12121E' : '#FFFFFF', borderRadius: 24, padding: 28,
              alignItems: 'center', width: 280, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20 }}>

            {/* Pulsing circle indicator */}
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: isRecording ? '#EF4444' + '20' : c.dim,
              alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              borderWidth: 2, borderColor: isRecording ? '#EF4444' : c.border }}>
              <IconSymbol name={isRecording ? 'stop.fill' : 'mic.fill'} size={32} color={isRecording ? '#EF4444' : c.sub} />
            </View>

            <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#000', marginBottom: 6 }}>
              {isRecording ? 'Запис...' : 'Аудіозапис'}
            </Text>
            <Text style={{ fontSize: 28, fontWeight: '800', color: isRecording ? '#EF4444' : ACCENT,
              letterSpacing: 2, marginBottom: 24, fontVariant: ['tabular-nums'] }}>
              {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
            </Text>

            {isRecording ? (
              <TouchableOpacity onPress={stopRecording}
                style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingVertical: 14,
                  paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol name="stop.fill" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Зупинити</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => recordingMtgId && startRecording(recordingMtgId)}
                style={{ backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 14,
                  paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol name="mic.fill" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Почати запис</Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
