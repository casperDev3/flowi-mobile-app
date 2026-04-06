import { isSameMonth } from './dateUtils';

export type Priority = 'high' | 'medium' | 'low';
export type Status = 'active' | 'done';
export type SortBy = 'priority' | 'newest' | 'oldest' | 'name' | 'deadline';
export type Filter = 'all' | 'active' | 'done';

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  reminderAt?: string;
}

export interface TaskTimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
}

export type HistoryEventType =
  | 'created' | 'edited' | 'done' | 'active'
  | 'timer_start' | 'timer_stop'
  | 'subtask_add' | 'subtask_done' | 'subtask_undone';

export interface TaskHistoryEvent {
  id: string;
  at: string;
  type: HistoryEventType;
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  subtasks: SubTask[];
  createdAt: string;
  estimatedMinutes?: number;
  deadline?: string;
  projectId?: string;
  reminderAt?: string;
  timeEntries?: TaskTimeEntry[];
  history?: TaskHistoryEvent[];
}

export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export const PRIORITY_COLORS: Record<Priority, string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#10B981',
};

export function getProgress(t: Task): number {
  if (t.status === 'done') return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
}

export function isOverdue(task: Task): boolean {
  if (!task.deadline || task.status === 'done') return false;
  const d = new Date(task.deadline);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

export function deadlineDiff(iso: string): number {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export function deadlineColor(task: Task, fallback: string): string {
  if (!task.deadline || task.status === 'done') return fallback;
  const diff = deadlineDiff(task.deadline);
  if (diff < 0) return '#EF4444';
  if (diff <= 1) return '#F59E0B';
  return fallback;
}

export function filterTasksByMonth(tasks: Task[], month: Date): Task[] {
  return tasks.filter(t => {
    const created = isSameMonth(new Date(t.createdAt), month);
    const deadline = t.deadline ? isSameMonth(new Date(t.deadline), month) : false;
    const isActive = t.status === 'active';
    // Show active tasks from any month so nothing gets lost
    return created || deadline || isActive;
  });
}

export function sortTasks(tasks: Task[], by: SortBy): Task[] {
  return [...tasks].sort((a, b) => {
    switch (by) {
      case 'priority':
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name':
        return a.title.localeCompare(b.title);
      case 'deadline': {
        const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity;
        const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity;
        return aD - bD;
      }
      default:
        return 0;
    }
  });
}

export function applyTaskFilters(
  tasks: Task[],
  {
    filter,
    search,
    projectId,
    priority,
    dateFilter,
  }: {
    filter: Filter;
    search: string;
    projectId?: string;
    priority?: Priority;
    dateFilter?: string | null;
  },
): Task[] {
  return tasks.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (projectId && t.projectId !== projectId) return false;
    if (priority && t.priority !== priority) return false;
    if (dateFilter) {
      const tDate = new Date(t.createdAt).toDateString();
      if (tDate !== dateFilter) return false;
    }
    return true;
  });
}
