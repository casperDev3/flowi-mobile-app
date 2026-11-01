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
  addNoteAttachment,
  canEditNote,
  captureTextToNote,
  filterNotesByArchive,
  lineIndexAt,
  linkNote,
  moveNote,
  nextFullHour,
  normalizeNote,
  notesLinkedTo,
  noteToMeetingDraft,
  noteToTaskDraft,
  parseDateTimePhrase,
  removeNoteAttachment,
  selectNotes,
  setNoteArchived,
  toggleChecklistAt,
  toggleLineFormat,
  wrapSelection,
  type NoteArchiveFilter,
  type NoteLineFormat,
  type NoteLinkTarget,
  type NoteToMeetingOptions,
  type NoteToTaskOptions,
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

// ─── Доробка нотаток (fixture.rework) ────────────────────────────────────────

const rw = fixture.rework;
const ISO = '2026-10-18T10:20:00.000Z';

test('дата й час із фрази (uk/en)', () => {
  for (const row of rw.phrases) {
    expect([row.why, clean(parseDateTimePhrase(row.text, rw.now))]).toEqual([row.why, row.expected]);
  }
  for (const row of rw.nextFullHour) expect(nextFullHour(row.now)).toEqual(row.expected);
});

test('швидкий запис: перший рядок — назва, завжди особиста', () => {
  for (const row of rw.capture) {
    expect([row.why, clean(captureTextToNote(row.text, ISO, row.opts))]).toEqual([row.why, row.expected]);
  }
});

test('нотатка → задача', () => {
  for (const row of rw.taskDraft) {
    expect([row.why, clean(noteToTaskDraft(row.note, row.opts as NoteToTaskOptions))]).toEqual([row.why, row.expected]);
  }
});

test('нотатка → зустріч', () => {
  for (const row of rw.meetingDraft) {
    expect([row.why, clean(noteToMeetingDraft(row.note, rw.now, row.opts as NoteToMeetingOptions))])
      .toEqual([row.why, row.expected]);
  }
});

test('нормалізація: архів і вкладення', () => {
  for (const row of rw.normalize) expect([row.why, clean(normalizeNote(row.raw, ISO))]).toEqual([row.why, row.expected]);
});

test('архів: фільтр і список за замовчуванням', () => {
  const pool = rw.pool as Note[];
  for (const mode of ['active', 'archived', 'all'] as NoteArchiveFilter[]) {
    expect(filterNotesByArchive(pool, mode).map(n => n.id)).toEqual(rw.archiveFilter[mode]);
  }
  expect(selectNotes(pool, {}).map(n => n.id)).toEqual(rw.selectDefault);
  expect(selectNotes(pool, { archived: 'archived' }).map(n => n.id)).toEqual(rw.selectArchived);
});

test('зворотні посилання: нотатки задачі/зустрічі', () => {
  for (const row of rw.linked) {
    expect(notesLinkedTo(rw.pool as Note[], row.target as NoteLinkTarget).map(n => n.id)).toEqual(row.expected);
  }
});

test('архівування, переміщення, звʼязок, вкладення', () => {
  const base = rw.base as Note;
  const L = rw.later;
  expect(clean(setNoteArchived(base, true, L))).toEqual(rw.archive);
  expect(clean(setNoteArchived(setNoteArchived(base, true, ISO), false, L))).toEqual(rw.unarchive);
  expect(clean(moveNote(base, null, L))).toEqual(rw.moveToPersonal);
  expect(clean(moveNote({ ...base, projectId: undefined }, 'p9', L))).toEqual(rw.moveToProject);
  expect(clean(linkNote(base, { meetingId: 'm5', taskId: null }, L))).toEqual(rw.link);
  const added = addNoteAttachment(
    addNoteAttachment(base, { id: 'f1', name: 'a.pdf', size: 10, type: 'application/pdf' }, L),
    { id: 'f2', name: 'b.png', size: 20, type: 'image/png' },
    L,
  );
  expect(clean(added)).toEqual(rw.attachAdd);
  expect(clean(addNoteAttachment(added, { id: 'f1', name: 'a2.pdf', size: 11, type: 'application/pdf' }, L)))
    .toEqual(rw.attachReplace);
  expect(clean(removeNoteAttachment(removeNoteAttachment(added, 'f1', L), 'f2', L))).toEqual(rw.attachRemoveAll);
});

test('панель форматування й чек-бокси', () => {
  for (const row of rw.lineIndexAt) expect([row, lineIndexAt(row.body, row.offset)]).toEqual([row, row.expected]);
  for (const row of rw.lineFormat) {
    expect([row, toggleLineFormat(row.body, row.line, row.format as NoteLineFormat)]).toEqual([row, row.expected]);
  }
  for (const row of rw.wrap) expect(wrapSelection(row.body, row.start, row.end, row.marker)).toEqual(row.expected);
  for (const row of rw.toggle) expect(toggleChecklistAt(row.body, row.line)).toBe(row.expected);
});
