/**
 * __tests__/timer-dial-prefs-hook.test.tsx — useTimerDials над справжнім
 * storage/synced-storage (мок лише AsyncStorage).
 *
 * Головне тут — безпека даних міграції: старий локальний 'timer_dials'
 * читається як запасне джерело, але НІКОЛИ не видаляється й не переписується;
 * новий вибір іде в синхронізований singleton 'timer_dial_prefs' і в outbox.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));

import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TIMER_DIALS_KEY, useTimerDials, type TimerDialsState } from '@/hooks/use-timer-dial';
import { saveData } from '@/store/storage';
import type { OutboxItem } from '@/store/synced-storage';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}
function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

let api!: TimerDialsState;
function Probe({ live }: { live: readonly string[] | null }) {
  api = useTimerDials(live);
  return null;
}

async function mount(live: readonly string[] | null = []): Promise<void> {
  await act(async () => { create(<Probe live={live} />); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  }
}

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe('useTimerDials — синхронізований вибір циферблата', () => {
  it('старий локальний вибір показується, доки немає синхронізованого', async () => {
    seed(TIMER_DIALS_KEY, { 'task:1': 'rings' });
    await mount();
    expect(api.dialFor('task:1')).toBe('rings');
    expect(api.dialFor('task:2')).toBe('digits');
  });

  it('вибір пишеться в timer_dial_prefs + outbox, а timer_dials лишається недоторканим', async () => {
    seed(TIMER_DIALS_KEY, { 'task:1': 'rings', 'adhoc:old': 'orbit' });
    const localBefore = mockStore.get(TIMER_DIALS_KEY);
    await mount(['task:2']);

    await act(async () => { api.setDialFor('task:2', 'arc'); });
    await flush();

    expect(api.dialFor('task:2')).toBe('arc');
    const prefs = read<any>('timer_dial_prefs', null);
    expect(prefs).toMatchObject({ version: 1, defaultDial: 'digits', timers: { 'task:2': 'arc' } });
    expect(typeof prefs.updatedAt).toBe('string');

    // Локальний ключ — байт у байт той самий і ніколи не видалявся.
    expect(mockStore.get(TIMER_DIALS_KEY)).toBe(localBefore);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect((AsyncStorage.setItem as jest.Mock).mock.calls.map(c => c[0])).not.toContain(TIMER_DIALS_KEY);

    const outbox = read<OutboxItem[]>('sync_outbox', []);
    expect(outbox.some(i => i.collection === 'timer_dial_prefs' && i.local_id === 'timer_dial_prefs' && !i.deleted)).toBe(true);
    expect(outbox.some(i => i.deleted)).toBe(false);
  });

  it('типовий циферблат застосовується до таймерів без вибору і не чіпає персональних', async () => {
    seed('timer_dial_prefs', { version: 1, defaultDial: 'digits', timers: { 'task:1': 'tape' } });
    await mount([]);

    await act(async () => { api.setDefaultDial('chrono'); });
    await flush();

    expect(api.defaultDial).toBe('chrono');
    expect(api.dialFor('task:9')).toBe('chrono');
    expect(api.dialFor('task:1')).toBe('tape');
    expect(read<any>('timer_dial_prefs', null)).toMatchObject({ defaultDial: 'chrono', timers: { 'task:1': 'tape' } });
  });

  it('запис іде від СВІЖОГО сховища: чужа правка, що прийшла між читанням і записом, не губиться', async () => {
    seed('timer_dial_prefs', { version: 1, defaultDial: 'digits', timers: {} });
    await mount(null);
    // «Pull» записав вибір іншого пристрою повз стан хука.
    seed('timer_dial_prefs', { version: 1, defaultDial: 'digits', timers: { 'meeting:m': 'orbit' }, fromOtherClient: true });

    await act(async () => { api.setDialFor('task:1', 'rings'); });
    await flush();

    expect(read<any>('timer_dial_prefs', null)).toMatchObject({
      timers: { 'meeting:m': 'orbit', 'task:1': 'rings' },
      fromOtherClient: true,
    });
  });

  it('до прочитання реєстру (liveIds = null) вибір вільних таймерів не чиститься', async () => {
    seed('timer_dial_prefs', { version: 1, defaultDial: 'digits', timers: { 'adhoc:a': 'tape' } });
    await mount(null);
    await act(async () => { api.setDialFor('task:1', 'arc'); });
    await flush();
    expect(read<any>('timer_dial_prefs', null).timers).toEqual({ 'adhoc:a': 'tape', 'task:1': 'arc' });
  });

  it('pull із сервера (запис у сховище) оновлює показ', async () => {
    await mount([]);
    await act(async () => {
      await saveData('timer_dial_prefs', { version: 1, defaultDial: 'flip', timers: { 'task:5': 'dots' } });
    });
    await flush();
    expect(api.dialFor('task:5')).toBe('dots');
    expect(api.dialFor('task:6')).toBe('flip');
  });

  it('перший запис дописує старий локальний вибір у синк (лише відсутні ключі), timer_dials — байт у байт', async () => {
    seed(TIMER_DIALS_KEY, { 'task:1': 'rings', 'meeting:m': 'orbit', 'task:3': 'dots', 'adhoc:dead': 'flip', 'adhoc:live': 'tape' });
    seed('timer_dial_prefs', { version: 1, defaultDial: 'digits', timers: { 'task:3': 'arc' } });
    const localBefore = mockStore.get(TIMER_DIALS_KEY);
    await mount(['adhoc:live']);

    await act(async () => { api.setDialFor('task:2', 'chrono'); });
    await flush();

    expect(read<any>('timer_dial_prefs', null).timers).toEqual({
      'task:1': 'rings',
      'meeting:m': 'orbit',
      'task:3': 'arc',        // синхронізований виграє, локальний не переписує
      'adhoc:live': 'tape',
      'task:2': 'chrono',
    });
    expect(mockStore.get(TIMER_DIALS_KEY)).toBe(localBefore);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    expect((AsyncStorage.setItem as jest.Mock).mock.calls.map(c => c[0])).not.toContain(TIMER_DIALS_KEY);
  });

  it('без дії користувача нічого не переноситься і нічого не пишеться', async () => {
    seed(TIMER_DIALS_KEY, { 'task:1': 'rings' });
    await mount([]);
    await flush();
    expect(mockStore.has('timer_dial_prefs')).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('невідомий циферблат від новішого клієнта переживає запис через хук', async () => {
    seed('timer_dial_prefs', { version: 1, defaultDial: 'pulse', timers: { 'task:1': 'pulse', 'task:2': 'arc' } });
    await mount([]);
    expect(api.defaultDial).toBe('digits');
    expect(api.dialFor('task:1')).toBe('digits');

    await act(async () => { api.setDialFor('task:3', 'rings'); });
    await flush();
    expect(read<any>('timer_dial_prefs', null)).toMatchObject({
      defaultDial: 'pulse',
      timers: { 'task:1': 'pulse', 'task:2': 'arc', 'task:3': 'rings' },
    });

    await act(async () => { api.setDefaultDial('flip'); });
    await flush();
    expect(read<any>('timer_dial_prefs', null)).toMatchObject({
      defaultDial: 'flip',
      timers: { 'task:1': 'pulse', 'task:2': 'arc', 'task:3': 'rings' },
    });
    expect(api.dialFor('task:1')).toBe('flip');
  });
});
