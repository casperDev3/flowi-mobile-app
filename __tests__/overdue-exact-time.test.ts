/**
 * M5 (ревʼю 2026-10-18): дедлайн із часом (isTimedDeadline: `deadlineHasTime === true`
 * і `deadlineTimeAt === deadline`, контракт C1)
 * прострочений із точного моменту, а не з кінця доби — у списках, кольорі,
 * знімку годинника й віджета (паритет із вебом і сервером).
 */
import { deadlineColor, isOverdue, type Task } from '@/utils/taskUtils';
import { orderTodayTasks, snapshotTaskOverdue } from '@/utils/watchSnapshot';

const now = new Date(2026, 9, 18, 15, 0, 0);
const hourAgo = new Date(2026, 9, 18, 14, 0, 0).toISOString();
const inHour = new Date(2026, 9, 18, 16, 0, 0).toISOString();
const yesterday = new Date(2026, 9, 17, 12, 0, 0).toISOString();

describe('isOverdue', () => {
  it('з часом — від точного моменту', () => {
    expect(isOverdue({ deadline: hourAgo, deadlineHasTime: true, deadlineTimeAt: hourAgo, status: 'active' }, now)).toBe(true);
    expect(isOverdue({ deadline: inHour, deadlineHasTime: true, deadlineTimeAt: inHour, status: 'active' }, now)).toBe(false);
  });
  it('без часу — лише з наступної доби', () => {
    expect(isOverdue({ deadline: hourAgo, status: 'active' }, now)).toBe(false);
    expect(isOverdue({ deadline: hourAgo, deadlineHasTime: false, status: 'active' }, now)).toBe(false);
    expect(isOverdue({ deadline: yesterday, status: 'active' }, now)).toBe(true);
  });
  it('голий YYYY-MM-DD — саме цей локальний день (паритет із вебом/знімком; червоне при TZ=America/New_York)', () => {
    const noon = new Date(2026, 9, 18, 12, 0, 0);
    for (const deadline of ['2026-10-18', '2026-10-17']) {
      const t = { deadline, status: 'active' as const };
      expect(isOverdue(t, noon)).toBe(snapshotTaskOverdue(t, noon));
    }
    expect(isOverdue({ deadline: '2026-10-18', status: 'active' }, noon)).toBe(false);
    expect(isOverdue({ deadline: '2026-10-17', status: 'active' }, noon)).toBe(true);
  });
  it('застарілий прапорець старої збірки (deadlineTimeAt ≠ deadline) — лише день (P1)', () => {
    // Стара збірка перенесла точний дедлайн, переписавши лише `deadline`.
    expect(isOverdue({ deadline: hourAgo, deadlineHasTime: true, deadlineTimeAt: yesterday, status: 'active' }, now)).toBe(false);
    expect(isOverdue({ deadline: hourAgo, deadlineHasTime: true, status: 'active' }, now)).toBe(false);
    expect(snapshotTaskOverdue({ deadline: hourAgo, deadlineHasTime: true, deadlineTimeAt: inHour, status: 'active' }, now)).toBe(false);
  });
  it('завершена — ніколи', () => {
    expect(isOverdue({ deadline: hourAgo, deadlineHasTime: true, deadlineTimeAt: hourAgo, status: 'done' }, now)).toBe(false);
  });
});

describe('deadlineColor', () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(now); });
  afterAll(() => jest.useRealTimers());
  const task = (deadline: string, deadlineHasTime?: boolean) =>
    ({ id: 't', title: 'T', status: 'active', deadline, deadlineHasTime, deadlineTimeAt: deadlineHasTime ? deadline : undefined } as unknown as Task);
  it('минулий момент сьогодні — червоний; без часу — бурштиновий', () => {
    expect(deadlineColor(task(hourAgo, true), 'x')).toBe('#EF4444');
    expect(deadlineColor(task(hourAgo), 'x')).toBe('#F59E0B');
    expect(deadlineColor(task(inHour, true), 'x')).toBe('#F59E0B');
  });
});

describe('знімок годинника / віджета', () => {
  it('snapshotTaskOverdue — те саме правило', () => {
    expect(snapshotTaskOverdue({ deadline: hourAgo, deadlineHasTime: true, deadlineTimeAt: hourAgo, status: 'active' }, now)).toBe(true);
    expect(snapshotTaskOverdue({ deadline: hourAgo, status: 'active' }, now)).toBe(false);
    expect(snapshotTaskOverdue({ deadline: '2026-10-17', deadlineHasTime: true, status: 'active' }, now)).toBe(true);
    expect(snapshotTaskOverdue({ deadline: '2026-10-18', deadlineHasTime: true, status: 'active' }, now)).toBe(false);
  });
  it('прострочена з часом сьогодні — у групі прострочених (перша)', () => {
    const tasks = [
      { id: 'later', title: 'B', status: 'active', deadline: inHour, deadlineHasTime: true },
      { id: 'missed', title: 'A', status: 'active', deadline: hourAgo, deadlineHasTime: true },
      { id: 'old', title: 'C', status: 'active', deadline: yesterday },
    ] as unknown as Task[];
    expect(orderTodayTasks(tasks, now).map(t => t.id)).toEqual(['old', 'missed', 'later']);
  });
});
