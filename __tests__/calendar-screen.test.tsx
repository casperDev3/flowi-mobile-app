/**
 * __tests__/calendar-screen.test.tsx — «Календар» збирає зустрічі, дедлайни
 * завдань і спринти на одну сітку; телефон стартує з місяця, планшет — з
 * тижня; «+» питає, що створити, а завдання створює аркушем просто тут.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
  multiRemove: jest.fn(async (keys: string[]) => { keys.forEach(k => mockStore.delete(k)); }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-av', () => ({ Audio: null }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('@/components/shared/SheetModal', () => ({
  SheetModal: ({ visible, children }: any) => (visible ? children : null),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockWidth = 390;
jest.mock('@/hooks/use-responsive', () => ({
  useResponsive: () => {
    const width = mockWidth;
    const sizeClass = width < 600 ? 'compact' : width < 840 ? 'medium' : 'expanded';
    return {
      width, height: 900, sizeClass, isCompact: sizeClass === 'compact', isMedium: sizeClass === 'medium',
      isExpanded: sizeClass === 'expanded', isWide: sizeClass !== 'compact', landscape: width > 900,
    };
  },
  useScreenWidth: () => mockWidth,
}));
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  useRouter: () => ({ back: jest.fn(), push: mockPush, setParams: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  usePathname: () => '/calendar',
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

import CalendarScreen from '@/app/calendar';
import { dateKey, deadlineIsoForKey } from '@/components/calendar/calendarModel';
import { TaskQuickCreate } from '@/components/tasks/card/TaskQuickCreate';

const today = dateKey(new Date());

function seed() {
  mockStore.set('meetings', JSON.stringify([
    { id: 'm1', title: 'Планування', date: today, time: '10:00', durationMinutes: 60, color: '#6366F1' },
  ]));
  mockStore.set('tasks', JSON.stringify([
    { id: 't1', title: 'Здати звіт', status: 'active', subtasks: [], createdAt: '2026-01-01T00:00:00.000Z', deadline: deadlineIsoForKey(today) },
  ]));
  mockStore.set('projects', JSON.stringify([{ id: 'p1', name: 'Alpha', color: '#EF4444', createdAt: '2026-01-01' }]));
  mockStore.set('sprints', JSON.stringify([
    { id: 's1', projectId: 'p1', name: 'Спринт А', createdAt: '2026-01-01', startDate: deadlineIsoForKey(today), endDate: deadlineIsoForKey(today) },
    { id: 's2', projectId: 'p1', name: 'Без дат', createdAt: '2026-01-02' },
  ]));
}

function texts(tree: any): string[] {
  return tree.root.findAll((n: any) => typeof n.type === 'string' && n.type === 'Text')
    .map((n: any) => [].concat(n.props.children).filter((x: any) => typeof x === 'string' || typeof x === 'number').join(''));
}

let mounted: any = null;
afterEach(async () => {
  if (mounted) { const t = mounted; mounted = null; await act(async () => { t.unmount(); }); }
  jest.restoreAllMocks();
  mockPush.mockReset();
  mockStore.clear();
  mockParams = {};
});

async function mount(width: number) {
  mockWidth = width;
  seed();
  let tree: any;
  await act(async () => { tree = create(<CalendarScreen />); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  mounted = tree;
  return tree;
}

describe('CalendarScreen', () => {
  it('?create=meeting&date= (iOS-віджет «Додати подію») одразу відкриває форму події на цей день', async () => {
    mockParams = { create: 'meeting', date: '2026-11-03' };
    const { MeetingFormSheet } = require('@/components/shared/MeetingFormSheet');
    const tree = await mount(390);
    const sheet = tree.root.findByType(MeetingFormSheet);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.initial).toBeNull();
    expect(sheet.props.presetDate).toBe('2026-11-03');
  });

  it('телефон: місяць + список дня із зустріччю, дедлайном і спринтом', async () => {
    const tree = await mount(390);
    const t = texts(tree).join('|');
    expect(t).toContain('Планування');
    expect(t).toContain('Здати звіт');
    expect(t).toContain('Спринт А');
  });

  it('планшет: тиждень із погодинною сіткою', async () => {
    const tree = await mount(1024);
    const t = texts(tree).join('|');
    expect(t).toContain('09:00');
    expect(t).toContain('Планування');
  });

  it('«+» → Завдання: коротка форма аркушем на Календарі, запис із дедлайном дня, без переходу', async () => {
    const tree = await mount(390);
    const fab = tree.root.findAll((n: any) => n.props.testID === 'calendar-fab' && n.props.onPress)[0];
    await act(async () => { fab.props.onPress(); });
    const taskOption = tree.root.findAll((n: any) => n.props.testID === 'calendar-create-task' && n.props.onPress)[0];
    await act(async () => { taskOption.props.onPress(); });
    await act(async () => { await new Promise(r => setTimeout(r, 350)); });
    const quick = tree.root.findByType(TaskQuickCreate);
    expect(quick.props.editor.draft.deadline).toBe(deadlineIsoForKey(today));
    await act(async () => { quick.props.editor.patch({ title: 'Нове з календаря' }); });
    await act(async () => { tree.root.findByType(TaskQuickCreate).props.onSave(); });
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    const saved = JSON.parse(mockStore.get('tasks') ?? '[]');
    const created = saved.find((t: any) => t.title === 'Нове з календаря');
    expect(created).toBeTruthy();
    expect(created.deadline).toBe(deadlineIsoForKey(today));
    expect(mockPush).not.toHaveBeenCalled();
    expect(texts(tree).join('|')).toContain('Нове з календаря');
  });

  it('телефон: один «+» — лише FAB, без кнопки в заголовку дня', async () => {
    const tree = await mount(390);
    const addToDay = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Додати на цей день' && n.props.onPress);
    expect(addToDay).toHaveLength(0);
    expect(tree.root.findAll((n: any) => n.props.testID === 'calendar-fab' && n.props.onPress).length).toBeGreaterThan(0);
  });

  it('планшет: права колонка дня — лише читання (без кошика й мікрофона)', async () => {
    const tree = await mount(1024);
    const t = texts(tree).join('|');
    expect(t).toContain('Планування');
    const trash = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Видалити' && n.props.onPress);
    expect(trash).toHaveLength(0);
  });

  it('«Лише мої» типово вимкнено: видно і чужі завдання проєкту з дедлайном', async () => {
    mockWidth = 390;
    seed();
    mockStore.set('tasks', JSON.stringify([
      { id: 't2', title: 'Чуже завдання', status: 'active', subtasks: [], createdAt: '2026-01-01T00:00:00.000Z',
        deadline: deadlineIsoForKey(today), projectId: 'p1', assigneeId: 'someone-else' },
    ]));
    let tree: any;
    await act(async () => { tree = create(<CalendarScreen />); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    mounted = tree;
    expect(texts(tree).join('|')).toContain('Чуже завдання');
  });

  it('пошук: лупа в шапці → збіги зустрічей і завдань', async () => {
    const tree = await mount(390);
    const btn = tree.root.findAll((n: any) => n.props.accessibilityLabel === 'Пошук у календарі' && n.props.onPress)[0];
    await act(async () => { btn.props.onPress(); });
    const input = tree.root.findAll((n: any) => n.props.testID === 'calendar-search-input' && n.props.onChangeText)[0];
    await act(async () => { input.props.onChangeText('план'); });
    const t = texts(tree).join('|');
    expect(t).toContain('Планування');
    expect(t).not.toContain('Здати звіт');
  });
});
