/**
 * Нотатки після доробки: показ і формат (чек-листи, теги, закріплення,
 * панель форматування, «задача з рядка»), перетворення в задачу/зустріч і
 * швидкий запис.
 *
 * Окремий файл від `notes-workspace.test.tsx` навмисно: там перевіряється
 * збереження й синхронізація, тут — показ, формат і перетворення.
 */
import React from 'react';
import { Alert } from 'react-native';
import { continueListOnEnter } from '@/components/notes/NoteEditor';
import { NoteCaptureSheet } from '@/components/notes/NoteCaptureSheet';
import { NotesWorkspace, type Note } from '@/components/notes/NotesWorkspace';
import { clearStorageReadFailure } from '@/store/storage';

const mockStore = new Map<string, string>();
let mockExpanded = true;
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));
jest.mock('@/components/shared/SheetModal', () => jest.requireActual('./fixtures/sheet-modal-mock'));
jest.mock('@/hooks/use-tab-bar-inset', () => ({ useTabBarInset: () => 0 }));
jest.mock('@/hooks/use-responsive', () => ({ useResponsive: () => ({ isExpanded: mockExpanded, isWide: mockExpanded, width: 1200, height: 800 }) }));
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
async function select(id: string, start: number, end = start) {
  await act(async () => find(id).props.onSelectionChange({ nativeEvent: { selection: { start, end } } }));
}
async function settle(ms = 0) { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); }
const stored = <T,>(key: string): T[] => JSON.parse(mockStore.get(key) ?? '[]');
const base = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' };

test('одна стара нотатка більше не гасить екран — решта списку жива', async () => {
  mockStore.set('notes', JSON.stringify([
    { id: 'legacy', text: 'створено у вебі' },
    { id: 'fresh', title: 'Свіжа', body: 'текст', ...base },
    { title: 'без id' },
  ]));
  await mount();

  expect(find('notes-retry')).toBeUndefined();
  expect(find('notes-add').props.disabled).toBe(false);
  expect(find('note-legacy')).toBeDefined();
  expect(find('note-fresh')).toBeDefined();

  await press('note-legacy');
  await press('note-line-0');
  expect(find('notes-body').props.value).toBe('створено у вебі');
  expect(find('notes-title').props.value).toBe('');
});

test('теги фільтрують список, закріплена нотатка йде першою', async () => {
  mockStore.set('notes', JSON.stringify([
    { id: 'site', title: 'Сайт', body: 'про #сайт', ...base },
    { id: 'plain', title: 'Інша', body: 'без тегів', ...base, updatedAt: '2026-09-05T00:00:00.000Z' },
    { id: 'pinned', title: 'Головна', body: 'теж #сайт', ...base, updatedAt: '2026-01-01T00:00:00.000Z', pinned: true },
  ]));
  await mount();

  const order = () => tree.root.findAll((n: any) => typeof n.props.testID === 'string' && /^note-(site|plain|pinned)$/.test(n.props.testID)
    && n.props.accessibilityRole === 'button').map((n: any) => n.props.testID);
  expect(order()[0]).toBe('note-pinned');
  expect(find('note-pin-pinned')).toBeDefined();

  await press('notes-tag-сайт');
  expect(find('note-plain')).toBeUndefined();
  expect(find('note-site')).toBeDefined();
  await press('notes-tag-all');
  expect(find('note-plain')).toBeDefined();
});

test('рядок у списку: прев’ю у 2 рядки, прогрес чек-листа, бейджі звʼязків і вкладень', async () => {
  mockStore.set('notes', JSON.stringify([{
    id: 'plan', title: 'План', body: '- [ ] перше\n- [x] друге', ...base,
    linkedTaskId: 't1', attachments: [{ id: 'f1', name: 'a.pdf', size: 10, type: 'application/pdf' }],
  }]));
  await mount();
  expect(find('note-checklist-plan')).toBeDefined();
  expect(find('note-task-link-plan')).toBeDefined();
  expect(find('note-files-plan')).toBeDefined();
});

test('чек-бокс у показаному тексті ОДРАЗУ зберігає нотатку й ставить її в синк', async () => {
  mockStore.set('notes', JSON.stringify([{ id: 'plan', title: 'План', body: '- [ ] перше\n- [x] друге', ...base }]));
  await mount();
  await press('note-plan');
  expect(find('notes-body')).toBeUndefined();

  await press('note-check-0'); await settle();

  expect(stored<Note>('notes')[0].body).toBe('- [x] перше\n- [x] друге');
  expect(stored<Note>('notes')[0].title).toBe('План');
  const outbox = stored<{ local_id: string; deleted: boolean }>('sync_outbox');
  expect(outbox).toHaveLength(1);
  expect(outbox[0]).toMatchObject({ local_id: 'plan', deleted: false });
  expect(find('notes-reader')).toBeDefined();
});

