import { TeamWorkspace } from '@/components/projects/TeamWorkspace';
/**
 * app/project/[id]/overview.tsx — дашборд простору проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: «прогрес і дедлайн, прострочене, найближчі
 * наради, поточний спринт, години за тиждень, витрачено з бюджету»).
 *
 * Розділ ЗАВЖДИ доступний (як і Завдання) — на відміну від решти, вимикати
 * його в Налаштуваннях не можна.
 *
 * Читає ті самі ключі сховища, що й решта застосунку (tasks, meetings,
 * sprints, time_entries, transactions, accounts, project_budgets,
 * finance_currencies) — суто для показу, нічого не пише, тож звичайний
 * `loadData` + `useStorageRefresh` замість `useSyncedList`.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { ProjectSyncIndicator } from '@/components/projects/ProjectSyncIndicator';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useProjectContentStyle } from '@/components/projects/ProjectLayout';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { fetchProjectActivity, type ActivityEntry } from '@/store/project-activity';
import { refreshProjectNow } from '@/store/project-sync';
import { loadData } from '@/store/storage';
import { useTimerContext } from '@/store/timer-context';
import type { Account } from '@/utils/accounts';
import { formatDuration } from '@/utils/durationFormat';
import type { Currency, Transaction } from '@/utils/financeUtils';
import { formatSubscriptionMoney } from '@/utils/subscriptions';
import { projectMeetingSections, type Meeting } from '@/utils/meetings';
import { activityIcon, formatActivityMessage, mergeConsecutiveActivity } from '@/utils/projectActivity';
import { useActivityContext } from '@/hooks/use-activity-context';
import { projectStats } from '@/utils/projectStats';
import { budgetSpentTotal, hoursThisWeekSeconds, type ProjectTimeEntryLike } from '@/utils/projectOverview';
import { taskProjectMap } from '@/utils/timeEntries';
import { currentSprintCard, projectCounters } from '@/utils/projectStatsMetrics';
import type { Sprint, SprintTaskLike } from '@/utils/sprintUtils';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';
import { fontFamily, radius, space, type } from '@/constants/theme';
import {
  BentoArrowButton, BentoCard, BentoGrid, BentoPeriodPill, DisplayNumber, KpiCounter, SegmentedProgress, useBentoColors,
} from '@/components/ds';
import { useDS } from '@/hooks/use-ds';

interface OverviewTask extends SprintTaskLike {
  backlogKind?: string;
  kanbanColumnId?: string;
  assigneeId?: string | null;
  history?: { at: string; type: string }[];
  deadline?: string;
  timeEntries?: { startedAt: string; endedAt?: string; duration: number }[];
}

interface ProjectBudgetRecord {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  updatedAt?: string;
}

export default function ProjectOverviewScreen() {
  const id = useProjectRouteId() as string;
  const router = useRouter();
  const { t, g, isDark } = useDS();
  // Дашборд: на планшеті — широка стеля, наради й активність поруч.
  const contentStyle = useProjectContentStyle('wide');
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project, loading } = useProject(id);
  const role = useProjectRole(id);
  const { activeTimers } = useTimerContext();

  const [tasks, setTasks] = useState<OverviewTask[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [statusColumns, setStatusColumns] = useState<TaskStatusColumn[]>([]);
  const [timeEntries, setTimeEntries] = useState<ProjectTimeEntryLike[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<ProjectBudgetRecord[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Активність (§4.6) — окремий REST-запит, не частина loadAll (та колекція
  // storage-ключів вище: активність не синкається й не лежить у сховищі).
  const [recentActivity, setRecentActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const activityCtx = useActivityContext(id);

  // Остання ЗАПИТАНА активність: відповідь попереднього проєкту (перемкнули
  // свічер, поки запит летів) не має лягати поверх нового.
  const activityRequestRef = useRef<string | null>(null);
  const loadActivity = useCallback(async (projectId: string) => {
    activityRequestRef.current = projectId;
    setActivityLoading(true);
    try {
      const page = await fetchProjectActivity(projectId, { limit: 15 });
      if (activityRequestRef.current === projectId) setRecentActivity(mergeConsecutiveActivity(page.results).slice(0, 5));
    } catch {
      /* активність — не критично: лишаємо попередню стрічку */
    } finally {
      if (activityRequestRef.current === projectId) setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!project?.id) return;
    void loadActivity(project.id);
  }, [project?.id, loadActivity]);

  const loadAll = useCallback(async () => {
    const [t, m, s, te, tx, acc, pb, cur, cols] = await Promise.all([
      loadData<OverviewTask[]>('tasks', []),
      loadData<Meeting[]>('meetings', []),
      loadData<Sprint[]>('sprints', []),
      loadData<ProjectTimeEntryLike[]>('time_entries', []),
      loadData<Transaction[]>('transactions', []),
      loadData<Account[]>('accounts', []),
      loadData<ProjectBudgetRecord[]>('project_budgets', []),
      loadData<Currency[]>('finance_currencies', []),
      // Колонки — для лічильника «в роботі» (тип етапу береться з колонки).
      loadData<TaskStatusColumn[]>('task_statuses', []),
    ]);
    setStatusColumns(cols);
    setTasks(t.filter(task => !task.backlogKind)); setMeetings(m); setSprints(s); setTimeEntries(te);
    setTransactions(tx); setAccounts(acc); setBudgets(pb); setCurrencies(cur);
  }, []);

  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  useStorageRefresh(['tasks', 'meetings', 'sprints', 'time_entries', 'transactions', 'accounts', 'project_budgets', 'finance_currencies', 'task_statuses'], loadAll);

  /**
   * Pull-to-refresh іде НА СЕРВЕР (`refreshProjectNow`), а не лише перечитує
   * AsyncStorage, як було: жест давав спінер і ті самі дані, бо ніхто в
   * межах проєкту не робив обміну взагалі. Офлайн `refreshProjectNow` тихо
   * виходить — лишається звичайне перечитування локальних даних.
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        if (id) {
          await refreshProjectNow(id);
          await loadActivity(id);
        }
      } catch (e) {
        if (__DEV__) console.warn('[project/overview] оновлення не вдалося:', e);
      } finally {
        await loadAll();
        setRefreshing(false);
      }
    })();
  }, [id, loadAll, loadActivity]);

  const c = projectShellColors(isDark, project?.color ?? '#7C3AED',project?.appearance);
  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;

  const stats = useMemo(
    () => (project ? projectStats(project, tasks, new Date(), activeTimers) : null),
    [project, tasks, activeTimers],
  );
  const upcomingMeetings = useMemo(
    () => (project ? projectMeetingSections(meetings, project.id, new Date()).upcoming.slice(0, 3) : []),
    [project, meetings],
  );
  // modules.sprints — інакше картка поточного спринту показувалась би навіть
  // з вимкненим розділом Спринти (review finding; Наради й Бюджет нижче вже
  // правильно перевіряють свій modules.*).
  //
  // Той самий currentSprintCard, що й на картці проєкту (utils/projectStatsMetrics):
  // «Огляд» і картка мусять показувати ОДИН поточний спринт і ті самі дні.
  const minute = Math.floor(Date.now() / 60_000);
  const now = useMemo(() => new Date(minute * 60_000), [minute]);
  const sprintStats = useMemo(
    () => (project && modules.sprints ? currentSprintCard(project, sprints, tasks, now) : null),
    [project, modules.sprints, sprints, tasks, now],
  );
  // Лічильники картки проєкту (воронка й ознаки) — ті самі числа, що в списку.
  const counters = useMemo(
    () => (project ? projectCounters(project, tasks, sprints, statusColumns, now) : null),
    [project, tasks, sprints, statusColumns, now],
  );
  const counterLine = counters
    ? [
        counters.inProgress ? `${counters.inProgress} ${tr.projectInProgress}` : '',
        counters.unassigned ? `${counters.unassigned} ${tr.projectUnassigned}` : '',
        modules.sprints && counters.backlog ? `${counters.backlog} ${tr.projectBacklog}` : '',
      ].filter(Boolean).join(' · ')
    : '';
  const sprintHint = sprintStats
    ? sprintStats.overdue
      ? tr.sprintOverdueDays.replace('{n}', String(sprintStats.overdueDays))
      : !sprintStats.dated
        ? tr.sprintUndated
        : sprintStats.daysLeft === 0
          ? tr.sprintLastDay
          : tr.sprintDaysLeft.replace('{n}', String(sprintStats.daysLeft ?? 0))
    : '';
  const weekSeconds = useMemo(
    () => (project ? hoursThisWeekSeconds(timeEntries, project.id, new Date(), taskProjectMap(tasks)) : 0),
    [project, timeEntries, tasks],
  );
  const budget = project ? budgets.find(b => b.id === project.id) : undefined;
  /**
   * Витрачено з бюджету — ЗА ВЕСЬ ЧАС (`budgetSpentTotal`), як у розділі
   * «Бюджет» і у вебі.
   *
   * Тут стояв `budgetSpentThisMonth`, і плитка «Витрачено» рахувала лише
   * поточний місяць, хоча ділила це число на `budget.amount` — ліміт, який
   * задають на ПРОЄКТ цілком, а не на місяць. Виходило «3 000 / 200 000» у
   * грудні й «0 / 200 000» у січні під тим самим підписом, причому сусідній
   * розділ «Бюджет» на тому самому проєкті показував інше число. Дріб має
   * порівнювати те саме з тим самим, інакше він не означає нічого.
   *
   * Темпу за місяць тут навмисно НЕ додаємо: окрема цифра потребує власного
   * підпису («Цього місяця»), а вигадувати його поруч із наявним «Витрачено»
   * означало б дві нез'ясовні суми в одному рядку плиток.
   */
  const spent = useMemo(
    () => (project && budget ? budgetSpentTotal(transactions, accounts, project.id, budget.currency) : 0),
    [project, budget, transactions, accounts],
  );

  if (!project) {
    return (
      <ProjectScreenShell project={null} isDark={isDark} title={tr.projectNavOverview}>
        {!loading && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={[type.body, { color: c.sub }]}>{tr.projectNotFound}</Text>
          </View>
        )}
      </ProjectScreenShell>
    );
  }

  const pct = stats?.pct ?? 0;
  const overdue = stats?.overdue ?? 0;
  const deadlineLabel = project.deadline
    ? new Date(project.deadline).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    : '';
  const hoursLabel = formatDuration(weekSeconds, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute });
  const nextMeeting = upcomingMeetings[0];
  const restMeetings = upcomingMeetings.slice(1);
  const openMeeting = (meetingId: string) =>
    router.push({ pathname: '/project/[id]/calendar', params: { id: project.id, open: meetingId } } as never);
  const meetingWhen = (date: string, time?: string) =>
    `${new Date(`${date}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', weekday: 'short' })}${time ? ` · ${time}` : ''}`;

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.projectNavOverview}
      // Omni: опис проєкту — однорядковий підзаголовок під H1, а KPI — великі
      // тонкі числа з даних, що вже є на екрані (прогрес · прострочені · години).
      subtitle={project.description || undefined}
      kpis={
        <>
          <KpiCounter value={`${pct}%`} label={tr.projectSortProgress} delta={`${stats?.done ?? 0}/${stats?.total ?? 0} ${tr.projectDone}`} />
          <KpiCounter
            value={overdue}
            label={tr.projectOverdueTasks}
            valueColor={overdue > 0 ? t.status.danger : undefined}
          />
          {modules.time ? <KpiCounter value={hoursLabel} label={tr.overviewHoursThisWeek} /> : null}
        </>
      }
      actions={<ProjectSyncIndicator projectId={project.id} accent={c.accent} subColor={c.sub} dimColor={c.dim} />}>
      <ScrollView
        contentContainerStyle={[contentStyle, { paddingBottom: tabBarInset + 40, paddingTop: 4 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {/* Contract §4.1 — глядач читає весь проєкт, але ніде в ньому не
            редагує; без цього напису обмеження в кожному розділі виглядали б
            як прихована помилка, а не свідома роль. */}
        {role === 'viewer' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: t.surface.card, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16, alignSelf: 'flex-start' }}>
            <IconSymbol name="eye" size={13} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.viewerReadOnlyNotice}</Text>
          </View>
        ) : null}

        {/* Omni bento: суцільні картки з шапкою «icon-chip + назва». */}
        <BentoGrid style={{ marginBottom: space.cardGapCompact }}>
          {/* Прогрес + дедлайн — головна картка: сегментний прогрес Omni. */}
          <BentoCard
            key="progress"
            span={2}
            title={tr.projectSortProgress}
            icon="chart.bar.fill"
            accent="lavender"
            headerRight={project.deadline ? <BentoPeriodPill label={`${tr.projectDeadline}: ${deadlineLabel}`} /> : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 14 }}>
              <DisplayNumber value={pct} unit="%" size="lg" />
              <Text style={[type.caption, type.numeric, { color: c.sub, marginBottom: 8, flexShrink: 1 }]}>
                {stats?.done ?? 0}/{stats?.total ?? 0} {tr.projectDone}
              </Text>
            </View>
            <SegmentedProgress value={pct / 100} accessibilityLabel={`${tr.projectSortProgress}: ${pct}%`} />
            {counterLine ? (
              <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 12 }]}>{counterLine}</Text>
            ) : null}
          </BentoCard>

          {/* Поточний спринт — той самий currentSprintCard, що на картці проєкту. */}
          {sprintStats ? (
            <BentoCard
              key="sprint"
              title={sprintStats.sprint.name}
              subtitle={tr.sprintCurrent}
              icon="flag.fill"
              accent={sprintStats.overdue ? 'amber' : 'lavender'}
              onPress={() => router.push(`/project/${encodeURIComponent(project.id)}/sprints` as never)}
              accessibilityLabel={`${tr.sprintCurrent}: ${sprintStats.sprint.name}, ${sprintStats.done}/${sprintStats.total}, ${sprintHint}`}
              headerRight={<BentoArrowButton />}>
              <DisplayNumber value={`${sprintStats.done}/${sprintStats.total}`} size="sm" />
              <SegmentedProgress
                value={sprintStats.total ? sprintStats.done / sprintStats.total : 0}
                segments={12}
                style={{ marginTop: 12 }}
                accessibilityLabel={`${sprintStats.sprint.name}: ${sprintStats.done}/${sprintStats.total}`}
              />
              {/* Протермінований спринт — бурштиновий, не червоний (§4). */}
              <Text style={[type.caption, { color: sprintStats.overdue ? g.accent.amber.ink : c.sub, marginTop: 10, fontFamily: sprintStats.overdue ? fontFamily.semibold : fontFamily.regular }]}>
                {sprintHint}
              </Text>
            </BentoCard>
          ) : null}

          {modules.budget && role === 'owner' && budget ? (
            <BentoCard key="budget" title={tr.overviewBudgetSpent} icon="creditcard.fill" accent="success">
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: spent > budget.amount ? t.status.danger : c.text, fontSize: 28, fontFamily: fontFamily.light, letterSpacing: -0.6, fontVariant: ['tabular-nums'] }}>
                {formatSubscriptionMoney(spent, budget.currency, currencies, locale)}
              </Text>
              <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                / {formatSubscriptionMoney(budget.amount, budget.currency, currencies, locale)}
              </Text>
              <SegmentedProgress
                value={budget.amount > 0 ? spent / budget.amount : 0}
                segments={12}
                style={{ marginTop: 12 }}
                accessibilityLabel={`${tr.overviewBudgetSpent}: ${formatSubscriptionMoney(spent, budget.currency, currencies, locale)} / ${formatSubscriptionMoney(budget.amount, budget.currency, currencies, locale)}`}
              />
            </BentoCard>
          ) : null}

          {/* Найближчі наради — ЄДИНА темна картка сторінки (Omni «Meeting»):
              найближча зустріч великим, біла pill відкриває її в календарі. */}
          {modules.meetings ? (
            <BentoCard key="meetings" variant="dark" title={tr.overviewUpcomingMeetings} icon="person.2.fill">
              {nextMeeting ? (
                <OverviewMeetings
                  next={nextMeeting}
                  rest={restMeetings}
                  when={meetingWhen}
                  onOpen={openMeeting}
                  openLabel={tr.todayPaneOpenCalendar}
                />
              ) : (
                <Text style={[type.caption, { color: t.featured.textSecondary }]}>{tr.projectMeetingsNoUpcoming}</Text>
              )}
            </BentoCard>
          ) : null}

          {/* Активність (§4.6) — останні кілька записів; повна стрічка з пагінацією — окремий екран. */}
          <BentoCard
            key="activity"
            title={tr.projectActivityTitle}
            icon="clock.arrow.circlepath"
            accent="info"
            headerRight={
              <TouchableOpacity
                onPress={() => router.push(`/project/${encodeURIComponent(project.id)}/activity` as never)}
                accessibilityRole="button"
                hitSlop={{ top: 6, bottom: 6 }}
                style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.surface.subtle, justifyContent: 'center' }}>
                <Text style={{ color: t.action.secondaryText, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.projectActivityShowAll}</Text>
              </TouchableOpacity>
            }>
            {activityLoading ? null : recentActivity.length === 0 ? (
              <Text style={[type.caption, { color: c.sub }]}>{tr.projectActivityEmpty}</Text>
            ) : (
              <View style={{ gap: 10 }}>
                {recentActivity.map(entry => (
                  <View key={entry.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <View style={{
                      width: 28, height: 28, borderRadius: 14, backgroundColor: t.surface.subtle,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <IconSymbol name={activityIcon(entry)} size={12} color={c.text} />
                    </View>
                    <Text numberOfLines={2} style={[type.body, { flex: 1, color: c.text, fontSize: 13, lineHeight: 18, marginTop: 4 }]}>
                      {formatActivityMessage(entry, tr, activityCtx)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </BentoCard>
        </BentoGrid>
        <TeamWorkspace mode="overview" embedded/>
      </ScrollView>
    </ProjectScreenShell>
  );
}

/**
 * Вміст темної картки нарад: найближча — великим заголовком і білою pill
 * (Omni «Start Meeting»), решта — тихими рядками під нею. Кольори — з
 * useBentoColors(): на темній картці text.primary був би чорним по чорному.
 */
function OverviewMeetings({ next, rest, when, onOpen, openLabel }: {
  next: { meeting: Meeting; date: string; time?: string };
  rest: { meeting: Meeting; date: string; time?: string }[];
  when: (date: string, time?: string) => string;
  onOpen: (id: string) => void;
  openLabel: string;
}) {
  const bc = useBentoColors();
  return (
    <View>
      <Text numberOfLines={2} style={{ color: bc.text, fontSize: 22, lineHeight: 28, fontFamily: fontFamily.semibold, letterSpacing: -0.3 }}>
        {next.meeting.title}
      </Text>
      <Text style={[type.caption, type.numeric, { color: bc.textSecondary, marginTop: 4 }]}>{when(next.date, next.time)}</Text>
      <TouchableOpacity
        onPress={() => onOpen(next.meeting.id)}
        accessibilityRole="button"
        accessibilityLabel={`${openLabel}: ${next.meeting.title}`}
        activeOpacity={0.8}
        style={{ marginTop: 16, minHeight: 44, borderRadius: radius.pill, backgroundColor: bc.actionBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 }}>
        <IconSymbol name="calendar" size={15} color={bc.actionText} />
        <Text style={{ color: bc.actionText, fontSize: 14, fontFamily: fontFamily.semibold }}>{openLabel}</Text>
      </TouchableOpacity>
      {rest.length > 0 ? (
        <View style={{ gap: 6, marginTop: 14 }}>
          {rest.map(({ meeting, date, time }) => (
            <TouchableOpacity
              key={`${meeting.id}_${date}`}
              onPress={() => onOpen(meeting.id)}
              accessibilityRole="button"
              accessibilityLabel={`${meeting.title}, ${when(date, time)}`}
              activeOpacity={0.75}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.nested, backgroundColor: bc.nestedBg, paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meeting.color }} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: bc.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{meeting.title}</Text>
                <Text style={[type.caption, type.numeric, { color: bc.textSecondary, marginTop: 2 }]}>{when(date, time)}</Text>
              </View>
              <IconSymbol name="chevron.right" size={13} color={bc.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}
