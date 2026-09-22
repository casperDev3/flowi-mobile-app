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

// ─── Скільки розділів влазить у нижню панель (L2) ────────────────────────────

/**
 * Мінімальна ширина таба, при якій підпис читається повністю.
 *
 * Число не вигадане: нативний прогін зміряв ОСОБИСТУ панель (5 табів на
 * 402pt) — кнопки 80–81pt завширшки, підписи цілі. Він же зміряв панель
 * ПРОЄКТУ на тому самому пристрої: вісім табів дали по 50pt, і чотири підписи
 * з восьми обрізались трикрапкою («Завда…», «Нотат…», «Бюдж…», «Спри…»).
 * Тобто 80pt — це ширина, на якій підпис таба цього застосунку вже вміщується,
 * підтверджена виміром, а не оцінкою шрифту.
 *
 * Запас на Dynamic Type тут не потрібен окремо: підпис таба має стелю
 * масштабування (TAB_LABEL_MAX_FONT_SCALE) і numberOfLines=1, тож на
 * найбільшому шрифті обріжеться довгий підпис, а не розкладка панелі.
 */
export const PROJECT_TAB_MIN_WIDTH = 80;

/**
 * Скільки табів має сенс малювати на панелі такої ширини.
 *
 * Три — підлога: панель із двох кнопок перестає бути навігацією. Стелі
 * немає — її ставить сам список розділів.
 */
export function projectTabCapacity(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 3;
  return Math.max(3, Math.floor(width / PROJECT_TAB_MIN_WIDTH));
}

/**
 * Порядок, у якому розділи борються за місце в панелі.
 *
 * Це НЕ порядок показу (він завжди маніфестний, див. splitProjectNav) — це
 * відповідь на питання «кого лишити внизу, коли всі не влазять». Зверху —
 * те, куди заходять щодня (Огляд і Завдання є завжди), знизу — те, куди
 * заходять раз на спринт або раз на проєкт: Налаштування відкривають, щоб
 * налаштувати розділи, Бюджет — щоб звести витрати. Правило звіту дослівно:
 * не ховати щоденне заради рідкісного.
 */
const PROJECT_TAB_PRIORITY: readonly ProjectSectionKey[] = [
  'overview', 'tasks', 'meetings', 'time', 'notes', 'sprints', 'budget', 'settings',
];

export interface ProjectNavSplit {
  /** Розділи, що лишаються кнопками панелі — у порядку маніфесту. */
  tabs: ProjectNavItem[];
  /** Решта — у розділі «Ще» (app/project/[id]/more.tsx). Порожньо = «Ще» не потрібен. */
  overflow: ProjectNavItem[];
}

/**
 * Ділить видимі розділи на «в панелі» і «в Ще».
 *
 * Чому взагалі ділимо: шаблон `work` вмикає всі п'ять опційних розділів
 * одразу, Огляд/Завдання/Налаштування є завжди, Бюджет додається власнику —
 * тобто ВІСІМ табів це стан за замовчуванням, а не крайній випадок. Вісім
 * кнопок у 402pt не вміщуються за визначенням (50pt на кнопку), і половина
 * підписів стає нечитабельною одразу після створення проєкту.
 *
 * Чому «Ще», а не «сховати підписи» чи «прокрутка»: підпис — єдине, що
 * відрізняє однакові за розміром іконки, а горизонтальна прокрутка в нижній
 * панелі ховає пункти без жодної ознаки, що вони існують. «Ще» лишає всі
 * розділи досяжними за той самий один зайвий тап і чесно показує, скільки їх.
 *
 * Коли влазять усі — ділення немає: `overflow` порожній, і панель виглядає
 * рівно так, як раніше (простий проєкт — три таби).
 */
export function splitProjectNav(items: readonly ProjectNavItem[], width: number): ProjectNavSplit {
  const capacity = projectTabCapacity(width);
  if (items.length <= capacity) return { tabs: [...items], overflow: [] };

  // Одне місце з'їдає сам «Ще», тому в панелі лишається capacity - 1 розділ.
  const keepCount = Math.max(1, capacity - 1);
  const ranked = [...items].sort(
    (left, right) => PROJECT_TAB_PRIORITY.indexOf(left.key) - PROJECT_TAB_PRIORITY.indexOf(right.key),
  );
  const keep = new Set(ranked.slice(0, keepCount).map(item => item.key));
  return {
    // Порядок показу — манiфестний: панель не має перетасовуватись від того,
    // які саме розділи увімкнені.
    tabs: items.filter(item => keep.has(item.key)),
    overflow: items.filter(item => !keep.has(item.key)),
  };
}

/**
 * Чи стоїть користувач зараз у розділі, схованому в «Ще».
 *
 * Потрібно самій панелі: таб «Ще» мусить світитись як активний, поки
 * відкритий будь-який його розділ, інакше на цих екранах панель не показує
 * «ви тут» узагалі — жодна кнопка не підсвічена.
 */
export function isProjectOverflowActive(
  pathname: string,
  overflow: readonly ProjectNavItem[],
): boolean {
  const section = projectSectionFromPathname(pathname);
  return section != null && overflow.some(item => item.key === section);
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
