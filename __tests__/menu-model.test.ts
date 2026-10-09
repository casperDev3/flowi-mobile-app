import {
  dayListWidthFor,
  daySummary,
  emptySlotCount,
  orderedMealsOf,
  pickDay,
  visibleSpaces,
  weekKindLabel,
} from '@/components/menu/model';
import type { MenuEntry, MenuSpace } from '@/store/menu-api';

// menu-api тягне HTTP-клієнт зі сховищем; моделі він не потрібен.
jest.mock('@/store/api', () => ({ apiFetch: jest.fn() }));

const entry = (id: number, date: string, meal: MenuEntry['meal'], title: string, description = ''): MenuEntry => ({
  id, date, meal, title, description, has_photo: false, updated_at: 'v' + id,
});

const space = (id: string, archived = false): MenuSpace => ({
  id, name: id, is_owner: true, timezone: 'Europe/Kyiv', meals: ['lunch'], archived, today: '2026-10-07',
});

describe('menu model', () => {
  test('orderedMealsOf keeps fixed meal order', () => {
    expect(orderedMealsOf({ week_meals: ['snack', 'breakfast', 'dinner'] })).toEqual(['breakfast', 'dinner', 'snack']);
    expect(orderedMealsOf(null)).toEqual([]);
  });

  test('daySummary groups titles by meal and counts dishes', () => {
    const entries = [
      entry(1, '2026-10-05', 'lunch', 'Борщ'),
      entry(2, '2026-10-05', 'lunch', '', 'Салат без назви'),
      entry(3, '2026-10-05', 'dinner', 'Риба'),
      entry(4, '2026-10-06', 'lunch', 'Інший день'),
    ];
    const s = daySummary(entries, '2026-10-05', ['breakfast', 'lunch', 'dinner']);
    expect(s.dishes).toBe(3);
    expect(s.lines).toEqual([
      { meal: 'breakfast', titles: [] },
      { meal: 'lunch', titles: ['Борщ', 'Салат без назви'] },
      { meal: 'dinner', titles: ['Риба'] },
    ]);
  });

  test('emptySlotCount counts day × meal slots without dishes', () => {
    const menu = {
      week: '2026-10-05',
      week_meals: ['lunch', 'dinner'] as MenuEntry['meal'][],
      entries: [entry(1, '2026-10-05', 'lunch', 'Борщ'), entry(2, '2026-10-05', 'lunch', 'Ще')],
    };
    expect(emptySlotCount(menu)).toBe(13);
  });

  test('weekKindLabel', () => {
    expect(weekKindLabel('2026-10-05', '2026-10-05', '2026-10-12', false)).toBe('Цей тиждень');
    expect(weekKindLabel('2026-10-12', '2026-10-05', '2026-10-12', false)).toBe('Наступний тиждень');
    expect(weekKindLabel('2026-09-28', '2026-10-05', '2026-10-12', false)).toBe('Минулий тиждень');
    expect(weekKindLabel('2026-09-21', '2026-10-05', '2026-10-12', false)).toBe('Архів');
    expect(weekKindLabel('2026-10-05', '2026-10-05', '2026-10-12', true)).toBe('Архів');
  });

  test('visibleSpaces hides archived except the current one', () => {
    const list = [space('a'), space('b', true), space('c', true)];
    expect(visibleSpaces(list, false, 'a').map((x) => x.id)).toEqual(['a']);
    expect(visibleSpaces(list, false, 'c').map((x) => x.id)).toEqual(['a', 'c']);
    expect(visibleSpaces(list, true, 'a').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  test('pickDay keeps selection inside the week, else today, else Monday', () => {
    expect(pickDay('2026-10-08', '2026-10-05', '2026-10-07')).toBe('2026-10-08');
    expect(pickDay('2026-09-30', '2026-10-05', '2026-10-07')).toBe('2026-10-07');
    expect(pickDay('', '2026-10-12', '2026-10-07')).toBe('2026-10-12');
  });

  test('dayListWidthFor clamps to 280..360', () => {
    expect(dayListWidthFor(500)).toBe(280);
    expect(dayListWidthFor(900)).toBe(324);
    expect(dayListWidthFor(1200)).toBe(360);
  });
});
