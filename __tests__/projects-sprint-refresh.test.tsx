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
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'p1' }),
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

import ProjectSprintsScreen from '@/app/project/[id]/sprints';
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
});

test('запис спринта задачі повз екран одразу видно на екрані Спринтів', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [TASK] });
  const tree = await mountSprints();

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

test('задача, створена на екрані Завдань, має валідний пріоритет (екран не падає)', async () => {
  seed({ projects: [PROJECT], sprints: [], tasks: [] });
  let tree: any;
  await act(async () => { tree = create(<ProjectTasksScreen />); });
  mounted = tree;
  await flush();
  const input = tree.root.findAll((n: any) => n.props?.placeholder === tr.projectAddTask && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('Нова'); });
  await act(async () => { input.props.onSubmitEditing(); });
  await flush();

  const [task] = read<any[]>('tasks');
  expect(task.title).toBe('Нова');
  expect(task.priority).toBe('medium');
  expect(task.priorityLevel).toBe(3);
  expect(allText(tree)).toContain('Нова');
});

test('«+» відкритого спринта створює задачу одразу в цьому спринті', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [] });
  const tree = await mountSprints();

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
  const labels = tree.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith(`${tr.sprintAddTaskA11y}: `)).map((n: any) => n.props.accessibilityLabel);
  expect(new Set(labels)).toEqual(new Set([`${tr.sprintAddTaskA11y}: ${SPRINT.name}`]));
});

test('екран Нарад проєкту: найближчі видно, минулі згорнуті під «Минулі (N)»', async () => {
  const future = { id: 'mf', title: 'Демо клієнту', date: '2099-01-10', time: '10:00', durationMinutes: 30, color: '#6366F1', projectId: 'p1' };
  const past = { id: 'mp', title: 'Старий кікоф', date: '2020-01-10', time: '10:00', durationMinutes: 30, color: '#0EA5E9', projectId: 'p1' };
  const foreign = { id: 'mx', title: 'Чужа зустріч', date: '2099-01-11', time: '10:00', durationMinutes: 30, color: '#0EA5E9', projectId: 'p2' };
  seed({ projects: [PROJECT], sprints: [], tasks: [TASK], meetings: [future, past, foreign] });
  let tree: any;
  await act(async () => { tree = create(<ProjectMeetingsScreen />); });
  mounted = tree;
  await flush();

  const text = allText(tree);
  expect(text).toContain('Демо клієнту');
  expect(text).not.toContain('Чужа зустріч');
  const pastLabel = tr.projectMeetingsPast.replace('{count}', '1');
  expect(text).toContain(pastLabel);
  expect(text).not.toContain('Старий кікоф');

  await pressByLabel(tree, pastLabel);
  expect(allText(tree)).toContain('Старий кікоф');
  // Екран зустрічей не пише, поки форма не збережена.
  expect(read<any[]>('meetings')).toHaveLength(3);
});
