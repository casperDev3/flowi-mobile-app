import {myWork,progress,taskRights,resultProblem,projectedRemaining} from '../utils/teamwork';
import {deepLinkRoute} from '../utils/pushLink';
const task={id:'t',title:'Result',status:'active',assigneeId:'member',createdBy:'member'};
it('review queue is separate from completed work and assignment permissions',()=>{
 const pending={...task,reviewRequired:true,reviewerId:'reviewer',reviewState:'pending' as const};
 expect(myWork([pending],'reviewer').reviews).toHaveLength(1);
 expect(taskRights(pending,'member','reviewer').review).toBe(true);
 expect(taskRights(pending,'member','reviewer').execute).toBe(false);
 expect(progress([{...pending,status:'done'}]).done).toBe(0);
 expect(resultProblem({...task,resultRequirements:['summary'],resultSummary:'  '})).toBeTruthy();
});
it('capacity preview warns when a changed estimate exceeds remaining time',()=>{
 const row={userId:'member',remainingMinutes:60} as Parameters<typeof projectedRemaining>[0];
 const before={...task,estimatedMinutes:30,deadline:'2026-10-01'};
 expect(projectedRemaining(row,before,{...before,estimatedMinutes:120},new Date('2026-10-03'))).toBe(-30);
});
it('team notifications open the specific discussion or workload screen',()=>{
 expect(deepLinkRoute('ftrackingapp://project/p/discussions?discussion=topic')).toBe('/project/p/discussions?discussion=topic');
 expect(deepLinkRoute('ftrackingapp://project/p/workload')).toBe('/project/p/workload');
});
