/**
 * Порядок секцій головного екрана — правило власника (CLAUDE.md →
 * «Правила екранів»): пошук речей → здоров'я + швидкі кнопки → фінанси →
 * звички → завдання → зустрічі → оплати.
 */
import fs from 'fs';
import path from 'path';

import {
  TODAY_SECTION_ORDER,
  orderTodaySections,
  todayGridSegments,
} from '@/components/today/sectionOrder';
import { assignMasonryColumns, masonryColumnCount } from '@/utils/masonry';

const RULE = ['health-quick', 'finance', 'habits', 'tasks', 'meetings', 'payments'];

describe('порядок секцій «Сьогодні»', () => {
  test('TODAY_SECTION_ORDER збігається з правилом власника', () => {
    expect([...TODAY_SECTION_ORDER]).toEqual(RULE);
  });

  test('orderTodaySections сортує за правилом, службові ключі — в кінці', () => {
    const shuffled = ['payments', 'x-extra', 'tasks', 'health-quick', 'meetings', 'habits', 'finance']
      .map(key => ({ key }));
    expect(orderTodaySections(shuffled).map(e => e.key)).toEqual([...RULE, 'x-extra']);
  });

  test('вимкнений модуль не переставляє решту', () => {
    const without = ['tasks', 'health-quick', 'payments'].map(key => ({ key }));
    expect(orderTodaySections(without).map(e => e.key)).toEqual(['health-quick', 'tasks', 'payments']);
  });

  test('планшет: звичайні секції — один masonry-блок, без порожніх шматків', () => {
    const items = RULE.map(key => ({ key }));
    const segments = todayGridSegments(items);
    expect(segments).toHaveLength(1);
    expect(segments[0].fullWidth).toBe(false);
    expect(segments[0].items.map(e => e.key)).toEqual(RULE);
    expect(todayGridSegments([])).toEqual([]);
  });

  test('fullWidth — окремий шматок, порядок не ламається', () => {
    const items = [
      { key: 'health-quick' }, { key: 'finance' },
      { key: 'banner', fullWidth: true },
      { key: 'habits' }, { key: 'tasks' },
    ];
    expect(todayGridSegments(items).map(s => [s.fullWidth, s.items.map(e => e.key)])).toEqual([
      [false, ['health-quick', 'finance']],
      [true, ['banner']],
      [false, ['habits', 'tasks']],
    ]);
    expect(todayGridSegments([{ key: 'all-modules-off', fullWidth: true }]).map(s => s.items.length)).toEqual([1]);
  });

  // Висоти, близькі до реальних карток планшета (з відступом 12 усередині).
  const HEIGHTS: Record<string, number> = {
    'health-quick': 260, finance: 130, habits: 180, tasks: 420, meetings: 150, payments: 200,
  };
  const GAP = 12;
  /** Верхній край кожної секції в розкладці masonry. */
  function tops(columns: string[][]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const column of columns) {
      let y = 0;
      for (const key of column) { out[key] = y; y += HEIGHTS[key] + GAP; }
    }
    return out;
  }

  test.each([
    ['портрет (medium)', 744, 2],
    ['ландшафт, широкий вміст (13" iPad)', 1150, 3],
    ['ландшафт (expanded, вузький вміст)', 1000, 2],
  ])('masonry %s: здоров\'я зліва вгорі, порядок за верхнім краєм = правило', (_label, width, cols) => {
    const count = masonryColumnCount(width);
    expect(count).toBe(cols);
    const columns = assignMasonryColumns(RULE.map(key => ({ key, height: HEIGHTS[key] })), count);
    expect(columns[0][0]).toBe('health-quick');
    // Жодної порожньої колонки за шести секцій і жодних «клітинок»-заглушок.
    columns.forEach(col => expect(col.length).toBeGreaterThan(0));
    expect(columns.flat().sort()).toEqual([...RULE].sort());
    // Кожна наступна за правилом секція починається не вище попередньої.
    const t = tops(columns);
    for (let i = 1; i < RULE.length; i++) expect(t[RULE[i]]).toBeGreaterThanOrEqual(t[RULE[i - 1]]);
  });

  test('телефон: одна колонка рівно в порядку правила', () => {
    expect(masonryColumnCount(390)).toBe(1);
    expect(assignMasonryColumns(RULE.map(key => ({ key, height: HEIGHTS[key] })), 1)).toEqual([RULE]);
  });

  test('гард: екран додає секції в порядку правила і бере сітку TodaySectionGrid', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'app/(tabs)/today.tsx'), 'utf8');
    const positions = RULE.map(key => src.indexOf(`key: '${key}'`));
    positions.forEach(p => expect(p).toBeGreaterThan(-1));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(src).toMatch(/orderTodaySections\(sections\)/);
    expect(src).toMatch(/<TodaySectionGrid /);
    // Реклама — поза сіткою і без обгортки: порожній AdSlot не лишає рядка.
    expect(src).not.toMatch(/key: 'sponsor'/);
    expect(src).toMatch(/\{loaded && sections\.length > 0 && <AdSlot slot="M1" \/>\}/);
    // Секції не мають власного зовнішнього marginBottom: 12 — відступ дає сітка.
    expect(src).not.toMatch(/marginBottom: 12/);
  });

  test('гард: сітка планшета — masonry з одним токеном відступу', () => {
    const grid = fs.readFileSync(path.join(__dirname, '..', 'components/today/TodaySectionGrid.tsx'), 'utf8');
    expect(grid).toMatch(/<MasonryColumns/);
    expect(grid).toMatch(/TODAY_SECTION_GAP = Spacing\.md/);
    expect(grid).not.toMatch(/empty-/);
  });

  test('правило записано в CLAUDE.md', () => {
    const md = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    expect(md).toMatch(/## Правила екранів/);
    expect(md).toContain('Головний екран: пошук речей → здоров\'я + швидкі кнопки → фінанси → звички → завдання → зустрічі → оплати. Змінювати порядок лише з дозволу власника.');
  });
});
