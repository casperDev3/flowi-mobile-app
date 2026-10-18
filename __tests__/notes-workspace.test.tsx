/**
 * Екран нотаток: автозбереження, синк і права (одна колекція `notes` на
 * обидва маршрути; запис іде різницею, а не заміною колекції).
 */
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
jest.mock('@/components/shared/SheetModal', () => jest.requireActual('./fixtures/sheet-modal-mock'));
jest.mock('@/hooks/use-tab-bar-inset', () => ({ useTabBarInset: () => 0 }));
jest.mock('@/hooks/use-responsive', () => ({ useResponsive: () => ({ isExpanded: mockExpanded, isWide: mockExpanded, width: mockExpanded ? 1200 : 390, height: 800 }) }));
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
async function blur(id: string) { await act(async () => { find(id).props.onBlur(); await new Promise(r => setTimeout(r, 0)); }); }
async function settle(ms = 0) { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); }
const stored = (): Note[] => JSON.parse(mockStore.get('notes') ?? '[]');
const outbox = (): any[] => JSON.parse(mockStore.get('sync_outbox') ?? '[]');

test('project editing preserves personal notes and notes that arrived while editing', async () => {
  mockStore.set('notes', JSON.stringify([note('mine', 'p1'), note('personal'), note('other', 'p2')]));
  await mount('p1');
  expect(find('note-personal')).toBeUndefined();
  await press('note-mine');
  await input('notes-title', 'Updated title');
  const remote = note('mine', 'p1'); remote.body = 'Remote body';
  mockStore.set('notes', JSON.stringify([remote, note('personal'), note('other', 'p2'), note('arrived')]));
  await blur('notes-title'); await settle();
  expect(stored().map(n => n.id).sort()).toEqual(['arrived', 'mine', 'other', 'personal']);
  expect(stored().find(n => n.id === 'mine')).toMatchObject({ title: 'Updated title', body: 'Remote body' });
  expect(outbox().some((o: any) => o.deleted)).toBe(false);
});

test('autosave fires ~600 ms after the last keystroke without any Save button', async () => {
  mockStore.set('notes', JSON.stringify([note('a')]));
  await mount(); await press('note-a');
  expect(find('notes-save')).toBeUndefined();
  expect(find('notes-edit')).toBeUndefined();
  await input('notes-title', 'Typed');
  await settle(100);
  expect(stored()[0].title).toBe('Title a');
  await settle(700);
  expect(stored()[0].title).toBe('Typed');
  expect(outbox()).toHaveLength(1);
});

test('viewer has no mutations from aggregate screen, including closing a note', async () => {
  mockRoles = { p1: 'viewer' };
  const before = JSON.stringify([note('mine', 'p1')]); mockStore.set('notes', before);
  await mount(); await press('note-mine');
  expect(find('notes-reader')).toBeDefined(); expect(find('notes-title')).toBeUndefined();
  expect(find('notes-read-title').props.children).toBe('Title mine');
  expect(find('notes-pin')).toBeUndefined(); expect(find('notes-more')).toBeUndefined();
  expect(find('notes-to-task')).toBeUndefined(); expect(find('note-line-0')).toBeUndefined();
  await press('notes-close'); await settle();
  expect(mockStore.get('notes')).toBe(before); expect(mockStore.get('sync_outbox')).toBeUndefined();
});

test('failed disk write keeps the draft and shows retry; retry saves exactly one note', async () => {
  await mount(); await press('notes-add'); await input('notes-body', '  Keep indentation\nSecond line  ');
  mockFailWrite = true; await blur('notes-body'); await settle();
  expect(find('notes-save-retry')).toBeDefined();
  expect(stored()).toEqual([]); expect(mockStore.get('sync_outbox')).toBeUndefined();
  mockFailWrite = false; await press('notes-save-retry'); await settle();
  expect(stored()).toHaveLength(1); expect(stored()[0].body).toBe('  Keep indentation\nSecond line  ');
  expect(find('notes-save-retry')).toBeUndefined();
});

test('draft survives compact to expanded transition and closing autosaves instead of asking', async () => {
  mockExpanded = false; await mount(); await press('notes-add'); await input('notes-body', 'Draft across rotation');
  expect(find('notes-list')).toBeUndefined();
  mockExpanded = true; await act(async () => tree.update(<NotesWorkspace isDark={false} />));
  expect(find('notes-list')).toBeDefined(); expect(find('notes-body').props.value).toBe('Draft across rotation');
  await press('notes-close'); await settle();
  expect(alert).not.toHaveBeenCalled();
  expect(find('notes-editor')).toBeUndefined();
  expect(stored()).toHaveLength(1); expect(stored()[0].body).toBe('Draft across rotation');
});

test('an empty new note is discarded on close, nothing is written', async () => {
  await mount(); await press('notes-add');
  await press('notes-close'); await settle();
  expect(mockStore.get('notes')).toBeUndefined();
  expect(mockStore.get('sync_outbox')).toBeUndefined();
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
  mockStore.set('notes', JSON.stringify([note('a')])); await mount(); await press('note-a');
  await press('note-line-0'); await input('notes-body', 'local draft');
  mockStore.set('notes', JSON.stringify([note('a'), note('b')]));
  await act(async () => notifyStorageChanged('notes'));
  expect(find('note-b')).toBeDefined(); expect(find('notes-body').props.value).toBe('local draft');
});

