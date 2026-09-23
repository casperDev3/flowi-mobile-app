/**
 * __tests__/notification-labels.test.ts — підписи матриці налаштувань
 * локалізуються на клієнті за кодом (notifications-module.md §11), час у
 * картках інбоксу — відносний, тихі години крокують через північ.
 */
import { categoryLabel, eventLabel, formatNotificationTime } from '@/components/notifications/labels';
import { stepTime } from '@/components/notifications/QuietHoursCard';
import { allTranslations } from '@/store/translations';

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

/** Коди реєстру сервера (`core/notifications/registry.py`). */
const SERVER_EVENTS = [
  'task.assigned', 'task.status_changed', 'task.mentioned', 'task.commented', 'task.deadline_soon',
  'task.overdue', 'task.reminder', 'sprint.started', 'sprint.closed', 'project.invite',
  'meeting.reminder', 'subscription.due_today', 'budget.limit_exceeded', 'finance.balance_forecast_negative',
  'workout.program_assigned', 'workout.today', 'health.quest_closed', 'health.streak_at_risk',
  'health.measurement_reminder', 'feedback.status_changed', 'registration.requested',
];
const SERVER_CATEGORIES = ['tasks_projects', 'meetings_finance', 'training_health', 'system'];

describe('підписи категорій і подій', () => {
  it.each(['uk', 'en'] as const)('%s: кожна подія й категорія реєстру має власний переклад', lang => {
    const tr = allTranslations[lang];
    for (const code of SERVER_EVENTS) {
      const label = eventLabel(tr, code, 'SERVER');
      expect(label).not.toBe('SERVER');
      expect(label.length).toBeGreaterThan(0);
    }
    for (const key of SERVER_CATEGORIES) expect(categoryLabel(tr, key, 'SERVER')).not.toBe('SERVER');
  });

  it('невідомий код — підпис із сервера, а без нього сам код', () => {
    const tr = allTranslations.uk;
    expect(eventLabel(tr, 'future.event', 'Нова подія')).toBe('Нова подія');
    expect(eventLabel(tr, 'future.event')).toBe('future.event');
  });
});

describe('formatNotificationTime', () => {
  const now = new Date(2026, 8, 23, 12, 0, 0);
  const tr = allTranslations.uk;
  it('щойно / хвилини / години / вчора', () => {
    expect(formatNotificationTime(new Date(2026, 8, 23, 11, 59, 40).toISOString(), now, tr, 'uk')).toBe('щойно');
    expect(formatNotificationTime(new Date(2026, 8, 23, 11, 55).toISOString(), now, tr, 'uk')).toBe('5 хв тому');
    expect(formatNotificationTime(new Date(2026, 8, 23, 9, 0).toISOString(), now, tr, 'uk')).toBe('3 год тому');
    expect(formatNotificationTime(new Date(2026, 8, 22, 20, 0).toISOString(), now, tr, 'uk')).toMatch(/^вчора, /);
  });
  it('некоректна дата — порожньо, а не «Invalid Date»', () => {
    expect(formatNotificationTime('nope', now, tr, 'uk')).toBe('');
  });
});

describe('stepTime', () => {
  it('крокує через північ і відновлюється з некоректного значення', () => {
    expect(stepTime('23:30', '22:00', 30)).toBe('00:00');
    expect(stepTime('00:00', '22:00', -30)).toBe('23:30');
    expect(stepTime(null, '08:00', 30)).toBe('08:30');
  });
});
