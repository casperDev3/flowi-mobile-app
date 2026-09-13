/**
 * __tests__/priority-components.test.tsx — бейдж, пікер і фільтр пріоритету P0–P5.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));

import React from 'react';
import { Text } from 'react-native';

import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { PriorityFilterChips, togglePriorityLevel } from '@/components/tasks/PriorityFilterChips';
import { PriorityPicker } from '@/components/tasks/PriorityPicker';
import type { PriorityLevel, TaskPriority } from '@/utils/taskUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const COLORS = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE' };

function render(el: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(el); });
  return tree;
}

const texts = (tree: any): string[] => tree.root.findAllByType(Text).map((n: any) => String(n.props.children));

describe('PriorityBadge', () => {
  test('P-мітка в кольорі пріоритету на ~15% фоні', () => {
    const tree = render(<PriorityBadge level={0} />);
    expect(texts(tree)).toEqual(['P0']);
    const label = tree.root.findByType(Text);
    const flat = Object.assign({}, ...[label.props.style].flat(2).filter(Boolean));
    expect(flat.color).toBe('#EF4444');
    const box = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Пріоритет P0')[0];
    const boxStyle = Object.assign({}, ...[box.props.style].flat(2).filter(Boolean));
    expect(boxStyle.backgroundColor).toBe('#EF444426');
    expect(boxStyle.borderRadius).toBe(6);
  });

  test('без пріоритету — нічого', () => {
    expect(render(<PriorityBadge level={null} />).toJSON()).toBeNull();
    expect(render(<PriorityBadge level={undefined} />).toJSON()).toBeNull();
  });
});

describe('PriorityPicker', () => {
  test('7 варіантів: — і P0…P5; вибір віддає рівень або null', () => {
    const onChange = jest.fn();
    const tree = render(<PriorityPicker value={3 as TaskPriority} onChange={onChange} colors={COLORS} />);
    expect(texts(tree)).toEqual(['—', 'P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
    const press = (label: string) => {
      const node = tree.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
      act(() => { node.props.onPress(); });
    };
    press('Без пріоритету');
    press('Пріоритет P0');
    expect(onChange.mock.calls).toEqual([[null], [0]]);
  });
});

describe('PriorityFilterChips', () => {
  test('togglePriorityLevel тримає порядок P0→P5', () => {
    expect(togglePriorityLevel([4], 1)).toEqual([1, 4]);
    expect(togglePriorityLevel([1, 4], 4)).toEqual([1]);
  });

  test('«Скинути» лише коли щось вибрано', () => {
    expect(texts(render(<PriorityFilterChips value={[]} onChange={() => {}} colors={COLORS} />)))
      .toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5']);
    const onChange = jest.fn();
    const tree = render(<PriorityFilterChips value={[2] as PriorityLevel[]} onChange={onChange} colors={COLORS} />);
    expect(texts(tree)).toContain('Скинути');
    const reset = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Скинути' && typeof n.props.onPress === 'function')[0];
    act(() => { reset.props.onPress(); });
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
