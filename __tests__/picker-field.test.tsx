/**
 * __tests__/picker-field.test.tsx — поле вибору статусу й проєкту.
 *
 * Перевіряється поріг пошуку й те, що вибір справді доходить до екрана.
 * Поріг — не косметика: поле пошуку над трьома рядками додає елемент і фокус
 * клавіатури там, де все видно й так, а список на п'ятнадцять статусів без
 * пошуку перетворюється на гортання.
 */

// Провайдера safe-area в тестовому дереві немає, а компоненту потрібні лише
// відступи — віддаємо нулі.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React from 'react';

import { PickerField, SEARCH_THRESHOLD } from '@/components/shared/PickerField';
import { allTranslations } from '@/store/translations';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const COLORS = {
  text: '#111', sub: '#666', border: '#DDD',
  dim: '#EEE', accent: '#7C3AED', sheet: '#FFF',
};

const tr = allTranslations.uk;

const options = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `o${i}`, label: `Колонка ${i}`, color: '#6366F1' }));

function render(count: number, onSelect = jest.fn(), extra: Record<string, unknown> = {}) {
  let tree: any;
  act(() => {
    tree = create(
      <PickerField
        label="Статус"
        options={options(count)}
        value="o0"
        onSelect={onSelect}
        colors={COLORS}
        isDark={false}
        tr={tr}
        {...extra}
      />,
    );
  });
  return tree;
}

/** Усі TextInput у дереві — поле пошуку єдине, тож їх або 0, або 1. */
const searchInputs = (tree: any) =>
  tree.root.findAll((node: any) => node.type === 'TextInput', { deep: true });

/** Відкрити аркуш: тригер — єдина кнопка поза модалкою. */
function open(tree: any) {
  const trigger = tree.root.findAll(
    (n: any) => typeof n.props?.accessibilityLabel === 'string'
      && n.props.accessibilityLabel.startsWith('Статус:'),
  )[0];
  act(() => { trigger.props.onPress(); });
}

describe('PickerField', () => {
  it('до порогу пошуку немає', () => {
    const tree = render(SEARCH_THRESHOLD);
    open(tree);
    expect(searchInputs(tree)).toHaveLength(0);
  });

  it('понад поріг зʼявляється пошук', () => {
    const tree = render(SEARCH_THRESHOLD + 1);
    open(tree);
    expect(searchInputs(tree)).toHaveLength(1);
  });

  it('поки аркуш закритий, пошуку немає навіть у довгому списку', () => {
    // Інакше клавіатура могла б відкритись від невидимого поля.
    const tree = render(20);
    expect(searchInputs(tree)).toHaveLength(0);
  });

  it('пошук звужує список і не ламається на порожньому результаті', () => {
    const tree = render(12);
    open(tree);
    const input = searchInputs(tree)[0];

    act(() => { input.props.onChangeText('Колонка 1'); });
    // «Колонка 1», «Колонка 10», «Колонка 11»
    expect(tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.children === 'Колонка 10',
    )).not.toHaveLength(0);

    act(() => { input.props.onChangeText('нічого такого'); });
    // Лише хостові вузли: findAll віддає ще й композитний Text поверх кожного.
    expect(tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.children === tr.pickerNothingFound,
    )).toHaveLength(1);
  });

  it('вибір повертає id і закриває аркуш', () => {
    const onSelect = jest.fn();
    const tree = render(3, onSelect);
    open(tree);

    const row = tree.root.findAll(
      (n: any) => n.props?.accessibilityRole === 'button'
        && n.props?.accessibilityState?.selected === false,
    )[0];
    act(() => { row.props.onPress(); });

    expect(onSelect).toHaveBeenCalledWith('o1');
    // Аркуш закрився — пошуку й рядків більше немає в дереві.
    expect(searchInputs(tree)).toHaveLength(0);
  });
});