test('an untouched open note adopts a synced update', async () => {
  mockStore.set('notes', JSON.stringify([note('a')])); await mount(); await press('note-a');
  const remote = { ...note('a'), title: 'From web', updatedAt: '2026-09-21T10:00:00Z' };
  mockStore.set('notes', JSON.stringify([remote]));
  await act(async () => notifyStorageChanged('notes'));
  expect(find('notes-title').props.value).toBe('From web');
});

test('outbox failure keeps the editor and retry queues the already saved note once', async () => {
  await mount(); await press('notes-add'); await input('notes-body', 'Queue retry');
  mockFailOutbox = true; await blur('notes-body'); await settle();
  expect(stored()).toHaveLength(1); expect(find('notes-editor')).toBeDefined();
  expect(find('notes-save-retry')).toBeDefined();
  mockFailOutbox = false; await press('notes-save-retry'); await settle();
  expect(stored()).toHaveLength(1);
  expect(outbox()).toHaveLength(1); expect(outbox()[0].deleted).toBe(false);
});

test('delete from the «more» sheet queues one tombstone', async () => {
  mockStore.set('notes', JSON.stringify([note('a')])); await mount(); await press('note-a');
  await press('notes-more'); await press('notes-more-delete'); await settle();
  const last = alert.mock.calls[alert.mock.calls.length - 1];
  expect(last[0]).toBe(tr.delete);
  await act(async () => { await last[2].find((b: any) => b.style === 'destructive').onPress(); });
  await settle();
  expect(stored()).toEqual([]);
  expect(find('notes-editor')).toBeUndefined();
  expect(outbox()).toHaveLength(1); expect(outbox()[0]).toMatchObject({ local_id: 'a', deleted: true });
});

test('archive hides the note from the default list; the «Архів» filter shows it; restore brings it back', async () => {
  mockStore.set('notes', JSON.stringify([note('a'), note('b')])); await mount(); await press('note-a');
  await press('notes-more'); await press('notes-more-archive'); await settle();
  expect(stored().find(n => n.id === 'a')).toMatchObject({ archived: true });
  expect(typeof stored().find(n => n.id === 'a')?.archivedAt).toBe('string');
  await press('notes-close');
  expect(find('note-a')).toBeUndefined(); expect(find('note-b')).toBeDefined();
  await press('notes-archive-filter');
  expect(find('note-a')).toBeDefined(); expect(find('note-b')).toBeUndefined();
  await press('note-a');
  await press('notes-more'); await press('notes-more-archive'); await settle();
  expect(stored().find(n => n.id === 'a')?.archived).toBeUndefined();
});

test('move: personal note goes to a project with the same id', async () => {
  mockStore.set('projects', JSON.stringify([{ id: 'p1', name: 'Сайт', color: '#0EA5E9' }]));
  mockStore.set('notes', JSON.stringify([note('a')])); await mount(); await press('note-a');
  await press('notes-more'); await press('notes-more-move');
  expect(find('notes-move-personal').props.disabled).toBe(true);
  await press('notes-move-p1'); await settle();
  expect(stored()).toHaveLength(1);
  expect(stored()[0]).toMatchObject({ id: 'a', projectId: 'p1', title: 'Title a' });
  expect(find('notes-project-badge')).toBeDefined();
});

test('List / Grid toggle is remembered on the device', async () => {
  mockStore.set('notes', JSON.stringify([note('a')])); await mount();
  expect(find('notes-rows')).toBeDefined(); expect(find('notes-grid')).toBeUndefined();
  await press('notes-view-grid');
  expect(find('notes-grid')).toBeDefined();
  expect(JSON.parse(mockStore.get('notes_view_mode_v1') ?? 'null')).toBe('grid');
  await act(async () => tree.unmount()); tree = null;
  await mount();
  expect(find('notes-grid')).toBeDefined(); expect(find('note-a')).toBeDefined();
});

test('createRequested (/notes?create=1 з віджета) відкриває редактор нової нотатки один раз', async () => {
  mockStore.set('notes', JSON.stringify([note('old')]));
  const handled = jest.fn();
  await act(async () => { tree = create(<NotesWorkspace isDark={false} createRequested onCreateHandled={handled} />); });
  expect(find('notes-title')).toBeDefined();
  expect(find('notes-title').props.value).toBe('');
  expect(find('notes-title').props.autoFocus).toBe(true);
  expect(handled).toHaveBeenCalledTimes(1);
  await act(async () => { tree.update(<NotesWorkspace isDark={false} createRequested onCreateHandled={() => handled()} />); });
  expect(handled).toHaveBeenCalledTimes(1);
});

test('openRequested (/notes?open=<id>) opens that note once it is read', async () => {
  mockStore.set('notes', JSON.stringify([note('x'), note('y')]));
  const handled = jest.fn();
  await act(async () => { tree = create(<NotesWorkspace isDark={false} openRequested="y" onOpenHandled={handled} />); });
  expect(find('notes-title').props.value).toBe('Title y');
  expect(handled).toHaveBeenCalledTimes(1);
});
