import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

import { MeetingFormSheet, MeetingFormData } from '@/components/shared/MeetingFormSheet';

import { DetailPane } from '@/components/shared/DetailPane';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { isOnlineMode } from '@/store/app-mode';
import { cancelMeetingNotification, scheduleMeetingNotification } from '@/store/notifications';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTimerContext } from '@/store/timer-context';
import { useContentWidth } from '@/hooks/use-content-width';
import { MeetingDetailBody, MeetingDetailHeader } from '@/components/meetings/MeetingDetail';
import { MeetingProjectChip, type MeetingChipProject } from '@/components/meetings/MeetingProjectChip';
import { formatDuration } from '@/utils/durationFormat';
import {
  expandMeetings, findTimerForMeeting, meetingProject, resolveOriginalMeeting, withMeetingProject, withMeetingRecording, type Meeting,
} from '@/utils/meetings';

/** Мінімум проєкту для чипа й поля «Проєкт» форми. */
interface MeetingsProject extends MeetingChipProject { archivedAt?: string }

// ─── expo-av conditional (install with: npx expo install expo-av) ────────────
let AVAudio: any = null;
try { AVAudio = require('expo-av').Audio; } catch {}

// ─── Types ────────────────────────────────────────────────────────────────────

// Meeting живе в utils/meetings.ts: той самий тип читає екран «Сьогодні», і
// поки копій було дві, поле, додане в одну з них (timeEntries таймера),
// затиралося при першому ж збереженні з іншого екрана.

type Span = 'day' | 'week' | 'month' | 'quarter';

// ─── Google Calendar config ───────────────────────────────────────────────────
const GCAL_REDIRECT    = 'ftrackingapp://auth';
const GCAL_SCOPES      = 'https://www.googleapis.com/auth/calendar.readonly';
// Token/refresh/expiry live in expo-secure-store (Keychain/Keystore), not
// AsyncStorage — same as the app's own auth tokens (store/api.ts) — since a
// Google refresh token is a long-lived credential, not a UI preference.
const GCAL_TOKEN_KEY   = 'gcal_access_token';
const GCAL_REFRESH_KEY = 'gcal_refresh_token';
const GCAL_EXPIRY_KEY  = 'gcal_token_expiry';
const GCAL_CLIENT_KEY  = 'gcal_client_id';
const GCAL_CREDENTIAL_KEYS = [GCAL_TOKEN_KEY, GCAL_REFRESH_KEY, GCAL_EXPIRY_KEY] as const;

/**
 * Move credentials written by older app versions out of AsyncStorage.
 * Legacy values are deleted only after every required SecureStore write
 * succeeds, so an interrupted migration cannot silently disconnect the user.
 */
async function loadAndMigrateGcalAccessToken(): Promise<string | null> {
  const [secureValues, legacyEntries] = await Promise.all([
    Promise.all(GCAL_CREDENTIAL_KEYS.map(key => SecureStore.getItemAsync(key))),
    AsyncStorage.multiGet([...GCAL_CREDENTIAL_KEYS]),
  ]);
  const legacyValues = new Map(legacyEntries);

  await Promise.all(GCAL_CREDENTIAL_KEYS.map((key, index) => {
    const legacyValue = legacyValues.get(key);
    return !secureValues[index] && legacyValue
      ? SecureStore.setItemAsync(key, legacyValue)
      : Promise.resolve();
  }));
  await AsyncStorage.multiRemove([...GCAL_CREDENTIAL_KEYS]);

  return secureValues[0] ?? legacyValues.get(GCAL_TOKEN_KEY) ?? null;
}

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

// Одиниці вшиті українською, як і решта рядків цього екрана (див. звіт);
// сама форма береться зі спільної утиліти, щоб екран не розходився з
// рештою застосунку через власну копію тих самих трьох гілок.
const DURATION_UNITS = { hour: 'г', hourLong: 'год', minute: 'хв' };

