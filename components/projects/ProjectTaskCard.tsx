/**
 * components/projects/ProjectTaskCard.tsx — картка завдання всередині простору
 * проєкту (екран «Завдання» проєкту, широке вікно).
 *
 * Раніше тап по завданню в проєкті вів на ОСОБИСТИЙ екран Завдань
 * (`/(tabs)?open=`): сайдбар перемикався на особисту навігацію, а права
 * колонка показувала завдання, якого в особистому списку (фільтр «Сьогодні»)
 * могло й не бути. Тепер картка відкривається тут же, у DetailPane поруч зі
 * списком, і людина лишається в проєкті.
 *
 * Це ТА САМА картка, що й на екрані Завдань: ті самі вкладки (Основне / Деталі
 * / Команда / Активність) і ті самі складові (TaskDetailHeader,
 * TaskCardMain/Details/Activity, TeamTaskPanel). Різниця лише в записі: тут
 * немає особистого спискового стану, тож кожна правка — одна функція
 * `write(taskId, patch)` від екрана (trackWrite + updateSynced('tasks')).
 *
 * Хук, а не компонент: DetailPane бере шапку й тіло окремо (шапка стоїть над
 * прокруткою).
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { ActionBar, ActionButton } from '@/components/shared/ActionBar';
import { CommentsSection } from '@/components/shared/CommentsSection';
import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import { TeamTaskPanel, hasTeamContext } from '@/components/projects/TeamTaskPanel';
import { saveProjectRecord, useProjectRecords } from '@/components/projects/useProjectRecords';
import { useUndoToast } from '@/components/shared/UndoToast';
import { TaskCardActivity, TaskCardDetails, TaskCardMain } from '@/components/tasks/card/TaskCardSections';
import { OptionField, ReminderSheet } from '@/components/tasks/card/fields';
import { TaskDetailHeader, TaskDetailHeaderAction, type TaskDetailTab } from '@/components/tasks/TaskDetailHeader';
import { TaskHistoryTab } from '@/components/tasks/TaskHistoryTab';
import { TaskSubtasks } from '@/components/tasks/TaskSubtasks';
import { TaskTimerButton } from '@/components/tasks/TaskTimerButton';
import { TaskTimerTab } from '@/components/tasks/TaskTimerTab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useToday } from '@/hooks/use-today';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { cancelReminder, scheduleReminder } from '@/store/notifications';
import { useTimerContext } from '@/store/timer-context';
import { copyTextToClipboard } from '@/utils/clipboard';
import { formatClock, formatDuration } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { appendHistory } from '@/utils/taskHistory';
import { applyFormSprint, retargetTaskProject, sprintFieldVisible, sprintOptionLabel, sprintOptionsForTask, type Sprint } from '@/utils/sprintUtils';
import {
  boardColumnForTask, mergeTaskStatusColumns, orderColumnsForList, personalDisplayColumn, projectEquivalentColumn,
  subtaskToggleTransition, type TaskStatusColumn,
} from '@/utils/taskStatuses';
import { reopenSubtasks, withReopenInfo } from '@/utils/taskCompletion';
import {
  closeSubtasksOnDone, createdByAfterProjectChange, isOverdue, normalizePriority, priorityFields, type SubTask, type Task,
} from '@/utils/taskUtils';
import type { ProjectLike } from '@/utils/projectUtils';
import { isLead, taskRights, teamPreferencesId, type Discussion, type TeamPreferences, type TeamRole } from '@/utils/teamwork';
import { updateSynced } from '@/store/synced-storage';

type CardTask = Task & { recurrence?: RecurrenceRule };

export interface ProjectTaskCardColors {
  text: string; sub: string; border: string; dim: string; accent: string; sheet: string;
}

export interface ProjectTaskCardOptions {
  task: Task | null;
  projectId: string;
  projectName: string;
  projectColor: string;
  role: TeamRole;
  /** Колонки дошки проєкту (статуси) і весь task_statuses — для переходів. */
  boardColumns: readonly TaskStatusColumn[];
  allColumns: readonly TaskStatusColumn[];
  sprints: readonly Sprint[];
  /** Одна точка запису: екран сам обгортає trackWrite + updateSynced. */
  write: (taskId: string, patch: (t: Task) => Task) => Promise<void>;
  /** Видалення — через екран (він знає undo і список). */
  onDelete: (task: Task) => void;
  /** Задачу перенесли в інший проєкт (картка вже закрита) — екран показує тост. */
  onMoved?: (projectName: string) => void;
  onClose: () => void;
  /** Колонка (не аркуш) — без «ручки» зверху шапки. */
  wide: boolean;
  /** Вкладка, з якою відкрити (напр. «Команда» для задачі з перевіркою). */
  tab: TaskDetailTab;
  onTabChange: (tab: TaskDetailTab) => void;
  colors: ProjectTaskCardColors;
  isDark: boolean;
}

