/**
 * __tests__/filters-render.test.tsx — примітиви фільтрів v2.5: підпис усередині
 * тригера, підсумок мультивибору, ролі Segmented, гейт лише для не-compact.
 */
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
let mockWide = true;
jest.mock('@/hooks/use-responsive', () => ({
  useResponsive: () => ({ isWide: mockWide, isCompact: !mockWide, width: mockWide ? 1024 : 390, height: 800 }),
}));

import React from 'react';

import { FilterBar, FilterSelect, Segmented, useFiltersV25 } from '@/components/ds/filters';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function mount(el: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(el); });
  return tree;
}
/** Вузли-хости з цим accessibilityLabel. */
function byLabel(tree: any, label: string) {
  return tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.accessibilityLabel === label);
}

const STATUS = [
  { value: 'overdue', label: 'Прострочені', count: 0 },
  { value: 'progress', label: 'У процесі', count: 7 },
  { value: 'done', label: 'Завершені', count: 6 },
];

function Probe({ out }: { out: { v?: boolean } }) {
  out.v = useFiltersV25();
  return null;
}

describe('useFiltersV25', () => {
  it('лише не-compact', () => {
    const out: { v?: boolean } = {};
    mockWide = true;
    mount(<Probe out={out} />);
    expect(out.v).toBe(true);
    mockWide = false;
    mount(<Probe out={out} />);
    expect(out.v).toBe(false);
    mockWide = true;
  });
});

describe('FilterSelect', () => {
  it('одиночний: «Підпис: Значення» в одному тригері', () => {
    const tree = mount(
      <FilterSelect label="Проєкт" value={null} onChange={() => {}} emptyOption={{ label: 'Усі проєкти' }}
        options={[{ value: 'a', label: 'Flowi' }]} />,
    );
    expect(byLabel(tree, 'Проєкт: Усі проєкти').length).toBeGreaterThan(0);
  });
  it('мультивибір: 2 → «Статус · 2»', () => {
    const tree = mount(
      <FilterSelect label="Статус" multiple value={['overdue', 'done']} onChange={() => {}} options={STATUS} />,
    );
    expect(byLabel(tree, 'Статус · 2').length).toBeGreaterThan(0);
  });
});

describe('Segmented', () => {
  it('radiogroup + radio checked, onChange на іншому', () => {
    const onChange = jest.fn();
    const tree = mount(
      <Segmented label="Проєкти" value="live" onChange={onChange}
        options={[{ value: 'live', label: 'Живі', count: 13 }, { value: 'archive', label: 'Архів', count: 14 }]} />,
    );
    expect(byLabel(tree, 'Проєкти')[0].props.accessibilityRole).toBe('radiogroup');
    const live = byLabel(tree, 'Живі, 13')[0];
    expect(live.props.accessibilityRole).toBe('radio');
    expect(live.props.accessibilityState.checked).toBe(true);
    const archive = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Архів, 14' && typeof n.props.onPress === 'function')[0];
    act(() => { archive.props.onPress(); });
    expect(onChange).toHaveBeenCalledWith('archive');
  });
});

describe('FilterBar', () => {
  it('до вимірювання видно всі елементи; копія для вимірювання схована від озвучення', () => {
    const tree = mount(
      <FilterBar label="Фільтри проєктів" items={[
        { id: 'status', active: 2, node: <FilterSelect label="Статус" multiple value={['overdue', 'done']} onChange={() => {}} options={STATUS} /> },
      ]} />,
    );
    expect(byLabel(tree, 'Статус · 2').length).toBeGreaterThanOrEqual(2);
    const hiddenRow = tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.importantForAccessibility === 'no-hide-descendants');
    expect(hiddenRow.length).toBeGreaterThanOrEqual(1);
  });
});
