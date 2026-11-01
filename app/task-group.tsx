/**
 * app/task-group.tsx — «Всі (N)»: повний список ОДНІЄЇ групи завдань.
 *
 * Групи на екрані завдань і в деталі проєкту показують не більше 15 завдань
 * (TASK_GROUP_LIMIT). Решту видно тут — віртуалізованим FlatList, бо саме
 * великі групи сюди й приходять.
 *
 * Екран отримує не знімок завдань, а АДРЕСУ групи й фільтри:
 *   mode=tasks   — group=<ключ секції>, filter/sort/scope/search/project/
 *                  priorities/date/month як на екрані завдань
 *                  (utils/taskListView.ts taskListQueryToParams);
 *   mode=project — projectId + group=<id спринта | BACKLOG_GROUP_KEY>.
 * І перечитує сховище сам, тими самими утилітами, що й екран-джерело: так
 * число тут збігається з «Всі (N)», а список лишається живим — синк чи
 * сусідній екран, що записав 'tasks', одразу видно й тут.
 *
 * Екран лише для перегляду: тап по особистій задачі відкриває ту саму деталь,
 * що й на екрані завдань (через ?open=), по задачі проєкту — картку проєкту
 * тут же, аркушем (ProjectTaskSheet).
 *
 * Layout System v2.4: добірка — одна головна зона й лише для перегляду, тож
 * свайпів «архів/видалити» тут немає (мутації живуть на екрані-джерелі), а
 * деталь особистої задачі — повна картка екрана Завдань (?open=), не панель
 * тут. Довгий тап — масовий вибір, як у списку Завдань: BulkActionBar
 * «N вибрано · Дії ▾ · ✕» з «Копіювати» (Markdown вибраних). Поки сховище
 * читається — скелет у формі списку.
 */
import { useInPlaceProjectTask } from '@/components/projects/ProjectTaskSheet';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useProjectRoles } from '@/hooks/use-project-roles';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { BulkActionBar, ZoneSkeleton, type BulkAction } from '@/components/layout-zones';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useAllProjectMembers } from '@/hooks/use-project-members';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useToday } from '@/hooks/use-today';
import { useAuth } from '@/store/auth';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useI18n } from '@/store/i18n';
import type { MemberOut } from '@/store/project-team';
import { loadData } from '@/store/storage';
import { copyTextToClipboard } from '@/utils/clipboard';
import { haptic } from '@/utils/haptics';
import type { Sprint } from '@/utils/sprintUtils';
import { taskMarkdownLabels, taskToMarkdown } from '@/utils/taskMarkdown';
import {
  buildTaskListView,
  findTaskListGroup,
  projectGroupTasks,
  taskListQueryFromParams,
  type GroupLabels,
} from '@/utils/taskListView';
import { mergeTaskStatusColumns, taskStatusColumn, type TaskStatusColumn } from '@/utils/taskStatuses';
import { assigneeDisplayName, normalizePriority, priorityLabel as priorityLevelLabel, type Task } from '@/utils/taskUtils';
import { fontFamily } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { KpiCounter, MeshBackground, PageHeader } from '@/components/ds';
import { glassOf, dsGlass } from '@/components/shared/dsTheme';

interface ProjectLite {
  id: string;
  name: string;
  color: string;
}

const STORAGE_KEYS = ['tasks', 'projects', 'sprints', 'task_statuses'] as const;
/** Стабільне посилання для проєктів без кешу команди (соло). */
const EMPTY_MEMBERS_LIST: MemberOut[] = [];

function Separator() {
  return <View style={st.separator} />;
}

