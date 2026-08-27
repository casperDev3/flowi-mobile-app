/**
 * utils/projectUtils.ts — чиста логіка стану проєкту.
 *
 * Живе окремо від екрана, щоб її можна було перевірити тестом: імпорт
 * app/projects.tsx тягне за собою AsyncStorage і все дерево компонентів.
 */

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
}

export function isProjectArchived(project: Pick<ProjectLike, 'archivedAt'>): boolean {
  return !!project.archivedAt;
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
