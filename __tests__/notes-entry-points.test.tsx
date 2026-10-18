/**
 * Точки входу швидкого запису нотатки: deep link віджетів (NativeIntent),
 * швидка дія іконки, глобальний аркуш і секція «Нотатки» в деталі задачі /
 * зустрічі (нова нотатка — особиста, лише зі звʼязком).
 */
import React from 'react';
import { Alert } from 'react-native';

import { redirectSystemPath } from '@/app/+native-intent';
import { LinkedNotesSection } from '@/components/notes/LinkedNotesSection';
import {
  __resetNoteCaptureForTests,
  finishNoteCapture,
  isNoteCaptureLink,
  pendingNoteCapture,
  requestNoteCapture,
  subscribeNoteCapture,
} from '@/store/note-capture';
import { clearStorageReadFailure } from '@/store/storage';
import type { Note } from '@/utils/notes';

const mockStore = new Map<string, string>();
const mockNavigate = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));
jest.mock('@/components/shared/SheetModal', () => jest.requireActual('./fixtures/sheet-modal-mock'));
jest.mock('@/components/notes/noteActions', () => ({
  ...jest.requireActual('@/components/notes/noteActions'),
  navigateTo: (href: string) => mockNavigate(href),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id, title: `Title ${id}`, body: `Body ${id}`, createdAt: '2026-10-01T10:00:00', updatedAt: '2026-10-01T10:00:00', ...extra,
});
const stored = (): Note[] => JSON.parse(mockStore.get('notes') ?? '[]');

let tree: any;
let alert: jest.SpyInstance;
beforeEach(() => {
  mockStore.clear(); mockNavigate.mockClear(); clearStorageReadFailure('notes'); __resetNoteCaptureForTests();
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null; alert.mockRestore(); jest.useRealTimers();
});
const find = (id: string) => tree.root.findAll((n: any) => n.props.testID === id)[0];
async function press(id: string) { await act(async () => { await find(id).props.onPress(); }); }
async function settle(ms = 0) { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); }

describe('isNoteCaptureLink', () => {
  test.each([
    ['ftrackingapp:///notes?capture=1', true],
    ['ftrackingapp:///notes?create=1', true],
    ['ftrackingapp://notes?capture=1', true],
    ['/notes?capture=1', true],
    ['notes?create=1&x=2', true],
    ['ftrackingapp:///notes', false],
    ['ftrackingapp:///notes?open=abc', false],
    ['ftrackingapp:///notes?capture=1&open=abc', false],
    ['ftrackingapp:///notes?capture=0', false],
    ['ftrackingapp:///?create=1', false],
    ['ftrackingapp:///project/p1/notes?capture=1', false],
    ['ftrackingapp://invite?ws=a&t=b', false],
    ['', false],
  ])('%s → %s', (path, expected) => {
    expect(isNoteCaptureLink(path)).toBe(expected);
  });
});

describe('redirectSystemPath (віджети)', () => {
  test('застосунок відкритий: без навігації, лише запит аркуша', () => {
    expect(redirectSystemPath({ path: 'ftrackingapp:///notes?capture=1', initial: false })).toBe('');
    expect(pendingNoteCapture()).toMatchObject({ seq: 1 });
  });

  test('холодний старт: головний екран, аркуш поверх нього', () => {
    expect(redirectSystemPath({ path: 'ftrackingapp:///notes?create=1', initial: true })).toBe('/');
    expect(pendingNoteCapture()).not.toBeNull();
  });

  test('інші посилання проходять без змін', () => {
    expect(redirectSystemPath({ path: 'ftrackingapp:///calendar?create=meeting', initial: false })).toBe('ftrackingapp:///calendar?create=meeting');
    expect(redirectSystemPath({ path: 'ftrackingapp:///notes?open=n1', initial: true })).toBe('ftrackingapp:///notes?open=n1');
    expect(pendingNoteCapture()).toBeNull();
  });
});

describe('store/note-capture', () => {
  test('пізнє закриття старого запиту не прибирає новіший', () => {
    const seen: (number | null)[] = [];
    const off = subscribeNoteCapture(r => seen.push(r?.seq ?? null));
    const first = requestNoteCapture();
    const second = requestNoteCapture({ taskId: 't1' });
    finishNoteCapture(first.seq);
    expect(pendingNoteCapture()).toMatchObject({ seq: second.seq, links: { taskId: 't1' } });
    finishNoteCapture(second.seq);
    expect(pendingNoteCapture()).toBeNull();
    off();
    expect(seen).toEqual([1, 2, null]);
  });
});

