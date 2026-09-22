/**
 * utils/projectOverview.ts — агрегати дашборда «Огляд» простору проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: «прогрес і дедлайн, прострочене, найближчі
 * наради, поточний спринт, години за тиждень, витрачено з бюджету»).
 *
 * Чисті функції окремо від екрана — та сама причина, що й projectUtils.ts:
 * app/project/[id]/overview.tsx тягне AsyncStorage і все дерево компонентів,
 * тож перевірити арифметику дашборда тестом можна лише звідси.
 *
 * Прогрес/дедлайн/прострочене й найближчі наради дашборд бере готовими з
 * projectStats() і projectMeetingSections() — тут лише те, чого там нема:
 * тиждень часу і місяць бюджету.
 */
import { accountById, type Account } from './accounts';
import { budgetTxCurrency } from './budgetUtils';
import { isSameMonth } from './dateUtils';
import type { Transaction } from './financeUtils';
import { openSprintsForProject, sprintProgress, type Sprint, type SprintTaskLike } from './sprintUtils';

export interface ProjectTimeEntryLike {
  projectId?: string;
  /** Тривалість сесії, секунди. */
  duration: number;
  /**
   * Дата запису. `time_entries` насправді зберігає ПОВНИЙ ISO-рядок
   * (`toISOString()`, як і скрізь по CLAUDE.md), а не голе 'YYYY-MM-DD' —
   * `parseEntryDate()` нижче приймає обидва формати.
   */
  date: string;
}

/**
 * Дата запису часу як `Date` — приймає і повний ISO (`toISOString()`, як
 * реально пише трекер і його дзеркало з таймера), і голе 'YYYY-MM-DD'.
 * `new Date('YYYY-MM-DD')` парситься як UTC-північ, а `${date}T00:00` — як
 * ЛОКАЛЬНА північ; повний ISO-рядок уже несе свій час і пояс, тож його чіпати
 * не можна — саме на цьому обидва формати розходились і ISO ставав Invalid Date.
 */
export function parseEntryDate(date: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00` : date);
}

/** Понеділок поточного тижня, 00:00 локального часу. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay(); // 0=нд … 6=сб
  const diff = day === 0 ? 6 : day - 1; // тиждень починається з понеділка
  d.setDate(d.getDate() - diff);
  return d;
}

/** Секунди, відпрацьовані над проєктом із понеділка поточного тижня. */
export function hoursThisWeekSeconds(
  entries: readonly ProjectTimeEntryLike[],
  projectId: string,
  now: Date = new Date(),
): number {
  const from = startOfWeek(now);
  return entries.reduce((acc, entry) => {
    if (entry.projectId !== projectId) return acc;
    const at = parseEntryDate(entry.date);
    if (Number.isNaN(at.getTime()) || at < from) return acc;
    return acc + (Number.isFinite(entry.duration) ? entry.duration : 0);
  }, 0);
}

/**
 * «Поточний спринт» — перший ВІДКРИТИЙ спринт проєкту (порядок sortSprints —
 * тобто найстаріший з відкритих, «Тиждень 1» перед «Тиждень 2»), або null,
 * якщо відкритих немає.
 */
export function currentSprint(sprints: readonly Sprint[], projectId: string): Sprint | null {
  return openSprintsForProject(sprints, projectId)[0] ?? null;
}

export interface CurrentSprintStats {
  sprint: Sprint;
  total: number;
  done: number;
}

export function currentSprintStats<T extends SprintTaskLike>(
  sprints: readonly Sprint[],
  tasks: readonly T[],
  projectId: string,
): CurrentSprintStats | null {
  const sprint = currentSprint(sprints, projectId);
  if (!sprint) return null;
  const { total, done } = sprintProgress(tasks, sprint.id);
  return { sprint, total, done };
}

/**
 * Витрачено з бюджету проєкту ЗА ПОТОЧНИЙ місяць — сума витрат у ВАЛЮТІ
 * БЮДЖЕТУ. Витрати в інших валютах навмисно не додаються й не конвертуються
 * (те саме рішення, що в особистого бюджету — utils/budgetUtils.ts): дашборд
 * — один рядок цифр, а не звіт про неврахований залишок.
 */
export function budgetSpentThisMonth(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  projectId: string,
  budgetCurrency: string,
  now: Date = new Date(),
): number {
  const accountList = [...accounts];
  return transactions.reduce((acc, tx) => {
    if (tx.type !== 'expense' || tx.projectId !== projectId) return acc;
    const at = new Date(tx.date);
    if (Number.isNaN(at.getTime()) || !isSameMonth(at, now)) return acc;
    if (budgetTxCurrency(tx, accountList, budgetCurrency) !== budgetCurrency) return acc;
    return acc + tx.amount;
  }, 0);
}

/** Рахунок за id — реекспорт зручності для екрана (не тягнути ще один імпорт). */
export { accountById };
