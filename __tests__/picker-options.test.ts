/**
 * __tests__/picker-options.test.ts — фільтрація списку вибору і рішення про «+».
 *
 * Головне, що тут захищається: набране в пошуку САМЕ ПО СОБІ записом не стає.
 * Раніше категорію вводили вільним текстом, і кожна одруківка ставала новою
 * категорією з однією операцією всередині назавжди. Тепер текст лише фільтрує,
 * а створення — окремий явний натиск.
 */

import { filterPickerOptions, pickerCreateName } from '../utils/pickerOptions';

const options = [
  { id: 'a', label: 'Їжа' },
  { id: 'b', label: 'Транспорт' },
  { id: 'c', label: 'Їжа поза домом' },
];

describe('filterPickerOptions', () => {
  test('порожній запит лишає весь список', () => {
    expect(filterPickerOptions(options, '   ')).toBe(options);
  });

  test('шукає підрядком і без огляду на регістр', () => {
    expect(filterPickerOptions(options, 'їжа').map(o => o.id)).toEqual(['a', 'c']);
    expect(filterPickerOptions(options, 'ТРАНС').map(o => o.id)).toEqual(['b']);
  });

  test('нічого не знайшлось — порожній список, а не виняток', () => {
    expect(filterPickerOptions(options, 'нічого')).toEqual([]);
  });
});

describe('pickerCreateName', () => {
  test('порожній запит створювати нічого не пропонує', () => {
    expect(pickerCreateName(options, '')).toBeNull();
    expect(pickerCreateName(options, '   ')).toBeNull();
  });

  test('нова назва — пропонуємо саме її, обрізану з боків', () => {
    expect(pickerCreateName(options, '  Подарунки ')).toBe('Подарунки');
  });

  test('точний збіг із наявним рядком дубля не пропонує', () => {
    // Інакше «+» поруч зі знайденою категорією створив би її другий раз, а
    // після синхронізації обидві злилися б в один запис за похідним id.
    expect(pickerCreateName(options, 'Їжа')).toBeNull();
    expect(pickerCreateName(options, ' їЖа ')).toBeNull();
  });

  test('частковий збіг створювати не заважає', () => {
    // «Їжа» є, «Їж» — ще ні: це інша назва, і людина має право її завести.
    expect(pickerCreateName(options, 'Їж')).toBe('Їж');
  });
});
