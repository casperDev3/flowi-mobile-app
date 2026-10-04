import type {Task} from './taskUtils';
import {boardColumnForTask,resolvedStatusType,type TaskStatusColumn} from './taskStatuses';
export function isProjectWork(task:Task,columns:TaskStatusColumn[]):boolean {
  if(task.backlogKind)return false;
  const column=boardColumnForTask(task,columns,columns);
  return Boolean(task.deadline&&Number.isFinite(new Date(task.deadline).getTime())) || String(task.status)==='in_progress'||task.status==='done'||task.reviewState==='pending'||task.reviewState==='changes_requested'||Boolean(column&&(resolvedStatusType(column)!=='todo'||column.sourceStatusId==='status-review'||column.id==='status-review'));
}
