import type { Sprint } from './sprintUtils';

function localDay(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/** Number all project sprints by creation, including undated and closed ones. */
export function calendarSprintSegments(sprints: readonly Sprint[], projectId: string, days: readonly string[]) {
  return sprints.filter(s => s.projectId === projectId)
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .flatMap((sprint,index) => {
      const start = localDay(sprint.startDate), end = localDay(sprint.endDate);
      if (!start || !end || end < start) return [];
      const positions = days.flatMap((day,i) => day >= start && day <= end ? [i] : []);
      if (!positions.length) return [];
      return [{sprint, number:index+1, column:positions[0]+1, span:positions.length, startsHere:days.includes(start), endsHere:days.includes(end)}];
    });
}
