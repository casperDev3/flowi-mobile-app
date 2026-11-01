/**
 * Паритет наступної копії повторюваної задачі (верифікатор паритету, 2026-10-18):
 * чекбокс «Готово» на екрані «Завдання» будує копію інлайн. Вона мусить мати ті
 * самі поля, що nextOccurrenceRecord (годинник), веб nextOccurrenceTask і сервер
 * watch/actions.py: createdAt = момент створення копії, без completedAt,
 * updatedAt і полів здачі результату попередньої копії.
 */
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
const start = src.indexOf('const nextTask: Task = {');
const block = src.slice(start, src.indexOf('return [...updated, nextTask];', start));

describe('Tasks checkbox — next recurring copy fields', () => {
  it('builds the copy in one place', () => {
    expect(start).toBeGreaterThan(0);
  });
  it('sets createdAt to the creation moment, not the original task createdAt', () => {
    expect(block).toMatch(/createdAt:\s*created\.at/);
  });
  it('drops completedAt, updatedAt and result-review fields', () => {
    expect(block).toMatch(/delete nextTask\.completedAt/);
    expect(block).toMatch(/delete nextTask\.updatedAt/);
    for (const f of ['reviewState', 'reviewFeedback', 'resultSummary', 'resultLinks', 'resultFiles']) expect(block).toContain(`'${f}'`);
  });
  it('rewrites deadline fields through applyDeadlineFields (C1)', () => {
    expect(block).toMatch(/applyDeadlineFields\(nextTask, nextFields\)/);
  });
});
