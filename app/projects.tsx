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

import { HEADER_BUTTON_HIT_SLOP, useHeaderLead } from '@/components/shared/ScreenHeader';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { isoToLocalDateInput, localDateInputToIso } from '@/utils/dateUtils';
import { PROJECT_COLORS } from '@/utils/projectColors';
import { projectRoute } from '@/constants/projectNav';
import type { LegacyPriority, TaskPriority } from '@/utils/taskUtils';
import {
  MODULES_BY_TEMPLATE, projectModules, setProjectArchived, type ProjectModules, type ProjectTemplate,
} from '@/utils/projectUtils';
import { openSprintsForProject, removeProjectSprints, type Sprint } from '@/utils/sprintUtils';
import {
  currentSprintCard,
  portfolioKpi,
  projectCountersMap,
  type ProjectCounters,
  type SprintCard,
} from '@/utils/projectStatsMetrics';
import type { Translations } from '@/store/translations';
import {
  filterProjects,
  PROJECT_LIST_STATUSES,
  PROJECT_SORT_KEYS,
  projectStats,
  projectStatusCounts,
  projectTimeline,
  sortProjects,
  DEFAULT_PROJECT_LIST_PREFS,
  type ProjectListPrefs,
  type ProjectListStatus,
  type ProjectSortKey,
  type ProjectStats,
  type TimelineBucket,
} from '@/utils/projectStats';
import { loadProjectListPrefs, saveProjectListPrefs } from '@/utils/projectListPrefs';
import { wideModalStyles } from '@/components/finance/wideModal';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { Layout } from '@/constants/tokens';
import { masonryColumnCount } from '@/utils/masonry';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { ProjectAnalytics } from '@/components/projects/ProjectAnalytics';
import { PortfolioKpi } from '@/components/projects/PortfolioKpi';
import { ProjectTimeline } from '@/components/projects/ProjectTimeline';
import { useTimerContext } from '@/store/timer-context';
import { mergeTaskStatusColumns, seedProjectStatusColumns, type TaskStatusColumn } from '@/utils/taskStatuses';
import { hasPendingProjectOutbox, queueProjectDeletion, syncAllMyProjects } from '@/store/project-sync';
import { uuidV4 } from '@/utils/uuid';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { haptic } from '@/utils/haptics';
import { useAuth } from '@/store/auth';
import { ApiError } from '@/store/api';
import { removeProjectMember } from '@/store/project-team';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { fontFamily, radius, shadow, theme, type } from '@/constants/theme';
import { dsTokens, useDS } from '@/hooks/use-ds';
import {
  BentoCard, FilterBar, FilterSelect, KpiCounter, MeshBackground, PageHeader, SectionTabs, Segmented, SegmentedProgress,
  useFiltersV25,
} from '@/components/ds';
import { glassOf, glassRim, glassRimFor } from '@/components/shared/dsTheme';
import { AccentIcon } from '@/components/shared/GlassBits';
import {
  DEFAULT_ZONE_SIZE_KEY, ZONE_HANDLE_WIDTH, ZoneLayout, useZoneSizes, zoneWidths,
} from '@/components/layout-zones';
import { useZoneState } from '@/hooks/use-zone-state';
import {
  OpenProjectButton, ProjectZoneDetails, ProjectZoneFooter, ProjectZoneStatic,
} from '@/components/projects/ProjectZones';
import {
  isProjectAtRisk, keyProjectTasks, roleSummary, upcomingDeadlines,
} from '@/components/projects/projectsZoneModel';
import { useProjectZoneStrings } from '@/components/projects/projectZoneStrings';

export interface Project {
  appearance?: import("@/utils/projectAppearance").ProjectAppearance;
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
  /** Штамп сховища — остання активність для сортування «Оновлено». */
  updatedAt?: string;
  /**
   * Справжня дата початку роботи. Заповнена рідко — Таймлайн проєкту
   * (app/project/[id]/tasks.tsx) без неї бере початок із createdAt.
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
  /** Виконавець: null/undefined/'' — «без виконавця» (лічильник картки). */
  assigneeId?: string | null;
}

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
/** Та сама причина: картка без лічильників отримує одну сталу, а не новий {}. */
const EMPTY_COUNTERS: ProjectCounters = {
  total: 0, done: 0, inProgress: 0, todo: 0, open: 0, assigned: 0, unassigned: 0, backlog: 0, overdue: 0,
};

const SORT_LABEL_KEY: Record<ProjectSortKey, keyof Translations> = {
  smart: 'projectSortSmart',
  status: 'projectSortStatus',
  progress: 'projectSortProgress',
  updated: 'projectSortUpdated',
  name: 'projectSortName',
};

const STATUS_LABEL_KEY: Record<ProjectListStatus, keyof Translations> = {
  overdue: 'projectListStatusOverdue',
  active: 'projectListStatusActive',
  empty: 'projectListStatusEmpty',
  done: 'projectListStatusDone',
};

/** Чип сортування/фільтра — той самий вигляд, що й перемикач «Активні / Архів». */
function ListChip({ label, count, selected, onPress, accent, sub, dim, border }: {
  label: string; count?: number; selected: boolean; onPress: () => void;
  accent: string; sub: string; dim: string; border: string;
}) {
  const { t } = useDS();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count === undefined ? label : `${label}: ${count}`}
      accessibilityState={{ selected }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36,
        // DS v2: pill-чип; вибраний — action.primary + text.onAction.
        paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill,
        backgroundColor: selected ? t.action.primary : t.surface.card,
      }}>
      <Text style={{ color: selected ? t.text.onAction : t.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>{label}</Text>
      {count === undefined ? null : (
        <Text style={{ color: selected ? t.text.onAction : sub, opacity: selected ? 0.75 : 1, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] }}>{count}</Text>
      )}
    </TouchableOpacity>
  );
}

