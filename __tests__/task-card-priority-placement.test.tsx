/**
 * __tests__/task-card-priority-placement.test.tsx — рішення власника, п. 4.
 *
 * В особистих картках бейдж пріоритету стоїть у правому кінці НИЖНЬОГО
 * мета-рядка (назва — на всю ширину). Картки простору проєкту (дошка/список
 * проєкту) лишаються як були: бейдж у правому верхньому куті.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

import React from 'react';

import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { mergeTaskStatusColumns } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const COLUMNS = mergeTaskStatusColumns([]);
const C = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED' };

function renderCard(task: Partial<Task>, placement?: 'footer' | 'corner') {
  let tree: any;
  act(() => {
    tree = create(
      <TaskCompactCard<Task>
        task={{ id: 't1', title: 'Задача', status: 'active', subtasks: [], createdAt: '2026-01-01T00:00:00.000Z', ...task } as Task}
        statusColumn={COLUMNS[0]}
        onPress={() => {}}
        c={C}
        isDark={false}
        projects={[]}
        sprints={[]}
        overdueLabel="Прострочено"
        priorityLabel="Пріоритет P2"
        subtasksLabel="Підзавдання"
        priorityPlacement={placement}
      />,
    );
  });
  return tree;
}

describe('TaskCompactCard — місце бейджа пріоритету', () => {
  it('типово (особисті картки) бейдж у нижньому мета-рядку', () => {
    const tree = renderCard({ priorityLevel: 2 } as Partial<Task>);
    const footer = tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.testID === 'task-card-priority-footer');
    expect(footer).toHaveLength(1);
    expect(footer[0].findAllByType(PriorityBadge)).toHaveLength(1);
    // Бейдж один — у кут не дублюється.
    expect(tree.root.findAllByType(PriorityBadge)).toHaveLength(1);
  });

  it('картка проєкту (corner) лишає бейдж у верхньому куті', () => {
    const tree = renderCard({ priorityLevel: 2 } as Partial<Task>, 'corner');
    expect(tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.testID === 'task-card-priority-footer')).toHaveLength(0);
    expect(tree.root.findAllByType(PriorityBadge)).toHaveLength(1);
  });

  it('без пріоритету нижній рядок не має порожнього місця під бейдж', () => {
    const tree = renderCard({ priorityLevel: null } as Partial<Task>);
    expect(tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.testID === 'task-card-priority-footer')).toHaveLength(0);
  });
});

describe('TaskCompactCard — підзавдання й дата праворуч одним рядком (11.2026)', () => {
  const metaRight = (tree: any) =>
    tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.testID === 'task-card-meta-right');
  const textOf = (node: any): string =>
    (node.children ?? []).map((ch: any) => (typeof ch === 'string' ? ch : textOf(ch))).join('');

  it('«1/2» і «12 лис» — один рядок праворуч, без смужки прогресу', () => {
    const tree = renderCard({
      deadline: '2026-11-12',
      subtasks: [{ id: 's1', title: 'a', done: true }, { id: 's2', title: 'b', done: false }],
    } as Partial<Task>);
    const meta = metaRight(tree);
    expect(meta).toHaveLength(1);
    expect(meta[0].props.numberOfLines).toBe(1);
    expect(textOf(meta[0]).replace(/\s+/g, ' ')).toBe('1/2 · 12 лис');
    expect(tree.root.findAll((n: any) => n.type?.name === 'SegmentedProgress')).toHaveLength(0);
  });

  it('без підзавдань і дедлайну нічого не малює', () => {
    expect(metaRight(renderCard({}))).toHaveLength(0);
  });

  it('дата озвучується у підписі картки', () => {
    const tree = renderCard({ deadline: '2026-11-12' } as Partial<Task>);
    const row = tree.root.findAll((n: any) => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && typeof n.props.accessibilityLabel === 'string');
    expect(row.some((n: any) => n.props.accessibilityLabel.includes('12 листопада'))).toBe(true);
  });
});
