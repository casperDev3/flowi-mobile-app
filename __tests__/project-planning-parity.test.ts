import {isProjectWork} from '../utils/projectBacklog';
import {actualWorkload} from '../utils/workloadActual';
import {calendarSprintSegments} from '../utils/calendarSprints';
import type {Task} from '../utils/taskUtils';
const base:Task={id:'t',projectId:'p',status:'active',createdAt:'2026-10-01',title:'Task',subtasks:[]};
test('drafts never enter work even with dates; unscheduled tasks stay in backlog',()=>{
 expect(isProjectWork(base,[])).toBe(false);
 expect(isProjectWork({...base,deadline:'2026-10-04'},[])).toBe(true);
 expect(isProjectWork({...base,deadline:'2026-10-04',backlogKind:'idea'},[])).toBe(false);
 expect(isProjectWork({...base,kanbanColumnId:'progress'},[{id:'progress',projectId:'p',name:'Work',color:'#000000',position:1,isDone:false,type:'in_progress'}])).toBe(true);
});
test('workload uses completed timed tasks and excludes ideas',()=>{
 const tasks:Task[]=[{...base,assigneeId:'u'},{...base,id:'idea',assigneeId:'u',backlogKind:'idea'},{...base,id:'done',assigneeId:'u',status:'done',timeEntries:[{id:'e',startedAt:'2026-10-01T09:00:00Z',endedAt:'2026-10-01T10:00:00Z',duration:3600}]}];
 expect(actualWorkload(tasks,'u')).toMatchObject({activeCount:1,sampleCount:1,averageMinutes:60,forecastMinutes:60});
 expect(actualWorkload(tasks,'other').averageMinutes).toBeNull();
});
test('sprint bars include last day and stable ordinal including undated sprints',()=>{
 const sprints=[{id:'a',projectId:'p',name:'Undated',createdAt:'2026-09-01'},{id:'b',projectId:'p',name:'Sprint',createdAt:'2026-09-02',startDate:'2026-10-03',endDate:'2026-10-04'}];
 expect(calendarSprintSegments(sprints,'p',['2026-10-04'])).toMatchObject([{number:2,column:1,span:1}]);
 expect(calendarSprintSegments(sprints,'other',['2026-10-04'])).toEqual([]);
});
