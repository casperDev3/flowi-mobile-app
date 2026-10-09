/**
 * app/calendar.tsx — «Календар» (замінив «Наради»).
 *
 * Одна сітка на все заплановане:
 *   • зустрічі — особисті й проєктні, повтори розгорнуті, імпорт Google Calendar;
 *   • позначки завдань з дедлайном — особисті й проєктні (виконані приглушені,
 *     їх можна сховати фільтром);
 *   • АКТИВНІ (не закриті) спринти моїх проєктів із датами — смуги кольору
 *     проєкту; спринти без дат не малюються, а підказують «вкажіть дати».
 *
 * Види: Місяць / Тиждень / День. Телефон стартує з місяця (крапки + список
 * обраного дня під сіткою); планшет (≥600pt) — з тижня з погодинною сіткою,
 * а на `expanded` праворуч стоїть колонка: деталь зустрічі або, коли нічого
 * не вибрано, список обраного дня.
 *
 * «+» (один: FAB на телефоні, кнопка в шапці на планшеті) питає, що
 * створити — Зустріч чи Завдання — і підставляє обраний день (і годину, якщо
 * тапнули слот сітки). Завдання створюється тут же, аркушем поверх
 * календаря (CalendarTaskCreate — та сама коротка форма TaskQuickCreate, що й
 * на «Завданнях»), тож після збереження людина лишається в календарі.
 * Перетягування — лише на вебі.
 *
 * Лупа в шапці — пошук по зустрічах (разом з історією) і завданнях.
 * Права колонка планшета зі списком дня — лише для читання.
 *
 * Старий маршрут /meetings лишився редиректом сюди (app/meetings.tsx).
 */
import { Audio as AVAudio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarToolbar } from '@/components/calendar/CalendarToolbar';
import {
  activeSprints, bucketMeetings, bucketTasks, dateKey, deadlineIsoForKey, defaultCalendarView, keyToDate,
  mergeCalendarProjects, monthMatrix, periodTitle, PERSONAL_FILTER, shiftAnchor, sprintsOnDay, viewRange,
  type CalendarProject, type CalendarView, type ProjectFilter, type SprintBar,
} from '@/components/calendar/calendarModel';
import { CalendarSearch } from '@/components/calendar/CalendarSearch';
import { CalendarTaskCreate } from '@/components/calendar/CalendarTaskCreate';
import { CreateChooser } from '@/components/calendar/CreateChooser';
import { DayAgenda } from '@/components/calendar/DayAgenda';
import { GoogleCalendarSheet } from '@/components/calendar/GoogleCalendarSheet';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { PERSONAL_TASK_COLOR, useCalendarColors } from '@/components/calendar/palette';
import { RecordingModal } from '@/components/calendar/RecordingModal';
import { TimeGrid } from '@/components/calendar/TimeGrid';
import { useGoogleCalendar } from '@/components/calendar/useGoogleCalendar';
import { WeekStrip } from '@/components/calendar/WeekStrip';
import { MeetingDetailBody, MeetingDetailHeader } from '@/components/meetings/MeetingDetail';
import { useInPlaceProjectTask } from '@/components/projects/ProjectTaskSheet';
import { DETAIL_COLUMN_WIDTH, DetailPane } from '@/components/shared/DetailPane';
import { MEETING_COLORS, MeetingFormSheet, type MeetingFormData } from '@/components/shared/MeetingFormSheet';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProjectRole } from '@/hooks/use-project-role';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTodayKey } from '@/hooks/use-today-key';
import { setAdvertisingRecording } from '@/store/advertising-safety';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { cancelMeetingNotification, scheduleMeetingNotification } from '@/store/notifications';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import {
  expandMeetings, findTimerForMeeting, meetingProject, pickMeetingInstanceToOpen, resolveOriginalMeeting,
  withMeetingProject, withMeetingRecording, type Meeting,
} from '@/utils/meetings';
import type { Sprint } from '@/utils/sprintUtils';
import { isTaskDoneByType, type TaskStatusColumn } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

/** Мінімум локального проєкту: чип, поле «Проєкт» форми, фільтр, колір смуг. */
interface LocalProject { id: string; name: string; color: string; archivedAt?: string }
interface ProjectSummaryLite { id: string; name: string; color: string; archived_at?: string | null }

/** Що й куди створюємо з «+»: день завжди, година — якщо тапнули слот. */
interface CreateTarget { day: string; time?: string }

const DATA_KEYS = ['meetings', 'projects', 'workspace_projects', 'tasks', 'sprints', 'task_statuses'] as const;

