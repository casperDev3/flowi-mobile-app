/**
 * components/notifications/labels.ts — підписи й вигляд категорій/подій.
 *
 * Тексти самих сповіщень приходять із сервера вже відрендереними, а от
 * назви категорій і подій у матриці налаштувань клієнт локалізує сам за
 * кодом (notifications-module.md §11): зміна мови не має вимагати запиту.
 * Код, якого ця збірка ще не знає, показується підписом із сервера.
 */
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { NotificationChannel } from '@/api/notifications';
import type { Translations } from '@/store/translations';

type Tr = Translations;

const CATEGORY_KEYS: Record<string, keyof Tr> = {
  tasks_projects: 'ncCatTasksProjects',
  meetings_finance: 'ncCatMeetingsFinance',
  training_health: 'ncCatTrainingHealth',
  system: 'ncCatSystem',
};

const EVENT_KEYS: Record<string, keyof Tr> = {
  'task.assigned': 'ncEvTaskAssigned',
  'task.status_changed': 'ncEvTaskStatusChanged',
  'task.mentioned': 'ncEvTaskMentioned',
  'task.commented': 'ncEvTaskCommented',
  'task.deadline_soon': 'ncEvTaskDeadlineSoon',
  'task.overdue': 'ncEvTaskOverdue',
  'task.reminder': 'ncEvTaskReminder',
  'sprint.started': 'ncEvSprintStarted',
  'sprint.closed': 'ncEvSprintClosed',
  'project.invite': 'ncEvProjectInvite',
  'meeting.reminder': 'ncEvMeetingReminder',
  'subscription.due_today': 'ncEvSubscriptionDue',
  'budget.limit_exceeded': 'ncEvBudgetExceeded',
  'finance.balance_forecast_negative': 'ncEvBalanceForecast',
  'workout.program_assigned': 'ncEvWorkoutAssigned',
  'workout.today': 'ncEvWorkoutToday',
  'health.quest_closed': 'ncEvQuestClosed',
  'health.streak_at_risk': 'ncEvStreakAtRisk',
  'health.measurement_reminder': 'ncEvMeasurement',
  'feedback.status_changed': 'ncEvFeedback',
  'feedback.incoming': 'tlEvFeedbackIncoming',
  'training.invite': 'tlEvTrainingInvite',
  'training.program_assigned': 'tlEvTrainingProgramAssigned',
  'training.session_completed': 'tlEvTrainingSessionCompleted',
  'training.quest_assigned': 'tlEvTrainingQuestAssigned',
  'training.quest_completed': 'tlEvTrainingQuestCompleted',
  'training.comment': 'tlEvTrainingComment',
  'training.leaderboard_weekly': 'tlEvTrainingLeaderboardWeekly',
  'registration.requested': 'ncEvRegistration',
};

export function categoryLabel(tr: Tr, key: string, fallback?: string): string {
  const k = CATEGORY_KEYS[key];
  return (k && (tr[k] as string)) || fallback || key;
}

export function eventLabel(tr: Tr, key: string, fallback?: string): string {
  const k = EVENT_KEYS[key];
  return (k && (tr[k] as string)) || fallback || key;
}

export function channelLabel(tr: Tr, channel: NotificationChannel): string {
  if (channel === 'in_app') return tr.ncChannelInApp;
  if (channel === 'push') return tr.ncChannelPush;
  return tr.ncChannelEmail;
}

export interface CategoryLook {
  icon: IconSymbolName;
  color: string;
}

/** Кольори — акценти відповідних розділів (CLAUDE.md, «Кольори»). */
const CATEGORY_LOOK: Record<string, CategoryLook> = {
  tasks_projects: { icon: 'checklist', color: '#7C3AED' },
  meetings_finance: { icon: 'calendar', color: '#0EA5E9' },
  training_health: { icon: 'heart.fill', color: '#10B981' },
  system: { icon: 'info.circle.fill', color: '#F59E0B' },
};

const DEFAULT_LOOK: CategoryLook = { icon: 'bell.fill', color: '#7C3AED' };

export function categoryLook(category: string): CategoryLook {
  return CATEGORY_LOOK[category] ?? DEFAULT_LOOK;
}

/** Подія з власною іконкою в картці інбоксу (решта — іконка категорії). */
const EVENT_ICONS: Record<string, IconSymbolName> = {
  'task.assigned': 'person.badge.plus',
  'task.mentioned': 'bubble.left.and.bubble.right.fill',
  'task.commented': 'bubble.left.and.bubble.right.fill',
  'task.deadline_soon': 'flag.fill',
  'task.overdue': 'exclamationmark.triangle.fill',
  'task.reminder': 'bell.fill',
  'sprint.started': 'flag.checkered',
  'sprint.closed': 'flag.checkered',
  'project.invite': 'person.2.fill',
  'meeting.reminder': 'calendar',
  'subscription.due_today': 'creditcard.fill',
  'budget.limit_exceeded': 'chart.pie.fill',
  'registration.requested': 'person.badge.key.fill',
};

export function eventLook(category: string, eventType: string): CategoryLook {
  const base = categoryLook(category);
  const icon = EVENT_ICONS[eventType];
  return icon ? { ...base, icon } : base;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/**
 * «щойно» / «5 хв тому» / «3 год тому» / «вчора» / дата. Порівняння днів — за
 * календарною датою в поясі пристрою, а не `toDateString()` (CLAUDE.md).
 */
export function formatNotificationTime(iso: string, now: Date, tr: Tr, lang: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const diffMs = now.getTime() - at.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return tr.ncJustNow;
  if (minutes < 60) return fill(tr.ncMinutesAgo, { n: minutes });
  const sameDay = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  if (sameDay) return fill(tr.ncHoursAgo, { n: Math.floor(minutes / 60) });
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const time = at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (at.getFullYear() === yesterday.getFullYear() && at.getMonth() === yesterday.getMonth() && at.getDate() === yesterday.getDate()) {
    return `${tr.ncYesterday}, ${time}`;
  }
  const sameYear = at.getFullYear() === now.getFullYear();
  return at.toLocaleDateString(locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return fill(template, values);
}
