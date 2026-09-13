/**
 * __tests__/done-stops-timer.test.tsx — «готово» з деталі проєкту зупиняє
 * таймер задачі (паритет з екраном Завдань, subtasks.tsx і вебом).
 *
 * Порядок важливий: стоп стору дописує сесію read-modify-write того самого
 * ключа 'tasks', тож він має йти ПІСЛЯ того, як наш запис статусу ліг у сховище.
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
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
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

/** Статус задачі у сховищі в момент виклику стопу — доказ порядку. */
const mockStatusAtStop: (string | undefined)[] = [];
const mockStopTimerForTask = jest.fn(async (taskId: string) => {
  const tasks = JSON.parse(mockStore.get('tasks') ?? '[]') as { id: string; status: string }[];
  mockStatusAtStop.push(tasks.find(t => t.id === taskId)?.status);
});
jest.mock('@/store/timer-context', () => {
  const noop = async () => {};
  const value = {
    pendingTask: '', setPendingTask: () => {}, activeTimers: [], timersReady: true,
    startTaskTimer: noop, startAdHocTimer: noop, startMeetingTimer: noop, stopTimer: noop,
    stopTimerForTask: (id: string) => mockStopTimerForTask(id),
    stopTimerForMeeting: noop, getTimerForTask: () => undefined, getTimerForMeeting: () => undefined,
    tasksRevision: 0, meetingsRevision: 0, timeEntriesRevision: 0,
  };
  return { useTimerContext: () => value };
});

import React from 'react';

import TodayScreen from '@/app/(tabs)/today';
import ProjectsScreen from '@/app/projects';
import { localDateKey } from '@/utils/dateUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const NOW = '2026-09-01T10:00:00.000Z';
const PROJECT = { id: 'p1', name: 'Сайт', color: '#EF4444', createdAt: NOW };
const TASK = { id: 't1', title: 'Зверстати головну', projectId: 'p1', status: 'active', createdAt: NOW, subtasks: [] };

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function pressByLabel(tree: any, label: string, pick: (nodes: any[]) => any = nodes => nodes[0]) {
  const nodes = tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props.onPress === 'function');
  if (nodes.length === 0) throw new Error(`немає кнопки «${label}»`);
  return act(async () => { pick(nodes).props.onPress(); });
}

let mounted: any = null;
afterEach(async () => {
  if (mounted) await act(async () => { mounted.unmount(); });
  mounted = null;
  mockStopTimerForTask.mockClear();
  mockStatusAtStop.length = 0;
  mockPush.mockReset();
});

async function openProjectDetail() {
  mockStore.clear();
  mockStore.set('projects', JSON.stringify([PROJECT]));
  mockStore.set('tasks', JSON.stringify([TASK]));
  let tree: any;
  await act(async () => { tree = create(<ProjectsScreen />); });
  mounted = tree;
  await flush();
  await pressByLabel(tree, PROJECT.name);
  await flush();
  return tree;
}

const checkbox = (nodes: any[]) => nodes.find(n => n.props.accessibilityRole === 'checkbox') ?? nodes[0];

test('деталь проєкту: active → done зупиняє таймер після запису статусу', async () => {
  const tree = await openProjectDetail();
  await pressByLabel(tree, TASK.title, checkbox);
  await flush();

  expect(JSON.parse(mockStore.get('tasks')!)[0].status).toBe('done');
  expect(mockStopTimerForTask).toHaveBeenCalledWith('t1');
  expect(mockStatusAtStop).toEqual(['done']);
});

test('деталь проєкту: done → active таймер не чіпає', async () => {
  const tree = await openProjectDetail();
  await pressByLabel(tree, TASK.title, checkbox);
  await flush();
  mockStopTimerForTask.mockClear();

  await pressByLabel(tree, TASK.title, checkbox);
  await flush();

  expect(JSON.parse(mockStore.get('tasks')!)[0].status).toBe('active');
  expect(mockStopTimerForTask).not.toHaveBeenCalled();
});

describe('вкладка «Сьогодні»', () => {
  const TODAY = localDateKey(new Date());

  async function mountToday(data: Record<string, unknown>) {
    mockStore.clear();
    for (const [k, v] of Object.entries(data)) mockStore.set(k, JSON.stringify(v));
    let tree: any;
    await act(async () => { tree = create(<TodayScreen />); });
    mounted = tree;
    await flush();
    await flush();
    return tree;
  }

  test('галочка active → done зупиняє таймер після запису статусу', async () => {
    const tree = await mountToday({ tasks: [{ ...TASK, deadline: TODAY }] });
    await pressByLabel(tree, TASK.title, checkbox);
    await flush();

    expect(JSON.parse(mockStore.get('tasks')!)[0].status).toBe('done');
    expect(mockStopTimerForTask).toHaveBeenCalledWith('t1');
    expect(mockStatusAtStop).toEqual(['done']);
  });

  test('повторювана зустріч, створена раніше, є в «Зустрічах сьогодні» з чипом проєкту й відкриває перегляд', async () => {
    const DAILY = {
      id: 'm1', title: 'Щоденний стендап', date: '2026-01-05', time: '23:58', durationMinutes: 1,
      color: '#6366F1', recurrence: { freq: 'daily', interval: 1 }, projectId: 'p1',
    };
    const tree = await mountToday({ meetings: [DAILY], projects: [PROJECT] });

    const row = tree.root.findAll((n: any) => n.props?.accessibilityLabel === `${DAILY.time} ${DAILY.title}` && typeof n.props.onPress === 'function');
    expect(row.length).toBeGreaterThan(0);
    expect(row[0].findAll((n: any) => n.props?.accessibilityLabel === PROJECT.name).length).toBeGreaterThan(0);

    await act(async () => { row[0].props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/', params: { meeting: 'm1', meetingDate: TODAY } });
  });
});
