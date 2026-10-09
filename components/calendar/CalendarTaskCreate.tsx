/**
 * components/calendar/CalendarTaskCreate.tsx — створення завдання просто на
 * Календарі.
 *
 * Раніше «+ → Завдання» вело на екран «Завдань» із формою — після збереження
 * людина лишалась там, а не в календарі, з якого почала. Тепер та сама
 * коротка форма (TaskQuickCreate + чернетка useTaskEditor) відкривається
 * аркушем поверх календаря з уже підставленим днем (і проєктом, якщо
 * календар відфільтровано на проєкт), а запис іде прямо в 'tasks'.
 *
 * «Детальніше» створює завдання й відкриває його повну картку на «Завданнях»
 * — повний редактор у застосунку один.
 */
import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { TaskQuickCreate, type QuickCreateProject } from '@/components/tasks/card/TaskQuickCreate';
import { SheetModal } from '@/components/shared/SheetModal';
import { Atlas } from '@/constants/atlas';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { draftEstimatedMinutes, draftRecurrence, useTaskEditor, type TaskDraft } from '@/hooks/use-task-editor';
import { useToday } from '@/hooks/use-today';
import { applyFormSprint, type Sprint } from '@/utils/sprintUtils';
import { makeHistoryEvent } from '@/utils/taskHistory';
import {
  ACTIVE_COLUMN_ID, mergeTaskStatusColumns, projectEquivalentColumn, type TaskStatusColumn,
} from '@/utils/taskStatuses';
import { assigneeForPersonalProjectTask, priorityFields, type Task } from '@/utils/taskUtils';

import type { CalendarColors } from './palette';

/**
 * Нове завдання з чернетки — ті самі правила, що й `addTask` на екрані
 * «Завдань»: статус-еквівалент у проєкті, автор і виконавець для проєктного
 * завдання, спринт із форми.
 */
export function buildQuickTask(
  draft: TaskDraft,
  ctx: { statuses: readonly TaskStatusColumn[]; sprints: readonly Sprint[]; userId?: string | number | null; now?: Date },
): Task | null {
  const title = draft.title.trim();
  if (!title) return null;
  const columns = mergeTaskStatusColumns([...ctx.statuses]);
  const picked = columns.find(col => col.id === draft.statusId) ?? columns[0];
  const status = draft.projectId
    ? projectEquivalentColumn(picked, [...ctx.statuses], draft.projectId) ?? picked
    : picked;
  const userId = ctx.userId === null || ctx.userId === undefined ? undefined : ctx.userId;
  const now = ctx.now ?? new Date();
  const base: Task = {
    id: String(now.getTime()),
    title,
    description: draft.desc.trim(),
    ...priorityFields(draft.priorityLevel),
    status: status.isDone ? 'done' : 'active',
    kanbanColumnId: status.id,
    subtasks: [],
    createdAt: now.toISOString(),
    estimatedMinutes: draftEstimatedMinutes(draft),
    deadline: draft.deadline ?? undefined,
    projectId: draft.projectId ?? undefined,
    createdBy: draft.projectId ? (userId as Task['createdBy']) : undefined,
    assigneeId: assigneeForPersonalProjectTask(
      { projectId: draft.projectId ?? undefined, assigneeId: draft.assigneeId ?? undefined },
      userId as never,
    ),
    timeEntries: [],
    history: [makeHistoryEvent('created')],
    recurrence: draftRecurrence(draft),
  } as Task;
  return applyFormSprint(base, [...ctx.sprints], draft.sprintId);
}

export interface CalendarTaskCreateProps {
  visible: boolean;
  /** Дедлайн нового завдання (повний ISO локальної півночі). */
  deadline: string | null;
  /** Наперед обраний проєкт (фільтр календаря / календар проєкту). */
  projectId?: string;
  projects: readonly QuickCreateProject[];
  sprints: readonly Sprint[];
  statuses: readonly TaskStatusColumn[];
  userId?: string | number | null;
  /** `openFull` — «Детальніше»: після запису відкрити повну картку. */
  onCreate: (task: Task, openFull: boolean) => void;
  onClose: () => void;
  isDark: boolean;
  locale: string;
  c: CalendarColors;
}

export function CalendarTaskCreate({
  visible, deadline, projectId, projects, sprints, statuses, userId, onCreate, onClose, isDark, locale, c,
}: CalendarTaskCreateProps) {
  const today = useToday();
  const { height } = useResponsive();
  const editor = useTaskEditor(ACTIVE_COLUMN_ID, today);
  const roles = useProjectRoles();
  const pickable = useMemo(
    () => projects.filter(p => canEditProjectItem(p.id, roles)).map(p => ({ id: p.id, name: p.name, color: p.color })),
    [projects, roles],
  );
  const all = useMemo(() => projects.map(p => ({ id: p.id, name: p.name, color: p.color })), [projects]);

  // Кожне відкриття — чиста чернетка з днем (і проєктом), з якого натиснули «+».
  const reset = editor.reset;
  useEffect(() => {
    if (!visible) return;
    reset(ACTIVE_COLUMN_ID, {
      deadline: deadline ?? null,
      projectId: projectId && canEditProjectItem(projectId, roles) ? projectId : null,
      sprintId: null,
    });
    // Лише на відкриття: ролі/проєкт під час набору не мусять скидати форму.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const submit = (openFull: boolean) => {
    const task = buildQuickTask(editor.draft, { statuses, sprints, userId });
    if (!task) return;
    onCreate(task, openFull);
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View
        testID="calendar-task-create"
        style={[st.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TaskQuickCreate
            editor={editor}
            pickableProjects={pickable}
            projects={all}
            sprints={sprints}
            today={today}
            onSave={() => submit(false)}
            onMore={() => submit(true)}
            colors={c}
            isDark={isDark}
            locale={locale}
          />
        </ScrollView>
      </View>
    </SheetModal>
  );
}

const st = StyleSheet.create({
  sheet: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 20, overflow: 'hidden' },
});
