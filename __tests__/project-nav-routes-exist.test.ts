import fs from 'fs';
import path from 'path';

import { PROJECT_NAV_ITEMS, visibleProjectNavItems, projectRoute, projectIdFromPathname, projectSectionFromPathname } from '../constants/projectNav';
import { MODULES_BY_TEMPLATE } from '../utils/projectUtils';

/**
 * __tests__/project-nav-routes-exist.test.ts — дзеркало
 * `nav-routes-exist.test.ts` для маніфесту простору проєкту
 * (`constants/projectNav.ts`): кожен розділ мусить мати файл екрана в
 * `app/project/[id]/`, інакше таб/пункт сайдбара нікуди не веде.
 */
const APP_PROJECT_DIR = path.join(__dirname, '..', 'app', 'project', '[id]');

describe('розділи простору проєкту', () => {
  it('кожен розділ манiфесту має файл екрана', () => {
    const missing = PROJECT_NAV_ITEMS
      .filter(item => !fs.existsSync(path.join(APP_PROJECT_DIR, `${item.key}.tsx`)))
      .map(item => item.key);
    expect(missing).toEqual([]);
  });

  it('проєкт «Робочий» (усі модулі) показує всі розділи', () => {
    const items = visibleProjectNavItems(MODULES_BY_TEMPLATE.work, 'owner');
    expect(items.map(i => i.key)).toEqual(['overview', 'tasks', 'meetings', 'notes', 'time', 'budget', 'sprints', 'settings']);
  });

  it('проєкт «Простий» (лише Огляд/Завдання) ховає модульні розділи', () => {
    const items = visibleProjectNavItems(MODULES_BY_TEMPLATE.simple, 'owner');
    expect(items.map(i => i.key)).toEqual(['overview', 'tasks', 'settings']);
  });

  it('Бюджет бачить лише власник (contract §4.1), навіть коли модуль увімкнено', () => {
    const asMember = visibleProjectNavItems(MODULES_BY_TEMPLATE.work, 'member');
    const asViewer = visibleProjectNavItems(MODULES_BY_TEMPLATE.work, 'viewer');
    expect(asMember.some(i => i.key === 'budget')).toBe(false);
    expect(asViewer.some(i => i.key === 'budget')).toBe(false);
  });

  it('projectRoute/projectIdFromPathname/projectSectionFromPathname узгоджені', () => {
    const route = projectRoute('p-1', 'sprints');
    expect(route).toBe('/project/p-1/sprints');
    expect(projectIdFromPathname(route)).toBe('p-1');
    expect(projectSectionFromPathname(route)).toBe('sprints');
    expect(projectIdFromPathname('/projects')).toBeNull();
    expect(projectSectionFromPathname('/project/p-1')).toBeNull();
  });
});
