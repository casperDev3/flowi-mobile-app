/**
 * components/tasks/taskPeriodStrings.ts — підписи випадного списку періоду й
 * фільтра «Термінові» (лише планшет). Маленький словник поруч із компонентом,
 * як components/shared/sidebar-strings.ts: телефон цих рядків не бачить, а
 * спільний store/translations.ts не роздуваємо планшетними підписами.
 */
import { useI18n } from '@/store/i18n';
import type { TaskPeriod } from '@/utils/taskPeriods';

const uk = {
  periods: {
    today: 'Сьогодні',
    tomorrow: 'Завтра',
    week: 'Тиждень',
    month: 'Місяць',
    all: 'Всі',
    undated: 'Без дедлайну',
  } as Record<TaskPeriod, string>,
  periodMenu: 'Період списку',
  period: 'Період',
  periodTrigger: (label: string, count: number) => `Період: ${label}, ${count}`,
  periodHint: 'Відкриває список періодів',
  urgent: 'Термінові',
  urgentHint: 'Лише пріоритети P0 і P1',
};

type TaskPeriodStrings = typeof uk;

const en: TaskPeriodStrings = {
  periods: {
    today: 'Today',
    tomorrow: 'Tomorrow',
    week: 'Week',
    month: 'Month',
    all: 'All',
    undated: 'No deadline',
  },
  periodMenu: 'List period',
  period: 'Period',
  periodTrigger: (label: string, count: number) => `Period: ${label}, ${count}`,
  periodHint: 'Opens the list of periods',
  urgent: 'Urgent',
  urgentHint: 'Only P0 and P1 priorities',
};

export function taskPeriodStrings(lang: string): TaskPeriodStrings {
  return lang === 'en' ? en : uk;
}

export function useTaskPeriodStrings(): TaskPeriodStrings {
  const { lang } = useI18n();
  return taskPeriodStrings(lang);
}
