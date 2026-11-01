/**
 * __tests__/projects-zones-tablet.test.tsx — «Проєкти» у трьох зонах на
 * ПЛАНШЕТІ (Layout System v2.4): тап вибирає, вхід — кнопкою; телефон без змін.
 */

const mockStore = new Map<string, string>();
const mockPush = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/projects',
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
jest.mock('@/utils/haptics', () => ({
  haptic: { light: () => {}, medium: () => {}, success: () => {}, warning: () => {}, error: () => {}, selection: () => {} },
}));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));
jest.mock('@/store/timer-context', () => ({
  useTimerContext: () => ({ activeTimers: [], tasksRevision: 0 }),
}));
jest.mock('@/hooks/use-project-roles', () => ({ useProjectRoles: () => ({}) }));
jest.mock('@/store/project-sync', () => ({
  hasPendingProjectOutbox: jest.fn(async () => false),
  queueProjectDeletion: jest.fn(async () => {}),
  syncAllMyProjects: jest.fn(async () => {}),
}));
let mockWindow = { width: 1024, height: 768 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));


import React from 'react';
import { TouchableOpacity } from 'react-native';

import { ZoneLayout } from '@/components/layout-zones';
import { ProjectZoneDetails } from '@/components/projects/ProjectZones';
import { isProjectAtRisk, keyProjectTasks, roleSummary, upcomingDeadlines } from '@/components/projects/projectsZoneModel';
import { projectStats } from '@/utils/projectStats';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const TABLET = { width: 1366, height: 1024 };
const PHONE = { width: 390, height: 844 };
const at = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

function seed() {
  mockStore.clear();
  mockStore.set('projects', JSON.stringify([
    { id: 'p1', name: 'Бета', color: '#7C3AED', createdAt: at(-30), deadline: at(3) },
    { id: 'p2', name: 'Альфа', color: '#10B981', createdAt: at(-30) },
  ]));
  mockStore.set('tasks', JSON.stringify([
    { id: 't1', title: 'Здати макет', projectId: 'p1', status: 'active', deadline: at(-2), subtasks: [] },
    { id: 't2', title: 'Демо', projectId: 'p1', status: 'active', deadline: at(4), subtasks: [] },
    { id: 't3', title: 'Готово', projectId: 'p2', status: 'done', subtasks: [] },
  ]));
}

const trees: any[] = [];
async function flush() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
async function mount() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ProjectsScreen = require('@/app/projects').default;
  let tree: any;
  await act(async () => { tree = create(<ProjectsScreen />); });
  await flush();
  await flush();
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  while (trees.length) { const t = trees.pop(); await act(async () => { t.unmount(); }); }
  mockPush.mockClear();
});

const card = (tree: any, name: string) => tree.root
  .findAllByType(TouchableOpacity)
  .find((n: any) => n.props.accessibilityLabel === name && n.props.activeOpacity === 0.75);
const byLabel = (tree: any, label: string) =>
  tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');

test('планшет: тап по картці лише вибирає — зведення в динамічній зоні, без переходу', async () => {
  mockWindow = TABLET;
  seed();
  const tree = await mount();
  const zones = tree.root.findByType(ZoneLayout);
  expect(zones.props.dynamicOpen).toBe(false);
  expect(zones.props.static).toBeTruthy();

  await act(async () => { card(tree, 'Бета').props.onPress(); });
  expect(mockPush).not.toHaveBeenCalled();
  const after = tree.root.findByType(ZoneLayout);
  expect(after.props.dynamicOpen).toBe(true);
  const details = tree.root.findByType(ProjectZoneDetails);
  expect(details.props.stats.project.id).toBe('p1');
  expect(details.props.keyTasks.map((t: any) => t.id)).toEqual(['t1', 't2']);
  expect(card(tree, 'Бета').props.accessibilityState).toEqual({ selected: true });

  // «Відкрити проєкт» — у панелі (і на картці) веде в простір проєкту.
  const open = byLabel(tree, 'Відкрити простір «Бета»');
  expect(open.length).toBeGreaterThanOrEqual(2);
  await act(async () => { open[open.length - 1].props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith('/project/p1');
});

test('планшет: кнопка «Відкрити проєкт» на картці веде в проєкт без вибору', async () => {
  mockWindow = TABLET;
  seed();
  const tree = await mount();
  await act(async () => { byLabel(tree, 'Відкрити простір «Альфа»')[0].props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith('/project/p2');
});

test('телефон: без зон і без кнопки «Відкрити» — тап по картці одразу відкриває проєкт', async () => {
  mockWindow = PHONE;
  seed();
  const tree = await mount();
  expect(tree.root.findAllByType(ZoneLayout)).toHaveLength(0);
  expect(byLabel(tree, 'Відкрити простір «Бета»')).toHaveLength(0);
  expect(card(tree, 'Бета').props.accessibilityHint).toBeUndefined();
  await act(async () => { card(tree, 'Бета').props.onPress(); });
  expect(mockPush).toHaveBeenCalledWith('/project/p1');
});

describe('projectsZoneModel', () => {
  const now = new Date();
  const p = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, color: '#000', createdAt: at(-10), ...extra });
  test('під ризиком: термін ≤ 7 діб при незакритій роботі, не прострочений', () => {
    const risky = projectStats(p('a', { deadline: at(3) }), [{ id: 't', projectId: 'a', status: 'active' }] as any, now);
    expect(isProjectAtRisk(risky, null, now)).toBe(true);
    const far = projectStats(p('b', { deadline: at(30) }), [{ id: 't', projectId: 'b', status: 'active' }] as any, now);
    expect(isProjectAtRisk(far, null, now)).toBe(false);
  });
  test('найближчі терміни: власний термін або дедлайн задачі, минуле — ні', () => {
    const a = projectStats(p('a', { deadline: at(5) }), [{ id: 't', projectId: 'a', status: 'active' }] as any, now);
    const b = projectStats(p('b'), [{ id: 't2', projectId: 'b', status: 'active', deadline: at(2) }] as any, now);
    const c = projectStats(p('c', { deadline: at(-2) }), [] as any, now);
    expect(upcomingDeadlines([a, b, c], now).map(r => [r.projectId, r.kind])).toEqual([['b', 'task'], ['a', 'project']]);
  });
  test('ключові задачі: прострочені → з дедлайном → без, виконані — ні', () => {
    const tasks = [
      { id: '1', title: 'без дати', projectId: 'x', status: 'todo' },
      { id: '2', title: 'пізно', projectId: 'x', status: 'todo', deadline: at(-1) },
      { id: '3', title: 'скоро', projectId: 'x', status: 'todo', deadline: at(2) },
      { id: '4', title: 'зроблено', projectId: 'x', status: 'done', deadline: at(-5) },
      { id: '5', title: 'інший', projectId: 'y', status: 'todo' },
    ];
    expect(keyProjectTasks(tasks, 'x', now).map(t => t.id)).toEqual(['2', '3', '1']);
  });
  test('ролі: лише ті, що трапились, у сталому порядку', () => {
    expect(roleSummary(['viewer', 'owner', 'owner'])).toEqual([{ role: 'owner', count: 2 }, { role: 'viewer', count: 1 }]);
  });
});
