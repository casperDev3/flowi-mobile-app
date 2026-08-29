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

function render(count: number, onSelect = jest.fn()) {
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
