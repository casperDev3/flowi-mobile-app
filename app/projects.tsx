import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { updateSynced } from '@/store/synced-storage';
import { PROJECT_COLORS } from '@/utils/projectColors';
import { projectRoute } from '@/constants/projectNav';
import type { LegacyPriority, TaskPriority } from '@/utils/taskUtils';
import {
  MODULES_BY_TEMPLATE, setProjectArchived, type ProjectModules, type ProjectTemplate,
} from '@/utils/projectUtils';
import { removeProjectSprints, type Sprint } from '@/utils/sprintUtils';
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
import { useResponsive } from '@/hooks/use-responsive';
import { useTimerContext } from '@/store/timer-context';
import { mergeTaskStatusColumns, seedProjectStatusColumns, type TaskStatusColumn } from '@/utils/taskStatuses';
import { hasPendingProjectOutbox, queueProjectDeletion, syncAllMyProjects } from '@/store/project-sync';
import { uuidV4 } from '@/utils/uuid';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { haptic } from '@/utils/haptics';
import { useAuth } from '@/store/auth';
import { ApiError } from '@/store/api';
import { removeProjectMember } from '@/store/project-team';
import { useProjectRoles } from '@/hooks/use-project-roles';

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
  /**
   * Шаблон і вмикання розділів проєкту (WORKSPACE_PROJECTS_CONTRACT §3.3).
   * Адитивні — відсутність трактується як «усе увімкнено», див.
   * `utils/projectUtils.ts` projectModules().
   */
  template?: ProjectTemplate;
  modules?: ProjectModules;
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
    edit: string; delete: string; projectMembersLeave: string;
  };
  isDark: boolean;
  borderColor: string;
  textColor: string;
  subColor: string;
  /** Суцільне тло: ним шкала гасить виконану частину стовпчика. */
  surfaceColor: string;
  accentColor: string;
  /**
   * Contract §4.1: редагування/архівацію/видалення `projects`-запису
   * дозволено лише власнику — member і viewer тут не мають прав, на відміну
   * від задач/нарад/нотаток проєкту (там member редагує нарівні з owner).
   * Review finding (major): без цього прапорця кнопки з олівцем і кошиком
   * малювались УСІМ ролям, і рушій `deleteProject`/`toggleArchive` спокійно
   * виконувався локально ще ДО того, як сервер устигав відповісти
   * `403 forbidden` — projectId встигав злетіти із задач проєкту, і вони
   * розповзались по особистих просторах учасників.
   */
  canManage: boolean;
  onPress: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onLeave: (project: Project) => void;
}

/**
 * Картка мемоізована: без цього кожен рендер екрана (наприклад, набір
 * тексту в модалці) перемальовує BlurView для всіх проєктів.
 */
