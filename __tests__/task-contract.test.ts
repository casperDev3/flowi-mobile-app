import matrix from '../contracts/task-matrix.json';
import { isMyTask } from '../utils/taskUtils';
import { myWork, progress, type TeamRole, type TeamTask } from '../utils/teamwork';
for (const c of matrix.cases) test(`shared contract: ${c.name}`, () => {
  expect(matrix.tasks.filter(t => isMyTask(t as Parameters<typeof isMyTask>[0],c.userId,c.roles)).map(t=>t.id)).toEqual(c.personal);
  const source = matrix.tasks.filter(t=>t.projectId==='p') as TeamTask[];
  const queues = myWork(source,c.userId,c.name as TeamRole);
  expect(Object.fromEntries(Object.entries(queues).map(([k,v])=>[k,v.map(t=>t.id)]))).toEqual(c.queues);
  for(const queue of Object.values(queues)) for(const task of queue) expect(source.includes(task)).toBe(true);
  expect(progress(source,new Date(matrix.now))).toEqual(matrix.projectProgress);
});
for(const c of matrix.legacyCases) test(`legacy contract: ${c.task.id}`,()=>expect(isMyTask(c.task,'u',c.roles as Record<string, string> | undefined)).toBe(c.expected));

import { projectStats, type ProjectTaskLike } from '../utils/projectStats';
import { tasksForProjects, columnDistribution, type ChartTaskLike } from '../utils/projectCharts';
test('project metrics and charts exclude drafts and archived tasks', () => {
 const source = matrix.tasks.filter(t=>t.projectId==='p');
 const project={id:'p',name:'Project',color:'#fff',createdAt:matrix.now};
 const stats=projectStats(project,source as ProjectTaskLike[],new Date(matrix.now));
 expect(stats.total).toBe(7); expect(stats.done).toBe(1); expect(stats.overdue).toBe(1);
 expect(tasksForProjects(source as ChartTaskLike[],['p']).length).toBe(7);
 expect(columnDistribution(source as ChartTaskLike[],[])).toEqual(columnDistribution(source.filter(t=>!t.backlogKind&&!t.archivedAt) as ChartTaskLike[],[]));
 const converted=source.map(t=>t.id==='idea'?{...t,backlogKind:undefined}:t);
 expect(projectStats(project,converted as ProjectTaskLike[],new Date(matrix.now)).total).toBe(8);
});
