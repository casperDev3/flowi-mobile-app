/**
 * app/project/[id]/settings.tsx — Налаштування проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: «Налаштування (назва/колір/опис, увімкнені
 * розділи, workflow статусів із типами, шаблон при створенні)»).
 *
 * Шаблон вибирається ОДИН РАЗ при створенні (app/projects.tsx) — тут лише
 * позначка, яким він був: «Робочий»/«Простий» задає СТАРТОВИЙ набір
 * `modules`, а не живий перемикач.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import { haptic } from '@/utils/haptics';
import { PROJECT_COLORS } from '@/utils/projectColors';
import { MODULES_BY_TEMPLATE, projectModules, type ProjectModules } from '@/utils/projectUtils';
import type { Task } from '@/utils/taskUtils';
import type { Project } from '@/app/projects';
import {
  applyColumnDoneChangeToTasks, mergeTaskStatusColumns, newProjectStatusId, seedProjectStatusColumns,
  type StatusType, type TaskStatusColumn,
} from '@/utils/taskStatuses';

/** Дебаунс запису назви статусу (мс) — див. коментар над `changeStatusName`. */
const STATUS_NAME_COMMIT_DELAY = 500;

const STATUS_TYPE_CYCLE: StatusType[] = ['todo', 'in_progress', 'done'];
const STATUS_COLORS = ['#6366F1', '#F59E0B', '#0EA5E9', '#10B981', '#EF4444', '#8B5CF6', '#64748B'];

const MODULE_ROWS: { key: keyof ProjectModules; icon: 'calendar' | 'note.text' | 'timer' | 'chart.pie.fill' | 'flag.checkered'; labelKey: 'navMeetings' | 'notes' | 'navTime' | 'navBudget' | 'sprints' }[] = [
  { key: 'meetings', icon: 'calendar', labelKey: 'navMeetings' },
  { key: 'notes', icon: 'note.text', labelKey: 'notes' },
  { key: 'time', icon: 'timer', labelKey: 'navTime' },
  { key: 'budget', icon: 'chart.pie.fill', labelKey: 'navBudget' },
  { key: 'sprints', icon: 'flag.checkered', labelKey: 'sprints' },
];