test('тап по рядку відкриває поле вводу саме на цьому рядку', async () => {
  mockStore.set('notes', JSON.stringify([{ id: 'n', title: 'T', body: 'перший\nдругий', ...base }]));
  await mount();
  await press('note-n');
  await press('note-line-0');
  expect(find('notes-body')).toBeDefined();
  expect(find('notes-body').props.selection).toEqual({ start: 6, end: 6 });
});

test('задача з рядка нотатки лягає в tasks і не переписує саму нотатку', async () => {
  mockStore.set('notes', JSON.stringify([{ id: 'plan', title: 'План', body: '- [ ] Подзвонити клієнту', ...base, projectId: 'p1' }]));
  await mount('p1');

  await press('note-plan');
  await press('note-line-task-0'); await settle();

  const tasks = stored<{ title: string; projectId?: string; status: string }>('tasks');
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ title: 'Подзвонити клієнту', projectId: 'p1', status: 'active' });
  expect(stored<Note>('notes')[0].body).toBe('- [ ] Подзвонити клієнту');
});

test('закріплення зберігається одразу, теги — автозбереженням', async () => {
  mockStore.set('notes', JSON.stringify([{ id: 'a', title: 'Назва', body: 'текст', tags: ['сайт'], pinned: true, ...base }]));
  await mount();
  await press('note-a');
  await press('notes-details');
  expect(find('notes-tags').props.value).toBe('сайт');

  await input('notes-tags', 'звіт, план');
  await press('notes-pin'); await settle();

  const saved = stored<Note>('notes')[0];
  expect(saved.tags).toEqual(['звіт', 'план']);
  expect(saved.pinned).toBeUndefined();
});

test('панель форматування: чек-бокс, жирний і тег правлять текст під курсором', async () => {
  await mount();
  await press('notes-add');
  await input('notes-body', 'купити хліб');
  await select('notes-body', 3);
  await press('notes-fmt-todo');
  expect(find('notes-body').props.value).toBe('- [ ] купити хліб');
  await press('notes-fmt-todo');
  expect(find('notes-body').props.value).toBe('купити хліб');
  await select('notes-body', 0, 6);
  await press('notes-fmt-bold');
  expect(find('notes-body').props.value).toBe('**купити** хліб');
  await select('notes-body', 15);
  await press('notes-fmt-tag');
  expect(find('notes-body').props.value).toBe('**купити** хліб #');
  await press('notes-fmt-heading');
  expect(find('notes-body').props.value).toBe('# **купити** хліб #');
});

test('Enter у пункті продовжує список, у порожньому пункті — закінчує', () => {
  expect(continueListOnEnter('- [x] раз', '- [x] раз\n', 9)).toEqual({ text: '- [x] раз\n- [ ] ', cursor: 16 });
  expect(continueListOnEnter('- раз', '- раз\n', 5)).toEqual({ text: '- раз\n- ', cursor: 8 });
  expect(continueListOnEnter('1. раз', '1. раз\n', 6)).toEqual({ text: '1. раз\n2. ', cursor: 10 });
  expect(continueListOnEnter('- раз\n- ', '- раз\n- \n', 8)).toEqual({ text: '- раз\n', cursor: 6 });
  expect(continueListOnEnter('просто', 'просто\n', 6)).toBeNull();
});

// ─── Перетворення ─────────────────────────────────────────────────────────────

test('нотатка → задача: чек-лист стає підзадачами, дедлайн і пріоритет з листа, нотатка привʼязана', async () => {
  mockStore.set('notes', JSON.stringify([{
    id: 'n', title: 'Реліз', body: 'контекст релізу\n- [ ] тести\n- [x] changelog', ...base,
  }]));
  await mount();
  await press('note-n');
  await press('notes-to-task'); await settle();
  expect(find('notes-convert-sheet')).toBeDefined();
  expect(find('notes-convert-title').props.value).toBe('Реліз');
  await press('notes-convert-deadline-tomorrow');
  await press('notes-convert-priority-1');
  await press('notes-convert-create'); await settle();

  const tasks = stored<any>('tasks');
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ title: 'Реліз', description: 'контекст релізу', status: 'active', priorityLevel: 1 });
  expect(tasks[0].projectId).toBeUndefined();
  expect(tasks[0].subtasks.map((s: any) => [s.title, s.done])).toEqual([['тести', false], ['changelog', true]]);
  expect(typeof tasks[0].deadline).toBe('string');
  const saved = stored<Note>('notes')[0];
  expect(saved.linkedTaskId).toBe(tasks[0].id);
  expect(saved.body).toBe('контекст релізу\n- [ ] тести\n- [x] changelog');
  expect(find('notes-convert-sheet')).toBeUndefined();
  expect(find('notes-task-badge')).toBeDefined();
});

