import {
  DEFAULT_PRIORITY_LEVEL,
  LEGACY_TO_LEVEL,
  PRIORITY_BADGE_BG_ALPHA_HEX,
  PRIORITY_LEVEL_COLORS,
  PRIORITY_LEVELS,
  Task,
  applyTaskFilters,
  comparePriority,
  comparePriorityLevel,
  isLegacyPriority,
  isPriorityLevel,
  matchesPriorityFilter,
  normalizePriority,
  priorityBadgeBg,
  priorityColor,
  priorityFields,
  priorityLabel,
  sharedPriorityFields,
  sortTasks,
  toLegacyPriority,
} from '@/utils/taskUtils';

describe('константи пріоритету (CONTRACT §B.4)', () => {
  test('рівні, типовий, кольори, легасі-мапа', () => {
    expect(PRIORITY_LEVELS).toEqual([0, 1, 2, 3, 4, 5]);
    expect(DEFAULT_PRIORITY_LEVEL).toBe(3);
    expect(PRIORITY_LEVEL_COLORS).toEqual({
      0: '#EF4444', 1: '#F97316', 2: '#F59E0B', 3: '#3B82F6', 4: '#64748B', 5: '#94A3B8',
    });
    expect(LEGACY_TO_LEVEL).toEqual({ high: 1, medium: 3, low: 4 });
    expect(PRIORITY_BADGE_BG_ALPHA_HEX).toBe('26');
  });
});

describe('guards', () => {
  test('isPriorityLevel — лише цілі 0..5, не boolean/рядки', () => {
    for (const v of [0, 1, 2, 3, 4, 5]) expect(isPriorityLevel(v)).toBe(true);
    for (const v of [-1, 6, 1.5, '1', true, false, null, undefined, NaN]) expect(isPriorityLevel(v)).toBe(false);
  });
  test('isLegacyPriority', () => {
    expect(isLegacyPriority('high')).toBe(true);
    expect(isLegacyPriority('medium')).toBe(true);
    expect(isLegacyPriority('low')).toBe(true);
    expect(isLegacyPriority('urgent')).toBe(false);
    expect(isLegacyPriority(undefined)).toBe(false);
  });
});

describe('toLegacyPriority / priorityFields', () => {
  test('мапа запису', () => {
    expect([0, 1, 2, 3, 4, 5, null].map(l => toLegacyPriority(l as never)))
      .toEqual(['high', 'high', 'medium', 'medium', 'low', 'low', 'low']);
  });
  test('dual-write для tasks завжди пише легасі', () => {
    expect(priorityFields(0)).toEqual({ priorityLevel: 0, priority: 'high' });
    expect(priorityFields(3)).toEqual({ priorityLevel: 3, priority: 'medium' });
    expect(priorityFields(null)).toEqual({ priorityLevel: null, priority: 'low' });
  });
  test('спільні елементи: null — без ключа priority', () => {
    expect(sharedPriorityFields(null)).toEqual({ priorityLevel: null });
    expect('priority' in sharedPriorityFields(null)).toBe(false);
    expect(sharedPriorityFields(5)).toEqual({ priorityLevel: 5, priority: 'low' });
  });
});

