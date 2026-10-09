/**
 * __tests__/tablet-screens-a.test.tsx — планшетна адаптація екранів (рішення 6).
 *
 * Архів: телефон — одна колонка; портрет планшета — 2 картки в ряд;
 * ландшафт — 3, і неповний останній рядок добивається порожніми комірками.
 * Модулі: ландшафт — секції двома незалежними колонками (MasonryColumns).
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  usePathname: () => '/archive',
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
let mockWindow = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import React from 'react';
import { FlatList } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

import ArchiveScreen from '@/app/archive';
import SettingsModulesScreen from '@/app/settings-modules';
import { MasonryColumns } from '@/components/shared/MasonryColumns';

function task(id: string) {
  return { id, title: id, description: '', status: 'done', subtasks: [], createdAt: '2026-01-01T00:00:00.000Z' };
}

let mounted: any = null;
afterEach(async () => {
  if (mounted) { const t = mounted; mounted = null; await act(async () => { t.unmount(); }); }
});

async function mountArchive(width: number, height: number, count: number) {
  mockWindow = { width, height };
  mockStore.clear();
  mockStore.set('tasks', JSON.stringify(Array.from({ length: count }, (_, i) => task(`t${i}`))));
  let tree: any;
  await act(async () => { tree = create(<ArchiveScreen />); });
  mounted = tree;
  return tree.root.findByType(FlatList);
}

describe('archive grid on tablet', () => {
  it('phone: single column, no padding cells', async () => {
    const list = await mountArchive(390, 844, 4);
    expect(list.props.numColumns).toBe(1);
    expect(list.props.data).toHaveLength(4);
  });

  it('portrait tablet (medium): two columns', async () => {
    const list = await mountArchive(744, 1133, 3);
    expect(list.props.numColumns).toBe(2);
    // 3 картки + 1 порожня комірка → останній рядок не розтягує одиноку картку.
    expect(list.props.data).toHaveLength(4);
    expect(list.props.data[3]).toEqual({ padId: '__pad0' });
  });

  it('landscape tablet (expanded): three columns in the wide column', async () => {
    const list = await mountArchive(1180, 820, 4);
    expect(list.props.numColumns).toBe(3);
    expect(list.props.data).toHaveLength(6);
    const flat = Object.assign({}, ...[list.props.contentContainerStyle].flat(3).filter(Boolean));
    expect(flat.maxWidth).toBe(1200);
  });
});

describe('modules settings on tablet', () => {
  async function mountModules(width: number, height: number) {
    mockWindow = { width, height };
    let tree: any;
    await act(async () => { tree = create(<SettingsModulesScreen />); });
    mounted = tree;
    return tree.root.findByType(MasonryColumns);
  }

  it('phone: one column', async () => {
    expect((await mountModules(390, 844)).props.columnCount).toBe(1);
  });

  it('landscape: two independent columns', async () => {
    expect((await mountModules(1180, 820)).props.columnCount).toBe(2);
  });
});
