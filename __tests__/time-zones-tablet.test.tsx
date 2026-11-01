/**
 * __tests__/time-zones-tablet.test.tsx — «Час» у трьох зонах на ПЛАНШЕТІ
 * (Layout System v2.4): тап по запису відкриває форму в динамічній зоні,
 * статична несе KPI й таймери; телефон без змін (аркуш, без зон).
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiSet: jest.fn(async (pairs: [string, string][]) => { pairs.forEach(([k, v]) => mockStore.set(k, v)); }),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
  getAllKeys: jest.fn(async () => [...mockStore.keys()]),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: new Proxy({}, { get: () => () => chain }),
  };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/time',
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
  useTimerContext: () => ({
    activeTimers: [],
    stopTimer: jest.fn(),
    startTaskTimer: jest.fn(),
    tasksRevision: 0,
    timeEntriesRevision: 0,
  }),
}));
jest.mock('@/store/auth', () => ({ useAuth: () => ({ user: { id: 1, name: 'Тест', email: 't@example.com' } }) }));
jest.mock('@/hooks/use-project-roles', () => ({ useProjectRoles: () => ({}) }));
jest.mock('@/store/synced-storage', () => ({ saveSynced: jest.fn(async () => {}) }));
let mockWindow = { width: 1366, height: 1024 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import React from 'react';

import { TimeEntryForm } from '@/components/time/TimeEntryForm';
import { TimeEntrySheet } from '@/components/time/TimeEntrySheet';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const TABLET = { width: 1366, height: 1024 };
const PHONE = { width: 390, height: 844 };

function seed() {
  mockStore.clear();
  const ended = new Date();
  ended.setHours(ended.getHours() - 1);
  mockStore.set('time_entries', JSON.stringify([
    { id: 'e1', task: 'Макет головної', duration: 1800, date: ended.toISOString() },
  ]));
  mockStore.set('tasks', JSON.stringify([]));
  mockStore.set('projects', JSON.stringify([]));
}

const trees: any[] = [];
async function flush() { await act(async () => { await new Promise(r => setTimeout(r, 20)); }); }
async function mount() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TimeScreen = require('@/app/(tabs)/time').default;
  let tree: any;
  await act(async () => { tree = create(<TimeScreen />); });
  await flush();
  await flush();
  trees.push(tree);
  return tree;
}
const byTestId = (tree: any, id: string) => tree.root.findAll((n: any) => n.props.testID === id);
const entryRow = (tree: any) => tree.root.findAll(
  (n: any) => typeof n.props.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith('Макет головної')
    && typeof n.props.onPress === 'function',
)[0];

beforeEach(seed);
afterEach(() => {
  while (trees.length) { const t = trees.pop(); act(() => t.unmount()); }
});

test('планшет: три зони, тап по запису відкриває форму в динамічній зоні', async () => {
  mockWindow = TABLET;
  const tree = await mount();
  expect(byTestId(tree, 'time-zones').length).toBeGreaterThan(0);
  expect(tree.root.findAllByType(TimeEntryForm)).toHaveLength(0);
  await act(async () => { entryRow(tree).props.onPress(); });
  const forms = tree.root.findAllByType(TimeEntryForm);
  expect(forms.length).toBeGreaterThan(0);
  expect(forms[0].props.entry?.id).toBe('e1');
  // Аркуш телефона не відкривався.
  expect(tree.root.findAllByType(TimeEntrySheet)[0].props.visible).toBe(false);
  // ✕ форми закриває панель.
  await act(async () => { forms[0].props.onClose(); });
  expect(tree.root.findAllByType(TimeEntryForm)).toHaveLength(0);
});

test('планшет: «+» відкриває порожню форму в динамічній зоні', async () => {
  mockWindow = TABLET;
  const tree = await mount();
  const plus = tree.root.findAll(
    (n: any) => n.props.accessibilityLabel === 'Додати запис' && typeof n.props.onPress === 'function',
  )[0];
  await act(async () => { plus.props.onPress(); });
  const forms = tree.root.findAllByType(TimeEntryForm);
  expect(forms.length).toBeGreaterThan(0);
  expect(forms[0].props.entry).toBeNull();
});

test('широке вікно: статична зона з KPI періоду стоїть поруч', async () => {
  mockWindow = { width: 1600, height: 1024 };
  const tree = await mount();
  expect(byTestId(tree, 'time-static-zone').length).toBeGreaterThan(0);
  expect(byTestId(tree, 'time-static-kpis').length).toBeGreaterThan(0);
});

test('телефон: без зон — тап по запису відкриває аркуш, як і раніше', async () => {
  mockWindow = PHONE;
  const tree = await mount();
  expect(byTestId(tree, 'time-zones')).toHaveLength(0);
  expect(byTestId(tree, 'time-static-zone')).toHaveLength(0);
  await act(async () => { entryRow(tree).props.onPress(); });
  const sheet = tree.root.findAllByType(TimeEntrySheet)[0];
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.entry?.id).toBe('e1');
});
