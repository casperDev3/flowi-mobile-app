/**
 * utils/projectQuickApply.ts — друга половина швидкого створення проєкту:
 * у що перетворюється МАСИВ проєктів і що стає обраним.
 *
 * Перша половина — рішення «створити / повернути з архіву / просто обрати» —
 * живе в projectQuickCreate.ts і має дзеркального близнюка на вебі. Тут же
 * суто мобільна річ: сховище телефона пише масив ЦІЛКОМ (saveSynced), і все,
 * чого в збереженому масиві немає, синхронізація вважає видаленим. Тому «як
 * саме змінюється список» — не деталь екрана, а місце, де помилка коштує
 * даних, і його треба тримати окремо й під тестом.
 */
import { projectQuickAction } from './projectQuickCreate';
import { setProjectArchived, type ProjectLike } from './projectUtils';

export interface ProjectQuickApplyResult<T> {
  /**
   * Що саме сталося. Потрібне викликачеві, бо рішення тут приймається зі
   * СХОВИЩА, а підпис кнопки людина прочитала зі стану екрана. Якщо синк
   * привіз проєкт із такою назвою, поки список задач був відкритий, ці двоє
   * розійдуться — і екран мусить мати змогу сказати, що відбулось насправді,
   * а не мовчки підмінити дію.
   */
  kind: 'none' | 'select' | 'restore' | 'create';
  /** Масив, який треба зберегти ЦІЛКОМ; null — зберігати нічого не треба. */
  projects: T[] | null;
  /** Який проєкт стає обраним; null — обирати нічого. */
  projectId: string | null;
}

/**
 * Застосувати набране в пікері до списку проєктів.
 *
 * Новий запис створює НЕ ця функція, а передана `createProject`: id і поточний
 * момент — не чиста логіка, а колір береться з того самого списку, який сюди
 * прийшов. Виклик лишає ці рішення екранові, а сама функція лишається
 * перевірною.
 *
 * Повернення з архіву йде через setProjectArchived — той самий помічник, яким
 * розархівовує екран проєктів. Другої копії правила «як зняти archivedAt» бути
 * не повинно: там ключ саме ВИДАЛЯЄТЬСЯ, і це навмисно (див. projectUtils).
 */
export function applyProjectQuickAction<T extends ProjectLike>(
  projects: readonly T[],
  typed: string,
  createProject: (name: string) => T,
): ProjectQuickApplyResult<T> {
  const action = projectQuickAction(projects, typed);

  switch (action.kind) {
    case 'none':
      return { kind: 'none', projects: null, projectId: null };

    case 'select':
      // Живий проєкт із такою назвою вже є: обираємо його й не пишемо нічого.
      // Двійника з тією самою назвою людина потім не розрізнить у списку.
      return { kind: 'select', projects: null, projectId: action.project.id };

    case 'restore': {
      const { id } = action.project;
      return {
        kind: 'restore',
        projects: projects.map(project => (project.id === id ? setProjectArchived(project, false) : project)),
        projectId: id,
      };
    }

    case 'create': {
      const created = createProject(action.name);
      return { kind: 'create', projects: [...projects, created], projectId: created.id };
    }
  }
}