const ProjectCard = React.memo(function ProjectCard({
  project, stats, buckets, selected, locale, tr, isDark,
  borderColor, textColor, subColor, surfaceColor, accentColor, canManage, onPress, onEdit, onDelete, onLeave,
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
          {canManage ? (
            <>
              <TouchableOpacity
                onPress={() => onEdit(project)}
                accessibilityRole="button"
                accessibilityLabel={tr.edit}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 4 }}>
                <IconSymbol name="pencil" size={16} color={subColor} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDelete(project.id)}
                accessibilityRole="button"
                accessibilityLabel={tr.delete}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 4 }}>
                <IconSymbol name="trash" size={16} color={subColor} />
              </TouchableOpacity>
            </>
          ) : (
            // Contract §4.1: member/viewer не редагує й не видаляє сам
            // проєкт-запис — лише виходить, як і на екрані «Учасники»
            // (той самий підпис tr.projectMembersLeave, той самий текстовий
            // стиль замість іконки).
            <TouchableOpacity
              onPress={() => onLeave(project)}
              accessibilityRole="button"
              accessibilityLabel={tr.projectMembersLeave}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ padding: 4 }}>
              <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>{tr.projectMembersLeave}</Text>
            </TouchableOpacity>
          )}
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
  const { isExpanded } = useResponsive();
  const sheetSurface = useSheetSurface();
  // Активні таймери потрібні, щоб «Відпрацьовано» включало сесію, яка триває
  // просто зараз, а не лише закриті.
  const { activeTimers, tasksRevision } = useTimerContext();
  const { user } = useAuth();
  // Contract §4.1: роль по кожному проєкту — та сама мапа, що вже читають
  // `app/(tabs)/index.tsx` і `app/subscriptions.tsx` для owner-only дій.
  // Невідома роль (соло-проєкт, ще не синканий) трактується як 'owner' —
  // так само, як у `useProjectRole`/`canEditProjectItem`.
  const projectRoles = useProjectRoles();
  const isProjectOwner = useCallback(
    (id: string) => (projectRoles[id] ?? 'owner') === 'owner',
    [projectRoles],
  );

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [statusColumns, setStatusColumns] = useState<TaskStatusColumn[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  /** Шаблон при СТВОРЕННІ (contract §3.3) — вибір, застиглий у modules/task_statuses з першого запису. */
  const [template, setTemplate] = useState<ProjectTemplate>('work');
  const [showArchived, setShowArchived] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');

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
   *   - tasksRevision       — записи стору таймерів (завершена сесія → «Відпрацьовано»).
   */
  useFocusEffect(useCallback(() => {
    loadAll()
      .then(() => setInitialized(true))
      .catch(e => { if (__DEV__) console.warn('[projects] завантаження не вдалося:', e); });
  }, [loadAll]));

  const trackWrite = useStorageRefresh(['tasks', 'projects', 'task_statuses'], loadAll);

  useEffect(() => {
    if (!initialized || tasksRevision === 0) return;
    loadAll().catch(e => { if (__DEV__) console.warn('[projects] перечитування після запису стору не вдалося:', e); });
  }, [tasksRevision, initialized, loadAll]);

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
        // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
        // ними інакше пішов би на сервер як DELETE. Той самий масив — без запису.
        let changed = false;
        const next = await updateSynced<Project>('projects', fresh => {
          const mutated = mutate(fresh);
          changed = mutated !== fresh;
          return mutated;
        });
        if (changed) setProjects(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[projects] запис проєктів не вдався:', e);
    }
  }, [trackWrite]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setName('');
    setColor(PROJECT_COLORS[0]);
    setTemplate('work');
    setDeadline('');
    setDescription('');
    setShowModal(true);
  }, []);

  const openEdit = useCallback((p: Project) => {
    // Захист поза UI (contract §4.1: `projects` — owner-only): картка вже не
    // малює кнопку редагування member/viewer, але функція лишається
    // публічною сигнатурою пропа, і другий виклик (наприклад, майбутній
    // контекстний жест) не мусить довіряти лише відсутності кнопки.
    if (!isProjectOwner(p.id)) return;
    setEditing(p);
    setName(p.name);
    setColor(p.color);
    setDeadline(p.deadline ? p.deadline.slice(0, 10) : '');
    setDescription(p.description ?? '');
    setShowModal(true);
  }, [isProjectOwner]);

  const closeModal = useCallback(() => setShowModal(false), []);

  /**
   * Копії глобальних статусів для НОВОГО проєкту (contract §3.3) — окремий
   * read-modify-write на `task_statuses`, паралельний до `mutateProjects`:
   * різні колекції, кожна під власним блокуванням ключа.
   */
  const seedNewProjectStatuses = useCallback(async (projectId: string) => {
    try {
      await trackWrite(async () => {
        const personal = mergeTaskStatusColumns(await loadData<TaskStatusColumn[]>('task_statuses', []));
        const seeded = seedProjectStatusColumns(personal, projectId);
        const next = await updateSynced<TaskStatusColumn>('task_statuses', fresh => [...fresh, ...seeded]);
        setStatusColumns(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[projects] копіювання статусів не вдалося:', e);
    }
  }, [trackWrite]);

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
      closeModal();
    } else {
      // Контракт §0.5: нові проєкти — `p-<uuid4>`, а не легасі-формат
      // Date.now().toString() (той приймається лише для ІСНУЮЧИХ проєктів,
      // ще з часів до workspace-фази).
      const id = `p-${uuidV4()}`;
      const created: Project = {
        id,
        name: name.trim(),
        color,
        createdAt: new Date().toISOString(),
        deadline: deadlineIso,
        description: descr,
        template,
        modules: MODULES_BY_TEMPLATE[template],
      };
      // ПОСЛІДОВНО, не паралельно (`void` кожного окремо) — review finding:
      // `getMyProjectIds()` (маршрутизація outbox, `store/project-sync.ts`)
      // читає збережений масив `projects`. Якщо запис статусів устигав би
      // резолвити свій потік РАНІШЕ, ніж `mutateProjects` дописав туди
      // новий id, копії статусів назавжди йшли б у 'personal' — резолвер
      // потоку не перевикликається заднім числом для вже поставлених рядків
      // outbox (крім явного `revalidateOutboxStreams()`).
      void (async () => {
        await mutateProjects(prev => [...prev, created]);
        await seedNewProjectStatuses(id);
        // Опортуністичний поштовх фонового синку проєктів
        // (store/project-sync.ts): без нього `POST /projects/` (контракт
        // §3.2) чекав би до найближчого 5-хвилинного циклу чи повернення з
        // фону, і задачі, додані в проєкт одразу після створення, простоювали
        // б в outbox непроштовхнутими. Помилка (офлайн, мережа) — не тут:
        // цикл сам повторить спробу.
        void syncAllMyProjects();
      })();
      closeModal();
      // Створення = одразу вхід у простір проєкту (план §3: вхід із «Проєкти»).
      router.push(projectRoute(id, 'overview') as never);
    }
  };

  const toggleArchive = (project: Project) => {
    // Той самий owner-only захист, що й у openEdit: архівація — це запис у
    // `projects` (модифікація archivedAt), а не окрема REST-дія, тож саме
    // сюди дотягується наслідок, якщо колись цю функцію покличуть в обхід
    // модалки редагування.
    if (!isProjectOwner(project.id)) return;
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
    // Contract §4.1 (major з ревʼю): видалення `projects`-запису — дія лише
    // власника. Картка вже не малює кошик member/viewer, це — другий шар:
    // без нього гонитва (роль у кеші ще не оновилась) чи виклик в обхід
    // кнопки міг би відв'язати чужі задачі від проєкту ще ДО відповіді
    // сервера `403 forbidden` на сам DELETE.
    if (!isProjectOwner(id)) return;
    Alert.alert(tr.deleteProject, tr.projectTasksRemain, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          // Явна дія користувача «Видалити» (з підтвердженням) — фільтр тут
          // легітимний; застосовується до свіжого читання, а не до стану.
          void mutateProjects(prev => prev.filter(p => p.id !== id));
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
                // Дві колекції — два read-modify-write по черзі, кожен під
                // блокуванням свого ключа (updateSynced): pull між читанням і
                // записом інакше пішов би на сервер як DELETE. Половини
                // removeProjectSprints одна від одної не залежать.
                let tasksChanged = false;
                const nextTasks = await updateSynced<Task>('tasks', freshTasks => {
                  const freed = removeProjectSprints([] as Sprint[], freshTasks, id).tasks;
                  tasksChanged = freed.some((task, i) => task !== freshTasks[i]);
                  return tasksChanged ? freed : freshTasks;
                });
                if (tasksChanged) setTasks(nextTasks);
                await updateSynced<Sprint>('sprints', freshSprints =>
                  removeProjectSprints(freshSprints, [] as Task[], id).sprints);
              });
            } catch (e) {
              if (__DEV__) console.warn('[projects] відвʼязка задач не вдалася:', e);
            } finally {
              // Контракт §3.2: видалення проєкту — REST DELETE /projects/{id}/
              // (лише власник), не мутація потоку синку. review finding
              // (minor): ставилось ОДРАЗУ, паралельно (void) з unlink-ом вище
              // — DELETE + wipeLocalProject (усередині flushPendingProjectDeletes)
              // могли встигнути прибрати задачі проєкту РАНІШЕ, ніж unlink
              // встиг зняти з них projectId, і вони видалялись би разом із
              // проєктом замість того, щоб лишитись без прив'язки. Тепер
              // ставимо в чергу лише ПІСЛЯ того, як unlink (успішний чи ні)
              // завершився.
              void queueProjectDeletion(id);
            }
          })();
        },
      },
    ]);
  }, [mutateProjects, trackWrite, isProjectOwner, tr]);

  /**
   * Вихід member/viewer із проєкту (contract §4.1: «Вийти з проєкту» — ✓ для
   * обох ролей, ✗ для owner). Той самий шлях, що й «Учасники → Вийти»
   * (`app/project/[id]/members.tsx` handleLeave/doLeave): попередження про
   * непроштовхнутий outbox цього проєкту ПЕРЕД звичайним підтвердженням,
   * бо wipeLocalProject (усередині наступного syncAllMyProjects) прибирає
   * локальні дані проєкту незалежно від того, устигли вони на сервер чи ні.
   */
  const leaveProject = useCallback((project: Project) => {
    const myId = user?.id != null ? Number(user.id) : NaN;
    if (Number.isNaN(myId)) return;
    const doLeave = () => {
      void (async () => {
        try {
          await removeProjectMember(project.id, myId);
          haptic.success();
          // §9.4: доступу більше немає — прибрати локальні дані проєкту
          // (wipeLocalProject усередині) одразу, а не чекати фонового циклу.
          // Список оновиться сам через підписку useStorageRefresh на запис
          // у ключ 'projects', яку робить wipeLocalProject.
          await syncAllMyProjects();
        } catch (e) {
          haptic.error();
          Alert.alert(tr.error, e instanceof ApiError ? e.message : tr.projectMembersError);
        }
      })();
    };
    void (async () => {
      const pending = await hasPendingProjectOutbox(project.id);
      if (pending) {
        Alert.alert(tr.projectMembersLeave, tr.projectMembersLeaveUnsyncedWarning, [
          { text: tr.cancel, style: 'cancel' },
          { text: tr.projectMembersLeave, style: 'destructive', onPress: doLeave },
        ]);
        return;
      }
      Alert.alert(tr.projectMembersLeave, tr.projectMembersLeaveConfirm, [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.projectMembersLeave, style: 'destructive', onPress: doLeave },
      ]);
    })();
  }, [user, tr]);

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

  /** Тап по картці — повна зміна контексту (план §3): вхід у простір проєкту. */
  const selectProject = useCallback((project: Project) => {
    haptic.light();
    router.push(projectRoute(project.id, 'overview') as never);
  }, [router]);

  // Шапка їде разом зі списком, як і раніше, — тому вона ListHeaderComponent,
  // а не окремий фіксований блок над FlatList.
  const listHeader = (
    <>
      {/* Header */}
      <View style={{ marginTop: 14, marginBottom: 28, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tr.back}
          style={[st.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
          <IconSymbol name="chevron.left" size={17} color={c.sub} />
        </TouchableOpacity>
        <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>{tr.projects}</Text>
        <TouchableOpacity
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityLabel={tr.newProject}
          style={[st.headerBtn, { backgroundColor: c.accent, borderColor: c.accent }]}>
          <IconSymbol name="plus" size={17} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Живі / Архів. З'являється лише коли архів не порожній —
          інакше це кнопка, яка нікуди не веде. */}
      {archivedProjects.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 7, marginBottom: 18 }}>
          {([
            { key: false, label: tr.filterActive, count: liveProjects.length },
            { key: true, label: tr.archive, count: archivedProjects.length },
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
              selected={false}
              locale={locale}
              tr={tr}
              isDark={isDark}
              borderColor={c.border}
              textColor={c.text}
              subColor={c.sub}
              surfaceColor={c.sheet}
              accentColor={c.accent}
              canManage={isProjectOwner(item.project.id)}
              onPress={selectProject}
              onEdit={openEdit}
              onDelete={deleteProject}
              onLeave={leaveProject}
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
      </SafeAreaView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={st.overlay} onPress={closeModal}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <BlurView
                intensity={isDark ? 50 : 70}
                tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={closeModal}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[st.sheetTitle, { color: c.text }]}>
                  {editing ? tr.editProject : tr.newProject}
                </Text>

                <TextInput
                  placeholder={tr.projectNamePlaceholder}
                  accessibilityLabel={tr.projectNamePlaceholder}
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

                {/* Шаблон — лише при СТВОРЕННІ (план §3): «Робочий» вмикає
                    всі розділи простору проєкту, «Простий» — лише Огляд і
                    Завдання. Після створення шаблон фіксується — далі розділи
                    вмикаються/вимикаються в Налаштуваннях проєкту поштучно. */}
                {!editing && (
                  <>
                    <Text style={[st.label, { color: c.sub }]}>{tr.projectTemplateLabel}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['work', 'simple'] as ProjectTemplate[]).map(t => (
                        <TouchableOpacity
                          key={t}
                          onPress={() => setTemplate(t)}
                          style={[st.btn, {
                            flex: 1,
                            backgroundColor: template === t ? c.accent : c.dim,
                            borderWidth: 1,
                            borderColor: template === t ? c.accent : c.border,
                          }]}>
                          <Text style={{ color: template === t ? '#fff' : c.sub, fontWeight: '700' }}>
                            {t === 'work' ? tr.projectTemplateWork : tr.projectTemplateSimple}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {editing && (
                  <TouchableOpacity
                    onPress={() => { const target = editing; closeModal(); toggleArchive(target); }}
                    accessibilityRole="button"
                    style={[st.btn, { marginTop: 18, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>
                      {editing.archivedAt ? tr.unarchiveProject : tr.archiveAccount}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 4 }}>
                  <TouchableOpacity onPress={closeModal} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={save} style={[st.btn, { flex: 2, backgroundColor: c.accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {editing ? tr.save : tr.create}
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

// Примітка: стилі старої інлайн-панелі деталей проєкту (завдання/спринти/
// наради/статуси списком просто на цьому екрані) прибрано — вхід у проєкт
// тепер завжди веде в окремий простір `app/project/[id]/*` (§3 плану).
const st = StyleSheet.create({
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
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(): відсоток від батька з
  // height:auto у Yoga не рахується, аркуш ріс на всю висоту вмісту, а
  // ScrollView усередині нічого не гортав (NAT-01).
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  colorChip:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
