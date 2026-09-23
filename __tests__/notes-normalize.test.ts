/**
 * Толерантне читання нотаток і розмітка тексту — `utils/notes.ts`.
 *
 * Баг, заради якого написані перші тести: ОДНА нотатка, створена старим вебом
 * (без `title`, з текстом у `text`/`content`), переводила ВЕСЬ екран нотаток у
 * стан помилки, бо запис вважався валідним лише коли `title`, `body` і
 * `updatedAt` — рядки. Тому перевіряється не «відхиляє погане», а рівно
 * протилежне: погане читається, а те, що прочитати неможливо, ПРОПУСКАЄТЬСЯ,
 * не забираючи з собою здорові записи.
 *
 * Правила спільні з вебом (`lib/notes.test.mjs`) — набір випадків там той самий.
 */
import {
  checklistProgress,
  collectNoteTags,
  noteTaskDraft,
  notePreview,
  noteTags,
  normalizeNote,
  normalizeNotes,
  parseInlineSpans,
  parseNoteMarkdown,
  parseTagsInput,
  selectNotes,
  taskTitleFromLine,
  toggleChecklistAt,
  writeNote,
} from '@/utils/notes';

const NOW = '2026-09-22T12:00:00.000Z';

test('нотатка старого вебу читається: без title, текст у text', () => {
  const note = normalizeNote({ id: 'legacy', text: 'старий веб', createdAt: '2026-01-01T00:00:00.000Z' }, NOW);
  expect(note).toMatchObject({
    id: 'legacy',
    title: '',
    body: 'старий веб',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
});

test('body головніший за легасі-поля, content — останній резерв', () => {
  expect(normalizeNote({ id: 'a', body: 'нове', text: 'старе' }, NOW)?.body).toBe('нове');
  expect(normalizeNote({ id: 'b', content: 'ще давніше' }, NOW)?.body).toBe('ще давніше');
  expect(normalizeNote({ id: 'c' }, NOW)?.body).toBe('');
});

test('updatedAt добудовується з createdAt, а за його відсутності — з моменту читання', () => {
  expect(normalizeNote({ id: 'a', createdAt: '2026-02-02T00:00:00.000Z' }, NOW)?.updatedAt)
    .toBe('2026-02-02T00:00:00.000Z');
  expect(normalizeNote({ id: 'b' }, NOW)).toMatchObject({ createdAt: NOW, updatedAt: NOW });
});

test('запис без id прочитати неможливо — він пропускається, решта лишається', () => {
  expect(normalizeNote({ text: 'нікого' }, NOW)).toBeNull();
  expect(normalizeNote(null, NOW)).toBeNull();
  expect(normalizeNote('рядок', NOW)).toBeNull();
  expect(normalizeNote([], NOW)).toBeNull();

  const notes = normalizeNotes([
    { id: 'ok', title: 'Жива', body: 'текст', updatedAt: '2026-05-01T00:00:00.000Z' },
    { text: 'без id' },
    null,
    42,
    { id: 'legacy', content: 'теж жива' },
  ], NOW);
  expect(notes.map(n => n.id)).toEqual(['ok', 'legacy']);
});

test('нечислові й непридатні типи полів не ламають запис', () => {
  const note = normalizeNote({ id: 7, title: 12, body: { nope: true }, tags: 'не масив', pinned: 'так' }, NOW);
  expect(note).toMatchObject({ id: '7', title: '', body: '' });
  expect(note?.tags).toBeUndefined();
  expect(note?.pinned).toBeUndefined();
});

test('не масив у сховищі — порожній список, а не виняток', () => {
  expect(normalizeNotes(null, NOW)).toEqual([]);
  expect(normalizeNotes({ id: 'a' }, NOW)).toEqual([]);
  expect(normalizeNotes('{broken', NOW)).toEqual([]);
});

test('дублікати за id зводяться до найсвіжішого', () => {
  const notes = normalizeNotes([
    { id: 'a', body: 'старе', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a', body: 'нове', updatedAt: '2026-08-01T00:00:00.000Z' },
  ], NOW);
  expect(notes).toHaveLength(1);
  expect(notes[0].body).toBe('нове');
});

test('легасі-поля доживають до збереження, щоб патч їх прибрав', () => {
  const note = normalizeNote({ id: 'a', text: 'старе' }, NOW)!;
  expect(note.text).toBe('старе');
  const saved = writeNote(note, { title: 'Назва', body: 'новий текст', now: NOW });
  expect('text' in saved).toBe(false);
  expect('content' in saved).toBe(false);
  expect(saved.body).toBe('новий текст');
  expect(saved.createdAt).toBe(NOW);
});

test('нові поля пишуться лише коли не порожні', () => {
  const plain = writeNote(null, { id: 'n', title: 'Т', body: '', now: NOW, tags: [], pinned: false });
  expect(plain.tags).toBeUndefined();
  expect(plain.pinned).toBeUndefined();
  expect(plain.linkedTaskId).toBeUndefined();

  const rich = writeNote(null, {
    id: 'n', title: 'Т', body: '', now: NOW,
    tags: ['#Сайт', 'сайт', ' звіт '], pinned: true, linkedTaskId: 't1', linkedMeetingId: null,
  });
  expect(rich.tags).toEqual(['Сайт', 'звіт']);
  expect(rich.pinned).toBe(true);
  expect(rich.linkedTaskId).toBe('t1');
  expect(rich.linkedMeetingId).toBeUndefined();
});

test('теги: явне поле плюс хештеги з тексту, заголовок тегом не стає', () => {
  expect(noteTags({ title: 'Звіт', body: '# Заголовок\nдив. #сайт і #Сайт', tags: ['план'] }))
    .toEqual(['план', 'сайт']);
  expect(parseTagsInput(' #сайт, звіт;  сайт ')).toEqual(['сайт', 'звіт']);
});

test('частоти тегів: спершу найуживаніші', () => {
  const chips = collectNoteTags([
    { id: 'a', tags: ['сайт'] },
    { id: 'b', tags: ['сайт', 'звіт'] },
  ]);
  expect(chips).toEqual([{ tag: 'сайт', count: 2 }, { tag: 'звіт', count: 1 }]);
});

test('фільтр за тегом і пошук по тексту, назві й тегах', () => {
  const notes = [
    { id: 'a', title: 'Перша', body: 'текст', tags: ['сайт'] },
    { id: 'b', title: 'Друга', body: 'про #звіт', tags: [] },
  ];
  expect(selectNotes(notes, { tag: 'Сайт' }).map(n => n.id)).toEqual(['a']);
  expect(selectNotes(notes, { search: 'звіт' }).map(n => n.id)).toEqual(['b']);
  expect(selectNotes(notes, { search: 'сайт' }).map(n => n.id)).toEqual(['a']);
});

test('закріплені йдуть першими в будь-якому порядку', () => {
  const notes = [
    { id: 'new', updatedAt: '2026-08-01T00:00:00.000Z', title: 'Б' },
    { id: 'pin', updatedAt: '2026-01-01T00:00:00.000Z', title: 'А', pinned: true },
  ];
  expect(selectNotes(notes, { sort: 'newest' }).map(n => n.id)).toEqual(['pin', 'new']);
  expect(selectNotes(notes, { sort: 'oldest' }).map(n => n.id)).toEqual(['pin', 'new']);
  expect(selectNotes(notes, { sort: 'title' }).map(n => n.id)).toEqual(['pin', 'new']);
});

test('розмітка: заголовок, чек-лист, пункт, цитата', () => {
  const blocks = parseNoteMarkdown('## План\n- [ ] перше\n- [x] друге\n- пункт\n> цитата\n\nтекст');
  expect(blocks.map(b => b.kind)).toEqual(['heading', 'todo', 'todo', 'bullet', 'quote', 'empty', 'text']);
  expect(blocks[0]).toMatchObject({ level: 2, text: 'План' });
  expect(blocks[1]).toMatchObject({ done: false, text: 'перше' });
  expect(blocks[2]).toMatchObject({ done: true, text: 'друге' });
});

test('чек-бокс перемикає сам текст і не чіпає сусідні рядки', () => {
  const body = '- [ ] перше\n- [x] друге\nпросто рядок';
  expect(toggleChecklistAt(body, 0)).toBe('- [x] перше\n- [x] друге\nпросто рядок');
  expect(toggleChecklistAt(body, 1)).toBe('- [ ] перше\n- [ ] друге\nпросто рядок');
  expect(toggleChecklistAt(body, 2)).toBe(body);
  expect(toggleChecklistAt(body, 99)).toBe(body);
});

test('прогрес чек-листа рахує лише пункти чек-листа', () => {
  expect(checklistProgress('- [x] a\n- [ ] b\n- звичайний')).toEqual({ done: 1, total: 2 });
  expect(checklistProgress('без чек-листа')).toEqual({ done: 0, total: 0 });
});

test('інлайн-розмітка розбирається на частини', () => {
  expect(parseInlineSpans('звичайний **жирний** і `код`')).toEqual([
    { text: 'звичайний ' }, { text: 'жирний', bold: true }, { text: ' і ' }, { text: 'код', code: true },
  ]);
});

test('назва задачі з рядка: маркери й розмітка зникають', () => {
  expect(taskTitleFromLine('- [ ] Подзвонити **клієнту**')).toBe('Подзвонити клієнту');
  expect(taskTitleFromLine('## Розділ')).toBe('Розділ');
  expect(taskTitleFromLine('1. Перший крок')).toBe('Перший крок');
  expect(taskTitleFromLine('   ')).toBe('');
});

test('задача з рядка успадковує проєкт нотатки, порожній рядок задачі не дає', () => {
  expect(noteTaskDraft({ projectId: 'p1' }, '- [ ] Зробити', { id: 't1', now: NOW })).toEqual({
    id: 't1', title: 'Зробити', status: 'active', subtasks: [], createdAt: NOW, updatedAt: NOW, projectId: 'p1',
  });
  expect(noteTaskDraft({}, '- [ ]   ', { id: 't2', now: NOW })).toBeNull();
});

test('превʼю — перший змістовний рядок, чек-лист зі станом', () => {
  expect(notePreview({ body: '\n\n  Любов (Преміум):\n- іконки' })).toBe('Любов (Преміум):');
  expect(notePreview({ body: '- [x] зроблено' })).toBe('✓ зроблено');
  expect(notePreview({ body: '' })).toBe('');
});
