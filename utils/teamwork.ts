import { isExecutableTask } from './task-contract';
export type TeamRole = 'owner' | 'manager' | 'member' | 'viewer';
export interface TeamTask {
  backlogKind?: string; archivedAt?: string | null; deleted?: boolean;
  id: string; title: string; projectId?: string; status: string;
  assigneeId?: string | null; createdBy?: string; deadline?: string; priorityLevel?: number | null;
  estimatedMinutes?: number; reviewRequired?: boolean; reviewerId?: string | null;
  reviewState?: 'none' | 'pending' | 'approved' | 'changes_requested' | 'needs_reviewer'; reviewFeedback?: string;
  resultRequirements?: ('summary' | 'link' | 'file')[]; resultSummary?: string;
  resultLinks?: string[]; resultFiles?: string[]; blocked?: boolean; blockReason?: string;
  blockedById?: string | null; dependencyIds?: string[];
}
export interface Discussion { kind?: "topic" | "chat"; taskIds?: string[]; archivedAt?: string; id: string; projectId: string; title: string; body: string; authorId: string; createdAt: string; updatedAt?: string }
export interface Milestone { id: string; projectId: string; title: string; deadline?: string; taskIds: string[]; updatedAt?: string }
export interface TeamPreferences { id: string; projectId: string; userId: string; weeklyHours?: number | null; homePage?: 'my-work' | 'overview'; watchedTaskIds?: string[]; watchedDiscussionIds?: string[]; updatedAt?: string }
export interface WorkloadRow { userId: string; name: string; plannedMinutes: number; otherProjectMinutes: number; unestimated: number; unscheduledMinutes: number; activeCount: number; weeklyHours: number | null; remainingMinutes: number | null }
export function isLead(role: TeamRole) { return role === 'owner' || role === 'manager'; }
export function isComplete(task: TeamTask) { return task.status === 'done' && (!task.reviewRequired || task.reviewState === 'approved'); }
export function taskRights(task: TeamTask, role: TeamRole, userId: string) {
  const lead = isLead(role), member = role !== 'viewer', own = member && task.assigneeId === userId;
  return { lead, execute: own || lead, plan: lead || (own && task.createdBy === userId),
    take: member && !task.assigneeId, review: member && task.reviewerId === userId && task.reviewState === 'pending',
    submit: own, subscribe: true };
}
export function resultProblem(task: TeamTask): string | null {
  for (const required of task.resultRequirements ?? []) {
    if (required === 'summary' && !task.resultSummary?.trim()) return 'Опишіть результат роботи.';
    if (required === 'link' && !task.resultLinks?.length) return 'Додайте посилання на результат.';
    if (required === 'file' && !task.resultFiles?.length) return 'Додайте файл результату.';
  }
  return null;
}
export function myWork(tasks: readonly TeamTask[], userId: string, role: TeamRole = 'member') {
  const open = role === 'viewer' ? [] : tasks.filter(t => isExecutableTask(t) && !isComplete(t));
  return { assigned: open.filter(t => t.assigneeId === userId).sort((a,b) => (a.priorityLevel ?? 9) - (b.priorityLevel ?? 9) || (a.deadline ?? 'z').localeCompare(b.deadline ?? 'z')),
    reviews: open.filter(t => t.reviewerId === userId && t.reviewState === 'pending'),
    blockers: open.filter(t => (t.blocked && t.blockedById === userId) || (isLead(role) && t.reviewState === 'needs_reviewer')),
    available: open.filter(t => !t.assigneeId) };
}
export function progress(tasks: readonly TeamTask[], now = new Date()) {
  tasks = tasks.filter(isExecutableTask);
  const active = tasks.filter(t => !isComplete(t));
  return { total: tasks.length, done: tasks.length - active.length,
    blocked: active.filter(t => t.blocked).length,
    pending: active.filter(t => t.reviewState === 'pending').length,
    overdue: active.filter(t => t.deadline && new Date(t.deadline).getTime() < now.getTime()).length };
}
export function dependencyWarnings(task: TeamTask, tasks: readonly TeamTask[]) {
  return tasks.filter(t => task.dependencyIds?.includes(t.id) && !isComplete(t));
}
/** Stable global storage ID: preferences from different projects cannot collide. */
export function teamPreferencesId(projectId: string, userId: string): string {
  let hash = BigInt('14695981039346656037');
  for (const char of `${projectId}:${userId}`) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * BigInt('1099511628211'));
  }
  return `pref-${hash.toString(16)}`;
}

/** Preview how this edit affects the current week's capacity; never blocks saving. */
export function projectedRemaining(row: WorkloadRow, before: TeamTask, after: TeamTask, now = new Date()): number | null {
  if (row.remainingMinutes === null) return null;
  const end = new Date(now); end.setDate(end.getDate() + (7 - ((end.getDay() + 6) % 7))); end.setHours(0,0,0,0);
  const minutes = (task: TeamTask) => isExecutableTask(task) && task.assigneeId === row.userId && !isComplete(task) && task.deadline && new Date(task.deadline).getTime() < end.getTime() ? (task.estimatedMinutes ?? 0) : 0;
  return row.remainingMinutes + minutes(before) - minutes(after);
}
