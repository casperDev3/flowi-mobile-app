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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { projectRoute } from '@/constants/projectNav';
import { useContentWidth } from '@/hooks/use-content-width';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { fetchProjectActivity, type ActivityEntry } from '@/store/project-activity';
import { loadData } from '@/store/storage';
import { useTimerContext } from '@/store/timer-context';
import type { Account } from '@/utils/accounts';
import { formatDuration } from '@/utils/durationFormat';
import type { Currency, Transaction } from '@/utils/financeUtils';
import { formatSubscriptionMoney } from '@/utils/subscriptions';
import { projectMeetingSections, type Meeting } from '@/utils/meetings';
import { activityIcon, formatActivityMessage } from '@/utils/projectActivity';
import { projectStats } from '@/utils/projectStats';
import { budgetSpentThisMonth, currentSprintStats, hoursThisWeekSeconds, type ProjectTimeEntryLike } from '@/utils/projectOverview';
import type { Sprint, SprintTaskLike } from '@/utils/sprintUtils';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

interface OverviewTask extends SprintTaskLike {
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

function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, minWidth: 130, borderRadius: 14, borderWidth: 1, borderColor: color + '30', backgroundColor: color + '12', padding: 12 }}>
      <Text style={{ color, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function ProjectOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project, loading } = useProject(id);
  const role = useProjectRole(id);
  const { activeTimers } = useTimerContext();

  const [tasks, setTasks] = useState<OverviewTask[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
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

  useEffect(() => {
    if (!project?.id) return;
    let mounted = true;
    setActivityLoading(true);
    void fetchProjectActivity(project.id, { limit: 5 })
      .then(page => { if (mounted) setRecentActivity(page.results); })
      .catch(() => {})
      .finally(() => { if (mounted) setActivityLoading(false); });
    return () => { mounted = false; };
  }, [project?.id]);

  const loadAll = useCallback(async () => {
    const [t, m, s, te, tx, acc, pb, cur] = await Promise.all([
      loadData<OverviewTask[]>('tasks', []),
      loadData<Meeting[]>('meetings', []),
      loadData<Sprint[]>('sprints', []),
      loadData<ProjectTimeEntryLike[]>('time_entries', []),
      loadData<Transaction[]>('transactions', []),
      loadData<Account[]>('accounts', []),
      loadData<ProjectBudgetRecord[]>('project_budgets', []),
      loadData<Currency[]>('finance_currencies', []),
    ]);
    setTasks(t); setMeetings(m); setSprints(s); setTimeEntries(te);
    setTransactions(tx); setAccounts(acc); setBudgets(pb); setCurrencies(cur);
  }, []);

  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  useStorageRefresh(['tasks', 'meetings', 'sprints', 'time_entries', 'transactions', 'accounts', 'project_budgets', 'finance_currencies'], loadAll);

  const onRefresh = useCallback(() => { setRefreshing(true); loadAll().finally(() => setRefreshing(false)); }, [loadAll]);

  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');
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
  const sprintStats = useMemo(
    () => (project && modules.sprints ? currentSprintStats(sprints, tasks, project.id) : null),
    [project, modules.sprints, sprints, tasks],
  );
  const weekSeconds = useMemo(
    () => (project ? hoursThisWeekSeconds(timeEntries, project.id) : 0),
    [project, timeEntries],
  );
  const budget = project ? budgets.find(b => b.id === project.id) : undefined;
  const spent = useMemo(
    () => (project && budget ? budgetSpentThisMonth(transactions, accounts, project.id, budget.currency) : 0),
    [project, budget, transactions, accounts],
  );

  if (!project) {
    return (
      <ProjectScreenShell project={null} isDark={isDark} title={tr.projectNavOverview}>
        {!loading && (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: c.sub, fontSize: 14 }}>{tr.projectNotFound}</Text>
          </View>
        )}
      </ProjectScreenShell>
    );
  }

  return (
    <ProjectScreenShell project={project} isDark={isDark} title={tr.projectNavOverview}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {project.description ? (
          <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>{project.description}</Text>
        ) : null}

        {/* Contract §4.1 — глядач читає весь проєкт, але ніде в ньому не
            редагує; без цього напису обмеження в кожному розділі виглядали б
            як прихована помилка, а не свідома роль. */}
        {role === 'viewer' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 16, alignSelf: 'flex-start' }}>
            <IconSymbol name="eye" size={13} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{tr.viewerReadOnlyNotice}</Text>
          </View>
        ) : null}

        {/* Прогрес + дедлайн */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <View style={[{ flex: 1, height: 8, borderRadius: 4, backgroundColor: c.dim, overflow: 'hidden' }]}>
            <View style={{ width: `${stats?.pct ?? 0}%`, height: 8, backgroundColor: project.color }} />
          </View>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '800' }}>{stats?.pct ?? 0}%</Text>
        </View>
        <Text style={{ color: c.sub, fontSize: 12, marginBottom: 16 }}>
          {stats?.done ?? 0}/{stats?.total ?? 0} {tr.projectDone}
          {project.deadline ? ` · ${tr.projectDeadline}: ${new Date(project.deadline).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}` : ''}
        </Text>

        {/* Плитки статистики */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {(stats?.overdue ?? 0) > 0 && (
            <StatCard label={tr.projectOverdueTasks} value={String(stats!.overdue)} color="#EF4444" sub={c.sub} />
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
              label={sprintStats.sprint.name}
              value={`${sprintStats.done}/${sprintStats.total}`}
              color={project.color}
              sub={c.sub}
            />
          ) : null}
          {modules.budget && role === 'owner' && budget ? (
            <StatCard
              label={tr.overviewBudgetSpent}
              value={formatSubscriptionMoney(spent, budget.currency, currencies, locale) + ' / ' + formatSubscriptionMoney(budget.amount, budget.currency, currencies, locale)}
              color={spent > budget.amount ? '#EF4444' : project.color}
              sub={c.sub}
            />
          ) : null}
        </View>

        {/* Найближчі наради */}
        {modules.meetings ? (
          <>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 8 }}>
              {tr.overviewUpcomingMeetings}
            </Text>
            {upcomingMeetings.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 12, opacity: 0.75, marginBottom: 20 }}>{tr.projectMeetingsNoUpcoming}</Text>
            ) : (
              <View style={{ marginBottom: 20, gap: 8 }}>
                {upcomingMeetings.map(({ meeting, date, time }) => (
                  <TouchableOpacity
                    key={`${meeting.id}_${date}`}
                    onPress={() => router.push(projectRoute(project.id, 'meetings') as never)}
                    activeOpacity={0.75}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 10 }}>
                    <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: meeting.color }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{meeting.title}</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {new Date(`${date}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', weekday: 'short' })}{time ? ` · ${time}` : ''}
                      </Text>
                    </View>
                    <IconSymbol name="chevron.right" size={13} color={c.sub} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        ) : null}

        {/* Активність (§4.6) — останні кілька записів; повна стрічка з пагінацією — окремий екран. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.4, flex: 1 }}>
            {tr.projectActivityTitle}
          </Text>
          <TouchableOpacity onPress={() => router.push(`/project/${encodeURIComponent(project.id)}/activity` as never)}>
            <Text style={{ color: project.color, fontSize: 12, fontWeight: '700' }}>{tr.projectActivityShowAll}</Text>
          </TouchableOpacity>
        </View>
        {activityLoading ? null : recentActivity.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 12, opacity: 0.75, marginBottom: 8 }}>{tr.projectActivityEmpty}</Text>
        ) : (
          <View style={{ gap: 8, marginBottom: 8 }}>
            {recentActivity.map(entry => (
              <View key={entry.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11, backgroundColor: project.color + '1F',
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  <IconSymbol name={activityIcon(entry)} size={11} color={project.color} />
                </View>
                <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontSize: 12.5, lineHeight: 17 }}>
                  {formatActivityMessage(entry, tr)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ProjectScreenShell>
  );
}
