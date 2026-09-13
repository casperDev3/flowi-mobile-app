/**
 * __tests__/projects-sprint-refresh.test.tsx — «поклав задачу у спринт, а в
 * деталі проєкту її назви не видно».
 *
 * Причини на мобільному були не у верстці, а в даних і модалках:
 *   1. екран читав сховище один раз на монтуванні — зміна спринта деінде
 *      (екран Завдань, синк, стор таймерів) до деталі не доходила;
 *   2. вибір спринта був другою модалкою поверх модалки деталі (iOS);
 *   3. ефект «зберегти стан» писав застарілий масив спринтів і тим самим
 *      ВИДАЛЯВ спринти, створені деінде (saveSynced дифає за id).
 * Тести монтують екран цілком на підробленому AsyncStorage.
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
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
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

import ProjectsScreen from '@/app/projects';
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

/**
 * Текст лише деталі проєкту (від заголовка «Спринти»). Назва задачі
 * трапляється й вище — у графіках списку.
 */
function detailText(tree: any): string {
  const text = allText(tree);
  return text.slice(text.lastIndexOf(tr.sprints));
}

/** Задача стоїть у групі спринта ⇔ її назва ВИЩЕ заголовка «Беклог» (беклог — остання група). */
function taskInSprintGroup(tree: any, title: string): boolean {
  const text = detailText(tree);
  const titleAt = text.indexOf(title);
  const backlogAt = text.indexOf(tr.sprintBacklog);
  if (titleAt < 0 || backlogAt < 0) throw new Error(`немає «${title}» або «${tr.sprintBacklog}» у деталі`);
  return titleAt < backlogAt;
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
  // Найглибша кнопка — сам рядок, а не обгортка навколо всієї деталі.
  return act(async () => { nodes[nodes.length - 1].props.onPress(); });
}

let mounted: any = null;

async function mountAndOpenProject() {
  let tree: any;
  await act(async () => { tree = create(<ProjectsScreen />); });
  mounted = tree;
  await flush();
  await pressByLabel(tree, PROJECT.name);
  await flush();
  return tree;
}

afterEach(async () => {
  // Розмонтувати, щоб таймери VirtualizedList не логували після кінця тесту.
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
});

test('запис спринта задачі повз екран одразу видно в деталі проєкту', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [TASK] });
  const tree = await mountAndOpenProject();

  // До: задача в беклозі.
  expect(detailText(tree)).toContain(TASK.title);
  expect(taskInSprintGroup(tree, TASK.title)).toBe(false);

  // Інший екран (або синк) кладе задачу у спринт.
  await act(async () => {
    await saveData('tasks', [{ ...TASK, sprintId: SPRINT.id }]);
  });
  await flush();

  // Після: назва на місці — задача перейшла в групу спринта (беклог лишається
  // останньою групою, як у вебі, але вже порожній).
  expect(detailText(tree)).toContain(TASK.title);
  expect(taskInSprintGroup(tree, TASK.title)).toBe(true);
});

test('вибір спринта з деталі — інлайн, без другої модалки, назва лишається видимою', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [TASK] });
  const tree = await mountAndOpenProject();
  const modalsBefore = tree.root.findAll((n: any) => n.props?.visible === true && n.props?.transparent === true).length;

  await pressByLabel(tree, tr.sprintPick);
  // Панель вибору розгорнулась, а нова модалка не з'явилась.
  expect(tree.root.findAll((n: any) => n.props?.visible === true && n.props?.transparent === true).length).toBe(modalsBefore);
  await pressText(tree, SPRINT.name);
  await flush();

  expect(read<any[]>('tasks')[0].sprintId).toBe(SPRINT.id);
  expect(detailText(tree)).toContain(TASK.title);
  expect(taskInSprintGroup(tree, TASK.title)).toBe(true);
});

