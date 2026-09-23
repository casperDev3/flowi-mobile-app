/**
 * Екран нотаток після доробки: стара нотатка його НЕ гасить, а чек-листи,
 * теги, закріплення й «задача з рядка» працюють на живому списку.
 *
 * Окремий файл від `notes-workspace.test.tsx` навмисно: там перевіряється
 * збереження й синхронізація, тут — читання й формат.
 */
import React from 'react';
import { Alert } from 'react-native';
import { NotesWorkspace, type Note } from '@/components/notes/NotesWorkspace';
import { clearStorageReadFailure } from '@/store/storage';

const mockStore = new Map<string, string>();
let mockExpanded = true;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ dispatch: jest.fn() }), usePreventRemove: jest.fn() }));
jest.mock('@/hooks/use-tab-bar-inset', () => ({ useTabBarInset: () => 0 }));
jest.mock('@/hooks/use-responsive', () => ({ useResponsive: () => ({ isExpanded: mockExpanded, isWide: mockExpanded, height: 800 }) }));
jest.mock('@/hooks/use-project-roles', () => ({
  useProjectRoles: () => ({}),
  canEditProjectItem: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

let tree: any;
let alert: jest.SpyInstance;
beforeEach(() => {
  mockStore.clear(); mockExpanded = true; clearStorageReadFailure('notes');
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; alert.mockRestore(); });

async function mount(projectId?: string) {
  await act(async () => { tree = create(<NotesWorkspace projectId={projectId} isDark={false} />); });
}
const find = (id: string) => tree.root.findAll((n: any) => n.props.testID === id)[0];
async function press(id: string) { await act(async () => { await find(id).props.onPress(); }); }
async function input(id: string, text: string) { await act(async () => find(id).props.onChangeText(text)); }
const stored = <T,>(key: string): T[] => JSON.parse(mockStore.get(key) ?? '[]');

test('одна стара нотатка більше не гасить екран — решта списку жива', async () => {
  mockStore.set('notes', JSON.stringify([
    { id: 'legacy', text: 'створено у вебі' },
    { id: 'fresh', title: 'Свіжа', body: 'текст', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    { title: 'без id' },
  ]));
  await mount();

  expect(find('notes-retry')).toBeUndefined();
  expect(find('notes-add').props.disabled).toBe(false);
  expect(find('note-legacy')).toBeDefined();
  expect(find('note-fresh')).toBeDefined();

  await press('note-legacy');
  expect(find('notes-body').props.value).toBe('створено у вебі');
  expect(find('notes-title').props.value).toBe('');
});

test('теги фільтрують список, закріплена нотатка йде першою', async () => {
  const base = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };
  mockStore.set('notes', JSON.stringify([
    { id: 'site', title: 'Сайт', body: 'про #сайт', ...base },
    { id: 'plain', title: 'Інша', body: 'без тегів', ...base, updatedAt: '2026-09-05T00:00:00.000Z' },
    { id: 'pinned', title: 'Головна', body: 'теж #сайт', ...base, updatedAt: '2026-01-01T00:00:00.000Z', pinned: true },
  ]));
  await mount();

  const order = () => tree.root.findAll((n: any) => typeof n.props.testID === 'string' && n.props.testID.startsWith('note-')
    && !n.props.testID.startsWith('note-pin-') && !n.props.testID.startsWith('note-checklist-')).map((n: any) => n.props.testID);
  expect(order()[0]).toBe('note-pinned');
  expect(find('note-pin-pinned')).toBeDefined();

  await press('notes-tag-сайт');
  expect(find('note-plain')).toBeUndefined();
  expect(find('note-site')).toBeDefined();
  await press('notes-tag-all');
  expect(find('note-plain')).toBeDefined();
});

test('чек-лист: прогрес у списку, перемикання в перегляді править текст', async () => {
  mockStore.set('notes', JSON.stringify([{
    id: 'plan', title: 'План', body: '- [ ] перше\n- [x] друге',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  await mount();
  expect(find('note-checklist-plan')).toBeDefined();

  await press('note-plan');
  await press('notes-preview-toggle');
  await press('note-check-0');
  await press('notes-preview-toggle');
  expect(find('notes-body').props.value).toBe('- [x] перше\n- [x] друге');

  await press('notes-save');
  expect(stored<Note>('notes')[0].body).toBe('- [x] перше\n- [x] друге');
});

test('задача з рядка нотатки лягає в tasks і не переписує саму нотатку', async () => {
  const note = {
    id: 'plan', title: 'План', body: '- [ ] Подзвонити клієнту',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', projectId: 'p1',
  };
  mockStore.set('notes', JSON.stringify([note]));
  await mount('p1');

  await press('note-plan');
  await press('notes-preview-toggle');
  await press('note-line-task-0');

  const tasks = stored<{ title: string; projectId?: string; status: string }>('tasks');
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ title: 'Подзвонити клієнту', projectId: 'p1', status: 'active' });
  expect(stored<Note>('notes')[0].body).toBe('- [ ] Подзвонити клієнту');
});

test('закріплення й теги зберігаються, а прибрані — зникають із запису', async () => {
  mockStore.set('notes', JSON.stringify([{
    id: 'a', title: 'Назва', body: 'текст', tags: ['сайт'], pinned: true,
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
  }]));
  await mount();
  await press('note-a');
  expect(find('notes-tags').props.value).toBe('сайт');

  await input('notes-tags', 'звіт, план');
  await press('notes-pin');
  await press('notes-save');

  const saved = stored<Note>('notes')[0];
  expect(saved.tags).toEqual(['звіт', 'план']);
  expect(saved.pinned).toBeUndefined();
});
