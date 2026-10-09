/**
 * __tests__/layout-primitives.test.tsx — примітиви компонування для планшета
 * (рішення 6): токени, сітка, list+detail, рейка сайдбара.
 */
const WINDOW = { width: 390, height: 844, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => WINDOW,
}));
jest.mock('expo-router', () => ({ usePathname: () => '/' }));

import React from 'react';
import { Text } from 'react-native';

import {
  Layout,
  chunkRows,
  detailColumnWidthFor,
  gridColumnsFor,
  pickBySizeClass,
  resolveSheetPresentation,
  sidebarModeFor,
} from '@/constants/tokens';
import { SIDEBAR_WIDTH } from '@/constants/nav';
import { listDetailInfo } from '@/components/shared/ListDetailLayout';
import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
import { ContentContainer, contentMaxWidthFor } from '@/components/shared/ContentContainer';
import { navSidebarWidthFor } from '@/components/shared/sidebar-mode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function flat(style: any): any {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style ?? {};
}

describe('pickBySizeClass', () => {
  it('відсутні класи успадковують менший', () => {
    expect(pickBySizeClass('expanded', { compact: 1 })).toBe(1);
    expect(pickBySizeClass('expanded', { compact: 1, medium: 2 })).toBe(2);
    expect(pickBySizeClass('medium', { compact: 1, expanded: 3 })).toBe(1);
    expect(pickBySizeClass('compact', { compact: 1, medium: 2, expanded: 3 })).toBe(1);
  });
});

describe('gridColumnsFor', () => {
  it('за класом вікна — 1/2/3', () => {
    expect(gridColumnsFor({ sizeClass: 'compact' })).toBe(1);
    expect(gridColumnsFor({ sizeClass: 'medium' })).toBe(2);
    expect(gridColumnsFor({ sizeClass: 'expanded' })).toBe(3);
  });

  it('за місцем — скільки влазить карток не вужчих за minItemWidth', () => {
    // (600 + 12) / (280 + 12) = 2.09 → 2
    expect(gridColumnsFor({ sizeClass: 'expanded', containerWidth: 600, minItemWidth: 280, gap: 12 })).toBe(2);
    expect(gridColumnsFor({ sizeClass: 'expanded', containerWidth: 900, minItemWidth: 280, gap: 12 })).toBe(3);
  });

  it('ніколи не менше 1 і не більше maxColumns', () => {
    expect(gridColumnsFor({ sizeClass: 'expanded', containerWidth: 100, minItemWidth: 280 })).toBe(1);
    expect(gridColumnsFor({ sizeClass: 'expanded', containerWidth: 5000, minItemWidth: 100, maxColumns: 4 })).toBe(4);
    expect(gridColumnsFor({ sizeClass: 'expanded', containerWidth: 0, minItemWidth: 280 })).toBe(3);
  });
});

describe('chunkRows', () => {
  it('ділить на рядки й лишає неповний останній', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([], 3)).toEqual([]);
    expect(chunkRows([1], 0)).toEqual([[1]]);
  });
});

describe('resolveSheetPresentation', () => {
  it('на телефоні завжди аркуш', () => {
    for (const p of ['auto', 'sheet', 'dialog', 'side'] as const) {
      expect(resolveSheetPresentation(p, 'compact')).toBe('sheet');
    }
  });
  it('на широкому auto → діалог, решта як попросили', () => {
    expect(resolveSheetPresentation('auto', 'medium')).toBe('dialog');
    expect(resolveSheetPresentation('side', 'expanded')).toBe('side');
    expect(resolveSheetPresentation('sheet', 'expanded')).toBe('sheet');
  });
});

describe('list + detail', () => {
  it('колонка деталі — лише з expanded за замовчуванням', () => {
    expect(listDetailInfo('medium', 744, 668).wide).toBe(false);
    const info = listDetailInfo('expanded', 1194, 962);
    expect(info.wide).toBe(true);
    expect(info.detailWidth).toBe(Layout.detailWidthLarge);
    expect(info.listWidth).toBe(962 - Layout.detailWidthLarge);
  });

  it('wideFrom="medium" вмикає колонку на портреті', () => {
    expect(listDetailInfo('medium', 744, 668, 'medium').wide).toBe(true);
    expect(listDetailInfo('compact', 390, 390, 'medium').wide).toBe(false);
  });

  it('ширина колонки росте на дуже широкому вікні', () => {
    expect(detailColumnWidthFor(1024)).toBe(Layout.detailWidth);
    expect(detailColumnWidthFor(1366)).toBe(Layout.detailWidthLarge);
  });
});

describe('рейка сайдбара', () => {
  it('medium за замовчуванням — рейка, expanded — повний', () => {
    expect(sidebarModeFor('medium', null)).toBe('rail');
    expect(sidebarModeFor('expanded', null)).toBe('full');
    expect(sidebarModeFor('medium', 'full')).toBe('full');
  });
  it('ширина для useScreenWidth відповідає режиму', () => {
    expect(navSidebarWidthFor('medium', {})).toBe(Layout.railWidth);
    expect(navSidebarWidthFor('medium', { medium: 'full' })).toBe(SIDEBAR_WIDTH);
    expect(navSidebarWidthFor('expanded', {})).toBe(SIDEBAR_WIDTH);
    expect(navSidebarWidthFor('expanded', { expanded: 'rail' })).toBe(Layout.railWidth);
  });
});

describe('ResponsiveGrid', () => {
  afterEach(() => { WINDOW.width = 390; });

  function rowsOf(tree: any) {
    return tree.root.findAll((n: any) => typeof n.type === 'string' && flat(n.props?.style).flexDirection === 'row');
  }

  it('телефон — одна колонка, кожна картка своїм рядком', () => {
    let tree: any;
    act(() => { tree = create(<ResponsiveGrid>{[1, 2, 3].map(i => <Text key={i}>{i}</Text>)}</ResponsiveGrid>); });
    expect(rowsOf(tree).length).toBe(3);
    act(() => tree.unmount());
  });

  it('ландшафт планшета — 3 колонки, неповний рядок добитий порожніми комірками', () => {
    WINDOW.width = 1194;
    let tree: any;
    act(() => { tree = create(<ResponsiveGrid>{[1, 2, 3, 4].map(i => <Text key={i}>{i}</Text>)}</ResponsiveGrid>); });
    const rows = rowsOf(tree);
    expect(rows.length).toBe(2);
    // другий рядок: 1 картка + 2 порожні комірки = 3 дітей
    expect(rows[1].children.length).toBe(3);
    act(() => tree.unmount());
  });
});

describe('ContentContainer', () => {
  afterEach(() => { WINDOW.width = 390; });

  it('стеля за варіантом', () => {
    expect(contentMaxWidthFor('reading')).toBe(Layout.readingMaxWidth);
    expect(contentMaxWidthFor('wide')).toBe(Layout.wideMaxWidth);
    expect(contentMaxWidthFor('full')).toBeUndefined();
  });

  it('поля за класом вікна', () => {
    WINDOW.width = 1194;
    let tree: any;
    act(() => { tree = create(<ContentContainer testID="cc" variant="wide"><Text>x</Text></ContentContainer>); });
    const host = tree.root.findAll((n: any) => typeof n.type === 'string' && n.props?.testID === 'cc')[0];
    const st = flat(host.props.style);
    expect(st.maxWidth).toBe(Layout.wideMaxWidth);
    expect(st.paddingHorizontal).toBe(Layout.gutter.expanded);
    expect(st.alignSelf).toBe('center');
    act(() => tree.unmount());
  });
});
