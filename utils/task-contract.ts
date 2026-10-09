/** S1-06/S1-09. Same contract on web, mobile and server fixtures. */
export interface ContractTask {
  id?: string; projectId?: string; assigneeId?: string | null; createdBy?: string;
  backlogKind?: string; archivedAt?: string | null; deleted?: boolean;
}
export function isExecutableTask(task: ContractTask): boolean {
  return !task.backlogKind && !task.archivedAt && !task.deleted;
}
/** Unknown local project IDs follow the legacy personal-stream router.
 * Revoked shared records must be purged by sync; selectors never copy records. */
export function isPersonalTask(task: ContractTask, userId: string | null | undefined, roles?: Readonly<Record<string, string>>): boolean {
  if (!isExecutableTask(task)) return false;
  if (!task.projectId) return true;
  if (!userId) return false;
  if (roles && !(task.projectId in roles)) return !task.assigneeId || String(task.assigneeId) === String(userId);
  if (roles?.[task.projectId] === 'viewer') return false;
  return String(task.assigneeId ?? '') === String(userId);
}
