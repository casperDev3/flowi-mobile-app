import React from 'react';
import { Alert } from 'react-native';
import { NotesWorkspace, type Note } from '@/components/notes/NotesWorkspace';
import { clearStorageReadFailure, notifyStorageChanged } from '@/store/storage';
import { allTranslations } from '@/store/translations';
const mockStore = new Map<string, string>();
let mockFailWrite = false;
let mockFailOutbox = false;
let mockExpanded = true;
let mockRoles: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    if (mockFailWrite && key === 'notes') throw new Error('disk full');
    if (mockFailOutbox && key === 'sync_outbox') throw new Error('outbox disk full');
    mockStore.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: jest.fn() }));
jest.mock('@/hooks/use-tab-bar-inset', () => ({ useTabBarInset: () => 0 }));
jest.mock('@/hooks/use-responsive', () => ({ useResponsive: () => ({ isExpanded: mockExpanded }) }));
jest.mock('@/hooks/use-project-roles', () => ({
  useProjectRoles: () => mockRoles,
  canEditProjectItem: (id: string, roles: Record<string, string>) => !id || roles[id] !== 'viewer',
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');
const tr = allTranslations.uk;
const note = (id: string, projectId?: string): Note => ({ id, title: `Title ${id}`, body: `Body ${id}`, createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z', ...(projectId ? { projectId } : {}) });
let tree: any;
let alert: jest.SpyInstance;
beforeEach(() => { mockStore.clear(); mockFailWrite = false; mockFailOutbox = false; mockExpanded = true; mockRoles = {}; clearStorageReadFailure('notes'); alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; alert.mockRestore(); });
async function mount(projectId?: string) { await act(async () => { tree = create(<NotesWorkspace projectId={projectId} isDark={false} />); }); }
const find = (id: string) => tree.root.findAll((n: any) => n.props.testID === id)[0];
async function press(id: string) { await act(async () => { await find(id).props.onPress(); }); }
async function input(id: string, text: string) { await act(async () => find(id).props.onChangeText(text)); }
const stored = (): Note[] => JSON.parse(mockStore.get('notes') ?? '[]');

test('project editing preserves personal notes and notes that arrived while editing', async () => {
  mockStore.set('notes', JSON.stringify([note('mine', 'p1'), note('personal'), note('other', 'p2')]));
  await mount('p1');
  expect(find('note-personal')).toBeUndefined();
  await press('note-mine');
  await input('notes-title', 'Updated title');
  const remote = note('mine', 'p1'); remote.body = 'Remote body';
  mockStore.set('notes', JSON.stringify([remote, note('personal'), note('other', 'p2'), note('arrived')]));
  await press('notes-save');
  expect(stored().map(n => n.id).sort()).toEqual(['arrived', 'mine', 'other', 'personal']);
  expect(stored().find(n => n.id === 'mine')).toMatchObject({ title: 'Updated title', body: 'Remote body' });
  const outbox = JSON.parse(mockStore.get('sync_outbox') ?? '[]');
  expect(outbox.some((o: any) => o.deleted)).toBe(false);
});

test('viewer has no mutations from aggregate screen, including closing a note', async () => {
  mockRoles = { p1: 'viewer' };
  const before = JSON.stringify([note('mine', 'p1')]); mockStore.set('notes', before);
  await mount(); await press('note-mine');
  expect(find('notes-title').props.editable).toBe(false);
  expect(find('notes-save')).toBeUndefined(); expect(find('notes-delete')).toBeUndefined();
  await press('notes-close');
  expect(mockStore.get('notes')).toBe(before); expect(mockStore.get('sync_outbox')).toBeUndefined();
});

test('failed disk write retains editor and draft, retry saves exactly one note', async () => {
  await mount(); await press('notes-add'); await input('notes-body', '  Keep indentation\nSecond line  ');
  mockFailWrite = true; await press('notes-save');
  expect(find('notes-body').props.value).toBe('  Keep indentation\nSecond line  ');
  expect(alert).toHaveBeenCalledWith(tr.error, tr.notesSaveError);
  expect(stored()).toEqual([]); expect(mockStore.get('sync_outbox')).toBeUndefined();
  mockFailWrite = false; await press('notes-save');
  expect(stored()).toHaveLength(1); expect(stored()[0].body).toBe('  Keep indentation\nSecond line  ');
});

test('draft survives compact to expanded transition and close asks before discarding', async () => {
  mockExpanded = false; await mount(); await press('notes-add'); await input('notes-body', 'Draft across rotation');
  expect(find('notes-list')).toBeUndefined();
  mockExpanded = true; await act(async () => tree.update(<NotesWorkspace isDark={false} />));
  expect(find('notes-list')).toBeDefined(); expect(find('notes-body').props.value).toBe('Draft across rotation');
  await press('notes-close'); expect(find('notes-body')).toBeDefined();
  expect(alert.mock.calls[alert.mock.calls.length - 1]?.[0]).toBe(tr.notesUnsavedTitle);
});

test('personal filter and body search narrow the aggregate without changing storage', async () => {
  mockStore.set('notes', JSON.stringify([note('personal'), note('project', 'p1')]));
  await mount(); await press('notes-scope-personal');
  expect(find('note-project')).toBeUndefined(); expect(find('note-personal')).toBeDefined();
  await input('notes-search', 'missing'); expect(find('note-personal')).toBeUndefined();
  expect(stored()).toHaveLength(2);
});

test('corrupt storage shows recovery instead of allowing replacement with an empty collection', async () => {
  mockStore.set('notes', '{broken'); await mount();
  expect(find('notes-add').props.disabled).toBe(true); expect(find('notes-retry')).toBeDefined();
  expect(mockStore.get('notes')).toBe('{broken');
  mockStore.set('notes', JSON.stringify([note('restored')])); await press('notes-retry');
  expect(find('note-restored')).toBeDefined(); expect(find('notes-add').props.disabled).toBe(false);
});

test('external storage updates refresh the list without replacing an active draft', async () => {
  mockStore.set('notes', JSON.stringify([note('a')])); await mount(); await press('note-a'); await input('notes-body', 'local draft');
  mockStore.set('notes', JSON.stringify([note('a'), note('b')]));
  await act(async () => notifyStorageChanged('notes'));
  expect(find('note-b')).toBeDefined(); expect(find('notes-body').props.value).toBe('local draft');
});

test('outbox failure keeps editor open and retry queues the already saved note', async () => {
  await mount(); await press('notes-add'); await input('notes-body', 'Queue retry');
  mockFailOutbox = true; await press('notes-save');
  expect(stored()).toHaveLength(1); expect(find('notes-body')).toBeDefined();
  expect(alert).toHaveBeenCalledWith(tr.error, tr.notesSaveError);
  mockFailOutbox = false; await press('notes-save');
  expect(stored()).toHaveLength(1); expect(find('notes-body')).toBeUndefined();
  const outbox = JSON.parse(mockStore.get('sync_outbox') ?? '[]');
  expect(outbox).toHaveLength(1); expect(outbox[0].deleted).toBe(false);
});

test('delete retry queues tombstone when local deletion succeeded before outbox failure', async () => {
  mockStore.set('notes', JSON.stringify([note('a')])); await mount(); await press('note-a');
  mockFailOutbox = true; await press('notes-delete');
  await act(async () => { await alert.mock.calls[alert.mock.calls.length - 1][2].find((b: any) => b.style === 'destructive').onPress(); });
  expect(stored()).toEqual([]); expect(find('notes-body')).toBeDefined();
  mockFailOutbox = false; await press('notes-delete');
  await act(async () => { await alert.mock.calls[alert.mock.calls.length - 1][2].find((b: any) => b.style === 'destructive').onPress(); });
  const outbox = JSON.parse(mockStore.get('sync_outbox') ?? '[]');
  expect(outbox).toHaveLength(1); expect(outbox[0]).toMatchObject({ local_id: 'a', deleted: true });
});