export default function ProjectSettingsScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr } = useI18n();
  const { project } = useProject(projectId);
  const role = useProjectRole(projectId);
  const { stopTimerForTask } = useTimerContext();
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [dirty, setDirty] = useState(false);
  const [columns, setColumns] = useState<TaskStatusColumn[]>([]);
  const [personalColumns, setPersonalColumns] = useState<TaskStatusColumn[]>([]);

  const loadColumns = useCallback(async () => {
    const all = await loadData<TaskStatusColumn[]>('task_statuses', []);
    setColumns(all);
    setPersonalColumns(mergeTaskStatusColumns(all));
  }, []);
  useFocusEffect(useCallback(() => { void loadColumns(); }, [loadColumns]));
  const trackColumnsWrite = useStorageRefresh(['task_statuses'], loadColumns);

  // Форма підвантажується з проєкту ОДИН раз (не при кожному зовнішньому
  // оновленні) — інакше набір символів у полі відкочувався б власним же
  // записом, що ще їде в чергу useStorageRefresh.
  const loadedIdRef = React.useRef<string | null>(null);
  if (project && loadedIdRef.current !== project.id) {
    loadedIdRef.current = project.id;
    setName(project.name);
    setColor(project.color);
    setDescription(project.description ?? '');
    setDeadline(project.deadline ? project.deadline.slice(0, 10) : '');
    setDirty(false);
  }

  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  const isOwner = role === 'owner';
  const scopedColumns = useMemo(
    () => (projectId ? mergeTaskStatusColumns(columns, projectId).sort((a, b) => a.position - b.position) : []),
    [columns, projectId],
  );

  const saveInfo = useCallback(async () => {
    if (!projectId || !name.trim()) return;
    const parsed = deadline.trim() ? new Date(deadline.trim()) : null;
    const deadlineIso = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
    try {
      await updateSynced<Project>('projects', fresh => fresh.map(p => (p.id !== projectId ? p : {
        ...p, name: name.trim(), color, description: description.trim() || undefined, deadline: deadlineIso,
      })));
      setDirty(false);
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] запис не вдався:', e);
    }
  }, [projectId, name, color, description, deadline]);

  const toggleModule = useCallback(async (key: keyof ProjectModules) => {
    if (!projectId) return;
    try {
      await updateSynced<Project>('projects', fresh => fresh.map(p => {
        if (p.id !== projectId) return p;
        const current = projectModules(p);
        return { ...p, modules: { ...current, [key]: !current[key] } };
      }));
      haptic.light();
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] перемикач розділу не вдався:', e);
    }
  }, [projectId]);

  const seedStatuses = useCallback(async () => {
    if (!projectId) return;
    try {
      await trackColumnsWrite(async () => {
        const seeded = seedProjectStatusColumns(personalColumns, projectId);
        const next = await updateSynced<TaskStatusColumn>('task_statuses', fresh => [...fresh, ...seeded]);
        setColumns(next);
      });
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] копіювання статусів не вдалося:', e);
    }
  }, [projectId, personalColumns, trackColumnsWrite]);

  const addStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      await trackColumnsWrite(async () => {
        const nextPosition = scopedColumns.length ? Math.max(...scopedColumns.map(col => col.position)) + 1 : 0;
        const created: TaskStatusColumn = {
          id: newProjectStatusId(), name: tr.projectStatusNew, color: STATUS_COLORS[scopedColumns.length % STATUS_COLORS.length],
          position: nextPosition, isDone: false, type: 'todo', projectId,
        };
        const next = await updateSynced<TaskStatusColumn>('task_statuses', fresh => [...fresh, created]);
        setColumns(next);
      });
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] додавання статусу не вдалося:', e);
    }
  }, [projectId, scopedColumns, trackColumnsWrite, tr]);

  const updateStatus = useCallback(async (id: string, patch: Partial<TaskStatusColumn>) => {
    try {
      await trackColumnsWrite(async () => {
        const next = await updateSynced<TaskStatusColumn>('task_statuses', fresh => fresh.map(col => (col.id === id ? { ...col, ...patch } : col)));
        setColumns(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] правка статусу не вдалася:', e);
    }
  }, [trackColumnsWrite]);

  /**
   * Мінор із ревʼю: `TextInput` назви статусу був контрольований напряму
   * значенням зі стану `columns`, а `onChangeText` викликав `updateStatus`
   * (асинхронний запис + чергу outbox + дебаунсений проєктний синк) НА КОЖНЕ
   * натискання. Швидкий набір випереджав раунд-тріп запису — застаріле
   * значення з попереднього виклику (`setColumns(next)`) перезаписувало щойно
   * введені символи, вони губились чи відкочувались.
   *
   * Тут — локальний драфт на колонку (миттєвий, синхронний рендер, символи не
   * губляться) і ОДИН дебаунсений запис по паузі в наборі, а не по кожній
   * клавіші. Драфт для колонки прибирається лише коли ЩОЙНО закомічене
   * значення досі актуальне (`prev[id] !== value` — новіший драфт устиг
   * прийти, поки писали) — інакше короткий стрибок назад до `col.name` між
   * комітом і приходом свіжого `columns` був би тим самим глюком.
   */
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});
  const nameCommitTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => { for (const t of Object.values(nameCommitTimers.current)) clearTimeout(t); }, []);

  const changeStatusName = useCallback((id: string, value: string) => {
    setNameDrafts(prev => ({ ...prev, [id]: value }));
    const timers = nameCommitTimers.current;
    if (timers[id]) clearTimeout(timers[id]);
    timers[id] = setTimeout(() => {
      delete timers[id];
      void updateStatus(id, { name: value }).finally(() => {
        setNameDrafts(prev => {
          if (prev[id] !== value) return prev;
          const { [id]: _committed, ...rest } = prev;
          return rest;
        });
      });
    }, STATUS_NAME_COMMIT_DELAY);
  }, [updateStatus]);

  /**
   * Мінор із ревʼю: перемикання типу колонки міняло `isDone`, але задачі, що
   * вже стоять у ЦІЙ колонці (`kanbanColumnId === col.id`), лишались зі
   * СТАРИМ `task.status` — «Готово» на дошці показувала активні задачі (і
   * навпаки), доки хтось не перенесе кожну вручну. Дзеркалимо ту саму пару
   * полів, що й `moveToColumn`/швидка відмітка в `app/project/[id]/tasks.tsx`,
   * і зупиняємо таймер задач, що щойно стали «готово» (той самий побічний
   * ефект, що й там).
   */
  const cycleType = useCallback((col: TaskStatusColumn) => {
    const idx = STATUS_TYPE_CYCLE.indexOf(col.type ?? 'todo');
    const nextType = STATUS_TYPE_CYCLE[(idx + 1) % STATUS_TYPE_CYCLE.length];
    const nextIsDone = nextType === 'done';
    void (async () => {
      await updateStatus(col.id, { type: nextType, isDone: nextIsDone });
      if (nextIsDone === Boolean(col.isDone)) return; // isDone не змінився — задачам нічого підправляти
      let becameDoneIds: string[] = [];
      try {
        await updateSynced<Task>('tasks', fresh => {
          const result = applyColumnDoneChangeToTasks(fresh, col.id, nextIsDone);
          becameDoneIds = result.becameDoneIds;
          return result.tasks;
        });
      } catch (e) {
        if (__DEV__) console.warn('[project/settings] оновлення задач колонки не вдалося:', e);
        return;
      }
      for (const id of becameDoneIds) await stopTimerForTask(id);
    })();
  }, [updateStatus, stopTimerForTask]);

  const move = (col: TaskStatusColumn, dir: -1 | 1) => {
    const ordered = [...scopedColumns];
    const idx = ordered.findIndex(x => x.id === col.id);
    const swapWith = ordered[idx + dir];
    if (!swapWith) return;
    void updateStatus(col.id, { position: swapWith.position });
    void updateStatus(swapWith.id, { position: col.position });
  };

  const removeStatus = useCallback(async (id: string) => {
    if (scopedColumns.length <= 1) return;
    try {
      await trackColumnsWrite(async () => {
        const next = await updateSynced<TaskStatusColumn>('task_statuses', fresh => fresh.filter(col => col.id !== id));
        setColumns(next);
      });
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] видалення статусу не вдалося:', e);
    }
  }, [scopedColumns.length, trackColumnsWrite]);

  const typeLabel = (t: StatusType) => (t === 'todo' ? tr.statusTypeTodo : t === 'in_progress' ? tr.statusTypeInProgress : tr.statusTypeDone);

  return (
    <ProjectScreenShell project={project} isDark={isDark} title={tr.tabOptions}>
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>

        {/* Назва/колір/опис/термін */}
        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{tr.projectSettingsInfo}</Text>
        <TextInput
          value={name}
          onChangeText={v => { setName(v); setDirty(true); }}
          editable={isOwner}
          placeholder={tr.projectNamePlaceholder}
          placeholderTextColor={c.sub}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 10 }}
        />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {PROJECT_COLORS.map(clr => (
            <TouchableOpacity
              key={clr}
              disabled={!isOwner}
              onPress={() => { setColor(clr); setDirty(true); }}
              style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: clr, borderWidth: clr === color ? 3 : 0, borderColor: c.text }}
            />
          ))}
        </View>
        <TextInput
          value={description}
          onChangeText={v => { setDescription(v); setDirty(true); }}
          editable={isOwner}
          placeholder={tr.projectDescriptionPlaceholder}
          placeholderTextColor={c.sub}
          multiline
          style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 13, minHeight: 60, marginBottom: 10 }}
        />
        <TextInput
          value={deadline}
          onChangeText={v => { setDeadline(v); setDirty(true); }}
          editable={isOwner}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.sub}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 13, marginBottom: 12 }}
        />
        {isOwner && dirty ? (
          <TouchableOpacity onPress={saveInfo} disabled={!name.trim()} style={{ backgroundColor: c.accent, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
          </TouchableOpacity>
        ) : <View style={{ marginBottom: 12 }} />}

        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>
          {tr.projectTemplateLabel}: {project?.template === 'simple' ? tr.projectTemplateSimple : tr.projectTemplateWork}
        </Text>

        {/* Команда (WORKSPACE_PROJECTS_PLAN.md §4) — видно всім ролям: власник
            керує складом, учасник/глядач бачать команду й можуть вийти. */}
        {projectId ? (
          <TouchableOpacity
            onPress={() => router.push(`/project/${encodeURIComponent(projectId)}/members` as never)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginTop: 4, marginBottom: 20 }}>
            <IconSymbol name="person.2.fill" size={17} color={c.accent} />
            <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{tr.projectSettingsMembersRow}</Text>
            <IconSymbol name="chevron.right" size={14} color={c.sub} />
          </TouchableOpacity>
        ) : null}

        {/* Активність (§4.6) — видно всім ролям: стрічка змін проєкту сама читається, не редагується. */}
        {projectId ? (
          <TouchableOpacity
            onPress={() => router.push(`/project/${encodeURIComponent(projectId)}/activity` as never)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginBottom: 20 }}>
            <IconSymbol name="clock.arrow.circlepath" size={17} color={c.accent} />
            <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{tr.projectActivityTitle}</Text>
            <IconSymbol name="chevron.right" size={14} color={c.sub} />
          </TouchableOpacity>
        ) : null}

        {/* Розділи */}
        {isOwner && (
          <>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginTop: 16, marginBottom: 6 }}>{tr.projectSettingsModules}</Text>
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, marginBottom: 20 }}>
              {MODULE_ROWS.map((row, i) => (
                <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderBottomWidth: i < MODULE_ROWS.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                  <IconSymbol name={row.icon} size={17} color={c.accent} />
                  <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{String(tr[row.labelKey])}</Text>
                  <Switch
                    value={modules[row.key]}
                    onValueChange={() => toggleModule(row.key)}
                    trackColor={{ false: 'rgba(128,128,128,0.3)', true: c.accent }}
                    thumbColor="#fff"
                    ios_backgroundColor="rgba(128,128,128,0.3)"
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* Workflow статусів */}
        {isOwner && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
              <Text style={{ flex: 1, color: c.sub, fontSize: 11, fontWeight: '700' }}>{tr.projectSettingsStatuses}</Text>
              <TouchableOpacity onPress={addStatus} accessibilityRole="button" accessibilityLabel={tr.projectStatusAdd}>
                <IconSymbol name="plus" size={16} color={c.accent} />
              </TouchableOpacity>
            </View>
            {scopedColumns.length === 0 ? (
              <TouchableOpacity onPress={seedStatuses} style={{ borderRadius: 12, borderWidth: 1, borderColor: c.accent, borderStyle: 'dashed', padding: 14, alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{tr.projectStatusSeed}</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginBottom: 20 }}>
                {scopedColumns.map((col, i) => (
                  <View key={col.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 10, marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                      <TouchableOpacity disabled={i === 0} onPress={() => move(col, -1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                        <IconSymbol name="chevron.up" size={13} color={i === 0 ? c.border : c.sub} />
                      </TouchableOpacity>
                      <TouchableOpacity disabled={i === scopedColumns.length - 1} onPress={() => move(col, 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                        <IconSymbol name="chevron.down" size={13} color={i === scopedColumns.length - 1 ? c.border : c.sub} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => updateStatus(col.id, { color: STATUS_COLORS[(STATUS_COLORS.indexOf(col.color) + 1 + STATUS_COLORS.length) % STATUS_COLORS.length] })}
                      style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: col.color }}
                    />
                    <TextInput
                      value={nameDrafts[col.id] ?? col.name}
                      onChangeText={v => changeStatusName(col.id, v)}
                      style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '600' }}
                    />
                    <TouchableOpacity onPress={() => cycleType(col)} style={{ borderRadius: 8, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700' }}>{typeLabel(col.type ?? 'todo')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={scopedColumns.length <= 1} onPress={() => removeStatus(col.id)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <IconSymbol name="trash" size={14} color={scopedColumns.length <= 1 ? c.border : '#EF4444'} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ProjectScreenShell>
  );
}
