/**
 * __tests__/meeting-projects.test.ts — зустріч → проєкт (CONTRACT §C.1, §I G3).
 */
import {
  expandRecurring,
  meetingProject,
  projectMeetingSections,
  withMeetingProject,
  type Meeting,
} from '@/utils/meetings';

const mk = (over: Partial<Meeting>): Meeting => ({
  id: 'x', title: 'Зустріч', date: '2026-09-13', time: '10:00', durationMinutes: 30, color: '#6366F1',
  projectId: 'p1', ...over,
});

describe('withMeetingProject', () => {
  test('ставить проєкт', () => {
    const m = mk({ projectId: undefined });
    delete m.projectId;
    expect(withMeetingProject(m, 'p2').projectId).toBe('p2');
  });

  test('той самий проєкт — той самий обʼєкт', () => {
    const m = mk({});
    expect(withMeetingProject(m, 'p1')).toBe(m);
  });

  test('порожній id видаляє ключ і лишає решту полів', () => {
    const m = { ...mk({}), extraFromOtherClient: 1 } as Meeting & { extraFromOtherClient: number };
    const cleared = withMeetingProject(m, null);
    expect('projectId' in cleared).toBe(false);
    expect(cleared.extraFromOtherClient).toBe(1);
    expect('projectId' in withMeetingProject(m, '')).toBe(false);
  });

  test('без ключа і без проєкту — той самий обʼєкт', () => {
    const m = mk({});
    delete m.projectId;
    expect(withMeetingProject(m, undefined)).toBe(m);
  });

  test('екземпляри повтору успадковують проєкт серії', () => {
    const series = mk({ id: 's', recurrence: { freq: 'daily', interval: 1 } });
    const inst = expandRecurring(series, new Date(2026, 8, 13), new Date(2026, 8, 15));
    expect(inst.every(i => i.projectId === 'p1')).toBe(true);
  });
});

describe('meetingProject', () => {
  const projects = [{ id: 'p1', name: 'Сайт', color: '#EF4444' }];
  test('знайдений проєкт', () => {
    expect(meetingProject(mk({}), projects)?.name).toBe('Сайт');
  });
  test('без проєкту або висяче посилання — null', () => {
    expect(meetingProject(mk({ projectId: undefined }), projects)).toBeNull();
    expect(meetingProject(mk({ projectId: 'ghost' }), projects)).toBeNull();
  });
});

describe('projectMeetingSections', () => {
  const now = new Date(2026, 8, 13, 12, 0, 0); // 13.09.2026 12:00 локально

  test('лише зустрічі цього проєкту; майбутні за часом, минулі за спаданням дати', () => {
    const meetings = [
      mk({ id: 'later', date: '2026-09-20', time: '09:00' }),
      mk({ id: 'soon', date: '2026-09-13', time: '15:00' }),
      mk({ id: 'now', date: '2026-09-13', time: '11:45', durationMinutes: 30 }), // іде просто зараз
      mk({ id: 'old', date: '2026-09-01' }),
      mk({ id: 'older', date: '2026-08-01' }),
      mk({ id: 'justEnded', date: '2026-09-13', time: '11:00', durationMinutes: 60 }), // кінець == now → минула
      mk({ id: 'other', projectId: 'p2', date: '2026-09-20' }),
      mk({ id: 'none', projectId: undefined, date: '2026-09-20' }),
    ];
    const { upcoming, past } = projectMeetingSections(meetings, 'p1', now);
    expect(upcoming.map(o => o.meeting.id)).toEqual(['now', 'soon', 'later']);
    expect(past.map(m => m.id)).toEqual(['justEnded', 'old', 'older']);
  });

  test('повтор — найближчий екземпляр, що ще не закінчився; оригінал у meeting', () => {
    const daily = mk({ id: 'd', date: '2026-09-01', time: '09:00', recurrence: { freq: 'daily', interval: 1 } });
    const { upcoming, past } = projectMeetingSections([daily], 'p1', now);
    expect(past).toEqual([]);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].meeting).toBe(daily);
    expect(upcoming[0].date).toBe('2026-09-14'); // сьогоднішня 09:00 вже минула
    expect(upcoming[0].time).toBe('09:00');
  });

  test('серія, що закінчилась (until у минулому) — у минулих', () => {
    const ended = mk({ id: 'e', date: '2026-08-01', recurrence: { freq: 'weekly', interval: 1, until: '2026-09-01' } });
    const { upcoming, past } = projectMeetingSections([ended], 'p1', now);
    expect(upcoming).toEqual([]);
    expect(past.map(m => m.id)).toEqual(['e']);
  });

  test('розгорнуті екземпляри (_origId) не дублюють серію', () => {
    const inst = mk({ id: 'd_2026-09-14', date: '2026-09-14', _origId: 'd' });
    expect(projectMeetingSections([inst], 'p1', now)).toEqual({ upcoming: [], past: [] });
  });

  test('давні й далекі серії — як веб lib/meeting-schedule.ts projectMeetingSections', () => {
    // Очікування отримані прогоном веб-реалізації на тих самих даних.
    const meetings = [
      mk({ id: 'd', date: '2025-01-01', recurrence: { freq: 'daily', interval: 1 } }),            // > 500 днів тому
      mk({ id: 'w', date: '2019-01-07', recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [0] } }), // > 300 тижнів
      mk({ id: 'wp', date: '2019-01-01', recurrence: { freq: 'weekly', interval: 1 } }),
      mk({ id: 'f', date: '2027-12-01', recurrence: { freq: 'monthly', interval: 1 } }),           // старт > 365 днів уперед
      mk({ id: 'w2', date: '2019-01-01', time: '09:00', recurrence: { freq: 'weekly', interval: 3, daysOfWeek: [2, 4] } }),
    ];
    const { upcoming, past } = projectMeetingSections(meetings, 'p1', now);
    expect(upcoming.map(o => [o.meeting.id, o.date, o.time])).toEqual([
      ['d', '2026-09-14', '10:00'],
      ['w', '2026-09-14', '10:00'],
      ['wp', '2026-09-15', '10:00'],
      ['w2', '2026-09-16', '09:00'],
      ['f', '2027-12-01', '10:00'],
    ]);
    expect(past).toEqual([]);
  });

  test('бита дата — пропускається, як на вебі', () => {
    expect(projectMeetingSections([mk({ date: 'bad' })], 'p1', now)).toEqual({ upcoming: [], past: [] });
  });

  test('порожній projectId — нічого', () => {
    expect(projectMeetingSections([mk({ projectId: undefined })], '', now)).toEqual({ upcoming: [], past: [] });
  });
});
