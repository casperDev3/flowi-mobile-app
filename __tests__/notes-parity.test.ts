/**
 * Паритет правил екрана нотаток (пункт 2) — мобільний.
 *
 * Фікстура `__tests__/notes-parity.json` — побайтова копія вебової
 * `lib/notes-parity.json`; там ті самі випадки ганяє `lib/notes-parity.test.mjs`
 * проти `lib/notes.ts`. Роль береться з того самого хелпера, що й на екрані
 * (`canEditProjectItem`).
 */
import fixture from './notes-parity.json';
import { canEditProjectItem } from '@/hooks/use-project-roles';
import {
  canEditNote,
  filterNotesByScope,
  groupNotesByProject,
  isNoteDraftDirty,
  noteLeaveDecision,
  patchNote,
  type Note,
  type NoteScope,
} from '@/utils/notes';

// Хелпер ролей тягне store/storage; сховище тут не потрібне — лише заглушка
// (jest піднімає jest.mock над імпортами).
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));

const notes = fixture.notes as Note[];
const roles = fixture.roles as Record<string, 'owner' | 'member' | 'viewer'>;
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));

test('фільтр «Усі / Особисті / Проєкти»', () => {
  for (const scope of ['all', 'personal', 'projects'] as NoteScope[]) {
    expect(filterNotesByScope(notes, scope).map(n => n.id)).toEqual(fixture.scope[scope]);
  }
});

test('групи: особисті першими, далі проєкти за назвою, невідомий — за id', () => {
  const groups = groupNotesByProject(notes, fixture.projectNames, 'en-US')
    .map(g => ({ projectId: g.projectId, name: g.name, ids: g.notes.map(n => n.id) }));
  expect(groups).toEqual(fixture.groups);
});

test('право на нотатку: глядач проєкту не править, особиста — своя', () => {
  for (const row of fixture.canEdit) {
    const note = row.projectId ? { projectId: row.projectId } : {};
    expect([row.why, canEditNote(note, id => canEditProjectItem(id, roles), row.limit)]).toEqual([row.why, row.expected]);
  }
});

test('брудний редактор: що вважається зміною', () => {
  for (const row of fixture.dirty) {
    expect([row.why, isNoteDraftDirty(fixture.dirtyBase, row.draft)]).toEqual([row.why, row.expected]);
  }
});

test('вихід із брудного редактора питає підтвердження', () => {
  for (const row of fixture.leave) expect(noteLeaveDecision(row.state)).toBe(row.expected);
});

test('тиха правка з читання міняє лише текст/закріплення', () => {
  for (const key of ['patch', 'patchPin'] as const) {
    const { now, change, expected } = fixture[key];
    expect(clean(patchNote(fixture.dirtyBase, change, now))).toEqual(expected);
  }
});
