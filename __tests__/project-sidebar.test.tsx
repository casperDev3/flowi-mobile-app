/**
 * __tests__/project-sidebar.test.tsx — сайдбар простору проєкту (планшет).
 *
 * У БУДЬ-ЯКОМУ стані — і згорнутому теж — видно, в якому ти проєкті, і є
 * шлях назад до СПИСКУ проєктів (а не в Особисте). Ширина згорнутого — рейка,
 * і її бачить useScreenWidth через sidebar-mode.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, navigate: mockNavigate, replace: jest.fn() }),
  usePathname: () => '/project/p1/sprints',
}));
jest.mock('@/components/time/ActiveTimersSidebarCard', () => ({ ActiveTimersSidebarCard: () => null }));
jest.mock('@/components/projects/ProjectSwitcherSheet', () => ({ ProjectSwitcherSheet: () => null }));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));

import React from 'react';

import { ProjectSidebar } from '@/components/shared/ProjectSidebar';
import { getProjectSidebarCollapsed, projectSidebarWidthFor, setProjectSidebarCollapsed } from '@/components/shared/sidebar-mode';
import { Layout } from '@/constants/tokens';
import { SIDEBAR_WIDTH } from '@/constants/nav';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;
const tr = allTranslations.uk;
const PROJECT = { id: 'p1', name: 'Сайт', color: '#EF4444', createdAt: '2026-09-01T10:00:00.000Z' };

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const byLabel = (tree: any, label: string) =>
  tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
function allText(tree: any): string {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(tree.toJSON());
  return out.join('|');
}

let mounted: any = null;
async function mount() {
  let tree: any;
  await act(async () => { tree = create(<ProjectSidebar projectId="p1" pathname="/project/p1/sprints" isDark={false} />); });
  mounted = tree;
  await flush();
  return tree;
}

beforeEach(() => {
  mockStore.clear();
  mockStore.set('projects', JSON.stringify([PROJECT]));
  mockNavigate.mockClear();
  setProjectSidebarCollapsed(false);
});
afterEach(async () => {
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
});

test('розгорнутий: назва проєкту і «Усі проєкти» → список проєктів', async () => {
  const tree = await mount();
  expect(allText(tree)).toContain(PROJECT.name);
  expect(allText(tree)).toContain(tr.projectBackToProjects);
  await act(async () => { byLabel(tree, tr.projectBackToProjectsA11y)[0].props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('/projects');
});

test('згорнутий: ідентичність проєкту й «назад» лишаються, ширина — рейка', async () => {
  const tree = await mount();
  await act(async () => { byLabel(tree, tr.projectSidebarCollapse)[0].props.onPress(); });
  await flush();
  expect(getProjectSidebarCollapsed()).toBe(true);
  expect(JSON.parse(mockStore.get('project-sidebar-collapsed') ?? 'false')).toBe(true);

  // Назви розділів зникли, а ініціал проєкту й кнопка назад — ні.
  expect(allText(tree)).not.toContain(tr.projectBackToProjects);
  expect(allText(tree)).toContain('С');
  // Назва проєкту видна і в рейці (під плиткою).
  expect(allText(tree)).toContain(PROJECT.name);
  expect(byLabel(tree, tr.projectSwitchProjectA11y.replace('{name}', PROJECT.name)).length).toBeGreaterThan(0);
  expect(byLabel(tree, tr.projectBackToProjectsA11y).length).toBeGreaterThan(0);
  expect(byLabel(tree, tr.projectSidebarExpand).length).toBeGreaterThan(0);
  // Розділи доступні за підписом і в рейці.
  expect(byLabel(tree, tr.sprints).length).toBeGreaterThan(0);

  expect(projectSidebarWidthFor(true)).toBe(Layout.railWidth);
  expect(projectSidebarWidthFor(false)).toBe(SIDEBAR_WIDTH);
});
