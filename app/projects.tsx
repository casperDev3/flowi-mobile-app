import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
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

import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { PROJECT_COLORS } from '@/utils/projectColors';
import {
  DEFAULT_PRIORITY_LEVEL,
  normalizePriority,
  priorityFields,
  type LegacyPriority,
  type TaskPriority,
} from '@/utils/taskUtils';
import { setProjectArchived } from '@/utils/projectUtils';
import {
  assignTaskToSprint,
  clearTaskSprint,
  createSprint,
  BACKLOG_GROUP_KEY,
  isSprintClosed,
  isTaskGroupExpanded,
  moveOpenSprintTasks,
  projectTaskGroups,
  removeProjectSprints,
  renameSprint,
  setSprintClosed,
  sprintMoveTargets,
  sprintProgress,
  sprintsForProject,
  type Sprint,
} from '@/utils/sprintUtils';
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
import { mergeTaskStatusColumns, taskStatusColumn, type TaskStatusColumn } from '@/utils/taskStatuses';
import { useContentWidth } from '@/hooks/use-content-width';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { localDateKey } from '@/utils/dateUtils';
import { BUILTIN_CURRENCIES, type Currency } from '@/utils/financeUtils';
import {
  formatSubscriptionMoney,
  formatTotalsLine,
  normalizeSubscriptions,
  subscriptionStatus,
  subscriptionsForProject,
  totalsByCurrency,
  type Subscription,
} from '@/utils/subscriptions';
import {
  findTimerForMeeting,
  meetingProject,
  projectMeetingSections,
  withMeetingProject,
  type Meeting,
} from '@/utils/meetings';
import { MeetingDetailBody, MeetingDetailHeader } from '@/components/meetings/MeetingDetail';
import { MeetingFormSheet, type MeetingFormData } from '@/components/shared/MeetingFormSheet';

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
  /**
   * Спринт проєкту (utils/sprintUtils.ts). Порожній/відсутній = беклог
   * проєкту — це НЕ помилка й не привід для міграції: усі наявні завдання
   * саме такі. У «Сьогодні» спринт не впливає ні на що: там тягне виключно
   * власний deadline завдання.
   */
  sprintId?: string;
  status: string;
  /** Легасі-пріоритет ('high'|'medium'|'low') і новий рівень P0–P5 (див. CONTRACT §B). */
  priority?: LegacyPriority;
  priorityLevel?: TaskPriority;
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

