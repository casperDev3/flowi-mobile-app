/**
 * __tests__/task-form-sprint.test.tsx — поле «Спринт» у формі задачі (CONTRACT §D.3).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import React, { useEffect } from 'react';

import { TaskEditForm } from '@/components/tasks/TaskEditForm';
import { useTaskEditor } from '@/hooks/use-task-editor';
import { allTranslations } from '@/store/translations';
import type { Sprint } from '@/utils/sprintUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const NOW = '2026-09-01T10:00:00.000Z';
const TODAY = new Date(2026, 8, 13);
const PROJECTS = [
  { id: 'p1', name: 'Сайт', color: '#EF4444' },
  { id: 'p2', name: 'Без спринтів', color: '#3B82F6' },
];
const SPRINTS: Sprint[] = [
  { id: 's1', projectId: 'p1', name: 'Тиждень 1', createdAt: NOW },
  { id: 's0', projectId: 'p1', name: 'Старий', createdAt: NOW, closedAt: NOW },
];
const COLORS = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED', sheet: '#FFF' };

let editorRef: ReturnType<typeof useTaskEditor> | null = null;

function Harness({ preset, task, sprints = SPRINTS }: {
  preset?: { projectId: string | null; sprintId: string | null };
  task?: { id: string; title: string; status: string; projectId?: string; sprintId?: string };
  sprints?: Sprint[];
}) {
  const editor = useTaskEditor('active', TODAY);
  editorRef = editor;
  useEffect(() => {
    if (task) editor.begin(task as any, 'active');
    else if (preset) editor.reset('active', preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TaskEditForm
      submitLabel={tr.add}
      editor={editor}
      taskStatuses={[{ id: 'active', name: 'До роботи', color: '#999' } as any]}
      pickableProjects={PROJECTS}
      projects={PROJECTS}
      sprints={sprints}
      deadlineWeeks={[]}
      months={tr.months}
      weekdays={[]}
      deadlinePresets={[]}
      today={TODAY}
      onSave={() => {}}
      onCancel={() => {}}
      colors={COLORS}
      isDark={false}
      tr={tr}
      locale="uk-UA"
    />
  );
}

function render(el: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(el); });
  return tree;
}

// TouchableOpacity і його хост-вузол мають ті самі пропси — дедуп за підписом.
const sprintChips = (tree: any): string[] => [...new Set<string>(tree.root
  .findAll((n: any) => typeof n.props?.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith(`${tr.sprintField}: `) && typeof n.props.onPress === 'function')
  .map((n: any) => n.props.accessibilityLabel.slice(tr.sprintField.length + 2)))];

test('без проєкту поля «Спринт» немає', () => {
  const tree = render(<Harness />);
  expect(sprintChips(tree)).toEqual([]);
});

test('проєкт зі спринтами: «Беклог» за замовчуванням + лише відкриті спринти', () => {
  const tree = render(<Harness preset={{ projectId: 'p1', sprintId: null }} />);
  expect(sprintChips(tree)).toEqual([tr.sprintBacklog, 'Тиждень 1']);
  expect(editorRef!.draft.sprintId).toBeNull();
});

test('передвибір спринта (створення зі спринта в деталі проєкту)', () => {
  const tree = render(<Harness preset={{ projectId: 'p1', sprintId: 's1' }} />);
  const selected = tree.root.findAll((n: any) => n.props?.accessibilityLabel === `${tr.sprintField}: Тиждень 1`
    && typeof n.props.onPress === 'function')[0];
  expect(selected.props.accessibilityState).toEqual({ selected: true });
});

test('поточний закритий спринт показується з позначкою, а зміна проєкту скидає спринт', () => {
  const tree = render(<Harness preset={{ projectId: 'p1', sprintId: 's0' }} />);
  expect(sprintChips(tree)).toEqual([tr.sprintBacklog, 'Тиждень 1', `Старий ${tr.sprintClosedSuffix}`]);

  act(() => { editorRef!.patch({ projectId: 'p2', sprintId: null }); });
  expect(sprintChips(tree)).toEqual([]);
});

const pressChip = (tree: any, label: string) => {
  const node = tree.root.findAll((n: any) => n.props?.accessibilityLabel === `${tr.sprintField}: ${label}`
    && typeof n.props.onPress === 'function')[0];
  act(() => { node.props.onPress(); });
};

test('правка: «Беклог» не ховає закритий спринт задачі — до нього можна повернутись (як веб)', () => {
  const task = { id: 't1', title: 'Задача', status: 'active', projectId: 'p1', sprintId: 's0' };
  const tree = render(<Harness task={task} />);
  const closed = `Старий ${tr.sprintClosedSuffix}`;
  expect(sprintChips(tree)).toEqual([tr.sprintBacklog, 'Тиждень 1', closed]);

  pressChip(tree, tr.sprintBacklog);
  expect(editorRef!.draft.sprintId).toBeNull();
  expect(sprintChips(tree)).toEqual([tr.sprintBacklog, 'Тиждень 1', closed]);

  pressChip(tree, closed);
  expect(editorRef!.draft.sprintId).toBe('s0');
});

test('правка: проєкт лише із закритими спринтами — поле не зникає після «Беклогу»', () => {
  const onlyClosed = SPRINTS.filter(sp => sp.closedAt);
  const task = { id: 't1', title: 'Задача', status: 'active', projectId: 'p1', sprintId: 's0' };
  const tree = render(<Harness task={task} sprints={onlyClosed} />);
  pressChip(tree, tr.sprintBacklog);
  expect(sprintChips(tree)).toEqual([tr.sprintBacklog, `Старий ${tr.sprintClosedSuffix}`]);
});

test('правка: зміна проєкту все одно прибирає вихідний спринт із варіантів', () => {
  const task = { id: 't1', title: 'Задача', status: 'active', projectId: 'p1', sprintId: 's0' };
  const tree = render(<Harness task={task} />);
  act(() => { editorRef!.patch({ projectId: 'p2', sprintId: null }); });
  expect(sprintChips(tree)).toEqual([]);
});
