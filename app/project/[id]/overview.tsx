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
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
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
import { Card, DisplayNumber, ProgressBar } from '@/components/ds';
import { ds, useDS } from '@/hooks/use-ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';

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

/**
 * Плитка KPI (DS v2): біла картка, велике тонке число, підпис text.secondary.
 * `color` — лише крапка-індикатор (coral — алерт, amber — попередження,
 * колір проєкту — звичайна метрика), саме число завжди text.primary.
 */
function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  const { t, isDark } = useDS();
  return (
    <View style={[ds.card(t, isDark, { compact: true }), { flex: 1, minWidth: 150, gap: space[2] }]}>
      {/* DS v2.1: KPI — легка змивка кольором індикатора (один акцент на картку). */}
      {/^#[0-9A-Fa-f]{6}$/.test(color) ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius.cardCompact, backgroundColor: color + (isDark ? '1F' : '14') }} />
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text numberOfLines={2} style={[type.caption, { flex: 1, color: sub }]}>{label}</Text>
      </View>
      <DisplayNumber value={value} size="sm" adjustsFontSizeToFit />
    </View>
  );
}

export default function ProjectOverviewScreen() {
  const id = useProjectRouteId() as string;
  const router = useRouter();
  const { t, isDark } = useDS();
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

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.projectNavOverview}
      actions={<ProjectSyncIndicator projectId={project.id} accent={c.accent} subColor={c.sub} dimColor={c.dim} />}>
      <ScrollView
        contentContainerStyle={[contentStyle, { paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {project.description ? (
          <Text style={[type.body, { color: c.sub, marginBottom: 16 }]}>{project.description}</Text>
        ) : null}

        {/* Contract §4.1 — глядач читає весь проєкт, але ніде в ньому не
            редагує; без цього напису обмеження в кожному розділі виглядали б
            як прихована помилка, а не свідома роль. */}
        {role === 'viewer' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: glassOf(t).surface, ...glassRim(t, 'card'), paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16, alignSelf: 'flex-start' }}>
            <IconSymbol name="eye" size={13} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.viewerReadOnlyNotice}</Text>
          </View>
        ) : null}

        {/* Прогрес + дедлайн — головна KPI-картка (DS v2.1): скло зі змивкою і
            світінням lavender (акцент «Проєктів»), прогрес — lavender fill. */}
        <Card tint="lavender" glow="lavender" style={{ marginBottom: space.cardGapCompact }}>
          <DisplayNumber value={stats?.pct ?? 0} unit="%" size="lg" />
          <ProgressBar value={(stats?.pct ?? 0) / 100} tone="lavender" height={8} style={{ marginTop: space[4], marginBottom: space[3] }} />
          <Text style={[type.caption, type.numeric, { color: c.sub, marginBottom: counterLine ? 4 : 0 }]}>
            {stats?.done ?? 0}/{stats?.total ?? 0} {tr.projectDone}
            {project.deadline ? ` · ${tr.projectDeadline}: ${new Date(project.deadline).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}` : ''}
          </Text>
          {counterLine ? (
            <Text style={[type.caption, type.numeric, { color: c.sub }]}>{counterLine}</Text>
          ) : null}
        </Card>

        {/* Плитки статистики */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.cardGapCompact, marginBottom: 20 }}>
          {(stats?.overdue ?? 0) > 0 && (
            <StatCard label={tr.projectOverdueTasks} value={String(stats!.overdue)} color={glassOf(t).accent.coral.fill} sub={c.sub} />
          )}
          {modules.time ? (
            <StatCard
              label={tr.overviewHoursThisWeek}
              value={formatDuration(weekSeconds, { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute })}
              color={project.color}
              sub={c.sub}
            />
          ) : null}
          {sprintStats ? (
            <StatCard
              label={`${sprintStats.sprint.name} · ${sprintHint}`}
              value={`${sprintStats.done}/${sprintStats.total}`}
              // Протермінований спринт — бурштиновий, не червоний (§4).
              color={sprintStats.overdue ? glassOf(t).accent.amber.fill : project.color}
              sub={c.sub}
            />
          ) : null}
          {modules.budget && role === 'owner' && budget ? (
            <StatCard
              label={tr.overviewBudgetSpent}
              value={formatSubscriptionMoney(spent, budget.currency, currencies, locale) + ' / ' + formatSubscriptionMoney(budget.amount, budget.currency, currencies, locale)}
              color={spent > budget.amount ? glassOf(t).accent.coral.fill : project.color}
              sub={c.sub}
            />
          ) : null}
        </View>

        <ResponsiveGrid minItemWidth={340} maxColumns={2} gap={space.cardGapCompact}>
        {/* Найближчі наради */}
        {modules.meetings ? (
          <View key="meetings" style={[ds.card(t, isDark, { compact: true }), { marginBottom: space.cardGapCompact }]}>
            <Text style={[type.h2, { color: c.text, marginBottom: 12 }]}>
              {tr.overviewUpcomingMeetings}
            </Text>
            {upcomingMeetings.length === 0 ? (
              <Text style={[type.caption, { color: c.sub }]}>{tr.projectMeetingsNoUpcoming}</Text>
            ) : (
              <View style={{ gap: 8 }}>
                {upcomingMeetings.map(({ meeting, date, time }) => (
                  <TouchableOpacity
                    key={`${meeting.id}_${date}`}
                    onPress={() => router.push({ pathname: '/project/[id]/calendar', params: { id: project.id, open: meeting.id } } as never)}
                    activeOpacity={0.75}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.nested, backgroundColor: glassOf(t).surfaceSubtle, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meeting.color }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{meeting.title}</Text>
                      <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                        {new Date(`${date}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', weekday: 'short' })}{time ? ` · ${time}` : ''}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={13} color={c.sub} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : null}

        <View key="activity" style={[ds.card(t, isDark, { compact: true }), { marginBottom: space.cardGapCompact }]}>
        {/* Активність (§4.6) — останні кілька записів; повна стрічка з пагінацією — окремий екран. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[type.h2, { color: c.text, flex: 1 }]}>
            {tr.projectActivityTitle}
          </Text>
          <TouchableOpacity
            onPress={() => router.push(`/project/${encodeURIComponent(project.id)}/activity` as never)}
            style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: glassOf(t).surfaceSubtle, justifyContent: 'center' }}>
            <Text style={{ color: t.action.secondaryText, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.projectActivityShowAll}</Text>
          </TouchableOpacity>
        </View>
        {activityLoading ? null : recentActivity.length === 0 ? (
          <Text style={[type.caption, { color: c.sub }]}>{tr.projectActivityEmpty}</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {recentActivity.map(entry => (
              <View key={entry.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12, backgroundColor: glassOf(t).surfaceSubtle,
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  <IconSymbol name={activityIcon(entry)} size={11} color={c.text} />
                </View>
                <Text numberOfLines={2} style={[type.body, { flex: 1, color: c.text, fontSize: 13, lineHeight: 18 }]}>
                  {formatActivityMessage(entry, tr, activityCtx)}
                </Text>
              </View>
            ))}
          </View>
        )}
        </View>
        </ResponsiveGrid>
        <TeamWorkspace mode="overview" embedded/>
      </ScrollView>
    </ProjectScreenShell>
  );
}
