/**
 * components/projects/ProjectTaskSheet.tsx — повна картка завдання проєкту
 * ТАМ, ДЕ її відкрили.
 *
 * Спринти, Беклог, Архів, Календар, Обговорення раніше вели тап по задачі на
 * екран «Завдання» проєкту (`?open=`), а ще раніше — в особистий редактор.
 * Людина губила контекст: відкрила задачу зі спринта — і опинилась в іншому
 * розділі. Тепер кожен такий екран монтує цей аркуш: та сама картка з
 * вкладками (useProjectTaskCard), ті самі права й запис (useProjectTaskHost),
 * лише без власного списку.
 *
 * Аркуш (DetailPane без колонки) — на будь-якій ширині: у цих розділах немає
 * вільної правої колонки під деталь, а модальний лист не ламає їхню розмітку.
 * «Завдання» й «Моя робота» мають власний ListDetailLayout і цим не
 * користуються.
 *
 * Особисті екрани (вкладка «Завдання», «Сьогодні», Календар, групи задач)
 * теж показують сюди задачу ПРОЄКТУ (з `projectId`) — через
 * `useInPlaceProjectTask`: картка проєкту відкривається поверх того ж екрана,
 * без переходу в особистий редактор. Особисті задачі — як і були.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';

import { DetailPane } from '@/components/shared/DetailPane';
import { TASK_CARD_SHEET_RATIO } from '@/components/tasks/card/primitives';
import type { TaskDetailTab } from '@/components/tasks/TaskDetailHeader';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useI18n } from '@/store/i18n';
import { projectShellColors } from './ProjectScreenShell';
import { useProjectTaskCard, useProjectTaskHost } from './ProjectTaskCard';

export interface ProjectTaskSheetProps {
  projectId: string;
  /** id відкритої задачі; null — аркуш закритий. */
  taskId: string | null;
  onClose: () => void;
  /** Вкладка, з якою відкрити. */
  initialTab?: TaskDetailTab;
  isDark: boolean;
}

export function ProjectTaskSheet({ projectId, taskId, onClose, initialTab = 'main', isDark }: ProjectTaskSheetProps) {
  const { tr } = useI18n();
  const { height } = useWindowDimensions();
  const { project } = useProject(projectId);
  const role = useProjectRole(projectId);
  const host = useProjectTaskHost(projectId);
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED', project?.appearance);
  const colors = { ...c, sheet: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)' };
  const scrollRef = useRef<InstanceType<typeof ScrollView> | null>(null);
  const [tab, setTab] = useState<TaskDetailTab>(initialTab);
  // Нова задача — з тієї вкладки, яку попросили, а не з тієї, де лишили минулу.
  useEffect(() => { if (taskId) setTab(initialTab); }, [taskId, initialTab]);

  // Задача «належить» проєкту і тоді, коли лежить у ЙОГО спринті з чужим
  // projectId (правило projectDetailTasks): Спринти таку показують, тож і
  // відкрити її мусять, а не мовчки ігнорувати тап.
  const task = taskId
    ? host.tasks.find(t => t.id === taskId && (t.projectId === projectId
      || (!!t.sprintId && host.sprints.some(sp => sp.id === t.sprintId && sp.projectId === projectId)))) ?? null
    : null;
  const card = useProjectTaskCard({
    task,
    projectId,
    projectName: project?.name ?? '',
    projectColor: project?.color ?? c.accent,
    role,
    boardColumns: host.boardColumns,
    allColumns: host.columns,
    sprints: host.sprints,
    write: host.write,
    onDelete: t => host.deleteTask(t, onClose),
    onMoved: name => host.showToast(tr.taskMovedToProject.replace('{project}', name)),
    onClose,
    wide: false,
    tab,
    onTabChange: setTab,
    colors,
    isDark,
  });

  return (
    <>
      <DetailPane
        open={!!task}
        wide={false}
        onClose={onClose}
        isDark={isDark}
        sheetColor={colors.sheet}
        borderColor={c.border}
        maxHeight={height * 0.88}
        sheetHeight={Math.round(height * TASK_CARD_SHEET_RATIO)}
        scrollRef={scrollRef}
        header={card.header}
        footer={card.footer}>
        {card.body}
      </DetailPane>
      {host.undoElement}
    </>
  );
}

/** Проєкт, у чиїй картці відкривати задачу; null — задача особиста. */
export function projectTaskTarget(task: { projectId?: string | null } | null | undefined): string | null {
  return task?.projectId ? task.projectId : null;
}

interface InPlaceTarget {
  projectId: string;
  taskId: string | null;
  tab: TaskDetailTab;
}

/**
 * Для ОСОБИСТИХ екранів: `openProjectTask(task)` відкриває задачу проєкту
 * аркушем ProjectTaskSheet просто тут і повертає true; для особистої задачі
 * нічого не робить і повертає false — екран веде її своїм шляхом.
 * `projectTaskSheet` треба відрендерити на екрані.
 */
export function useInPlaceProjectTask(isDark: boolean) {
  const [target, setTarget] = useState<InPlaceTarget | null>(null);
  const openProjectTask = useCallback((task: { id: string; projectId?: string | null }, tab: TaskDetailTab = 'main') => {
    const projectId = projectTaskTarget(task);
    if (!projectId) return false;
    setTarget({ projectId, taskId: task.id, tab });
    return true;
  }, []);
  // Проєкт лишається змонтованим після закриття — аркуш доїжджає анімацією.
  const closeProjectTask = useCallback(() => setTarget(t => (t ? { ...t, taskId: null } : t)), []);
  const projectTaskSheet = target ? (
    <ProjectTaskSheet
      projectId={target.projectId}
      taskId={target.taskId}
      initialTab={target.tab}
      onClose={closeProjectTask}
      isDark={isDark}
    />
  ) : null;
  return { openProjectTask, closeProjectTask, projectTaskSheet, projectTaskOpenId: target?.taskId ?? null };
}
