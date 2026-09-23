/**
 * Паритет порядку колонки дошки з вебом (пункт 7+8): щойно створені — першими.
 * Фікстура — побайтова копія web `lib/__fixtures__/board-column-order-parity.json`
 * (там її ганяє `lib/board-column-order-parity.test.mjs` проти тих самих
 * функцій у `lib/task-group-limit.ts`).
 */
import fixture from './fixtures/board-column-order-parity.json';
import { isRecentlyCreated, limitBoardColumn } from '@/utils/taskGroupLimit';

type Item = { id: string; createdAt?: string | null };
const items = fixture.items as Item[];
const recent = fixture.recent as Record<string, boolean>;

describe('board-column-order parity', () => {
  test('isRecentlyCreated — як у фікстурі', () => {
    for (const item of items) {
      expect([item.id, isRecentlyCreated(item, fixture.now, fixture.windowMs)]).toEqual([item.id, recent[item.id]]);
    }
  });

  test.each(fixture.cases)('limitBoardColumn: $name', expected => {
    const limit = expected.limit === null ? Infinity : expected.limit;
    const group = limitBoardColumn(items, fixture.now, limit, fixture.windowMs);
    expect(group.visible.map(item => item.id)).toEqual(expected.visible);
    expect(group.total).toBe(expected.total);
    expect(group.truncated).toBe(expected.truncated);
  });
});
