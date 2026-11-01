/**
 * components/projects/projectZoneStrings.ts — підписи зон екрана «Проєкти»
 * на планшеті (статична «Портфель» і динамічна «Деталі проєкту»).
 *
 * Окремий словник, а не store/translations.ts: зони — лише планшетна
 * розкладка цього екрана, і спільний словник тут не розростається. Мова — та
 * сама, що в застосунку (useI18n().lang). Українська — основна.
 */
import { useI18n } from '@/store/i18n';
import type { ProjectRole } from '@/constants/projectNav';
import type { ProjectListStatus } from '@/utils/projectStats';

const uk = {
  open: 'Відкрити проєкт',
  openA11y: 'Відкрити простір «{name}»',
  selectHint: 'Показує зведення проєкту в панелі праворуч',
  details: 'Деталі проєкту',
  portfolio: 'Портфель',
  portfolioA11y: 'Показники портфеля',
  scopeLive: 'Активні проєкти',
  scopeArchive: 'Архів',
  kpiProjects: 'Проєктів',
  kpiAtRisk: 'Під ризиком',
  kpiOverdue: 'Прострочені задачі',
  portfolioDone: 'Задач виконано',
  portfolioProgressA11y: 'Виконано в портфелі: {pct}%',
  deadlines: 'Найближчі терміни',
  noDeadlines: 'Найближчих термінів немає.',
  deadlineProject: 'термін проєкту',
  deadlineTask: 'дедлайн задачі',
  myRole: 'Моя роль',
  atRisk: 'Під ризиком',
  archived: 'В архіві',
  progress: 'Прогрес',
  doneOf: '{done}/{total} виконано',
  projectProgressA11y: 'Прогрес проєкту «{name}»: {pct}%',
  inProgress: 'В роботі',
  overdue: 'Прострочено',
  unassigned: 'Без виконавця',
  backlog: 'Без спринту',
  noTasks: 'Жодної задачі — відкрийте проєкт, щоб додати першу.',
  dates: 'Терміни',
  projectDeadline: 'Термін проєкту',
  nearestDeadline: 'Найближчий дедлайн',
  team: 'Команда',
  sprint: 'Спринт',
  noSprint: 'Немає відкритого спринту.',
  sprintProgressA11y: 'Прогрес спринта «{name}»: {pct}%',
  keyTasks: 'Ключові задачі',
  allDone: 'Усі задачі виконано.',
  noKeyTasks: 'Задач ще немає.',
  edit: 'Редагувати',
  editA11y: 'Редагувати «{name}»',
  status: {
    overdue: 'Прострочений',
    active: 'У процесі',
    empty: 'Порожній',
    done: 'Завершений',
  } as Record<ProjectListStatus, string>,
  roles: {
    owner: 'Власник',
    manager: 'Менеджер',
    member: 'Учасник',
    viewer: 'Глядач',
  } as Record<ProjectRole, string>,
};

export type ProjectZoneStrings = typeof uk;

const en: ProjectZoneStrings = {
  open: 'Open project',
  openA11y: 'Open “{name}” workspace',
  selectHint: 'Shows the project summary in the panel on the right',
  details: 'Project details',
  portfolio: 'Portfolio',
  portfolioA11y: 'Portfolio metrics',
  scopeLive: 'Active projects',
  scopeArchive: 'Archive',
  kpiProjects: 'Projects',
  kpiAtRisk: 'At risk',
  kpiOverdue: 'Overdue tasks',
  portfolioDone: 'Tasks done',
  portfolioProgressA11y: 'Portfolio done: {pct}%',
  deadlines: 'Upcoming deadlines',
  noDeadlines: 'No upcoming deadlines.',
  deadlineProject: 'project deadline',
  deadlineTask: 'task deadline',
  myRole: 'My role',
  atRisk: 'At risk',
  archived: 'Archived',
  progress: 'Progress',
  doneOf: '{done}/{total} done',
  projectProgressA11y: '“{name}” progress: {pct}%',
  inProgress: 'In progress',
  overdue: 'Overdue',
  unassigned: 'Unassigned',
  backlog: 'No sprint',
  noTasks: 'No tasks yet — open the project to add the first one.',
  dates: 'Dates',
  projectDeadline: 'Project deadline',
  nearestDeadline: 'Nearest deadline',
  team: 'Team',
  sprint: 'Sprint',
  noSprint: 'No open sprint.',
  sprintProgressA11y: '“{name}” sprint progress: {pct}%',
  keyTasks: 'Key tasks',
  allDone: 'All tasks are done.',
  noKeyTasks: 'No tasks yet.',
  edit: 'Edit',
  editA11y: 'Edit “{name}”',
  status: { overdue: 'Overdue', active: 'In progress', empty: 'Empty', done: 'Done' },
  roles: { owner: 'Owner', manager: 'Manager', member: 'Member', viewer: 'Viewer' },
};

export function projectZoneStrings(lang: string): ProjectZoneStrings {
  return lang === 'en' ? en : uk;
}

export function useProjectZoneStrings(): ProjectZoneStrings {
  const { lang } = useI18n();
  return projectZoneStrings(lang);
}

/** «{name}» → значення. */
export function fillZone(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((acc, [key, value]) => acc.split(`{${key}}`).join(String(value)), template);
}