describe('normalizePriority — точний алгоритм §B.3', () => {
  test('1. валідний рівень, узгоджений з легасі → рівень', () => {
    expect(normalizePriority({ priorityLevel: 0, priority: 'high' })).toBe(0);
    expect(normalizePriority({ priorityLevel: 2, priority: 'medium' })).toBe(2);
    expect(normalizePriority({ priorityLevel: 5 })).toBe(5);
  });
  test('1. старий клієнт змінив легасі після нас → легасі перемагає', () => {
    expect(normalizePriority({ priorityLevel: 0, priority: 'low' })).toBe(4);
    expect(normalizePriority({ priorityLevel: 5, priority: 'high' })).toBe(1);
  });
  test('2. явний null', () => {
    expect(normalizePriority({ priorityLevel: null })).toBeNull();
    expect(normalizePriority({ priorityLevel: null, priority: 'low' })).toBeNull();
    expect(normalizePriority({ priorityLevel: null, priority: 'high' })).toBe(1);
    expect(normalizePriority({ priorityLevel: null, priority: 'medium' })).toBe(3);
  });
  test('3. лише легасі', () => {
    expect(normalizePriority({ priority: 'high' })).toBe(1);
    expect(normalizePriority({ priority: 'medium' })).toBe(3);
    expect(normalizePriority({ priority: 'low' })).toBe(4);
  });
  test('4. нічого валідного → без пріоритету', () => {
    expect(normalizePriority({})).toBeNull();
    expect(normalizePriority({ priority: 'urgent', priorityLevel: 9 })).toBeNull();
    expect(normalizePriority({ priorityLevel: true, priority: undefined })).toBeNull();
    expect(normalizePriority({ priorityLevel: '2', priority: 'low' })).toBe(4);
  });
  test('round-trip: priorityFields → normalize стабільний для всіх значень', () => {
    for (const l of [0, 1, 2, 3, 4, 5, null] as const) {
      expect(normalizePriority(priorityFields(l))).toBe(l);
      expect(normalizePriority(sharedPriorityFields(l))).toBe(l);
    }
  });
  test('старий клієнт спільних елементів загубив priorityLevel', () => {
    const afterOld = { priority: sharedPriorityFields(0).priority };
    expect(normalizePriority(afterOld)).toBe(1);
  });
});

describe('відображення', () => {
  test('колір, фон, мітка', () => {
    expect(priorityColor(0)).toBe('#EF4444');
    expect(priorityColor(null)).toBeNull();
    expect(priorityBadgeBg(3)).toBe('#3B82F626');
    expect(priorityBadgeBg(null)).toBeNull();
    expect(priorityLabel(4)).toBe('P4');
    expect(priorityLabel(null)).toBe('');
  });
});

describe('сортування і фільтр', () => {
  test('comparePriorityLevel: P0…P5, null в кінці', () => {
    const arr: (0 | 1 | 2 | 3 | 4 | 5 | null)[] = [null, 5, 0, 3, null, 1];
    expect([...arr].sort(comparePriorityLevel)).toEqual([0, 1, 3, 5, null, null]);
    expect(comparePriorityLevel(null, null)).toBe(0);
    expect(comparePriorityLevel(2, 2)).toBe(0);
  });
  test('comparePriority нормалізує', () => {
    expect(comparePriority({ priority: 'high' }, { priorityLevel: 0 })).toBeGreaterThan(0);
    expect(comparePriority({}, { priority: 'low' })).toBeGreaterThan(0);
  });
  test('matchesPriorityFilter', () => {
    expect(matchesPriorityFilter({}, [])).toBe(true);
    expect(matchesPriorityFilter({}, [0, 1, 2, 3, 4, 5])).toBe(false);
    expect(matchesPriorityFilter({ priority: 'high' }, [1])).toBe(true);
    expect(matchesPriorityFilter({ priorityLevel: 2, priority: 'medium' }, [0, 1])).toBe(false);
  });

  const task = (over: Partial<Task>): Task => ({
    id: 't', title: 'T', description: '', status: 'active', subtasks: [], createdAt: '2026-06-01', ...over,
  });

  test('sortTasks priority: P0→P5, без пріоритету останні', () => {
    const tasks = [
      task({ id: 'none' }),
      task({ id: 'p5', ...priorityFields(5) }),
      task({ id: 'legacyHigh', priority: 'high' }),
      task({ id: 'p0', ...priorityFields(0) }),
    ];
    expect(sortTasks(tasks, 'priority').map(t => t.id)).toEqual(['p0', 'legacyHigh', 'p5', 'none']);
  });

  test('applyTaskFilters: мультивибір і легасі-параметр', () => {
    const tasks = [
      task({ id: 'a', ...priorityFields(0) }),
      task({ id: 'b', priority: 'high' }),
      task({ id: 'c', ...priorityFields(3) }),
      task({ id: 'd' }),
    ];
    const base = { filter: 'all' as const, search: '' };
    expect(applyTaskFilters(tasks, { ...base, priorities: [] }).map(t => t.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(applyTaskFilters(tasks, { ...base, priorities: [0, 3] }).map(t => t.id)).toEqual(['a', 'c']);
    expect(applyTaskFilters(tasks, { ...base, priority: 'high' }).map(t => t.id)).toEqual(['a', 'b']);
  });
});
