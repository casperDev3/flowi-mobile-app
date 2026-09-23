/**
 * __tests__/active-timers-bar-render.test.tsx — панель над табами (телефон) і
 * картка в сайдбарі (планшет): 1 таймер → назва + стоп; N → «N таймери» і
 * список зі стопом для кожного, а під ним «Трекер часу» і «Зосередження».
 */
// Сховище — словник: мітці проєкту треба прочитати 'projects'.
const mockStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage[key] ?? null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
// Годинник без інтервалу: живий тікер пережив би тест і стукав у знесене середовище.
jest.mock('@/hooks/use-clock-tick', () => ({ useClockTick: () => Date.parse('2026-09-13T11:00:00.000Z') }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

let mockWide = false;
jest.mock('@/hooks/use-responsive', () => ({
  useResponsive: () => ({ isWide: mockWide, isCompact: !mockWide, isExpanded: mockWide, width: 400, height: 800 }),
}));

// Режим зосередження — окремий повноекранний компонент зі своїм стором;
// тут важливо лише, чи його відкрили.
jest.mock('@/components/time/FullscreenTimers', () => ({ FullscreenTimers: 'FullscreenTimers' }));

const mockStop = jest.fn(async () => {});
let mockTimers: any[] = [];
jest.mock('@/store/timer-context', () => ({
  useTimerContext: () => ({ activeTimers: mockTimers, stopTimer: mockStop }),
}));

import React from 'react';
import { Modal, Text } from 'react-native';

import { ActiveTimersBar } from '@/components/time/ActiveTimersBar';
import { ActiveTimersSidebarCard } from '@/components/time/ActiveTimersSidebarCard';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const T1 = { id: 'task:1', taskId: '1', label: 'Звіт', startedAt: '2026-09-13T09:00:00.000Z', shift: 'morning' };
const T2 = { id: 'adhoc:x', label: 'Читання', startedAt: '2026-09-13T10:00:00.000Z', shift: 'day' };
const COLORS = { text: '#111', sub: '#666', border: '#DDD', accent: '#6366F1', activeBg: '#EEE' };

function texts(tree: any): string[] {
  return tree.root.findAllByType(Text).map((n: any) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join('') : String(c);
  });
}
function stopButtons(tree: any) {
  return tree.root.findAll((n: any) =>
    typeof n.props.accessibilityLabel === 'string'
    && n.props.accessibilityLabel.startsWith('Зупинити таймер')
    && typeof n.props.onPress === 'function');
}

beforeEach(() => {
  mockStop.mockClear();
  mockPush.mockClear();
  mockWide = false;
  mockTimers = [];
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
});

describe('ActiveTimersBar (телефон)', () => {
  it('без таймерів — нічого', () => {
    let tree: any;
    act(() => { tree = create(<ActiveTimersBar />); });
    expect(tree.toJSON()).toBeNull();
  });

  it('на широкому екрані не рендериться (там картка сайдбара)', () => {
    mockWide = true;
    mockTimers = [T1];
    let tree: any;
    act(() => { tree = create(<ActiveTimersBar />); });
    expect(tree.toJSON()).toBeNull();
  });

  it('1 таймер: назва і стоп, стоп зупиняє саме його', async () => {
    mockTimers = [T1];
    let tree: any;
    act(() => { tree = create(<ActiveTimersBar />); });
    expect(texts(tree)).toContain('Звіт');
    expect(texts(tree)).toContain('02:00:00');
    const stops = stopButtons(tree);
    expect(stops.length).toBeGreaterThan(0);
    await act(async () => { stops[0].props.onPress(); });
    expect(mockStop).toHaveBeenCalledWith('task:1');
  });

  it('N таймерів: «2 таймери», тап відкриває аркуш зі стопом для кожного', async () => {
    mockTimers = [T2, T1];
    let tree: any;
    act(() => { tree = create(<ActiveTimersBar />); });
    expect(texts(tree)).toContain('2 таймери');
    expect(tree.root.findByType(Modal).props.visible).toBe(false);

    const body = tree.root.find((n: any) => n.props.accessibilityLabel === 'Показати всі активні таймери' && n.props.onPress);
    act(() => { body.props.onPress(); });
    expect(tree.root.findByType(Modal).props.visible).toBe(true);

    const stops = stopButtons(tree).filter((n: any) => /Звіт|Читання/.test(n.props.accessibilityLabel));
    const labels = new Set(stops.map((n: any) => n.props.accessibilityLabel));
    expect(labels).toEqual(new Set(['Зупинити таймер: Звіт', 'Зупинити таймер: Читання']));
    await act(async () => { stops.find((n: any) => n.props.accessibilityLabel.endsWith('Читання')).props.onPress(); });
    expect(mockStop).toHaveBeenCalledWith('adhoc:x');
  });

  it('аркуш: «Трекер часу» і «Зосередження» в одному рядку; зосередження відкривається після закриття аркуша', () => {
    jest.useFakeTimers();
    try {
      mockTimers = [T2, T1];
      mockPush.mockClear();
      let tree: any;
      act(() => { tree = create(<ActiveTimersBar />); });
      const body = tree.root.find((n: any) => n.props.accessibilityLabel === 'Показати всі активні таймери' && n.props.onPress);
      act(() => { body.props.onPress(); });
      expect(texts(tree)).toEqual(expect.arrayContaining(['Трекер часу', 'Зосередження']));

      const focus = tree.root.find((n: any) => n.props.accessibilityLabel === 'Зосередження, Активні таймери: 2' && n.props.onPress);
      act(() => { focus.props.onPress(); });
      expect(tree.root.findByType(Modal).props.visible).toBe(false);
      expect(tree.root.findByType('FullscreenTimers' as any).props.visible).toBe(false);
      act(() => { jest.advanceTimersByTime(300); });
      expect(tree.root.findByType('FullscreenTimers' as any).props.visible).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ActiveTimersSidebarCard (планшет)', () => {
  it('без таймерів — нічого', () => {
    let tree: any;
    act(() => { tree = create(<ActiveTimersSidebarCard colors={COLORS} />); });
    expect(tree.toJSON()).toBeNull();
  });

  it('N таймерів розгортається списком прямо в картці', () => {
    mockTimers = [T1, T2];
    let tree: any;
    act(() => { tree = create(<ActiveTimersSidebarCard colors={COLORS} />); });
    expect(texts(tree)).toContain('2 таймери');
    expect(stopButtons(tree)).toHaveLength(0);

    const head = tree.root.find((n: any) => n.props.accessibilityLabel === 'Показати всі активні таймери' && n.props.onPress);
    act(() => { head.props.onPress(); });
    const labels = new Set(stopButtons(tree).map((n: any) => n.props.accessibilityLabel));
    expect(labels).toEqual(new Set(['Зупинити таймер: Звіт', 'Зупинити таймер: Читання']));

    expect(texts(tree)).toEqual(expect.arrayContaining(['Трекер часу', 'Зосередження']));
    const focus = tree.root.find((n: any) => n.props.accessibilityLabel === 'Зосередження, Активні таймери: 2' && n.props.onPress);
    act(() => { focus.props.onPress(); });
    expect(tree.root.findByType('FullscreenTimers' as any).props.visible).toBe(true);
  });
});

describe('мітка таймера — проєкт, а не частина доби', () => {
  // T1/T2 навмисно несуть легасі shift ('morning'/'day'): показуватись він не сміє.
  const PROJECTS = JSON.stringify([{ id: 'p1', name: 'Сайт', color: '#F97316' }]);

  it('1 таймер у панелі: назва проєкту поруч із назвою таймера', async () => {
    mockStorage.projects = PROJECTS;
    mockTimers = [{ ...T1, projectId: 'p1' }];
    let tree: any;
    await act(async () => { tree = create(<ActiveTimersBar />); });
    expect(texts(tree)).toContain('Сайт');
    expect(texts(tree)).not.toContain('Ранок');
  });

  it('аркуш: проєктний таймер — проєкт, вільний — «Особисте», частин доби немає', async () => {
    mockStorage.projects = PROJECTS;
    mockTimers = [{ ...T1, projectId: 'p1' }, T2];
    let tree: any;
    await act(async () => { tree = create(<ActiveTimersBar />); });
    const body = tree.root.find((n: any) => n.props.accessibilityLabel === 'Показати всі активні таймери' && n.props.onPress);
    act(() => { body.props.onPress(); });
    expect(texts(tree)).toEqual(expect.arrayContaining(['Сайт', 'Особисте']));
    for (const part of ['Ранок', 'День', 'Вечір', 'Ніч']) expect(texts(tree)).not.toContain(part);
  });

  it('старий таймер задачі без projectId бере проєкт із задачі (картка сайдбара)', async () => {
    mockStorage.projects = PROJECTS;
    mockStorage.tasks = JSON.stringify([{ id: '1', title: 'Звіт', projectId: 'p1' }]);
    mockTimers = [T1];
    let tree: any;
    await act(async () => { tree = create(<ActiveTimersSidebarCard colors={COLORS} />); });
    expect(texts(tree)).toContain('Сайт');
  });
});
