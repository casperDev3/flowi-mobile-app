/**
 * __tests__/tasks-today-pane.test.tsx — колонка «Сьогодні» на планшеті
 * (рішення власника 2026-10-07): лише зустрічі дня + графік активності дня,
 * без списку завдань (завдання вже видно в списку ліворуч).
 */
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));

import React from 'react';
import { Text } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

import { TasksTodayPane } from '@/components/tasks/TasksTodayPane';
import { allTranslations } from '@/store/translations';
import { buildDayActivity, timelineHourRange, trackedMinutes } from '@/utils/dayActivity';
import type { Meeting } from '@/utils/meetings';

const tr = allTranslations.uk;
const DAY = new Date(2026, 9, 7);
const NOW = new Date(2026, 9, 7, 14, 30);
const iso = (h: number, m = 0, d = 7) => new Date(2026, 9, d, h, m).toISOString();

function meeting(id: string, time: string, durationMinutes: number, title = id): Meeting {
  return { id, title, date: '2026-10-07', time, durationMinutes, color: '#6366F1' };
}

describe('buildDayActivity', () => {
  it('collects finished task/meeting sessions and running timers, clipped to the day', () => {
    const blocks = buildDayActivity({
      tasks: [
        { id: 't1', title: 'Звіт', timeEntries: [
          { id: 'e1', startedAt: iso(9), endedAt: iso(10, 30), duration: 5400 },
          // учора — не сьогодні
          { id: 'e0', startedAt: iso(9, 0, 6), endedAt: iso(10, 0, 6), duration: 3600 },
          // почалась учора о 23:00 — обрізається до 00:00
          { id: 'e2', startedAt: iso(23, 0, 6), endedAt: iso(1, 0), duration: 7200 },
        ] },
      ],
      meetings: [{ id: 'm1', title: 'Стендап', timeEntries: [{ id: 'x', startedAt: iso(11), endedAt: iso(11, 15), duration: 900 }] }],
      timers: [{ id: 'task:t2', taskId: 't2', label: 'Код', startedAt: iso(14) }],
      day: DAY,
      now: NOW,
    });
    expect(blocks.map(b => [b.kind, b.startMin, b.endMin, b.running])).toEqual([
      ['task', 0, 60, false],
      ['task', 540, 630, false],
      ['meeting', 660, 675, false],
      ['task', 840, 870, true],
    ]);
    expect(trackedMinutes(blocks)).toBe(60 + 90 + 15 + 30);
  });

  it('counts overlapping sessions once', () => {
    expect(trackedMinutes([{ startMin: 60, endMin: 120 }, { startMin: 90, endMin: 150 }, { startMin: 200, endMin: 210 }])).toBe(100);
  });
});

describe('timelineHourRange', () => {
  it('defaults to 06–23 and widens to fit blocks and now', () => {
    expect(timelineHourRange([], 12 * 60)).toEqual({ startHour: 6, endHour: 23 });
    expect(timelineHourRange([{ startMin: 5 * 60 + 30, endMin: 6 * 60 }], 23 * 60 + 40)).toEqual({ startHour: 5, endHour: 24 });
  });
});

describe('TasksTodayPane', () => {
  let tree: any = null;
  afterEach(async () => {
    if (tree) { const t = tree; tree = null; await act(async () => { t.unmount(); }); }
  });

  async function mount(props: Partial<React.ComponentProps<typeof TasksTodayPane>> = {}) {
    const onOpenMeeting = jest.fn();
    await act(async () => {
      tree = create(
        <TasksTodayPane
          today={DAY}
          now={NOW}
          locale="uk-UA"
          meetings={[]}
          activitySources={{ tasks: [], meetings: [], timers: [] }}
          onOpenMeeting={onOpenMeeting}
          onOpenCalendar={jest.fn()}
          colors={{ text: '#000', sub: '#666', border: '#ddd', dim: '#f5f5f5', accent: '#7C3AED' }}
          tr={tr}
          {...props}
        />,
      );
    });
    const texts = tree.root.findAllByType(Text).map((n: any) => [].concat(n.props.children).join(''));
    return { onOpenMeeting, texts };
  }

  it('shows meetings and the activity chart, but no tasks section', async () => {
    const m = meeting('m1', '15:00', 60, 'Планування');
    const { texts, onOpenMeeting } = await mount({
      meetings: [{ meeting: m, phase: 'upcoming' }],
      activitySources: {
        tasks: [{ id: 't1', title: 'Звіт', timeEntries: [{ id: 'e1', startedAt: iso(9), endedAt: iso(10), duration: 3600 }] }],
        meetings: [],
        timers: [],
      },
    });

    expect(texts).toContain(tr.todayPaneMeetings);
    expect(texts).toContain(tr.todayPaneActivity);
    expect(texts.some((t: string) => t.includes('Планування'))).toBe(true);
    // Завдань у колонці більше немає — ні секції, ні карток.
    expect(texts.some((t: string) => /Дедлайни/.test(t))).toBe(false);

    expect(tree.root.findAllByProps({ testID: 'day-activity-timeline' }).length).toBeGreaterThan(0);
    expect(tree.root.findAll((n: any) => n.props.testID === 'day-activity-block' && typeof n.type === 'string').length).toBe(1);
    expect(tree.root.findAll((n: any) => n.props.testID === 'day-activity-now' && typeof n.type === 'string').length).toBe(1);

    const block = tree.root.find((n: any) => n.props.testID === 'day-activity-meeting' && typeof n.props.onPress === 'function');
    await act(async () => { block.props.onPress(); });
    expect(onOpenMeeting).toHaveBeenCalledWith(m);
  });

  it('shows the empty hints when there are no meetings and nothing tracked', async () => {
    const { texts } = await mount();
    expect(texts).toContain(tr.todayPaneNoMeetings);
    expect(texts).toContain(tr.todayPaneNoTracked);
    expect(tree.root.findAll((n: any) => n.props.testID === 'day-activity-block').length).toBe(0);
  });
});
