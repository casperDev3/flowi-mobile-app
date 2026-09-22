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
 * Екран лише для перегляду: тап відкриває ту саму деталь, що й на екрані
 * завдань (через ?open=), довгий тап — меню з копіюванням.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useProjectRoles } from '@/hooks/use-project-roles';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useAllProjectMembers } from '@/hooks/use-project-members';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useToday } from '@/hooks/use-today';
import { useTopInset } from '@/hooks/use-top-inset';
import { useAuth } from '@/store/auth';
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

interface ProjectLite {
  id: string;
  name: string;
  color: string;
}

const STORAGE_KEYS = ['tasks', 'projects', 'sprints', 'task_statuses'] as const;
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
/** Стабільне посилання для проєктів без кешу команди (соло). */
const EMPTY_MEMBERS_LIST: MemberOut[] = [];

function Separator() {
  return <View style={st.separator} />;
}

export default function TaskGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const { user } = useAuth();
  const today = useToday();
  const topInset = useTopInset();
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
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
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
  const data = group?.tasks ?? [];

  const openTask = useCallback((task: Task) => {
    router.push({ pathname: '/(tabs)', params: { open: task.id } });
  }, [router]);

  const copyTask = useCallback((task: Task) => {
    const text = taskToMarkdown(task, { projects, sprints, columns }, taskMarkdownLabels(tr));
    void copyTextToClipboard(text).then(ok => { if (ok) showToast(tr.taskCopied); });
  }, [projects, sprints, columns, tr, showToast]);

  const showTaskMenu = useCallback((task: Task) => {
    haptic.light();
    Alert.alert(task.title, undefined, [
      { text: tr.copyTask, onPress: () => copyTask(task) },
      { text: tr.cancel, style: 'cancel' },
    ]);
  }, [tr, copyTask]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<Task>) => {
    const level = normalizePriority(item);
    return (
      <TaskCompactCard
        task={item}
        statusColumn={taskStatusColumn(item, columns)}
        onPress={openTask}
        onLongPress={showTaskMenu}
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
  }, [columns, openTask, showTaskMenu, c, isDark, projects, sprints, tr.overdueSection, tr.priorityA11y, tr.subtasks, assigneeLabelFor]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <View style={[st.header, { paddingTop: topInset + 14 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tr.back}
          hitSlop={HIT}
          style={[st.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
          <IconSymbol name="chevron.left" size={18} color={c.accent} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={[st.title, { color: c.text }]}>{title}</Text>
          {group?.subtitle ? (
            <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{group.subtitle}</Text>
          ) : null}
        </View>
        {loaded ? (
          <View style={[st.countBadge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50' }]}>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{data.length}</Text>
          </View>
        ) : null}
      </View>

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
            <Text style={{ color: c.sub, fontSize: 14, marginTop: 14, fontWeight: '600' }}>{tr.groupEmpty}</Text>
          </View>
        ) : null}
      />

      {toastElement}
    </View>
  );
}

const st = StyleSheet.create({
  header:     { paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' },
  title:      { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  backBtn:    { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  countBadge: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8 },
  separator:  { height: 6 },
});
