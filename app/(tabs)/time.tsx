import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/shared/PressableScale';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import { useI18n } from '@/store/i18n';
import { haptic } from '@/utils/haptics';
import { FullscreenTimers } from '@/components/time/FullscreenTimers';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { formatClock, formatDuration } from '@/utils/durationFormat';
import { elapsedSince } from '@/utils/taskTimer';
import { CONTENT_MAX_WIDTH, sheetColumnStyle, useContentWidth } from '@/hooks/use-content-width';
import { monthGrid } from '@/utils/dateUtils';
import type { ActiveTimer, Shift } from '@/utils/activeTimers';

interface ShiftCfg { label: string; icon: IconSymbolName; color: string; hours: string; }

interface TimeEntry { id: string; task: string; shift: Shift; duration: number; date: string; }

/** Рівно те, що рядок активного таймера показує про підзавдання. */
interface RowSubtask { id: string; title: string; done: boolean }

/**
 * Мінімум про завдання, потрібний, щоб прикріпити його до таймера.
 * Колонка й статус — не зайве: саме за ними стор вирішує, чи рухати завдання
 * в «У процесі» на старті.
 */
interface PickableTask {
  id: string;
  title: string;
  status: 'active' | 'done';
  kanbanColumnId?: string;
  subtasks?: RowSubtask[];
}

const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

function groupLabel(date: Date, todayStr: string, yesterdayStr: string, locale: string) {
  if (date.toDateString() === today.toDateString()) return todayStr;
  if (date.toDateString() === yesterday.toDateString()) return yesterdayStr;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}


