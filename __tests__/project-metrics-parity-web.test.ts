/**
 * __tests__/project-metrics-parity-web.test.ts — паритет метрик проєктів із вебом
 * (flowi-server-app/docs/specs/projects-analytics.md §7.3 п.4).
 *
 * Фікстура — ПОБАЙТОВА копія `flowi-web-app/lib/__fixtures__/project-metrics-parity.json`;
 * `expected` у ній рахує веб (`lib/__fixtures__/project-metrics-parity.build.mjs`).
 * Тут ті самі входи проганяються через мобільний `utils/projectStatsMetrics.ts`, а
 * вихід зводиться до вебової форми (імена полів мобільного трохи інші).
 *
 * Правила, узгоджені з build.mjs: `now` — ЛОКАЛЬНІ компоненти дати,
 * ideal / weeklyVelocity / avgWeekly — округлення до 1e-6.
 *
 * Відомі НЕУЗГОДЖЕНІ місця (рішення за власниками обох модулів, не тут):
 *  - sprintDays недатованого спринта: веб 1, мобільний 0;
 *  - velocityWindow.rows: веб — усі завершені спринти новіші зверху з
 *    `inWindow`, мобільний — лише вікно в хронологічному порядку;
 *  - порожнє вікно: веб avg* = null, мобільний 0.
 * Ці поля порівнюються в зведеному вигляді, решта — точно.
 */
import fs from 'fs';
import path from 'path';

import {
  currentSprintCard,
  isSprintOverdue,
  portfolioKpi,
  projectCounters,
  sprintBurndown,
  sprintDays,
  sprintVelocity,
  velocityWindow,
} from '@/utils/projectStatsMetrics';

const FIXTURE = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'project-metrics-parity-web.json'), 'utf8'),
);

const round = (value: number | null) => (value === null ? null : Math.round(value * 1e6) / 1e6);
const [y, m, d, h = 12, min = 0] = FIXTURE.now as number[];
const NOW = new Date(y, m - 1, d, h, min, 0, 0);
const { projects, tasks, sprints, columns, expected } = FIXTURE;
const PROJECT_IDS: string[] = projects.map((p: { id: string }) => p.id);
const SPRINT_IDS: string[] = sprints.map((s: { id: string }) => s.id);

describe('паритет метрик проєктів із вебом', () => {
  test('фікстура — побайтова копія вебової', () => {
    const web = path.join(__dirname, '..', '..', 'flowi-web-app', 'lib', '__fixtures__', 'project-metrics-parity.json');
    if (!fs.existsSync(web)) return; // репозиторії можуть лежати окремо
    expect(fs.readFileSync(path.join(__dirname, 'fixtures', 'project-metrics-parity-web.json'), 'utf8'))
      .toBe(fs.readFileSync(web, 'utf8'));
  });

  test.each(PROJECT_IDS)('лічильники картки %s', (id: string) => {
    const project = projects.find((p: { id: string }) => p.id === id);
    expect(projectCounters(project, tasks, sprints, columns, NOW)).toEqual(expected.counters[id]);
  });

  test.each(PROJECT_IDS)('поточний спринт %s', (id: string) => {
    const project = projects.find((p: { id: string }) => p.id === id);
    const card = currentSprintCard(project, sprints, tasks, NOW);
    const mapped = card && {
      sprintId: card.sprint.id,
      name: card.name,
      done: card.done,
      total: card.total,
      pct: card.pct,
      daysLeft: card.daysLeft,
      overdue: card.overdue,
      daysOverdue: card.overdueDays,
      dated: card.dated,
    };
    expect(mapped).toEqual(expected.currentSprint[id]);
  });

  test.each(SPRINT_IDS)('спринт %s: прострочення, тривалість, велосіті, burndown', (id: string) => {
    const sprint = sprints.find((s: { id: string }) => s.id === id);
    const want = expected.sprints[id];
    expect(isSprintOverdue(sprint, NOW)).toBe(want.overdue);
    expect(sprintVelocity(sprint, tasks)).toBe(want.velocity);
    const burndown = sprintBurndown(sprint, tasks, NOW);
    if (!want.burndown) {
      expect(burndown).toBeNull();
      // Неузгоджено: недатований — веб 1, мобільний 0 (див. шапку).
      expect(sprintDays(sprint)).toBe(0);
      return;
    }
    expect(sprintDays(sprint)).toBe(want.days);
    expect(burndown).not.toBeNull();
    const b = burndown!;
    const points = b.ideal.map((ideal, index) => ({
      index,
      day: b.dayKeys[Math.max(0, index - 1)],
      ideal: round(ideal),
      actual: b.actual[index],
    }));
    expect({
      days: b.days,
      scope: b.scope,
      todayIndex: b.todayIndex,
      undated: b.undated,
      carriedIn: b.carriedIn,
      sparse: b.insufficient,
      points,
    }).toEqual(want.burndown);
  });

  test.each(PROJECT_IDS)('велосіті й прогноз %s', (id: string) => {
    const want = expected.velocity[id];
    const got = velocityWindow(sprints, tasks, { projectId: id, remainingWork: expected.counters[id].open });
    const windowRows = want.rows
      .filter((row: { inWindow: boolean }) => row.inWindow)
      .map(({ inWindow: _inWindow, ...row }: { inWindow: boolean }) => row);
    const gotRows = got.rows.map(row => ({
      sprintId: row.sprint.id,
      velocity: row.velocity,
      days: row.days,
      weeklyVelocity: round(row.weeklyVelocity),
    }));
    // Порядок рядків неузгоджений — порівнюємо як множину.
    const byId = (a: { sprintId: string }, b: { sprintId: string }) => a.sprintId.localeCompare(b.sprintId);
    expect([...gotRows].sort(byId)).toEqual([...windowRows].sort(byId));
    expect(got.sampleSize).toBe(want.count);
    expect(got.undatedClosed).toBe(want.undatedClosed);
    expect(got.forecastWeeks).toBe(want.forecastWeeks);
    expect(round(got.avgVelocity)).toBe(want.avgVelocity ?? 0);
    expect(round(got.avgWeeklyVelocity)).toBe(want.avgWeeklyVelocity ?? 0);
  });

  test('портфель', () => {
    const got = portfolioKpi(projects, tasks, sprints, columns, NOW);
    const want = expected.portfolio;
    expect({
      projects: got.projects,
      total: got.total,
      done: got.done,
      pct: got.pct,
      inProgress: got.inProgress,
      overdue: got.overdue,
      unassigned: got.unassigned,
      weekly: got.weekly,
      avgWeekly: round(got.avgWeekly),
    }).toEqual({
      projects: want.projects,
      total: want.total,
      done: want.done,
      pct: want.pct,
      inProgress: want.inProgress,
      overdue: want.overdue,
      unassigned: want.unassigned,
      weekly: want.weekly,
      avgWeekly: want.avgWeekly,
    });
  });
});
