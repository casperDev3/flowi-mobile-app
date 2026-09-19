/**
 * components/time/FullscreenTimers.tsx
 *
 * Повноекранний режим активних таймерів: сітка годинників, на яку дивляться
 * краєм ока під час роботи.
 *
 * Режим — модалка поверх усього, а не окремий маршрут. Тому навігацію
 * (сайдбар, таб-бар) ховати не треба: модалка перекриває її сама. Дописувати
 * щось у SIDEBAR_HIDDEN_ON було б помилкою — та константа водночас працює
 * гвардом редіректу гостя, і запис туди зробив би режим «авторизаційним».
 *
 * Сітка рахується від ШИРИНИ ВІКНА (useResponsive), а не від типу пристрою:
 * у Split View на iPad половина екрана — це компактне вікно, і колонок там
 * має бути стільки ж, скільки на телефоні.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimerCell } from '@/components/time/TimerCell';
import { TimerDial } from '@/components/time/dials/TimerDial';
import { DialPicker } from '@/components/time/DialPicker';
import { shouldSmoothDial } from '@/utils/dialSmooth';
import { timerExpandedDialSize, timerFocusLayout } from '@/utils/timerGrid';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTimerDials } from '@/hooks/use-timer-dial';
import { useMotion } from '@/hooks/use-motion';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import type { ActiveTimer } from '@/utils/activeTimers';
import { isOverdue, type HistoryEventType, type Task, type TaskHistoryEvent } from '@/utils/taskUtils';

const STOP = '#EF4444';
const PAD = 16;
const GAP = 12;
/** Висота шапки з кнопкою виходу — вираховується з простору під сітку. */
const HEADER_H = 46;
/** Нижче цього клітинка перестає бути читабельною здалеку, і краще скрол. */
const MIN_CELL_H = 132;

/**
 * Мінімум із 'projects', потрібний для крапки. Повний тип живе в
 * app/projects.tsx, але компонент не має залежати від файла-маршруту.
 */
interface ProjectRef {
  id: string;
  name: string;
  color: string;
}

/**
 * useKeepAwake не можна викликати умовно, а екран мусить гаснути, щойно режим
 * закрито. Тож хук живе в окремому вузлі, який просто не змонтований, поки
 * режим згорнутий.
 */
function KeepAwakeWhileOpen() {
  useKeepAwake();
  return null;
}

/** Локальна копія фабрики події історії — та сама форма, що в сторі й екрані завдань. */
function makeHistoryEvent(type: HistoryEventType, note?: string): TaskHistoryEvent {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
    type,
    note,
  };
}

