/**
 * __tests__/project-quick-create.test.ts — рішення пікера за набраним рядком.
 *
 * Дзеркало веб-тесту lib/project-quick-create.test.mjs: ті самі випадки, ті
 * самі очікування. Розбіжність тут означає, що на телефоні людина побачить
 * «Повернути з архіву», а на вебі той самий рядок створить дубль.
 */

import { projectQuickAction, type QuickCreateProject } from '../utils/projectQuickCreate';

const live: QuickCreateProject = { id: 'p1', name: 'Сайт' };
const archived: QuickCreateProject = { id: 'p2', name: 'Ремонт', archivedAt: '2026-01-01T00:00:00.000Z' };
const projects = [live, archived];

describe('projectQuickAction', () => {
  test('порожній рядок — не пропонуємо нічого', () => {
    expect(projectQuickAction(projects, '')).toEqual({ kind: 'none' });
    expect(projectQuickAction(projects, '   ')).toEqual({ kind: 'none' });
  });

  test('незнайома назва — створити, з обрізаними пробілами', () => {
    expect(projectQuickAction(projects, '  Новий  ')).toEqual({ kind: 'create', name: 'Новий' });
  });

  test('точний збіг із живим — обрати наявний, а не створити дубль', () => {
    // Регістр і пробіли не рахуються: «сайт», «Сайт» і «Сайт » — та сама назва.
    for (const query of ['Сайт', 'сайт', ' САЙТ ']) {
      expect(projectQuickAction(projects, query)).toEqual({ kind: 'select', project: live });
    }
  });

  test('точний збіг з архівним — повернути з архіву', () => {
    // Дубля не створюємо: історія проєкту мусить лишитись цілою.
    expect(projectQuickAction(projects, ' ремонт ')).toEqual({
      kind: 'restore',
      project: archived,
      name: 'Ремонт',
    });
  });

  test('живий збіг сильніший за архівний', () => {
    const twin: QuickCreateProject = { id: 'p3', name: 'Сайт', archivedAt: '2026-02-01T00:00:00.000Z' };
    expect(projectQuickAction([twin, live], 'сайт')).toEqual({ kind: 'select', project: live });
  });

  test('кілька архівних збігів — найпізніше заморожений', () => {
    const older: QuickCreateProject = { id: 'a1', name: 'Ремонт', archivedAt: '2025-01-01T00:00:00.000Z' };
    const newer: QuickCreateProject = { id: 'a2', name: 'ремонт', archivedAt: '2026-05-01T00:00:00.000Z' };
    expect(projectQuickAction([older, newer], 'Ремонт')).toEqual({
      kind: 'restore',
      project: newer,
      name: 'ремонт',
    });
  });

  test('порядок масиву на відповідь не впливає', () => {
    // На телефоні порядок з AsyncStorage після синку, на вебі — з data-context.
    const forward = projectQuickAction(projects, 'ремонт');
    const backward = projectQuickAction([...projects].reverse(), 'ремонт');
    expect(forward).toEqual(backward);
  });
});
