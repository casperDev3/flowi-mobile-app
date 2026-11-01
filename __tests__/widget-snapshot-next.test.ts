/**
 * `next` у знімку віджета (watch-lockscreen-v1.md §8.1) — для віджетів
 * екрана блокування: найближча зустріч, що ще не скінчилась, і перша
 * незавершена задача дня в порядку годинника.
 */
import { buildWidgetSnapshot, type WidgetSnapshotInput } from '@/utils/widgetSnapshot';

const NOW = new Date(2026, 9, 18, 12, 0, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

function input(overrides: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput {
  return { now: NOW, lang: 'uk', authed: true, myUserId: '7', ...overrides };
}

describe('next.meeting', () => {
  it('пропускає зустрічі, що вже скінчились; endsAt = start + тривалість', () => {
    const snap = buildWidgetSnapshot(input({
      meetings: [
        { id: 'past', title: 'Ранкова', date: '2026-10-18', time: '09:00', durationMinutes: 60, color: '#000' },
        { id: 'now', title: 'Триває', date: '2026-10-18', time: '11:30', durationMinutes: 60, color: '#000', location: 'Зал' },
        { id: 'later', title: 'Пізніше', date: '2026-10-18', time: '15:00', durationMinutes: 30, color: '#000' },
      ],
    }));
    expect(snap.next.meeting).toEqual({ title: 'Триває', startsAt: at(18, 11, 30), endsAt: at(18, 12, 30), location: 'Зал' });
  });

  it('завтрашня — коли сьогодні вже нічого', () => {
    const snap = buildWidgetSnapshot(input({
      meetings: [{ id: 'm', title: 'Завтра', date: '2026-10-19', time: '09:00', durationMinutes: 15, color: '#000' }],
    }));
    expect(snap.next.meeting?.startsAt).toBe(at(19, 9));
  });
});

describe('next.task', () => {
  it('перша незавершена — прострочена раніше за сьогоднішню', () => {
    const snap = buildWidgetSnapshot(input({
      tasks: [
        { id: 'today', title: 'Сьогодні', status: 'active', subtasks: [], createdAt: '', deadline: at(18, 12) },
        { id: 'old', title: 'Прострочене', status: 'active', subtasks: [], createdAt: '', deadline: at(15, 12) },
        { id: 'done', title: 'Готове', status: 'done', subtasks: [], createdAt: '', history: [{ id: 'x', at: at(18, 9), type: 'done' }] },
      ],
    }));
    expect(snap.next.task).toEqual({ id: 'old', title: 'Прострочене', deadline: at(15, 12), hasTime: false, overdue: true });
    expect(snap.tasks).toEqual({ done: 1, total: 3 });
  });

  it('після виходу — порожньо', () => {
    const snap = buildWidgetSnapshot(input({
      authed: false,
      tasks: [{ id: 'old', title: 'x', status: 'active', subtasks: [], createdAt: '', deadline: at(15, 12) }],
    }));
    expect(snap.next).toEqual({ meeting: null, task: null });
  });
});