/** Дата зустрічі 'YYYY-MM-DD' (локальна): «Сьогодні»/«Завтра» або коротка дата. */
function meetingDate(dateKey: string, locale: string, labels: { today: string; tomorrow: string }): string {
  const now = new Date();
  if (dateKey === localDateKey(now)) return labels.today;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (dateKey === localDateKey(tomorrow)) return labels.tomorrow;
  const d = new Date(`${dateKey}T00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(locale, sameYear
    ? { weekday: 'short', day: 'numeric', month: 'short' }
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
  const { activeTimers, tasksRevision, meetingsRevision, startMeetingTimer, stopTimer, stopTimerForTask } = useTimerContext();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  // Спринти живуть тут, а не на окремому екрані: спринт існує лише всередині
  // проєкту, і власного розділу навігації в нього немає.
  const [sprints, setSprints] = useState<Sprint[]>([]);
  // Зустрічі — для секції «Зустрічі» деталі. Пише їх цей екран лише з форми
  // зустрічі (створення з проєкту / правка з перегляду) — read-modify-write.
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showPastMeetings, setShowPastMeetings] = useState(false);
  // Підписки — лише для секції «Підписки» деталі (читання; пише екран підписок).
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subCurrencies, setSubCurrencies] = useState<Currency[]>(BUILTIN_CURRENCIES);
  /**
   * Перегляд зустрічі проєкту: ОРИГІНАЛ + дата натиснутого екземпляра.
   * Показується в ТІЙ САМІЙ панелі деталі замість проєкту (телефон — та сама
   * модалка, планшет — та сама колонка): другої модалки поверх першої iOS
   * надійно не покаже. ✕ перегляду повертає до проєкту.
   */
  const [viewedMeeting, setViewedMeeting] = useState<{ origId: string; date: string } | null>(null);
  /** Відкрита форма зустрічі: правка (initial) або створення з проєктом. */
  const [meetingForm, setMeetingForm] = useState<{ initial: MeetingFormData | null; projectId?: string } | null>(null);
  /** Телефон: що повернути після форми зустрічі (деталь закривали заради неї). */
  const reopenAfterMeetingForm = useRef<{ projectId: string; meeting: { origId: string; date: string } | null } | null>(null);
  /**
   * Хвилинна мітка: зустріч, що закінчилась при відкритій деталі, мусить
   * переїхати в «Минулі» (як веб, що перераховує щохвилини). Не щосекундний
   * годинник — тоді перемальовувався б увесь екран зі списком і графіками.
   */
  const [minuteTick, setMinuteTick] = useState(() => Math.floor(Date.now() / 60000));
  /**
   * Група (id спринта), у якій розгорнуто рядок «+ задача». Беклог додає
   * нижній рядок деталі; «+» мають лише ВІДКРИТІ спринти (CONTRACT §D.3.6).
   */
  const [addToSprintId, setAddToSprintId] = useState<string | null>(null);
  const [sprintTaskTitle, setSprintTaskTitle] = useState('');
  /**
   * Відкрита форма спринта: створення або перейменування наявного.
   *
   * Форма спринта, діалог закриття і вибір спринта для задачі малюються
   * ВСЕРЕДИНІ деталі проєкту, а не окремими Modal. На телефоні деталь сама є
   * модалкою, і iOS не показує другу модалку поверх першої надійно: після
   * вибору спринта лист лишався порожнім/завислим — і назв задач у спринті
   * просто не було видно.
   */
  const [sprintDraft, setSprintDraft] = useState<{ sprint: Sprint | null } | null>(null);
  const [sprintName, setSprintName] = useState('');
  /** Спринт, для якого відкрито питання «куди перенести незавершені». */
  const [closingSprint, setClosingSprint] = useState<Sprint | null>(null);
  /** id задачі, під рядком якої розгорнуто вибір спринта. */
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  /**
   * Згорнуті/розгорнуті групи деталі. Лише ЯВНІ перемикання людини; решту
   * вирішує isTaskGroupExpanded (відкриті розгорнуті, закриті згорнуті) —
   * так само, як у веб-SprintPanel.
   */
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
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
    const [p, t, columns, s, m, subs, curs] = await Promise.all([
      loadData<Project[]>('projects', []),
      loadData<Task[]>('tasks', []),
      // Колонки дошки потрібні графіку «Де стоять задачі». Читаємо збережені й
      // зливаємо з типовими тим самим mergeTaskStatusColumns, що й дошка: своя
      // копія правила «яка колонка існує» розійшлася б із канбаном.
      loadData<TaskStatusColumn[]>('task_statuses', []),
      loadData<Sprint[]>('sprints', []),
      loadData<Meeting[]>('meetings', []),
      loadData<unknown>('subscriptions', []),
      loadData<Currency[]>('finance_currencies', []),
    ]);
    setSubscriptions(normalizeSubscriptions(subs));
    setSubCurrencies([...BUILTIN_CURRENCIES, ...(Array.isArray(curs) ? curs : [])]);
    setProjects(p);
    setTasks(t);
    setStatusColumns(columns);
    setSprints(s);
    setMeetings(m);
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

  /** Спринти обраного проєкту: відкриті в порядку створення, закриті в кінці. */
  const projectSprints = useMemo(
    () => (selectedId ? sprintsForProject(sprints, selectedId) : []),
    [sprints, selectedId],
  );

  /**
   * Задачі, які показує деталь проєкту: власні задачі проєкту ПЛЮС ті,
   * що лежать у його спринтах, навіть якщо їхній projectId указує на інший проєкт.
   *
   * Друга половина умови — не про повноту списку, а про ДОСЯЖНІСТЬ. Пара
   * (projectId, sprintId) розходиться тільки одним шляхом: правкою зі старішого
   * клієнта, який міняв проєкт задачі, не знімаючи sprintId (тепер це робить
   * retargetTaskProject), — і такий запис приїжджає звичайним синком. Якби ми
   * фільтрували лише за projectId, така задача зникла б і зі спринта тут, і з
   * беклогу свого нового проєкту (там вона зі sprintId), — тобто не була б видна
   * жодному екрану, а зняти sprintId можна ТІЛЬКИ з рядка задачі тут. Зламаний
   * стан мусить лишатись виправним, тому задача показується в спринті. Веб
   * (components/projects/sprint-panel.tsx) розширює список рівно так само.
   *
   * Порядок: незавершені зверху, далі за дедлайном.
   */
  const selectedTasks = useMemo(() => {
    if (!selectedId) return [];
    const ownSprintIds = new Set(projectSprints.map(sprint => sprint.id));
    return tasks
      .filter(t => t.projectId === selectedId || (!!t.sprintId && ownSprintIds.has(t.sprintId)))
      .sort((a, b) => {
        const aDone = a.status === 'done';
        const bDone = b.status === 'done';
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return 0;
      });
  }, [tasks, selectedId, projectSprints]);

  /**
   * Задачі проєкту, розкладені по спринтах, і беклог ОСТАННІМ.
   *
   * Групи рахує спільний хелпер (utils/sprintUtils.ts projectTaskGroups) —
   * дзеркало веб-версії: склад спринта й беклогу мусить визначатись в одному
   * місці й однаково на всіх клієнтах. Спринт бере задачі ЗА sprintId, беклог —
   * задачі проєкту без (відомого) спринта; задача з чужим projectId потрапляє
   * саме в спринт, а не в беклог — точно як у вебі.
   */
  const taskGroups = useMemo(
    () => (selectedId ? projectTaskGroups(selectedTasks, sprints, selectedId) : []),
    [selectedTasks, sprints, selectedId],
  );

  const selectedStats = selectedId ? statsById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (!selectedId) return;
    const sync = () => setMinuteTick(Math.floor(Date.now() / 60000));
    sync();
    const id = setInterval(sync, 15000);
    return () => clearInterval(id);
  }, [selectedId]);

  /** Зустрічі проєкту: найближчі (зокрема повтори), минулі — окремо. */
  const meetingSections = useMemo(
    () => (selectedId
      ? projectMeetingSections(meetings, selectedId, new Date(minuteTick * 60000))
      : { upcoming: [], past: [] }),
    [meetings, selectedId, minuteTick],
  );

  /** Підписки проєкту: живі (без архівних) + сума за місяць по кожній валюті. */
  const projectSubscriptions = useMemo(() => {
    if (!selectedId) return { live: [] as Subscription[], monthlyLine: '', today: '' };
    const today = localDateKey(new Date(minuteTick * 60000));
    const all = subscriptionsForProject(subscriptions, selectedId);
    const live = all.filter(sub => subscriptionStatus(sub, today) !== 'archived');
    const monthlyLine = formatTotalsLine(totalsByCurrency(live, today), 'monthly', tr.subPerMonth, subCurrencies, locale);
    return { live, monthlyLine, today };
  }, [subscriptions, selectedId, minuteTick, subCurrencies, locale, tr]);

  // Інлайн-панелі деталі (вибір спринта, форма спринта, закриття) належать
  // конкретному проєкту — при перемиканні проєкту вони не мусять «переїхати».
  useEffect(() => {
    setMovingTaskId(null);
    setSprintDraft(null);
    setClosingSprint(null);
    setExpandedGroups({});
    setShowPastMeetings(false);
    setAddToSprintId(null);
    setSprintTaskTitle('');
  }, [selectedId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  /**
   * Свіжі дані — щоразу, коли вони могли змінитися повз цей екран.
   *
   * Раніше loadAll ішов ОДИН раз на монтуванні. Спринт чи проєкт, змінений на
   * екрані Завдань, стором таймерів або синком з іншого пристрою, лишався
   * невидимим, поки екран не перемонтують: деталь проєкту показувала старе
   * розкладання, і задача, щойно покладена у спринт, у ньому «не існувала».
   *   - useFocusEffect      — повернення на екран (напр. із деталі задачі);
   *   - useStorageRefresh   — записи в ключі, поки екран відкритий (синк, сусідні екрани);
   *   - tasksRevision/meetingsRevision — записи стору таймерів.
   */
  useFocusEffect(useCallback(() => {
    loadAll()
      .then(() => setInitialized(true))
      .catch(e => { if (__DEV__) console.warn('[projects] завантаження не вдалося:', e); });
  }, [loadAll]));

  const trackWrite = useStorageRefresh(['tasks', 'sprints', 'projects', 'meetings', 'task_statuses', 'subscriptions', 'finance_currencies'], loadAll);

  useEffect(() => {
    if (!initialized || (tasksRevision === 0 && meetingsRevision === 0)) return;
    loadAll().catch(e => { if (__DEV__) console.warn('[projects] перечитування після запису стору не вдалося:', e); });
  }, [tasksRevision, meetingsRevision, initialized, loadAll]);

  /**
   * Проєкти й спринти пишуться READ-MODIFY-WRITE, а не ефектом «зберегти стан».
   *
   * saveSynced ДИФАЄ масив зі сховищем: запис, якого в масиві немає, їде на
   * сервер як видалення. Ефект, що зберігав застарілий стан екрана, після
   * створення спринта деінде видаляв той спринт — і його задачі падали в беклог.
   * Тепер мутація застосовується до свіжого читання, а стан — до результату.
   */
  const mutateProjects = useCallback(async (mutate: (list: Project[]) => Project[]) => {
    try {
      await trackWrite(async () => {
        const fresh = await loadData<Project[]>('projects', []);
        const next = mutate(fresh);
        if (next === fresh) return;
        await saveSynced('projects', next);
        setProjects(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[projects] запис проєктів не вдався:', e);
    }
  }, [trackWrite]);

  // Спринти пишуться ТІЛЬКИ через saveSynced, як і решта колекцій: запис повз
  // нього не потрапив би в outbox і не доїхав би на інші пристрої.
  const mutateSprints = useCallback(async (mutate: (list: Sprint[]) => Sprint[]) => {
    try {
      await trackWrite(async () => {
        const fresh = await loadData<Sprint[]>('sprints', []);
        const next = mutate(fresh);
        if (next === fresh) return;
        await saveSynced('sprints', next);
        setSprints(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[projects] запис спринтів не вдався:', e);
    }
  }, [trackWrite]);

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

  const closeModal = useCallback(() => {
    setShowModal(false);
    // Деталь закривали лише заради форми (телефон) — повертаємо її.
    const reopenId = reopenAfterEdit.current;
    if (reopenId) {
      reopenAfterEdit.current = null;
      setTimeout(() => setSelectedId(prev => prev ?? reopenId), 300);
    }
  }, []);

  const save = () => {
    if (!name.trim()) return;
    // Порожнє поле означає «терміну немає», а не «зберегти порожній рядок»:
    // інакше projectStats побачив би рядок і спробував його розібрати.
    const parsed = deadline.trim() ? new Date(deadline.trim()) : null;
    const deadlineIso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
    const descr = description.trim() || undefined;

    if (editing) {
      const trimmed = name.trim();
      void mutateProjects(prev => prev.map(p =>
        p.id === editing.id
          ? { ...p, name: trimmed, color, deadline: deadlineIso, description: descr }
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
      void mutateProjects(prev => [...prev, created]);
      setSelectedId(created.id);
    }
    closeModal();
  };

  const toggleArchive = (project: Project) => {
    const archiving = !project.archivedAt;
    const apply = () => { void mutateProjects(prev =>
      prev.map(p => (p.id === project.id ? setProjectArchived(p, archiving) : p))); };

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
          // Явна дія користувача «Видалити» (з підтвердженням) — фільтр тут
          // легітимний; застосовується до свіжого читання, а не до стану.
          void mutateProjects(prev => prev.filter(p => p.id !== id));
          setSelectedId(prev => (prev === id ? null : prev));
          // Діалог обіцяє «без прив'язки» — і код мусить це зробити. Доти
          // projectId лишався вказувати на проєкт, якого вже немає: фільтр за
          // ним ніколи не спрацьовував, а сміття жило в даних вічно.
          //
          // Разом із проєктом зникають і його спринти: projectId у спринті
          // обов'язковий, тож без проєкту такий запис не видно з жодного
          // екрана, але він і далі їздив би в синку.
          void (async () => {
            try {
              await trackWrite(async () => {
                const [freshTasks, freshSprints] = await Promise.all([
                  loadData<Task[]>('tasks', []),
                  loadData<Sprint[]>('sprints', []),
                ]);
                const freed = removeProjectSprints(freshSprints, freshTasks, id);
                if (freed.tasks.some((task, i) => task !== freshTasks[i])) {
                  await saveSynced('tasks', freed.tasks);
                  setTasks(freed.tasks);
                }
                if (freed.sprints.length !== freshSprints.length) {
                  await saveSynced('sprints', freed.sprints);
                  setSprints(freed.sprints);
                }
              });
            } catch (e) {
              if (__DEV__) console.warn('[projects] відвʼязка задач не вдалася:', e);
            }
          })();
        },
      },
    ]);
  }, [mutateProjects, trackWrite]);

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
    setViewedMeeting(null);
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
      let becameDone = false;
      await trackWrite(async () => {
        const fresh = await loadData<Task[]>('tasks', []);
        const updated = fresh.map(t => {
          if (t.id !== id) return t;
          becameDone = t.status !== 'done';
          return { ...t, status: t.status === 'done' ? 'active' : 'done' };
        });
        await saveSynced('tasks', updated);
        setTasks(updated);
      });
      haptic.light();
      // «Готово» зупиняє таймер задачі — як на екрані Завдань і у вебі. Лише
      // ПІСЛЯ нашого запису 'tasks' (стор дописує сесію тим самим RMW); без
      // таймера — no-op. Запис стору піднімає tasksRevision → loadAll.
      if (becameDone) await stopTimerForTask(id);
    } catch (e) {
      if (__DEV__) console.warn('[projects] відмітка задачі не вдалася:', e);
    }
  }, [trackWrite, stopTimerForTask]);

  /** Нова задача одразу в цьому проєкті — заради цього поле й стоїть тут. */
  const addTask = useCallback(async (projectId: string, sprint: Sprint | null = null) => {
    const title = (sprint ? sprintTaskTitle : newTaskTitle).trim();
    if (!title) return;
    try {
      await trackWrite(async () => {
        const fresh = await loadData<Task[]>('tasks', []);
        const base: Task = {
          id: Date.now().toString(),
          title,
          projectId,
          status: 'active',
          // Без пріоритету екран Завдань падав на PRIORITY[task.priority].
          // Типовий P3 у подвійному записі контракту: 'medium' для старих клієнтів.
          ...priorityFields(DEFAULT_PRIORITY_LEVEL),
          createdAt: new Date().toISOString(),
          subtasks: [],
        };
        // Створення з групи спринта — одразу в цей спринт (projectId зі спринта).
        const task = sprint ? assignTaskToSprint(base, sprint) : base;
        const updated = [task, ...fresh];
        await saveSynced('tasks', updated);
        setTasks(updated);
      });
      if (sprint) setSprintTaskTitle(''); else setNewTaskTitle('');
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[projects] створення задачі не вдалося:', e);
    }
  }, [newTaskTitle, sprintTaskTitle, trackWrite]);

  /**
   * Повна форма задачі на екрані Завдань — з уже обраними проєктом і спринтом
   * (поле «Спринт» у TaskEditForm). Швидкий рядок лишається для самої назви.
   */
  /**
   * Перехід з деталі на інший екран. На телефоні деталь — Modal, і екран
   * проєктів лишається змонтованим під новим маршрутом: модалка лишилася б
   * поверх «Завдань», а їхній лист створення мав би відкритись поверх неї
   * (iOS так надійно не вміє). Тож спершу закриваємо деталь, а через 300 мс
   * переходимо — патерн openOverDetail з app/meetings.tsx. Колонка планшета
   * модалкою не є — там одразу.
   */
  const navigateFromDetail = useCallback((go: () => void) => {
    if (isExpanded) { go(); return; }
    setSelectedId(null);
    setViewedMeeting(null);
    setTimeout(go, 300);
  }, [isExpanded]);

  const openFullTaskForm = useCallback((projectId: string, sprintId: string | null) => {
    navigateFromDetail(() => router.push({
      pathname: '/(tabs)',
      params: { create: '1', projectId, ...(sprintId ? { sprintId } : {}) },
    }));
  }, [router, navigateFromDetail]);

  // ─── Зустрічі проєкту ──────────────────────────────────────────────────────

  const openProjectMeeting = useCallback((meeting: Meeting, date: string) => {
    setViewedMeeting({ origId: meeting.id, date });
    detailScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const closeProjectMeeting = useCallback(() => setViewedMeeting(null), []);

  /** Форма зустрічі: на телефоні спершу закриваємо деталь, потім — форма. */
  const openMeetingForm = useCallback((form: { initial: MeetingFormData | null; projectId?: string }) => {
    if (isExpanded) { setMeetingForm(form); return; }
    reopenAfterMeetingForm.current = selectedId ? { projectId: selectedId, meeting: viewedMeeting } : null;
    setSelectedId(null);
    setViewedMeeting(null);
    setTimeout(() => setMeetingForm(form), 300);
  }, [isExpanded, selectedId, viewedMeeting]);

  const closeMeetingForm = useCallback(() => {
    setMeetingForm(null);
    const reopen = reopenAfterMeetingForm.current;
    if (!reopen) return;
    reopenAfterMeetingForm.current = null;
    setTimeout(() => {
      setSelectedId(prev => prev ?? reopen.projectId);
      setViewedMeeting(reopen.meeting);
    }, 300);
  }, []);

  /**
   * Збереження форми зустрічі — READ-MODIFY-WRITE 'meetings': saveSynced
   * дифає масив, і будь-яка зустріч, якої бракує в застарілому стані, поїхала
   * б на сервер як видалена. Проєкт — рівень серії: лише на оригіналі.
   */
  const saveProjectMeeting = useCallback(async (data: MeetingFormData) => {
    closeMeetingForm();
    try {
      await trackWrite(async () => {
        const fresh = await loadData<Meeting[]>('meetings', []);
        const fields = {
          title: data.title, date: data.date, time: data.time, durationMinutes: data.durationMinutes,
          location: data.location, link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
        };
        const id = data.id;
        const next = id
          ? fresh.map(m => (m.id !== id ? m : withMeetingProject({ ...m, ...fields }, data.projectId)))
          : [...fresh, withMeetingProject<Meeting>({ id: Date.now().toString(), ...fields }, data.projectId)];
        await saveSynced('meetings', next);
        setMeetings(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[projects] запис зустрічі не вдався:', e);
    }
  }, [trackWrite, closeMeetingForm]);

  // ─── Спринти ───────────────────────────────────────────────────────────────

  const openSprintCreate = useCallback(() => {
    setSprintDraft({ sprint: null });
    setSprintName('');
  }, []);

  const openSprintRename = useCallback((sprint: Sprint) => {
    setSprintDraft({ sprint });
    setSprintName(sprint.name);
  }, []);

  const saveSprint = useCallback(() => {
    const name = sprintName.trim();
    if (!name || !sprintDraft) return;
    const target = sprintDraft.sprint;
    if (target) {
      void mutateSprints(prev => prev.map(s => (s.id === target.id ? renameSprint(s, name) : s)));
    } else if (selectedId) {
      // projectId береться з обраного проєкту: спринт без нього не існує.
      const created = createSprint(selectedId, name);
      void mutateSprints(prev => [...prev, created]);
    }
    setSprintDraft(null);
    setSprintName('');
    haptic.success();
  }, [sprintName, sprintDraft, selectedId, mutateSprints]);

  /**
   * Закриття спринта: спершу переносимо незавершені задачі, потім ставимо
   * closedAt.
   *
   * Саме в цьому порядку — якщо застосунок помре посередині, гірше, що
   * станеться, це відкритий спринт із уже перенесеною роботою. Зворотний
   * порядок лишив би закритий спринт із задачами, які нікуди не поїхали.
   *
   * Задачі йдуть звичайним saveSynced: це N окремих правок записів, а не
   * пакетна заміна колекції — кожна доїде на інший пристрій самостійно.
   */
  const closeSprint = useCallback(async (sprint: Sprint, target: Sprint | null) => {
    try {
      await trackWrite(async () => {
        const fresh = await loadData<Task[]>('tasks', []);
        const updated = moveOpenSprintTasks(fresh, sprint.id, target);
        if (updated.some((task, i) => task !== fresh[i])) {
          await saveSynced('tasks', updated);
          setTasks(updated);
        }
      });
    } catch (e) {
      if (__DEV__) console.warn('[projects] перенесення задач спринта не вдалося:', e);
      return;
    }
    await mutateSprints(prev => prev.map(s => (s.id === sprint.id ? setSprintClosed(s, true) : s)));
    setClosingSprint(null);
    haptic.success();
  }, [trackWrite, mutateSprints]);

  /** Відкрити назад — просто зняти closedAt; задачі при цьому не рухаються. */
  const reopenSprint = useCallback((sprint: Sprint) => {
    void mutateSprints(prev => prev.map(s => (s.id === sprint.id ? setSprintClosed(s, false) : s)));
    haptic.light();
  }, [mutateSprints]);

  /** Покласти задачу у спринт або повернути в беклог. */
  const setTaskSprint = useCallback(async (taskId: string, sprint: Sprint | null) => {
    try {
      await trackWrite(async () => {
        const fresh = await loadData<Task[]>('tasks', []);
        const updated = fresh.map(t =>
          t.id !== taskId ? t : (sprint ? assignTaskToSprint(t, sprint) : clearTaskSprint(t)));
        await saveSynced('tasks', updated);
        setTasks(updated);
      });
      haptic.light();
    } catch (e) {
      if (__DEV__) console.warn('[projects] зміна спринта задачі не вдалася:', e);
    }
    setMovingTaskId(null);
  }, [trackWrite]);

  /**
   * Рядок задачі в деталі проєкту. Винесений з renderDetail, бо тепер його
   * малюють кілька груп (кожен спринт і беклог), а не один список.
   */
  const renderTaskRow = useCallback((task: Task, project: Project) => {
    const done = task.status === 'done';
    const picking = movingTaskId === task.id;
    return (
      <View key={task.id}>
      <View style={[st.taskRow, { borderColor: c.border }]}>
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
          onPress={() => navigateFromDetail(() => router.push({ pathname: '/(tabs)', params: { open: task.id } }))}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <PriorityBadge level={normalizePriority(task)} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: done ? c.sub : c.text, fontSize: 14, textDecorationLine: done ? 'line-through' : 'none' }}>
              {task.title}
            </Text>
          </View>
          {task.deadline ? (
            <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{shortDate(task.deadline, locale)}</Text>
          ) : null}
        </TouchableOpacity>
        {/* Статус — як на вебі: колонка дошки з кольоровою крапкою. */}
        {(() => {
          // status тут — рядок; правилу колонки потрібна лише ознака «виконано».
          const column = taskStatusColumn(
            { status: task.status === 'done' ? 'done' : 'active', kanbanColumnId: task.kanbanColumnId },
            columns,
          );
          return (
            <View
              style={[st.statusChip, { borderColor: c.border }]}
              accessibilityLabel={`${tr.status}: ${column.name}`}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: column.color }} />
              <Text numberOfLines={1} style={{ color: c.sub, fontSize: 10, fontWeight: '600', flexShrink: 1 }}>{column.name}</Text>
            </View>
          );
        })()}
        {/* Розкладання по спринтах живе на самому рядку: перетягування в
            вертикальному списку конфліктувало б із прокруткою, а окремий
            режим «перемістити» довелося б спершу знайти. */}
        <TouchableOpacity
          onPress={() => setMovingTaskId(prev => (prev === task.id ? null : task.id))}
          accessibilityRole="button"
          accessibilityLabel={tr.sprintPick}
          accessibilityState={{ expanded: picking }}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <IconSymbol name="arrow.left.arrow.right" size={13} color={picking ? c.accent : c.sub} />
        </TouchableOpacity>
        <IconSymbol name="chevron.right" size={13} color={c.sub} />
      </View>
      {/* Вибір спринта — розгортається ПІД рядком, усередині деталі, а не
          окремою модалкою поверх модалки (див. коментар до sprintDraft). */}
      {picking ? (
        <View style={[st.inlinePanel, { borderColor: c.border, backgroundColor: c.dim }]}>
          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{tr.sprintPick}</Text>
          {/* Закриті спринти як ціль не пропонуються: покласти живу
              роботу в заморожену пачку означає сховати її від себе. */}
          {projectSprints.filter(sprint => !isSprintClosed(sprint)).map(sprint => {
            const current = task.sprintId === sprint.id;
            return (
              <TouchableOpacity
                key={sprint.id}
                onPress={() => { void setTaskSprint(task.id, sprint); }}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                style={[st.pickRow, { borderColor: current ? c.accent : c.border }]}>
                <IconSymbol name="flag" size={14} color={current ? c.accent : c.sub} />
                <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{sprint.name}</Text>
                {current ? <IconSymbol name="checkmark" size={13} color={c.accent} /> : null}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            onPress={() => { void setTaskSprint(task.id, null); }}
            accessibilityRole="button"
            accessibilityState={{ selected: !task.sprintId }}
            style={[st.pickRow, { borderColor: task.sprintId ? c.border : c.accent }]}>
            <IconSymbol name="tray" size={14} color={task.sprintId ? c.sub : c.accent} />
            <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{tr.sprintBacklog}</Text>
            {task.sprintId ? null : <IconSymbol name="checkmark" size={13} color={c.accent} />}
          </TouchableOpacity>
          {projectSprints.length === 0 ? (
            <Text style={{ color: c.sub, fontSize: 12, paddingVertical: 6 }}>{tr.sprintNoSprints}</Text>
          ) : null}
          <TouchableOpacity onPress={() => setMovingTaskId(null)} style={[st.btn, { paddingVertical: 9, backgroundColor: c.dim }]}>
            <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      </View>
    );
  }, [c, locale, toggleTask, router, tr, movingTaskId, projectSprints, setTaskSprint, columns, navigateFromDetail]);

  /** Форма назви спринта (створення / перейменування) — інлайн у деталі. */
  const renderSprintForm = useCallback(() => (
    <View style={[st.inlinePanel, { borderColor: c.border, backgroundColor: c.dim }]}>
      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 8 }}>
        {sprintDraft?.sprint ? tr.sprintRename : tr.sprintNew}
      </Text>
      <TextInput
        placeholder={tr.sprintNamePlaceholder}
        placeholderTextColor={c.sub}
        value={sprintName}
        onChangeText={setSprintName}
        onSubmitEditing={saveSprint}
        returnKeyType="done"
        autoFocus
        style={[st.input, { backgroundColor: c.dim, color: c.text }]}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <TouchableOpacity onPress={() => setSprintDraft(null)} style={[st.btn, { flex: 1, paddingVertical: 10, backgroundColor: c.dim }]}>
          <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={saveSprint}
          disabled={!sprintName.trim()}
          style={[st.btn, { flex: 2, paddingVertical: 10, backgroundColor: sprintName.trim() ? c.accent : c.dim }]}>
          <Text style={{ color: sprintName.trim() ? '#fff' : c.sub, fontWeight: '700' }}>
            {sprintDraft?.sprint ? tr.save : tr.create}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  ), [c, tr, sprintDraft, sprintName, saveSprint]);

  /**
   * Закриття спринта: куди перенести незавершені — інлайн під заголовком
   * спринта. Список, а не Alert: цілей може бути скільки завгодно, а Alert на
   * iOS більше трьох кнопок не показує.
   */
  const renderCloseSprint = useCallback((sprint: Sprint) => (
    <View style={[st.inlinePanel, { borderColor: c.border, backgroundColor: c.dim }]}>
      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginBottom: 4 }}>{tr.sprintMoveTitle}</Text>
      <Text style={{ color: c.sub, fontSize: 12, marginBottom: 10 }}>{tr.sprintMoveHint}</Text>
      {sprintMoveTargets(sprints, sprint).map(target => (
        <TouchableOpacity
          key={target.id}
          onPress={() => { void closeSprint(sprint, target); }}
          style={[st.pickRow, { borderColor: c.border }]}>
          <IconSymbol name="flag" size={14} color={c.accent} />
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{target.name}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        onPress={() => { void closeSprint(sprint, null); }}
        style={[st.pickRow, { borderColor: c.border }]}>
        <IconSymbol name="tray" size={14} color={c.sub} />
        <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{tr.sprintMoveToBacklog}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setClosingSprint(null)} style={[st.btn, { paddingVertical: 9, backgroundColor: c.dim }]}>
        <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
      </TouchableOpacity>
    </View>
  ), [c, tr, sprints, closeSprint]);

  /**
   * Редагування проєкту з його деталі. На телефоні деталь — модалка, а форма
   * проєкту — друга модалка: iOS не покаже її поверх першої, тож спершу
   * закриваємо деталь, а після форми відкриваємо її знову.
   */
  const reopenAfterEdit = useRef<string | null>(null);
  const openEditOverDetail = useCallback((project: Project) => {
    if (isExpanded) { openEdit(project); return; }
    reopenAfterEdit.current = project.id;
    setSelectedId(null);
    setTimeout(() => openEdit(project), 300);
  }, [isExpanded, openEdit]);

  const renderDetail = useCallback((stat: ProjectStats) => {
    const project = stat.project;
    return (
      <View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: project.color }} />
          <Text style={[st.detailTitle, { color: c.text, flex: 1 }]}>{project.name}</Text>
          <TouchableOpacity
            onPress={() => openEditOverDetail(project)}
            accessibilityRole="button"
            accessibilityLabel={tr.edit}
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

        {/* Спринти — тільки тут. Окремого розділу навігації в них немає:
            спринт існує лише всередині проєкту, і його ім'я поза цим екраном
            ні про що не говорить. */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[st.detailLabel, { color: c.sub, flex: 1 }]}>{tr.sprints}</Text>
          <TouchableOpacity
            onPress={() => (sprintDraft && !sprintDraft.sprint ? setSprintDraft(null) : openSprintCreate())}
            accessibilityRole="button"
            accessibilityLabel={tr.sprintNew}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginTop: 12 }}>
            <IconSymbol name="plus" size={16} color={c.accent} />
          </TouchableOpacity>
        </View>

        {sprintDraft && !sprintDraft.sprint ? renderSprintForm() : null}

        {projectSprints.length === 0 && !sprintDraft ? (
          <Text style={{ color: c.sub, fontSize: 12, opacity: 0.8, lineHeight: 17 }}>
            {tr.sprintNoSprintsHint}
          </Text>
        ) : null}

        <Text style={[st.detailLabel, { color: c.sub }]}>{tr.projectTasks}</Text>

        {selectedTasks.length === 0 && projectSprints.length === 0 ? (
          <View style={{ paddingVertical: 14 }}>
            <Text style={{ color: c.sub, fontSize: 13 }}>{tr.projectNoTasks}</Text>
            <Text style={{ color: c.sub, fontSize: 12, opacity: 0.75, marginTop: 3 }}>{tr.projectNoTasksHint}</Text>
          </View>
        ) : null}

        {/* Спочатку спринти (відкриті, далі закриті), потім беклог — порядок
            задає projectTaskGroups, той самий, що у вебі. Групи згортаються;
            закриті спринти згорнуті за замовчуванням. */}
        {taskGroups.map(group => {
          const sprint = group.sprint;
          // Проєкт без спринтів: беклог — це просто всі задачі, і заголовок
          // «Беклог» над ними нічого б не ділив.
          if (!sprint && projectSprints.length === 0) {
            return group.tasks.length > 0 ? (
              <View key={BACKLOG_GROUP_KEY} style={{ marginTop: 6 }}>
                {group.tasks.map(task => renderTaskRow(task, project))}
              </View>
            ) : null;
          }
          const key = sprint?.id ?? BACKLOG_GROUP_KEY;
          const closed = group.closed;
          const open = isTaskGroupExpanded(expandedGroups, key, closed);
          const doneCount = sprint
            ? sprintProgress(group.tasks, sprint.id).done
            : group.tasks.filter(task => task.status === 'done').length;
          const groupName = sprint ? sprint.name : tr.sprintBacklog;
          return (
            <View key={key} style={{ marginTop: 6 }}>
              <View style={st.sprintHeader}>
                <TouchableOpacity
                  onPress={() => setExpandedGroups(prev => ({ ...prev, [key]: !isTaskGroupExpanded(prev, key, closed) }))}
                  accessibilityRole="button"
                  accessibilityLabel={groupName}
                  accessibilityState={{ expanded: open }}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <IconSymbol name={open ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
                  <IconSymbol
                    name={!sprint ? 'tray' : closed ? 'checkmark.circle' : 'flag'}
                    size={13}
                    color={!sprint || closed ? c.sub : project.color}
                  />
                  <Text
                    numberOfLines={1}
                    style={{ flex: 1, color: !sprint || closed ? c.sub : c.text, fontSize: 13, fontWeight: '700' }}>
                    {groupName}
                    {closed ? <Text style={{ fontWeight: '400' }}> · {tr.sprintClosedLabel}</Text> : null}
                  </Text>
                  <Text style={{ color: c.sub, fontSize: 11, fontVariant: ['tabular-nums'] }}>
                    {doneCount}/{group.tasks.length}
                  </Text>
                </TouchableOpacity>
                {sprint ? (
                  <>
                    {!closed ? (
                      <TouchableOpacity
                        onPress={() => {
                          setAddToSprintId(prev => (prev === sprint.id ? null : sprint.id));
                          setSprintTaskTitle('');
                          setExpandedGroups(prev => ({ ...prev, [key]: true }));
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${tr.sprintAddTaskA11y}: ${sprint.name}`}
                        accessibilityState={{ expanded: addToSprintId === sprint.id }}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
                        <IconSymbol name="plus" size={14} color={addToSprintId === sprint.id ? c.accent : c.sub} />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => (sprintDraft?.sprint?.id === sprint.id ? setSprintDraft(null) : openSprintRename(sprint))}
                      accessibilityRole="button"
                      accessibilityLabel={tr.sprintRename}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
                      <IconSymbol name="pencil" size={14} color={c.sub} />
                    </TouchableOpacity>
                    {/* Закриття — завжди через діалог перенесення, навіть коли
                        незавершених немає: інакше та сама кнопка поводилась би
                        по-різному залежно від невидимого стану. */}
                    <TouchableOpacity
                      onPress={() => (closed
                        ? reopenSprint(sprint)
                        : setClosingSprint(prev => (prev?.id === sprint.id ? null : sprint)))}
                      accessibilityRole="button"
                      accessibilityLabel={closed ? tr.sprintReopen : tr.sprintClose}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
                      <IconSymbol name={closed ? 'arrow.uturn.backward' : 'flag.fill'} size={14} color={c.sub} />
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
              {sprint && sprintDraft?.sprint?.id === sprint.id ? renderSprintForm() : null}
              {sprint && closingSprint?.id === sprint.id ? renderCloseSprint(closingSprint) : null}
              {open ? (
                group.tasks.length === 0 ? (
                  addToSprintId === sprint?.id ? null : (
                    <Text style={{ color: c.sub, fontSize: 12, opacity: 0.7, paddingVertical: 8 }}>{tr.sprintEmpty}</Text>
                  )
                ) : group.tasks.map(task => renderTaskRow(task, project))
              ) : null}
              {/* Рядок «+ задача» саме в цей спринт — інлайн, без другої модалки. */}
              {sprint && !closed && addToSprintId === sprint.id ? (
                <View style={[st.addRow, { borderColor: c.accent + '60', backgroundColor: c.dim, marginTop: 8 }]}>
                  <IconSymbol name="flag" size={13} color={project.color} />
                  <TextInput
                    placeholder={tr.sprintAddTaskIn.replace('{name}', sprint.name)}
                    placeholderTextColor={c.sub}
                    value={sprintTaskTitle}
                    onChangeText={setSprintTaskTitle}
                    onSubmitEditing={() => { void addTask(project.id, sprint); }}
                    returnKeyType="done"
                    autoFocus
                    style={{ flex: 1, color: c.text, fontSize: 14, paddingVertical: 10 }}
                  />
                  <TouchableOpacity
                    onPress={() => openFullTaskForm(project.id, sprint.id)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.openFullTaskForm}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
                    <IconSymbol name="arrow.up.right" size={16} color={c.sub} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { void addTask(project.id, sprint); }}
                    disabled={!sprintTaskTitle.trim()}
                    accessibilityRole="button"
                    accessibilityLabel={tr.sprintAddTaskA11y}
                    hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
                    <IconSymbol name="plus" size={17} color={sprintTaskTitle.trim() ? project.color : c.sub} />
                  </TouchableOpacity>
                </View>
              ) : null}
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
            onPress={() => openFullTaskForm(project.id, null)}
            accessibilityRole="button"
            accessibilityLabel={tr.openFullTaskForm}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
            <IconSymbol name="arrow.up.right" size={16} color={c.sub} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { void addTask(project.id); }}
            disabled={!newTaskTitle.trim()}
            accessibilityRole="button"
            accessibilityLabel={tr.projectAddTask}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
            <IconSymbol name="plus" size={17} color={newTaskTitle.trim() ? project.color : c.sub} />
          </TouchableOpacity>
        </View>

        {/* Зустрічі проєкту: найближчі зверху (повтори — найближчим
            екземпляром), минулі — згорнуті під «Минулі (N)». Секція є завжди
            (як вкладка на вебі): інакше створити першу зустріч проєкту звідси
            не було б як. Тап по рядку — перегляд у цій же панелі. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8 }}>
          <Text style={[st.detailLabel, { color: c.sub, flex: 1, marginTop: 0, marginBottom: 0 }]}>{tr.meetings}</Text>
          <TouchableOpacity
            onPress={() => openMeetingForm({ initial: null, projectId: project.id })}
            accessibilityRole="button"
            accessibilityLabel={tr.addMeeting}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="plus" size={17} color={project.color} />
          </TouchableOpacity>
        </View>
        {meetingSections.upcoming.length === 0 && meetingSections.past.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 12, opacity: 0.8, paddingVertical: 4 }}>{tr.projectMeetingsEmpty}</Text>
        ) : (
          <>
            {meetingSections.upcoming.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 12, opacity: 0.8, paddingVertical: 4 }}>{tr.projectMeetingsNoUpcoming}</Text>
            ) : meetingSections.upcoming.map(({ meeting, date, time }) => (
              <TouchableOpacity
                key={`${meeting.id}_${date}`}
                onPress={() => openProjectMeeting(meeting, date)}
                accessibilityRole="button"
                accessibilityLabel={meeting.title}
                activeOpacity={0.75}
                style={[st.meetingRow, { borderColor: c.border }]}>
                <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: meeting.color }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{meeting.title}</Text>
                    {meeting.recurrence ? <IconSymbol name="repeat" size={11} color={c.sub} /> : null}
                  </View>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                    {meetingDate(date, locale, { today: tr.today, tomorrow: tr.tomorrow })}{time ? ` · ${time}` : ''}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>
            ))}
            {meetingSections.past.length > 0 ? (
              <>
                <TouchableOpacity
                  onPress={() => setShowPastMeetings(v => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showPastMeetings }}
                  hitSlop={{ top: 8, bottom: 8 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 }}>
                  <IconSymbol name={showPastMeetings ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>
                    {tr.projectMeetingsPast.replace('{count}', String(meetingSections.past.length))}
                  </Text>
                </TouchableOpacity>
                {showPastMeetings ? meetingSections.past.map(meeting => (
                  <TouchableOpacity
                    key={meeting.id}
                    onPress={() => openProjectMeeting(meeting, meeting.date)}
                    accessibilityRole="button"
                    accessibilityLabel={meeting.title}
                    activeOpacity={0.75}
                    style={[st.meetingRow, { borderColor: c.border, opacity: 0.6 }]}>
                    <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: meeting.color }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{meeting.title}</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {meetingDate(meeting.date, locale, { today: tr.today, tomorrow: tr.tomorrow })}{meeting.time ? ` · ${meeting.time}` : ''}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={13} color={c.sub} />
                  </TouchableOpacity>
                )) : null}
              </>
            ) : null}
          </>
        )}

        {/* Підписки проєкту: сума за місяць по кожній валюті (без конвертації),
            далі живі підписки за датою оплати. Тап / «+» — на екран підписок
            (на телефоні спершу закриваємо модалку деталі). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8 }}>
          <Text style={[st.detailLabel, { color: c.sub, flex: 1, marginTop: 0, marginBottom: 0 }]}>{tr.navSubscriptions}</Text>
          <TouchableOpacity
            onPress={() => navigateFromDetail(() => router.push({ pathname: '/subscriptions', params: { create: '1', projectId: project.id } }))}
            accessibilityRole="button"
            accessibilityLabel={tr.subNew}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="plus" size={17} color={project.color} />
          </TouchableOpacity>
        </View>
        {projectSubscriptions.live.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 12, opacity: 0.8, paddingVertical: 4 }}>{tr.subProjectEmpty}</Text>
        ) : (
          <>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 4 }}>{projectSubscriptions.monthlyLine}</Text>
            {projectSubscriptions.live.map(sub => {
              const overdue = subscriptionStatus(sub, projectSubscriptions.today) === 'overdue';
              return (
                <TouchableOpacity
                  key={sub.id}
                  onPress={() => navigateFromDetail(() => router.push({ pathname: '/subscriptions', params: { open: sub.id } }))}
                  accessibilityRole="button"
                  accessibilityLabel={sub.name}
                  activeOpacity={0.75}
                  style={[st.meetingRow, { borderColor: c.border }]}>
                  <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: sub.color || project.color }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{sub.name}</Text>
                    <Text numberOfLines={1} style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 11, marginTop: 2, fontWeight: overdue ? '700' : '400' }}>
                      {overdue ? `${tr.subOverdue} · ` : ''}{meetingDate(sub.nextPaymentDate, locale, { today: tr.today, tomorrow: tr.tomorrow })}
                    </Text>
                  </View>
                  <Text style={{ color: overdue ? '#EF4444' : c.text, fontSize: 13, fontWeight: '700' }}>
                    {formatSubscriptionMoney(sub.amount, sub.currency, subCurrencies, locale)}
                  </Text>
                  <IconSymbol name="chevron.right" size={13} color={c.sub} />
                </TouchableOpacity>
              );
            })}
          </>
        )}
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, locale, tr, selectedTasks, newTaskTitle, toggleTask, addTask, router, projectSubscriptions, subCurrencies, navigateFromDetail,
      projectSprints, taskGroups, expandedGroups, renderTaskRow, openSprintCreate, openSprintRename, reopenSprint,
      sprintDraft, closingSprint, renderSprintForm, renderCloseSprint, openEditOverDetail,
      addToSprintId, sprintTaskTitle, openFullTaskForm, meetingSections, showPastMeetings,
      openMeetingForm, openProjectMeeting]);

  // ─── Перегляд зустрічі в панелі деталі ─────────────────────────────────────
  // Оригінал — лише зі свіжого масиву: видалена деінде зустріч просто повертає
  // панель до проєкту. Для серії показуємо дату натиснутого екземпляра.
  const viewedMeetingOrig = viewedMeeting ? meetings.find(m => m.id === viewedMeeting.origId) ?? null : null;
  const viewedMeetingShown: Meeting | null = viewedMeetingOrig && viewedMeeting
    ? (!viewedMeetingOrig.recurrence || viewedMeeting.date === viewedMeetingOrig.date
        ? viewedMeetingOrig
        : { ...viewedMeetingOrig, id: `${viewedMeetingOrig.id}_${viewedMeeting.date}`, date: viewedMeeting.date, _origId: viewedMeetingOrig.id })
    : null;
  const viewedMeetingTimer = viewedMeetingOrig ? findTimerForMeeting(activeTimers, viewedMeetingOrig.id) : undefined;
  const meetingDetailColors = { text: c.text, sub: c.sub, border: c.border, dim: c.dim };

  const editViewedMeeting = useCallback(() => {
    if (!viewedMeetingOrig) return;
    const m = viewedMeetingOrig;
    openMeetingForm({
      initial: {
        id: m.id, title: m.title, date: m.date, time: m.time, durationMinutes: m.durationMinutes,
        location: m.location, link: m.link, notes: m.notes, color: m.color, recurrence: m.recurrence,
        projectId: m.projectId,
      },
    });
  }, [viewedMeetingOrig, openMeetingForm]);

  const toggleViewedMeetingTimer = useCallback(() => {
    if (!viewedMeetingOrig) return;
    // Таймер завжди адресує ОРИГІНАЛ (meeting:<origId>).
    if (viewedMeetingTimer) void stopTimer(viewedMeetingTimer.id);
    else void startMeetingTimer({ id: viewedMeetingOrig.id, title: viewedMeetingOrig.title });
  }, [viewedMeetingOrig, viewedMeetingTimer, stopTimer, startMeetingTimer]);

  const meetingViewHeader = viewedMeetingShown && viewedMeetingOrig ? (
    <MeetingDetailHeader
      meeting={viewedMeetingShown}
      original={viewedMeetingOrig}
      onEdit={editViewedMeeting}
      onClose={closeProjectMeeting}
      isExpanded={isExpanded}
      colors={meetingDetailColors}
      tr={tr}
    />
  ) : undefined;

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
          onClose={() => { setSelectedId(null); setViewedMeeting(null); }}
          isDark={isDark}
          sheetColor={c.sheet}
          borderColor={c.border}
          maxHeight={height * 0.86}
          scrollRef={detailScrollRef}
          header={meetingViewHeader}
          empty={
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>
              {tr.projectPickHint}
            </Text>
          }>
          {viewedMeetingShown && viewedMeetingOrig ? (
            <MeetingDetailBody
                meeting={viewedMeetingShown}
                original={viewedMeetingOrig}
                project={meetingProject(viewedMeetingOrig, projects)}
                timer={viewedMeetingTimer}
                onToggleTimer={toggleViewedMeetingTimer}
                onEdit={editViewedMeeting}
                colors={meetingDetailColors}
                tr={tr}
                locale={locale}
              />
          ) : selectedStats ? renderDetail(selectedStats) : null}
        </DetailPane>

        <MeetingFormSheet
          visible={!!meetingForm}
          initial={meetingForm?.initial ?? null}
          presetProjectId={meetingForm?.projectId}
          onClose={closeMeetingForm}
          onSave={data => { void saveProjectMeeting(data); }}
          isDark={isDark}
          lang={lang}
          tr={tr}
          projects={projects}
        />
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
  sprintHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  pickRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 8 },
  inlinePanel: { borderWidth: 1, borderRadius: 14, padding: 12, marginVertical: 8 },
  meetingRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  statusChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 96, borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },

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
