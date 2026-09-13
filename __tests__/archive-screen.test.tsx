/**
 * __tests__/archive-screen.test.tsx — мутації архіву не видаляють зайвого.
 *
 * saveSynced диффить масив: будь-який id, якого в ньому немає, іде на сервер
 * як DELETE. Раніше «Очистити архів» видаляв УСІ виконані задачі (а не лише
 * відфільтровані, показані в діалозі), а всі мутації зберігали знімок стану
 * з моменту фокусу — задачі, що доїхали синхронізацією поки екран відкритий,
 * теж ішли в DELETE.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));

import React from 'react';
import { Alert } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

import ArchiveScreen from '@/app/archive';
import { PriorityFilterChips } from '@/components/tasks/PriorityFilterChips';
import { allTranslations } from '@/store/translations';

const tr = allTranslations.uk;

function task(id: string, extra: Record<string, unknown> = {}) {
  return {
    id, title: id, description: '', status: 'done', subtasks: [],
    createdAt: '2026-01-01T00:00:00.000Z', ...extra,
  };
}

function stored(): { id: string; status: string }[] {
  return JSON.parse(mockStore.get('tasks') ?? '[]');
}

function outboxDeletes(): string[] {
  const outbox = JSON.parse(mockStore.get('sync_outbox') ?? '[]');
  return outbox.filter((o: any) => o.deleted).map((o: any) => o.local_id).sort();
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockStore.clear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
let mounted: any = null;
afterEach(async () => {
  alertSpy.mockRestore();
  if (mounted) { const t = mounted; mounted = null; await act(async () => { t.unmount(); }); }
});

async function mount() {
  let tree: any;
  await act(async () => { tree = create(<ArchiveScreen />); });
  mounted = tree;
  return tree;
}

/** Натискає деструктивну кнопку останнього Alert. */
async function confirmLastAlert() {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as any[];
  const destructive = buttons.find(b => b.style === 'destructive');
  await act(async () => { destructive.onPress(); });
  // Черга мутацій асинхронна — даємо їй доїхати.
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

function pressByLabel(tree: any, label: string) {
  const node = tree.root.find((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  return act(async () => { node.props.onPress(); });
}

test('очищення з фільтром видаляє лише показані задачі', async () => {
  mockStore.set('tasks', JSON.stringify([
    task('p0', { priorityLevel: 0, priority: 'high' }),
    task('p3', { priorityLevel: 3, priority: 'medium' }),
    task('nop'),
    task('active', { status: 'active', priorityLevel: 0, priority: 'high' }),
  ]));
  const tree = await mount();

  const chips = tree.root.findByType(PriorityFilterChips);
  await act(async () => { chips.props.onChange([0]); });

  await pressByLabel(tree, tr.clearArchive);
  const message = alertSpy.mock.calls[0][1] as string;
  expect(message).toContain('1');
  expect(message).toContain('фільтр');

  await confirmLastAlert();
  expect(stored().map(t => t.id).sort()).toEqual(['active', 'nop', 'p3']);
  expect(outboxDeletes()).toEqual(['p0']);
});

test('задачі, що доїхали синхронізацією після фокусу, не видаляються', async () => {
  mockStore.set('tasks', JSON.stringify([task('a'), task('b', { status: 'active' })]));
  const tree = await mount();

  // Поки екран відкритий, синк доклав нові записи (виконану й активну)
  // і повернув «a» в роботу на іншому пристрої.
  mockStore.set('tasks', JSON.stringify([
    task('a', { status: 'active' }), task('b', { status: 'active' }),
    task('synced-done'), task('synced-active', { status: 'active' }),
  ]));

  await pressByLabel(tree, tr.clearArchive);
  await confirmLastAlert();
  // Показано було лише «a», але її вже повернули — нічого не видаляємо.
  expect(stored().map(t => t.id).sort()).toEqual(['a', 'b', 'synced-active', 'synced-done']);
  expect(outboxDeletes()).toEqual([]);
});

test('restore і deleteForever працюють по свіжому стану', async () => {
  mockStore.set('tasks', JSON.stringify([task('x'), task('y')]));
  const tree = await mount();
  mockStore.set('tasks', JSON.stringify([task('x'), task('y'), task('late')]));

  const restoreBtns = tree.root.findAll((n: any) => n.props.accessibilityLabel === tr.restore && typeof n.props.onPress === 'function');
  await act(async () => { restoreBtns[0].props.onPress(); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  expect(stored().map(t => t.id).sort()).toEqual(['late', 'x', 'y']);
  expect(stored().filter(t => t.status === 'active')).toHaveLength(1);

  const deleteBtns = tree.root.findAll((n: any) => n.props.accessibilityLabel === tr.delete && typeof n.props.onPress === 'function');
  await act(async () => { deleteBtns[0].props.onPress(); });
  await confirmLastAlert();
  expect(stored()).toHaveLength(2);
  expect(stored().map(t => t.id)).toContain('late');
  expect(outboxDeletes()).toHaveLength(1);
});
