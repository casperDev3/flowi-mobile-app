/**
 * __tests__/project-list-tablet.test.tsx — екран «Проєкти» (пункт 6):
 *  - планшет 1024pt: картки в ≥2 колонках masonry, без стелі 720pt;
 *  - телефон 390pt: одна колонка (FlatList);
 *  - чипи сортування/фільтра міняють видимий набір і запам'ятовуються на
 *    пристрої (власний ключ AsyncStorage), наступне відкриття бере їх звідти.
 */

const mockStore = new Map<string, string>();
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
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
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
import { FlatList, TouchableOpacity } from 'react-native';

import { MasonryColumns } from '@/components/shared/MasonryColumns';
import { allTranslations } from '@/store/translations';
import { PROJECT_LIST_PREFS_KEY } from '@/utils/projectListPrefs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const TABLET = { width: 1024, height: 768 };
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
    { id: 'p1', name: 'Бета', color: '#7C3AED', createdAt: at(-30), updatedAt: at(-20) },
    { id: 'p2', name: 'Альфа', color: '#10B981', createdAt: at(-30), updatedAt: at(-1) },
    { id: 'p3', name: 'Гамма', color: '#F59E0B', createdAt: at(-30), updatedAt: at(-10) },
    { id: 'p4', name: 'Дельта', color: '#EF4444', createdAt: at(-30), updatedAt: at(-5) },
  ]));
  mockStore.set('tasks', JSON.stringify([
    // p1 — прострочена задача; p2 — усе виконано; p3 — порожній; p4 — у процесі.
    { id: 't1', title: 'A', projectId: 'p1', status: 'active', deadline: at(-3), subtasks: [] },
    { id: 't2', title: 'B', projectId: 'p2', status: 'done', subtasks: [] },
    { id: 't3', title: 'C', projectId: 'p4', status: 'active', deadline: at(5), subtasks: [] },
    { id: 't4', title: 'D', projectId: 'p4', status: 'done', subtasks: [] },
  ]));
}

const trees: any[] = [];
async function flush() {
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}
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
  while (trees.length) {
    const t = trees.pop();
    await act(async () => { t.unmount(); });
  }
});

/** Порядок карток — за accessibilityLabel кнопок-карток (назва проєкту). */
function cardOrder(tree: any): string[] {
  const names = new Set(['Альфа', 'Бета', 'Гамма', 'Дельта']);
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((n: any) => names.has(n.props.accessibilityLabel) && n.props.activeOpacity === 0.75)
    .map((n: any) => n.props.accessibilityLabel);
}

function press(tree: any, label: string) {
  const nodes = tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
  if (!nodes.length) throw new Error(`немає кнопки «${label}»`);
  return act(async () => { nodes[0].props.onPress(); });
}

test('планшет 1024: картки в ≥2 колонках masonry, а не в одному списку', async () => {
  mockWindow = TABLET;
  seed();
  const tree = await mount();
  const masonry = tree.root.findAllByType(MasonryColumns);
  expect(masonry).toHaveLength(1);
  // 1024 − сайдбар 232 = 792pt → masonryColumnCount = 2.
  expect(masonry[0].props.columnCount).toBeGreaterThanOrEqual(2);
  expect(masonry[0].props.items).toHaveLength(4);
  // Фактично намальовані колонки: у дереві ≥2 колонки-стовпці, у кожній є картка.
  const json = masonry[0].children[0];
  const hostRow = json.findAll((n: any) => n.type === 'View' && n.props.style
    && [].concat(n.props.style).some((s: any) => s && s.flexDirection === 'row' && s.alignItems === 'flex-start'))[0];
  const columns = hostRow.children.filter((c: any) => typeof c !== 'string');
  expect(columns.length).toBeGreaterThanOrEqual(2);
  for (const col of columns) {
    expect(col.findAllByType(TouchableOpacity).filter((n: any) => n.props.activeOpacity === 0.75).length).toBeGreaterThan(0);
  }
  expect(tree.root.findAllByType(FlatList)).toHaveLength(0);
});

test('телефон 390: одна колонка — FlatList, без masonry', async () => {
  mockWindow = PHONE;
  seed();
  const tree = await mount();
  expect(tree.root.findAllByType(MasonryColumns)).toHaveLength(0);
  expect(tree.root.findAllByType(FlatList)).toHaveLength(1);
});

test('чипи сортування й фільтра міняють набір і запам\'ятовуються на пристрої', async () => {
  mockWindow = PHONE;
  seed();
  const tree = await mount();
  // «Розумне» за замовчуванням: гаряче зверху, далі за дедлайном, далі за назвою.
  expect(cardOrder(tree)).toEqual(['Бета', 'Дельта', 'Альфа', 'Гамма']);

  await press(tree, tr.projectSortName);
  expect(cardOrder(tree)).toEqual(['Альфа', 'Бета', 'Гамма', 'Дельта']);

  await press(tree, tr.projectSortUpdated);
  expect(cardOrder(tree)).toEqual(['Альфа', 'Дельта', 'Гамма', 'Бета']);

  // Фільтр: лише прострочені (підпис чипа — «Прострочені: 1»).
  await press(tree, `${tr.projectListStatusOverdue}: 1`);
  expect(cardOrder(tree)).toEqual(['Бета']);
  await flush();

  expect(JSON.parse(mockStore.get(PROJECT_LIST_PREFS_KEY) ?? 'null'))
    .toEqual({ sort: 'updated', statuses: ['overdue'] });

  // Нове відкриття екрана бере вибір із пристрою.
  const again = await mount();
  expect(cardOrder(again)).toEqual(['Бета']);

  // Фільтр, під який ніщо не підходить, — окрема підказка з кнопкою скидання.
  await press(again, `${tr.projectListStatusOverdue}: 1`);
  await press(again, `${tr.projectListStatusEmpty}: 1`);
  expect(cardOrder(again)).toEqual(['Гамма']);
});