export function FullscreenTimers({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { activeTimers, stopTimer, tasksRevision, timersReady } = useTimerContext();
  const { tr, lang } = useI18n();
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { width, height, isCompact } = useResponsive();
  const { reduced } = useMotion();
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // Список id — для чистки вибору зупинених ВІЛЬНИХ таймерів. null, доки
  // реєстр не прочитаний: «немає живих» до читання стерло б чинний вибір.
  const liveIds = useMemo(
    () => (timersReady ? activeTimers.map(t => t.id) : null),
    [activeTimers, timersReady],
  );
  const { dialFor, setDialFor, defaultDial, setDefaultDial } = useTimerDials(liveIds);

  const c = useMemo(() => getScreenColors('time', isDark), [isDark]);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);

  // Завдання і проєкти потрібні лише для контексту розгорнутої клітинки та
  // кольору крапки, тож читаються при відкритті, а не тримаються постійно.
  // tasksRevision у залежностях: стор пише в 'tasks' на стопі таймера, і без
  // цього розгорнута картка показувала б стан «до».
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    Promise.all([loadData<Task[]>('tasks', []), loadData<ProjectRef[]>('projects', [])])
      .then(([storedTasks, storedProjects]) => {
        if (cancelled) return;
        setTasks(Array.isArray(storedTasks) ? storedTasks : []);
        setProjects(Array.isArray(storedProjects) ? storedProjects : []);
      })
      .catch(e => {
        if (__DEV__) console.warn('[fullscreen-timers] читання сховища не вдалося:', e);
      });
    return () => { cancelled = true; };
  }, [visible, tasksRevision]);

  // Закрили режим — забуваємо розгорнуту клітинку: наступного разу він
  // відкриється сіткою, а не випадковим завданням із минулого сеансу.
  useEffect(() => {
    if (!visible) setExpandedId(null);
  }, [visible]);

  const taskById = useCallback(
    (taskId?: string) => (taskId ? tasks.find(t => t.id === taskId) : undefined),
    [tasks],
  );

  const projectColorFor = useCallback(
    (timer: ActiveTimer): string | undefined => {
      const task = taskById(timer.taskId);
      if (!task?.projectId) return undefined;
      return projects.find(p => p.id === task.projectId)?.color;
    },
    [projects, taskById],
  );

  /**
   * Відмітка підзавдання прямо з режиму — read-modify-write 'tasks', як це
   * роблять subtasks.tsx і стор таймерів.
   *
   * Статус завдання тут навмисно НЕ закривається, хоча інші екрани ставлять
   * 'done', коли відмічене останнє підзавдання: «Готово» зупиняє таймер, тобто
   * екран, на який дивляться під час роботи, обірвав би сесію, яку показує.
   */
  const toggleSubtask = useCallback(async (taskId: string, subId: string) => {
    try {
      // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
      // ними інакше пішов би на сервер як DELETE.
      const next = await updateSynced<Task>('tasks', stored => {
        const index = stored.findIndex(t => t.id === taskId);
        if (index < 0) return stored;
        const target = stored[index];
        const sub = (target.subtasks ?? []).find(s => s.id === subId);
        const type: HistoryEventType = sub?.done ? 'subtask_undone' : 'subtask_done';
        const patched = [...stored];
        patched[index] = {
          ...target,
          subtasks: (target.subtasks ?? []).map(s => (s.id === subId ? { ...s, done: !s.done } : s)),
          history: [...(target.history ?? []), makeHistoryEvent(type, sub?.title)],
        };
        return patched;
      });
      setTasks(next);
    } catch (e) {
      if (__DEV__) console.warn('[fullscreen-timers] запис підзавдання не вдався:', e);
    }
  }, []);

  // ── Геометрія сітки ────────────────────────────────────────────────────────
  // Розкладка залежить від КІЛЬКОСТІ, а не від класу пристрою: один таймер бере
  // весь екран, два-чотири стають рівною сіткою (форму диктують пропорції самої
  // області, тож у Split View і в альбомі виходить різне), п'ять і більше —
  // сітка з прокруткою, і лише там ще діє стеля колонок за шириною вікна.
  const gridWidth = width - insets.left - insets.right - PAD * 2;
  const gridHeight = height - insets.top - insets.bottom - HEADER_H - PAD * 2;
  const layout = timerFocusLayout({
    count: activeTimers.length,
    width: gridWidth,
    height: gridHeight,
    gap: GAP,
    maxColumns: isCompact ? 1 : 2,
    rowsPerScreen: isCompact ? 4 : 2,
    minCellHeight: MIN_CELL_H,
  });
  // Розгорнутий вигляд рахується від тієї ж області. Стелі 320 тут більше
  // немає: вона була підібрана під телефон і саме через неї на планшеті
  // циферблат лишався маленьким посеред великого екрана.
  const bigDialSize = timerExpandedDialSize(gridWidth, gridHeight);

  // Плавний хід дістається лише циферблату, який на екрані ОДИН і великий.
  // Розгорнутий вигляд — завжди один; у сітці це буває тільки при єдиному
  // Вирішує РОЗМІР полотна, а не кількість таймерів: домовлено «рух там, де
  // його видно». Коли таймерів багато, розкладка сама опускає полотно нижче
  // порога, і плавність вимикається без окремого правила про кількість.
  const smoothExpanded = shouldSmoothDial({ dialSize: bigDialSize, reduced });
  const smoothGrid = shouldSmoothDial({ dialSize: layout.dialSize, reduced });

  // Таймер міг зупинитися з іншого екрана або пристрою, поки клітинка була
  // розгорнута — тоді просто повертаємось до сітки замість порожньої картки.
  const expanded = expandedId ? activeTimers.find(t => t.id === expandedId) : undefined;
  const expandedTask = taskById(expanded?.taskId);

  const dim = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';

  return (
    <>
      {visible ? <KeepAwakeWhileOpen /> : null}
      <Modal
        visible={visible}
        presentationStyle="fullScreen"
        animationType="fade"
        onRequestClose={onClose}>
        <View style={{ flex: 1 }}>
          <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

          <View
            style={{
              flex: 1,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            }}>
            {/* Шапка. Вихід — ОДИН на весь режим і лише згортає його: нічого не
                зупиняє, на відміну від «Стоп» у клітинці. Тому він у куті,
                нейтральний, і виглядає інакше за червону пігулку зупинки. */}
            <View style={[st.header, { height: HEADER_H }]}>
              {expanded ? (
                <Pressable
                  onPress={() => setExpandedId(null)}
                  accessibilityRole="button"
                  hitSlop={10}
                  style={st.back}>
                  <IconSymbol name="chevron.left" size={18} color={c.sub} />
                  <Text style={[st.backText, { color: c.sub }]}>{tr.activeTimers}</Text>
                </Pressable>
              ) : (
                <Text style={[st.title, { color: c.text }]}>
                  {tr.activeTimers}
                  {activeTimers.length > 1 ? `  ·  ${activeTimers.length}` : ''}
                </Text>
              )}

              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={tr.exitFullscreen}
                hitSlop={10}
                style={[st.exit, { backgroundColor: dim, borderColor: c.border }]}>
                <IconSymbol name="xmark" size={16} color={c.sub} />
              </Pressable>
            </View>

            {activeTimers.length === 0 ? (
              // Останній таймер зупинено, а режим лишається відкритим:
              // згортати його за користувача не можна — він вийде сам.
              <View style={st.empty}>
                <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
                  <IconSymbol name="timer" size={30} color={c.accent} />
                </View>
                <Text style={[st.emptyTitle, { color: c.text }]}>{tr.noActiveTimers}</Text>
                <Text style={[st.emptyHint, { color: c.sub }]}>{tr.noActiveTimersHint}</Text>
              </View>
            ) : expanded ? (
              <ScrollView
                contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}>
                {/* Тап по годиннику згортає назад — той самий жест, що розгорнув.
                    Список підзавдань навмисно поза цією зоною: там тапають по
                    чекбоксах, і згортання під пальцем було б несподіванкою. */}
                <Pressable onPress={() => setExpandedId(null)} style={st.bigClockBox}>
                  <View style={st.head}>
                    {projectColorFor(expanded) ? (
                      <View style={[st.dot, { backgroundColor: projectColorFor(expanded) }]} />
                    ) : null}
                    <Text numberOfLines={2} style={[st.bigLabel, { color: c.text }]}>
                      {expanded.label}
                    </Text>
                  </View>

                  {/* Той самий циферблат, що й у сітці: розгорнутий вигляд —
                      це збільшена клітинка, а не інший екран. Різкий перехід на
                      цифри читався б як помилка. */}
                  <TimerDial
                    dial={dialFor(expanded.id)}
                    startedAt={expanded.startedAt}
                    size={bigDialSize}
                    colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent }}
                    isDark={isDark}
                    smooth={smoothExpanded}
                  />
                  <Text style={[st.caption, { color: c.sub }]}>{tr.currentSession}</Text>
                </Pressable>

                {expandedTask ? (
                  <View style={{ marginTop: 8 }}>
                    {expandedTask.deadline ? (
                      <View style={[st.metaRow, { borderColor: c.border, backgroundColor: dim }]}>
                        <IconSymbol
                          name="calendar"
                          size={15}
                          color={isOverdue(expandedTask) ? STOP : c.sub}
                        />
                        <Text style={[st.metaLabel, { color: c.sub }]}>{tr.deadline}</Text>
                        <Text
                          style={[st.metaValue, {
                            color: isOverdue(expandedTask) ? STOP : c.text,
                          }]}>
                          {new Date(expandedTask.deadline).toLocaleDateString(locale, {
                            day: 'numeric',
                            month: 'long',
                          })}
                        </Text>
                      </View>
                    ) : null}

                    {(() => {
                      const project = projects.find(p => p.id === expandedTask.projectId);
                      if (!project) return null;
                      return (
                        <View style={[st.metaRow, { borderColor: c.border, backgroundColor: dim }]}>
                          <View style={[st.dot, { backgroundColor: project.color, marginRight: 0 }]} />
                          <Text style={[st.metaLabel, { color: c.sub }]}>{tr.project}</Text>
                          <Text numberOfLines={1} style={[st.metaValue, { color: c.text }]}>
                            {project.name}
                          </Text>
                        </View>
                      );
                    })()}

                    {expandedTask.subtasks?.length ? (
                      <View style={{ marginTop: 14 }}>
                        <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.subtasks}</Text>
                        {expandedTask.subtasks.map(sub => (
                          <Pressable
                            key={sub.id}
                            onPress={() => { void toggleSubtask(expandedTask.id, sub.id); }}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: sub.done }}
                            style={[st.subRow, { borderColor: c.border, backgroundColor: dim }]}>
                            <IconSymbol
                              name={sub.done ? 'checkmark.circle.fill' : 'circle'}
                              size={19}
                              color={sub.done ? c.accent : c.sub}
                            />
                            <Text
                              numberOfLines={2}
                              style={[st.subText, {
                                color: sub.done ? c.sub : c.text,
                                textDecorationLine: sub.done ? 'line-through' : 'none',
                              }]}>
                              {sub.title}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <Pressable
                  onPress={() => { void stopTimer(expanded.id); setExpandedId(null); }}
                  accessibilityRole="button"
                  style={[st.stopWide, { borderColor: STOP + '55', backgroundColor: STOP + '16' }]}>
                  <IconSymbol name="stop.fill" size={15} color={STOP} />
                  <Text style={st.stopWideText}>{tr.stopTimerAction}</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <ScrollView
                contentContainerStyle={[st.grid, { padding: PAD }]}
                // Поки сітка влазить в екран, гойдати її нема куди: пружина під
                // пальцем на нерухомій сітці читається як «щось не догорнулось».
                scrollEnabled={layout.scrolls}
                showsVerticalScrollIndicator={false}>
                {activeTimers.map((timer, index) => {
                  const w = layout.widths[index];
                  return (
                  <TimerCell
                    key={timer.id}
                    timer={timer}
                    subtasks={taskById(timer.taskId)?.subtasks}
                    projectColor={projectColorFor(timer)}
                    height={layout.cellHeight}
                    dial={dialFor(timer.id)}
                    /* Розмір один на всі клітинки: головного циферблата немає,
                       а різні розміри поруч читаються саме як «оцей головніший». */
                    dialSize={layout.dialSize}
                    smooth={smoothGrid}
                    onPress={() => setExpandedId(timer.id)}
                    onStop={() => { void stopTimer(timer.id); }}
                    onPickDial={() => setPickerFor(timer.id)}
                    dialLabel={tr.dialPicker}
                    stopLabel={tr.stopTimerAction}
                    colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent }}
                    isDark={isDark}
                    style={{ width: w }}
                  />
                  );
                })}
              </ScrollView>
            )}
          </View>

          <DialPicker
            visible={pickerFor !== null}
            dial={pickerFor ? dialFor(pickerFor) : 'digits'}
            timerLabel={activeTimers.find(t => t.id === pickerFor)?.label ?? ''}
            onSelect={id => { if (pickerFor) setDialFor(pickerFor, id); }}
            onClose={() => setPickerFor(null)}
            defaultDial={defaultDial}
            onMakeDefault={setDefaultDial}
            colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent, sheet: c.bg2 }}
            isDark={isDark}
            tr={tr}
          />
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD,
  },
  title:    { fontSize: 17, fontWeight: '800', flex: 1 },
  back:     { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backText: { fontSize: 15, fontWeight: '600', marginLeft: 2 },
  exit:     { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },

  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyIcon:  { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 16 },
  emptyHint:  { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },

  bigClockBox: { alignItems: 'center', paddingVertical: 26 },
  head:        { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  dot:         { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  bigLabel:    { fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  // tabular-nums: без нього ширина цифр гуляє і великий годинник смикається.
  caption:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 8, textTransform: 'uppercase' },

  metaRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  metaLabel:    { fontSize: 12, fontWeight: '600', marginLeft: 9, flex: 1 },
  metaValue:    { fontSize: 13, fontWeight: '700', marginLeft: 10, flexShrink: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  subRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 7 },
  subText:      { fontSize: 14, fontWeight: '600', marginLeft: 10, flex: 1 },

  stopWide:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, paddingVertical: 13, marginTop: 22 },
  stopWideText: { color: STOP, fontSize: 14, fontWeight: '700', marginLeft: 8 },
});