export function useProjectTaskCard({
  task, projectId, projectName, projectColor, role, boardColumns, allColumns, sprints, write, onDelete, onMoved, onClose,
  wide, tab, onTabChange, colors: c, isDark,
}: ProjectTaskCardOptions): { header: React.ReactNode; body: React.ReactNode; footer: React.ReactNode } {
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const today = useToday();
  const router = useRouter();
  const { user } = useAuth();
  const userId = String(user?.id ?? '');
  const members = useProjectMembers(projectId);
  const { startTaskTimer, stopTimerForTask, getTimerForTask } = useTimerContext();
  const roles = useProjectRoles();
  const allProjects = useProjectRecords<ProjectLike>('projects');
  const preferences = useProjectRecords<TeamPreferences>('team_preferences');
  const discussions = useProjectRecords<Discussion>('discussions');

  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState('');
  const [newSubtask, setNewSubtask] = useState('');
  /** Підзавдання, якому зараз ставлять нагадування (аркуш ReminderSheet). */
  const [subReminderId, setSubReminderId] = useState<string | null>(null);

  const durationUnits = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const fmtDur = useCallback((s: number) => formatDuration(s, durationUnits), [durationUnits]);

  const statusOptions = useMemo(
    () => boardColumns.map(col => ({ id: col.id, label: col.name, color: col.color })),
    [boardColumns],
  );

  const rights = task ? taskRights(task, role, userId) : null;
  const canExecute = !!rights?.execute;
  const canPlan = !!rights?.plan;
  const showTeam = !!task && hasTeamContext(task, members.length);
  const effectiveTab: TaskDetailTab = tab === 'team' && !showTeam ? 'main' : tab;
  const activeTimer = task ? getTimerForTask(task.id) : undefined;
  const timerRunning = !!activeTimer;

  /** Звичайна правка поля: значення + подія історії «змінено». */
  const edit = useCallback((fields: Partial<CardTask>) => {
    if (!task || !canPlan) return;
    void write(task.id, t => ({ ...t, ...fields, history: appendHistory(t, 'edited') }));
  }, [task, canPlan, write]);

  const setColumn = useCallback((columnId: string) => {
    if (!task || !canExecute) return;
    const column = boardColumns.find(col => col.id === columnId);
    if (!column) return;
    // Перевірка/вимоги результату вирішуються у «Команді»: там видно, чого
    // бракує, а прямий перехід у «Готово» їх оминув би.
    if (column.isDone && (task.reviewRequired || task.resultRequirements?.length)) {
      onTabChange('team');
      return;
    }
    haptic.light();
    const becameDone = column.isDone && task.status !== 'done';
    const reopening = !column.isDone && task.status === 'done';
    void write(task.id, t => {
      const history = appendHistory(t, column.isDone ? 'done' : 'active', column.name);
      return closeSubtasksOnDone(t, {
        ...t,
        status: column.isDone ? 'done' : 'active',
        kanbanColumnId: column.id,
        // Зняття «готово» відкриває лише ті підзавдання, що були відкриті до
        // завершення (utils/taskCompletion.ts), а не скидає прогрес.
        ...(reopening ? { subtasks: reopenSubtasks(t) } : {}),
        history: column.isDone ? withReopenInfo(history, t) : history,
      });
    }).then(() => { if (becameDone && getTimerForTask(task.id)) void stopTimerForTask(task.id); });
  }, [task, canExecute, boardColumns, onTabChange, write, getTimerForTask, stopTimerForTask]);

  const toggleDone = useCallback(() => {
    if (!task || !canExecute) return;
    // «Не готово» — у ту колонку, з якої задачу завершили (якщо вона ще є).
    const previous = task.status === 'done' ? reopenTarget(task, boardColumns) : undefined;
    const target = task.status === 'done'
      ? previous ?? boardColumns.find(col => !col.isDone)
      : boardColumns.find(col => col.isDone);
    if (target) setColumn(target.id);
  }, [task, canExecute, boardColumns, setColumn]);

  const toggleSubtask = useCallback((subId: string) => {
    if (!task || !canExecute) return;
    const nextSubs = task.subtasks.map(s => (s.id === subId ? { ...s, done: !s.done } : s));
    const transition = subtaskToggleTransition(task, nextSubs, allColumns);
    void write(task.id, t => {
      const target = t.subtasks.find(s => s.id === subId);
      return {
        ...t,
        subtasks: t.subtasks.map(s => (s.id === subId ? { ...s, done: !s.done } : s)),
        ...(transition ?? {}),
        history: appendHistory(t, target?.done ? 'subtask_undone' : 'subtask_done', target?.title),
      };
    }).then(() => { if (transition && getTimerForTask(task.id)) void stopTimerForTask(task.id); });
  }, [task, canExecute, allColumns, write, getTimerForTask, stopTimerForTask]);

  const addSubtask = useCallback(() => {
    const title = newSubtask.trim();
    if (!task || !canExecute || !title) return;
    const sub: SubTask = { id: Date.now().toString(), title, done: false };
    setNewSubtask('');
    void write(task.id, t => ({ ...t, subtasks: [...t.subtasks, sub], history: appendHistory(t, 'subtask_add', title) }));
  }, [task, canExecute, newSubtask, write]);

  const saveSubEdit = useCallback((subId: string, text: string) => {
    setEditingSubId(null);
    if (!task || !text.trim()) return;
    void write(task.id, t => ({ ...t, subtasks: t.subtasks.map(s => (s.id === subId ? { ...s, title: text.trim() } : s)) }));
  }, [task, write]);

  const setSubtaskReminder = useCallback(async (subId: string, moment: Date) => {
    if (!task) return;
    const sub = task.subtasks.find(s => s.id === subId);
    await scheduleReminder({ type: 'subtask', taskId: task.id, subtaskId: subId, title: sub?.title ?? task.title }, moment);
    await write(task.id, t => ({ ...t, subtasks: t.subtasks.map(s => (s.id === subId ? { ...s, reminderAt: moment.toISOString() } : s)) }));
  }, [task, write]);

  const removeSubtaskReminder = useCallback(async (subId: string) => {
    if (!task) return;
    await cancelReminder(task.id, subId);
    await write(task.id, t => ({ ...t, subtasks: t.subtasks.map(s => (s.id === subId ? { ...s, reminderAt: undefined } : s)) }));
  }, [task, write]);

  /** Ті самі дії, що й в особистій картці: правка, дубль, порядок, нагадування, видалення. */
  const showSubtaskActions = useCallback((sub: SubTask) => {
    if (!task || !canExecute) return;
    const idx = task.subtasks.findIndex(s => s.id === sub.id);
    const move = (dir: -1 | 1) => void write(task.id, t => {
      const list = [...t.subtasks];
      const i = list.findIndex(s => s.id === sub.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return t;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...t, subtasks: list };
    });
    const when = sub.reminderAt
      ? new Date(sub.reminderAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;
    Alert.alert(sub.title, undefined, [
      { text: tr.editAction, onPress: () => { setEditingSubId(sub.id); setEditingSubText(sub.title); } },
      { text: tr.subtaskDuplicate, onPress: () => void write(task.id, t => {
        const i = t.subtasks.findIndex(s => s.id === sub.id);
        const copy: SubTask = { id: Date.now().toString(), title: sub.title, done: false };
        const list = [...t.subtasks];
        list.splice(i + 1, 0, copy);
        return { ...t, subtasks: list, history: appendHistory(t, 'subtask_add', copy.title) };
      }) },
      ...(idx > 0 ? [{ text: tr.subtaskMoveUp, onPress: () => move(-1) }] : []),
      ...(idx >= 0 && idx < task.subtasks.length - 1 ? [{ text: tr.subtaskMoveDown, onPress: () => move(1) }] : []),
      { text: when ? `${tr.reminderAtLabel}: ${when}` : tr.reminderDate, onPress: () => setSubReminderId(sub.id) },
      ...(sub.reminderAt ? [{ text: tr.subtaskRemoveReminder, onPress: () => { void removeSubtaskReminder(sub.id); } }] : []),
      { text: tr.delete, style: 'destructive' as const, onPress: () => void write(task.id, t => ({ ...t, subtasks: t.subtasks.filter(s => s.id !== sub.id) })) },
      { text: tr.cancel, style: 'cancel' as const },
    ]);
  }, [task, canExecute, tr, write, locale, removeSubtaskReminder]);

  // ─── Перенесення в інший проєкт (паритет з особистою карткою) ────────────
  /**
   * Куди можна перенести: живі проєкти, де я лід (owner/manager). Лише лід
   * поточного проєкту бачить вибір — виконавець не забирає задачу з проєкту.
   */
  const moveTargets = useMemo(
    () => allProjects.filter(p => !p.archivedAt && (p.id === projectId || isLead(roles[p.id] ?? 'owner'))),
    [allProjects, roles, projectId],
  );
  const canMove = isLead(role) && moveTargets.length > 1;

  const moveToProject = useCallback((targetId: string | null) => {
    if (!task || !canMove || !targetId || targetId === projectId) return;
    const targetName = allProjects.find(p => p.id === targetId)?.name ?? '';
    void write(task.id, t => {
      let next: Task = { ...retargetTaskProject(t, targetId), projectId: targetId };
      next.createdBy = createdByAfterProjectChange(next, userId);
      // Виконавця іншого проєкту в цьому може не бути — задачу бере той,
      // хто переносить (сервер інакше відхилив би запис).
      next.assigneeId = userId || next.assigneeId;
      // Колонку зводимо до нового простору «за змістом» — як особистий екран.
      const personalView = personalDisplayColumn(t, [...allColumns]);
      const column = projectEquivalentColumn(personalView, [...allColumns], targetId) ?? personalView;
      next.kanbanColumnId = column.id;
      next.status = column.isDone ? 'done' : 'active';
      next.history = appendHistory(t, 'edited', targetName);
      next = applyFormSprint(next, sprints, null);
      return next;
    }).then(() => {
      haptic.success();
      onMoved?.(targetName);
    });
    // Задача покинула цей проєкт — її картка тут більше не має сенсу.
    onClose();
  }, [task, canMove, projectId, allProjects, write, userId, allColumns, sprints, onClose, onMoved]);

  // ─── «Стежити» і обговорення (раніше — окремі кнопки модалки «Моєї роботи») ──
  const myPrefs = preferences.find(p => p.projectId === projectId && p.userId === userId);
  const watched = !!task && !!myPrefs?.watchedTaskIds?.includes(task.id);
  const toggleWatch = useCallback(() => {
    if (!task || !userId) return;
    const current = myPrefs?.watchedTaskIds ?? [];
    const next = current.includes(task.id) ? current.filter(id => id !== task.id) : [...current, task.id];
    haptic.light();
    void saveProjectRecord<TeamPreferences>('team_preferences', {
      ...myPrefs,
      id: teamPreferencesId(projectId, userId),
      projectId,
      userId,
      watchedTaskIds: next,
    }).catch(e => { if (__DEV__) console.warn('[ProjectTaskCard] «Стежити» не збереглось:', e); });
  }, [task, userId, myPrefs, projectId]);
  const linkedDiscussions = task
    ? discussions.filter(d => d.projectId === projectId && !d.archivedAt && d.taskIds?.includes(task.id))
    : [];
  const openDiscussion = useCallback((id: string) => {
    onClose();
    router.push(`/project/${encodeURIComponent(projectId)}/discussions?discussion=${encodeURIComponent(id)}` as never);
  }, [onClose, router, projectId]);

  const setReminder = useCallback(async (moment: Date) => {
    if (!task) return;
    await scheduleReminder({ type: 'task', taskId: task.id, title: task.title }, moment);
    await write(task.id, t => ({ ...t, reminderAt: moment.toISOString() }));
  }, [task, write]);

  const removeReminder = useCallback(async () => {
    if (!task) return;
    await cancelReminder(task.id);
    await write(task.id, t => { const { reminderAt: _omit, ...rest } = t; return rest as Task; });
  }, [task, write]);

  const startTimer = useCallback(() => {
    if (!task) return;
    void startTaskTimer({ id: task.id, title: task.title, kanbanColumnId: task.kanbanColumnId, status: task.status, projectId: task.projectId });
  }, [task, startTaskTimer]);
  const stopTimer = useCallback(() => { if (task) void stopTimerForTask(task.id); }, [task, stopTimerForTask]);

  const copyTask = useCallback(() => {
    if (task) void copyTextToClipboard(task.title);
  }, [task]);

  if (!task) return { header: null, body: null, footer: null };
  const cardTask = task as CardTask;

  const sprintSlot = sprintFieldVisible(sprints, projectId, task.sprintId ?? null) ? (
    <OptionField
      icon="flag.checkered"
      label={tr.sprintField}
      options={sprintOptionsForTask(sprints, projectId, task.sprintId ?? null).map(option => ({
        id: option.id,
        label: sprintOptionLabel(option, { closedSuffix: tr.sprintClosedSuffix, foreign: tr.sprintForeignProject }),
        icon: 'flag' as const,
      }))}
      value={task.sprintId ?? null}
      onChange={id => { if (canPlan) void write(task.id, t => ({ ...applyFormSprint(t, sprints, id), history: appendHistory(t, 'edited') })); }}
      emptyOption={{ label: tr.sprintBacklog, icon: 'tray' }}
      disabled={!canPlan}
      colors={c}
      isDark={isDark}
    />
  ) : null;

  const header = (
    <TaskDetailHeader
      title={task.title}
      leading={
        <AnimatedCheck
          checked={task.status === 'done'}
          color="#10B981"
          borderColor={c.border}
          size={22}
          radius={7}
          onPress={canExecute ? toggleDone : undefined}
          hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
        />
      }
      tab={effectiveTab}
      onTabChange={onTabChange}
      showTeam={showTeam}
      timerRunning={timerRunning}
      // Старт таймера — у шапці під назвою: видно на кожній вкладці.
      timerSlot={task.status === 'active' && canExecute ? (
        <TaskTimerButton
          task={task}
          running={timerRunning}
          activeStartedAt={activeTimer?.startedAt}
          onStart={startTimer}
          onStop={stopTimer}
          tr={tr}
        />
      ) : null}
      onRename={canPlan ? title => { if (title.trim()) edit({ title: title.trim() }); } : undefined}
      onClose={onClose}
      onCopy={copyTask}
      actions={userId ? (
        <TaskDetailHeaderAction
          icon="eye"
          label={watched ? tr.taskUnwatch : tr.taskWatch}
          active={watched}
          onPress={toggleWatch}
          color={watched ? c.accent : c.sub}
        />
      ) : null}
      showHandle={!wide}
      colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent }}
      tr={tr}
    />
  );

  const currentColumn = boardColumnForTask(task, boardColumns, allColumns) ?? boardColumns[0];

  const body = effectiveTab === 'details' ? (
    <TaskCardDetails
      description={task.description ?? ''}
      onDescription={text => edit({ description: text.trim() })}
      estimate={task.estimatedMinutes}
      onEstimate={minutes => edit({ estimatedMinutes: minutes && minutes > 0 ? minutes : undefined })}
      startDate={task.startDate}
      onStartDate={iso => edit({ startDate: iso ?? undefined })}
      recurrence={cardTask.recurrence}
      onRecurrence={rule => edit({ recurrence: rule })}
      reminderAt={task.reminderAt}
      onSetReminder={moment => { void setReminder(moment); }}
      onRemoveReminder={() => { void removeReminder(); }}
      createdAt={task.createdAt}
      hasDeadline={!!task.deadline}
      sprintSlot={showTeam ? null : sprintSlot}
      canExecute={canExecute}
      canPlan={canPlan}
      today={today}
      colors={c}
      isDark={isDark}
      locale={locale}
    />
  ) : effectiveTab === 'team' ? (
    <TeamTaskPanel key={task.id} task={task} role={role} sprintSlot={sprintSlot} colors={c} isDark={isDark} />
  ) : effectiveTab === 'activity' ? (
    <TaskCardActivity
      colors={c}
      timerSlot={
        <TaskTimerTab
          task={task}
          running={timerRunning}
          activeStartedAt={activeTimer?.startedAt}
          onStart={startTimer}
          onStop={stopTimer}
          colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
          tr={tr}
          locale={locale}
          fmtClock={formatClock}
          fmtDur={fmtDur}
        />
      }
      historySlot={<TaskHistoryTab events={task.history ?? []} textColor={c.text} subColor={c.sub} tr={tr} locale={locale} />}
      linksSlot={linkedDiscussions.length ? (
        <View style={{ gap: 6, marginBottom: 6 }}>
          {linkedDiscussions.map(d => (
            <TouchableOpacity
              key={d.id}
              onPress={() => openDiscussion(d.id)}
              accessibilityRole="link"
              accessibilityLabel={`${tr.taskCardDiscussions}: ${d.title}`}
              style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim }}>
              <IconSymbol name="bubble.left.and.bubble.right.fill" size={15} color={c.accent} />
              <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600' }}>{d.title}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>
          ))}
        </View>
      ) : undefined}
      commentsSlot={
        <CommentsSection
          projectId={projectId}
          targetType="task"
          targetId={task.id}
          isOwner={role === 'owner'}
          currentUserId={userId || null}
          colors={c}
          isDark={isDark}
          locale={locale}
          tr={tr}
        />
      }
    />
  ) : (
    <TaskCardMain
      status={{ options: statusOptions, value: currentColumn?.id ?? '', onChange: setColumn }}
      priority={normalizePriority(task)}
      onPriority={level => edit(priorityFields(level))}
      deadline={task.deadline}
      overdue={isOverdue(task)}
      onDeadline={iso => edit({ deadline: iso ?? undefined })}
      // Лід переносить задачу в інший свій проєкт прямо тут (паритет з
      // особистою карткою); решта бачить проєкт лише для читання.
      project={{
        options: canMove
          ? moveTargets.map(p => ({ id: p.id, label: p.name, color: p.color }))
          : [{ id: projectId, label: projectName, color: projectColor }],
        value: projectId,
        selectedLabel: projectName,
        onChange: moveToProject,
        locked: !canMove,
      }}
      canExecute={canExecute}
      canPlan={canPlan}
      today={today}
      colors={c}
      isDark={isDark}
      locale={locale}
      subtasksSlot={<>
        <TaskSubtasks
          task={task}
          progressPercent={task.status === 'done' ? 100 : task.subtasks.length
            ? Math.round((task.subtasks.filter(s => s.done).length / task.subtasks.length) * 100) : 0}
          editingId={editingSubId}
          editingText={editingSubText}
          onChangeEditingText={setEditingSubText}
          onSaveEdit={saveSubEdit}
          onToggle={toggleSubtask}
          onCopy={sub => { void copyTextToClipboard(sub.title); }}
          onShowActions={sub => showSubtaskActions(sub as SubTask)}
          // Без onOpenAll: /subtasks — особистий екран, і перехід туди
          // виводив людину з проєкту. Усі підзавдання — тут же, у картці.
          newText={newSubtask}
          onChangeNewText={setNewSubtask}
          onAdd={addSubtask}
          onFocusInput={() => {}}
          colors={c}
          isDark={isDark}
          tr={tr}
        />
        <ReminderSheet
          visible={!!subReminderId}
          title={task.subtasks.find(sub => sub.id === subReminderId)?.title ?? tr.reminderAtLabel}
          reminderAt={task.subtasks.find(sub => sub.id === subReminderId)?.reminderAt}
          onSave={moment => { if (subReminderId) void setSubtaskReminder(subReminderId, moment); }}
          onRemove={() => { if (subReminderId) void removeSubtaskReminder(subReminderId); }}
          onClose={() => setSubReminderId(null)}
          today={today}
          colors={c}
          isDark={isDark}
        />
      </>}
    />
  );

  // Липкий низ картки (DetailPane footer) — не в кінці прокрутки. Спільна
  // композиція дій (ActionBar): деструктивна ліворуч, основна праворуч і ширша.
  const footer = canExecute && isLead(role) ? (
    <ActionBar align="stretch" wrap={false}>
      <ActionButton label={tr.delete} icon="trash" tone="danger" grow={1} onPress={() => onDelete(task)} colors={c} />
      <ActionButton
        label={task.status === 'done' ? tr.restore : tr.completed}
        icon={task.status === 'done' ? 'arrow.uturn.backward' : 'checkmark'}
        tone={task.status === 'done' ? 'neutral' : 'primary'}
        grow={2}
        onPress={toggleDone}
        colors={c}
      />
    </ActionBar>
  ) : null;

  return { header, body, footer };
}