/** Протермінований спринт — бурштиновий: червоний зайнятий простроченими задачами (§4). */
const SPRINT_OVERDUE_COLOR = theme.light.accent.amber;
const OVERDUE_COLOR = theme.light.accent.coral;

type CardTr = Pick<Translations,
  | 'projectOverdueTasks' | 'projectDone' | 'projectNoTasks' | 'projectDeadline' | 'projectNearest'
  | 'projectTasks' | 'edit' | 'delete' | 'projectMembersLeave'
  | 'projectInProgress' | 'projectUnassigned' | 'projectBacklog' | 'projectFunnelA11y' | 'projectFlagA11y'
  | 'sprintCurrent' | 'sprintDaysLeft' | 'sprintLastDay' | 'sprintOverdueDays' | 'sprintUndated'
  | 'sprintProgressA11y' | 'sprintClose' | 'projectSortProgress'>;

interface CounterItem { key: string; text: string; a11y: string; color?: string; bold?: boolean }

/**
 * Рядок лічильників через « · ». Кожне число — окремий Text зі своїм
 * accessibilityLabel, який договорює БАЗУ повністю («5 із 47 відкритих задач:
 * без виконавця»): воронка й ознаки рахуються від різних множин (§8.2).
 */
function CounterRow({ items, subColor, fontSize, marginTop }: {
  items: CounterItem[]; subColor: string; fontSize: number; marginTop: number;
}) {
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop }}>
      {items.map((item, index) => (
        <Text key={item.key} style={{ color: subColor, fontSize }}>
          {index > 0 ? ' · ' : ''}
          <Text
            accessibilityLabel={item.a11y}
            style={{ color: item.color ?? subColor, fontFamily: item.bold ? fontFamily.semibold : fontFamily.regular, fontVariant: ['tabular-nums'] }}>
            {item.text}
          </Text>
        </Text>
      ))}
    </View>
  );
}

interface ProjectCardProps {
  project: Project;
  stats: ProjectStats;
  /** Лічильники воронки й ознак — рахуються списком, одним проходом (§9.2). */
  counters: ProjectCounters;
  /** Поточний спринт; null — немає відкритих або модуль «Спринти» вимкнено. */
  sprintCard: SprintCard | null;
  /** Беклог «без спринту» має сенс лише з увімкненими спринтами. */
  sprintsEnabled: boolean;
  /** Роль може закривати спринти (не глядач). */
  canEditContent: boolean;
  onOpenSprints: (project: Project) => void;
  /** Шкала рахується списком, а не карткою: див. timelines у екрані. */
  buckets: TimelineBucket[];
  selected: boolean;
  locale: string;
  tr: CardTr;
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
  /**
   * Планшет (три зони): тап по картці лише ВИБИРАЄ проєкт, а вхід у простір —
   * окремою кнопкою «Відкрити проєкт» на картці. Без пропа (телефон) кнопки
   * немає, і тап, як і раніше, одразу відкриває проєкт.
   */
  onOpen?: (project: Project) => void;
  /** Підказка VoiceOver для тапу по картці (планшет: «показує зведення»). */
  pressHint?: string;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onLeave: (project: Project) => void;
}

/**
 * Картка мемоізована: без цього кожен рендер екрана (наприклад, набір
 * тексту в модалці) перемальовує всі картки проєктів.
 */
