/**
 * store/live-activity.ts — перф і коректність (ревʼю 2026-10-18, H2 + L):
 *   • запис задач/нарад без таймера, якому треба шукати проєкт, не перечитує
 *     сховище й не перемальовує хост;
 *   • «Стоп», натиснутий у фоні, не воскрешає Live Activity при поверненні;
 *   • корінь застосунку не тримає хуків поверхонь (вони в <DeviceSurfaces/>).
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
const mockTimers: { activeTimers: Record<string, unknown>[]; timersReady: boolean } = {
  activeTimers: [{ id: 'task:t1', taskId: 't1', label: 'X', startedAt: '2026-10-18T09:00:00.000Z', projectId: 'p1' }],
  timersReady: true,
};
jest.mock('@/store/timer-context', () => ({ useTimerContext: () => mockTimers }));
jest.mock('@/store/i18n', () => ({ useI18n: () => ({ lang: 'uk' }) }));

import fs from 'fs';
import path from 'path';
import React from 'react';
import { AppState, Platform } from 'react-native';
import { act, create } from 'react-test-renderer';

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Bridge from '@/modules/flowi-ios-bridge';
import { projectLookupKey, useTimerLiveActivity } from '@/store/live-activity';
import { saveData } from '@/store/storage';

let renders = 0;
function Probe() { renders++; useTimerLiveActivity(); return null; }

const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

afterEach(() => {
  Bridge.__setIosBridgeForTests(undefined);
  jest.restoreAllMocks();
});

it('projectLookupKey — лише таймери без projectId', () => {
  expect(projectLookupKey([
    { id: 'a', label: '', startedAt: '', projectId: 'p' , taskId: 't0' },
    { id: 'b', label: '', startedAt: '', taskId: 't2' },
    { id: 'c', label: '', startedAt: '', meetingId: 'm1' },
  ])).toBe('t2|,|m1');
});

it('записи задач не перемальовують хост; «Стоп» з фону не воскрешає активність', async () => {
  expect(Platform.OS).toBe('ios');
  let queue = '[]';
  const syncs: unknown[] = [];
  let appListener: (s: string) => void = () => undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
    appListener = cb;
    return { remove() {} };
  }) as never);
  Bridge.__setIosBridgeForTests({
    liveActivitiesEnabled: () => true,
    liveActivitySync: (s: unknown) => syncs.push(s),
    readPendingActions: () => queue,
    getWatchState: () => ({}),
    addListener: () => ({ remove() {} }),
  });
  await act(async () => { create(<Probe />); });
  await flush();
  expect(syncs).toEqual([expect.objectContaining({ timerId: 'task:t1' })]);

  const base = renders;
  const getItem = AsyncStorage.getItem as jest.Mock;
  getItem.mockClear();
  for (let i = 0; i < 5; i++) {
    await act(async () => { await saveData('tasks', [{ id: 't' + i }]); });
    await flush();
  }
  expect(renders - base).toBe(0);
  expect(getItem.mock.calls.map(c => c[0])).not.toContain('tasks');

  await act(async () => { appListener('background'); });
  queue = JSON.stringify([{ id: 'a', type: 'timer_stop', userId: '7', payload: { timerId: 'task:t1' } }]);
  syncs.length = 0;
  await act(async () => { appListener('active'); });
  expect(syncs).toEqual([null]);
});

it('app/_layout.tsx монтує поверхні через <DeviceSurfaces/>, а не хуками в корені', () => {
  const root = path.join(__dirname, '..');
  const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
  expect(layout).toContain('<DeviceSurfaces />');
  for (const hook of ['useTimerLiveActivity', 'useWatchLink', 'useAndroidSurfaces', 'useDeviceActionDrain', 'useWidgetSnapshotWriter']) {
    expect(layout).not.toContain(`${hook}(`);
  }
});
