import type {Task} from './taskUtils';
import {totalTrackedSeconds as taskTrackedSeconds} from './taskTimer';
/** Average per finished, timed task. Untimed tasks do not dilute the sample. */
export function actualWorkload(tasks: readonly Task[], userId: string) {
  const own=tasks.filter(t=>!t.backlogKind && t.assigneeId===userId);
  const finished=own.filter(t=>t.status==='done' && (!t.reviewRequired || t.reviewState==='approved'));
  const sample=finished.map(taskTrackedSeconds).filter(n=>n>0);
  const averageMinutes=sample.length ? sample.reduce((a,b)=>a+b,0)/sample.length/60 : null;
  const active=own.filter(t=>!finished.includes(t));
  return {activeCount:active.length,completedCount:finished.length,sampleCount:sample.length,averageMinutes,forecastMinutes:averageMinutes===null?null:averageMinutes*active.length};
}