test('закритий спринт згорнутий за замовчуванням і розгортається тапом; у рядку є статус', async () => {
  const CLOSED = { id: 's0', projectId: 'p1', name: 'Минулий спринт', createdAt: NOW, closedAt: NOW };
  const DONE_TASK = { ...TASK, id: 't2', title: 'Здана задача', status: 'done', sprintId: CLOSED.id };
  seed({ projects: [PROJECT], sprints: [SPRINT, CLOSED], tasks: [TASK, DONE_TASK] });
  const tree = await mountAndOpenProject();

  // Заголовок закритого спринта видно, його задач — ні.
  expect(detailText(tree)).toContain(CLOSED.name);
  expect(detailText(tree)).not.toContain(DONE_TASK.title);
  // Беклог — остання група, розгорнута; у рядку задачі — чип статусу.
  expect(taskInSprintGroup(tree, TASK.title)).toBe(false);
  expect(detailText(tree)).toContain(`${TASK.title}|До роботи`);

  await pressByLabel(tree, CLOSED.name);
  expect(detailText(tree)).toContain(DONE_TASK.title);

  await pressByLabel(tree, CLOSED.name);
  expect(detailText(tree)).not.toContain(DONE_TASK.title);
});

test('перейменування спринта не видаляє спринт, створений деінде', async () => {
  seed({ projects: [PROJECT], sprints: [SPRINT], tasks: [TASK] });
  const tree = await mountAndOpenProject();

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

test('задача, створена в деталі проєкту, має валідний пріоритет (екран Завдань не падає)', async () => {
  seed({ projects: [PROJECT], sprints: [], tasks: [] });
  const tree = await mountAndOpenProject();
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
  const tree = await mountAndOpenProject();

  await pressByLabel(tree, `${tr.sprintAddTaskA11y}: ${SPRINT.name}`);
  const placeholder = tr.sprintAddTaskIn.replace('{name}', SPRINT.name);
  const input = tree.root.findAll((n: any) => n.props?.placeholder === placeholder && typeof n.props.onChangeText === 'function')[0];
  await act(async () => { input.props.onChangeText('Задача спринта'); });
  await act(async () => { input.props.onSubmitEditing(); });
  await flush();

  const [task] = read<any[]>('tasks');
  expect(task.title).toBe('Задача спринта');
  expect(task.sprintId).toBe(SPRINT.id);
  expect(task.projectId).toBe(PROJECT.id);
  expect(task.priorityLevel).toBe(3);
  expect(taskInSprintGroup(tree, 'Задача спринта')).toBe(true);
});

test('закритий спринт не пропонує «+ задача»', async () => {
  const CLOSED = { id: 's0', projectId: 'p1', name: 'Минулий спринт', createdAt: NOW, closedAt: NOW };
  seed({ projects: [PROJECT], sprints: [SPRINT, CLOSED], tasks: [] });
  const tree = await mountAndOpenProject();
  const labels = tree.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith(`${tr.sprintAddTaskA11y}: `)).map((n: any) => n.props.accessibilityLabel);
  expect(new Set(labels)).toEqual(new Set([`${tr.sprintAddTaskA11y}: ${SPRINT.name}`]));
});

test('секція «Зустрічі»: найближчі видно, минулі згорнуті під «Минулі (N)»', async () => {
  const future = { id: 'mf', title: 'Демо клієнту', date: '2099-01-10', time: '10:00', durationMinutes: 30, color: '#6366F1', projectId: 'p1' };
  const past = { id: 'mp', title: 'Старий кікоф', date: '2020-01-10', time: '10:00', durationMinutes: 30, color: '#0EA5E9', projectId: 'p1' };
  const foreign = { id: 'mx', title: 'Чужа зустріч', date: '2099-01-11', time: '10:00', durationMinutes: 30, color: '#0EA5E9', projectId: 'p2' };
  seed({ projects: [PROJECT], sprints: [], tasks: [TASK], meetings: [future, past, foreign] });
  const tree = await mountAndOpenProject();

  const text = allText(tree);
  expect(text).toContain(tr.meetings);
  expect(text).toContain('Демо клієнту');
  expect(text).not.toContain('Чужа зустріч');
  const pastLabel = tr.projectMeetingsPast.replace('{count}', '1');
  expect(text).toContain(pastLabel);
  expect(text).not.toContain('Старий кікоф');

  await pressText(tree, pastLabel);
  expect(allText(tree)).toContain('Старий кікоф');
  // Екран зустрічей не пише.
  expect(read<any[]>('meetings')).toHaveLength(3);
});