test('нотатка → зустріч: дата й час із фрази, порядок денний, решта — у нотатки зустрічі', async () => {
  mockStore.set('notes', JSON.stringify([{
    id: 'm', title: 'Дзвінок з Іваном завтра о 15:00', body: '- бюджет\n- терміни\nпідготувати цифри', ...base,
  }]));
  await mount();
  await press('note-m');
  await press('notes-to-meeting'); await settle();
  expect(find('notes-convert-title').props.value).toBe('Дзвінок з Іваном');
  expect(find('notes-convert-time').props.value).toBe('15:00');
  await press('notes-convert-create'); await settle();

  const meetings = stored<any>('meetings');
  expect(meetings).toHaveLength(1);
  const now = new Date(); const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  expect(meetings[0]).toMatchObject({ title: 'Дзвінок з Іваном', date: ymd, time: '15:00', durationMinutes: 30, notes: 'підготувати цифри' });
  expect(meetings[0].agenda.map((a: any) => a.text)).toEqual(['бюджет', 'терміни']);
  expect(stored<Note>('notes')[0].linkedMeetingId).toBe(meetings[0].id);
});

test('проєктна нотатка → особиста задача: задача без проєкту, нотатка лишається в проєкті', async () => {
  mockStore.set('projects', JSON.stringify([{ id: 'p1', name: 'Сайт' }]));
  mockStore.set('auth_user', JSON.stringify({ id: 'u1' }));
  mockStore.set('notes', JSON.stringify([{ id: 'n', title: 'Ідея', body: '', ...base, projectId: 'p1' }]));
  await mount();
  await press('note-n');
  await press('notes-to-task'); await settle();
  expect(find('notes-convert-project-p1').props.accessibilityState.selected).toBe(true);
  await press('notes-convert-project-personal');
  await press('notes-convert-create'); await settle();
  const task = stored<any>('tasks')[0];
  expect(task.projectId).toBeUndefined();
  expect(task.createdBy).toBeUndefined();
  expect(stored<Note>('notes')[0]).toMatchObject({ projectId: 'p1', linkedTaskId: task.id });
});

test('проєктна задача з нотатки отримує автора (createdBy, §3.3)', async () => {
  mockStore.set('projects', JSON.stringify([{ id: 'p1', name: 'Сайт' }]));
  mockStore.set('auth_user', JSON.stringify({ id: 'u1' }));
  mockStore.set('notes', JSON.stringify([{ id: 'n', title: 'Ідея', body: '', ...base }]));
  await mount();
  await press('note-n');
  await press('notes-to-task'); await settle();
  await press('notes-convert-project-p1');
  await press('notes-convert-create'); await settle();
  expect(stored<any>('tasks')[0]).toMatchObject({ projectId: 'p1', createdBy: 'u1' });
  expect(stored<Note>('notes')[0].projectId).toBeUndefined();
});

// ─── Швидкий запис ────────────────────────────────────────────────────────────

describe('NoteCaptureSheet', () => {
  async function capture(props: Partial<React.ComponentProps<typeof NoteCaptureSheet>> = {}) {
    const onClose = jest.fn();
    await act(async () => { tree = create(<NoteCaptureSheet visible onClose={onClose} isDark={false} {...props} />); });
    return onClose;
  }

  test('закриття свайпом зберігає особисту нотатку: перший рядок — назва, зі звʼязком', async () => {
    const onClose = await capture({ initialLinks: { taskId: 't1' } });
    expect(find('notes-capture-input').props.autoFocus).toBe(true);
    await input('notes-capture-input', 'Ідея для звіту\nдеталі');
    await press('sheet-dismiss'); await settle();
    const notes = stored<Note>('notes');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: 'Ідея для звіту', body: 'деталі', linkedTaskId: 't1' });
    expect(notes[0].projectId).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('порожній запис нічого не зберігає', async () => {
    const onClose = await capture();
    await press('sheet-dismiss'); await settle();
    expect(mockStore.get('notes')).toBeUndefined();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('«Розгорнути» зберігає й передає id нотатки', async () => {
    const onExpand = jest.fn();
    const onClose = await capture({ onExpand });
    await input('notes-capture-input', 'Швидко');
    await press('notes-capture-expand'); await settle();
    const [saved] = stored<Note>('notes');
    expect(saved.title).toBe('Швидко');
    expect(onExpand).toHaveBeenCalledWith(saved.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('«→ Задача» зберігає нотатку, потім відкриває лист перетворення', async () => {
    const onClose = await capture();
    await input('notes-capture-input', 'Купити квитки\n- [ ] поїзд');
    await press('notes-capture-task'); await settle();
    expect(find('notes-capture-sheet')).toBeUndefined();
    expect(find('notes-convert-sheet')).toBeDefined();
    expect(stored<Note>('notes')).toHaveLength(1);
    await press('notes-convert-create'); await settle();
    const task = stored<any>('tasks')[0];
    expect(task).toMatchObject({ title: 'Купити квитки' });
    expect(task.subtasks).toHaveLength(1);
    expect(stored<Note>('notes')[0].linkedTaskId).toBe(task.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
