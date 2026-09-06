import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { PROJECT_COLORS } from '@/utils/projectColors';
import { setProjectArchived } from '@/utils/projectUtils';
import {
  compareArchived,
  compareLive,
  projectStats,
  projectTimeline,
  type ProjectStats,
  type TimelineBucket,
} from '@/utils/projectStats';
import { ProjectAnalytics } from '@/components/projects/ProjectAnalytics';
import { ProjectTimeline } from '@/components/projects/ProjectTimeline';
import { DetailPane } from '@/components/shared/DetailPane';
import { useResponsive } from '@/hooks/use-responsive';
import { useTimerContext } from '@/store/timer-context';
import { formatDuration } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { mergeTaskStatusColumns, type TaskStatusColumn } from '@/utils/taskStatuses';
import { useContentWidth } from '@/hooks/use-content-width';

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /**
   * Момент архівації. Стан ЯВНИЙ, а не похідний із задач: інакше проєкт із
   * незавершеними задачами неможливо заморозити, а порожній проєкт (0 із 0)
   * довелося б рахувати виконаним на 100%.
   *
   * Поле живе у вільному JSON запису синку, тож ані сервер, ані контракт
   * синхронізації міняти не треба. Веб уже його виставляє.
   */
  archivedAt?: string;
  /**
   * Власний термін проєкту. Це НЕ найближчий дедлайн його задач: здати сайт
   * треба першого жовтня, навіть якщо жодна задача дати не має. Поле вільне,
   * як archivedAt, — ні сервер, ні контракт синку чіпати не треба.
   */
  deadline?: string;
  description?: string;
}

interface Task {
  id: string;
  title: string;
  projectId?: string;
  status: string;
  /** Колонка дошки. Графік «Де стоять задачі» питає її через taskColumnId. */
  kanbanColumnId?: string;
  deadline?: string;
  createdAt?: string;
  /**
   * Справжня дата початку роботи. Заповнена рідко — і саме тому Гантт малює
   * смуги з нею й без неї по-різному: без startDate початок беруть із
   * createdAt, і смуга показує вік запису, а не тривалість роботи.
   */
  startDate?: string;
  subtasks?: unknown[];
  timeEntries?: { startedAt: string; endedAt?: string; duration: number }[];
  /**
   * Журнал подій. Для графіка «Виконано по тижнях» це ЄДИНЕ джерело дати
   * завершення: updatedAt зсувається від будь-якої правки й поставив би
   * задачу в тиждень останнього перейменування.
   */
  history?: { at: string; type: string }[];
}

