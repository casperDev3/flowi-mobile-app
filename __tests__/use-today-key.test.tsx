/**
 * __tests__/use-today-key.test.tsx — «сьогодні» для «Найближчих оплат» (пункт 9).
 *
 * Баг: блок «Найближчі оплати» зʼявлявся лише після нагадування. Ключ дня
 * рахувався тільки на `useFocusEffect`, а застосунок, згорнутий увечері й
 * розгорнутий наступного дня, фокусу не отримує — екран з нього не виходив.
 *
 * Тут `useFocusEffect` замоковано так, як він поводиться насправді в цьому
 * сценарії: один раз на монтуванні й більше ніколи. На старій логіці «лише на
 * фокусі» обидва тести нижче червоні: після зміни доби ключ лишається
 * вчорашнім і після `AppState → active`, і після півночі при відкритому екрані.
 */
import React from 'react';
import { AppState } from 'react-native';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  // Фокус — лише на вході на екран; повернення з фону його не дає.
  return { useFocusEffect: (cb: () => void) => useEffect(() => { cb(); }, []) };
});

import { useToday } from '@/hooks/use-today';
import { msUntilNextDay, useTodayKey } from '@/hooks/use-today-key';

const { create, act } = require('react-test-renderer') as any;

type Listener = (state: string) => void;
let appStateListeners: Listener[] = [];

function Probe({ onValue }: { onValue: (v: string) => void }) {
  onValue(useTodayKey());
  return null;
}

function mount() {
  const values: string[] = [];
  let tree: any;
  act(() => { tree = create(<Probe onValue={v => values.push(v)} />); });
  return { values, last: () => values[values.length - 1], unmount: () => act(() => tree.unmount()) };
}

beforeEach(() => {
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: Listener) => {
    appStateListeners.push(cb);
    return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
  }) as any);
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useTodayKey', () => {
  test('повернення з фону після зміни доби дає новий ключ (фокусу при цьому немає)', () => {
    jest.setSystemTime(new Date(2026, 5, 10, 22, 0, 0));
    const probe = mount();
    expect(probe.last()).toBe('2026-06-10');

    // Застосунок згорнули; наступного ранку — розгорнули. Таймер у фоні не
    // спрацював (ОС його заморозила), тож лише системний час пішов уперед.
    jest.setSystemTime(new Date(2026, 5, 11, 8, 30, 0));
    act(() => { appStateListeners.forEach(l => l('active')); });
    expect(probe.last()).toBe('2026-06-11');
    probe.unmount();
  });

  test('повернення з фону в межах тієї самої доби не дає нового значення', () => {
    jest.setSystemTime(new Date(2026, 5, 10, 9, 0, 0));
    const probe = mount();
    const renders = probe.values.length;
    jest.setSystemTime(new Date(2026, 5, 10, 18, 0, 0));
    act(() => { appStateListeners.forEach(l => l('active')); });
    act(() => { appStateListeners.forEach(l => l('background')); });
    expect(probe.values.length).toBe(renders);
    probe.unmount();
  });

  test('північ при відкритому екрані перемикає ключ таймером — двічі поспіль', () => {
    jest.setSystemTime(new Date(2026, 5, 30, 23, 59, 0));
    const probe = mount();
    expect(probe.last()).toBe('2026-06-30');

    act(() => { jest.advanceTimersByTime(61_000); });
    expect(probe.last()).toBe('2026-07-01');

    // Таймер переозброївся сам — наступна північ теж ловиться.
    act(() => { jest.advanceTimersByTime(24 * 60 * 60 * 1000); });
    expect(probe.last()).toBe('2026-07-02');
    probe.unmount();
  });

  test('після розмонтування не лишається ні підписки, ні таймера', () => {
    jest.setSystemTime(new Date(2026, 5, 10, 12, 0, 0));
    const probe = mount();
    probe.unmount();
    expect(appStateListeners).toHaveLength(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('useToday (Date поверх useTodayKey)', () => {
  function DateProbe({ onValue }: { onValue: (v: Date) => void }) {
    onValue(useToday());
    return null;
  }

  test('північ при відкритому екрані дає нову дату (раніше таймера не було)', () => {
    jest.setSystemTime(new Date(2026, 5, 30, 23, 59, 0));
    const values: Date[] = [];
    let tree: any;
    act(() => { tree = create(<DateProbe onValue={v => values.push(v)} />); });
    expect(values[values.length - 1].getDate()).toBe(30);

    act(() => { jest.advanceTimersByTime(61_000); });
    expect(values[values.length - 1].getDate()).toBe(1);
    act(() => tree.unmount());
  });

  test('у межах доби посилання стабільне (мемоізації не скидаються)', () => {
    jest.setSystemTime(new Date(2026, 5, 10, 9, 0, 0));
    const values: Date[] = [];
    let tree: any;
    act(() => { tree = create(<DateProbe onValue={v => values.push(v)} />); });
    const first = values[values.length - 1];
    jest.setSystemTime(new Date(2026, 5, 10, 18, 0, 0));
    act(() => { appStateListeners.forEach(l => l('active')); });
    expect(values[values.length - 1]).toBe(first);
    act(() => tree.unmount());
  });
});

describe('msUntilNextDay', () => {
  test('ціль — 00:00:01 наступної локальної доби', () => {
    expect(msUntilNextDay(new Date(2026, 5, 10, 23, 59, 59, 0))).toBe(2000);
    expect(msUntilNextDay(new Date(2026, 5, 10, 0, 0, 0, 0))).toBe(24 * 3600 * 1000 + 1000);
  });

  test('таймер, що прокинувся за мить до півночі, ставиться на наступну, а не в нуль', () => {
    expect(msUntilNextDay(new Date(2026, 5, 10, 23, 59, 59, 999))).toBe(1001);
  });
});
