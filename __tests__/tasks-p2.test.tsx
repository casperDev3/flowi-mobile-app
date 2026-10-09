/**
 * __tests__/tasks-p2.test.tsx — P2 екрана Завдань і режиму проєкту.
 *
 *  - «готово → не готово» повертає попередню колонку й підзавдання
 *    (utils/taskCompletion.ts), а не скидає все в «До роботи»;
 *  - SheetModal handle="inside": ручка й ✕ — усередині картки, а не рядком
 *    над нею на бекдропі;
 *  - шапка Завдань: одна кнопка «⋯» (календар — пункт меню), у групи
 *    «Зустрічі» немає власного «+» чи інлайн-поля;
 *  - швидке створення в просторі проєкту: проєкт зафіксований.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});

import fs from 'fs';
import path from 'path';
import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

import { SheetHandle, SheetModal } from '@/components/shared/SheetModal';
import { TaskQuickCreate } from '@/components/tasks/card/TaskQuickCreate';
import { TaskDetailHeader, TaskDetailHeaderAction } from '@/components/tasks/TaskDetailHeader';
import { useTaskEditor } from '@/hooks/use-task-editor';
import { allTranslations } from '@/store/translations';
import { lastReopenInfo, reopenColumnId, reopenSubtasks, withReopenInfo } from '@/utils/taskCompletion';
import { appendHistory } from '@/utils/taskHistory';
import { mergeTaskStatusColumns } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const C = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED', sheet: '#FFF' };

const BASE: Task = {
  id: 't1', title: 'Звіт', status: 'active', kanbanColumnId: 'status-in-progress', createdAt: '2026-01-01T00:00:00.000Z',
  subtasks: [
    { id: 's1', title: 'Зібрати дані', done: true },
    { id: 's2', title: 'Написати', done: false },
  ],
};

/** Так само, як toggleTask: «готово» з поміткою, звідки прийшли. */
function complete(task: Task): Task {
  return {
    ...task,
    status: 'done',
    kanbanColumnId: 'status-done',
    subtasks: task.subtasks.map(s => ({ ...s, done: true })),
    history: withReopenInfo(appendHistory(task, 'done'), task),
  };
}

describe('готово → не готово (utils/taskCompletion)', () => {
  const columns = mergeTaskStatusColumns([]);

  test('подія «done» памʼятає колонку й відкриті підзавдання', () => {
    const done = complete(BASE);
    expect(lastReopenInfo(done)).toEqual({ columnId: 'status-in-progress', openSubtaskIds: ['s2'] });
  });

  test('зняття «готово» повертає попередню колонку, а не першу', () => {
    const done = complete(BASE);
    expect(columns.some(c => c.id === 'status-in-progress')).toBe(true);
    expect(reopenColumnId(done, columns, 'status-active')).toBe('status-in-progress');
  });

  test('підзавдання: відкриті до завершення — знову відкриті, закриті людиною — лишаються', () => {
    const done = complete(BASE);
    const subs = reopenSubtasks(done);
    expect(subs.find(s => s.id === 's1')!.done).toBe(true);
    expect(subs.find(s => s.id === 's2')!.done).toBe(false);
  });

  test('без збереженої інформації нічого не скидається, колонка — запасна', () => {
    const legacy: Task = { ...BASE, status: 'done', subtasks: BASE.subtasks.map(s => ({ ...s, done: true })), history: [] };
    expect(reopenSubtasks(legacy)).toBe(legacy.subtasks);
    expect(reopenColumnId(legacy, columns, 'status-active')).toBe('status-active');
  });

  test('колонку, якої вже нема (видалили), не повертаємо', () => {
    const done = complete({ ...BASE, kanbanColumnId: 'st-deleted' });
    expect(reopenColumnId(done, columns, 'status-active')).toBe('status-active');
  });
});