describe('PickerField: пошук на вимогу', () => {
  it('alwaysSearch показує пошук і в короткому списку', () => {
    // Проєкти й категорії накопичуються роками: шукати в них починають
    // задовго до того, як їх стане шість.
    const tree = render(2, jest.fn(), { alwaysSearch: true });
    open(tree);
    expect(searchInputs(tree)).toHaveLength(1);
  });

  it('рядок «створити» вмикає пошук сам — інакше нема куди набрати назву', () => {
    const tree = render(2, jest.fn(), {
      createOption: { label: 'Нова категорія', onCreate: jest.fn() },
    });
    open(tree);
    expect(searchInputs(tree)).toHaveLength(1);
  });
});

/**
 * Знайти рядок «створити» за його accessibilityLabel.
 *
 * Формат саме такий, бо рядковий підпис отримує набране в лапках, а
 * функція-підпис віддає весь рядок сама (див. PickerCreateOption.label).
 */
const createRows = (tree: any, name: string) =>
  tree.root.findAll((n: any) => n.props?.accessibilityLabel === `Нова категорія «${name}»`);

describe('PickerField: створення нового запису', () => {
  it('поки нічого не набрано, створювати нічого не пропонує', () => {
    const tree = render(2, jest.fn(), {
      createOption: { label: 'Нова категорія', onCreate: jest.fn() },
    });
    open(tree);
    expect(createRows(tree, '')).toHaveLength(0);
  });

  it('набране стає назвою, але лише після явного натиску', () => {
    // Суть правила: вільний текст сам по собі записом НЕ стає.
    const onCreate = jest.fn();
    const tree = render(2, jest.fn(), { createOption: { label: 'Нова категорія', onCreate } });
    open(tree);

    act(() => { searchInputs(tree)[0].props.onChangeText('  Ліки '); });
    expect(onCreate).not.toHaveBeenCalled();

    const row = createRows(tree, 'Ліки')[0];
    act(() => { row.props.onPress(); });
    expect(onCreate).toHaveBeenCalledWith('Ліки');
    // Аркуш закрився разом зі створенням.
    expect(searchInputs(tree)).toHaveLength(0);
  });

  it('точний збіг із наявним рядком дубля не пропонує', () => {
    const tree = render(3, jest.fn(), {
      createOption: { label: 'Нова категорія', onCreate: jest.fn() },
    });
    open(tree);
    act(() => { searchInputs(tree)[0].props.onChangeText('Колонка 1'); });
    expect(createRows(tree, 'Колонка 1')).toHaveLength(0);
  });

  it('відхилену форму назву створити не дає', () => {
    // Валідацію робить ФОРМА: сховище мовчки відкидає задовгий id, і без
    // цього блокування людина побачила б «додано», а запис зник би.
    const onCreate = jest.fn();
    const tree = render(2, jest.fn(), {
      createOption: {
        label: 'Нова категорія',
        validate: () => 'Назва задовга',
        onCreate,
      },
    });
    open(tree);
    act(() => { searchInputs(tree)[0].props.onChangeText('дуже довга назва'); });

    const row = createRows(tree, 'дуже довга назва')[0];
    expect(row.props.accessibilityState).toEqual({ disabled: true });
    act(() => { row.props.onPress(); });
    expect(onCreate).not.toHaveBeenCalled();

    expect(tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.children === 'Назва задовга',
    )).toHaveLength(1);
  });

  it('обране, якого немає в списку, показує переданий підпис, а не «нічого»', () => {
    // Списки навмисно звужені: у пікері проєктів лежать лише живі. Задача,
    // покладена в проєкт, який відтоді заархівували, мусить і далі показувати
    // його назву — інакше поле бреше про дані, і виглядає це як «проєкт зник».
    const tree = render(3, jest.fn(), {
      value: 'archived-1',
      selectedLabel: 'Старий проєкт',
      emptyOption: { label: 'Без проєкту' },
    });
    const texts = tree.root.findAll(
      (n: any) => typeof n.type === 'string' && typeof n.props?.children === 'string',
    ).map((n: any) => n.props.children);
    expect(texts).toContain('Старий проєкт');
    expect(texts).not.toContain('Без проєкту');
  });

  it('без підпису й без збігу лишається порожній варіант', () => {
    const tree = render(3, jest.fn(), {
      value: null,
      emptyOption: { label: 'Без проєкту' },
    });
    const texts = tree.root.findAll(
      (n: any) => typeof n.type === 'string' && typeof n.props?.children === 'string',
    ).map((n: any) => n.props.children);
    expect(texts).toContain('Без проєкту');
  });
});

