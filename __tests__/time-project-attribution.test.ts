/**
 * Записи часу проєктних задач не мають падати в «Особисте».
 *
 * Таймер, запущений у вебі чи старою версією, писав запис без `projectId`;
 * проєкт тепер визначається за задачею запису (utils/timeEntries.recordProjectId),
 * а таймер наради несе проєкт наради.
 */
import { buildMeetingTimer } from '@/utils/meetings';
import { hoursThisWeekSeconds } from '@/utils/projectOverview';
import {
  filterRecords,
  groupByProject,
  projectBreakdown,
  recordProjectId,
  taskProjectMap,
  type TimeRecord,
} from '@/utils/timeEntries';

const now = new Date(2026, 8, 23, 12, 0);
const at = new Date(2026, 8, 23, 10, 0).toISOString();
const projects = [
  { id: 'p1', name: 'Альфа', color: '#f00' },
  { id: 'p2', name: 'Бета', color: '#0f0' },
];
const tasks = [{ id: 't1', projectId: 'p1' }, { id: 't2', projectId: 'p2' }, { id: 't3' }];
const records: TimeRecord[] = [
  { id: 'a', task: 'A', taskId: 't1', duration: 600, date: at },
  { id: 'b', task: 'B', taskId: 't2', duration: 300, date: at, projectId: 'p2' },
  { id: 'c', task: 'C', taskId: 't3', duration: 120, date: at },
  { id: 'd', task: 'Вільний', duration: 60, date: at },
] as TimeRecord[];

describe('проєкт запису часу', () => {
  const map = taskProjectMap(tasks);

  it('власний projectId, інакше — проєкт задачі', () => {
    expect(records.map(r => recordProjectId(r, map))).toEqual(['p1', 'p2', null, null]);
    expect(recordProjectId(records[0])).toBeNull();
  });

  it('розподіл, групи й фільтр рахують запис за проєктом задачі', () => {
    expect(projectBreakdown(records, projects, 'Особисте', '#999', map).map(s => [s.name, s.seconds]))
      .toEqual([['Альфа', 600], ['Бета', 300], ['Особисте', 180]]);
    expect(groupByProject(records, projects, 'Особисте', '#999', map).find(g => g.projectId === 'p1')?.items.map(r => r.id))
      .toEqual(['a']);
    expect(filterRecords(records, { period: 'all', projectId: 'p1', taskKey: null }, now, map).map(r => r.id))
      .toEqual(['a']);
  });

  it('години проєкту за тиждень на Огляді', () => {
    expect(hoursThisWeekSeconds(records, 'p1', now, map)).toBe(600);
    expect(hoursThisWeekSeconds(records, 'p1', now)).toBe(0);
  });

  it('таймер проєктної наради несе projectId, особистої — ні', () => {
    expect(buildMeetingTimer({ id: 'm1', title: 'Планерка', projectId: 'p1' }, now).projectId).toBe('p1');
    expect('projectId' in buildMeetingTimer({ id: 'm2', title: 'Особиста' }, now)).toBe(false);
  });
});
