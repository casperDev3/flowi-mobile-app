/**
 * __tests__/project-task-in-place.test.ts — задача проєкту відкривається ТАМ,
 * де її відкрили (R1).
 *
 * Сторож по джерелах простору проєкту (app/project/**, components/projects/**):
 *  - жодного переходу в особистий простір (`/(tabs)`, `/subtasks`) — саме так
 *    людина «випадала» з проєкту;
 *  - жодного `open:` на екран «Завдання» проєкту з інших розділів — Спринти,
 *    Беклог, Календар, Обговорення відкривають картку в себе
 *    (ProjectTaskSheet). Сам екран «Завдань» і ?open= з пушу — дозволені.
 */
import fs from 'fs';
import path from 'path';

const ROOTS = ['app/project', 'components/projects'];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sources = ROOTS.flatMap(root => files(path.join(__dirname, '..', root)))
  .map(file => ({ file: path.relative(path.join(__dirname, '..'), file), text: fs.readFileSync(file, 'utf8') }));

test('простір проєкту не веде в особисті Завдання чи /subtasks', () => {
  const offenders = sources
    .filter(({ text }) => /push\(\s*\{?\s*(pathname:\s*)?['"`]\/(\(tabs\)|subtasks)/.test(text))
    .map(({ file }) => file);
  expect(offenders).toEqual([]);
});

test('інші розділи не перекидають на «Завдання» проєкту, щоб відкрити задачу', () => {
  const offenders = sources
    .filter(({ file }) => !file.endsWith(path.join('project', '[id]', 'tasks.tsx')))
    .filter(({ text }) => /pathname:\s*'\/project\/\[id\]\/tasks',\s*params:\s*\{[^}]*\bopen:/.test(text))
    .map(({ file }) => file);
  expect(offenders).toEqual([]);
});