describe('PickerField: підпис дії залежить від набраного', () => {
  it('функція-підпис бачить назву й потрапляє і в текст, і в accessibilityLabel', () => {
    // Проєкт із такою назвою може лежати в архіві: у списку його немає, тож
    // «+» показується, але зробити треба ПОВЕРНЕННЯ, а не створення — і
    // прочитати це людина мусить ДО натиску, а не дізнатися після.
    const onCreate = jest.fn();
    const tree = render(2, jest.fn(), {
      createOption: {
        // Функція віддає ВЕСЬ рядок: для повернення вона підставляє назву
        // ЗБЕРЕЖЕНОГО проєкту («Ремонт»), а не набране («ремонт»).
        label: (name: string) =>
          (name.toLowerCase() === 'ремонт'
            ? 'Повернути з архіву «Ремонт»'
            : `Новий проект «${name}»`),
        onCreate,
      },
    });
    open(tree);

    /** Рядок видно й зчитувачу екрана, і оком — і це той САМИЙ рядок. */
    const shows = (row: string) => {
      const spoken = tree.root.findAll((n: any) => n.props?.accessibilityLabel === row);
      const seen = tree.root.findAll(
        (n: any) => typeof n.type === 'string' && n.props?.children === row,
      );
      return spoken.length > 0 && seen.length > 0;
    };

    // Набране в іншому регістрі — а в підписі стоїть назва з архіву, інакше
    // людина не впізнає свій проєкт.
    act(() => { searchInputs(tree)[0].props.onChangeText('ремонт'); });
    expect(shows('Повернути з архіву «Ремонт»')).toBe(true);

    act(() => { searchInputs(tree)[0].props.onChangeText('Новий'); });
    expect(shows('Новий проект «Новий»')).toBe(true);
  });
});

describe('PickerField: рядок дії не ховається за клавіатурою', () => {
  it('рядок створення НЕ лежить усередині прокрутного списку', () => {
    // Аркуш прибитий до низу екрана. Поки рядок був останнім елементом
    // ScrollView, клавіатура накривала його двічі — і як низ аркуша, і як
    // хвіст прокрутки: людина набирала назву, якої немає, і не бачила нічого.
    const tree = render(2, jest.fn(), {
      createOption: { label: 'Нова категорія', onCreate: jest.fn() },
    });
    open(tree);
    act(() => { searchInputs(tree)[0].props.onChangeText('Ліки'); });

    const row = createRows(tree, 'Ліки')[0];
    expect(row).toBeTruthy();

    const insideScroll = (node: any): boolean => {
      let current = node?.parent;
      while (current) {
        const name = typeof current.type === 'string'
          ? current.type
          : current.type?.displayName ?? current.type?.name ?? '';
        if (String(name).includes('ScrollView')) return true;
        current = current.parent;
      }
      return false;
    };

    expect(insideScroll(row)).toBe(false);
  });
});

describe('PickerField: порожній підпис', () => {
  it('не займає висоти — інакше над полем зайвий проміжок', () => {
    // Форма задачі малювала свій підпис «Проєкт», а пікер малював ще й свій,
    // порожній: стрічка з власними відступами лишала дірку рівно своєї висоти.
    const withLabel = render(2, jest.fn(), { label: 'Проєкт' });
    const withoutLabel = render(2, jest.fn(), { label: '' });

    const labels = (tree: any) => tree.root.findAll(
      (n: any) => typeof n.type === 'string' && n.props?.children === 'Проєкт',
    ).length;

    expect(labels(withLabel)).toBeGreaterThan(0);
    expect(labels(withoutLabel)).toBe(0);
  });
});
