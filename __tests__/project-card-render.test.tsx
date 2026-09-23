/**
 * __tests__/project-card-render.test.tsx — картка проєкту зі статистикою
 * (docs/specs/projects-analytics.md §8.2, §10): усі лічильники, порожній
 * проєкт, проєкт без спринтів, протермінований спринт; плюс екран «Спринти»
 * з датами, burndown і велосіті (§8.4).
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

import { ProjectCard } from '@/app/projects';
import ProjectSprintsScreen from '@/app/project/[id]/sprints';
import { PortfolioKpi } from '@/components/projects/PortfolioKpi';
import { allTranslations } from '@/store/translations';
import { projectStats } from '@/utils/projectStats';
import {
  currentSprintCard, portfolioKpi, projectCounters, type MetricsTaskLike,
} from '@/utils/projectStatsMetrics';
import type { Sprint } from '@/utils/sprintUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const NOW = new Date(2026, 8, 23, 12);
const at = (d: number, h = 12) => new Date(2026, 8, d, h).toISOString();
const PROJECT = { id: 'p1', name: 'Сайт', color: '#7C3AED', createdAt: at(1) };

function allText(tree: any): string {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    walk(node.children);
  };
  walk(tree.toJSON());
  return out.join('');
}

const labels = (tree: any): string[] =>
  tree.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string').map((n: any) => n.props.accessibilityLabel);

function renderCard(tasks: MetricsTaskLike[], sprints: Sprint[], opts: { sprintsEnabled?: boolean; canEditContent?: boolean } = {}) {
  const stats = projectStats(PROJECT, tasks as any, NOW);
  const counters = projectCounters(PROJECT, tasks, sprints, [], NOW);
  const sprintCard = opts.sprintsEnabled === false ? null : currentSprintCard(PROJECT, sprints, tasks, NOW);
  let tree: any;
  act(() => {
    tree = create(
      <ProjectCard
        project={PROJECT}
        stats={stats}
        counters={counters}
        sprintCard={sprintCard}
        sprintsEnabled={opts.sprintsEnabled !== false}
        canEditContent={opts.canEditContent !== false}
        onOpenSprints={jest.fn()}
        buckets={[]}
        selected={false}
        locale="uk-UA"
        tr={tr}
        isDark={false}
        borderColor="#ddd"
        textColor="#111"
        subColor="#666"
        surfaceColor="#fff"
        accentColor="#7C3AED"
        canManage
        onPress={jest.fn()}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onLeave={jest.fn()}
      />,
    );
  });
  return tree;
}

const SPRINT: Sprint = { id: 's1', projectId: 'p1', name: 'Тиждень 12', createdAt: at(1), startDate: at(21, 0), endDate: at(26, 0) };
const TASKS: MetricsTaskLike[] = [
  { id: '1', status: 'done', projectId: 'p1', sprintId: 's1' },
  { id: '2', status: 'active', projectId: 'p1', kanbanColumnId: 'status-in-progress', sprintId: 's1', assigneeId: 'u' },
  { id: '3', status: 'active', projectId: 'p1', deadline: at(20) },
  { id: '4', status: 'active', projectId: 'p1', assigneeId: '' },
];

test('картка: воронка, ознаки з повною базою для читалки й поточний спринт', () => {
  const tree = renderCard(TASKS, [SPRINT]);
  const text = allText(tree);
  expect(text).toContain(`1/4 ${tr.projectDone}`);
  expect(text).toContain(`1 ${tr.projectInProgress}`);
  expect(text).toContain(`1 ${tr.projectOverdueTasks}`);
  expect(text).toContain(`2 ${tr.projectUnassigned}`);
  expect(text).toContain(`2 ${tr.projectBacklog}`);
  expect(text).toContain(tr.sprintCurrent);
  expect(text).toContain(SPRINT.name);
  expect(text).toContain(tr.sprintDaysLeft.replace('{n}', '3'));
  expect(labels(tree)).toContain('2 із 3 відкритих задач: без виконавця');
  // Друга шкала на картці — зі своїм підписом.
  expect(labels(tree).some(l => l.startsWith('Прогрес спринта «Тиждень 12»'))).toBe(true);
});

test('нулі не показуються, крім «виконано»', () => {
  const tree = renderCard([{ id: '1', status: 'active', projectId: 'p1', assigneeId: 'u', sprintId: 's1' }], [SPRINT]);
  const text = allText(tree);
  expect(text).toContain(`0/1 ${tr.projectDone}`);
  expect(text).not.toContain(tr.projectOverdueTasks);
  expect(text).not.toContain(tr.projectUnassigned);
  expect(text).not.toContain(tr.projectBacklog);
});

test('порожній проєкт — лише «Задач ще немає»', () => {
  const tree = renderCard([], []);
  const text = allText(tree);
  expect(text).toContain(tr.projectNoTasks);
  expect(text).not.toContain(tr.projectDone);
  expect(text).not.toContain(tr.sprintCurrent);
});

test('модуль «Спринти» вимкнено — ні спринта, ні «без спринту»', () => {
  const tree = renderCard(TASKS, [SPRINT], { sprintsEnabled: false });
  const text = allText(tree);
  expect(text).not.toContain(tr.sprintCurrent);
  expect(text).not.toContain(tr.projectBacklog);
});

test('протермінований спринт — бурштинова мітка й «Закрити» лише для редакторів', () => {
  const past: Sprint = { ...SPRINT, startDate: at(10, 0), endDate: at(20, 0) };
  const editor = renderCard(TASKS, [past]);
  expect(allText(editor)).toContain(tr.sprintOverdueDays.replace('{n}', '3'));
  expect(labels(editor)).toContain(`${tr.sprintClose}: ${past.name}`);
  const viewer = renderCard(TASKS, [past], { canEditContent: false });
  expect(labels(viewer)).not.toContain(`${tr.sprintClose}: ${past.name}`);
});

test('спринт без дат — «без дат» замість днів', () => {
  const tree = renderCard(TASKS, [{ ...SPRINT, startDate: undefined, endDate: undefined }]);
  expect(allText(tree)).toContain(tr.sprintUndated);
});

test('портфель: шість плиток з одним підписом кожна і рядок «виконано за тиждень»', async () => {
  const kpi = portfolioKpi([PROJECT], TASKS, [SPRINT], [], NOW);
  let tree: any;
  await act(async () => {
    tree = create(<PortfolioKpi kpi={kpi} palette={{ text: '#111', sub: '#666', border: '#ddd', dim: '#eee', accent: '#7C3AED' }} />);
  });
  const l = labels(tree);
  expect(l).toContain(`1 ${tr.portfolioProjects}`);
  expect(l).toContain(`4 ${tr.portfolioTasks}`);
  expect(l).toContain(`1 / 25% ${tr.projectDone}`);
  expect(l).toContain(`2 ${tr.projectUnassigned}`);
  expect(allText(tree)).toContain(tr.doneByWeekTitle);
  // Задача done без журналу — окремим числом, а не мовчки.
  expect(allText(tree)).toContain(tr.burndownNoDoneDate.replace('{n}', '1'));
});

// ─── Екран «Спринти» ─────────────────────────────────────────────────────────

const read = <T,>(key: string): T => JSON.parse(mockStore.get(key) ?? 'null');
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
let mounted: any = null;

afterEach(async () => {
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
});

async function mountSprints(data: Record<string, unknown>) {
  mockStore.clear();
  for (const [k, v] of Object.entries(data)) mockStore.set(k, JSON.stringify(v));
  let tree: any;
  await act(async () => { tree = create(<ProjectSprintsScreen />); });
  mounted = tree;
  await flush();
  return tree;
}

function inputByLabel(tree: any, label: string) {
  return tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0];
}

async function pressByLabel(tree: any, label: string) {
  const node = tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`немає кнопки «${label}»`);
  await act(async () => { node.props.onPress(); });
}

async function pressText(tree: any, text: string) {
  const nodes = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
    && n.findAll((c: any) => c.props?.children === text).length > 0);
  await act(async () => { nodes[nodes.length - 1].props.onPress(); });
}

test('форма спринта: одна дата без другої не зберігається; обидві — зберігаються мерджем', async () => {
  const stored = { id: 's1', projectId: 'p1', name: 'Спринт 1', createdAt: at(1), futureField: 'keep' };
  const tree = await mountSprints({ projects: [PROJECT], sprints: [stored], tasks: [] });

  await pressByLabel(tree, tr.sprintRename);
  await act(async () => { inputByLabel(tree, tr.sprintStartDate).props.onChangeText('2026-09-21'); });
  await pressText(tree, tr.save);
  await flush();
  expect(allText(tree)).toContain(tr.sprintDatesPartial);
  expect(read<any[]>('sprints')[0].startDate).toBeUndefined();

  await act(async () => { inputByLabel(tree, tr.sprintEndDate).props.onChangeText('2026-09-27'); });
  await pressText(tree, tr.save);
  await flush();
  const [saved] = read<any[]>('sprints');
  expect(new Date(saved.startDate).getDate()).toBe(21);
  expect(new Date(saved.endDate).getDate()).toBe(27);
  expect(saved.futureField).toBe('keep');
  expect(saved.name).toBe('Спринт 1');
});

test('велосіті під закритими спринтами і рядок «без дат» для відкритого недатованого', async () => {
  const closed = (id: string, d1: number, d2: number) => ({
    id, projectId: 'p1', name: id, createdAt: at(d1), startDate: at(d1, 0), endDate: at(d2, 0), closedAt: at(d2, 18),
  });
  const tree = await mountSprints({
    projects: [PROJECT],
    sprints: [closed('A', 1, 7), closed('B', 8, 14), { id: 'open', projectId: 'p1', name: 'Відкритий', createdAt: at(15) }],
    tasks: [
      { id: '1', title: 'x', status: 'done', projectId: 'p1', sprintId: 'A' },
      { id: '2', title: 'y', status: 'done', projectId: 'p1', sprintId: 'B' },
      { id: '3', title: 'z', status: 'active', projectId: 'p1', sprintId: 'open' },
    ],
  });
  const text = allText(tree);
  expect(text).toContain(tr.velocityTitle);
  expect(text).toContain(tr.sprintNotDated);
  // Прогноз завжди з розміром вибірки.
  expect(text).toContain('спринтів у вибірці: 2');
});
