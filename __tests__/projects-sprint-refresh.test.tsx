/**
 * __tests__/projects-sprint-refresh.test.tsx — «поклав задачу у спринт, а на
 * екрані Спринтів простору проєкту її назви не видно».
 *
 * Було перевіркою інлайн-деталі `app/projects.tsx`; ту UI план §3 замінив
 * простором проєкту (`app/project/[id]/*`) — сама поведінка та сама
 * (useSyncedList/RMW не мають ЗАТИРАТИ записи, створені деінде), тести тепер
 * монтують нові екрани: Спринти, Завдання, Наради.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
// Швидке створення — у SheetModal (жести); нативного модуля в jsdom немає.
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'p1' }),
  usePathname: () => '/project/p1/tasks',
  Redirect: (props: any) => { mockRedirect(props.href); return null; },
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
jest.mock('@/utils/haptics', () => ({
  haptic: { light: () => {}, medium: () => {}, success: () => {}, warning: () => {}, error: () => {} },
}));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));

import React from 'react';

import ProjectSprintsScreen, { resetSprintListViews } from '@/app/project/[id]/sprints';
import ProjectTasksScreen from '@/app/project/[id]/tasks';
import ProjectMeetingsScreen from '@/app/project/[id]/meetings';
import { saveData } from '@/store/storage';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const NOW = '2026-09-01T10:00:00.000Z';
const PROJECT = { id: 'p1', name: 'Сайт', color: '#EF4444', createdAt: NOW };
const SPRINT = { id: 's1', projectId: 'p1', name: 'Спринт 1', createdAt: NOW };
const TASK = { id: 't1', title: 'Зверстати головну', projectId: 'p1', status: 'active', createdAt: NOW, subtasks: [] };

function seed(data: Record<string, unknown>) {
  mockStore.clear();
  for (const [k, v] of Object.entries(data)) mockStore.set(k, JSON.stringify(v));
}

const read = <T,>(key: string): T => JSON.parse(mockStore.get(key) ?? 'null');
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

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

function pressByLabel(tree: any, label: string) {
  const nodes = tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
  if (nodes.length === 0) throw new Error(`немає кнопки «${label}»`);
  return act(async () => { nodes[0].props.onPress(); });
}

function pressText(tree: any, text: string) {
  const nodes = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && n.findAll((c: any) => c.props?.children === text).length > 0);
  if (nodes.length === 0) throw new Error(`немає кнопки з текстом «${text}»`);
  // Найглибша кнопка — сам рядок, а не обгортка навколо всього екрана.
  return act(async () => { nodes[nodes.length - 1].props.onPress(); });
}

let mounted: any = null;

async function mountSprints() {
  let tree: any;
  await act(async () => { tree = create(<ProjectSprintsScreen />); });
  mounted = tree;
  await flush();
  return tree;
}

afterEach(async () => {
  // Розмонтувати, щоб таймери VirtualizedList не логували після кінця тесту.
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
  // Розгорнуте/фільтр живуть до кінця сесії (модульна мапа) — між тестами скидаємо.
  resetSprintListViews();
});

test('запис спринта задачі повз екран одразу видно на екрані Спринтів', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [TASK] });
  const tree = await mountSprints();
  // Усі спринти згорнуті за замовчуванням — розгортаємо тапом по назві.
  await pressByLabel(tree, SPRINT.name);

  // До: спринт порожній (задача в беклозі проєкту, тут не показана).
  expect(allText(tree)).toContain(tr.sprintEmpty);

  // Інший екран (або синк) кладе задачу у спринт.
  await act(async () => {
    await saveData('tasks', [{ ...TASK, sprintId: SPRINT.id }]);
  });
  await flush();

  // Після: назва задачі з'явилась усередині розгорнутого спринта.
  expect(allText(tree)).toContain(TASK.title);
});

test('закритий спринт згорнутий за замовчуванням і розгортається тапом', async () => {
  const CLOSED = { id: 's0', projectId: 'p1', name: 'Минулий спринт', createdAt: NOW, closedAt: NOW };
  const DONE_TASK = { ...TASK, id: 't2', title: 'Здана задача', status: 'done', sprintId: CLOSED.id };
  seed({ projects: [PROJECT], sprints: [SPRINT, CLOSED], tasks: [TASK, DONE_TASK] });
  const tree = await mountSprints();

  // Заголовок закритого спринта видно, його задач — ні.
  expect(allText(tree)).toContain(CLOSED.name);
  expect(allText(tree)).not.toContain(DONE_TASK.title);

  await pressByLabel(tree, CLOSED.name);
  expect(allText(tree)).toContain(DONE_TASK.title);

  await pressByLabel(tree, CLOSED.name);
  expect(allText(tree)).not.toContain(DONE_TASK.title);
});

test('перейменування спринта не видаляє спринт, створений деінде', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [TASK] });
  const tree = await mountSprints();

  // Інший пристрій додав спринт; сигналу екран не отримав (стан застарілий).
  const other = { id: 's2', projectId: 'p1', name: 'Спринт 2', createdAt: NOW };
  mockStore.set('sprints', JSON.stringify([SPRINT, other]));

  await pressByLabel(tree, tr.sprintRename);
  const input = tree.root.findAll((n: any) => n.props?.placeholder === tr.sprintNamePlaceholder && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('Спринт 1 (новий)'); });
  await pressText(tree, tr.save);
  await flush();

  const stored = read<any[]>('sprints');
  expect(stored.map(s => s.id).sort()).toEqual(['s1', 's2']);
  expect(stored.find(s => s.id === 's1').name).toBe('Спринт 1 (новий)');
});

test('єдина кнопка «Додати задачу» відкриває швидке створення ТУТ, у проєкті', async () => {
  // Рішення власника (п. 3): інлайн-полів і «+» у групах більше немає — одна
  // кнопка (FAB на телефоні). Форма швидкого створення — та сама, що на
  // особистому екрані Завдань, але відкривається В ПРОСТОРІ ПРОЄКТУ (раніше
  // push на особистий екран виводив людину з проєкту).
  jest.useFakeTimers();
  try {
    seed({ projects: [PROJECT], sprints: [], tasks: [] });
    mockPush.mockClear();
    let tree: any;
    await act(async () => { tree = create(<ProjectTasksScreen />); });
    mounted = tree;
    await act(async () => { jest.advanceTimersByTime(50); });
    expect(tree.root.findAll((n: any) => n.props?.placeholder === tr.projectAddTask && typeof n.props.onChangeText === 'function')).toHaveLength(0);

    await pressByLabel(tree, tr.projectAddTask);
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(tabs)' }));
    expect(allText(tree)).toContain(tr.newTask);

    const input = tree.root.findAll((n: any) => n.props?.accessibilityLabel === tr.taskNamePlaceholder && typeof n.props.onChangeText === 'function')[0];
    expect(input).toBeTruthy();
    await act(async () => { input.props.onChangeText('Нова задача проєкту'); });
    const submit = tree.root.findAll((n: any) => n.props?.accessibilityLabel === tr.taskNamePlaceholder && typeof n.props.onSubmitEditing === 'function')[0];
    await act(async () => { submit.props.onSubmitEditing(); });
    await act(async () => { jest.advanceTimersByTime(400); });
    await act(async () => { await Promise.resolve(); });

    const stored = read<any[]>('tasks');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toEqual(expect.objectContaining({ title: 'Нова задача проєкту', projectId: 'p1', status: 'active' }));
  } finally {
    jest.useRealTimers();
  }
});

test('тап по завданню відкриває картку тут, у проєкті, а не на особистому екрані', async () => {
  seed({ projects: [PROJECT], sprints: [], tasks: [{ ...TASK, deadline: '2099-01-10' }] });
  mockPush.mockClear();
  let tree: any;
  await act(async () => { tree = create(<ProjectTasksScreen />); });
  mounted = tree;
  await flush();
  // Доступний тап картки (onAccessibilityTap) — той самий onPress(task).
  const card = tree.root.findAll((n: any) => typeof n.props?.onAccessibilityTap === 'function'
    && typeof n.props?.accessibilityLabel === 'string' && n.props.accessibilityLabel.includes(TASK.title))[0];
  expect(card).toBeTruthy();
  await act(async () => { card.props.onAccessibilityTap(); });
  await flush();
  expect(mockPush).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(tabs)' }));
  // Вкладки картки — ознака, що вона відкрита.
  expect(allText(tree)).toContain(tr.cardTabMain);
});

test('«+» відкритого спринта створює задачу одразу в цьому спринті', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [] });
  const tree = await mountSprints();
  await pressByLabel(tree, SPRINT.name);

  await pressByLabel(tree, `${tr.sprintAddTaskA11y}: ${SPRINT.name}`);
  const placeholder = tr.sprintAddTaskIn.replace('{name}', SPRINT.name);
  const input = tree.root.findAll((n: any) => n.props?.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('Задача спринта'); });
  await act(async () => { input.props.onSubmitEditing(); });
  await flush();

  const [task] = read<any[]>('tasks');
  expect(task.title).toBe('Задача спринта');
  expect(task.sprintId).toBe(SPRINT.id);
  expect(task.priorityLevel).toBe(3);
  expect(allText(tree)).toContain('Задача спринта');
});

test('закритий спринт не пропонує «+ задача»', async () => {
  const CLOSED = { id: 's0', projectId: 'p1', name: 'Минулий спринт', createdAt: NOW, closedAt: NOW };
  seed({ projects: [PROJECT], sprints: [SPRINT, CLOSED], tasks: [] });
  const tree = await mountSprints();
  await pressByLabel(tree, SPRINT.name);
  await pressByLabel(tree, CLOSED.name);
  const labels = tree.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith(`${tr.sprintAddTaskA11y}: `)).map((n: any) => n.props.accessibilityLabel);
  expect(new Set(labels)).toEqual(new Set([`${tr.sprintAddTaskA11y}: ${SPRINT.name}`]));
});

test('усі спринти, і відкриті теж, згорнуті за замовчуванням', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [{ ...TASK, sprintId: SPRINT.id }] });
  const tree = await mountSprints();
  expect(allText(tree)).toContain(SPRINT.name);
  expect(allText(tree)).not.toContain(TASK.title);
  const header = tree.root.findAll((n: any) => n.props?.accessibilityLabel === SPRINT.name && n.props?.accessibilityState)[0];
  expect(header.props.accessibilityState).toEqual({ expanded: false });
});

test('тап по задачі спринта відкриває картку ТУТ, без переходу', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [{ ...TASK, sprintId: SPRINT.id }] });
  mockPush.mockClear();
  const tree = await mountSprints();
  await pressByLabel(tree, SPRINT.name);
  await pressByLabel(tree, TASK.title);
  await flush();
  expect(mockPush).not.toHaveBeenCalled();
  expect(allText(tree)).toContain(tr.cardTabMain);
});

test('закритий спринт архівується, ховається і повертається перемикачем', async () => {
  const CLOSED = { id: 's0', projectId: 'p1', name: 'Минулий спринт', createdAt: NOW, closedAt: NOW };
  seed({ projects: [PROJECT], sprints: [SPRINT, CLOSED], tasks: [] });
  const tree = await mountSprints();
  // Відкритий спринт архівувати не можна — дія лише в закритого.
  const archiveButtons = tree.root.findAll((n: any) => n.props?.accessibilityLabel === tr.sprintArchive && typeof n.props.onPress === 'function');
  expect(archiveButtons.length).toBeGreaterThan(0);
  await pressByLabel(tree, tr.sprintArchive);
  await flush();

  const stored = read<any[]>('sprints');
  expect(typeof stored.find(s => s.id === 's0').archivedAt).toBe('string');
  expect(stored.find(s => s.id === 's1').archivedAt).toBeUndefined();
  expect(allText(tree)).not.toContain(CLOSED.name);

  await pressByLabel(tree, `${tr.sprintShowArchived}, 1`);
  expect(allText(tree)).toContain(CLOSED.name);
  expect(allText(tree)).toContain(tr.sprintArchivedBadge);

  await pressByLabel(tree, tr.sprintUnarchive);
  await flush();
  expect(read<any[]>('sprints').find(s => s.id === 's0')).not.toHaveProperty('archivedAt');
});

test('фільтр «Завершені» лишає лише закриті спринти', async () => {
  const CLOSED = { id: 's0', projectId: 'p1', name: 'Минулий спринт', createdAt: NOW, closedAt: NOW };
  seed({ projects: [PROJECT], sprints: [SPRINT, CLOSED], tasks: [] });
  const tree = await mountSprints();
  await pressByLabel(tree, `${tr.sprintStatusCompleted}, 1`);
  expect(allText(tree)).toContain(CLOSED.name);
  expect(allText(tree)).not.toContain(SPRINT.name);
});

test('«Наради» проєкту — редирект у календар проєкту (календар замінює наради)', async () => {
  mockRedirect.mockClear();
  let tree: any;
  await act(async () => { tree = create(<ProjectMeetingsScreen />); });
  mounted = tree;
  expect(mockRedirect).toHaveBeenCalledWith({ pathname: '/project/[id]/calendar', params: { id: 'p1' } });
});
