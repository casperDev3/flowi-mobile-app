/**
 * __tests__/task-card-a11y.test.tsx — NAT-04.
 *
 * Чекбокс картки завдання розмічений правильно (role=checkbox, state.checked,
 * hitSlop 13 → ціль 44×44), але на пристрої окремого вузла в дереві не мав:
 * батьківський BlurView із `accessibilityRole="button"` + `accessibilityLabel`
 * робив картку ОДНИМ елементом і поглинав усе всередині. Наслідок —
 * відмітити завдання виконаним з VoiceOver зі списку неможливо.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

import React from 'react';

import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { mergeTaskStatusColumns } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const COLUMNS = mergeTaskStatusColumns([]);
const C = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED' };

const TASK = {
  id: 't1', title: 'A11Y тест', status: 'active', subtasks: [],
  createdAt: '2026-01-01T00:00:00.000Z', priorityLevel: 3,
} as unknown as Task;

function renderCard(onToggle?: (t: Task) => void) {
  let tree: any;
  act(() => {
    tree = create(
      <TaskCompactCard<Task>
        task={TASK}
        statusColumn={COLUMNS[0]}
        onPress={() => {}}
        onToggle={onToggle}
        c={C}
        isDark={false}
        projects={[]}
        sprints={[]}
        overdueLabel="Прострочено"
        priorityLabel="Пріоритет P3"
        subtasksLabel="Підзавдання"
      />,
    );
  });
  return tree;
}

describe('TaskCompactCard — дерево доступності (NAT-04)', () => {
  it('чекбокс лишається ОКРЕМИМ елементом: жоден його предок не accessible', () => {
    const toggled: Task[] = [];
    const tree = renderCard(t => toggled.push(t));

    const checkbox = tree.root.find((n: any) => n.props.accessibilityRole === 'checkbox');
    expect(checkbox.props.accessibilityState).toEqual({ checked: false });
    // 18 pt + hitSlop 13 з кожного боку = рівно 44×44 (Apple HIG).
    expect(checkbox.props.hitSlop).toEqual({ top: 13, bottom: 13, left: 13, right: 13 });

    // Жоден предок не має права бути елементом доступності — інакше чекбокс
    // зникає з дерева разом із рештою вмісту картки.
    for (let node = checkbox.parent; node; node = node.parent) {
      expect(node.props.accessible).not.toBe(true);
      expect(node.props.accessibilityLabel).toBeUndefined();
    }
  });

  it('назва картки озвучується окремим елементом і активується дотиком', () => {
    const opened: Task[] = [];
    let tree: any;
    act(() => {
      tree = create(
        <TaskCompactCard<Task>
          task={TASK}
          statusColumn={COLUMNS[0]}
          onPress={t => opened.push(t)}
          c={C}
          isDark={false}
          projects={[]}
          sprints={[]}
          overdueLabel="Прострочено"
          priorityLabel="Пріоритет P3"
          subtasksLabel="Підзавдання"
        />,
      );
    });
    const button = tree.root.find((n: any) => n.props.accessibilityRole === 'button' && n.props.accessible === true);
    expect(String(button.props.accessibilityLabel)).toContain('A11Y тест');
    expect(String(button.props.accessibilityLabel)).toContain('Пріоритет P3');
    act(() => { button.props.onAccessibilityTap(); });
    expect(opened).toHaveLength(1);
  });
});