/** Скільки задач у проєкті — всього, активних, виконаних. */
/** Коротка дата без року, коли рік поточний — рік у списку лише шумить. */
function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(locale, sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Стала «немає шкали»: новий [] на кожному рендері ламав би React.memo. */
const EMPTY_BUCKETS: TimelineBucket[] = [];

interface ProjectCardProps {
  project: Project;
  stats: ProjectStats;
  /** Шкала рахується списком, а не карткою: див. timelines у екрані. */
  buckets: TimelineBucket[];
  selected: boolean;
  locale: string;
  tr: {
    projectOverdueTasks: string; projectDone: string; projectNoTasks: string;
    projectDeadline: string; projectNearest: string; active: string;
  };
  isDark: boolean;
  borderColor: string;
  textColor: string;
  subColor: string;
  /** Суцільне тло: ним шкала гасить виконану частину стовпчика. */
  surfaceColor: string;
  accentColor: string;
  onPress: (project: Project) => void;
  onDelete: (id: string) => void;
}

/**
 * Картка мемоізована: без цього кожен рендер екрана (наприклад, набір
 * тексту в модалці) перемальовує BlurView для всіх проєктів.
 */
const ProjectCard = React.memo(function ProjectCard({
  project, stats, buckets, selected, locale, tr, isDark,
  borderColor, textColor, subColor, surfaceColor, accentColor, onPress, onDelete,
}: ProjectCardProps) {
  const pct = stats.pct;
  const overdueColor = '#EF4444';
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(project)}
      accessibilityRole="button"
      accessibilityLabel={project.name}
      accessibilityState={{ selected }}>
      <BlurView
        intensity={isDark ? 20 : 40}
        tint={isDark ? 'dark' : 'light'}
        // На широкому екрані деталь стоїть поруч, і без цієї рамки не видно,
        // яку саме картку вона показує.
        style={[st.card, { borderColor: selected ? accentColor : borderColor }]}>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[st.colorBadge, { backgroundColor: project.color + '25', borderColor: project.color + '60' }]}>
            <View style={[st.colorDot, { backgroundColor: project.color }]} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text numberOfLines={1} style={{ color: textColor, fontSize: 15, fontWeight: '700' }}>{project.name}</Text>
            {/* Прострочене — попереду й червоним, як у вебі: це єдине число,
                заради якого картку взагалі відкривають. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
              {stats.empty ? (
                <Text style={{ color: subColor, fontSize: 12 }}>{tr.projectNoTasks}</Text>
              ) : (
                <>
                  {stats.overdue > 0 && (
                    <Text style={{ color: overdueColor, fontSize: 12, fontWeight: '700' }}>
                      {stats.overdue} {tr.projectOverdueTasks}
                      <Text style={{ color: subColor, fontWeight: '400' }}>{' · '}</Text>
                    </Text>
                  )}
                  <Text style={{ color: subColor, fontSize: 12 }}>
                    {stats.active} {tr.active} · {stats.done}/{stats.total} {tr.projectDone}
                  </Text>
                </>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={() => onDelete(project.id)}
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 4 }}>
            <IconSymbol name="trash" size={16} color={subColor} />
          </TouchableOpacity>
        </View>

        {/* Дві дати одним рядком і піктограмами замість підписів: підпис
            «Термін проєкту» з'їдає пів картки на телефоні. Прапорець — власний
            термін проєкту, календар — найближча задача. */}
        {(project.deadline || stats.upcomingDeadline) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 10 }}>
            {project.deadline ? (
              <View
                style={st.metaChip}
                accessibilityLabel={`${tr.projectDeadline}: ${shortDate(project.deadline, locale)}`}>
                <IconSymbol name="flag" size={11} color={stats.projectOverdue ? overdueColor : subColor} />
                {/* Червоним лише коли ВЛАСНИЙ термін минув при незакритій
                    роботі. Прострочена задача червонить свій лічильник, а не
                    термін проєкту — інакше два різні факти зливаються в один. */}
                <Text style={{ color: stats.projectOverdue ? overdueColor : subColor, fontSize: 11, fontWeight: '700' }}>
                  {shortDate(project.deadline, locale)}
                </Text>
              </View>
            ) : null}
            {stats.upcomingDeadline ? (
              <View
                style={st.metaChip}
                accessibilityLabel={`${tr.projectNearest}: ${shortDate(stats.upcomingDeadline, locale)}`}>
                <IconSymbol name="calendar" size={11} color={subColor} />
                <Text style={{ color: subColor, fontSize: 11, fontWeight: '600' }}>
                  {shortDate(stats.upcomingDeadline, locale)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {stats.total > 0 && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <View style={[st.progressBg, { flex: 1 }]}>
                <View style={[st.progressFill, { width: `${pct}%`, backgroundColor: project.color }]} />
              </View>
              <Text style={{ color: subColor, fontSize: 10, fontWeight: '700' }}>{pct}%</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <ProjectTimeline
                buckets={buckets}
                color={project.color}
                label={project.name}
                surface={surfaceColor}
                border={borderColor}
                sub={subColor}
              />
            </View>
          </>
        )}
      </BlurView>
    </TouchableOpacity>
  );
});

