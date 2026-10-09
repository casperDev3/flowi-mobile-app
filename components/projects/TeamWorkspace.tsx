/**
 * components/projects/TeamWorkspace.tsx — «Моя робота», «Огляд» (командний
 * прогрес, вбудовано в overview.tsx), «Обговорення», «Навантаження».
 *
 * Завдання тут — ті самі компактні картки, що й у списку «Завдань» проєкту
 * (TaskCompactCard), а тап відкриває ПОВНУ картку з вкладками
 * (useProjectTaskCard) — без окремої урізаної модалки. «Стежити» і
 * повʼязані обговорення живуть у самій картці (дія в шапці / вкладка
 * «Активність»).
 *
 * Шапка — патерн особистих Завдань: створення (планшет; на телефоні FAB) і
 * «⋯» (стартовий екран проєкту, усі завдання, календар). Нова задача
 * відкриває швидке створення на екрані «Завдань» проєкту — у просторі
 * проєкту, а не в особистому.
 */
import { ProjectDiscussions } from './ProjectDiscussions';
import { actualWorkload } from '@/utils/workloadActual';
import { TeamOfflineStatus } from './TeamOfflineStatus';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { syncProject } from '@/store/project-sync';
import { apiFetch } from '@/store/api';
import { ProjectScreenShell, projectShellColors } from './ProjectScreenShell';
import { ProjectSyncIndicator } from './ProjectSyncIndicator';
import { TeamButton, TeamInput } from './TeamTaskPanel';
import { ActionBar, ActionButton, ActionChip } from '@/components/shared/ActionBar';
import { useProjectTaskCard, useProjectTaskHost } from './ProjectTaskCard';
import { saveProjectRecord, useProjectRecords } from './useProjectRecords';
import { DetailPane } from '@/components/shared/DetailPane';
import { ListDetailLayout, useListDetail } from '@/components/shared/ListDetailLayout';
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
import { AddTaskFab, AddTaskHeaderButton, FAB_LIST_CLEARANCE } from '@/components/tasks/AddTaskButton';
import { TASK_CARD_SHEET_RATIO } from '@/components/tasks/card/primitives';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import type { TaskDetailTab } from '@/components/tasks/TaskDetailHeader';
import { TasksHeaderMenu, TasksMenuButton, type TasksMenuItem } from '@/components/tasks/TasksHeaderMenu';
import { Layout } from '@/constants/tokens';
import { projectRoute } from '@/constants/projectNav';
import { haptic } from '@/utils/haptics';
import { appendHistory } from '@/utils/taskHistory';
import { reopenColumnId, reopenSubtasks, withReopenInfo } from '@/utils/taskCompletion';
import { boardColumnForTask, scopedColumnFor } from '@/utils/taskStatuses';
import { assigneeDisplayName, closeSubtasksOnDone, normalizePriority, priorityLabel as priorityLevelLabel, type Task } from '@/utils/taskUtils';
import { useProjectMembers } from '@/hooks/use-project-members';
import { teamPreferencesId, isLead, isComplete, myWork, progress, taskRights, type Milestone, type TeamPreferences, type WorkloadRow } from '@/utils/teamwork';