/** Колонка дошки, з якої задачу завершили (для «не готово»), якщо вона ще є. */
function reopenTarget(task: Task, boardColumns: readonly TaskStatusColumn[]): TaskStatusColumn | undefined {
  const history = task.history ?? [];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].type !== 'done') continue;
    const id = history[i].reopen?.columnId;
    return id ? boardColumns.find(col => col.id === id && !col.isDone) : undefined;
  }
  return undefined;
}

// ─── Хост картки для екранів, що не тримають власного списку задач ──────────

/**
 * Дані й дії, яких потребує useProjectTaskCard, — для екранів простору
 * проєкту, що самі задачами не керують («Моя робота», «Огляд»). Екран
 * «Завдання» проєкту має власний стан і цим не користується.
 *
 * Видалення — з тостом «Скасувати» (паритет з особистим екраном): задача
 * повертається в сховище тим самим записом.
 */
export function useProjectTaskHost(projectId: string) {
  const { tr } = useI18n();
  const { stopTimerForTask } = useTimerContext();
  const tasks = useProjectRecords<Task>('tasks');
  const sprints = useProjectRecords<Sprint>('sprints');
  const columns = useProjectRecords<TaskStatusColumn>('task_statuses');
  const { show: showUndo, element: undoElement, visible: undoVisible } = useUndoToast(true);

  const boardColumns = useMemo(() => {
    const scoped = mergeTaskStatusColumns(columns, projectId);
    return orderColumnsForList(scoped.length ? scoped : mergeTaskStatusColumns(columns));
  }, [columns, projectId]);

  const write = useCallback(async (taskId: string, patch: (t: Task) => Task) => {
    try {
      await updateSynced<Task>('tasks', fresh => fresh.map(t => (t.id === taskId ? patch(t) : t)));
    } catch (e) {
      if (__DEV__) console.warn('[ProjectTaskCard] запис картки не вдався:', e);
    }
  }, []);

  const deleteTask = useCallback((task: Task, afterDelete?: () => void) => {
    Alert.alert(tr.deletePermanently, `«${task.title}»\n${tr.cannotUndo}`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          afterDelete?.();
          void (async () => {
            try {
              await stopTimerForTask(task.id);
              await updateSynced<Task>('tasks', fresh => fresh.filter(t => t.id !== task.id));
              showUndo(tr.taskDeleted, () => {
                void updateSynced<Task>('tasks', fresh => (fresh.some(t => t.id === task.id) ? fresh : [...fresh, task]))
                  .catch(e => { if (__DEV__) console.warn('[ProjectTaskCard] відновлення не вдалося:', e); });
              });
            } catch (e) {
              if (__DEV__) console.warn('[ProjectTaskCard] видалення не вдалося:', e);
            }
          })();
        },
      },
    ]);
  }, [tr, stopTimerForTask, showUndo]);

  return { tasks, sprints, columns, boardColumns, write, deleteTask, showToast: showUndo, undoElement, undoVisible };
}
