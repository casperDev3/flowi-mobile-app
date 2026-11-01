/**
 * __tests__/nav-sidebar-pin.test.tsx — шпилька сайдбара планшета.
 *
 * Незакріплений сайдбар розгортається ПОВЕРХ вмісту й згортається тапом поза
 * ним; шпилька закріплює (режим 'full', штовхає вміст) і відкріплює.
 * Закріплений розділ має шпильку, тап по якій відкріплює його.
 * Шухляда телефона — без шпильки.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('@/store/synced-storage', () => ({
  saveSyncedValue: jest.fn(async (k: string, v: unknown) => { mockStore.set(k, JSON.stringify(v)); }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, navigate: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/notes',
}));
jest.mock('@/hooks/use-responsive', () => ({
  useResponsive: () => ({
    width: 1194, height: 834, sizeClass: 'expanded', isCompact: false, isMedium: false,
    isExpanded: true, isWide: true, landscape: true,
  }),
}));
jest.mock('@/components/time/ActiveTimersSidebarCard', () => ({ ActiveTimersSidebarCard: () => null }));
jest.mock('@/components/notifications/NotificationBadge', () => ({ NotificationBadge: () => null }));
jest.mock('@/store/timer-context', () => ({ useTimerContext: () => ({ activeTimers: [] }) }));
jest.mock('@/store/auth', () => ({ useAuth: () => ({ user: { isAdmin: false } }) }));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));

import React from 'react';

import { NavSidebar } from '@/components/shared/NavSidebar';
import { getSidebarOverrides, setSidebarOverrides } from '@/components/shared/sidebar-mode';
import { setPinnedSection } from '@/components/shared/pinned-sections';
import { sidebarStrings } from '@/components/shared/sidebar-strings';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;
const tr = allTranslations.uk;
const ss = sidebarStrings('uk');

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const pressables = (tree: any, pred: (p: any) => boolean) =>
  tree.root.findAll((n: any) => typeof n.props?.onPress === 'function' && pred(n.props));
const byLabel = (tree: any, label: string) => pressables(tree, p => p.accessibilityLabel === label);
const byTestId = (tree: any, id: string) => pressables(tree, p => p.testID === id);
const modalVisible = (tree: any) => {
  const modals = tree.root.findAll((n: any) => n.type?.displayName === 'Modal' || n.type?.name === 'Modal');
  return modals.some((m: any) => m.props.visible);
};

let mounted: any = null;
async function mount(variant: 'docked' | 'drawer' = 'docked') {
  let tree: any;
  await act(async () => { tree = create(<NavSidebar pathname="/notes" isDark={false} variant={variant} onClose={() => {}} />); });
  mounted = tree;
  await flush();
  return tree;
}

beforeEach(() => {
  mockStore.clear();
  mockPush.mockClear();
  setSidebarOverrides({});
});
afterEach(async () => {
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
});

describe('шпилька сайдбара (планшет)', () => {
  it('рейка → розгорнути поверх → тап поза сайдбаром згортає', async () => {
    const tree = await mount();
    expect(modalVisible(tree)).toBe(false);
    await act(async () => { byLabel(tree, tr.navSidebarExpand)[0].props.onPress(); });
    expect(modalVisible(tree)).toBe(true);
    // Затемнення поза панеллю — кнопка «Згорнути».
    const scrim = byLabel(tree, tr.navSidebarCollapse).find((n: any) => n.props.testID === undefined);
    await act(async () => { scrim.props.onPress(); });
    expect(modalVisible(tree)).toBe(false);
    expect(getSidebarOverrides().expanded).toBeUndefined();
  });

  it('перехід на пункт згортає незакріплений сайдбар', async () => {
    const tree = await mount();
    await act(async () => { byLabel(tree, tr.navSidebarExpand)[0].props.onPress(); });
    const row = pressables(tree, p => p.accessibilityRole === 'menuitem')[0];
    await act(async () => { row.props.onPress(); });
    expect(mockPush).toHaveBeenCalled();
    expect(modalVisible(tree)).toBe(false);
  });

  it('шпилька закріплює (режим full, без оверлею) і відкріплює (знову поверх)', async () => {
    const tree = await mount();
    await act(async () => { byLabel(tree, tr.navSidebarExpand)[0].props.onPress(); });
    await act(async () => { byTestId(tree, 'nav-sidebar-pin')[0].props.onPress(); });
    expect(getSidebarOverrides().expanded).toBe('full');
    expect(modalVisible(tree)).toBe(false);
    const pin = byTestId(tree, 'nav-sidebar-pin')[0];
    expect(pin.props.accessibilityLabel).toBe(ss.unpinSidebar);
    expect(pin.props.accessibilityState).toEqual({ selected: true });
    expect(JSON.parse(mockStore.get('nav_sidebar_mode') ?? '{}')).toEqual({ expanded: 'full' });

    await act(async () => { pin.props.onPress(); });
    expect(getSidebarOverrides().expanded).toBe('rail');
    expect(modalVisible(tree)).toBe(true);
  });

  it('закріплений розділ стоїть під Оглядом зі шпилькою; тап по ній відкріплює', async () => {
    mockStore.set('ui_preferences', JSON.stringify({ version: 1, disabledModules: [] }));
    setSidebarOverrides({ expanded: 'full' });
    // Закріплення (як із налаштувань) — те саме спільне сховище.
    await act(async () => { setPinnedSection('health', true); });
    await flush();
    const tree = await mount();
    const unpin = byTestId(tree, 'nav-unpin-health');
    expect(unpin.length).toBeGreaterThan(0);
    expect(unpin[0].props.accessibilityLabel).toBe(ss.unpinSection(tr.tabHealth));
    await act(async () => { unpin[0].props.onPress(); });
    await flush();
    expect(byTestId(tree, 'nav-unpin-health')).toHaveLength(0);
    const saved = JSON.parse(mockStore.get('ui_preferences') ?? '{}');
    expect(saved.pinnedSections).toEqual([]);
    expect(saved.disabledModules).toEqual([]);
  });

  it('шухляда телефона — без шпильки і без перегрупування', async () => {
    const tree = await mount('drawer');
    expect(byTestId(tree, 'nav-sidebar-pin')).toHaveLength(0);
    expect(byLabel(tree, tr.close).length).toBeGreaterThan(0);
    expect(byTestId(tree, 'nav-unpin-health')).toHaveLength(0);
  });
});