export const ProjectCard = React.memo(function ProjectCard({
  project, stats, counters, sprintCard, sprintsEnabled, canEditContent, onOpenSprints,
  buckets, selected, locale, tr, isDark,
  borderColor, textColor, subColor, surfaceColor, accentColor, canManage, onPress, onEdit, onDelete, onLeave,
  onOpen, pressHint,
}: ProjectCardProps) {
  const pct = stats.pct;
  const overdueColor = OVERDUE_COLOR;
  const t = dsTokens(isDark);
  const fill = (template: string, values: Record<string, string | number>) =>
    Object.entries(values).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(String(value)), template);

  // Ряд 4 — воронка (частки total). «Виконано» є завжди, решта — лише не нуль.
  const funnel: CounterItem[] = [
    {
      key: 'done', text: `${counters.done}/${counters.total} ${tr.projectDone}`,
      a11y: fill(tr.projectFunnelA11y, { n: counters.done, total: counters.total, label: tr.projectDone }),
    },
  ];
  if (counters.inProgress > 0) {
    funnel.push({
      key: 'inProgress', text: `${counters.inProgress} ${tr.projectInProgress}`,
      a11y: fill(tr.projectFunnelA11y, { n: counters.inProgress, total: counters.total, label: tr.projectInProgress }),
    });
  }
  // Ряд 5 — ознаки ВІДКРИТИХ задач; нулі не показуються.
  const flag = (key: string, n: number, label: string, color?: string): CounterItem => ({
    key, text: `${n} ${label}`, color, bold: !!color,
    a11y: fill(tr.projectFlagA11y, { n, open: counters.open, label }),
  });
  const flags: CounterItem[] = [];
  if (counters.overdue > 0) flags.push(flag('overdue', counters.overdue, tr.projectOverdueTasks, overdueColor));
  if (counters.unassigned > 0) flags.push(flag('unassigned', counters.unassigned, tr.projectUnassigned));
  if (sprintsEnabled && counters.backlog > 0) flags.push(flag('backlog', counters.backlog, tr.projectBacklog));
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(project)}
      accessibilityRole="button"
      accessibilityLabel={project.name}
      accessibilityHint={pressHint}
      accessibilityState={{ selected }}>
      {/* DS v2: картка surface.card без рамки. На широкому екрані деталь
          стоїть поруч, і вибрану картку видно з рамки action.primary. */}
      {/* DS v2.1: скло з обідком; вибрана — рамка action.primary. */}
      {/* Omni (DS v2.2): суцільна картка вмісту (як картка канбану Omni) —
          surface.card + м'яка тінь, без скла й обідка. */}
      <View style={[st.card, { backgroundColor: t.surface.card, borderColor: selected ? t.action.primary : 'transparent' }, shadow[isDark ? 'dark' : 'light'].card]}>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[st.colorBadge, { backgroundColor: project.color + '25' }]}>
            <View style={[st.colorDot, { backgroundColor: project.color }]} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text numberOfLines={1} style={{ color: textColor, fontSize: 16, fontFamily: fontFamily.semibold }}>{project.name}</Text>
            {/* Порожній проєкт — одним рядком замість усієї статистики (§8.2). */}
            <Text style={{ color: subColor, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              {stats.empty ? tr.projectNoTasks : `${tr.projectTasks}: ${stats.total}`}
            </Text>
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
              <Text style={{ color: t.status.danger, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.projectMembersLeave}</Text>
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
                style={[st.metaChip, { backgroundColor: t.surface.subtle }]}
                accessibilityLabel={`${tr.projectDeadline}: ${shortDate(project.deadline, locale)}`}>
                <IconSymbol name="flag" size={12} color={stats.projectOverdue ? overdueColor : subColor} />
                {/* Червоним лише коли ВЛАСНИЙ термін минув при незакритій
                    роботі. Прострочена задача червонить свій лічильник, а не
                    термін проєкту — інакше два різні факти зливаються в один. */}
                <Text style={{ color: stats.projectOverdue ? t.status.danger : subColor, fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>
                  {shortDate(project.deadline, locale)}
                </Text>
              </View>
            ) : null}
            {stats.upcomingDeadline ? (
              <View
                style={[st.metaChip, { backgroundColor: t.surface.subtle }]}
                accessibilityLabel={`${tr.projectNearest}: ${shortDate(stats.upcomingDeadline, locale)}`}>
                <IconSymbol name="calendar" size={12} color={subColor} />
                <Text style={{ color: subColor, fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>
                  {shortDate(stats.upcomingDeadline, locale)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {stats.total > 0 && (
          <>
            {/* Omni: сегментний прогрес (≈15 сегментів у фірмовому градієнті)
                з відсотком праворуч. */}
            <SegmentedProgress
              value={pct / 100}
              label={tr.projectSortProgress}
              showValue
              accessibilityLabel={`${project.name}: ${pct}%`}
              style={{ marginTop: 16 }}
            />

            {/* Ряд 4 (воронка) і ряд 5 (ознаки відкритих) — різні бази, тож
                різна вага шрифту й відступ між ними. */}
            <CounterRow items={funnel} subColor={subColor} fontSize={12} marginTop={6} />
            <CounterRow items={flags} subColor={subColor} fontSize={11} marginTop={8} />

            {sprintCard ? (
              <View style={{ marginTop: 12 }}>
                <Text numberOfLines={1} style={{ color: subColor, fontSize: 12, fontFamily: fontFamily.regular }}>
                  {tr.sprintCurrent}{' · '}
                  <Text style={{ color: textColor, fontFamily: fontFamily.semibold }}>{sprintCard.name}</Text>
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  {/* Друга шкала на картці — зі своїм підписом, інакше дві
                      шкали неможливо розрізнити на слух. */}
                  <SegmentedProgress
                    value={sprintCard.pct / 100}
                    segments={10}
                    height={8}
                    accessibilityLabel={fill(tr.sprintProgressA11y, { name: sprintCard.name, done: sprintCard.done, total: sprintCard.total })}
                    style={{ flex: 1 }}
                  />
                  <Text style={{ color: sprintCard.overdue ? textColor : subColor, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: sprintCard.overdue ? fontFamily.semibold : fontFamily.regular }}>
                    {sprintCard.done}/{sprintCard.total}{' · '}
                    {sprintCard.overdue
                      ? fill(tr.sprintOverdueDays, { n: sprintCard.overdueDays })
                      : !sprintCard.dated
                        ? tr.sprintUndated
                        : sprintCard.daysLeft === 0
                          ? tr.sprintLastDay
                          : fill(tr.sprintDaysLeft, { n: sprintCard.daysLeft ?? 0 })}
                  </Text>
                  {sprintCard.overdue && canEditContent ? (
                    // Система нагадує, а натискає людина: кнопка веде в розділ
                    // «Спринти», де живе звичайний діалог закриття з вибором
                    // цілі переносу. Автозакриття немає (§4).
                    <TouchableOpacity
                      onPress={() => onOpenSprints(project)}
                      accessibilityRole="button"
                      accessibilityLabel={`${tr.sprintClose}: ${sprintCard.name}`}
                      hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                      style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: SPRINT_OVERDUE_COLOR }}>
                      <Text style={{ color: t.text.onAccent, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.sprintClose}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

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

        {onOpen ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
            <OpenProjectButton name={project.name} onPress={() => onOpen(project)} testID={`project-open-${project.id}`} />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

export default function ProjectsScreen() {
  // Планшет: стелю читабельної колонки (720pt) тут знято — картки лягають у
  // колонки на всю ширину екрана (вікно мінус сайдбар), як дашборд «Сьогодні».
  const { isWide, width: windowWidth } = useResponsive();
  const filtersV25 = useFiltersV25();
  const screenWidth = useScreenWidth();
  // Планшет, три зони: колонки masonry рахуються від РЕАЛЬНОЇ ширини головної
  // зони (поруч можуть стояти «Портфель» і панель деталей, межі тягнуться).
  // До першого виміру — ширина екрана, як і раніше.
  const [mainZoneWidth, setMainZoneWidth] = useState(0);
  // Стеля «широкого» вмісту (Layout.wideMaxWidth): на iPad Pro у ландшафті
  // картки інакше розтягувались до ~450pt кожна.
  const columnCount = masonryColumnCount(Math.min(isWide && mainZoneWidth > 0 ? mainZoneWidth : screenWidth, Layout.wideMaxWidth));
  // Форма проєкту на планшеті — центрований діалог, як SheetModal 'auto'.
  const wm = wideModalStyles(isWide);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
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
  // Спринти потрібні лише для показу (лічильник «без спринту», поточний
  // спринт картки); пише їх розділ «Спринти» проєкту.
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  /** Шаблон при СТВОРЕННІ (contract §3.3) — вибір, застиглий у modules/task_statuses з першого запису. */
  const [template, setTemplate] = useState<ProjectTemplate>('simple');
  const [showArchived, setShowArchived] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');

  const loadAll = useCallback(async () => {
    const [p, t, columns, sp] = await Promise.all([
      loadData<Project[]>('projects', []),
      loadData<Task[]>('tasks', []),
      // Колонки дошки потрібні графіку «Де стоять задачі». Читаємо збережені й
      // зливаємо з типовими тим самим mergeTaskStatusColumns, що й дошка: своя
      // копія правила «яка колонка існує» розійшлася б із канбаном.
      loadData<TaskStatusColumn[]>('task_statuses', []),
      loadData<Sprint[]>('sprints', []),
    ]);
    setProjects(p);
    setTasks(t);
    setStatusColumns(columns);
    setSprints(sp);
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

  // Сортування й фільтр статусу — вибір ЦЬОГО пристрою (utils/projectListPrefs).
  // До прочитання — типовий вибір; записуємо лише дію людини, тож невдале
  // читання не затирає збережене.
  const [listPrefs, setListPrefs] = useState<ProjectListPrefs>(DEFAULT_PROJECT_LIST_PREFS);
  useEffect(() => {
    let alive = true;
    void loadProjectListPrefs().then(prefs => { if (alive) setListPrefs(prefs); });
    return () => { alive = false; };
  }, []);
  const updateListPrefs = useCallback((next: ProjectListPrefs) => {
    setListPrefs(next);
    void saveProjectListPrefs(next);
  }, []);
  const toggleStatus = useCallback((status: ProjectListStatus) => {
    const on = listPrefs.statuses.includes(status);
    const picked = on ? listPrefs.statuses.filter(s => s !== status) : [...listPrefs.statuses, status];
    updateListPrefs({ ...listPrefs, statuses: PROJECT_LIST_STATUSES.filter(s => picked.includes(s)) });
  }, [listPrefs, updateListPrefs]);

  // Зріз перемикача «Активні / Архів» — до фільтра статусу: від нього рахуються
  // лічильники на чипах.
  const scopedStats = useMemo(
    () => statsList.filter(stat => stat.archived === showArchived),
    [statsList, showArchived],
  );
  const statusCounts = useMemo(() => projectStatusCounts(scopedStats), [scopedStats]);

  // Видимий набір: фільтр статусу, далі вибране сортування (спільні з вебом
  // sortProjects/filterProjects). Картки, KPI й аналітика — саме з нього.
  const visibleStats = useMemo(
    () => sortProjects(filterProjects(scopedStats, listPrefs.statuses), listPrefs.sort),
    [scopedStats, listPrefs],
  );

  // Шкали рахуються один раз на всі картки, а не всередині кожної: інакше
  // кожен ререндер екрана (набір тексту в модалці) перебирав би всі задачі
  // стільки разів, скільки проєктів на екрані.
  const timelines = useMemo(
    () => new Map(visibleStats.map(stat => [stat.project.id, projectTimeline(stat.project, tasks)])),
    [visibleStats, tasks],
  );

  const columns = useMemo(() => mergeTaskStatusColumns(statusColumns), [statusColumns]);

  /**
   * «Зараз» — одне значення на всю панель і стабільне в межах хвилини (§9.2
   * п.5): інакше дві картки на межі доби порахували б різне «сьогодні», а
   * memo перераховував би все на кожен рендер.
   */
  const minute = Math.floor(Date.now() / 60_000);
  const now = useMemo(() => new Date(minute * 60_000), [minute]);

  // Лічильники всіх карток — ОДИН прохід по задачах на всю панель (§9.2).
  // Колонки — сирі збережені: проєктні st-<uuid> теж потрібні для типу етапу.
  const counters = useMemo(
    () => projectCountersMap(projects, tasks, sprints, statusColumns, now),
    [projects, tasks, sprints, statusColumns, now],
  );

  // Поточний спринт картки — лише для проєктів з увімкненим модулем «Спринти».
  const sprintCards = useMemo(() => {
    const bySprint = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.sprintId) continue;
      const bucket = bySprint.get(task.sprintId);
      if (bucket) bucket.push(task);
      else bySprint.set(task.sprintId, [task]);
    }
    const result = new Map<string, SprintCard | null>();
    for (const project of projects) {
      if (!projectModules(project).sprints) continue;
      const open = openSprintsForProject(sprints, project.id)[0];
      result.set(project.id, open ? currentSprintCard(project, sprints, bySprint.get(open.id) ?? [], now) : null);
    }
    return result;
  }, [projects, tasks, sprints, now]);

  // Аналітика дивиться на ТОЙ САМИЙ зріз, що й список карток: перемикач
  // «Живі / Архів» має міняти і графіки теж, інакше цифри під списком
  // описують не те, що над ними.
  const analyticsProjects = useMemo(
    () => visibleStats.map(stat => stat.project),
    [visibleStats],
  );

  // KPI портфеля — по тому самому видимому набору, сумою тих самих лічильників.
  const kpi = useMemo(
    () => portfolioKpi(analyticsProjects, tasks, sprints, statusColumns, now, counters),
    [analyticsProjects, tasks, sprints, statusColumns, now, counters],
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

  const trackWrite = useStorageRefresh(['tasks', 'projects', 'task_statuses', 'sprints'], loadAll);

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
    setTemplate('simple');
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
    setDeadline(isoToLocalDateInput(p.deadline));
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
    // Локальна доба поля, а не UTC-північ `new Date('YYYY-MM-DD')`; незмінене
    // поле лишає збережене значення як є.
    const deadlineIso = localDateInputToIso(deadline, editing?.deadline);
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
      router.push(`/project/${encodeURIComponent(id)}` as never);
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
  // DS v2: палітра — семантичні токени (canvas / card / subtle / text.*).
  const tk = dsTokens(isDark);
  const c = useMemo(() => {
    const t = dsTokens(isDark);
    return {
      bg1:    t.bg.canvas,
      bg2:    t.bg.canvas,
      border: t.border.hairline,
      text:   t.text.primary,
      sub:    t.text.secondary,
      accent: glassOf(t).accent.lavender.ink, // DS v2.1: акцент «Проєктів» — lavender
      dim:    glassOf(t).surfaceSubtle,
      sheet:  glassOf(t).sheet,
    };
  }, [isDark]);

  // Окремий обʼєкт, а не сам `c`: аналітика бере з палітри рівно п'ять полів, і
  // передавати їй увесь набір означало б перемальовувати графіки щоразу, коли
  // в екрана зміниться будь-який інший колір.
  const analyticsPalette = useMemo(
    () => ({ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent }),
    [c],
  );

  /** «Закрити спринт» на картці — у розділ «Спринти», де діалог закриття. */
  const openSprints = useCallback((project: Project) => {
    haptic.light();
    router.push(projectRoute(project.id, 'sprints') as never);
  }, [router]);

  /** Вхід у простір проєкту — повна зміна контексту (план §3). */
  const openProject = useCallback((project: Project) => {
    haptic.light();
    router.push(`/project/${encodeURIComponent(project.id)}` as never);
  }, [router]);

  /**
   * Layout System v2.4 — три зони на ПЛАНШЕТІ: [«Портфель»] [картки]
   * [зведення вибраного проєкту]. Вибраний проєкт — у параметрі `?project=`
   * (диплінк відкриває той самий стан), видимість панелей — вибір пристрою
   * (hooks/use-zone-state.ts, не ui_preferences). Телефон цього не бачить.
   */
  const zs = useProjectZoneStrings();
  const zoneState = useZoneState({ section: 'projects', selectedParam: 'project', label: tr.projects });
  const selectInZone = zoneState.select;
  const closeZonePanel = zoneState.closePanel;
  const zoneSizes = useZoneSizes(DEFAULT_ZONE_SIZE_KEY);
  const selectedStats = useMemo(
    () => (isWide && zoneState.selectedId ? statsList.find(stat => stat.project.id === zoneState.selectedId) ?? null : null),
    [isWide, zoneState.selectedId, statsList],
  );
  const zoneFit = zoneWidths({
    windowWidth,
    screenWidth,
    wide: isWide,
    wantStatic: zoneState.panels.static,
    wantDynamic: zoneState.panelOpen && !!selectedStats,
    sizes: zoneSizes,
    handles: { static: ZONE_HANDLE_WIDTH, dynamic: ZONE_HANDLE_WIDTH },
  });
  // «Портфель» поруч — KPI-рядок шапки не дублює ті самі числа.
  const staticBeside = isWide && zoneFit.showStatic && projects.length > 0;

  // Вибраний проєкт зник (видалили, вийшли, синк прибрав) — закриваємо панель.
  useEffect(() => {
    if (isWide && initialized && zoneState.selectedId && !selectedStats) closeZonePanel();
  }, [isWide, initialized, zoneState.selectedId, selectedStats, closeZonePanel]);

  /**
   * Тап по картці. Телефон — як і раніше, одразу в простір проєкту. Планшет —
   * лише ВИБІР (зведення в динамічній зоні); вхід — кнопкою «Відкрити проєкт»
   * на картці або в панелі.
   */
  const selectProject = useCallback((project: Project) => {
    if (!isWide) { openProject(project); return; }
    haptic.light();
    selectInZone(project.id);
  }, [isWide, openProject, selectInZone]);

  const zoneSelectById = useCallback((id: string) => { haptic.light(); selectInZone(id); }, [selectInZone]);

  // Дані статичної й динамічної зон — лише на планшеті.
  const zoneAtRisk = useMemo(
    () => (isWide ? visibleStats.filter(stat => isProjectAtRisk(stat, sprintCards.get(stat.project.id), now)).length : 0),
    [isWide, visibleStats, sprintCards, now],
  );
  const zoneDeadlines = useMemo(() => (isWide ? upcomingDeadlines(visibleStats, now) : []), [isWide, visibleStats, now]);
  const zoneRoles = useMemo(
    () => (isWide ? roleSummary(visibleStats.map(stat => projectRoles[stat.project.id] ?? 'owner')) : []),
    [isWide, visibleStats, projectRoles],
  );
  const zoneKeyTasks = useMemo(
    () => (selectedStats ? keyProjectTasks(tasks, selectedStats.project.id, now) : []),
    [selectedStats, tasks, now],
  );

  // Шапка їде разом зі списком, як і раніше, — тому вона ListHeaderComponent,
  // а не окремий фіксований блок над FlatList.
  const lead = useHeaderLead({ hasBack: true });

  const listHeader = (
    <>
      {/*
        Шапка тут НЕ ScreenHeader навмисно: вона їде разом зі списком
        (ListHeaderComponent), а спільний хедер — фіксований і сам додає
        верхній інсет, який у цього екрана вже дає SafeAreaView. Спільним
        лишається саме рішення про стрілку: useHeaderLead ховає її на
        планшеті, де «Проєкти» відкриваються прямо з сайдбара.
      */}
      <View style={{ marginTop: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
        {lead === 'back' ? (
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tr.back}
            hitSlop={HEADER_BUTTON_HIT_SLOP}
            style={[st.headerBtn, { backgroundColor: glassOf(tk).surface, ...glassRim(tk, 'card') }]}>
            <IconSymbol name="chevron.left" size={16} color={c.text} />
          </TouchableOpacity>
        ) : null}
        <Text accessibilityRole="header" style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: lead === 'back' ? 12 : 0 }]}>{tr.projects}</Text>
        {/* Omni: головна дія — чорна pill; на планшеті з підписом. */}
        <TouchableOpacity
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityLabel={tr.newProject}
          style={[isWide ? st.headerPill : st.headerBtn, { backgroundColor: tk.action.primary }]}>
          <IconSymbol name="plus" size={16} color={tk.text.onAction} />
          {isWide ? <Text style={{ color: tk.text.onAction, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.newProject}</Text> : null}
        </TouchableOpacity>
      </View>

      {/* Omni KPI — великі тонкі числа по видимому набору (той самий kpi,
          що й у «Портфелі»): проєкти · прогрес · прострочені задачі. */}
      {kpi.projects > 0 && !staticBeside ? (
        <PageHeader
          bleed={isWide ? 0 : 20}
          style={{ marginBottom: 16 }}
          kpis={
            <>
              <KpiCounter value={kpi.projects} label={tr.portfolioProjects} />
              <KpiCounter value={`${kpi.pct}%`} label={tr.projectSortProgress} delta={`${kpi.done}/${kpi.total} ${tr.projectDone}`} />
              <KpiCounter
                value={kpi.overdue}
                label={tr.projectOverdueTasks}
                valueColor={kpi.overdue > 0 ? tk.status.danger : undefined}
              />
            </>
          }
        />
      ) : null}

      {/* DS v2.5 (планшет): Живі/Архів, сортування й статус — ОДИН ряд FilterBar. */}
      {filtersV25 ? (
        (archivedProjects.length > 0 || scopedStats.length > 0) ? (
          <FilterBar
            label={tr.projectListFilterLabel}
            overflowLabel={tr.filters}
            resetLabel={tr.reset}
            onReset={() => updateListPrefs(DEFAULT_PROJECT_LIST_PREFS)}
            style={{ marginBottom: 16 }}
            items={[
              ...(archivedProjects.length > 0 ? [{
                id: 'scope', pinned: true, node: (
                  <Segmented
                    label={tr.projects}
                    value={showArchived ? 'archive' : 'live'}
                    onChange={key => setShowArchived(key === 'archive')}
                    options={[
                      { value: 'live' as const, label: tr.filterActive, icon: 'folder' as const, count: liveProjects.length },
                      { value: 'archive' as const, label: tr.archive, icon: 'archivebox' as const, count: archivedProjects.length },
                    ]}
                  />
                ),
              }] : []),
              ...(scopedStats.length > 0 ? [
                {
                  id: 'sort', active: listPrefs.sort !== DEFAULT_PROJECT_LIST_PREFS.sort, menuLabel: tr.projectSortLabel, node: (
                    <FilterSelect<ProjectSortKey>
                      label={tr.projectSortLabel}
                      value={listPrefs.sort}
                      neutralValue={DEFAULT_PROJECT_LIST_PREFS.sort}
                      onChange={key => updateListPrefs({ ...listPrefs, sort: key ?? DEFAULT_PROJECT_LIST_PREFS.sort })}
                      options={PROJECT_SORT_KEYS.map(key => ({ value: key, label: tr[SORT_LABEL_KEY[key]] as string }))}
                    />
                  ),
                },
                {
                  id: 'status', active: listPrefs.statuses.length, menuLabel: tr.projectSortStatus, node: (
                    <FilterSelect<ProjectListStatus>
                      label={tr.projectSortStatus}
                      multiple
                      value={listPrefs.statuses}
                      onChange={picked => updateListPrefs({
                        ...listPrefs, statuses: PROJECT_LIST_STATUSES.filter(st2 => picked.includes(st2)),
                      })}
                      resetLabel={tr.reset}
                      options={PROJECT_LIST_STATUSES.map(status => ({
                        value: status, label: tr[STATUS_LABEL_KEY[status]] as string, count: statusCounts[status],
                      }))}
                    />
                  ),
                },
              ] : []),
            ]}
          />
        ) : null
      ) : (
        <>
        {/* Живі / Архів — Omni pill-вкладки. З'являються лише коли архів не
            порожній — інакше це вкладка, яка нікуди не веде. */}
        {archivedProjects.length > 0 && (
          <SectionTabs
            tabs={[
              { key: 'live', label: tr.filterActive, icon: 'folder', count: liveProjects.length },
              { key: 'archive', label: tr.archive, icon: 'archivebox', count: archivedProjects.length },
            ]}
            value={showArchived ? 'archive' : 'live'}
            onChange={key => setShowArchived(key === 'archive')}
            bleed={isWide ? 0 : 20}
            style={{ marginBottom: 12 }}
          />
        )}

        {/* Сортування й фільтр статусу — лише коли в зрізі є що сортувати. */}
        {scopedStats.length > 0 && (
          <View style={{ marginBottom: 16, gap: 8 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              accessibilityLabel={tr.projectSortLabel}
              contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
              <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, marginRight: 2 }}>{tr.projectSortLabel}</Text>
              {PROJECT_SORT_KEYS.map(key => (
                <ListChip
                  key={key}
                  label={tr[SORT_LABEL_KEY[key]] as string}
                  selected={listPrefs.sort === key}
                  onPress={() => updateListPrefs({ ...listPrefs, sort: key })}
                  accent={c.accent} sub={c.sub} dim={c.dim} border={c.border}
                />
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              accessibilityLabel={tr.projectListFilterLabel}
              contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
              {PROJECT_LIST_STATUSES.map(status => (
                <ListChip
                  key={status}
                  label={tr[STATUS_LABEL_KEY[status]] as string}
                  count={statusCounts[status]}
                  selected={listPrefs.statuses.includes(status)}
                  onPress={() => toggleStatus(status)}
                  accent={c.accent} sub={c.sub} dim={c.dim} border={c.border}
                />
              ))}
            </ScrollView>
          </View>
        )}
        </>
      )}

      {/* Портфель — над списком: KPI і «виконано за тиждень» по видимому
          набору (§8.3). Детальні графіки лишаються в підвалі. */}
      <PortfolioKpi kpi={kpi} palette={analyticsPalette} />
    </>
  );

  const renderCard = (item: ProjectStats) => (
    <ProjectCard
      project={item.project}
      stats={item}
      counters={counters.get(item.project.id) ?? EMPTY_COUNTERS}
      sprintCard={sprintCards.get(item.project.id) ?? null}
      sprintsEnabled={projectModules(item.project as Project).sprints}
      canEditContent={(projectRoles[item.project.id] ?? 'owner') !== 'viewer'}
      onOpenSprints={openSprints}
      buckets={timelines.get(item.project.id) ?? EMPTY_BUCKETS}
      selected={isWide && zoneState.panelOpen && item.project.id === zoneState.selectedId}
      locale={locale}
      tr={tr}
      isDark={isDark}
      borderColor={c.border}
      textColor={c.text}
      subColor={c.sub}
      surfaceColor={tk.surface.card}
      accentColor={c.accent}
      canManage={isProjectOwner(item.project.id)}
      onPress={selectProject}
      onEdit={openEdit}
      onDelete={deleteProject}
      onLeave={leaveProject}
      onOpen={isWide ? openProject : undefined}
      pressHint={isWide ? zs.selectHint : undefined}
    />
  );

  // Порожній зріз через фільтр — це не «проєктів немає»: інша підказка й
  // кнопка скинути фільтр, а не «створити проєкт».
  const filteredOut = scopedStats.length > 0 && visibleStats.length === 0;
  // Omni: порожній стан — на суцільній картці, а не просто текстом на тлі.
  const listEmpty = filteredOut ? (
    <BentoCard style={{ alignItems: 'center', paddingVertical: 40 }}>
      <Text style={[type.h2, { color: c.text, textAlign: 'center' }]}>{tr.projectListFilterNoMatch}</Text>
      <TouchableOpacity
        onPress={() => updateListPrefs({ ...listPrefs, statuses: [] })}
        accessibilityRole="button"
        accessibilityLabel={tr.projectListFilterReset}
        style={{ marginTop: 16, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: tk.surface.subtle }}>
        <Text style={{ color: tk.action.secondaryText, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.projectListFilterReset}</Text>
      </TouchableOpacity>
    </BentoCard>
  ) : (
    <BentoCard style={{ alignItems: 'center', paddingVertical: 48 }}>
      <AccentIcon isDark={isDark} icon="folder" accent="lavender" size="lg" style={st.emptyIcon} />
      <Text style={[type.h2, { color: c.text, marginTop: 20 }]}>{tr.noProjects}</Text>
      <Text style={[type.body, { color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }]}>
        {tr.pressToAdd}
      </Text>
      <TouchableOpacity
        onPress={openAdd}
        accessibilityRole="button"
        accessibilityLabel={tr.newProject}
        style={{ marginTop: 20, minHeight: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: tk.action.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconSymbol name="plus" size={16} color={tk.text.onAction} />
        <Text style={{ color: tk.text.onAction, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.newProject}</Text>
      </TouchableOpacity>
    </BentoCard>
  );

  const listFooter = (
    <ProjectAnalytics
      projects={analyticsProjects}
      tasks={tasks}
      columns={columns}
      scopeLabel={showArchived ? tr.archive : tr.projects}
      palette={analyticsPalette}
    />
  );

  // Картки для masonry: вертикальний відступ — справа самої обгортки картки.
  const masonryItems: MasonryEntry[] = isWide
    ? visibleStats.map(item => ({
        key: item.project.id,
        node: <View style={{ marginBottom: 12 }}>{renderCard(item)}</View>,
      }))
    : [];

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {isWide ? (
        /*
          Планшет — Layout System v2.4: [«Портфель» (≥1280)] [картки masonry]
          [зведення вибраного проєкту — панель праворуч з ✕ / нижній аркуш у
          вузькому вікні]. Тап по картці лише вибирає; вхід у проєкт — кнопкою.
        */
        <ZoneLayout
          testID="projects-zones"
          main={
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
              <ScrollView
                onLayout={e => setMainZoneWidth(Math.round(e.nativeEvent.layout.width))}
                contentContainerStyle={st.wideContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}>
                {listHeader}
                {visibleStats.length > 0
                  ? <MasonryColumns items={masonryItems} columnCount={columnCount} />
                  : listEmpty}
                {listFooter}
              </ScrollView>
            </SafeAreaView>
          }
          dynamic={selectedStats ? (
            <ProjectZoneDetails
              stats={selectedStats}
              counters={counters.get(selectedStats.project.id) ?? EMPTY_COUNTERS}
              sprint={sprintCards.get(selectedStats.project.id) ?? null}
              sprintsEnabled={projectModules(selectedStats.project as Project).sprints}
              role={projectRoles[selectedStats.project.id] ?? 'owner'}
              atRisk={isProjectAtRisk(selectedStats, sprintCards.get(selectedStats.project.id), now)}
              keyTasks={zoneKeyTasks}
              now={now}
              locale={locale}
            />
          ) : null}
          dynamicOpen={zoneState.panelOpen && !!selectedStats}
          onCloseDynamic={closeZonePanel}
          dynamicLabel={zs.details}
          dynamicFooter={selectedStats ? (
            <ProjectZoneFooter
              name={selectedStats.project.name}
              onOpen={() => openProject(selectedStats.project as Project)}
              onEdit={isProjectOwner(selectedStats.project.id) ? () => openEdit(selectedStats.project as Project) : undefined}
            />
          ) : undefined}
          static={projects.length > 0 ? (
            <ProjectZoneStatic
              scopeLabel={showArchived ? zs.scopeArchive : zs.scopeLive}
              kpi={kpi}
              atRisk={zoneAtRisk}
              deadlines={zoneDeadlines}
              roles={zoneRoles}
              selectedId={zoneState.panelOpen ? zoneState.selectedId : null}
              locale={locale}
              onSelect={zoneSelectById}
            />
          ) : undefined}
          showStatic={zoneState.panels.static}
          panels={zoneState.panels}
          onTogglePanel={zoneState.togglePanel}
        />
      ) : (
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <FlatList
            data={visibleStats}
            keyExtractor={stat => stat.project.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
            ListHeaderComponent={listHeader}
            // Аналітика — підвал списку, а не окремий екран: цифри під картками
            // відповідають на питання, яке виникає саме після погляду на них
            // («а куди все це рухається»), і зайвий перехід розірвав би цю
            // послідовність. На порожньому списку компонент повертає null сам.
            ListFooterComponent={listFooter}
            renderItem={({ item }) => renderCard(item)}
            ListEmptyComponent={listEmpty}
          />
        </SafeAreaView>
      )}

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, { backgroundColor: tk.surface.overlay }, wm.overlay]} onPress={closeModal}>
            <Pressable onPress={e => e.stopPropagation()} style={[st.sheetWrapper, wm.column]} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <View style={[st.sheet, sheetSurface, { backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
                <OverlayMaterial isDark={isDark} />
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
                      <IconSymbol name="xmark" size={16} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[st.sheetTitle, { color: c.text }]}>
                  {editing ? tr.editProject : tr.newProject}
                </Text>

                <TextInput
                  placeholder={tr.projectNamePlaceholder}
                  accessibilityLabel={tr.projectNamePlaceholder}
                  placeholderTextColor={tk.text.muted}
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
                  placeholderTextColor={tk.text.muted}
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
                  placeholderTextColor={tk.text.muted}
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
                        color === col && { borderWidth: 3, borderColor: tk.action.primary },
                      ]}>
                      {color === col && <IconSymbol name="checkmark" size={14} color="#FFFFFF" />}
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
                            backgroundColor: template === t ? tk.action.primary : c.dim,
                          }]}>
                          <Text style={{ color: template === t ? tk.text.onAction : c.text, fontFamily: fontFamily.semibold }}>
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
                    style={[st.btn, { marginTop: 20, backgroundColor: glassOf(tk).surfaceSubtle, ...glassRim(tk, 'subtle') }]}>
                    <Text style={{ color: tk.action.secondaryText, fontFamily: fontFamily.semibold }}>
                      {editing.archivedAt ? tr.unarchiveProject : tr.archiveAccount}
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 24, marginBottom: 4 }}>
                  <TouchableOpacity onPress={closeModal} style={[st.btn, { flex: 1, backgroundColor: glassOf(tk).surfaceSubtle, ...glassRim(tk, 'subtle') }]}>
                    <Text style={{ color: tk.action.secondaryText, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={save} style={[st.btn, { flex: 2, backgroundColor: tk.action.primary }]}>
                    <Text style={{ color: tk.text.onAction, fontFamily: fontFamily.semibold }}>
                      {editing ? tr.save : tr.create}
                    </Text>
                  </TouchableOpacity>
                </View>
                </ScrollView>
              </View>
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
  // Omni: футер-чипи картки (дата терміну, найближча задача) — тихі pill.
  metaChip:    { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: radius.pill },

  pageTitle:   { ...type.h1 },
  headerBtn:   { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  headerPill:  { minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyIcon:   { width: 72, height: 72, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  card:        { borderRadius: radius.card, borderWidth: 1.5, padding: 20 },
  colorBadge:  { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  colorDot:    { width: 18, height: 18, borderRadius: 9 },
  progressBg:  { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: radius.pill },
  overlay:     { flex: 1, justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Лише планшет: низ із запасом під перемикачі панелей (три крапки під main).
  wideContent: { width: '100%', maxWidth: Layout.wideMaxWidth, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 96 },
  // Стеля висоти — числом із useSheetSurface(): відсоток від батька з
  // height:auto у Yoga не рахується, аркуш ріс на всю висоту вмісту, а
  // ScrollView усередині нічого не гортав (NAT-01).
  sheet:       { borderRadius: radius.card, padding: 24, overflow: 'hidden' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 16 },
  input:       { borderRadius: radius.control, minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, fontFamily: fontFamily.regular },
  label:       { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 10, marginTop: 16 },
  colorChip:   { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btn:         { minHeight: 48, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