export default function TimeScreen() {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { height, isWide } = useResponsive();
  const isDark = useColorScheme() === 'dark';
  useScreenView('time');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { pendingTask, setPendingTask, activeTimers, startAdHocTimer, startTaskTimer, stopTimer, tasksRevision, timeEntriesRevision } = useTimerContext();
  const { tr, lang } = useI18n();
  // Одиниці приходять зі словника: до цього кожен екран мав власну копію
  // форматування з вшитими «год» і «хв».
  const durationUnits = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const fmtDurLocal = useCallback((s: number) => formatDuration(s, durationUnits), [durationUnits]);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  // Мемоізовано, бо цей обʼєкт іде пропом у React.memo-рядок списку: новий
  // обʼєкт щосекунди (таймер) перерендерював би всю історію.
  const SHIFTS = useMemo<Record<Shift, ShiftCfg>>(() => ({
    morning: { label: tr.morning, icon: 'sun.horizon.fill', color: '#F59E0B', hours: '06–12' },
    day:     { label: tr.daytime, icon: 'sun.max.fill',     color: '#EF4444', hours: '12–18' },
    evening: { label: tr.evening, icon: 'sunset.fill',      color: '#8B5CF6', hours: '18–24' },
    night:   { label: tr.night,   icon: 'moon.fill',        color: '#0EA5E9', hours: '00–06' },
  }), [tr.morning, tr.daytime, tr.evening, tr.night]);
  const months = tr.months;
  const weekdaysShort = tr.weekdays;

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [timerSubtasks, setTimerSubtasks] = useState<Record<string, RowSubtask[]>>({});
  const [initialized, setInitialized] = useState(false);
  const [activeShift, setActiveShift] = useState<Shift>('morning');
  const [taskName, setTaskName] = useState('');
  // Прикріплене завдання. null — вільний таймер: час піде лише в історію
  // трекера, без сесії в завданні й без руху по дошці.
  const [linkedTask, setLinkedTask] = useState<PickableTask | null>(null);
  const [showTaskPick, setShowTaskPick] = useState(false);
  const [pickQuery, setPickQuery] = useState('');
  const [pickable, setPickable] = useState<PickableTask[]>([]);
  const [selected, setSelected] = useState<TimeEntry | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manTask, setManTask] = useState('');
  const [manHours, setManHours] = useState('');
  const [manMins, setManMins] = useState('');
  const [manShift, setManShift] = useState<Shift>('morning');

  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [showCal, setShowCal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // Режим зосередження відкривається лише звідси — з шапки вкладки «Час».
  const [fsOpen, setFsOpen] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Стор зупинки таймера дописує завершену сесію в 'time_entries' сам, повз
  // наш стан — без перечитування наступне локальне збереження (ручний запис,
  // видалення) затерло б її. Ідентичність масиву зберігаємо, коли нічого не
  // змінилось: інакше ефект збереження ганяв би в синк ті самі дані.
  const reloadEntries = useCallback(async () => {
    const data = await loadData<TimeEntry[]>('time_entries', []);
    setEntries(prev =>
      prev.length === data.length && prev.every((e, i) => e.id === data[i].id) ? prev : data,
    );
  }, []);

  // Load from storage
  useEffect(() => {
    loadData<TimeEntry[]>('time_entries', []).then(data => {
      setEntries(data);
      setInitialized(true);
    });
  }, []);

  // Таймер тепер зупиняють і з кореневої кнопки режиму зосередження — тобто
  // поверх ЦЬОГО екрана, без його розмонтування й без повернення фокуса.
  // Лічилка стору — єдиний сигнал, що дзеркало сесії дописане; без неї список
  // лишався б таким, яким був до зупинки.
  useEffect(() => {
    if (timeEntriesRevision > 0) void reloadEntries();
  }, [timeEntriesRevision, reloadEntries]);

  // Підзавдання для рядків активних таймерів.
  //
  // Читаємо 'tasks' ЛИШЕ коли серед активних є таймер завдання: у користувача,
  // який тримає вільний секундомір, немає причин щоразу піднімати зі сховища
  // весь список завдань. tasksRevision у залежностях, бо стор пише в 'tasks'
  // повз наш стан — і без нього список лишався б таким, яким був до старту.
  const hasTaskTimers = activeTimers.some(t => t.taskId);
  const reloadTimerSubtasks = useCallback(async () => {
    if (!hasTaskTimers) { setTimerSubtasks({}); return; }
    try {
      const stored = await loadData<{ id: string; subtasks?: RowSubtask[] }[]>('tasks', []);
      const map: Record<string, RowSubtask[]> = {};
      for (const task of stored) {
        if (task?.id && task.subtasks?.length) map[task.id] = task.subtasks;
      }
      setTimerSubtasks(map);
    } catch (e) {
      if (__DEV__) console.warn('[time] підзавдання активних таймерів не прочитались:', e);
    }
  }, [hasTaskTimers]);

  useEffect(() => { void reloadTimerSubtasks(); }, [reloadTimerSubtasks, tasksRevision]);

  // Save to storage
  useEffect(() => {
    if (initialized) void saveSynced('time_entries', entries);
  }, [entries, initialized]);

  // Pick up task from tasks screen
  useFocusEffect(useCallback(() => {
    if (pendingTask) {
      setTaskName(pendingTask);
      setPendingTask('');
    }
    // Повернення на вкладку — момент підхопити сесії, дописані стором
    // (зупинка з деталі завдання або з повноекранного режиму).
    void reloadEntries();
  }, [pendingTask, setPendingTask, reloadEntries]));

  const startNew = useCallback(async () => {
    haptic.medium();
    if (linkedTask) {
      // Таймер завдання, а не вільний: лише він дописує сесію в task.timeEntries
      // і рухає завдання «До роботи» → «У процесі» → на стопі «На перевірці».
      await startTaskTimer({
        id: linkedTask.id,
        title: linkedTask.title,
        kanbanColumnId: linkedTask.kanbanColumnId,
        status: linkedTask.status,
      });
    } else {
      await startAdHocTimer(taskName.trim() || tr.untitled, activeShift);
    }
    setTaskName('');
    setLinkedTask(null);
  }, [activeShift, linkedTask, startAdHocTimer, startTaskTimer, taskName, tr.untitled]);

  /** Список завдань для прикріплення. Читаємо при відкритті, а не тримаємо. */
  const openTaskPick = useCallback(async () => {
    setShowTaskPick(true);
    setPickQuery('');
    try {
      const stored = await loadData<PickableTask[]>('tasks', []);
      setPickable(stored.filter(t => t?.id && t.status !== 'done'));
    } catch (e) {
      if (__DEV__) console.warn('[time] список завдань не прочитався:', e);
    }
  }, []);

  const pickedTasks = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const list = q ? pickable.filter(t => t.title.toLowerCase().includes(q)) : pickable;
    return list.slice(0, 60);
  }, [pickable, pickQuery]);

  const stopActive = useCallback(async (id: string) => {
    haptic.medium();
    await stopTimer(id);
    // Стор щойно дописав дзеркало сесії — забираємо його у свій стан.
    await reloadEntries();
  }, [reloadEntries, stopTimer]);

  const addManual = () => {
    const h = parseInt(manHours || '0', 10), m = parseInt(manMins || '0', 10);
    const dur = h * 3600 + m * 60;
    if (!dur || !manTask.trim()) return;
    setEntries(p => [{ id: Date.now().toString(), task: manTask.trim(), shift: manShift, duration: dur, date: new Date().toISOString() }, ...p]);
    setManTask(''); setManHours(''); setManMins(''); setShowAdd(false);
  };

  const deleteEntry = (id: string) => { setEntries(p => p.filter(e => e.id !== id)); if (selected?.id === id) setSelected(null); };

  const total = entries.reduce((s, e) => s + e.duration, 0);
  const avg   = entries.length > 0 ? Math.round(total / entries.length) : 0;

  const filteredEntries = useMemo(() => {
    if (!dateFilter) return entries;
    return entries.filter(e => new Date(e.date).toDateString() === dateFilter);
  }, [entries, dateFilter]);

  const sections = useMemo(() => {
    const map: Record<string, { label: string; dayTotal: number; data: TimeEntry[] }> = {};
    const order: string[] = [];
    filteredEntries.forEach(e => {
      const d = new Date(e.date);
      const key = d.toDateString();
      if (!map[key]) { map[key] = { label: groupLabel(d, tr.today, tr.yesterday, locale), dayTotal: 0, data: [] }; order.push(key); }
      map[key].data.push(e);
      map[key].dayTotal += e.duration;
    });
    return order.map(k => map[k]);
    // Підписи груп («Сьогодні», «Вчора») залежать від мови — без цих
    // залежностей історія лишалася б підписаною попередньою мовою.
  }, [filteredEntries, tr.today, tr.yesterday, locale]);

  // Сітка місяця — зі спільної утиліти; локальна копія рахувала зсув
  // понеділка окремо й могла розійтися з календарем завдань.
  const calWeeks = useMemo(() => monthGrid(calYear, calMonth), [calYear, calMonth]);

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => {
      const d = new Date(e.date);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [entries]);

  // Мемоізовано разом із рядками списку: інакше memo не спрацює.
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
    text:   isDark ? '#EEF0FF' : '#0D1033',
    sub:    isDark ? 'rgba(238,240,255,0.62)' : 'rgba(13,16,51,0.58)',
    indigo: '#6366F1',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(10,12,24,0.98)' : 'rgba(250,251,255,0.98)',
  }), [isDark]);

  const handleSelect = useCallback((entry: TimeEntry) => setSelected(entry), []);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1 }}>

        {/* Fixed Header */}
        <ScreenHeader
          title={tr.navTimeTracker}
          color={c.text}
          paddingBottom={14}
          actions={
            <>
              {/*
                Єдиний вхід у режим зосередження — і на телефоні, і на планшеті.
                Плаваючої кнопки в кореневому лейауті більше немає: вона висіла
                над кожним екраном, а режим показує таймери, тож його місце —
                у їхньому розділі.

                Умова на активні таймери: режим показує те, що йде просто зараз,
                і вхід у порожню сітку обіцяв би, що там щось є.
              */}
              {activeTimers.length > 0 && (
                <HeaderButton
                  onPress={() => { haptic.light(); setFsOpen(true); }}
                  accessibilityLabel={
                    activeTimers.length > 0
                      ? `${tr.fullscreenTimers}, ${tr.activeTimers}: ${activeTimers.length}`
                      : `${tr.fullscreenTimers}, ${tr.noActiveTimers}`
                  }
                  style={{ backgroundColor: c.indigo + '20', borderColor: c.indigo }}>
                  <IconSymbol name="timer" size={17} color={c.indigo} />
                </HeaderButton>
              )}
              <HeaderButton
                onPress={() => setShowMenu(true)}
                accessibilityLabel={tr.filtersAndSort}
                style={{ backgroundColor: dateFilter ? c.indigo + '20' : c.dim, borderColor: dateFilter ? c.indigo : c.border }}>
                <IconSymbol name="slider.horizontal.3" size={17} color={dateFilter ? c.indigo : c.sub} />
              </HeaderButton>
            </>
          }
        />

        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingTop: 8, paddingBottom: tabBarInset + 24 }]}
          showsVerticalScrollIndicator={false}
          // Заголовки днів не липкі — так було й до віртуалізації.
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 14 }}>
              <Text style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{section.label}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <IconSymbol name="timer" size={11} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700' }}>{fmtDurLocal(section.dayTotal)}</Text>
              </View>
            </View>
          )}
          // Відступи повторюють колишню розмітку: 8 між картками,
          // 6 після групи (разом із marginTop заголовка — ті самі 20).
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionFooter={() => <View style={{ height: 6 }} />}
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              cfg={SHIFTS[item.shift]}
              isDark={isDark}
              border={c.border}
              text={c.text}
              sub={c.sub}
              duration={fmtDurLocal(item.duration)}
              onPress={handleSelect}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <IconSymbol name="clock.fill" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>{tr.noRecordsYet}</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>Натисніть + для ручного запису</Text>
            </View>
          }
          ListHeaderComponent={
            <>
          {/* Date filter chip */}
          {dateFilter && (
            <TouchableOpacity
              onPress={() => setDateFilter(null)}
              style={[s.dateChip, { backgroundColor: c.indigo + '20', borderColor: c.indigo + '60' }]}>
              <IconSymbol name="calendar" size={13} color={c.indigo} />
              <Text style={{ color: c.indigo, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                {new Date(dateFilter).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
              </Text>
              <IconSymbol name="xmark" size={13} color={c.indigo} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}

          {/* Запуск нового таймера. Годинника тут більше немає: сесії, що
              тривають, живуть у секції нижче — їх може бути кілька одразу. */}
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.timerCard, { borderColor: c.border }]}>
            <Text style={[s.cardTitle, { color: c.sub }]}>{tr.newTimer}</Text>

            {linkedTask ? (
              // Прикріплене завдання заміщає поле назви: назва береться з нього,
              // і два джерела імені таймера тільки збивали б з пантелику.
              <View style={[s.linkedRow, { borderColor: c.indigo + '60', backgroundColor: c.indigo + '14' }]}>
                <IconSymbol name="checklist" size={14} color={c.indigo} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, color: c.text, fontSize: 14, fontWeight: '600' }}>
                  {linkedTask.title}
                </Text>
                <TouchableOpacity
                  onPress={() => setLinkedTask(null)}
                  accessibilityLabel={tr.detachTask}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol name="xmark" size={13} color={c.sub} />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput
                  placeholder={tr.taskNamePlaceholder2}
                  placeholderTextColor={c.sub}
                  value={taskName}
                  onChangeText={setTaskName}
                  style={[s.taskInput, { color: c.text, borderColor: c.border }]}
                  textAlign="center"
                  returnKeyType="go"
                  onSubmitEditing={() => { void startNew(); }}
                />

                {/* Без завдання таймер нічого не змінює на дошці й не лишає
                    сесії в завданні — про це треба сказати ДО старту, а не
                    після, коли час уже пішов не туди. */}
                <TouchableOpacity
                  onPress={() => { void openTaskPick(); }}
                  style={[s.attachBtn, { borderColor: c.border }]}>
                  <IconSymbol name="link" size={13} color={c.indigo} />
                  <Text style={{ color: c.indigo, fontSize: 13, fontWeight: '600', marginLeft: 6 }}>
                    {tr.attachTask}
                  </Text>
                </TouchableOpacity>
                <Text style={{ color: c.sub, fontSize: 11, textAlign: 'center', marginTop: 6, opacity: 0.8 }}>
                  {tr.freeTimerHint}
                </Text>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 18, alignSelf: 'stretch' }}>
              {(Object.keys(SHIFTS) as Shift[]).map(sh => {
                const cfg = SHIFTS[sh]; const active = activeShift === sh;
                return (
                  <TouchableOpacity
                    key={sh}
                    onPress={() => setActiveShift(sh)}
                    style={[s.shiftPill, { borderColor: active ? cfg.color : c.border, backgroundColor: active ? cfg.color + '20' : 'transparent' }]}>
                    <IconSymbol name={cfg.icon} size={14} color={active ? cfg.color : c.sub} />
                    <Text style={{ fontSize: 11, fontWeight: '600', marginLeft: 3, color: active ? cfg.color : c.sub }}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => { void startNew(); }}
              accessibilityLabel={tr.startTimerAction}
              style={[s.timerBtn, { backgroundColor: c.indigo }]}
              activeOpacity={0.85}>
              <IconSymbol name="play.fill" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 7 }}>{tr.start}</Text>
            </TouchableOpacity>
          </BlurView>

          {/* Активні таймери. Порожньої секції немає навмисно: місце під
              заголовок «Активні (0)» щодня займало б екран ні за що. */}
          {activeTimers.length > 0 && (
            <View style={{ marginTop: 18 }}>
              <Text style={[s.sectionTitle, { color: c.text, marginBottom: 10 }]}>
                {tr.activeTimers} ({activeTimers.length})
              </Text>
              {activeTimers.map(timer => (
                <ActiveTimerRow
                  key={timer.id}
                  timer={timer}
                  subtasks={timer.taskId ? timerSubtasks[timer.taskId] : undefined}
                  cfg={SHIFTS[timer.shift] ?? SHIFTS.day}
                  isDark={isDark}
                  border={c.border}
                  text={c.text}
                  sub={c.sub}
                  stopLabel={tr.stopTimerAction}
                  onStop={stopActive}
                />
              ))}
            </View>
          )}

          {/* Stats */}
          <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card, marginTop: 14 }]}>
            <StatCell value={total > 0 ? fmtDurLocal(total) : '—'} label={tr.totalLabel}    color={c.indigo} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={String(entries.length)}           label={tr.sessionsCount} color="#10B981" sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={avg > 0 ? fmtDurLocal(avg) : '—'}     label={tr.avgLabel}      color="#F59E0B" sub={c.sub} />
          </View>

          {/* History */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 4 }}>
            <Text style={[s.sectionTitle, { color: c.text, flex: 1 }]}>{tr.history}</Text>
          </View>
            </>
          }
        />
      </View>

      {/* FAB */}
      <PressableScale onPress={() => { haptic.medium(); setShowAdd(true); }} scaleTo={0.92} style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: c.indigo }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </PressableScale>

      {/* ─── Вибір завдання для таймера ─── */}
      <Modal visible={showTaskPick} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowTaskPick(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
          onPress={() => setShowTaskPick(false)}
          accessibilityRole="button"
        />
        <View
          style={[
            s.pickSheet,
            { backgroundColor: c.sheet, paddingBottom: insets.bottom + 14 },
            // На планшеті список завдань на всю ширину дає рядки завдовжки з
            // екран — око не встигає повернутися до початку наступного.
            isWide && { maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
          ]}>
          <View style={[s.handle, { backgroundColor: c.border, alignSelf: 'center', marginBottom: 12 }]} />
          <Text style={[s.sheetTitle, { color: c.text, marginBottom: 10 }]}>{tr.pickTaskTitle}</Text>

          <TextInput
            placeholder={tr.taskNamePlaceholder2}
            placeholderTextColor={c.sub}
            value={pickQuery}
            onChangeText={setPickQuery}
            style={[s.pickSearch, { color: c.text, borderColor: c.border }]}
            autoCorrect={false}
          />

          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 10 }}>
            {pickedTasks.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 26 }}>
                {tr.noTasks}
              </Text>
            ) : pickedTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                onPress={() => {
                  haptic.light();
                  setLinkedTask(task);
                  setTaskName(task.title);
                  setShowTaskPick(false);
                }}
                style={[s.pickRow, { borderColor: c.border }]}>
                <IconSymbol name="checklist" size={15} color={c.indigo} />
                <Text numberOfLines={1} style={{ flex: 1, marginLeft: 10, color: c.text, fontSize: 14 }}>
                  {task.title}
                </Text>
                {task.subtasks?.length ? (
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700' }}>
                    {task.subtasks.filter(x => x.done).length}/{task.subtasks.length}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Context Menu Modal ─── */}
      <Modal visible={showMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowMenu(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
          onPress={() => setShowMenu(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{ position: 'absolute', top: insets.top + 62, right: 16, width: 220 }}>
            <BlurView intensity={isDark ? 60 : 75} tint={isDark ? 'dark' : 'light'} style={[s.menuBox, { borderColor: c.border }]}>

              {/* Календар */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); setShowCal(true); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: dateFilter ? c.indigo + '25' : c.dim }]}>
                  <IconSymbol name="calendar" size={15} color={dateFilter ? c.indigo : c.sub} />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.calendar}</Text>
                {dateFilter
                  ? <View style={[s.menuPill, { backgroundColor: c.indigo + '20', borderColor: c.indigo + '40' }]}>
                      <Text style={[s.menuPillText, { color: c.indigo }]}>
                        {new Date(dateFilter).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  : <IconSymbol name="chevron.right" size={13} color={c.sub} />
                }
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Статистика */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/time-stats'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: c.indigo + '25' }]}>
                  <IconSymbol name="chart.bar.fill" size={15} color={c.indigo} />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>{tr.statistics}</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Calendar Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>

                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowCal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.left" size={20} color={c.sub} />
                  </TouchableOpacity>
                  <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
                    {months[calMonth]} {calYear}
                  </Text>
                  <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.right" size={20} color={c.sub} />
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                  {weekdaysShort.map(d => (
                    <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                  ))}
                </View>

                {calWeeks.map((week, wi) => (
                  <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {week.map((day, di) => {
                      if (!day) return <View key={di} style={{ flex: 1 }} />;
                      const dayDate = new Date(calYear, calMonth, day);
                      const keyStr = `${calYear}-${calMonth}-${day}`;
                      const isToday = dayDate.toDateString() === today.toDateString();
                      const isSel = dateFilter === dayDate.toDateString();
                      const hasMark = markedDays.has(keyStr);
                      return (
                        <TouchableOpacity
                          key={di}
                          onPress={() => { setDateFilter(isSel ? null : dayDate.toDateString()); setShowCal(false); }}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                          <View style={[s.dayCell, isSel && { backgroundColor: c.indigo }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.indigo }]}>
                            <Text style={{ color: isSel ? '#fff' : isToday ? c.indigo : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                          </View>
                          {hasMark && !isSel && <View style={[s.daydot, { backgroundColor: c.indigo }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>{tr.resetFilter}</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Manual ─── */}
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={[s.sheetTitle, { color: c.text }]}>Ручний запис</Text>

                  {/* Task name */}
                  <Text style={[s.label, { color: c.sub }]}>ЗАВДАННЯ</Text>
                  <TextInput
                    placeholder={tr.taskNamePlaceholder2}
                    placeholderTextColor={c.sub}
                    value={manTask}
                    onChangeText={setManTask}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  {/* Duration block */}
                  <Text style={[s.label, { color: c.sub }]}>ТРИВАЛІСТЬ</Text>
                  <View style={[s.durBlock, { backgroundColor: c.indigo + '12', borderColor: c.indigo + '30' }]}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={manHours}
                        onChangeText={setManHours}
                        keyboardType="number-pad"
                        style={{ color: c.indigo, fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1 }}
                      />
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.hrs}</Text>
                    </View>
                    <Text style={{ color: c.sub, fontSize: 28, fontWeight: '200', alignSelf: 'center', marginBottom: 16 }}>:</Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={manMins}
                        onChangeText={setManMins}
                        keyboardType="number-pad"
                        style={{ color: c.indigo, fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1 }}
                      />
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.mins}</Text>
                    </View>
                  </View>

                  {/* Shift */}
                  <Text style={[s.label, { color: c.sub }]}>ЗМІНА</Text>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {(Object.keys(SHIFTS) as Shift[]).map(sh => {
                      const cfg = SHIFTS[sh]; const active = manShift === sh;
                      return (
                        <TouchableOpacity
                          key={sh}
                          onPress={() => setManShift(sh)}
                          style={[s.shiftOption, { borderColor: active ? cfg.color : c.border, backgroundColor: active ? cfg.color + '20' : 'transparent' }]}>
                          <IconSymbol name={cfg.icon} size={16} color={active ? cfg.color : c.sub} />
                          <Text style={{ color: active ? cfg.color : c.sub, fontSize: 10, fontWeight: '600', marginTop: 3 }}>{cfg.label}</Text>
                          <Text style={{ color: active ? cfg.color : c.sub, fontSize: 9, opacity: 0.7 }}>{cfg.hours}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={addManual}
                      disabled={!manTask.trim()}
                      style={[s.btn, { flex: 2, backgroundColor: manTask.trim() ? c.indigo : c.dim }]}>
                      <IconSymbol name="timer" size={15} color={manTask.trim() ? '#fff' : c.sub} />
                      <Text style={{ color: manTask.trim() ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>{tr.save}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelected(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              {selected && (() => {
                const cfg = SHIFTS[selected.shift];
                return (
                  <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <View style={s.handleRow}>
                        <View style={{ flex: 1 }} />
                        <View style={[s.handle, { backgroundColor: c.border }]} />
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="xmark" size={17} color={c.sub} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Hero */}
                      <View style={[s.detailHero, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '25' }]}>
                        <View style={[s.detailIcon, { backgroundColor: cfg.color + '25' }]}>
                          <IconSymbol name={cfg.icon} size={30} color={cfg.color} />
                        </View>
                        <Text style={[s.detailDur, { color: cfg.color, marginTop: 12 }]}>{fmtDurLocal(selected.duration)}</Text>
                        <Text style={[s.detailTask, { color: c.text, marginTop: 4, textAlign: 'center' }]}>{selected.task}</Text>
                        <View style={[s.shiftBadge, { borderColor: cfg.color + '50', backgroundColor: cfg.color + '20', marginTop: 10 }]}>
                          <IconSymbol name={cfg.icon} size={12} color={cfg.color} />
                          <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>
                            {cfg.label} · {cfg.hours}
                          </Text>
                        </View>
                      </View>

                      <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginTop: 14 }]}>
                        <InfoRow icon="timer"    label={tr.duration}  value={fmtDurLocal(selected.duration)} text={c.text} sub={c.sub} border={c.border} last={false} />
                        <InfoRow icon="calendar" label={tr.date}      value={new Date(selected.date).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} text={c.text} sub={c.sub} border={c.border} last />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                        <TouchableOpacity
                          onPress={() => deleteEntry(selected.id)}
                          style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                          <IconSymbol name="trash" size={15} color="#EF4444" />
                          <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>{tr.delete}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { flex: 2, backgroundColor: c.indigo }]}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.close}</Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  </BlurView>
                );
              })()}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <FullscreenTimers visible={fsOpen} onClose={() => setFsOpen(false)} />
    </View>
  );
}

interface ActiveTimerRowProps {
  subtasks?: RowSubtask[];
  timer: ActiveTimer;
  cfg: ShiftCfg;
  isDark: boolean;
  border: string;
  text: string;
  sub: string;
  stopLabel: string;
  onStop: (id: string) => void;
}

/**
 * Рядок таймера, що йде. Час іде через ElapsedClock, а не через
 * formatClock прямо в <Text>: інакше число завмирає до наступного
 * перерендеру екрана — саме через це «час змінювався лише після оновлення».
 */
const ActiveTimerRow = React.memo(function ActiveTimerRow({ timer, subtasks, cfg, isDark, border, text, sub, stopLabel, onStop }: ActiveTimerRowProps) {
  const all = subtasks ?? [];
  const doneCount = all.filter(x => x.done).length;
  // Два рядки — стеля: список тут довідка збоку від годинника, а не екран
  // завдання. Решта ховається за лічильник, щоб рядок не ріс без меж.
  const pending = all.filter(x => !x.done).slice(0, 2);
  const hidden = all.filter(x => !x.done).length - pending.length;
  return (
    <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.activeRow, { borderColor: border }]}>
      <View style={[s.rowDot, { backgroundColor: cfg.color }]} />
      <View style={{ flex: 1, marginLeft: 11, marginRight: 8 }}>
        <Text style={[s.entryTask, { color: text }]} numberOfLines={1}>{timer.label}</Text>
        <Text style={[s.entryMeta, { color: sub }]}>
          {cfg.label} · {cfg.hours}
          {all.length > 0 ? ` · ${doneCount}/${all.length}` : ''}
        </Text>
        {pending.map(item => (
          <View key={item.id} style={s.rowSubLine}>
            <View style={[s.rowSubDot, { borderColor: sub }]} />
            <Text numberOfLines={1} style={[s.rowSubText, { color: sub }]}>{item.title}</Text>
          </View>
        ))}
        {hidden > 0 && (
          <Text style={[s.rowSubMore, { color: sub }]}>+{hidden}</Text>
        )}
      </View>
      <ElapsedClock
        running
        seconds={now => elapsedSince(timer.startedAt, now)}
        format={formatClock}
        style={[s.rowClock, { color: cfg.color }]}
      />
      <TouchableOpacity
        onPress={() => onStop(timer.id)}
        accessibilityLabel={stopLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={s.stopBtn}>
        <IconSymbol name="stop.fill" size={13} color="#EF4444" />
      </TouchableOpacity>
    </BlurView>
  );
});

interface EntryRowProps {
  entry: TimeEntry;
  cfg: ShiftCfg;
  isDark: boolean;
  border: string;
  text: string;
  sub: string;
  /** Готовий рядок, а не секунди: щоб не тягти сюди функцію форматування. */
  duration: string;
  onPress: (entry: TimeEntry) => void;
}

/**
 * Рядок історії окремим memo-компонентом: поки біжить таймер, екран
 * перемальовується щосекунди, і без цього разом із ним перемальовувався
 * б увесь список записів.
 */
const EntryRow = React.memo(function EntryRow({ entry, cfg, isDark, border, text, sub, duration, onPress }: EntryRowProps) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => onPress(entry)}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.entryCard, { borderColor: border }]}>
        <View style={[s.shiftIcon, { backgroundColor: cfg.color + '20' }]}>
          <IconSymbol name={cfg.icon} size={17} color={cfg.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 13 }}>
          <Text style={[s.entryTask, { color: text }]}>{entry.task}</Text>
          <Text style={[s.entryMeta, { color: sub }]}>{cfg.label} · {cfg.hours}</Text>
        </View>
        <Text style={[s.entryDur, { color: cfg.color }]}>{duration}</Text>
      </BlurView>
    </TouchableOpacity>
  );
});

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <Text style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 13 }, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <IconSymbol name={icon as IconSymbolName} size={14} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontWeight: '600', width: 80, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  dateChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  timerCard:   { borderRadius: 22, borderWidth: 1, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, overflow: 'hidden', alignItems: 'center' },
  cardTitle:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  linkedRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginTop: 4 },
  attachBtn:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7, marginTop: 10 },
  pickSheet:   { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  pickSearch:  { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  pickRow:     { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
  taskInput:   { fontSize: 15, fontWeight: '600', borderBottomWidth: 1, paddingVertical: 9, minWidth: 220, alignSelf: 'stretch', textAlign: 'center', marginTop: 10 },
  activeRow:   { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowDot:      { width: 9, height: 9, borderRadius: 5 },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  rowSubDot:  { width: 6, height: 6, borderRadius: 3, borderWidth: 1.2, marginRight: 6 },
  rowSubText: { flex: 1, fontSize: 11, opacity: 0.85 },
  rowSubMore: { fontSize: 10, fontWeight: '700', marginTop: 3, letterSpacing: 0.3 },
  rowClock:    { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'], marginRight: 10 },
  stopBtn:     { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)', backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' },
  shiftPill:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  shiftBadge:  { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  timerBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14 },
  statsRow:    { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle:{ fontSize: 17, fontWeight: '800' },
  groupLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  entryCard:   { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  shiftIcon:   { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  entryTask:   { fontSize: 13, fontWeight: '600' },
  entryMeta:   { fontSize: 11, marginTop: 2 },
  entryDur:    { fontSize: 13, fontWeight: '800' },
  fab:         { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  // Context menu
  menuBox:     { borderRadius: 18, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 },
  menuItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  menuIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuLabel:   { flex: 1, fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, marginHorizontal: 14 },
  menuPill:    { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  menuPillText:{ fontSize: 11, fontWeight: '700' },
  durBlock:    { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start', marginBottom: 4 },
  detailHero:  { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  shiftOption: { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 11, alignItems: 'center' },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailDur:   { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  detailTask:  { fontSize: 15, fontWeight: '600', marginTop: 4 },
  infoBlock:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  navBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot:      { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
});
