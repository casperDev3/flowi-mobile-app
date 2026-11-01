/**
 * components/projects/ProjectBacklog.tsx — «Беклог» і «Архів» простору
 * проєкту (вкладки Беклог / Ідеї / Баги; архів — завершені задачі).
 *
 * Тап по задачі відкриває ПОВНУ картку тут же, аркушем (ProjectTaskSheet), а
 * не на екрані «Завдання»: людина лишається в розділі, звідки відкрила.
 * Ідеї й баги правляться власною формою (draft-модалка) — у них свої поля.
 *
 * Кнопки — спільна композиція ActionBar/ActionChip: фільтри — чипи з
 * вибраним станом (раніше — стовпці кнопок з «✓ » у підписі), дії картки —
 * один рядок з однаковими відступами на всіх платформах.
 *
 * Архівні спринти (`archivedAt`) не пропонуються ні у фільтрі, ні в «Перенести
 * у спринт» і не дають власної групи — їхні задачі лишаються видимими в групі
 * «Без спринта», щоб не зникнути з очей.
 *
 * Layout System v2.4: список — головна зона, повна картка задачі — динамічна
 * (`useProjectTaskPanel`: панель праворуч з ✕ на iPad, нижній аркуш ~60% →
 * весь екран на телефоні; відкрита задача — у `?task=`). Головна зона має
 * три стани: скелет під час читання, «Повторити» при збої, порожньо з однією
 * дією. Рядки АРХІВУ свайпаються вліво: «Відновити» і «Видалити» (лише лід,
 * як у футері картки). Рядки беклогу — ні: у картці ліда стоїть
 * горизонтальна стрічка чипів «Перенести у спринт», і свайп рядка з нею
 * конфліктував би.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { ActionBar, ActionButton, ActionChip } from '@/components/shared/ActionBar';
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Layout } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProject } from '@/hooks/use-project';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRole } from '@/hooks/use-project-role';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { fetchProjectMembers } from '@/store/project-team';
import { isProjectWork } from '@/utils/projectBacklog';
import { isSprintArchived, type Sprint } from '@/utils/sprintUtils';
import { mergeTaskStatusColumns, projectColumnIdFor, type TaskStatusColumn } from '@/utils/taskStatuses';
import { completedAt, type Task } from '@/utils/taskUtils';
import { isLead, taskRights } from '@/utils/teamwork';
import { appendHistory } from '@/utils/taskHistory';
import { reopenColumnId, reopenSubtasks } from '@/utils/taskCompletion';
import { scopedColumnFor } from '@/utils/taskStatuses';
import { haptic } from '@/utils/haptics';
import { ProjectScreenShell, projectShellColors } from './ProjectScreenShell';
import { useProjectTaskPanel } from './ProjectTaskSheet';
import { TeamInput } from './TeamTaskPanel';
import { saveProjectRecord, useProjectRecords, useProjectRecordsState } from './useProjectRecords';
import { SwipeRow, ZoneEmpty, ZoneError, ZoneSkeleton, useZoneState, type SwipeAction } from '@/components/layout-zones';
import { fontFamily, radius, shadow, type } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { BentoCard, KpiCounter, MeshBackground, SectionTabs } from '@/components/ds';
import { useResponsive } from '@/hooks/use-responsive';

type Tab = 'backlog' | 'idea' | 'bug';
interface Choice { id: string; name: string }

export function ProjectBacklog({ archive = false }: { archive?: boolean }) {
  const id = useProjectRouteId() as string;
  const router = useRouter();
  const { project } = useProject(id);
  const role = useProjectRole(id);
  const { user } = useAuth();
  const { tr } = useI18n();
  const dark = useColorScheme() === 'dark';
  const { isWide } = useResponsive();
  const c = projectShellColors(dark, project?.color ?? '#7C3AED', project?.appearance);
  const tk = dsTokens(dark);

  const { rows: allTasks, status: tasksStatus, retry: retryTasks } = useProjectRecordsState<Task>('tasks');
  const allSprints = useProjectRecords<Sprint>('sprints');
  const allColumns = useProjectRecords<TaskStatusColumn>('task_statuses');
  const tasks = useMemo(() => allTasks.filter(t => t.projectId === id), [allTasks, id]);
  // Усі спринти проєкту — для підпису «Спринт» на рядку (архівний теж має
  // назву); вибори/групи — лише неархівні.
  const projectSprints = useMemo(() => allSprints.filter(s => s.projectId === id), [allSprints, id]);
  const sprints = useMemo(() => projectSprints.filter(s => !isSprintArchived(s)), [projectSprints]);
  const columns = useMemo(() => mergeTaskStatusColumns(allColumns, id), [allColumns, id]);
  const members = useProjectMembers(id);
  useEffect(() => { void fetchProjectMembers(id).catch(() => {}); }, [id]);

  const [tab, setTab] = useState<Tab>('backlog');
  const [search, setSearch] = useState('');
  const [sprint, setSprint] = useState('all');
  const [mine, setMine] = useState(false);
  const [person, setPerson] = useState('all');
  const [priority, setPriority] = useState('all');
  const [sort, setSort] = useState('newest');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<Partial<Task> | null>(null);
  const [busy, setBusy] = useState(false);
  // Відкрита задача — у параметрі `?task=` (Layout System v2.4).
  const zoneState = useZoneState({ section: archive ? 'project-archive' : 'project-backlog', selectedParam: 'task' });
  const openTaskId = zoneState.selectedId;
  const setOpenTaskId = zoneState.select;
  const panel = useProjectTaskPanel({ projectId: id, taskId: openTaskId, onClose: () => setOpenTaskId(null), isDark: dark });
  const userId = String(user?.id ?? '');

  /** Свайп рядка архіву: «Відновити» (як «Відновити» у футері картки) і «Видалити» (лід). */
  const restoreTask = (t: Task) => {
    if (!taskRights(t, role, userId).execute) return;
    const fallback = scopedColumnFor(panel.host.columns, id, 'todo')?.id ?? t.kanbanColumnId;
    void panel.host.write(t.id, cur => ({
      ...cur,
      status: 'active',
      kanbanColumnId: reopenColumnId(cur, panel.host.boardColumns, fallback),
      subtasks: reopenSubtasks(cur),
      history: appendHistory(cur, 'active'),
    })).then(() => haptic.light());
  };
  const archiveSwipe = (t: Task): SwipeAction[] => {
    const canRun = taskRights(t, role, userId).execute;
    return [
      ...(canRun ? [{ key: 'restore', label: tr.restore, icon: 'arrow.uturn.backward' as const, onPress: () => restoreTask(t) }] : []),
      ...(canRun && isLead(role)
        ? [{ key: 'delete', label: tr.delete, icon: 'trash.fill' as const, tone: 'danger' as const, onPress: () => panel.host.deleteTask(t, () => { if (openTaskId === t.id) setOpenTaskId(null); }) }]
        : []),
    ];
  };

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }

  const completedKey = (t: Task) => {
    const d = completedAt(t);
    return d && Number.isFinite(d.getTime())
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : '';
  };
  const knownSprint = (t: Task) => !!t.sprintId && sprints.some(s => s.id === t.sprintId);

  const filtered = tasks.filter(t =>
    (archive ? t.status === 'done' && !t.backlogKind : tab === 'backlog' ? !isProjectWork(t, columns) && !t.backlogKind : t.backlogKind === tab)
    && t.title.toLowerCase().includes(search.toLowerCase())
    && (!mine || t.assigneeId === String(user?.id))
    && (sprint === 'all' || (sprint === 'none' ? !knownSprint(t) : t.sprintId === sprint))
    && (person === 'all' || (person === 'none' ? !t.assigneeId : t.assigneeId === person))
    && (priority === 'all' || String(t.priorityLevel ?? 'none') === priority)
    && (!archive || ((!from || Boolean(completedKey(t) && completedKey(t) >= from)) && (!to || Boolean(completedKey(t) && completedKey(t) <= to)))),
  ).sort((a, b) => (sort === 'name' ? a.title.localeCompare(b.title)
    : sort === 'priority' ? (a.priorityLevel ?? 6) - (b.priorityLevel ?? 6)
      : sort === 'oldest' ? completedKey(a).localeCompare(completedKey(b))
        : completedKey(b).localeCompare(completedKey(a))));

  const groups = archive || tab !== 'backlog'
    ? [{ id: 'all', name: archive ? tr.projectArchive : tab === 'idea' ? tr.pbIdeas : tr.pbBugs, tasks: filtered }]
    : [
      { id: 'none', name: tr.pbNoSprint, tasks: filtered.filter(t => !knownSprint(t)) },
      ...sprints.map(s => ({ id: s.id, name: s.name, tasks: filtered.filter(t => t.sprintId === s.id) })),
    ];

  const filtersActive = !!search || mine || sprint !== 'all' || person !== 'all' || priority !== 'all' || !!from || !!to;
  const resetFilters = () => {
    setSearch(''); setMine(false); setSprint('all'); setPerson('all'); setPriority('all'); setFrom(''); setTo('');
  };

  /** Рядок чипів-фільтрів: підпис зверху, чипи — горизонтальною стрічкою. */
  const choices = (label: string, value: string, onChange: (v: string) => void, options: Choice[]) => (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {options.map(o => <ActionChip key={o.id} label={o.name} selected={value === o.id} onPress={() => onChange(o.id)} colors={c} />)}
      </ScrollView>
    </View>
  );

  const sprintChoices: Choice[] = [{ id: 'none', name: tr.pbNoSprint }, ...sprints.map(s => ({ id: s.id, name: s.name }))];

  const toTask = (t: Task) => ({
    ...t,
    backlogKind: undefined,
    description: [
      t.description,
      t.bugSteps && `${tr.pbStepsPrefix}: ${t.bugSteps}`,
      t.bugExpected && `${tr.pbExpectedPrefix}: ${t.bugExpected}`,
      t.bugActual && `${tr.pbActualPrefix}: ${t.bugActual}`,
    ].filter(Boolean).join('\n\n'),
  });

  const sectionLabel = tab === 'idea' ? tr.pbIdeas : tab === 'bug' ? tr.pbBugs : tr.projectBacklogNav;
  const newLabel = tab === 'idea' ? tr.pbNewIdea : tab === 'bug' ? tr.pbNewBug : tr.newTask;
  const onNew = () => (tab === 'backlog'
    // Нова задача — швидке створення «Завдань» ПРОЄКТУ (у просторі проєкту).
    ? router.push({ pathname: '/project/[id]/tasks', params: { id, create: '1' } } as never)
    : setDraft({ backlogKind: tab, title: '', description: '', bugSeverity: 'normal' }));

  const renderCard = (t: Task) => {
    const lead = !archive && isLead(role);
    const sprintName = t.sprintId ? projectSprints.find(s => s.id === t.sprintId)?.name : undefined;
    const swipe = archive ? archiveSwipe(t) : [];
    return (
      <SwipeRow key={t.id} actions={swipe} radius={radius.card} testID={`backlog-row-${t.id}`}>
        {a11y => (
      // Omni: суцільна картка задачі (surface.card + м'яка тінь).
      <View style={[{ flex: 1, backgroundColor: tk.surface.card, borderRadius: radius.card, padding: 16, gap: 10 }, shadow[dark ? 'dark' : 'light'].card, openTaskId === t.id ? { borderWidth: 2, borderColor: tk.action.primary } : null]}>
        <Pressable
          onPress={() => (t.backlogKind ? setDraft(t) : setOpenTaskId(t.id))}
          accessibilityRole="button"
          accessibilityLabel={t.title}
          accessibilityState={{ selected: openTaskId === t.id }}
          accessibilityActions={swipe.length ? a11y.accessibilityActions : undefined}
          onAccessibilityAction={swipe.length ? a11y.onAccessibilityAction : undefined}
          style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
          <IconSymbol
            name={t.backlogKind === 'bug' ? 'exclamationmark.circle' : t.backlogKind === 'idea' ? 'lightbulb.fill' : t.status === 'done' ? 'checkmark.circle' : 'circle'}
            size={16}
            color={t.backlogKind === 'bug' ? tk.accent.coral : t.status === 'done' ? tk.status.success : c.sub}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{t.title}</Text>
            {sprintName ? <Text numberOfLines={1} style={[type.caption, { color: c.sub }]}>{sprintName}</Text> : null}
          </View>
          <IconSymbol name="chevron.right" size={12} color={c.sub} />
        </Pressable>
        {lead ? (
          <>
            {choices(tr.pbMoveToSprint, knownSprint(t) ? t.sprintId! : 'none',
              v => void run(() => saveProjectRecord('tasks', { ...t, sprintId: v === 'none' ? undefined : v })), sprintChoices)}
            <ActionBar align="end">
              <ActionButton
                disabled={busy}
                icon={t.backlogKind ? 'checklist' : 'play.fill'}
                label={t.backlogKind ? tr.pbToTask : tr.pbStartWork}
                onPress={() => void run(() => saveProjectRecord('tasks', t.backlogKind
                  ? toTask(t)
                  : { ...t, status: 'active', kanbanColumnId: projectColumnIdFor('status-in-progress', columns, id) }))}
                colors={c}
              />
            </ActionBar>
          </>
        ) : null}
      </View>
        )}
      </SwipeRow>
    );
  };

  const severity: Choice[] = [
    { id: 'low', name: tr.pbSeverityLow }, { id: 'normal', name: tr.pbSeverityNormal },
    { id: 'high', name: tr.pbSeverityHigh }, { id: 'critical', name: tr.pbSeverityCritical },
  ];
  const bugFields = [
    { key: 'bugSteps' as const, label: tr.pbBugSteps },
    { key: 'bugExpected' as const, label: tr.pbBugExpected },
    { key: 'bugActual' as const, label: tr.pbBugActual },
  ];

  return (
    <ProjectScreenShell
      project={project}
      isDark={dark}
      title={archive ? tr.projectArchive : tr.projectBacklogNav}
      // Omni KPI: скільки записів показано в поточному зрізі.
      kpis={<KpiCounter value={filtered.length} label={archive ? tr.projectArchive : sectionLabel} />}
      // Omni: розділ беклогу — pill-вкладки (той самий стан `tab`, що й
      // колишній рядок чипів «Розділ»: зміна скидає фільтри так само).
      tabs={!archive ? (
        <SectionTabs
          tabs={[
            { key: 'backlog', label: tr.projectBacklogNav, icon: 'tray' },
            { key: 'idea', label: tr.pbIdeas, icon: 'lightbulb.fill' },
            { key: 'bug', label: tr.pbBugs, icon: 'exclamationmark.circle' },
          ]}
          value={tab}
          onChange={v => { setTab(v as Tab); setSprint('all'); setPerson('all'); setPriority('all'); }}
          accessibilityLabel={tr.pbSection}
          bleed={isWide ? 0 : 20}
        />
      ) : undefined}
      zone={panel.zone}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14, width: '100%', maxWidth: Layout.wideMaxWidth, alignSelf: 'center' }}>
        {/* Omni: пошук і фільтри — одна суцільна картка над списком. */}
        <BentoCard compact style={{ gap: 12 }}>
        <TeamInput label={tr.pbSearch} value={search} onChange={setSearch} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <ActionChip icon="person.fill" label={tr.pbAssignedToMe} selected={mine} onPress={() => setMine(!mine)} colors={c} />
        </View>
        {choices(tr.pbSprint, sprint, setSprint, [{ id: 'all', name: tr.pbAllSprints }, ...sprintChoices])}
        {choices(tr.pbAssignee, person, setPerson, [
          { id: 'all', name: tr.pbAll }, { id: 'none', name: tr.pbUnassigned },
          ...members.map(m => ({ id: String(m.user.id), name: m.user.name || m.user.email })),
        ])}
        {choices(tr.pbPriority, priority, setPriority, [
          { id: 'all', name: tr.pbAll },
          ...Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `P${i}` })),
          { id: 'none', name: tr.pbNoPriority },
        ])}
        {archive && <>
          {choices(tr.pbSort, sort, setSort, [
            { id: 'newest', name: tr.pbNewest }, { id: 'oldest', name: tr.pbOldest },
            { id: 'name', name: tr.pbName }, { id: 'priority', name: tr.pbPriority },
          ])}
          <TeamInput label={tr.pbDoneFrom} value={from} onChange={setFrom} />
          <TeamInput label={tr.pbDoneTo} value={to} onChange={setTo} />
        </>}
        {/* Дії списку — один рядок: другорядна ліворуч, створення праворуч. */}
        <ActionBar align="end">
          {filtersActive ? <ActionButton label={tr.pbResetFilters} icon="xmark" tone="neutral" onPress={resetFilters} colors={c} /> : null}
          {!archive && role !== 'viewer' && (tasksStatus !== 'ready' || filtered.length > 0) ? <ActionButton label={newLabel} icon="plus" tone="primary" onPress={onNew} colors={c} /> : null}
        </ActionBar>
        </BentoCard>
        {!!error && <Text accessibilityRole="alert" style={{ color: tk.status.danger, fontFamily: fontFamily.medium }}>{error}</Text>}
        {/* Стани головної зони (Layout System v2.4): скелет, помилка з
            «Повторити», порожньо з однією дією. Фільтри вище лишаються робочими. */}
        {tasksStatus === 'loading' ? <ZoneSkeleton variant="list" rows={4} /> : null}
        {tasksStatus === 'error' ? <ZoneError testID="backlog-error" onRetry={retryTasks} /> : null}
        {tasksStatus === 'ready' && groups.filter(g => g.tasks.length).map(g => (
          <View key={g.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text accessibilityRole="header" accessibilityLabel={`${g.name} · ${g.tasks.length}`} style={[type.h2, { color: c.text }]}>{g.name}</Text>
              <View style={{ minWidth: 24, height: 22, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: tk.surface.card }}>
                <Text style={[type.caption, type.numeric, { color: c.sub, fontFamily: fontFamily.semibold }]}>{g.tasks.length}</Text>
              </View>
            </View>
            <ResponsiveGrid minItemWidth={320} maxColumns={3} gap={12}>{g.tasks.map(renderCard)}</ResponsiveGrid>
          </View>
        ))}
        {tasksStatus === 'ready' && !filtered.length && (
          <ZoneEmpty
            testID="backlog-empty"
            icon={archive ? 'archivebox' : tab === 'idea' ? 'lightbulb.fill' : tab === 'bug' ? 'exclamationmark.circle' : 'tray'}
            title={tr.pbEmpty}
            // Одна головна дія: скинути фільтри, якщо вони звузили список;
            // інакше — створити запис (не в архіві й не для глядача).
            actionLabel={filtersActive ? tr.pbResetFilters : !archive && role !== 'viewer' ? newLabel : undefined}
            onAction={filtersActive ? resetFilters : !archive && role !== 'viewer' ? onNew : undefined}
          />
        )}
      </ScrollView>

      <Modal visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}>
        {/* DS v2.1: повноекранна форма — на mesh, як і екрани. */}
        <View style={{ flex: 1, backgroundColor: c.bg1 }}>
        <MeshBackground />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 24, paddingTop: 60, paddingBottom: 80, gap: 12, width: '100%', maxWidth: Layout.readingMaxWidth, alignSelf: 'center' }}>
          {draft && <>
            <Text accessibilityRole="header" style={[type.h1, { color: c.text, fontSize: 28 }]}>{draft.backlogKind === 'bug' ? tr.pbBug : tr.pbIdea}</Text>
            <TeamInput label={draft.backlogKind === 'bug' ? tr.pbBugTitle : tr.pbIdeaTitle} value={draft.title ?? ''} onChange={v => setDraft({ ...draft, title: v })} />
            <TeamInput label={draft.backlogKind === 'bug' ? tr.pbBugBody : tr.pbIdeaBody} value={draft.description ?? ''} onChange={v => setDraft({ ...draft, description: v })} multiline />
            {draft.backlogKind === 'bug' && <>
              {bugFields.map(f => <TeamInput key={f.key} label={f.label} value={draft[f.key] ?? ''} onChange={v => setDraft({ ...draft, [f.key]: v })} multiline />)}
              {choices(tr.pbSeverity, draft.bugSeverity ?? 'normal', v => setDraft({ ...draft, bugSeverity: v as Task['bugSeverity'] }), severity)}
            </>}
            {/* Та сама композиція, що й у футері картки: закрити ліворуч, зберегти праворуч. */}
            <ActionBar align="stretch" wrap={false} style={{ marginTop: 8 }}>
              <ActionButton label={tr.close} tone="neutral" grow={1} onPress={() => setDraft(null)} colors={c} />
              {role !== 'viewer' && (!draft.id || isLead(role)) ? (
                <ActionButton
                  label={tr.save}
                  tone="primary"
                  grow={2}
                  disabled={busy || !draft.title?.trim()}
                  onPress={() => void run(async () => {
                    await saveProjectRecord('tasks', {
                      id: `draft-${Date.now()}`, createdAt: new Date().toISOString(), createdBy: String(user?.id),
                      projectId: id, status: 'active', subtasks: [], ...draft, title: draft.title!.trim(),
                    } as Task);
                    setDraft(null);
                  })}
                  colors={c}
                />
              ) : null}
            </ActionBar>
          </>}
        </ScrollView>
        </View>
      </Modal>
      {panel.undoElement}
    </ProjectScreenShell>
  );
}
