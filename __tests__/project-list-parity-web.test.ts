/**
 * __tests__/project-list-parity-web.test.ts — сортування й фільтр списку
 * проєктів (пункт 6) звіряються з вебом через спільну фікстуру.
 *
 * Фікстура — ПОБАЙТОВА копія `flowi-web-app/lib/__fixtures__/project-list-parity.json`;
 * веб ганяє ту саму через lib/project-list.test.mjs. Тут входи проганяються
 * через мобільний `utils/projectStats.ts` — назви функцій ті самі.
 */
import fs from 'fs';
import path from 'path';

import {
  filterProjects,
  parseProjectListPrefs,
  PROJECT_SORT_KEYS,
  projectStats,
  projectStatusCounts,
  projectStatusOf,
  sortProjects,
  type ProjectSortKey,
} from '@/utils/projectStats';

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'project-list-parity-web.json');
const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const [y, m, d, h, min] = FIXTURE.now as number[];
const NOW = new Date(y, m - 1, d, h, min, 0, 0);
const { projects, tasks, expected } = FIXTURE;

const all = projects.map((p: any) => projectStats(p, tasks, NOW));
const live = all.filter((s: any) => !s.archived);
const archive = all.filter((s: any) => s.archived);
const ids = (list: { project: { id: string } }[]) => list.map(s => s.project.id);

test('фікстура — побайтова копія вебової', () => {
  const web = path.join(__dirname, '..', '..', 'flowi-web-app', 'lib', '__fixtures__', 'project-list-parity.json');
  if (!fs.existsSync(web)) return; // репозиторії можуть лежати окремо
  expect(fs.readFileSync(FIXTURE_PATH, 'utf8')).toBe(fs.readFileSync(web, 'utf8'));
});

test('projectStatusOf — похідний статус без нового поля', () => {
  for (const s of all) expect([s.project.id, projectStatusOf(s)]).toEqual([s.project.id, expected.status[s.project.id]]);
});

test('остання активність — max(project.updatedAt, updatedAt задач), інакше createdAt', () => {
  for (const s of all) expect([s.project.id, s.lastActivityAt]).toEqual([s.project.id, expected.lastActivityAt[s.project.id]]);
});

test('sortProjects — кожен ключ дає порядок із фікстури, незалежно від вхідного порядку', () => {
  for (const key of PROJECT_SORT_KEYS) {
    expect([key, ids(sortProjects(live, key))]).toEqual([key, expected.liveSort[key]]);
    expect([key, ids(sortProjects([...live].reverse(), key))]).toEqual([key, expected.liveSort[key]]);
  }
  for (const [key, order] of Object.entries(expected.archiveSort)) {
    expect(ids(sortProjects(archive, key as ProjectSortKey))).toEqual(order);
  }
});

test('filterProjects — порожній набір не фільтрує, порядок зберігається', () => {
  const sorted = sortProjects(live, 'smart');
  for (const c of expected.liveFilter) {
    expect(ids(filterProjects(sorted, c.statuses))).toEqual(c.ids);
  }
  expect(projectStatusCounts(live)).toEqual(expected.liveCounts);
});

test('parseProjectListPrefs — сміття зі сховища дає валідний стан', () => {
  for (const c of expected.prefs) expect(parseProjectListPrefs(c.raw)).toEqual(c.parsed);
});
