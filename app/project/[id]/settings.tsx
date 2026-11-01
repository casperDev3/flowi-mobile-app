import {ProjectAppearanceForm} from '@/components/projects/ProjectAppearanceForm';
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
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
import { isoToLocalDateInput, localDateInputToIso } from '@/utils/dateUtils';
import { haptic } from '@/utils/haptics';
import { PROJECT_COLORS } from '@/utils/projectColors';
import { MODULES_BY_TEMPLATE, projectModules, type ProjectModules } from '@/utils/projectUtils';
import type { Task } from '@/utils/taskUtils';
import type { Project } from '@/app/projects';
import {
  applyColumnDoneChangeToTasks, mergeTaskStatusColumns, newProjectStatusId, seedProjectStatusColumns,
  type StatusType, type TaskStatusColumn,
} from '@/utils/taskStatuses';
import { fontFamily, radius, type } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { BentoCard } from '@/components/ds';

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
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED',project?.appearance);
  const tk = dsTokens(isDark);
  // DS v2: поле вводу — subtle-тло без рамки.
  const inputBase = { borderRadius: radius.control, backgroundColor: tk.surface.subtle, paddingHorizontal: 16, paddingVertical: 10, color: c.text, fontFamily: fontFamily.regular } as const;

  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [dirty, setDirty] = useState(false);
  const [columns, setColumns] = useState<TaskStatusColumn[]>([]);

  const loadColumns = useCallback(async () => {
    setColumns(await loadData<TaskStatusColumn[]>('task_statuses', []));
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
    setDeadline(isoToLocalDateInput(project.deadline));
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
    try {
      // Локальна доба поля, а не UTC-північ `new Date('YYYY-MM-DD')`; поле, що
      // збігається зі збереженою добою, лишає збережене значення як є.
      await updateSynced<Project>('projects', fresh => fresh.map(p => (p.id !== projectId ? p : {
        ...p, name: name.trim(), color, description: description.trim() || undefined,
        deadline: localDateInputToIso(deadline, p.deadline),
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

  /**
   * «Скопіювати стандартні статуси» — РІВНО ОДИН раз на проєкт.
   *
   * Кнопка малюється, коли `scopedColumns` порожній, але цей масив — знімок
   * стану екрана, а колонки проєкту тепер зʼявляються й САМІ: перше створення
   * задачі в проєкті сіє їх (`ensureProjectColumns` у
   * `app/project/[id]/tasks.tsx`), як і синк чужого пристрою. Між рендером
   * кнопки й дотиком по ній колонки цілком можуть виникнути — а старий код
   * дописував `[...fresh, ...seeded]` беззастережно, і дошка проєкту діставала
   * два комплекти «До роботи / У процесі / Готово» з різними id. Розібрати це
   * вручну неможливо: колонки виглядають однаково, а задачі розкидані по
   * обох комплектах.
   *
   * Тому рішення ухвалюється не за станом екрана, а за `fresh` — тим самим
   * масивом, що зараз лежить у сховищі, вже ВСЕРЕДИНІ `updateSynced`:
   * колонки цього проєкту є — не додаємо нічого й віддаємо `fresh` як є.
   * Джерело копіювання теж береться з `fresh` (особисті колонки могли
   * змінитись відтоді, як екран їх прочитав).
   */
  const seedStatuses = useCallback(async () => {
    if (!projectId) return;
    try {
      let seededCount = 0;
      await trackColumnsWrite(async () => {
        const next = await updateSynced<TaskStatusColumn>('task_statuses', fresh => {
          if (mergeTaskStatusColumns(fresh, projectId).length) return fresh;
          const seeded = seedProjectStatusColumns(mergeTaskStatusColumns(fresh), projectId);
          seededCount = seeded.length;
          return seeded.length ? [...fresh, ...seeded] : fresh;
        });
        setColumns(next);
      });
      // Без колонок тиша зрозуміліша за «успіх»: нічого ж не додалося.
      if (seededCount) haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/settings] копіювання статусів не вдалося:', e);
    }
  }, [projectId, trackColumnsWrite]);

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
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: дефолтний keyboardShouldPersistTaps='never' означає, що перший
        // тап по кнопці поруч із полем лише ховає клавіатуру — кнопка
        // виглядає мертвою.
        keyboardShouldPersistTaps="handled">

        {/* Назва/колір/опис/термін */}
        {project&&<ProjectAppearanceForm key={project.id} project={project} canEdit={role==='owner'} textColor={c.text}/>}
        {/* Omni: кожна група налаштувань — суцільна bento-картка з шапкою. */}
        <BentoCard title={tr.projectSettingsInfo} icon="info.circle" accent="lavender" style={{ marginBottom: 16 }}>
        <TextInput
          value={name}
          onChangeText={v => { setName(v); setDirty(true); }}
          editable={isOwner}
          placeholder={tr.projectNamePlaceholder}
          accessibilityLabel={tr.projectNamePlaceholder}
          placeholderTextColor={tk.text.muted}
          style={[inputBase, { minHeight: 44, fontSize: 15, fontFamily: fontFamily.semibold, marginBottom: 10 }]}
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
          accessibilityLabel={tr.projectDescriptionPlaceholder}
          placeholderTextColor={tk.text.muted}
          multiline
          style={[inputBase, { fontSize: 14, minHeight: 60, marginBottom: 10 }]}
        />
        <TextInput
          value={deadline}
          onChangeText={v => { setDeadline(v); setDirty(true); }}
          editable={isOwner}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={tk.text.muted}
          style={[inputBase, { minHeight: 44, fontSize: 14, fontVariant: ['tabular-nums'], marginBottom: 12 }]}
        />
        {isOwner && dirty ? (
          <TouchableOpacity onPress={saveInfo} disabled={!name.trim()} style={{ backgroundColor: name.trim() ? tk.action.primary : tk.state.disabledBg, borderRadius: radius.pill, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ color: name.trim() ? tk.text.onAction : tk.state.disabledText, fontFamily: fontFamily.semibold, fontSize: 15 }}>{tr.save}</Text>
          </TouchableOpacity>
        ) : <View style={{ marginBottom: 4 }} />}

        <Text style={[type.caption, { color: c.sub }]}>
          {tr.projectTemplateLabel}: {project?.template === 'simple' ? tr.projectTemplateSimple : tr.projectTemplateWork}
        </Text>
        </BentoCard>

        {projectId ? <BentoCard compact style={{ marginBottom: 16, gap: 8 }}>
        {/* Команда (WORKSPACE_PROJECTS_PLAN.md §4) — видно всім ролям: власник
            керує складом, учасник/глядач бачать команду й можуть вийти. */}
        {projectId ? (
          <TouchableOpacity
            onPress={() => router.push(`/project/${encodeURIComponent(projectId)}/members` as never)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.nested, backgroundColor: tk.surface.subtle, minHeight: 52, paddingHorizontal: 16 }}>
            <IconSymbol name="person.2.fill" size={16} color={c.sub} />
            <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{tr.projectSettingsMembersRow}</Text>
            <IconSymbol name="chevron.right" size={14} color={c.sub} />
          </TouchableOpacity>
        ) : null}

        {/* Активність (§4.6) — видно всім ролям: стрічка змін проєкту сама читається, не редагується. */}
        {projectId ? (
          <TouchableOpacity
            onPress={() => router.push(`/project/${encodeURIComponent(projectId)}/activity` as never)}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.nested, backgroundColor: tk.surface.subtle, minHeight: 52, paddingHorizontal: 16 }}>
            <IconSymbol name="clock.arrow.circlepath" size={16} color={c.sub} />
            <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{tr.projectActivityTitle}</Text>
            <IconSymbol name="chevron.right" size={14} color={c.sub} />
          </TouchableOpacity>
        ) : null}
        </BentoCard> : null}

        {/* Розділи */}
        {(isOwner || role === 'manager') && (
          <>
            <BentoCard title={tr.projectSettingsModules} icon="square.grid.2x2" accent="lavender" style={{ marginBottom: 16 }}>
              {MODULE_ROWS.map((row, i) => (
                <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 48, borderBottomWidth: i < MODULE_ROWS.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: c.border }}>
                  <IconSymbol name={row.icon} size={16} color={c.sub} />
                  <Text style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{String(tr[row.labelKey])}</Text>
                  <Switch
                    value={modules[row.key]}
                    onValueChange={() => toggleModule(row.key)}
                    // A11Y-03: <Text> і <Switch> — сусідні елементи без
                    // групування, тож друга зупинка VoiceOver звучала як
                    // «увімкнено, перемикач» без назви розділу. Ім'я беремо
                    // з того самого джерела, що й видимий підпис.
                    accessibilityLabel={String(tr[row.labelKey])}
                    trackColor={{ false: tk.text.muted, true: tk.action.primary }}
                    thumbColor={modules[row.key] ? tk.text.onAction : '#FFFFFF'}
                    ios_backgroundColor={tk.text.muted}
                  />
                </View>
              ))}
            </BentoCard>
          </>
        )}

        {/* Workflow статусів */}
        {(isOwner || role === "manager") && (
          <>
            <BentoCard
              title={tr.projectSettingsStatuses}
              icon="list.bullet"
              accent="lavender"
              style={{ marginBottom: 16 }}
              headerRight={
                <TouchableOpacity
                  onPress={addStatus}
                  accessibilityRole="button"
                  accessibilityLabel={tr.projectStatusAdd}
                  hitSlop={4}
                  style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tk.surface.subtle }}>
                  <IconSymbol name="plus" size={16} color={c.text} />
                </TouchableOpacity>
              }>
            {scopedColumns.length === 0 ? (
              <TouchableOpacity onPress={seedStatuses} style={{ borderRadius: radius.pill, backgroundColor: tk.surface.subtle, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: tk.action.secondaryText, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.projectStatusSeed}</Text>
              </TouchableOpacity>
            ) : (
              <View>
                {scopedColumns.map((col, i) => (
                  <View key={col.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.nested, backgroundColor: tk.surface.subtle, padding: 12, marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity disabled={i === 0} onPress={() => move(col, -1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                        <IconSymbol name="chevron.up" size={12} color={i === 0 ? c.border : c.sub} />
                      </TouchableOpacity>
                      <TouchableOpacity disabled={i === scopedColumns.length - 1} onPress={() => move(col, 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                        <IconSymbol name="chevron.down" size={12} color={i === scopedColumns.length - 1 ? c.border : c.sub} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => updateStatus(col.id, { color: STATUS_COLORS[(STATUS_COLORS.indexOf(col.color) + 1 + STATUS_COLORS.length) % STATUS_COLORS.length] })}
                      style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: col.color }}
                    />
                    <TextInput
                      value={nameDrafts[col.id] ?? col.name}
                      onChangeText={v => changeStatusName(col.id, v)}
                      style={{ flex: 1, color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}
                    />
                    <TouchableOpacity onPress={() => cycleType(col)} style={{ borderRadius: radius.pill, backgroundColor: tk.surface.subtle, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.medium }}>{typeLabel(col.type ?? 'todo')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={scopedColumns.length <= 1}
                      onPress={() => removeStatus(col.id)}
                      accessibilityRole="button"
                      accessibilityLabel={tr.delete}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
                      <IconSymbol name="trash" size={14} color={scopedColumns.length <= 1 ? tk.state.disabledText : tk.status.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            </BentoCard>
          </>
        )}
      </ScrollView>
    </ProjectScreenShell>
  );
}