export default function CalendarScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = useCalendarColors(isDark);
  // Задача ПРОЄКТУ відкривається тут же, карткою проєкту — не в особистому редакторі.
  const { openProjectTask, projectTaskSheet } = useInPlaceProjectTask(isDark);
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { isWide, isExpanded, height } = useResponsive();
  const { user } = useAuth();
  const myUserId = user?.id !== undefined && user?.id !== null ? String(user.id) : null;
  const roles = useProjectRoles();
  const todayKey = useTodayKey();
  const detailScrollRef = useRef<ScrollView | null>(null);

  // `?open=<id>` — deep link ftrackingapp://meeting/{id} / тап по сповіщенню;
  // `?date=YYYY-MM-DD` — відкрити на дні; `?view=` — вид;
  // `?create=meeting[&date=]` — одразу форма нової події (iOS-віджет «Додати подію»).
  const params = useLocalSearchParams<{ open?: string; date?: string; view?: string; create?: string }>();

  const { activeTimers, startMeetingTimer, stopTimer, meetingsRevision } = useTimerContext();

  // ─── Дані ─────────────────────────────────────────────────────────────────
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [localProjects, setLocalProjects] = useState<LocalProject[]>([]);
  const [summaries, setSummaries] = useState<ProjectSummaryLite[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [statuses, setStatuses] = useState<TaskStatusColumn[]>([]);

  const reloadKey = useCallback(async (key: string) => {
    switch (key) {
      case 'meetings': setMeetings(await loadData<Meeting[]>('meetings', [])); break;
      case 'projects': setLocalProjects(await loadData<LocalProject[]>('projects', [])); break;
      case 'workspace_projects': setSummaries(await loadData<ProjectSummaryLite[]>('workspace_projects', [])); break;
      case 'tasks': setTasks(await loadData<Task[]>('tasks', [])); break;
      case 'sprints': setSprints(await loadData<Sprint[]>('sprints', [])); break;
      case 'task_statuses': setStatuses(await loadData<TaskStatusColumn[]>('task_statuses', [])); break;
    }
  }, []);

  // Дані читаються ОДИН раз (перший фокус), далі — лише змінені ключі
  // (патерн «Сьогодні»). Раніше кожне повернення (напр. з картки завдання)
  // перечитувало всі шість ключів і заново розгортало повтори на 3 роки,
  // хоча підписка нижче вже тримала стан актуальним.
  const gcalRef = useRef<{ load: () => void } | null>(null);
  const focusedRef = useRef(false);
  const firstLoadDone = useRef(false);
  const dirtyKeys = useRef(new Set<string>());
  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    if (!firstLoadDone.current) {
      firstLoadDone.current = true;
      dirtyKeys.current.clear();
      Promise.all(DATA_KEYS.map(k => reloadKey(k)))
        .then(() => setInitialized(true))
        .catch(e => { if (__DEV__) console.warn('[calendar] завантаження не вдалося:', e); });
    } else if (dirtyKeys.current.size > 0) {
      const keys = [...dirtyKeys.current];
      dirtyKeys.current.clear();
      Promise.all(keys.map(k => reloadKey(k)))
        .catch(e => { if (__DEV__) console.warn('[calendar] перечитування не вдалося:', e); });
    }
    gcalRef.current?.load();
    return () => { focusedRef.current = false; };
  }, [reloadKey]));

  // Записи повз екран (синк, «Завдання», таймер) — перечитуємо лише ключ,
  // що змінився: у фокусі одразу, у фоні — позначаємо брудним до фокуса.
  const onKeyChanged = useCallback((key: string) => {
    if (focusedRef.current) return reloadKey(key);
    dirtyKeys.current.add(key);
  }, [reloadKey]);
  const trackWrite = useStorageRefresh(DATA_KEYS, onKeyChanged);

  // Усі записи 'meetings' — READ-MODIFY-WRITE по черзі (saveSynced дифає
  // масив зі сховищем: будь-який id, якого бракує, поїхав би як DELETE).
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mutateMeetings = useCallback((mutate: (list: Meeting[]) => Meeting[]) => {
    if (!initialized) return;
    writeQueueRef.current = writeQueueRef.current
      .then(() => trackWrite(async () => {
        setMeetings(await updateSynced<Meeting>('meetings', mutate));
      }, ['meetings']))
      .catch(e => { if (__DEV__) console.warn('[calendar] збереження зустрічей не вдалося:', e); });
  }, [initialized, trackWrite]);

  // Стоп таймера дописує сесію в 'meetings' повз наш стан. Ревізію, яка
  // вже була на момент монтування, пропускаємо: перше завантаження й так
  // свіже (інакше кожне відкриття читало б 'meetings' двічі).
  const handledMeetingsRev = useRef(meetingsRevision);
  useEffect(() => {
    if (!initialized || meetingsRevision === handledMeetingsRev.current) return;
    handledMeetingsRev.current = meetingsRevision;
    loadData<Meeting[]>('meetings', []).then(setMeetings).catch(e => {
      if (__DEV__) console.warn('[calendar] перечитування після стопу не вдалось:', e);
    });
  }, [meetingsRevision, initialized]);

  const gcal = useGoogleCalendar(mutateMeetings);
  gcalRef.current = gcal;
  const [showGcalSheet, setShowGcalSheet] = useState(false);

  // ─── Вид і фільтри ────────────────────────────────────────────────────────
  const initialView = (['month', 'week', 'day'] as const).find(v => v === params.view);
  const [view, setViewState] = useState<CalendarView>(() => initialView ?? defaultCalendarView(isWide));
  // Поки людина сама не обрала вид, він іде за шириною (поворот планшета,
  // Split View): тиждень на широкому, місяць на вузькому.
  const viewChosenRef = useRef(Boolean(initialView));
  useEffect(() => {
    if (!viewChosenRef.current) setViewState(defaultCalendarView(isWide));
  }, [isWide]);
  const setView = useCallback((v: CalendarView) => { viewChosenRef.current = true; setViewState(v); }, []);

  const [anchor, setAnchor] = useState<string>(() =>
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey);
  // Повторний перехід сюди з `?date=` (з іншого екрана) — на той день.
  useEffect(() => {
    if (typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      setAnchor(params.date);
      router.setParams({ date: '' });
    }
  }, [params.date, router]);
  const [filter, setFilter] = useState<ProjectFilter>(null);
  const [showDone, setShowDone] = useState(true);
  // Рішення власника: типово показуємо ВСІ завдання з дедлайном у моїх
  // проєктах; «Лише мої» — фільтр, який вмикають самі.
  const [onlyMine, setOnlyMine] = useState(false);

  const projects = useMemo(() => mergeCalendarProjects(localProjects, summaries), [localProjects, summaries]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p] as const)), [projects]);
  // Фільтр на проєкт, якого вже немає (архівували) — назад на «Усі».
  useEffect(() => {
    if (filter && filter !== PERSONAL_FILTER && initialized && !projectMap.has(filter)) setFilter(null);
  }, [filter, projectMap, initialized]);

  // ─── Обчислене ────────────────────────────────────────────────────────────
  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);

  // Широке вікно розгортання — як було в «Нарадах»: `?open=` і вибрана
  // деталь мусять знаходити екземпляр і поза показаним періодом.
  const expandedMeetings = useMemo(() => {
    const now = new Date();
    const past = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const future = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
    return expandMeetings(meetings, past, future);
  }, [meetings]);

  const meetingsByDay = useMemo(() => bucketMeetings(expandedMeetings, filter), [expandedMeetings, filter]);
  const markedDays = useMemo(() => new Set(Object.keys(meetingsByDay)), [meetingsByDay]);

  const isDone = useCallback((t: Task) => isTaskDoneByType(t, statuses), [statuses]);
  const tasksByDay = useMemo(() => bucketTasks(tasks, {
    filter, showDone, onlyMine, myUserId, roles, isDone, projects: projectMap, personalColor: PERSONAL_TASK_COLOR,
  }), [tasks, filter, showDone, onlyMine, myUserId, roles, isDone, projectMap]);

  const [undatedDismissed, setUndatedDismissed] = useState(false);
  const { bars: sprintBars, undated } = useMemo(
    () => activeSprints(sprints, projectMap, filter),
    [sprints, projectMap, filter],
  );

  const title = useMemo(() => periodTitle(view, anchor, tr), [view, anchor, tr]);
  const anchorDate = keyToDate(anchor);
  const monthRows = useMemo(() => monthMatrix(anchorDate.getFullYear(), anchorDate.getMonth()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor]);

  const isCurrentPeriod = todayKey >= range.start && todayKey <= range.end
    && (view !== 'month' || keyToDate(todayKey).getMonth() === anchorDate.getMonth());

  const dayTitle = useCallback((day: string) => {
    if (day === todayKey) return tr.today;
    const d = keyToDate(day);
    return `${tr.weekdaysFull[(d.getDay() + 6) % 7]}, ${d.getDate()} ${tr.monthsGenitive[d.getMonth()]}`;
  }, [todayKey, tr]);

  // ─── Деталь зустрічі ──────────────────────────────────────────────────────
  // Ключ РОЗГОРНУТОГО екземпляра, а не сам обʼєкт: колонка лишається
  // відкритою під час редагування, і знімок показував би вчорашні дані.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selectedMtg = useMemo(
    () => (selectedKey ? expandedMeetings.find(m => m.id === selectedKey) ?? null : null),
    [selectedKey, expandedMeetings],
  );
  const resolveOrig = useCallback((m: Meeting) => resolveOriginalMeeting(m, meetings), [meetings]);
  const projectOf = useCallback((m: Meeting) => meetingProject(m, projects), [projects]);

  useEffect(() => {
    if (!params.open || !initialized) return;
    const target = pickMeetingInstanceToOpen(expandedMeetings, String(params.open), todayKey);
    if (target) {
      setAnchor(target.date);
      setSelectedKey(target.id);
    }
    router.setParams({ open: '' });
    // Реагуємо лише на прихід параметра після завантаження.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.open, initialized, router]);

  // ─── Форма зустрічі ───────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState<MeetingFormData | null>(null);
  const [formPresetDate, setFormPresetDate] = useState<string | undefined>(undefined);
  const formProjectRole = useProjectRole(formInitial?.projectId);
  const presetProjectId = filter && filter !== PERSONAL_FILTER ? filter : undefined;

  const openAddMeeting = useCallback((target: CreateTarget) => {
    if (target.time) {
      // Без id форма вважає запис новим, але бере дату й час звідси.
      setFormInitial({ title: '', date: target.day, time: target.time, durationMinutes: 60, color: MEETING_COLORS[0], projectId: presetProjectId });
      setFormPresetDate(undefined);
    } else {
      setFormInitial(null);
      setFormPresetDate(target.day);
    }
    setShowForm(true);
  }, [presetProjectId]);

  const openEdit = useCallback((m: Meeting) => {
    setFormInitial({ id: m.id, title: m.title, date: m.date, time: m.time, durationMinutes: m.durationMinutes,
      location: m.location, link: m.link, notes: m.notes, color: m.color, recurrence: m.recurrence,
      projectId: m.projectId });
    setFormPresetDate(undefined);
    setShowForm(true);
  }, []);

  const handleFormSave = useCallback((data: MeetingFormData) => {
    let savedId: string;
    if (data.id) {
      cancelMeetingNotification(data.id);
      const id = data.id;
      mutateMeetings(list => list.map(m => m.id !== id ? m : withMeetingProject({
        ...m, title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes,
        location: data.location, link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }, data.projectId)));
      savedId = data.id;
    } else {
      savedId = Date.now().toString();
      const created = withMeetingProject<Meeting>({ id: savedId, title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location, link: data.link,
        notes: data.notes, color: data.color, recurrence: data.recurrence }, data.projectId);
      mutateMeetings(list => [...list, created]);
    }
    if (!data.recurrence && data.time) scheduleMeetingNotification(savedId, data.title, data.date, data.time);
    setAnchor(data.date);
    setShowForm(false);
  }, [mutateMeetings]);

  const deleteMeeting = useCallback((id: string) => {
    Alert.alert(tr.calDeleteMeetingTitle, tr.calDeleteMeetingBody, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => {
        cancelMeetingNotification(id);
        mutateMeetings(fresh => fresh.filter(m => m.id !== id));
      }},
    ]);
  }, [mutateMeetings, tr]);

  // `?create=meeting` — день береться з `?date=` у момент приходу параметра:
  // ефект вище одразу чистить `date`, а форму відкриваємо лише після
  // завантаження (зберегти подію до `initialized` не можна — mutateMeetings).
  const [pendingCreateDay, setPendingCreateDay] = useState<string | null>(null);
  // Один запит — одна форма, навіть якщо маршрут ще не встиг прибрати параметр.
  const createSeenRef = useRef(false);
  useEffect(() => {
    if (params.create !== 'meeting') { createSeenRef.current = false; return; }
    if (createSeenRef.current) return;
    createSeenRef.current = true;
    const day = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayKey;
    setPendingCreateDay(day);
    router.setParams({ create: '' });
  }, [params.create, params.date, todayKey, router]);
  useEffect(() => {
    if (!pendingCreateDay || !initialized) return;
    setAnchor(pendingCreateDay);
    openAddMeeting({ day: pendingCreateDay });
    setPendingCreateDay(null);
  }, [pendingCreateDay, initialized, openAddMeeting]);

  // ─── «+»: що створити ─────────────────────────────────────────────────────
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const openCreate = useCallback((target: CreateTarget) => setCreateTarget(target), []);
  const createSubtitle = createTarget ? `${dayTitle(createTarget.day)}${createTarget.time ? ` · ${createTarget.time}` : ''}` : '';

  // Модалка вибору закривається ДО відкриття наступного аркуша: два аркуші
  // в одному тіку лишають невидимий шар, що їсть дотики (NEW-02).
  const chooseMeeting = useCallback(() => {
    const target = createTarget;
    setCreateTarget(null);
    if (target) setTimeout(() => openAddMeeting(target), 300);
  }, [createTarget, openAddMeeting]);

  // Завдання — аркушем просто тут: після збереження людина лишається в
  // календарі, а не на екрані «Завдань».
  const [taskCreateDay, setTaskCreateDay] = useState<string | null>(null);
  const chooseTask = useCallback(() => {
    const target = createTarget;
    setCreateTarget(null);
    if (target) setTimeout(() => setTaskCreateDay(target.day), 300);
  }, [createTarget]);

  const createTask = useCallback((task: Task, openFull: boolean) => {
    setTaskCreateDay(null);
    if (task.deadline) {
      const d = new Date(task.deadline);
      if (Number.isFinite(d.getTime())) setAnchor(dateKey(d));
    }
    void trackWrite(async () => {
      setTasks(await updateSynced<Task>('tasks', list => [task, ...list.filter(t => t.id !== task.id)]));
    }, ['tasks'])
      .then(() => {
        if (openFull && !openProjectTask(task)) router.push({ pathname: '/(tabs)', params: { open: task.id } } as never);
      })
      .catch(e => { if (__DEV__) console.warn('[calendar] створення завдання не вдалося:', e); });
  }, [trackWrite, router, openProjectTask]);

  // ─── Пошук ────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const closeSearch = useCallback(() => { setSearchOpen(false); setSearchQuery(''); }, []);

  // ─── Навігація ────────────────────────────────────────────────────────────
  const goPrev = useCallback(() => setAnchor(a => shiftAnchor(view, a, -1)), [view]);
  const goNext = useCallback(() => setAnchor(a => shiftAnchor(view, a, 1)), [view]);
  const goToday = useCallback(() => setAnchor(todayKey), [todayKey]);

  const openTask = useCallback((task: Task) => {
    if (openProjectTask(task)) return;
    router.push({ pathname: '/(tabs)', params: { open: task.id } } as never);
  }, [router, openProjectTask]);

  const openSprint = useCallback((bar: SprintBar) => {
    router.push({ pathname: '/project/[id]/sprints', params: { id: bar.project.id } } as never);
  }, [router]);

  const openUndated = useCallback(() => {
    const first = undated[0];
    if (first) router.push({ pathname: '/project/[id]/sprints', params: { id: first.project.id } } as never);
  }, [undated, router]);

  const onMeetingPress = useCallback((m: Meeting) => setSelectedKey(m.id), []);
  const onSearchMeetingPress = useCallback((m: Meeting) => {
    setAnchor(m.date);
    setSelectedKey(m.id);
    setSearchOpen(false);
    setSearchQuery('');
  }, []);
  const onMeetingDelete = useCallback((m: Meeting) => deleteMeeting(resolveOrig(m).id), [resolveOrig, deleteMeeting]);
  const onSlotPress = useCallback((day: string, hour: number) => {
    setAnchor(day);
    openCreate({ day, time: `${String(hour).padStart(2, '0')}:00` });
  }, [openCreate]);

  // ─── Таймер наради ────────────────────────────────────────────────────────
  const toggleMeetingTimer = useCallback(async (meeting: Meeting) => {
    const running = findTimerForMeeting(activeTimers, meeting.id);
    if (running) await stopTimer(running.id);
    else await startMeetingTimer({ id: meeting.id, title: meeting.title, projectId: meeting.projectId });
  }, [activeTimers, startMeetingTimer, stopTimer]);

  const runningMeetingIds = useMemo(
    () => new Set(activeTimers.map(t => t.meetingId).filter(Boolean) as string[]),
    [activeTimers],
  );

  // ─── Аудіозапис ───────────────────────────────────────────────────────────
  const [recordingMtgId, setRecordingMtgId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const recordingRef = useRef<any>(null);
  const soundRef = useRef<any>(null);

  const startRecording = useCallback(async (mtgId: string) => {
    if (!AVAudio) { Alert.alert(tr.calRecPkgTitle, tr.calRecPkgBody); return; }
    try {
      const { granted } = await AVAudio.requestPermissionsAsync();
      if (!granted) { Alert.alert(tr.calRecNoPermTitle, tr.calRecNoPermBody); return; }
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await AVAudio.Recording.createAsync(AVAudio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setAdvertisingRecording(true);
      setRecordingMtgId(mtgId);
      setIsRecording(true);
      setRecordingStartedAt(Date.now());
    } catch (e: any) {
      if (__DEV__) console.warn('[record] start error:', e);
      Alert.alert(tr.calRecErrorTitle, e?.message);
    }
  }, [tr]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setAdvertisingRecording(false);
      setIsRecording(false);
      setRecordingStartedAt(null);
      // recordingMtgId — завжди id ОРИГІНАЛУ (не розбирати: `gcal_<eventId>`).
      if (uri && recordingMtgId) {
        const origId = recordingMtgId;
        mutateMeetings(fresh => withMeetingRecording(fresh, origId, uri));
      }
      setRecordingMtgId(null);
    } catch (e: any) {
      setRecordingStartedAt(null);
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
    Alert.alert(tr.calRecDeleteTitle, '', [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => {
        mutateMeetings(fresh => fresh.map(m => m.id === mtgId
          ? { ...m, recordings: (m.recordings ?? []).filter(r => r !== uri) }
          : m));
      }},
    ]);
  }, [mutateMeetings, tr]);

  useEffect(() => () => {
    setAdvertisingRecording(false);
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);

  const onMeetingRecord = useCallback((m: Meeting) => setRecordingMtgId(resolveOrig(m).id), [resolveOrig]);

  // На вузькому деталь — модальний лист; iOS не покаже другу модалку, доки
  // перша не зникла. У колонці деталь нікуди не дівається.
  const openOverDetail = useCallback((run: () => void) => {
    if (isExpanded) { run(); return; }
    setSelectedKey(null);
    setTimeout(run, 300);
  }, [isExpanded]);

  const selectedOrig = selectedMtg ? resolveOrig(selectedMtg) : null;
  const selectedTimer = selectedOrig ? findTimerForMeeting(activeTimers, selectedOrig.id) : undefined;

  // ─── Список дня ───────────────────────────────────────────────────────────
  // `readOnly` — права колонка планшета: без кошика й мікрофона в рядках
  // (тап відкриває деталь, де ці дії й живуть) і без власного «+».
  const renderAgenda = (day: string, readOnly = false) => (
    <DayAgenda
      day={day}
      title={dayTitle(day)}
      tasks={tasksByDay[day] ?? []}
      meetings={meetingsByDay[day] ?? []}
      sprints={sprintsOnDay(sprintBars, day)}
      c={c}
      isDark={isDark}
      tr={tr}
      compactTitle={readOnly}
      selectedMeetingKey={selectedKey}
      runningMeetingIds={runningMeetingIds}
      meetingProject={projectOf}
      onTaskPress={openTask}
      onMeetingPress={onMeetingPress}
      onMeetingDelete={readOnly ? undefined : onMeetingDelete}
      onMeetingRecord={readOnly ? undefined : onMeetingRecord}
      onSprintPress={openSprint}
    />
  );

  // Підказка стоїть ПІД панеллю виду, поза прокруткою, з тими самими
  // відступами в усіх видах: у прокрутці тижня вона з'їжджала під панель, а
  // в «Дні» мала інший відступ, ніж сітка.
  // P2 аудиту 2026-10: на ландшафті iPad банер разом із шапкою й чипами
  // лишав сітці годин ледь половину висоти — тепер його можна сховати (до
  // кінця сеансу екрана), а сам він — один рядок.
  const undatedHint = undated.length > 0 && !searchOpen && !undatedDismissed ? (
    <View style={[st.hint, { borderColor: c.border, backgroundColor: c.dim, marginHorizontal: 16, paddingVertical: 0, paddingRight: 0 }]}>
      <TouchableOpacity
        testID="calendar-undated-hint"
        onPress={openUndated}
        accessibilityRole="button"
        accessibilityLabel={`${tr.calUndatedSprints} ${undated.length}. ${tr.calUndatedSprintsHint}`}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <IconSymbol name="flag.checkered" size={14} color={c.sub} />
        <Text style={{ flex: 1, color: c.sub, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {tr.calUndatedSprints} {undated.length} · {tr.calUndatedSprintsHint}
        </Text>
        <IconSymbol name="chevron.right" size={12} color={c.sub} />
      </TouchableOpacity>
      <TouchableOpacity
        testID="calendar-undated-dismiss"
        onPress={() => setUndatedDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel={tr.close}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name="xmark" size={12} color={c.sub} />
      </TouchableOpacity>
    </View>
  ) : null;

  const showSideColumn = isExpanded;
  const bottomPad = Platform.OS === 'ios' ? 48 : 28;

  let content: React.ReactNode;
  if (!initialized) {
    content = <ActivityIndicator style={{ marginTop: 40 }} color={c.accent} />;
  } else if (searchOpen) {
    content = (
      <CalendarSearch
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={closeSearch}
        meetingsByDay={meetingsByDay}
        tasksByDay={tasksByDay}
        todayKey={todayKey}
        meetingProject={projectOf}
        onMeetingPress={onSearchMeetingPress}
        onTaskPress={openTask}
        isDark={isDark}
        c={c}
        tr={tr}
        bottomPad={bottomPad + 24}
      />
    );
  } else if (view === 'month') {
    content = (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + (isWide ? 24 : 72) }}
        showsVerticalScrollIndicator={false}>
        <MonthGrid
          rows={monthRows}
          month={anchorDate.getMonth()}
          todayKey={todayKey}
          selectedKey={anchor}
          tasksByDay={tasksByDay}
          meetingsByDay={meetingsByDay}
          sprintBars={sprintBars}
          onSelectDay={setAnchor}
          mode={isWide ? 'labels' : 'dots'}
          c={c}
          tr={tr}
        />
        {!showSideColumn ? <View style={{ marginTop: 18 }}>{renderAgenda(anchor)}</View> : null}
      </ScrollView>
    );
  } else if (view === 'week' && !isWide) {
    content = (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 72 }} showsVerticalScrollIndicator={false}>
        <WeekStrip
          days={range.days}
          todayKey={todayKey}
          selectedKey={anchor}
          tasksByDay={tasksByDay}
          meetingsByDay={meetingsByDay}
          sprintBars={sprintBars}
          onSelect={setAnchor}
          c={c}
          tr={tr}
        />
        <View style={{ marginTop: 16 }}>{renderAgenda(anchor)}</View>
      </ScrollView>
    );
  } else {
    content = (
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <TimeGrid
          days={range.days}
          todayKey={todayKey}
          selectedKey={anchor}
          tasksByDay={tasksByDay}
          meetingsByDay={meetingsByDay}
          sprintBars={sprintBars}
          selectedMeetingKey={selectedKey}
          onSelectDay={day => { setAnchor(day); if (view === 'week' && !showSideColumn) setView('day'); }}
          onMeetingPress={onMeetingPress}
          onTaskPress={openTask}
          onSlotPress={onSlotPress}
          onSprintPress={openSprint}
          c={c}
          tr={tr}
        />
      </View>
    );
  }

  return (
    <LinearGradient colors={[c.bg1, c.bg2]} style={{ flex: 1 }}>
      <View style={{ flex: 1, flexDirection: showSideColumn ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
            <ScreenHeader
              title={tr.calendar}
              color={c.text}
              back={{
                onPress: () => router.back(),
                label: tr.back,
                color: c.sub,
                style: { backgroundColor: c.dim, borderColor: c.border },
              }}
              actions={
                <>
                  <HeaderButton
                    onPress={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                    accessibilityLabel={tr.calSearch}
                    style={{ borderColor: searchOpen ? c.accent + '50' : c.border, backgroundColor: searchOpen ? c.accent + '14' : c.dim }}>
                    <IconSymbol name="magnifyingglass" size={16} color={searchOpen ? c.accent : c.sub} />
                  </HeaderButton>
                  <HeaderButton
                    onPress={() => { closeSearch(); goToday(); }}
                    accessibilityLabel={tr.today}
                    style={{ borderColor: isCurrentPeriod ? c.accent + '50' : c.border, backgroundColor: isCurrentPeriod ? c.accent + '14' : c.dim }}>
                    <IconSymbol name="calendar" size={16} color={isCurrentPeriod ? c.accent : c.sub} />
                  </HeaderButton>
                  <HeaderButton
                    onPress={() => setShowGcalSheet(true)}
                    accessibilityLabel="Google Calendar"
                    style={{ borderColor: gcal.token ? '#34A85350' : c.border, backgroundColor: gcal.token ? '#34A85315' : c.dim }}>
                    {gcal.importing
                      ? <ActivityIndicator size="small" color="#34A853" />
                      : <IconSymbol name={gcal.token ? 'checkmark.circle.fill' : 'arrow.triangle.2.circlepath'} size={17} color={gcal.token ? '#34A853' : c.sub} />}
                  </HeaderButton>
                  {isWide ? (
                    <HeaderButton
                      onPress={() => openCreate({ day: anchor })}
                      accessibilityLabel={tr.calCreateTitle}
                      style={{ borderColor: c.accent + '50', backgroundColor: c.accent + '14' }}>
                      <IconSymbol name="plus" size={18} color={c.accent} />
                    </HeaderButton>
                  ) : null}
                </>
              }
            />
            {!searchOpen ? <CalendarToolbar
              view={view}
              onViewChange={setView}
              title={title}
              onPrev={goPrev}
              onNext={goNext}
              projects={projects}
              filter={filter}
              onFilterChange={setFilter}
              showDone={showDone}
              onToggleDone={() => setShowDone(v => !v)}
              onlyMine={onlyMine}
              onToggleOnlyMine={() => setOnlyMine(v => !v)}
              canFilterMine={projects.length > 0 && Boolean(myUserId)}
              wide={isWide}
              c={c}
              tr={tr}
            /> : null}
            {undatedHint}
            {content}
          </SafeAreaView>

          {/* FAB — лише на телефоні; на планшеті «+» стоїть у шапці. */}
          {!isWide && !searchOpen ? (
            <TouchableOpacity
              onPress={() => openCreate({ day: anchor })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={tr.calCreateTitle}
              testID="calendar-fab"
              style={[st.fab, { backgroundColor: c.accent }]}>
              <IconSymbol name="plus" size={26} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>

        {showSideColumn && !selectedMtg ? (
          <View style={[st.sideColumn, { width: DETAIL_COLUMN_WIDTH, borderLeftColor: c.border, backgroundColor: isDark ? 'rgba(10,10,20,0.6)' : 'rgba(255,255,255,0.45)' }]}>
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                {renderAgenda(anchor, true)}
              </ScrollView>
            </SafeAreaView>
          </View>
        ) : null}

        {(selectedMtg || !showSideColumn) ? (
          <DetailPane
            open={!!selectedMtg}
            wide={showSideColumn}
            onClose={() => setSelectedKey(null)}
            isDark={isDark}
            sheetColor={isDark ? 'rgba(10,10,20,0.98)' : 'rgba(245,244,255,0.98)'}
            borderColor={c.border}
            maxHeight={height * 0.86}
            scrollRef={detailScrollRef}
            header={selectedMtg && selectedOrig ? (
              <MeetingDetailHeader
                meeting={selectedMtg}
                original={selectedOrig}
                onEdit={() => openOverDetail(() => openEdit(selectedOrig))}
                onClose={() => setSelectedKey(null)}
                isExpanded={showSideColumn}
                colors={c}
                tr={tr}
              />
            ) : null}>
            {selectedMtg && selectedOrig ? (
              <MeetingDetailBody
                meeting={selectedMtg}
                original={selectedOrig}
                project={meetingProject(selectedOrig, projects)}
                timer={selectedTimer}
                onToggleTimer={() => { void toggleMeetingTimer(selectedOrig); }}
                onEdit={() => openOverDetail(() => openEdit(selectedOrig))}
                onRecord={() => openOverDetail(() => setRecordingMtgId(selectedOrig.id))}
                onPlayRecording={uri => { void playRecording(uri); }}
                onDeleteRecording={uri => deleteRecording(selectedOrig.id, uri)}
                playingUri={playingUri}
                colors={c}
                tr={tr}
                locale={locale}
              />
            ) : null}
          </DetailPane>
        ) : null}
      </View>

      <CreateChooser
        visible={!!createTarget}
        subtitle={createSubtitle}
        onClose={() => setCreateTarget(null)}
        onMeeting={chooseMeeting}
        onTask={chooseTask}
        isDark={isDark}
        wide={isWide}
        c={c}
        tr={tr}
      />

      <MeetingFormSheet
        visible={showForm}
        initial={formInitial}
        presetDate={formPresetDate}
        presetProjectId={presetProjectId}
        onClose={() => setShowForm(false)}
        onSave={handleFormSave}
        onDelete={formInitial?.id ? () => { deleteMeeting(formInitial.id!); setShowForm(false); } : undefined}
        isDark={isDark}
        lang={lang}
        tr={tr}
        markedDays={markedDays}
        projects={projects as readonly CalendarProject[]}
        currentUserId={myUserId}
        isProjectOwner={formProjectRole === 'owner'}
      />

      <CalendarTaskCreate
        visible={!!taskCreateDay}
        deadline={taskCreateDay ? deadlineIsoForKey(taskCreateDay) : null}
        projectId={presetProjectId}
        projects={projects}
        sprints={sprints}
        statuses={statuses}
        userId={myUserId}
        onCreate={createTask}
        onClose={() => setTaskCreateDay(null)}
        isDark={isDark}
        locale={locale}
        c={c}
      />

      <GoogleCalendarSheet visible={showGcalSheet} onClose={() => setShowGcalSheet(false)} gcal={gcal} isDark={isDark} c={c} />

      <RecordingModal
        visible={!!recordingMtgId}
        isRecording={isRecording}
        startedAt={recordingStartedAt}
        onStart={() => { if (recordingMtgId) void startRecording(recordingMtgId); }}
        onStop={() => { void stopRecording(); }}
        onClose={() => setRecordingMtgId(null)}
        isDark={isDark}
        c={c}
      />

      {projectTaskSheet}
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  fab: {
    position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 48 : 28, width: 56, height: 56,
    borderRadius: Atlas.radius.large, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  sideColumn: { borderLeftWidth: StyleSheet.hairlineWidth },
  hint: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    borderRadius: Atlas.radius.medium, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
});