function durLabel(minutes: number): string {
  return formatDuration(minutes * 60, DURATION_UNITS);
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
  // Стабільне посилання, поки не змінилася тема: MeetingCard під React.memo
  // порівнює пропси за посиланням, і новий обʼєкт палітри на кожен рендер
  // екрана зводив би мемоізацію нанівець.
  return useMemo(() => ({
    bg1:    isDark ? '#0A0C18' : '#EEF0FF',
    bg2:    isDark ? '#121525' : '#E2E5FF',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.75)',
    sheet:  isDark ? 'rgba(18,18,32,0.96)' : 'rgba(245,244,255,0.97)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)',
    dim:    isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    text:   isDark ? '#F2F0FF' : '#1A1830',
    sub:    isDark ? 'rgba(210,205,255,0.62)' : 'rgba(80,70,140,0.58)',
    accent: ACCENT,
  }), [isDark]);
}

// ─── MeetingCard ──────────────────────────────────────────────────────────────

// Мемоізована: у місячному й квартальному зрізі карток бувають сотні, і без
// цього кожен рендер екрана перемальовував би їх усі. Колбеки приймають саму
// зустріч аргументом — інлайн-стрілка на кожну картку ламала б порівняння.
const MeetingCard = React.memo(function MeetingCard({ mtg, onPress, onDelete, onRecord, isDark, c, showDate = false, isRecurring = false, selected = false, tracking = false, project = null }: {
  mtg: Meeting; onPress: (m: Meeting) => void; onDelete: (m: Meeting) => void; onRecord?: (m: Meeting) => void;
  isDark: boolean; c: ReturnType<typeof useColors>; showDate?: boolean; isRecurring?: boolean; selected?: boolean;
  /** Іде таймер цієї наради. Керування — у деталі, тут лише позначка. */
  tracking?: boolean;
  /** Проєкт серії; null — без чипа (без проєкту або висячий id). */
  project?: MeetingChipProject | null;
}) {
  const dur = durLabel(mtg.durationMinutes);
  const mtgDt = new Date(`${mtg.date}T${mtg.time || '00:00'}`);
  const now = new Date();
  const isPast = mtgDt < now;
  const isNow = mtgDt <= now && new Date(mtgDt.getTime() + mtg.durationMinutes * 60000) > now;
  const dateDisp = showDate ? dayLabel(mtg.date) : null;

  return (
    // Вибране підсвічуємо лише фоном і ширшою (абсолютно позиційованою)
    // смужкою: рамка додала б картці висоти, і на телефоні список смикнувся б
    // від самого лише дотику.
    <TouchableOpacity onPress={() => onPress(mtg)} activeOpacity={0.78}
      accessibilityRole="button" accessibilityState={{ selected }}>
      <View style={[s.card, {
        opacity: !selected && isPast && !isNow ? 0.5 : 1,
        backgroundColor: selected ? mtg.color + '20' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
      }]}>
        {/* Left accent bar */}
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: selected ? 5 : 3, backgroundColor: mtg.color, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 }} />

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
              {/* Позначка «трекається зараз» потрібна саме в списку: інакше про
                  запущений таймер знав би лише той екран, з якого його
                  запустили. */}
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
            <TouchableOpacity onPress={e => { e.stopPropagation(); onRecord(mtg); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 28, height: 28, borderRadius: 8,
                backgroundColor: (mtg.recordings?.length ?? 0) > 0 ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.07)',
                alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol name={(mtg.recordings?.length ?? 0) > 0 ? 'waveform' : 'mic'} size={12}
                color={(mtg.recordings?.length ?? 0) > 0 ? ACCENT : c.sub} />
            </TouchableOpacity>
          )}

          {/* Delete */}
          <TouchableOpacity onPress={e => { e.stopPropagation(); onDelete(mtg); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="trash" size={12} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ─── Рядок списку ─────────────────────────────────────────────────────────────

// День і тиждень показують плаский перелік, місяць і квартал — групи по днях.
// Обидва зводяться до одного масиву, щоб список їхав через FlatList.
type MeetingRow =
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'meeting'; key: string; mtg: Meeting; gap: number };

const meetingRowKey = (r: MeetingRow) => r.key;

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
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const c = useColors(isDark);
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  // Реєстр таймерів — той самий, що у завдань: старт наради має бути видно на
  // вкладці «Час» і в повноекранній сітці, а не лише тут.
  const { activeTimers, startMeetingTimer, stopTimer, meetingsRevision } = useTimerContext();
  // Три колонки вмикаються тільки на `expanded`; вужче деталь лишається листом.
  const { isExpanded, height } = useResponsive();
  const detailScrollRef = useRef<ScrollView | null>(null);

  // Data
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [initialized, setInitialized] = useState(false);
  // Проєкти — лише для чипа на картках і поля «Проєкт» форми; цей екран їх не пише.
  const [projects, setProjects] = useState<MeetingsProject[]>([]);

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

  // Деталь. Зберігаємо ключ РОЗГОРНУТОГО екземпляра, а не сам обʼєкт: у
  // колонці деталь лишається відкритою під час редагування й запису, і знімок
  // зустрічі, зроблений у мить натискання, показував би вчорашні дані.
  const [selectedKey, setSelectedKey]     = useState<string | null>(null);

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
    loadData<MeetingsProject[]>('projects', [])
      .then(setProjects)
      .catch(e => { if (__DEV__) console.warn('[meetings] проєкти не завантажились:', e); });
    // Load GCal config
    AsyncStorage.getItem(GCAL_CLIENT_KEY).then(id => {
      const cid = id ?? '';
      setGcalClientId(cid);
      gcalClientIdRef.current = cid;
    });
    loadAndMigrateGcalAccessToken()
      .then(t => setGcalToken(t))
      .catch(e => { if (__DEV__) console.warn('[gcal] credential migration error:', e); });
    AsyncStorage.getItem('gcal_last_sync').then(t => setGcalLastSync(t));
  }, []));

  // Запис повз екран (синк, екран «Задачі», таймер) — перечитуємо, поки
  // екран відкритий: useFocusEffect спрацьовує лише на вході.
  const reloadFromStorage = useCallback(async () => {
    const [freshMeetings, freshProjects] = await Promise.all([
      loadData<Meeting[]>('meetings', []),
      loadData<MeetingsProject[]>('projects', []),
    ]);
    setMeetings(freshMeetings);
    setProjects(freshProjects);
  }, []);
  const trackWrite = useStorageRefresh(['meetings', 'projects'], reloadFromStorage);

  // Усі записи 'meetings' з цього екрана — READ-MODIFY-WRITE по черзі.
  // saveSynced дифає масив зі сховищем: будь-який id, якого бракує в масиві,
  // їде на сервер як DELETE. Стан екрана міг відстати (синк-пул, Tasks-екран
  // додав зустріч, стоп таймера), тож мутуємо лише свіжу копію зі сховища.
  // Черга — щоб два записи підряд не прочитали той самий «свіжий» масив.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutateMeetings = useCallback((mutate: (list: Meeting[]) => Meeting[]) => {
    if (!initialized) return;
    writeQueueRef.current = writeQueueRef.current
      .then(() => trackWrite(async () => {
        const fresh = await loadData<Meeting[]>('meetings', []);
        const next = mutate(fresh);
        setMeetings(next);
        await saveSynced('meetings', next);
      }))
      .catch(e => { if (__DEV__) console.warn('[meetings] збереження не вдалося:', e); });
  }, [initialized, trackWrite]);

  // Стоп таймера дописує сесію в 'meetings' повз наш стан. Без перечитування
  // наступне збереження з цього екрана (правка, аудіозапис) віддифилось би від
  // застарілого масиву й затерло щойно записану сесію.
  useEffect(() => {
    if (!initialized) return;
    loadData<Meeting[]>('meetings', []).then(setMeetings).catch(e => {
      if (__DEV__) console.warn('[meetings] перечитування після стопу не вдалось:', e);
    });
  }, [meetingsRevision, initialized]);

  // ─── Computed ─────────────────────────────────────────────────────────────

  const expandedMeetings = useMemo(() => {
    const past = new Date(today); past.setFullYear(past.getFullYear() - 1);
    const future = new Date(today); future.setFullYear(future.getFullYear() + 2);
    return expandMeetings(meetings, past, future);
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

      await SecureStore.setItemAsync(GCAL_TOKEN_KEY, tokenData.access_token);
      if (tokenData.refresh_token) {
        await SecureStore.setItemAsync(GCAL_REFRESH_KEY, tokenData.refresh_token);
      }
      await SecureStore.setItemAsync(GCAL_EXPIRY_KEY,
        String(Date.now() + (tokenData.expires_in ?? 3600) * 1000));
      // Remove any plaintext credentials left by an older app version.
      await AsyncStorage.multiRemove([...GCAL_CREDENTIAL_KEYS]);

      setGcalToken(tokenData.access_token);
      setShowGcalSheet(false);
      setTimeout(() => importFromGoogleCalendar(tokenData.access_token), 300);
    } catch (e: any) {
      if (__DEV__) console.warn('[gcal] connect error:', e);
      Alert.alert('Помилка підключення', e?.message ?? 'Спробуйте ще раз.');
    }
  }, []);

  const getValidGcalToken = useCallback(async (): Promise<string | null> => {
    const expiry = await SecureStore.getItemAsync(GCAL_EXPIRY_KEY);
    if (expiry && Date.now() < Number(expiry) - 60000) {
      return await SecureStore.getItemAsync(GCAL_TOKEN_KEY);
    }
    // Try refresh
    const refreshToken = await SecureStore.getItemAsync(GCAL_REFRESH_KEY);
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
      await SecureStore.setItemAsync(GCAL_TOKEN_KEY, data.access_token);
      await SecureStore.setItemAsync(GCAL_EXPIRY_KEY, String(Date.now() + (data.expires_in ?? 3600) * 1000));
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
        mutateMeetings(list => {
          const known = new Set(list.map(m => m.gcalId).filter(Boolean));
          return [...list, ...toAdd.filter(m => !known.has(m.gcalId))];
        });
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
  }, [getValidGcalToken, mutateMeetings]);

  const disconnectGoogleCalendar = useCallback(() => {
    Alert.alert('Відключити Google Calendar?', 'Вже імпортовані зустрічі залишаться.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Відключити', style: 'destructive', onPress: async () => {
        await Promise.all([
          SecureStore.deleteItemAsync(GCAL_TOKEN_KEY),
          SecureStore.deleteItemAsync(GCAL_REFRESH_KEY),
          SecureStore.deleteItemAsync(GCAL_EXPIRY_KEY),
          AsyncStorage.multiRemove([...GCAL_CREDENTIAL_KEYS, 'gcal_last_sync']),
        ]);
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
        // recordingMtgId — завжди id ОРИГІНАЛУ (handleCardRecord / onRecord
        // передають resolveOrig(m).id). Не розбирати: `gcal_<eventId>`.
        const origId = recordingMtgId;
        mutateMeetings(fresh => withMeetingRecording(fresh, origId, uri));
      }
      setRecordingMtgId(null);
      setRecordingSeconds(0);
    } catch (e: any) {
      if (__DEV__) console.warn('[record] stop error:', e);
    }
  }, [recordingMtgId, mutateMeetings]);

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
        mutateMeetings(fresh => fresh.map(m => m.id === mtgId
          ? { ...m, recordings: (m.recordings ?? []).filter(r => r !== uri) }
          : m
        ));
      }},
    ]);
  }, [mutateMeetings]);

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
      location: m.location, link: m.link, notes: m.notes, color: m.color, recurrence: m.recurrence,
      projectId: m.projectId });
    setFormPresetDate(undefined);
    setShowForm(true);
  }, []);

  const handleFormSave = useCallback((data: MeetingFormData) => {
    let savedId: string;
    // Read-modify-write: saveSynced дифає масив зі сховищем, і стан екрана міг
    // відстати (синк, стоп таймера) — тоді зустріч, додана деінде, поїхала б
    // на сервер як видалена. Проєкт — рівень серії: лише на оригіналі.
    const apply = mutateMeetings;
    if (data.id) {
      // Cancel old notification before re-scheduling
      cancelMeetingNotification(data.id);
      const id = data.id;
      apply(list => list.map(m => m.id !== id ? m : withMeetingProject({
        ...m, title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes,
        location: data.location, link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }, data.projectId)));
      savedId = data.id;
    } else {
      savedId = Date.now().toString();
      const created = withMeetingProject<Meeting>({ id: savedId, title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location, link: data.link,
        notes: data.notes, color: data.color, recurrence: data.recurrence }, data.projectId);
      apply(list => [...list, created]);
    }
    // Schedule notification 15 min before (non-recurring meetings with a specific time only)
    if (!data.recurrence && data.time) {
      scheduleMeetingNotification(savedId, data.title, data.date, data.time);
    }
    setShowForm(false);
  }, [mutateMeetings]);

  const deleteMeeting = useCallback((id: string) => {
    Alert.alert('Видалити зустріч?', 'Цю дію не можна скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => {
        cancelMeetingNotification(id);
        // Явне видалення користувачем — фільтруємо СВІЖИЙ масив, не стан.
        mutateMeetings(fresh => fresh.filter(m => m.id !== id));
      }},
    ]);
  }, [mutateMeetings]);

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

  // ─── Список ───────────────────────────────────────────────────────────────

  // Повторювані зустрічі розгортаються в тимчасові копії; редагування,
  // видалення й запис мають потрапити в оригінал, а не в копію.
  const resolveOrig = useCallback(
    (m: Meeting) => resolveOriginalMeeting(m, meetings),
    [meetings],
  );

  /**
   * Старт/стоп таймера наради. Адресує ОРИГІНАЛ: у повторюваної наради всі
   * входження — копії одного запису, і сесія мусить лягти в нього, інакше
   * протрекований час зник би разом із тимчасовою копією.
   */
  const toggleMeetingTimer = useCallback(async (meeting: Meeting) => {
    const running = findTimerForMeeting(activeTimers, meeting.id);
    if (running) await stopTimer(running.id);
    else await startMeetingTimer({ id: meeting.id, title: meeting.title });
  }, [activeTimers, startMeetingTimer, stopTimer]);

  /** Які наради трекаються просто зараз — для позначки в списку. */
  const runningMeetingIds = useMemo(
    () => new Set(activeTimers.map(t => t.meetingId).filter(Boolean) as string[]),
    [activeTimers],
  );

  const handleCardPress  = useCallback((m: Meeting) => setSelectedKey(m.id), []);
  const handleCardDelete = useCallback((m: Meeting) => deleteMeeting(resolveOrig(m).id), [resolveOrig, deleteMeeting]);
  const handleCardRecord = useCallback((m: Meeting) => setRecordingMtgId(resolveOrig(m).id), [resolveOrig]);

  // Якщо зустріч видалили (або вона випала з розгорнутого діапазону) — вибір
  // сам зникає, і колонка повертається до підказки.
  const selectedMtg = useMemo(
    () => (selectedKey ? expandedMeetings.find(m => m.id === selectedKey) ?? null : null),
    [selectedKey, expandedMeetings],
  );

  // Заголовок групи і її картки йдуть поспіль одним плоским масивом: за
  // квартал зустрічей бувають сотні, а ScrollView тримав би їх усі
  // змонтованими одночасно.
  const rows = useMemo<MeetingRow[]>(() => {
    if (span === 'day' || span === 'week') {
      return dayMeetings.map(mtg => ({ kind: 'meeting' as const, key: mtg.id, mtg, gap: 8 }));
    }
    const out: MeetingRow[] = [];
    groupedMeetings.forEach(group => {
      out.push({ kind: 'group', key: `group_${group.date}`, label: group.label, count: group.items.length });
      group.items.forEach((mtg, idx) =>
        out.push({ kind: 'meeting', key: mtg.id, mtg, gap: idx === group.items.length - 1 ? 16 : 8 }));
    });
    return out;
  }, [span, dayMeetings, groupedMeetings]);

  const renderRow = useCallback(({ item }: { item: MeetingRow }) => {
    if (item.kind === 'group') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
            {item.label}
          </Text>
          <View style={{ backgroundColor: ACCENT + '18', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 }}>
            <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{item.count}</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={{ marginBottom: item.gap }}>
        <MeetingCard mtg={item.mtg} isDark={isDark} c={c}
          isRecurring={!!item.mtg._origId}
          tracking={runningMeetingIds.has(item.mtg._origId ?? item.mtg.id)}
          project={meetingProject(item.mtg, projects)}
          selected={item.mtg.id === selectedKey}
          onPress={handleCardPress}
          onDelete={handleCardDelete}
          onRecord={handleCardRecord} />
      </View>
    );
  }, [c, isDark, selectedKey, runningMeetingIds, handleCardPress, handleCardDelete, handleCardRecord, projects]);

  const isDaySpan = span === 'day' || span === 'week';

  const listEmpty = useMemo(() => (
    <TouchableOpacity onPress={() => openAdd(isDaySpan ? selectedDay : undefined)} activeOpacity={0.7}
      style={[s.emptyBox, { borderColor: c.border }]}>
      <IconSymbol name="calendar.badge.plus" size={28} color={c.sub} />
      <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', marginTop: 10 }}>Немає зустрічей</Text>
      <Text style={{ color: c.sub, fontSize: 12, opacity: 0.7, marginTop: 4 }}>Натисніть, щоб додати</Text>
    </TouchableOpacity>
  ), [c.border, c.sub, isDaySpan, selectedDay, openAdd]);

  const listFooter = useMemo(() => {
    if (!isDaySpan || rows.length === 0) return null;
    return (
      <TouchableOpacity onPress={() => openAdd(selectedDay)} activeOpacity={0.7}
        style={[s.addMoreBtn, { borderColor: c.border }]}>
        <IconSymbol name="plus" size={13} color={c.sub} />
        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>Додати зустріч</Text>
      </TouchableOpacity>
    );
  }, [isDaySpan, rows.length, c.border, c.sub, selectedDay, openAdd]);

  // ─── Деталь зустрічі ──────────────────────────────────────────────────────

  // На вузькому екрані деталь — модальний лист, і iOS не покаже другу
  // модалку, доки перша не зникла; звідси закриття й пауза. У колонці
  // деталь нікуди не дівається, тож пауза лише гальмувала б дію.
  const openOverDetail = useCallback((run: () => void) => {
    if (isExpanded) { run(); return; }
    setSelectedKey(null);
    setTimeout(run, 300);
  }, [isExpanded]);

  // Сама деталь — спільний компонент (components/meetings/MeetingDetail.tsx):
  // той самий перегляд відкриває й екран Завдань. Приймає РОЗГОРНУТИЙ
  // екземпляр; дії адресують оригінал — саме він лежить у сховищі.
  const selectedOrig = selectedMtg ? resolveOrig(selectedMtg) : null;
  const selectedTimer = selectedOrig ? findTimerForMeeting(activeTimers, selectedOrig.id) : undefined;
  const detailHeader = selectedMtg && selectedOrig ? (
    <MeetingDetailHeader
      meeting={selectedMtg}
      original={selectedOrig}
      onEdit={() => openOverDetail(() => openEdit(selectedOrig))}
      onClose={() => setSelectedKey(null)}
      isExpanded={isExpanded}
      colors={c}
      tr={tr}
    />
  ) : null;
  const detailBody = selectedMtg && selectedOrig ? (
    <MeetingDetailBody
      meeting={selectedMtg}
      original={selectedOrig}
      project={meetingProject(selectedOrig, projects)}
      timer={selectedTimer}
      onToggleTimer={() => { void toggleMeetingTimer(selectedOrig); }}
      onEdit={() => openOverDetail(() => openEdit(selectedOrig))}
      onRecord={() => openOverDetail(() => setRecordingMtgId(selectedOrig.id))}
      onPlayRecording={uri => { void playRecording(uri); }}
      // Запис живе в оригіналі — видаляємо звідти, а не з копії.
      onDeleteRecording={uri => deleteRecording(selectedOrig.id, uri)}
      playingUri={playingUri}
      colors={c}
      tr={tr}
      locale={locale}
    />
  ) : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <LinearGradient colors={[c.bg1, c.bg2]} style={{ flex: 1 }}>
      {/* На широкому екрані список і деталь стоять поруч — той самий
          DetailPane, що в Завданнях, Фінансах і Проєктах. На вузькому деталь
          лишається модальним листом поверх списку. */}
      <View style={{ flex: 1, flexDirection: isExpanded ? 'row' : 'column' }}>
      <View style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>

        {/* Шапка, перемикачі та підсумки тримаються тієї самої колонки, що й
            список: інакше на планшеті вони розтягуються на всю ширину, поки
            картки стоять по центру. На телефоні стиль порожній — нічого не
            змінюється. */}
        <View style={contentWidth}>

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
        </View>

        {/* ── Content ── */}
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={meetingRowKey}
          renderItem={renderRow}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }]}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>

      {/* FAB живе всередині лівої колонки: інакше на широкому екрані він
          висів би над панеллю деталі. */}
      <TouchableOpacity onPress={() => openAdd()} activeOpacity={0.85}
        style={[s.fab, { backgroundColor: ACCENT }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>
      </View>

      <DetailPane
        open={!!selectedMtg}
        wide={isExpanded}
        onClose={() => setSelectedKey(null)}
        isDark={isDark}
        sheetColor={isDark ? 'rgba(10,10,20,0.98)' : 'rgba(245,244,255,0.98)'}
        borderColor={c.border}
        maxHeight={height * 0.86}
        scrollRef={detailScrollRef}
        empty={
          <>
            <IconSymbol name="calendar" size={40} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 12, paddingHorizontal: 16 }}>
              {tr.meetingPickHint}
            </Text>
          </>
        }
        header={detailHeader}>
        {detailBody}
      </DetailPane>
      </View>

      <MeetingFormSheet
        visible={showForm}
        initial={formInitial}
        presetDate={formPresetDate}
        onClose={() => setShowForm(false)}
        onSave={handleFormSave}
        onDelete={formInitial?.id ? () => { deleteMeeting(formInitial!.id!); setShowForm(false); } : undefined}
        isDark={isDark}
        lang="uk"
        tr={tr}
        markedDays={markedDays}
        projects={projects}
      />

      {/* ── Google Calendar Sheet ── */}
      <Modal visible={showGcalSheet} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setShowGcalSheet(false)}>
        <Pressable style={s.overlay} onPress={() => setShowGcalSheet(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper} accessibilityViewIsModal importantForAccessibility="yes">
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
            accessibilityViewIsModal importantForAccessibility="yes"
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
  sheet:    { borderRadius: 22, borderWidth: 1, padding: 16, maxHeight: '90%', overflow: 'hidden' },
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
