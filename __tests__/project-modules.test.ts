/**
 * __tests__/project-modules.test.ts — шаблон/розділи проєкту
 * (WORKSPACE_PROJECTS_CONTRACT §3.3).
 */
import { MODULES_BY_TEMPLATE, projectModules } from '../utils/projectUtils';

describe('projectModules', () => {
  it('a "work" template project has every module on', () => {
    expect(projectModules({ template: 'work' })).toEqual(MODULES_BY_TEMPLATE.work);
    expect(projectModules({ template: 'work' }).budget).toBe(true);
  });

  it('a "simple" template project has every optional module off', () => {
    expect(projectModules({ template: 'simple' })).toEqual(MODULES_BY_TEMPLATE.simple);
  });

  it('an explicit modules override wins even over a "simple" template', () => {
    const modules = { meetings: true, notes: false, time: false, budget: false, sprints: false };
    expect(projectModules({ template: 'simple', modules })).toEqual(modules);
  });

  it('a legacy project with neither field gets everything on (pre-existing behaviour)', () => {
    expect(projectModules({})).toEqual(MODULES_BY_TEMPLATE.work);
  });
});
