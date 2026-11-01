import {
  FILTER_CONTROL_H, FILTER_HIT_SLOP, FILTER_SEARCH_THRESHOLD,
  countHiddenActive, filterTriggerText, overflowTriggerText, matchesQuery, partitionFilterItems, placeFilterMenu, typeaheadIndex,
} from '../components/ds/filters/filterLogic';

describe('константи', () => {
  it('36pt + слоп = 44pt', () => {
    expect(FILTER_CONTROL_H + FILTER_HIT_SLOP.top + FILTER_HIT_SLOP.bottom).toBe(44);
    expect(FILTER_SEARCH_THRESHOLD).toBe(8);
  });
});

describe('partitionFilterItems', () => {
  it('усе вміщається — нічого не сховано', () => {
    expect(partitionFilterItems({ widths: [100, 100, 100], available: 316, gap: 8, overflowWidth: 90 }))
      .toEqual({ visible: [0, 1, 2], hidden: [] });
  });
  it('порожній список', () => {
    expect(partitionFilterItems({ widths: [], available: 0, gap: 8, overflowWidth: 90 })).toEqual({ visible: [], hidden: [] });
  });
  it('ховає з хвоста й резервує місце під тригер', () => {
    // total 374 > 360; budget = 360 - 90 = 270 → (100+8)×2 = 216, третій (324) не влазить
    expect(partitionFilterItems({ widths: [100, 100, 100, 50], available: 360, gap: 8, overflowWidth: 90 }))
      .toEqual({ visible: [0, 1], hidden: [2, 3] });
  });
  it('після першого, що не вліз, наступні вузькі теж ховаються', () => {
    expect(partitionFilterItems({ widths: [100, 300, 20], available: 300, gap: 8, overflowWidth: 80 }))
      .toEqual({ visible: [0], hidden: [1, 2] });
  });
  it('закріплені видно завжди', () => {
    expect(partitionFilterItems({ widths: [100, 100, 100], pinned: [false, false, true], available: 300, gap: 8, overflowWidth: 80 }))
      .toEqual({ visible: [0, 2], hidden: [1] });
  });
  it('закріплене лишається, поки влазить саме', () => {
    expect(partitionFilterItems({ widths: [100, 100], pinned: [true, false], available: 200, gap: 8, overflowWidth: 80 }))
      .toEqual({ visible: [0], hidden: [1] });
  });
  it('закріплене, що не влазить навіть саме, йде в меню (не обрізається до нуля)', () => {
    expect(partitionFilterItems({ widths: [100, 100], pinned: [true, false], available: 50, gap: 8, overflowWidth: 80 }))
      .toEqual({ visible: [], hidden: [0, 1] });
  });
});

describe('countHiddenActive', () => {
  it('true → 1, число → число, решта → 0', () => {
    expect(countHiddenActive([0, 1, 2, 3], [true, 3, false, undefined])).toBe(4);
    expect(countHiddenActive([1], [true, false])).toBe(0);
  });
});

describe('filterTriggerText', () => {
  it('одиночний', () => {
    expect(filterTriggerText({ label: 'Проєкт', selectedLabels: ['Flowi'] })).toEqual({ prefix: 'Проєкт', value: 'Flowi' });
    expect(filterTriggerText({ label: 'Проєкт', selectedLabels: [] })).toEqual({ prefix: 'Проєкт', value: 'Усі' });
    expect(filterTriggerText({ label: 'Проєкт', selectedLabels: [], placeholder: 'Будь-який' }))
      .toEqual({ prefix: 'Проєкт', value: 'Будь-який' });
  });
  it('мультивибір 0 / 1 / 2', () => {
    expect(filterTriggerText({ label: 'Статус', multiple: true, selectedLabels: [] })).toEqual({ prefix: 'Статус', value: 'Усі' });
    expect(filterTriggerText({ label: 'Статус', multiple: true, selectedLabels: ['Прострочені'] }))
      .toEqual({ prefix: 'Статус', value: 'Прострочені' });
    expect(filterTriggerText({ label: 'Статус', multiple: true, selectedLabels: ['А', 'Б'] }))
      .toEqual({ prefix: null, value: 'Статус · 2' });
  });
  it('власний allLabel', () => {
    expect(filterTriggerText({ label: 'Теги', multiple: true, selectedLabels: [], allLabel: 'Будь-які' }).value).toBe('Будь-які');
  });
});

describe('matchesQuery', () => {
  it('без регістру, обрізає, порожній — так', () => {
    expect(matchesQuery('Усі проєкти', '  ПРОЄ ')).toBe(true);
    expect(matchesQuery('Flowi', 'x')).toBe(false);
    expect(matchesQuery('Flowi', '   ')).toBe(true);
  });
});

describe('typeaheadIndex', () => {
  const labels = ['Прострочені', 'У процесі', 'Порожні', 'Завершені'];
  it('шукає після from з обгортанням', () => {
    expect(typeaheadIndex(labels, 'п', -1)).toBe(0);
    expect(typeaheadIndex(labels, 'п', 0)).toBe(2);
    expect(typeaheadIndex(labels, 'п', 2)).toBe(0);
  });
  it('повторена літера циклить', () => {
    expect(typeaheadIndex(labels, 'пп', 0)).toBe(2);
  });
  it('фраза з кількох літер може лишитись на поточному', () => {
    expect(typeaheadIndex(labels, 'пор', -1)).toBe(2);
    expect(typeaheadIndex(labels, 'ЗАВ', 3)).toBe(3);
    expect(typeaheadIndex(labels, 'пр', 0)).toBe(0);
    expect(typeaheadIndex(labels, 'п', 0)).toBe(2);
  });
  it('обрізає пробіли запиту', () => {
    expect(typeaheadIndex(labels, ' у ', -1)).toBe(1);
  });
  it('пропускає вимкнені й повертає −1', () => {
    expect(typeaheadIndex(labels, 'п', -1, [true, false, false, false])).toBe(2);
    expect(typeaheadIndex(labels, 'х', 0)).toBe(-1);
    expect(typeaheadIndex([], 'п', 0)).toBe(-1);
    expect(typeaheadIndex(labels, '', 0)).toBe(-1);
  });
});

describe('overflowTriggerText', () => {
  it('без активних — лише підпис', () => {
    expect(overflowTriggerText('Фільтри', 0)).toBe('Фільтри');
    expect(overflowTriggerText('Фільтри', 2)).toBe('Фільтри · 2');
  });
});

describe('placeFilterMenu', () => {
  const win = { width: 1024, height: 768 };
  it('під тригером, коли місця досить', () => {
    const p = placeFilterMenu({ x: 100, y: 100, w: 120, h: 36 }, { w: 0, h: 200 }, win);
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(140);
    expect(p.width).toBe(240);
  });
  it('над тригером біля нижнього краю', () => {
    const p = placeFilterMenu({ x: 100, y: 700, w: 120, h: 36 }, { w: 0, h: 300 }, win);
    expect(p.placement).toBe('top');
    expect(p.bottom).toBe(768 - 700 + 4);
  });
  it('не вилазить за правий край', () => {
    const p = placeFilterMenu({ x: 950, y: 100, w: 60, h: 36 }, { w: 0, h: 100 }, win);
    expect(p.left + p.width).toBeLessThanOrEqual(1024 - 8);
  });
});