const makeId = () => `tw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export function TeamWorkspace({ mode = 'my-work', embedded = false }: { mode?: 'my-work' | 'discussions' | 'workload' | 'overview'; embedded?: boolean }) {
  const { id: routePid, task: taskId, discussion: discussionId } = useLocalSearchParams<{ id: string; task?: string; discussion?: string }>();
  const pid = (useProjectRouteId() ?? routePid) as string;
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { isWide } = useResponsive();
  const tabBarInset = useTabBarInset();
  const [inviteSkipped, setInviteSkipped] = useState(false);
  const [showMilestones, setShowMilestones] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const { project } = useProject(pid);
  const role = useProjectRole(pid);
  const { user } = useAuth();
  const uid = String(user?.id ?? '');
  const isDark = useColorScheme() === 'dark';
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED', project?.appearance);
  const cardColors = { ...c, sheet: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)' };
  const { tr } = useI18n();

  const host = useProjectTaskHost(pid);
  const tasks = useMemo(() => host.tasks.filter(t => t.projectId === pid && !t.backlogKind), [host.tasks, pid]);
  const milestones = useProjectRecords<Milestone>('milestones').filter(t => t.projectId === pid);
  const allPrefs = useProjectRecords<TeamPreferences>('team_preferences').filter(t => t.projectId === pid);
  const prefs = allPrefs.find(p => p.userId === uid);
  const members = useProjectMembers(pid);

  const [selected, setSelected] = useState<string | null>(taskId ?? null);
  const [detailTab, setDetailTab] = useState<TaskDetailTab>('main');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loads, setLoads] = useState<WorkloadRow[]>([]);
  const [hours, setHours] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDate, setMilestoneDate] = useState('');
  const [milestoneTasks, setMilestoneTasks] = useState<string[]>([]);
  useEffect(() => setHours(prefs?.weeklyHours == null ? '' : String(prefs.weeklyHours)), [prefs?.weeklyHours]);
  const refreshLoad = useCallback(
    () => apiFetch<{ results: WorkloadRow[] }>(`/projects/${encodeURIComponent(pid)}/workload/`).then(r => setLoads(r.results)),
    [pid],
  );
  useEffect(() => { if (isLead(role)) void refreshLoad().catch(() => {}); }, [refreshLoad, role]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); void syncProject(pid); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const pref = (patch: Partial<TeamPreferences>) =>
    saveProjectRecord('team_preferences', { ...prefs, id: teamPreferencesId(pid, uid), userId: uid, projectId: pid, ...patch });

  // myWork лише фільтрує вхідний масив — елементи лишаються тими самими Task.
  const mine = myWork(tasks, uid) as unknown as Record<'assigned' | 'reviews' | 'blockers' | 'available', Task[]>;
  const counts = progress(mode === 'my-work' ? tasks.filter(t => t.assigneeId === uid) : tasks);
  const selectedTask = selected ? tasks.find(t => t.id === selected) ?? null : null;
  const canCreate = role !== 'viewer' && (mode === 'my-work' || mode === 'overview');
  const label = mode === 'discussions' ? tr.projectDiscussions : mode === 'workload' ? tr.projectWorkload : mode === 'overview' ? tr.twTeamProgress : tr.projectMyWork;

  // ─── Повна картка задачі (та сама, що в «Завданнях» проєкту) ────────────
  const listDetail = useListDetail();
  const detailScrollRef = useRef<InstanceType<typeof ScrollView> | null>(null);
  const openTask = useCallback((task: Task, tab: TaskDetailTab = 'main') => { setSelected(task.id); setDetailTab(tab); }, []);
  const card = useProjectTaskCard({
    task: selectedTask,
    projectId: pid,
    projectName: project?.name ?? '',
    projectColor: project?.color ?? c.accent,
    role,
    boardColumns: host.boardColumns,
    allColumns: host.columns,
    sprints: host.sprints,
    write: host.write,
    onDelete: task => host.deleteTask(task, () => setSelected(null)),
    onMoved: name => host.showToast(tr.taskMovedToProject.replace('{project}', name)),
    onClose: () => setSelected(null),
    wide: !embedded && listDetail.wide,
    tab: detailTab,
    onTabChange: setDetailTab,
    colors: cardColors,
    isDark,
  });

  /** Галочка в рядку — та сама логіка, що на «Завданнях» проєкту (включно з «не готово» → попередня колонка). */
  const toggleTask = useCallback((task: Task) => {
    if (!taskRights(task, role, uid).execute) return;
    if (task.reviewRequired || task.resultRequirements?.length) { openTask(task, 'team'); return; }
    const becameDone = task.status !== 'done';
    void host.write(task.id, t => {
      if (t.status !== 'done') {
        const column = scopedColumnFor(host.columns, pid, 'done');
        return closeSubtasksOnDone(t, {
          ...t, status: 'done', kanbanColumnId: column?.id ?? t.kanbanColumnId,
          history: withReopenInfo(appendHistory(t, 'done'), t),
        });
      }
      const fallback = scopedColumnFor(host.columns, pid, 'todo')?.id ?? t.kanbanColumnId;
      return {
        ...t, status: 'active',
        kanbanColumnId: reopenColumnId(t, host.boardColumns, fallback),
        subtasks: reopenSubtasks(t),
        history: appendHistory(t, 'active'),
      };
    }).then(() => {
      haptic.light();
      if (becameDone) void syncProject(pid);
    });
  }, [role, uid, openTask, host, pid]);

  const priorityA11yFor = useCallback((task: Task) => {
    const level = normalizePriority(task);
    return level === null ? '' : tr.priorityA11y.replace('{level}', priorityLevelLabel(level));
  }, [tr]);
  const projectForBadge = project ? [{ id: project.id, name: project.name, color: project.color }] : [];

  const newTask = useCallback(() => {
    router.push({ pathname: '/project/[id]/tasks', params: { id: pid, create: '1' } } as never);
  }, [router, pid]);

  const section = (name: string, items: readonly Task[]) => (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{name}</Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>{items.length}</Text>
      </View>
      {items.slice(0, 5).map(t => (
        <TaskCompactCard
          hideProject
          key={t.id}
          task={t}
          statusColumn={boardColumnForTask(t, host.boardColumns, host.columns) ?? host.boardColumns[0]}
          onPress={task => openTask(task)}
          onToggle={toggleTask}
          c={c}
          isDark={isDark}
          projects={projectForBadge}
          sprints={host.sprints}
          overdueLabel={tr.overdueSection}
          priorityLabel={priorityA11yFor(t)}
          subtasksLabel={tr.subtasks}
          assigneeLabel={assigneeDisplayName(t.assigneeId, members, user?.id, tr.taskAssigneeMe)}
          priorityPlacement="corner"
        />
      ))}
      {items.length > 5 && (
        <ActionBar align="end">
          <ActionButton label={`${tr.projectAllTasks} · ${items.length}`} icon="list.bullet" tone="neutral" onPress={() => router.push(projectRoute(pid, 'tasks') as never)} colors={c} />
        </ActionBar>
      )}
      {!items.length && <Text style={{ color: c.sub, fontSize: 13 }}>{tr.twNoTasks}</Text>}
    </View>
  );

  const homePage = prefs?.homePage ?? (isLead(role) ? 'overview' : 'my-work');
  const menuItems: TasksMenuItem[] = [
    { key: 'home-my-work', icon: 'checklist', label: tr.projectHomeMyWork, checked: homePage === 'my-work', onPress: () => void run(() => pref({ homePage: 'my-work' })) },
    { key: 'home-overview', icon: 'square.grid.2x2.fill', label: tr.projectHomeOverview, checked: homePage === 'overview', onPress: () => void run(() => pref({ homePage: 'overview' })) },
    { key: 'tasks', icon: 'list.bullet', label: tr.projectAllTasks, color: c.accent, onPress: () => router.push(projectRoute(pid, 'tasks') as never), separatorBefore: true },
    { key: 'calendar', icon: 'calendar', label: tr.calendar, color: '#6366F1', onPress: () => router.push(projectRoute(pid, 'calendar') as never) },
  ];

  const content = (
    // Вбудовано в «Огляд» — горизонтальний відступ дає сам Огляд; без цього
    // секції стояли на ≈38pt від краю замість спільних 20 (P2 аудиту 2026-10).
    // Індикатор синку тепер у шапці (actions), як на Огляді, а не порожньою
    // пілюлею на всю ширину над підсумком.
    <View style={{ gap: 18, paddingVertical: 16, paddingHorizontal: embedded ? 0 : 20 }}>
      <TeamOfflineStatus projectId={pid} />
      {embedded && canCreate && (
        // «Огляд» вбудований в інший екран без власної шапки — кнопка тут.
        <ActionBar align="end">
          <ActionButton label={tr.projectAddTask} icon="plus" tone="primary" onPress={newTask} colors={c} />
        </ActionBar>
      )}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#DB4444' }}>{error}</Text>}
      {(mode === 'my-work' || mode === 'overview') && <>
        <Text style={{ color: c.text }}>{tr.twCounts.replace('{done}', String(counts.done)).replace('{total}', String(counts.total)).replace('{pending}', String(counts.pending)).replace('{blocked}', String(counts.blocked)).replace('{overdue}', String(counts.overdue))}</Text>
        {isLead(role) && tasks.length === 0 && !inviteSkipped && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: c.text }}>{tr.twInviteHint}</Text>
            <ActionBar>
              <ActionButton label={tr.twSkipInvite} tone="neutral" onPress={() => setInviteSkipped(true)} colors={c} />
              <ActionButton label={tr.twInvite} icon="person.badge.plus" tone="primary" onPress={() => router.push(`/project/${pid}/members` as never)} colors={c} />
            </ActionBar>
          </View>
        )}
        {/* Планшет: чотири черги «моєї роботи» — сіткою 2×2, а не стрічкою на чотири екрани. */}
        <ResponsiveGrid minItemWidth={300} maxColumns={2} gap={18}>
          {section(tr.twQueueReviews, mine.reviews)}
          {section(tr.twQueueBlockers, mine.blockers)}
          {section(tr.twQueueAssigned, mine.assigned)}
          {section(tr.twQueueAvailable, mine.available)}
        </ResponsiveGrid>
        {mode === 'overview' && section(tr.twAllActive, tasks.filter(t => !isComplete(t)))}
        {mode === 'overview' && <>
          <ActionBar>
            <ActionButton
              label={`${tr.twMilestones} · ${milestones.length}`}
              icon={showMilestones ? 'chevron.down' : 'chevron.right'}
              tone="neutral"
              selected={showMilestones}
              onPress={() => setShowMilestones(!showMilestones)}
              colors={c}
            />
          </ActionBar>
          {showMilestones && <>
            {milestones.map(m => {
              const linked = tasks.filter(t => m.taskIds.includes(t.id));
              return <Text key={m.id} style={{ color: c.text }}>{m.title} · {m.deadline || tr.twNoDeadline} · {linked.filter(isComplete).length}/{linked.length}</Text>;
            })}
            {isLead(role) && <>
              <TeamInput label={tr.twMilestoneTitle} value={milestoneTitle} onChange={setMilestoneTitle} />
              <TeamInput label={tr.twMilestoneDate} value={milestoneDate} onChange={setMilestoneDate} />
              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{tr.twMilestoneTasks}</Text>
              {/* Вибір задач — чипи з вибраним станом, а не стовпець кнопок із «✓ ». */}
              <ActionBar>
                {tasks.map(t => (
                  <ActionChip key={t.id} label={t.title} selected={milestoneTasks.includes(t.id)} colors={c}
                    onPress={() => setMilestoneTasks(p => (p.includes(t.id) ? p.filter(id => id !== t.id) : [...p, t.id]))} />
                ))}
              </ActionBar>
              <TeamButton label={tr.twAddMilestone} icon="plus" tone="primary" disabled={busy || !milestoneTitle.trim()}
                onPress={() => void run(async () => {
                  await saveProjectRecord<Milestone>('milestones', { id: makeId(), projectId: pid, title: milestoneTitle, deadline: milestoneDate, taskIds: milestoneTasks });
                  setMilestoneTitle(''); setMilestoneTasks([]);
                })} />
            </>}
          </>}
        </>}
      </>}
      {mode === 'discussions' && <ProjectDiscussions projectId={pid} initialId={discussionId} />}
      {mode === 'workload' && <>
        <Text style={{ color: c.text }}>{tr.twWorkloadHint}</Text>
        <TeamInput label={tr.twMyAvailability} numeric value={hours} onChange={setHours} />
        <TeamButton label={tr.twSaveAvailability} tone="primary" onPress={() => void run(async () => {
          await pref({ weeklyHours: hours === '' ? null : Number(hours) });
          await syncProject(pid);
          if (isLead(role)) await refreshLoad();
        })} />
        <ResponsiveGrid minItemWidth={280} maxColumns={3}>
          {loads.map(w => (
            <CapacityRow key={w.userId} row={w} actual={actualWorkload(tasks, w.userId)} colors={c}
              onSave={h => void run(async () => {
                const old = allPrefs.find(p => p.userId === w.userId);
                await saveProjectRecord('team_preferences', { ...old, id: teamPreferencesId(pid, w.userId), userId: w.userId, projectId: pid, weeklyHours: h });
                await syncProject(pid);
                await refreshLoad();
              })} />
          ))}
        </ResponsiveGrid>
      </>}
    </View>
  );

  // Вбудовано («Огляд»): чужий ScrollView довкола, тож картка — модальним
  // листом (DetailPane без колонки) на будь-якій ширині.
  if (embedded) {
    return (
      <>
        {content}
        <DetailPane
          open={!!selectedTask}
          wide={false}
          onClose={() => setSelected(null)}
          isDark={isDark}
          sheetColor={cardColors.sheet}
          borderColor={c.border}
          maxHeight={height * 0.88}
          sheetHeight={Math.round(height * TASK_CARD_SHEET_RATIO)}
          scrollRef={detailScrollRef}
          header={card.header}
          footer={card.footer}>
          {card.body}
        </DetailPane>
        {host.undoElement}
      </>
    );
  }

  const taskMode = mode === 'my-work' || mode === 'overview';
  const showFab = taskMode && canCreate && !isWide;
  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={label}
      actions={taskMode ? (
        <>
          <ProjectSyncIndicator projectId={pid} accent={c.accent} subColor={c.sub} dimColor={c.dim} />
          {isWide && canCreate && <AddTaskHeaderButton label={tr.projectAddTask} onPress={newTask} color={c.accent} />}
          <TasksMenuButton onPress={() => setShowMenu(true)} label={tr.projectWorkMenu} colors={c} />
        </>
      ) : <ProjectSyncIndicator projectId={pid} accent={c.accent} subColor={c.sub} dimColor={c.dim} />}>
      <ListDetailLayout
        open={!!selectedTask}
        onClose={() => setSelected(null)}
        isDark={isDark}
        sheetColor={cardColors.sheet}
        borderColor={c.border}
        maxHeight={height * 0.88}
        sheetHeight={Math.round(height * TASK_CARD_SHEET_RATIO)}
        scrollRef={detailScrollRef}
        header={card.header}
        footer={card.footer}
        // P2: на ландшафті iPad колонка деталі була порожньою білою панеллю.
        empty={
          <View style={{ alignItems: 'center', gap: 8 }}>
            <IconSymbol name="checklist" size={28} color={c.sub} />
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{tr.detailEmptyTitle}</Text>
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>{tr.detailEmptyHint}</Text>
          </View>
        }
        list={
          <ScrollView
            contentContainerStyle={{ paddingBottom: tabBarInset + (showFab ? FAB_LIST_CLEARANCE : 40), width: '100%', maxWidth: Layout.wideMaxWidth, alignSelf: 'center' }}
            keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        }>
        {card.body}
      </ListDetailLayout>
      {showFab && !host.undoVisible && <AddTaskFab label={tr.projectAddTask} onPress={newTask} color={c.accent} bottom={tabBarInset + 20} />}
      {taskMode && <TasksHeaderMenu visible={showMenu} onClose={() => setShowMenu(false)} items={menuItems} colors={c} isDark={isDark} />}
      {host.undoElement}
    </ProjectScreenShell>
  );
}

function CapacityRow({ row: w, actual, onSave, colors }: { actual: ReturnType<typeof actualWorkload>; row: WorkloadRow; onSave: (hours: number | null) => void; colors: Pick<ReturnType<typeof projectShellColors>, 'text' | 'border'> }) {
  // Кольори — токени теми проєкту (projectShellColors), а не захардкоджені.
  const textColor = colors.text;
  const { tr } = useI18n();
  const [value, setValue] = useState(w.weeklyHours == null ? '' : String(w.weeklyHours));
  return (
    <View style={{ gap: 8, borderWidth: 1, borderColor: colors.border, padding: 12, borderRadius: 12 }}>
      <Text style={{ color: textColor, fontWeight: '700' }}>{w.name}</Text>
      <Text style={{ color: textColor }}>{tr.twActiveCount.replace('{n}', String(actual.activeCount))}</Text>
      <Text style={{ color: textColor }}>{tr.twAvgTime.replace('{avg}', actual.averageMinutes === null ? tr.noData : tr.twMinutesShort.replace('{n}', String(Math.round(actual.averageMinutes)))).replace('{n}', String(actual.sampleCount))}</Text>
      <Text style={{ color: textColor }}>{tr.twForecast.replace('{value}', actual.forecastMinutes === null ? tr.noData : tr.twHoursShort.replace('{n}', (actual.forecastMinutes / 60).toFixed(1)))}</Text>
      <TeamInput label={tr.twMemberAvailability} numeric value={value} onChange={setValue} />
      <TeamButton label={tr.twSaveMemberAvailability} onPress={() => onSave(value === '' ? null : Number(value))} />
    </View>
  );
}
