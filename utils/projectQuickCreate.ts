/**
 * utils/projectQuickCreate.ts — що робити з назвою, набраною в пікері проєктів.
 *
 * Пікер уміє шукати; коли пошук нічого не знайшов, з того самого рядка можна
 * створити проєкт. Рішення «створити / повернути з архіву / нічого» — не про
 * вигляд, тому воно тут, а не в компоненті, і має дзеркального близнюка на
 * вебі (lib/project-quick-create.ts). Обидві копії мусять відповідати
 * однаково: інакше на телефоні людина побачить «Повернути з архіву», а на вебі
 * той самий рядок створить дубль.
 */

/** Мінімум, потрібний для рішення: чим проєкт зветься і чи він в архіві. */
export interface QuickCreateProject {
  id: string;
  name: string;
  /** Момент архівації; відсутній ключ — проєкт живий. */
  archivedAt?: string;
}

/**
 * Що пікер має запропонувати на набраний рядок.
 *
 * 'none'    — пропонувати нічого (порожній рядок).
 * 'select'  — така назва вже є серед ЖИВИХ: не створюємо нічого, а просто
 *             обираємо знайдений проєкт. Дубль із тією самою назвою людина
 *             потім не розрізнить, а синхронізація зведе їх у два різні записи.
 * 'create'  — такої назви немає ніде: створюємо новий проєкт.
 * 'restore' — така назва є серед АРХІВНИХ: повертаємо з архіву замість
 *             створення, бо історія проєкту (задачі, час, графіки) мусить
 *             лишитися цілою, а не початися заново під тією самою назвою.
 */
export type ProjectQuickAction<T extends QuickCreateProject> =
  | { kind: 'none' }
  | { kind: 'select'; project: T }
  | { kind: 'create'; name: string }
  | { kind: 'restore'; project: T; name: string };

/**
 * Ключ порівняння назв: обрізані пробіли, нижній регістр.
 *
 * «сайт», «Сайт» і «Сайт » — та сама назва для людини, і мусять бути тією
 * самою для нас. Свідомо звичайний toLowerCase(), а не toLocaleLowerCase з
 * локаллю: результат має посимвольно збігатися з веб-копією, а локалезалежне
 * зведення регістру (турецька «I») дало б на двох клієнтах різні відповіді на
 * той самий рядок.
 */
export function normalizeProjectName(value: string): string {
  return value.trim().toLowerCase();
}

/** Пізніше заморожений — той, що ближче до сьогодні; за рівних — менший id. */
function isFresherArchive(candidate: QuickCreateProject, current: QuickCreateProject): boolean {
  const a = candidate.archivedAt ?? '';
  const b = current.archivedAt ?? '';
  if (a !== b) return a > b;
  return candidate.id < current.id;
}

/**
 * Рішення за набраним рядком.
 *
 * Живий збіг сильніший за архівний: якщо назву носять і живий, і архівний
 * проєкт, людина мала на увазі той, що вже в списку.
 *
 * Порядок проєктів у масиві на рішення не впливає — на телефоні й на вебі він
 * різний. Коли збігів кілька (таке буває після синку), береться найпізніше
 * заморожений, а за рівного штампа — менший id.
 */
export function projectQuickAction<T extends QuickCreateProject>(
  projects: readonly T[],
  query: string,
): ProjectQuickAction<T> {
  const typed = query.trim();
  if (!typed) return { kind: 'none' };

  const key = normalizeProjectName(typed);
  let live: T | null = null;
  let archived: T | null = null;

  for (const project of projects) {
    if (!project || normalizeProjectName(project.name ?? '') !== key) continue;
    if (!project.archivedAt) {
      if (!live || project.id < live.id) live = project;
      continue;
    }
    if (!archived || isFresherArchive(project, archived)) archived = project;
  }

  if (live) return { kind: 'select', project: live };
  // Назву беремо зі ЗБЕРЕЖЕНОГО проєкту, а не з набраного: у підписі дії має
  // стояти те, як проєкт зветься насправді («Ремонт», а не «ремонт»).
  if (archived) return { kind: 'restore', project: archived, name: archived.name.trim() };
  return { kind: 'create', name: typed };
}