export default function ProjectsScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { isExpanded, height } = useResponsive();
  // Активні таймери потрібні, щоб «Відпрацьовано» включало сесію, яка триває
  // просто зараз, а не лише закриті.
  const { activeTimers } = useTimerContext();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusColumns, setStatusColumns] = useState<TaskStatusColumn[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const detailScrollRef = useRef<ScrollView | null>(null);

  const loadAll = useCallback(async () => {
    const [p, t, columns] = await Promise.all([
      loadData<Project[]>('projects', []),
      loadData<Task[]>('tasks', []),
      // Колонки дошки потрібні графіку «Де стоять задачі». Читаємо збережені й
      // зливаємо з типовими тим самим mergeTaskStatusColumns, що й дошка: своя
      // копія правила «яка колонка існує» розійшлася б із канбаном.
      loadData<TaskStatusColumn[]>('task_statuses', []),
    ]);
    setProjects(p);
    setTasks(t);
    setStatusColumns(columns);
  }, []);

  // Архівні ховаються зі списку, але лишаються в даних: стан явний
  // (archivedAt), тож проєкт із незавершеними задачами теж можна заморозити.
  //
  // Статистика рахується ОДИН раз на проєкт і одразу сортується: раніше екран
  // робив O(проєкти × задачі) фільтрувань на кожному рендері.
  const statsList = useMemo(
    () => projects.map(project => projectStats(project, tasks, new Date(), activeTimers)),
    [projects, tasks, activeTimers],
  );
  const statsById = useMemo(
    () => new Map(statsList.map(stat => [stat.project.id, stat])),
    [statsList],
  );

  const visibleStats = useMemo(() => {
    const live = statsList.filter(stat => !stat.archived);
    const archived = statsList.filter(stat => stat.archived);
    return showArchived
      ? [...archived].sort(compareArchived)
      : [...live].sort(compareLive);
  }, [statsList, showArchived]);

  // Шкали рахуються один раз на всі картки, а не всередині кожної: інакше
  // кожен ререндер екрана (набір тексту в модалці) перебирав би всі задачі
  // стільки разів, скільки проєктів на екрані.
  const timelines = useMemo(
    () => new Map(visibleStats.map(stat => [stat.project.id, projectTimeline(stat.project, tasks)])),
    [visibleStats, tasks],
  );

  const columns = useMemo(() => mergeTaskStatusColumns(statusColumns), [statusColumns]);

  // Аналітика дивиться на ТОЙ САМИЙ зріз, що й список карток: перемикач
  // «Живі / Архів» має міняти і графіки теж, інакше цифри під списком
  // описують не те, що над ними.
  const analyticsProjects = useMemo(
    () => visibleStats.map(stat => stat.project),
    [visibleStats],
  );

  const liveProjects = useMemo(() => projects.filter(p => !p.archivedAt), [projects]);
  const archivedProjects = useMemo(() => projects.filter(p => !!p.archivedAt), [projects]);

  /** Задачі обраного проєкту: незавершені зверху, далі за дедлайном. */
  const selectedTasks = useMemo(() => {
    if (!selectedId) return [];
    return tasks
      .filter(t => t.projectId === selectedId)
      .sort((a, b) => {
        const aDone = a.status === 'done';
        const bDone = b.status === 'done';
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return 0;
      });
  }, [tasks, selectedId]);

  const selectedStats = selectedId ? statsById.get(selectedId) ?? null : null;

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  useEffect(() => {
    loadAll().then(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (initialized) void saveSynced('projects', projects);
  }, [projects, initialized]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setName('');
    setColor(PROJECT_COLORS[0]);
    setDeadline('');
    setDescription('');
    setShowModal(true);
  }, []);

  const openEdit = useCallback((p: Project) => {
    setEditing(p);
    setName(p.name);
    setColor(p.color);
    setDeadline(p.deadline ? p.deadline.slice(0, 10) : '');
    setDescription(p.description ?? '');
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => setShowModal(false), []);

  const save = () => {
    if (!name.trim()) return;
    // Порожнє поле означає «терміну немає», а не «зберегти порожній рядок»:
    // інакше projectStats побачив би рядок і спробував його розібрати.
    const parsed = deadline.trim() ? new Date(deadline.trim()) : null;
    const deadlineIso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
    const descr = description.trim() || undefined;

    if (editing) {
      setProjects(prev => prev.map(p =>
        p.id === editing.id
          ? { ...p, name: name.trim(), color, deadline: deadlineIso, description: descr }
          : p));
    } else {
      const created: Project = {
        id: Date.now().toString(),
        name: name.trim(),
        color,
        createdAt: new Date().toISOString(),
        deadline: deadlineIso,
        description: descr,
      };
      setProjects(prev => [...prev, created]);
      setSelectedId(created.id);
    }
    closeModal();
  };

  const toggleArchive = (project: Project) => {
    const archiving = !project.archivedAt;
    const apply = () => setProjects(prev =>
      prev.map(p => (p.id === project.id ? setProjectArchived(p, archiving) : p)));

    const activeLeft = tasks.filter(t => t.projectId === project.id && t.status !== 'done').length;
    if (archiving && activeLeft > 0) {
      Alert.alert(
        'Архівувати проект?',
        `У «${project.name}» ще ${activeLeft} незавершених — вони залишаться активними в задачах, просто проект зникне зі списку.`,
        [{ text: 'Скасувати', style: 'cancel' }, { text: 'Архівувати', onPress: apply }],
      );
      return;
    }
    apply();
  };

  const deleteProject = useCallback((id: string) => {
    Alert.alert('Видалити проект?', "Завдання проекту залишаться, але без прив'язки.", [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити',
        style: 'destructive',
        onPress: () => {
          setProjects(prev => prev.filter(p => p.id !== id));
          setSelectedId(prev => (prev === id ? null : prev));
          // Діалог обіцяє «без прив'язки» — і код мусить це зробити. Доти
          // projectId лишався вказувати на проєкт, якого вже немає: фільтр за
          // ним ніколи не спрацьовував, а сміття жило в даних вічно.
          void (async () => {
            try {
              const fresh = await loadData<Task[]>('tasks', []);
              if (!fresh.some(t => t.projectId === id)) return;
              const updated = fresh.map(t => (t.projectId === id ? { ...t, projectId: undefined } : t));
              await saveSynced('tasks', updated);
              setTasks(updated);
            } catch (e) {
              if (__DEV__) console.warn('[projects] відвʼязка задач не вдалася:', e);
            }
          })();
        },
      },
    ]);
  }, []);

  // Палітра стабільна між рендерами — інакше React.memo на картці не спрацює.
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  }), [isDark]);

  // Окремий обʼєкт, а не сам `c`: аналітика бере з палітри рівно п'ять полів, і
  // передавати їй увесь набір означало б перемальовувати графіки щоразу, коли
  // в екрана зміниться будь-який інший колір.
  const analyticsPalette = useMemo(
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent }),
    [c],
  );

  const selectProject = useCallback((project: Project) => {
    haptic.light();
    setSelectedId(prev => (prev === project.id ? null : project.id));
  }, []);

  /**
   * Відмітка задачі просто з деталі проєкту.
   *
   * Read-modify-write 'tasks' — наявна конвенція репозиторію (так само роблять
   * today.tsx, archive.tsx і стор таймерів): екран не володіє задачами й не
   * може писати свій застарілий список цілком.
   */
  const toggleTask = useCallback(async (id: string) => {
    try {
      const fresh = await loadData<Task[]>('tasks', []);
      const updated = fresh.map(t =>
        t.id === id ? { ...t, status: t.status === 'done' ? 'active' : 'done' } : t);
      await saveSynced('tasks', updated);
      setTasks(updated);
      haptic.light();
    } catch (e) {
      if (__DEV__) console.warn('[projects] відмітка задачі не вдалася:', e);
    }
  }, []);

  /** Нова задача одразу в цьому проєкті — заради цього поле й стоїть тут. */
  const addTask = useCallback(async (projectId: string) => {
    const title = newTaskTitle.trim();
    if (!title) return;
    try {
      const fresh = await loadData<Task[]>('tasks', []);
      const task: Task = {
        id: Date.now().toString(),
        title,
        projectId,
        status: 'active',
        createdAt: new Date().toISOString(),
        subtasks: [],
      };
      const updated = [task, ...fresh];
      await saveSynced('tasks', updated);
      setTasks(updated);
      setNewTaskTitle('');
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[projects] створення задачі не вдалося:', e);
    }
  }, [newTaskTitle]);

  const renderDetail = useCallback((stat: ProjectStats) => {
    const project = stat.project;
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: project.color }} />
          <Text style={[st.detailTitle, { color: c.text, flex: 1 }]}>{project.name}</Text>
          <TouchableOpacity
            onPress={() => openEdit(project)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="pencil" size={17} color={c.sub} />
          </TouchableOpacity>
        </View>

        {project.description ? (
          <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
            {project.description}
          </Text>
        ) : null}

        {/* Цифри — рядком, а не картками: у колонці 380pt картки стають
            вужчими за власні підписи. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <View style={[st.stat, { backgroundColor: c.dim, borderColor: c.border }]}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{stat.pct}%</Text>
            <Text style={{ color: c.sub, fontSize: 10 }}>{stat.done}/{stat.total}</Text>
          </View>
          {stat.overdue > 0 && (
            <View style={[st.stat, { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
              <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '800' }}>{stat.overdue}</Text>
              <Text style={{ color: '#EF4444', fontSize: 10 }}>{tr.projectOverdueTasks}</Text>
            </View>
          )}
          {stat.trackedSeconds > 0 && (
            <View style={[st.stat, { backgroundColor: c.dim, borderColor: c.border }]}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
                {formatDuration(stat.trackedSeconds, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute })}
              </Text>
              <Text style={{ color: c.sub, fontSize: 10 }}>{tr.projectTracked}</Text>
            </View>
          )}
        </View>

        {project.deadline ? (
          <Text style={{ color: stat.projectOverdue ? '#EF4444' : c.sub, fontSize: 12, fontWeight: '600', marginTop: 12 }}>
            {tr.projectDeadline}: {shortDate(project.deadline, locale)}
          </Text>
        ) : null}
        {stat.upcomingDeadline ? (
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>
            {tr.projectNearest}: {shortDate(stat.upcomingDeadline, locale)}
          </Text>
        ) : null}

        <Text style={[st.detailLabel, { color: c.sub }]}>{tr.projectTasks}</Text>

        {selectedTasks.length === 0 ? (
          <View style={{ paddingVertical: 14 }}>
            <Text style={{ color: c.sub, fontSize: 13 }}>{tr.projectNoTasks}</Text>
            <Text style={{ color: c.sub, fontSize: 12, opacity: 0.75, marginTop: 3 }}>{tr.projectNoTasksHint}</Text>
          </View>
        ) : selectedTasks.map(task => {
          const done = task.status === 'done';
          return (
            <View key={task.id} style={[st.taskRow, { borderColor: c.border }]}>
              <TouchableOpacity
                onPress={() => { void toggleTask(task.id); }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
                accessibilityLabel={task.title}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[st.check, { borderColor: done ? project.color : c.sub }]}>
                {done && <IconSymbol name="checkmark" size={11} color={project.color} />}
              </TouchableOpacity>
              {/* Тап по назві веде на екран Завдань: підзавдання, таймер і
                  нагадування живуть там, і другої копії тієї деталі тут не буде. */}
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/(tabs)', params: { open: task.id } })}>
                <Text
                  numberOfLines={1}
                  style={{ color: done ? c.sub : c.text, fontSize: 14, textDecorationLine: done ? 'line-through' : 'none' }}>
                  {task.title}
                </Text>
                {task.deadline ? (
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{shortDate(task.deadline, locale)}</Text>
                ) : null}
              </TouchableOpacity>
              <IconSymbol name="chevron.right" size={13} color={c.sub} />
            </View>
          );
        })}

        <View style={[st.addRow, { borderColor: c.border, backgroundColor: c.dim }]}>
          <TextInput
            placeholder={tr.projectAddTask}
            placeholderTextColor={c.sub}
            value={newTaskTitle}
            onChangeText={setNewTaskTitle}
            onSubmitEditing={() => { void addTask(project.id); }}
            returnKeyType="done"
            style={{ flex: 1, color: c.text, fontSize: 14, paddingVertical: 10 }}
          />
          <TouchableOpacity
            onPress={() => { void addTask(project.id); }}
            disabled={!newTaskTitle.trim()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="plus" size={17} color={newTaskTitle.trim() ? project.color : c.sub} />
          </TouchableOpacity>
        </View>
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, locale, tr, selectedTasks, newTaskTitle, toggleTask, addTask, router]);

  // Шапка їде разом зі списком, як і раніше, — тому вона ListHeaderComponent,
  // а не окремий фіксований блок над FlatList.
  const listHeader = (
    <>
      {/* Header */}
      <View style={{ marginTop: 14, marginBottom: 28, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[st.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
          <IconSymbol name="chevron.left" size={17} color={c.sub} />
        </TouchableOpacity>
        <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Проекти</Text>
        <TouchableOpacity
          onPress={openAdd}
          style={[st.headerBtn, { backgroundColor: c.accent, borderColor: c.accent }]}>
          <IconSymbol name="plus" size={17} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Живі / Архів. З'являється лише коли архів не порожній —
          інакше це кнопка, яка нікуди не веде. */}
      {archivedProjects.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 7, marginBottom: 18 }}>
          {([
            { key: false, label: 'Живі', count: liveProjects.length },
            { key: true, label: 'Архів', count: archivedProjects.length },
          ] as const).map(opt => (
            <TouchableOpacity
              key={String(opt.key)}
              onPress={() => setShowArchived(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: showArchived === opt.key }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
                backgroundColor: showArchived === opt.key ? c.accent + '18' : c.dim,
                borderColor: showArchived === opt.key ? c.accent : c.border,
              }}>
              <Text style={{ color: showArchived === opt.key ? c.accent : c.sub, fontWeight: '700', fontSize: 13 }}>
                {opt.label}
              </Text>
              <Text style={{ color: c.sub, fontSize: 12 }}>{opt.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* На широкому екрані список і деталь стоять поруч — той самий
            DetailPane, що в Завданнях і Фінансах. На вузькому деталь
            лишається модальним листом поверх списку. */}
        <View style={{ flex: 1, flexDirection: isExpanded ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
        <FlatList
          data={visibleStats}
          keyExtractor={stat => stat.project.id}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          ListHeaderComponent={listHeader}
          // Аналітика — підвал списку, а не окремий екран: цифри під картками
          // відповідають на питання, яке виникає саме після погляду на них
          // («а куди все це рухається»), і зайвий перехід розірвав би цю
          // послідовність. На порожньому списку компонент повертає null сам.
          ListFooterComponent={
            <ProjectAnalytics
              projects={analyticsProjects}
              tasks={tasks}
              columns={columns}
              scopeLabel={showArchived ? tr.archive : tr.projects}
              wide={isExpanded}
              palette={analyticsPalette}
            />
          }
          renderItem={({ item }) => (
            <ProjectCard
              project={item.project}
              stats={item}
              buckets={timelines.get(item.project.id) ?? EMPTY_BUCKETS}
              selected={item.project.id === selectedId}
              locale={locale}
              tr={tr}
              isDark={isDark}
              borderColor={c.border}
              textColor={c.text}
              subColor={c.sub}
              surfaceColor={c.sheet}
              accentColor={c.accent}
              onPress={selectProject}
              onDelete={deleteProject}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
                <IconSymbol name="folder" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700' }}>{tr.noProjects}</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                {tr.pressToAdd}
              </Text>
              <TouchableOpacity
                onPress={openAdd}
                accessibilityRole="button"
                accessibilityLabel={tr.newProject}
                style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <IconSymbol name="plus" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{tr.newProject}</Text>
              </TouchableOpacity>
            </View>
          }
        />
        </View>

        <DetailPane
          open={!!selectedStats}
          wide={isExpanded}
          onClose={() => setSelectedId(null)}
          isDark={isDark}
          sheetColor={c.sheet}
          borderColor={c.border}
          maxHeight={height * 0.86}
          scrollRef={detailScrollRef}
          empty={
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>
              {tr.projectPickHint}
            </Text>
          }>
          {selectedStats ? renderDetail(selectedStats) : null}
        </DetailPane>
        </View>
      </SafeAreaView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={closeModal}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView
                intensity={isDark ? 50 : 70}
                tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[st.sheetTitle, { color: c.text }]}>
                  {editing ? 'Редагувати проект' : 'Новий проект'}
                </Text>

                <TextInput
                  placeholder="Назва проекту"
                  placeholderTextColor={c.sub}
                  value={name}
                  onChangeText={setName}
                  style={[st.input, { backgroundColor: c.dim, color: c.text }]}
                  autoFocus
                />

                <Text style={[st.label, { color: c.sub }]}>{tr.projectDeadline}</Text>
                {/* Дата вводиться текстом у форматі РРРР-ММ-ДД: власного
                    date-picker у проєкті немає, а тягнути його сюди заради
                    одного поля — окрема залежність. Порожньо = терміну немає. */}
                <TextInput
                  placeholder="2026-10-01"
                  placeholderTextColor={c.sub}
                  value={deadline}
                  onChangeText={setDeadline}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  style={[st.input, { backgroundColor: c.dim, color: c.text }]}
                />

                <Text style={[st.label, { color: c.sub }]}>{tr.projectDescription}</Text>
                <TextInput
                  placeholder=""
                  placeholderTextColor={c.sub}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  style={[st.input, { backgroundColor: c.dim, color: c.text, minHeight: 76, textAlignVertical: 'top' }]}
                />

                <Text style={[st.label, { color: c.sub }]}>Колір проекту</Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map(col => (
                    <TouchableOpacity
                      key={col}
                      onPress={() => setColor(col)}
                      style={[
                        st.colorChip,
                        { backgroundColor: col },
                        color === col && { borderWidth: 3, borderColor: '#fff' },
                      ]}>
                      {color === col && <IconSymbol name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>

                {editing && (
                  <TouchableOpacity
                    onPress={() => { const target = editing; closeModal(); toggleArchive(target); }}
                    accessibilityRole="button"
                    style={[st.btn, { marginTop: 18, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>
                      {editing.archivedAt ? 'Повернути з архіву' : 'Архівувати'}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 4 }}>
                  <TouchableOpacity onPress={closeModal} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={save} style={[st.btn, { flex: 2, backgroundColor: c.accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {editing ? 'Зберегти' : 'Створити'}
                    </Text>
                  </TouchableOpacity>
                </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  detailTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  detailLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  stat:        { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', minWidth: 74 },
  taskRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  // 20pt — не тач-таргет, а візуальний розмір: сам таргет розширений hitSlop.
  check:       { width: 20, height: 20, borderRadius: 10, borderWidth: 1.6, alignItems: 'center', justifyContent: 'center' },
  addRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, marginTop: 14 },
  metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 4 },

  pageTitle:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:   { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card:        { borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  colorBadge:  { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colorDot:    { width: 20, height: 20, borderRadius: 6 },
  progressBg:  { height: 3, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 2 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: '90%' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  colorChip:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
