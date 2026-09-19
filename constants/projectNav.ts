/**
 * constants/projectNav.ts
 *
 * Розділи простору проєкту (WORKSPACE_PROJECTS_PLAN.md §3) — єдиний
 * маніфест, з якого будуються ОБИДВІ навігації простору проєкту: нижні таби
 * телефону (`app/project/[id]/_layout.tsx`) і сайдбар планшета
 * (`components/shared/ProjectSidebar.tsx`). Так само, як `constants/nav.ts`
 * годує і NavSidebar, і (посередньо) підсвітку активного пункту — розійтися
 * тут означало б, що телефон і планшет показують різний набір розділів
 * одного й того самого проєкту.
 *
 * Огляд і Завдання — завжди (contract §3: «Огляд і Завдання — завжди»);
 * решта — по `ProjectModules` (`utils/projectUtils.ts`), Бюджет — додатково
 * лише власнику (contract §4.1: бюджет бачить лише власник).
 */
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { ProjectModules } from '@/utils/projectUtils';

export type ProjectRole = 'owner' | 'member' | 'viewer';
export type ProjectSectionKey =
  | 'overview' | 'tasks' | 'meetings' | 'notes' | 'time' | 'budget' | 'sprints' | 'settings';

export interface ProjectNavItem {
  key: ProjectSectionKey;
  icon: IconSymbolName;
  labelKey: keyof Translations;
  /** Немає — розділ завжди увімкнений (Огляд/Завдання/Налаштування). */
  moduleKey?: keyof ProjectModules;
  /** Розділ бачить лише власник (contract §4.1) — незалежно від modules. */
  ownerOnly?: boolean;
}

export const PROJECT_NAV_ITEMS: readonly ProjectNavItem[] = [
  { key: 'overview', icon: 'square.grid.2x2.fill', labelKey: 'projectNavOverview' },
  { key: 'tasks',    icon: 'checklist',             labelKey: 'tabTasks' },
  { key: 'meetings', icon: 'calendar',              labelKey: 'navMeetings',       moduleKey: 'meetings' },
  { key: 'notes',    icon: 'note.text',             labelKey: 'notes',             moduleKey: 'notes' },
  { key: 'time',     icon: 'timer',                 labelKey: 'navTime',           moduleKey: 'time' },
  { key: 'budget',   icon: 'chart.pie.fill',        labelKey: 'navBudget',         moduleKey: 'budget', ownerOnly: true },
  { key: 'sprints',  icon: 'flag.checkered',        labelKey: 'sprints',           moduleKey: 'sprints' },
  { key: 'settings', icon: 'gearshape.fill',        labelKey: 'tabOptions' },
] as const;

/**
 * Видимі розділи для даних modules+role — той самий список і в порядку тому
 * ж, що PROJECT_NAV_ITEMS: порядок навігації не має залежати від того, хто
 * дивиться.
 */
export function visibleProjectNavItems(
  modules: ProjectModules,
  role: ProjectRole,
): ProjectNavItem[] {
  return PROJECT_NAV_ITEMS.filter(item => {
    if (item.ownerOnly && role !== 'owner') return false;
    if (item.moduleKey && !modules[item.moduleKey]) return false;
    return true;
  });
}

export function projectRoute(projectId: string, key: ProjectSectionKey): string {
  return `/project/${encodeURIComponent(projectId)}/${key}`;
}

/** id проєкту з шляху `/project/{id}/...`, або null — шлях не про проєкт. */
export function projectIdFromPathname(pathname: string): string | null {
  const match = /^\/project\/([^/]+)(?:\/|$)/.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Активний розділ проєкту з шляху, або null — не розпізнано. */
export function projectSectionFromPathname(pathname: string): ProjectSectionKey | null {
  const match = /^\/project\/[^/]+\/([^/]+)/.exec(pathname);
  const key = match?.[1];
  return (PROJECT_NAV_ITEMS.some(item => item.key === key) ? key : null) as ProjectSectionKey | null;
}
