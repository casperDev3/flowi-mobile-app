/**
 * components/time/timerCandidates.ts — які задачі пропонувати в «Почати таймер».
 *
 * Чиста функція (дзеркало вебового `timerCandidates` у
 * components/time/timers-panel.tsx): незавершені, без ідей/багів беклогу і
 * без уже запущеного таймера. Порядок — те, що найімовірніше трекатимуть:
 * спершу «У процесі», далі за дедлайном (раніший вище, без дедлайну — у
 * кінці), далі новіші.
 */
import { IN_PROGRESS_COLUMN_ID } from '@/utils/taskStatuses';

export interface TimerCandidateTask {
  id: string;
  title: string;
  status: 'active' | 'done';
  kanbanColumnId?: string;
  projectId?: string;
  assigneeId?: string | null;
  createdBy?: string;
  backlogKind?: 'idea' | 'bug';
  deadline?: string;
  createdAt?: string;
}

function deadlineMs(task: TimerCandidateTask): number {
  if (!task.deadline) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(task.deadline);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export function timerCandidates<T extends TimerCandidateTask>(
  tasks: readonly T[],
  running: ReadonlySet<string>,
  query: string,
): T[] {
  const q = query.trim().toLocaleLowerCase();
  const rank = (task: T) => (task.kanbanColumnId === IN_PROGRESS_COLUMN_ID ? 0 : 1);
  return tasks
    .filter(task => task.status !== 'done' && !task.backlogKind && !running.has(task.id))
    .filter(task => !q || task.title.toLocaleLowerCase().includes(q))
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank) return byRank;
      const da = deadlineMs(a);
      const db = deadlineMs(b);
      if (da !== db) return da < db ? -1 : 1;
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
}
