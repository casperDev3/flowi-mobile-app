/**
 * C2 / P4: голий `YYYY-MM-DD` дедлайн (імпорт Jira/Notion/Worksection) на
 * Ганті. На захід від UTC `new Date('2026-10-20')` — це 19.10 увечері, тож
 * тягнення правого краю на +1 добу лишало дедлайн на 20.10.
 */
// Ловить регресію лише на захід від UTC: TZ=America/New_York npx jest <цей файл>
// (process.env.TZ у рантаймі jest не діє). У поясі UTC+ теж проходить.

import { shiftGanttEdge } from '@/utils/projectCharts';
import { deadlineDayKey, isTimedDeadline } from '@/utils/taskDeadline';

describe('shiftGanttEdge with a bare date deadline (west of UTC)', () => {
  const task = { createdAt: '2026-10-01T12:00:00.000Z', deadline: '2026-10-20' };

  it('+1 day moves the deadline to the next local day at noon, date-only', () => {
    const r = shiftGanttEdge(task, 'end', 1) as { deadline: string };
    expect(deadlineDayKey(r.deadline)).toBe('2026-10-21');
    expect(new Date(r.deadline).getHours()).toBe(12);
    expect(isTimedDeadline(r)).toBe(false);
  });

  it('-1 day moves it to the previous local day', () => {
    const r = shiftGanttEdge(task, 'end', -1) as { deadline: string };
    expect(deadlineDayKey(r.deadline)).toBe('2026-10-19');
  });
});