describe('SheetModal handle="inside"', () => {
  const trees: any[] = [];
  afterEach(() => { act(() => { while (trees.length) trees.pop().unmount(); }); });

  function closeButtons(tree: any) {
    return tree.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityLabel === tr.close);
  }

  test('сам SheetModal рядка над карткою не малює — ✕ дає SheetHandle усередині', () => {
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      let tree: any;
      act(() => {
        tree = create(
          <SheetModal visible onClose={onClose} handle="inside">
            <SheetHandle />
            <Text>картка</Text>
          </SheetModal>,
        );
      });
      trees.push(tree);
      const buttons = closeButtons(tree);
      expect(buttons).toHaveLength(1);
      // Повна ціль 44×44, а не 17 + hitSlop.
      const style = Object.assign({}, ...[buttons[0].props.style].flat());
      expect(style.width).toBe(44);
      expect(style.height).toBe(44);
      act(() => { buttons[0].props.onPress(); });
      act(() => { jest.runAllTimers(); });
      expect(onClose).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('типово (outside) — як і раніше: один ✕ від самого SheetModal', () => {
    let tree: any;
    act(() => { tree = create(<SheetModal visible onClose={jest.fn()}><Text>вміст</Text></SheetModal>); });
    trees.push(tree);
    expect(closeButtons(tree)).toHaveLength(1);
  });

  test('SheetHandle поза SheetModal нічого не малює', () => {
    let tree: any;
    act(() => { tree = create(<SheetHandle />); });
    trees.push(tree);
    expect(tree.toJSON()).toBeNull();
  });
});

describe('швидке створення в просторі проєкту', () => {
  function Harness() {
    const editor = useTaskEditor('active', new Date(2026, 9, 6));
    React.useEffect(() => { editor.reset('active', { projectId: 'p1' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <TaskQuickCreate editor={editor} pickableProjects={[{ id: 'p1', name: 'Сайт', color: '#f00' }]}
        projects={[{ id: 'p1', name: 'Сайт', color: '#f00' }]} projectLocked today={new Date(2026, 9, 6)}
        onSave={jest.fn()} onMore={jest.fn()} colors={C} isDark={false} locale="uk-UA" />
    );
  }

  test('чип проєкту лише показує проєкт — вибору немає', () => {
    jest.useFakeTimers();
    try {
      let tree: any;
      act(() => { tree = create(<Harness />); });
      const chip = tree.root.findAll((n: any) => typeof n.props?.accessibilityLabel === 'string'
        && n.props.accessibilityLabel.startsWith(tr.project) && n.props.accessibilityRole === 'button')[0];
      expect(chip).toBeTruthy();
      expect(chip.props.onPress).toBeUndefined();
      act(() => { tree.unmount(); });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('шапка картки — додаткові дії', () => {
  test('«Стежити» стоїть у шапці поруч із ✕ і озвучує стан', () => {
    const onWatch = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        <TaskDetailHeader
          title="Звіт" tab="main" onTabChange={() => {}} timerRunning={false} onClose={() => {}} showHandle
          actions={<TaskDetailHeaderAction icon="eye" label={tr.taskWatch} active={false} onPress={onWatch} color="#666" />}
          colors={C} tr={tr}
        />,
      );
    });
    const watch = tree.root.findAll((n: any) => n.type === TouchableOpacity && n.props.accessibilityLabel === tr.taskWatch)[0];
    expect(watch.props.accessibilityState).toEqual({ selected: false });
    act(() => { watch.props.onPress(); });
    expect(onWatch).toHaveBeenCalledTimes(1);
  });
});

describe('екран Завдань — одна кнопка «⋯» і одне правило створення', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', '(tabs)', 'index.tsx'), 'utf8');
  const header = src.slice(src.indexOf('<ScreenHeader'), src.indexOf('</ScreenHeader>'));

  test('у шапці немає окремої кнопки календаря — лише створення і «⋯»', () => {
    expect(header).not.toContain("router.push('/calendar'");
    expect((header.match(/<HeaderButton/g) ?? []).length).toBe(1);
    expect(header).toContain('name="ellipsis"');
  });

  test('календар, архів, фільтри — пункти меню «⋯»', () => {
    const menu = src.slice(src.indexOf('Options Dropdown'), src.indexOf('Filter & Sort Bottom Sheet'));
    expect(menu).toContain("router.push('/calendar'");
    expect(menu).toContain("router.push('/archive')");
    expect(menu).toContain('tr.filtersAndSort');
  });

  test('у групи «Зустрічі» немає власного «+» і інлайн-поля «Додати зустріч»', () => {
    expect(src).not.toContain('tr.addMeeting');
    expect(src).not.toContain('openAddMeeting');
  });
});
