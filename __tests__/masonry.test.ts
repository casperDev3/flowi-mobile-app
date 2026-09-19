import {
  assignMasonryColumns,
  heightsChangedMaterially,
  masonryColumnCount,
  nextMasonryLayout,
} from '@/utils/masonry';

describe('masonryColumnCount', () => {
  it('1 колонка на компактному, 2 від 600pt, 3 від 1100pt (межі включні)', () => {
    expect(masonryColumnCount(375)).toBe(1);
    expect(masonryColumnCount(599)).toBe(1);
    expect(masonryColumnCount(600)).toBe(2);
    // iPad 11" у ландшафті: 1194 − 232 сайдбар
    expect(masonryColumnCount(962)).toBe(2);
    expect(masonryColumnCount(1099)).toBe(2);
    expect(masonryColumnCount(1100)).toBe(3);
    // iPad 13" у ландшафті: 1366 − 232
    expect(masonryColumnCount(1134)).toBe(3);
  });
});

describe('assignMasonryColumns', () => {
  const items = (hs: (number | undefined)[]) => hs.map((height, i) => ({ key: `s${i}`, height }));

  it('кладе картку в найкоротшу колонку', () => {
    // s0=300 → c0; s1=100 → c1; s2 → c1 (100<300); s3 → c1 (200<300)? c1=200 → c1; s4: c0=300,c1=300 → c0
    expect(assignMasonryColumns(items([300, 100, 100, 100, 50]), 2)).toEqual([
      ['s0', 's4'],
      ['s1', 's2', 's3'],
    ]);
  });

  it('при рівних висотах — колонка з меншим індексом (вихідний порядок)', () => {
    expect(assignMasonryColumns(items([100, 100, 100, 100]), 2)).toEqual([['s0', 's2'], ['s1', 's3']]);
  });

  it('без вимірів — round-robin', () => {
    expect(assignMasonryColumns(items([undefined, undefined, undefined, undefined, undefined]), 3))
      .toEqual([['s0', 's3'], ['s1', 's4'], ['s2']]);
  });

  it('проміжок враховується у висоті колонки', () => {
    // Без gap s3 пішла б у c1 (c1=2×50=100 < c0=110); з gap 12 c1=124 > c0=122.
    expect(assignMasonryColumns(items([110, 50, 50, 10]), 2, 0)).toEqual([['s0'], ['s1', 's2', 's3']]);
    expect(assignMasonryColumns(items([110, 50, 50, 10]), 2, 12)).toEqual([['s0', 's3'], ['s1', 's2']]);
  });

  it('одна колонка — вихідний порядок; некоректна кількість — одна колонка', () => {
    expect(assignMasonryColumns(items([5, 500, 1]), 1)).toEqual([['s0', 's1', 's2']]);
    expect(assignMasonryColumns(items([5, 500]), 0)).toEqual([['s0', 's1']]);
  });

  it('кожна картка потрапляє рівно в одну колонку', () => {
    const hs = [120, 340, 90, 200, 60, 410, 150, 80, 95];
    const cols = assignMasonryColumns(items(hs), 3);
    expect(cols.flat().sort()).toEqual(hs.map((_, i) => `s${i}`).sort());
    // У межах колонки — вихідний порядок.
    for (const col of cols) {
      const idx = col.map(k => Number(k.slice(1)));
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });
});

describe('heightsChangedMaterially', () => {
  it('перший вимір — суттєва зміна; дрібний дрейф — ні', () => {
    expect(heightsChangedMaterially({ a: undefined }, { a: 100 }, ['a'])).toBe(true);
    expect(heightsChangedMaterially({ a: 100 }, { a: 110 }, ['a'], 24)).toBe(false);
    expect(heightsChangedMaterially({ a: 100 }, { a: 125 }, ['a'], 24)).toBe(true);
    expect(heightsChangedMaterially({ a: 100 }, {}, ['a'])).toBe(false);
  });
});

describe('nextMasonryLayout — стабільність', () => {
  const keys = ['a', 'b', 'c', 'd'];

  it('без суттєвих змін повертає той самий об\'єкт (без перемонтування карток)', () => {
    const first = nextMasonryLayout(null, keys, { a: 200, b: 100, c: 100, d: 100 }, 2);
    const again = nextMasonryLayout(first, keys, { a: 210, b: 95, c: 104, d: 100 }, 2);
    expect(again).toBe(first);
  });

  it('суттєва зміна з тими самими колонками — теж той самий об\'єкт колонок', () => {
    const first = nextMasonryLayout(null, keys, { a: 300, b: 100, c: 100, d: 100 }, 2);
    expect(first.columns).toEqual([['a'], ['b', 'c', 'd']]);
    const again = nextMasonryLayout(first, keys, { a: 360, b: 100, c: 100, d: 100 }, 2);
    expect(again.columns).toBe(first.columns);
    // База оновилась: наступне порівняння — від 360, а не від 300.
    expect(nextMasonryLayout(again, keys, { a: 370, b: 100, c: 100, d: 100 }, 2)).toBe(again);
  });

  it('суттєва зміна, що міняє баланс, — перерозкладає', () => {
    const first = nextMasonryLayout(null, keys, { a: 100, b: 100, c: 100, d: 100 }, 2);
    expect(first.columns).toEqual([['a', 'c'], ['b', 'd']]);
    const next = nextMasonryLayout(first, keys, { a: 400, b: 100, c: 100, d: 100 }, 2);
    expect(next.columns).toEqual([['a'], ['b', 'c', 'd']]);
  });

  it('нова кількість колонок або новий набір секцій — нова розкладка', () => {
    const heights = { a: 100, b: 100, c: 100, d: 100 };
    const two = nextMasonryLayout(null, keys, heights, 2);
    const three = nextMasonryLayout(two, keys, heights, 3);
    expect(three.columns).toEqual([['a', 'd'], ['b'], ['c']]);
    const fewer = nextMasonryLayout(three, ['a', 'c', 'd'], heights, 3);
    expect(fewer.columns).toEqual([['a'], ['c'], ['d']]);
  });
});
