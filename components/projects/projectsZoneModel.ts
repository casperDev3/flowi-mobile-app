/**
 * components/projects/projectsZoneModel.ts — чисті правила екрана «Проєкти»
 * у трьох зонах на ПЛАНШЕТІ (Layout System v2.4; паритет із вебом
 * components/projects/projects-zone-model.ts): стан «під ризиком», найближчі
 * терміни портфеля, ключові задачі вибраного проєкту, зведення ролей.
 *
 * Нічого не рахує заново з того, що вже дає utils/projectStats.ts, — лише
 * складає готові числа для статичної й динамічної зон. Без React: перевіряє
 * юніт-тест (__tests__/projects-zone-model.test.ts).
 */
import type { ProjectRole } from '@/constants/projectNav';
import { projectStatusOf, type ProjectStats } from '@/utils/projectStats';
import type { SprintCard } from '@/utils/projectStatsMetrics';

/** Скільки діб до власного терміну проєкту — вже «під ризиком». */
export const RISK_WINDOW_DAYS = 7;

/** Локальна доба дати: `YYYY-MM-DD` — як є (без зсуву UTC), ISO — як момент. */
function dayNumber(value: string | Date): number | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  if (value.length > 10 && value.includes('T')) return dayNumber(new Date(value));
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Скільки діб від сьогодні до дати (від'ємне — минула); null — не дата. */
export function daysUntil(value: string | undefined | null, now: Date): number | null {
  if (!value) return null;
  const target = dayNumber(value);
  const today = dayNumber(now);
  if (target === null || today === null) return null;
  return Math.round(target - today);
}

/**
 * «Під ризиком» — ще НЕ прострочений, але горить: власний термін проєкту за
 * ≤ 7 діб при незакритій роботі, або поточний спринт протермінований.
 */
export function isProjectAtRisk(
  stats: Pick<ProjectStats, 'overdue' | 'projectOverdue' | 'total' | 'done' | 'archived' | 'project'>,
  sprint: SprintCard | null | undefined,
  now: Date,
): boolean {
  if (stats.archived) return false;
  const status = projectStatusOf(stats);
  if (status === 'overdue' || status === 'done') return false;
  if (sprint?.overdue) return true;
  const days = daysUntil(stats.project.deadline, now);
  return days !== null && days >= 0 && days <= RISK_WINDOW_DAYS && stats.done < stats.total;
}

export interface UpcomingDeadline {
  projectId: string;
  name: string;
  color: string;
  /** Власний термін проєкту або найближчий дедлайн його задач. */
  date: string;
  kind: 'project' | 'task';
  days: number;
}

/**
 * Найближчі терміни портфеля — по одному на проєкт: власний термін, якщо він
 * попереду й робота не закрита, інакше найближчий дедлайн відкритих задач.
 * Минуле сюди не потрапляє — воно вже в лічильнику «Прострочені».
 */
export function upcomingDeadlines(stats: readonly ProjectStats[], now: Date, limit = 5): UpcomingDeadline[] {
  const rows: UpcomingDeadline[] = [];
  for (const item of stats) {
    if (item.archived) continue;
    const { project } = item;
    const own = daysUntil(project.deadline, now);
    if (project.deadline && own !== null && own >= 0 && item.done < Math.max(1, item.total)) {
      rows.push({ projectId: project.id, name: project.name, color: project.color, date: project.deadline, kind: 'project', days: own });
      continue;
    }
    const task = daysUntil(item.upcomingDeadline, now);
    if (item.upcomingDeadline && task !== null && task >= 0) {
      rows.push({ projectId: project.id, name: project.name, color: project.color, date: item.upcomingDeadline, kind: 'task', days: task });
    }
  }
  return rows
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, 'uk'))
    .slice(0, limit);
}

export interface KeyTaskLike {
  id: string;
  title: string;
  projectId?: string;
  status: string;
  deadline?: string;
}

/**
 * Ключові задачі проєкту для динамічної зони: відкриті, спершу прострочені,
 * далі за дедлайном, далі за назвою.
 */
export function keyProjectTasks<T extends KeyTaskLike>(tasks: readonly T[], projectId: string, now: Date, limit = 5): T[] {
  const rank = (task: T) => {
    const days = daysUntil(task.deadline, now);
    return days !== null && days < 0 ? 0 : task.deadline ? 1 : 2;
  };
  return tasks
    .filter(task => task.projectId === projectId && task.status !== 'done')
    .sort((a, b) => {
      const byRank = rank(a) - rank(b);
      if (byRank) return byRank;
      if (a.deadline && b.deadline && a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '', 'uk');
    })
    .slice(0, limit);
}

/** Скільки проєктів у кожній моїй ролі — лише ролі, що трапились. */
export function roleSummary(roles: readonly ProjectRole[]): { role: ProjectRole; count: number }[] {
  const order: ProjectRole[] = ['owner', 'manager', 'member', 'viewer'];
  const counts = new Map<ProjectRole, number>();
  for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1);
  return order.filter(role => counts.has(role)).map(role => ({ role, count: counts.get(role)! }));
}
