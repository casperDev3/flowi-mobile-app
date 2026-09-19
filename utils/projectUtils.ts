/**
 * utils/projectUtils.ts — чиста логіка стану проєкту.
 *
 * Живе окремо від екрана, щоб її можна було перевірити тестом: імпорт
 * app/projects.tsx тягне за собою AsyncStorage і все дерево компонентів.
 */

/** Шаблон проєкту при створенні (контракт §3.3): «Робочий» / «Простий». */
export type ProjectTemplate = 'work' | 'simple';

/** Розділи проєкту, що вмикаються/вимикаються в налаштуваннях (Огляд і Завдання — завжди). */
export interface ProjectModules {
  meetings: boolean;
  notes: boolean;
  time: boolean;
  budget: boolean;
  sprints: boolean;
}

/** work → усі розділи; simple → лише Огляд і Завдання. */
export const MODULES_BY_TEMPLATE: Record<ProjectTemplate, ProjectModules> = {
  work: { meetings: true, notes: true, time: true, budget: true, sprints: true },
  simple: { meetings: false, notes: false, time: false, budget: false, sprints: false },
};

export interface ProjectLike {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /**
   * Момент архівації. Стан ЯВНИЙ, а не похідний із задач: інакше проєкт із
   * незавершеними задачами неможливо заморозити, а порожній проєкт (0 із 0)
   * довелося б рахувати виконаним на 100%.
   */
  archivedAt?: string;
  /**
   * Шаблон і вимкнені/увімкнені розділи (контракт §3.3). Адитивні поля —
   * проєкти, створені до цієї фази, поля не мають, і `projectModules()`
   * нижче трактує їхню відсутність як «усе увімкнено» (той стан, у якому вони
   * й існували раніше: жодного перемикача розділів не було).
   */
  template?: ProjectTemplate;
  modules?: ProjectModules;
}

export function isProjectArchived(project: Pick<ProjectLike, 'archivedAt'>): boolean {
  return !!project.archivedAt;
}

/**
 * Реальний набір увімкнених розділів проєкту.
 *
 * `modules` явний → він і є істина (навіть якщо частково вимкнений шаблоном
 * `work` — користувач міг вимкнути розділ вручну). Немає `modules`, але є
 * `template` → дефолт шаблону. Немає жодного поля (проєкт старіший за цю
 * фазу) → усе увімкнено, як було до появи налаштувань розділів.
 */
export function projectModules(project: Pick<ProjectLike, 'template' | 'modules'>): ProjectModules {
  if (project.modules) return project.modules;
  if (project.template) return MODULES_BY_TEMPLATE[project.template];
  return MODULES_BY_TEMPLATE.work;
}

/**
 * Виставити або зняти архівність.
 *
 * При поверненні з архіву ключ саме ВИДАЛЯЄТЬСЯ, а не ставиться в undefined.
 * Причина в синку: undefined зникає при JSON-серіалізації, тож потрібний
 * результат вийшов би випадково, як побічний ефект. Явне видалення робить
 * намір видимим у коді й не залежить від деталей серіалізації.
 */
export function setProjectArchived<T extends ProjectLike>(project: T, archived: boolean): T {
  if (archived) return { ...project, archivedAt: new Date().toISOString() };
  const { archivedAt: _removed, ...rest } = project;
  void _removed;
  return rest as T;
}