describe('LinkedNotesSection', () => {
  test('показує лише нотатки, привʼязані до цієї задачі, найсвіжіші першими', async () => {
    mockStore.set('notes', JSON.stringify([
      note('old', { linkedTaskId: 't1', updatedAt: '2026-10-01T09:00:00' }),
      note('new', { linkedTaskId: 't1', updatedAt: '2026-10-02T09:00:00', projectId: 'p1' }),
      note('other', { linkedTaskId: 't2' }),
      note('meeting', { linkedMeetingId: 't1' }),
    ]));
    await act(async () => { tree = create(<LinkedNotesSection target={{ taskId: 't1' }} isDark={false} />); });
    await settle();
    const ids = tree.root.findAll((n: any) => typeof n.props.testID === 'string' && n.props.testID.startsWith('linked-note-')
      && n.props.accessibilityRole === 'button').map((n: any) => n.props.testID);
    // findAll бачить і композитний, і хост-вузол одного рядка — лишаємо порядок без повторів.
    expect([...new Set(ids)]).toEqual(['linked-note-new', 'linked-note-old']);
  });

  test('тап по нотатці закриває модал деталі й веде в редактор', async () => {
    jest.useFakeTimers();
    mockStore.set('notes', JSON.stringify([note('n1', { linkedMeetingId: 'm1' })]));
    const beforeOpen = jest.fn();
    await act(async () => { tree = create(<LinkedNotesSection target={{ meetingId: 'm1' }} isDark beforeOpen={beforeOpen} />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { find('linked-note-n1').props.onPress(); });
    expect(beforeOpen).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(mockNavigate).toHaveBeenCalledWith('/notes?open=n1');
  });

  test('«+ Нотатка» з проєктної задачі створює ОСОБИСТУ нотатку з linkedTaskId', async () => {
    await act(async () => { tree = create(<LinkedNotesSection target={{ taskId: 'pt1' }} isDark={false} />); });
    await settle();
    expect(find('notes-capture-sheet')).toBeUndefined();
    await press('linked-notes-add');
    expect(find('notes-capture-sheet')).toBeDefined();
    await act(async () => find('notes-capture-input').props.onChangeText('Підсумок\n- [ ] Надіслати звіт'));
    await press('sheet-dismiss');
    await settle(10);
    const saved = stored();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: 'Підсумок', linkedTaskId: 'pt1' });
    expect(saved[0].projectId).toBeUndefined();
    expect(find('linked-note-' + saved[0].id)).toBeDefined();
  });

  test('onAdd замінює вкладений аркуш (форма зустрічі)', async () => {
    const onAdd = jest.fn();
    await act(async () => { tree = create(<LinkedNotesSection target={{ meetingId: 'm1' }} isDark={false} onAdd={onAdd} />); });
    await settle();
    await press('linked-notes-add');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(find('notes-capture-sheet')).toBeUndefined();
  });
});

// Останнім: тут скидаються модулі (jest.resetModules), а React-дерево вище — ні.
describe('store/quick-actions', () => {
  afterEach(() => { jest.resetModules(); });

  test('без нативного пакета — тихий no-op', async () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const qa = require('@/store/quick-actions');
      qa.__resetQuickActionsForTests();
      expect(() => qa.subscribeQuickActions()()).not.toThrow();
      return expect(qa.setNoteQuickAction('Нова нотатка')).resolves.toBeUndefined();
    });
  });

  test('з пакетом: дія ставиться мовою застосунку, натискання і холодний старт відкривають аркуш', async () => {
    let listener: ((a: { id: string }) => void) | null = null;
    const setItems = jest.fn(async () => {});
    jest.doMock('expo-quick-actions', () => ({
      initial: { id: 'flowi.note.capture', title: 'x' },
      setItems,
      addListener: (fn: (a: { id: string }) => void) => { listener = fn; return { remove: () => { listener = null; } }; },
    }), { virtual: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const capture = require('@/store/note-capture');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const qa = require('@/store/quick-actions');
    capture.__resetNoteCaptureForTests();
    qa.__resetQuickActionsForTests();

    await qa.setNoteQuickAction('Нова нотатка');
    expect(setItems).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'flowi.note.capture', title: 'Нова нотатка' })]);
    await qa.setNoteQuickAction(null);
    expect(setItems).toHaveBeenLastCalledWith([]);

    const off = qa.subscribeQuickActions();
    expect(capture.pendingNoteCapture()).toMatchObject({ seq: 1 }); // initial
    capture.finishNoteCapture();
    listener!({ id: 'something-else' });
    expect(capture.pendingNoteCapture()).toBeNull();
    listener!({ id: 'flowi.note.capture' });
    expect(capture.pendingNoteCapture()).toMatchObject({ seq: 2 });
    off();
    expect(listener).toBeNull();
    // Initial обробляється один раз за процес.
    capture.finishNoteCapture();
    qa.subscribeQuickActions()();
    expect(capture.pendingNoteCapture()).toBeNull();
  });
});