export default function TaskGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const isDark = useColorScheme() === 'dark';
  const { openProjectTask, projectTaskSheet } = useInPlaceProjectTask(isDark);
  const { tr, lang } = useI18n();
  const { user } = useAuth();
  const today = useToday();
  const contentWidth = useContentWidth();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { show: showToast, element: toastElement } = useUndoToast(false);

  const allProjectMembers = useAllProjectMembers();
  const assigneeLabelFor = useCallback((task: Task): string | null => {
    if (!task.projectId) return null;
    const members = allProjectMembers[task.projectId] ?? EMPTY_MEMBERS_LIST;
    return assigneeDisplayName(task.assigneeId, members, user?.id, tr.taskAssigneeMe);
  }, [allProjectMembers, user?.id, tr.taskAssigneeMe]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [storedColumns, setStoredColumns] = useState<TaskStatusColumn[]>([]);
  const [loaded, setLoaded] = useState(false);
  const columns = useMemo(() => mergeTaskStatusColumns(storedColumns), [storedColumns]);

  // Палітра — та сама, що на екрані завдань: це його продовження.
  // DS v2: семантичні токени замість лілових відтінків.
  const tk = dsTokens(isDark);
  const c = useMemo(() => ({
    bg1:    dsTokens(isDark).bg.canvas,
    bg2:    dsTokens(isDark).bg.canvas,
    border: dsTokens(isDark).border.hairline,
    text:   dsTokens(isDark).text.primary,
    sub:    dsTokens(isDark).text.secondary,
    accent: dsGlass(isDark).accent.lavender.ink, // DS v2: акцент tasks
    dim:    glassOf(dsTokens(isDark)).surfaceSubtle,
  }), [isDark]);

  const load = useCallback(async () => {
    const [t, p, s, cols] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<ProjectLite[]>('projects', []),
      loadData<Sprint[]>('sprints', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
    ]);
    setTasks(Array.isArray(t) ? t : []);
    setProjects(Array.isArray(p) ? p : []);
    setSprints(Array.isArray(s) ? s : []);
    setStoredColumns(Array.isArray(cols) ? cols : []);
    setLoaded(true);
  }, []);

  const reload = useCallback(() => load().catch(e => {
    if (__DEV__) console.warn('[task-group] читання сховища не вдалося:', e);
  }), [load]);

  // Повернення з деталі (там завдання могли змінити) — перечитуємо.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  // Записи, поки екран відкритий: синк, таймер, сусідні екрани.
  useStorageRefresh(STORAGE_KEYS, reload, loaded);

  const mode = params.mode === 'project' ? 'project' : 'tasks';
  const groupKey = params.group ?? '';

  const groupLabels = useMemo<GroupLabels>(() => ({
    today: tr.today,
    yesterday: tr.yesterday,
    tomorrow: tr.tomorrow,
    withoutDeadline: tr.withoutDeadline,
    overdue: tr.overdueSection,
  }), [tr]);

  // Фільтри з маршруту — ті самі значення, що стояли на екрані-джерелі.
  // Залежність — від самих рядкових параметрів, а не від обʼєкта `params`,
  // який expo-router перестворює щорендера. Раніше це робив штучний
  // `queryKey` + eslint-disable, а від disable React Compiler переставав
  // оптимізувати весь екран (PERF-2); тепер deps чесні, а результат той
  // самий — примітиви міняються рівно тоді, коли змінився маршрут.
  const { filter: pFilter, sort: pSort, scope: pScope, search: pSearch,
    project: pProject, priorities: pPriorities, date: pDate, month: pMonth, noDeadline: pNoDeadline } = params;
  const projectRoles = useProjectRoles();
  const query = useMemo(
    // §3.7 «моє» — той самий `myUserId`, що тепер несе `listQuery` на екрані
    // завдань (app/(tabs)/index.tsx): інакше «Всі (N)» тут показувало б і
    // задачі, яких сама група на екрані-джерелі вже не рахує (мінор із ревʼю
    // про Tasks-таб, той самий спільний конвеєр `buildTaskListView`).
    () => ({
      ...taskListQueryFromParams({
        filter: pFilter, sort: pSort, scope: pScope, search: pSearch,
        project: pProject, priorities: pPriorities, date: pDate, month: pMonth, noDeadline: pNoDeadline,
      }),
      myUserId: user?.id,
      projectRoles,
    }),
    [pFilter, pSort, pScope, pSearch, pProject, pPriorities, pDate, pMonth, pNoDeadline, user?.id, projectRoles],
  );

  const group = useMemo((): { title: string; subtitle: string | null; tasks: Task[] } | null => {
    if (mode === 'project') {
      const projectId = params.projectId ?? '';
      const found = projectGroupTasks(tasks, sprints, projectId, groupKey);
      if (!found) return null;
      const project = projects.find(p => p.id === projectId);
      return {
        title: found.sprint ? found.sprint.name : tr.sprintBacklog,
        subtitle: project?.name ?? null,
        tasks: found.tasks,
      };
    }
    const view = buildTaskListView(tasks, query, columns, today, groupLabels, locale);
    const found = findTaskListGroup(view, groupKey, groupLabels);
    return found ? { title: found.label, subtitle: null, tasks: found.tasks } : null;
  }, [mode, params.projectId, tasks, sprints, projects, groupKey, query, columns, today, groupLabels, locale, tr.sprintBacklog]);

  // Поки сховище не прочитане — заголовок із маршруту, щоб шапка не блимала.
  const title = group?.title ?? params.title ?? '';
  const data = useMemo(() => group?.tasks ?? [], [group]);

  const openTask = useCallback((task: Task) => {
    if (openProjectTask(task)) return;
    router.push({ pathname: '/(tabs)', params: { open: task.id } });
  }, [router, openProjectTask]);

  const copyTask = useCallback((task: Task) => {
    const text = taskToMarkdown(task, { projects, sprints, columns }, taskMarkdownLabels(tr));
    void copyTextToClipboard(text).then(ok => { if (ok) showToast(tr.taskCopied); });
  }, [projects, sprints, columns, tr, showToast]);

  /** Масовий вибір: довгий тап по рядку, далі тапи додають/знімають. */
  const [bulkIds, setBulkIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = bulkIds.size > 0;
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);
  const toggleBulk = useCallback((task: Task) => {
    haptic.light();
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
      return next;
    });
  }, []);
  const pressTask = useCallback((task: Task) => {
    if (selectionMode) { toggleBulk(task); return; }
    openTask(task);
  }, [selectionMode, toggleBulk, openTask]);
  /** «Копіювати» для вибраних — той самий Markdown, що й для однієї задачі. */
  const copySelected = useCallback(() => {
    const picked = data.filter(task => bulkIds.has(task.id));
    clearBulk();
    if (picked.length === 1) { copyTask(picked[0]); return; }
    const labels = taskMarkdownLabels(tr);
    const text = picked.map(task => taskToMarkdown(task, { projects, sprints, columns }, labels)).join('\n\n');
    void copyTextToClipboard(text).then(ok => { if (ok) showToast(tr.taskCopied); });
  }, [data, bulkIds, clearBulk, copyTask, tr, projects, sprints, columns, showToast]);
  const bulkActions = useMemo<BulkAction[]>(() => [
    { key: 'copy', label: tr.copyTask, icon: 'doc.on.doc', onPress: copySelected, testID: 'task-group-bulk-copy' },
  ], [tr.copyTask, copySelected]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<Task>) => {
    const level = normalizePriority(item);
    return (
      <TaskCompactCard
        task={item}
        statusColumn={taskStatusColumn(item, columns)}
        onPress={pressTask}
        onLongPress={toggleBulk}
        selected={bulkIds.has(item.id)}
        selectionMode={selectionMode}
        c={c}
        isDark={isDark}
        projects={projects}
        sprints={sprints}
        overdueLabel={tr.overdueSection}
        priorityLabel={level === null ? '' : tr.priorityA11y.replace('{level}', priorityLevelLabel(level))}
        subtasksLabel={tr.subtasks}
        assigneeLabel={assigneeLabelFor(item)}
      />
    );
  }, [columns, pressTask, toggleBulk, bulkIds, selectionMode, c, isDark, projects, sprints, tr.overdueSection, tr.priorityA11y, tr.subtasks, assigneeLabelFor]);

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      {/* Екрана немає в сайдбарі — стрілка «Назад» тут не рудимент і
          лишається на планшеті, а поруч із нею шлях «Завдання → добірка».
          Підзаголовок добірки переїхав під заголовок (children хедера). */}
      <ScreenHeader
        title={title}
        color={c.text}
        titleStyle={st.title}
        paddingBottom={14}
        back={{
          onPress: () => router.back(),
          label: tr.back,
          color: c.text,
          style: { backgroundColor: glassOf(tk).surface, borderColor: 'transparent' },
        }}
        crumbs={[
          { label: tr.tabTasks, onPress: () => router.push('/(tabs)') },
          { label: title },
        ]}
        crumbColor={c.sub}>
        <View style={{ gap: 12 }}>
        {group?.subtitle ? (
          <Text numberOfLines={1} style={{ color: c.sub, fontSize: 14, fontFamily: fontFamily.regular }}>{group.subtitle}</Text>
        ) : null}
        {/* Omni: KPI добірки (колишній лаймовий бейдж у шапці): скільки
            завдань і скільки з них уже виконано. */}
        {loaded ? (
          <PageHeader
            bleed={20}
            kpis={
              <>
                <KpiCounter value={data.length} label={tr.tabTasks} />
                <KpiCounter value={data.filter(task => task.status === 'done').length} label={tr.done} />
              </>
            }
          />
        ) : null}
        </View>
      </ScreenHeader>

      <FlatList
        data={data}
        keyExtractor={task => task.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        windowSize={11}
        ListEmptyComponent={loaded ? (
          <View style={{ alignItems: 'center', paddingVertical: 72 }}>
            <IconSymbol name="checklist" size={36} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 14, marginTop: 14, fontFamily: fontFamily.semibold }}>{tr.groupEmpty}</Text>
          </View>
        ) : <ZoneSkeleton variant="list" rows={5} />}
      />

      <BulkActionBar
        testID="task-group-bulk-bar"
        count={bulkIds.size}
        actions={bulkActions}
        onClear={clearBulk}
      />

      {toastElement}
      {projectTaskSheet}
    </View>
  );
}

const st = StyleSheet.create({
  title:      { fontSize: 28, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  separator:  { height: 8 },
});
