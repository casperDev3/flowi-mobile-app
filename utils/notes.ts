/**
 * utils/notes.ts — читання, розмітка й добір нотаток.
 *
 * Дзеркало веб-версії (`lib/notes.ts`). Нотатки синхронізуються між
 * клієнтами, тож будь-яка розбіжність у цих правилах означала б, що та сама
 * нотатка на телефоні й у браузері виглядає по-різному: інший текст, інший
 * порядок, інша кількість пунктів у чек-листі.
 *
 * ТОЛЕРАНТНЕ ЧИТАННЯ. Запис у сховищі — це не наш тип, а те, що туди поклав
 * будь-який клієнт будь-якої збірки. Старий веб писав текст у `text` чи
 * `content` і не писав `title` зовсім. Донедавна екран вважав валідною лише
 * колекцію, де В КОЖНОГО запису `title`, `body` і `updatedAt` — рядки, тож
 * ОДНА така нотатка переводила ВЕСЬ екран у стан помилки: список порожній,
 * «Додати» вимкнено, і зникали заразом усі здорові записи.
 *
 * Тому тут не перевірка, а нормалізація: чого бракує — добудовується
 * (`title` може бути порожнім, текст береться з `body || text || content`,
 * `updatedAt` — з `createdAt` або з моменту читання), а запис, у якого немає
 * навіть id, просто пропускається. Помилкою лишається тільки те, що справді
 * помилка: сховище не прочиталось або там узагалі не масив.
 *
 * ЗВОРОТНА СУМІСНІСТЬ ФОРМАТУ. Нові поля (`tags`, `pinned`, `linkedTaskId`,
 * `linkedMeetingId`) опційні: старий клієнт їх не бачить і не чіпає, новий —
 * не вимагає. Чек-листи живуть у самому тексті (`- [ ] …`), а не в окремому
 * полі, тож нотатка з чек-листом читається старою збіркою як звичайний текст.
 */

/** Нотатка у вигляді, придатному до показу: жодного поля-«можливо». */
export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  /** Теги запису. Порожній список не зберігаємо зовсім. */
  tags?: string[];
  /** Закріплена нотатка йде першою в будь-якому порядку. */
  pinned?: boolean;
  /** Звʼязок із задачею (`tasks`). Невідомий id показуємо як «звʼязок втрачено». */
  linkedTaskId?: string;
  /** Звʼязок із зустріччю (`meetings`). */
  linkedMeetingId?: string;
  /**
   * Легасі-поля старого вебу. Тримаються В нормалізованому записі навмисно:
   * `saveSyncedChanges` рахує патч як різницю полів «було»/«стало», і якщо
   * прибрати їх іще на читанні, запис у сховищі назавжди лишився б із двома
   * джерелами правди. `writeNote` їх не переносить — тобто перше ж збереження
   * з телефона прибирає їх і зі сховища.
   */
  text?: string;
  content?: string;
}

/** Те, що приймає `writeNote`: будь-який запис, навіть недочитаний. */
export interface NoteInput {
  id?: string;
  title?: string;
  body?: string;
  text?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string;
  tags?: string[];
  pinned?: boolean;
  linkedTaskId?: string;
  linkedMeetingId?: string;
}

export type NoteSort = 'newest' | 'oldest' | 'title';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asFilled = (value: unknown): string | undefined => {
  const text = asString(value)?.trim();
  return text ? text : undefined;
};

/** id з рядка або з числа: старі веб-записи трапляються з числовим id. */
function readId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return asFilled(value);
}

export function noteBody(note: NoteInput): string {
  return note.body ?? note.text ?? note.content ?? '';
}

export function noteTitle(note: NoteInput): string {
  return (note.title ?? '').trim();
}

/** Час, за яким нотатка вважається свіжою. */
export function noteStamp(note: NoteInput): string {
  return note.updatedAt ?? note.createdAt ?? '';
}

// ─── Теги ─────────────────────────────────────────────────────────────────────

/** `#`, пробіли й регістр не є частиною тега — інакше «#Сайт» і «сайт» різні. */
export function normalizeTag(raw: unknown): string {
  return (asString(raw) ?? '')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
    .trim();
}

/** Порівнюємо теги без регістру, але показуємо в тому вигляді, як написали. */
export function tagKey(tag: string): string {
  return tag.toLocaleLowerCase();
}

function mergeTags(...groups: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const raw of group) {
      const tag = normalizeTag(raw);
      if (!tag) continue;
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

export function normalizeTagList(raw: unknown): string[] {
  return Array.isArray(raw) ? mergeTags(raw as string[]) : [];
}

/**
 * `#тег` усередині тексту. Заголовок Markdown («# Назва») тегом не стає —
 * після решітки мусить одразу йти сам тег, без пробілу.
 */
export function hashtagsFrom(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|[\s(])#([\p{L}\p{N}_-]{1,40})/gu;
  let match = pattern.exec(text);
  while (match) {
    found.push(match[1]);
    match = pattern.exec(text);
  }
  return mergeTags(found);
}

/** Теги запису: явне поле плюс `#хештеги` з назви й тексту. */
export function noteTags(note: NoteInput): string[] {
  return mergeTags(normalizeTagList(note.tags), hashtagsFrom(`${noteTitle(note)}\n${noteBody(note)}`));
}

/** Теги всієї колекції з частотою — для рядка фільтрів. */
export function collectNoteTags(
  notes: readonly NoteInput[],
  locale = 'uk-UA',
): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const note of notes) {
    for (const tag of noteTags(note)) {
      const key = tagKey(tag);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) =>
    b.count - a.count || a.tag.localeCompare(b.tag, locale));
}

/** Рядок із поля вводу → теги. Розділювач — кома, крапка з комою або пробіл. */
export function parseTagsInput(value: string): string[] {
  return mergeTags((value ?? '').split(/[,;\n]+|\s+/));
}

export function formatTagsInput(tags: readonly string[] | undefined): string {
  return (tags ?? []).join(', ');
}

// ─── Нормалізація ─────────────────────────────────────────────────────────────

/**
 * Один запис зі сховища → нотатка, або null, якщо читати нічого.
 *
 * null повертається лише там, де запис неможливо навіть ідентифікувати (не
 * обʼєкт або без id): такий пропускається, а не ламає список.
 */
export function normalizeNote(raw: unknown, now: string = new Date().toISOString()): Note | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const id = readId(source.id);
  if (!id) return null;

  const createdAt = asFilled(source.createdAt) ?? asFilled(source.updatedAt) ?? now;
  const note: Note = {
    id,
    title: asString(source.title) ?? '',
    body: asString(source.body) ?? asString(source.text) ?? asString(source.content) ?? '',
    createdAt,
    updatedAt: asFilled(source.updatedAt) ?? createdAt,
  };

  const projectId = asFilled(source.projectId);
  if (projectId) note.projectId = projectId;
  const tags = normalizeTagList(source.tags);
  if (tags.length) note.tags = tags;
  if (source.pinned === true) note.pinned = true;
  const linkedTaskId = asFilled(source.linkedTaskId);
  if (linkedTaskId) note.linkedTaskId = linkedTaskId;
  const linkedMeetingId = asFilled(source.linkedMeetingId);
  if (linkedMeetingId) note.linkedMeetingId = linkedMeetingId;
  const text = asString(source.text);
  if (text !== undefined) note.text = text;
  const content = asString(source.content);
  if (content !== undefined) note.content = content;

  return note;
}

/**
 * Колекція зі сховища → нотатки. Не масив — порожній список (сам факт
 * «не масив» екран визначає окремо й показує відновлення).
 *
 * Дублікати за id зводяться до найсвіжішого: два записи з однаковим id
 * зустрічаються після злиття потоків, і показувати їх обидва означало б два
 * однакові рядки, з яких правиться завжди той самий.
 */
export function normalizeNotes(raw: unknown, now: string = new Date().toISOString()): Note[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, Note>();
  for (const item of raw) {
    const note = normalizeNote(item, now);
    if (!note) continue;
    const previous = byId.get(note.id);
    if (previous && noteStamp(previous) > noteStamp(note)) continue;
    byId.set(note.id, note);
  }
  return [...byId.values()];
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

export type NoteBlockKind = 'heading' | 'todo' | 'bullet' | 'quote' | 'text' | 'empty';

export interface NoteBlock {
  kind: NoteBlockKind;
  /** Номер рядка в тексті — за ним перемикається чек-бокс і твориться задача. */
  line: number;
  /** Текст без маркера рядка; інлайн-розмітка лишається на місці. */
  text: string;
  level?: 1 | 2 | 3;
  done?: boolean;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const TODO = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseNoteMarkdown(body: string): NoteBlock[] {
  return (body ?? '').split('\n').map((raw, line): NoteBlock => {
    const heading = HEADING.exec(raw);
    if (heading) return { kind: 'heading', line, text: heading[2].trim(), level: heading[1].length as 1 | 2 | 3 };
    // Чек-лист перевіряється ПЕРЕД списком: «- [ ] …» підходить під обидва.
    const todo = TODO.exec(raw);
    if (todo) return { kind: 'todo', line, text: todo[2].trim(), done: todo[1] !== ' ' };
    const bullet = BULLET.exec(raw) ?? ORDERED.exec(raw);
    if (bullet) return { kind: 'bullet', line, text: bullet[1].trim() };
    const quote = QUOTE.exec(raw);
    if (quote) return { kind: 'quote', line, text: quote[1].trim() };
    return raw.trim() ? { kind: 'text', line, text: raw.trim() } : { kind: 'empty', line, text: '' };
  });
}

export interface NoteSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/;

/** Інлайн-розмітка одного рядка: **жирне**, *курсив*, `код`. */
export function parseInlineSpans(text: string): NoteSpan[] {
  const parts = (text ?? '').split(INLINE).filter(part => part !== '' && part !== undefined);
  return parts.map(part => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return { text: part.slice(2, -2), bold: true };
    if (part.length > 4 && part.startsWith('__') && part.endsWith('__')) return { text: part.slice(2, -2), bold: true };
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return { text: part.slice(1, -1), code: true };
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return { text: part.slice(1, -1), italic: true };
    if (part.length > 2 && part.startsWith('_') && part.endsWith('_')) return { text: part.slice(1, -1), italic: true };
    return { text: part };
  });
}

/** Текст без розмітки — для превʼю в списку й для назви нової задачі. */
export function stripInline(text: string): string {
  return parseInlineSpans(text).map(span => span.text).join('');
}

/**
 * Перемкнути чек-бокс у рядку `line`. Рядок не є пунктом чек-листа або його
 * взагалі немає — текст повертається незмінним: мовчазна відмова тут краща за
 * дописаний навмання маркер.
 */
export function toggleChecklistAt(body: string, line: number): string {
  const lines = (body ?? '').split('\n');
  const current = lines[line];
  if (current === undefined) return body ?? '';
  const match = /^(\s*[-*]\s+\[)([ xX])(\].*)$/.exec(current);
  if (!match) return body ?? '';
  lines[line] = `${match[1]}${match[2] === ' ' ? 'x' : ' '}${match[3]}`;
  return lines.join('\n');
}

export function checklistProgress(body: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const block of parseNoteMarkdown(body ?? '')) {
    if (block.kind !== 'todo') continue;
    total += 1;
    if (block.done) done += 1;
  }
  return { done, total };
}

/** Рядок тексту → назва задачі: маркери списку й розмітка зникають. */
export function taskTitleFromLine(line: string): string {
  const bare = (line ?? '')
    .replace(/^\s*>\s?/, '')
    .replace(/^\s*#{1,6}\s+/, '')
    .replace(/^\s*[-*]\s+(\[[ xX]\]\s*)?/, '')
    .replace(/^\s*\d+[.)]\s+/, '');
  return stripInline(bare).trim().slice(0, 200);
}

/** Спільні поля задачі, створеної з рядка нотатки. Null — у рядку немає тексту. */
export function noteTaskDraft(
  note: Pick<NoteInput, 'projectId'>,
  line: string,
  at: { id: string; now: string },
): { id: string; title: string; status: 'active'; subtasks: []; createdAt: string; updatedAt: string; projectId?: string } | null {
  const title = taskTitleFromLine(line);
  if (!title) return null;
  return {
    id: at.id,
    title,
    status: 'active',
    subtasks: [],
    createdAt: at.now,
    updatedAt: at.now,
    ...(note.projectId ? { projectId: note.projectId } : {}),
  };
}

// ─── Добір ────────────────────────────────────────────────────────────────────

export interface NoteQuery {
  search?: string;
  sort?: NoteSort;
  /** Показати лише нотатки з цим тегом. Порожньо/null — усі. */
  tag?: string | null;
  locale?: string;
}

function haystack(note: NoteInput): string {
  return `${noteTitle(note)} ${noteBody(note)} ${noteTags(note).join(' ')}`;
}

/**
 * Пошук, фільтр за тегом і порядок. Закріплені йдуть першими В БУДЬ-ЯКОМУ
 * порядку — закріплення означає «тримай на очах», і порядок за назвою не
 * привід опустити нотатку вниз.
 */
export function selectNotes<T extends NoteInput>(notes: readonly T[], query: NoteQuery): T[] {
  const locale = query.locale ?? 'uk-UA';
  const needle = (query.search ?? '').toLocaleLowerCase(locale).trim();
  const tag = query.tag ? tagKey(normalizeTag(query.tag)) : '';
  const sort = query.sort ?? 'newest';

  const filtered = notes.filter(note => {
    if (needle && !haystack(note).toLocaleLowerCase(locale).includes(needle)) return false;
    if (tag && !noteTags(note).some(value => tagKey(value) === tag)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    const pinned = (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1);
    if (pinned !== 0) return pinned;
    if (sort === 'title') {
      // Нотатка без назви не має підстав очолювати абетку — відсуваємо в кінець.
      const left = noteTitle(a);
      const right = noteTitle(b);
      if (!left && right) return 1;
      if (left && !right) return -1;
      return left.localeCompare(right, locale);
    }
    const [first, second] = [noteStamp(a), noteStamp(b)];
    return sort === 'oldest' ? first.localeCompare(second) : second.localeCompare(first);
  });
}

/** Перший непорожній рядок тексту — те, що видно в списку поруч із назвою. */
export function notePreview(note: NoteInput): string {
  const block = parseNoteMarkdown(noteBody(note)).find(item => item.kind !== 'empty' && item.text);
  if (!block) return '';
  const text = stripInline(block.text);
  return block.kind === 'todo' ? `${block.done ? '✓' : '○'} ${text}` : text;
}

// ─── Запис ────────────────────────────────────────────────────────────────────

export interface NoteFields {
  title: string;
  body: string;
  now: string;
  id?: string;
  tags?: readonly string[];
  pinned?: boolean;
  /** null — звʼязок прибрано; undefined — лишити як є. */
  linkedTaskId?: string | null;
  linkedMeetingId?: string | null;
}

/**
 * Зібрати запис для збереження: текст лягає в `body`, легасі-поля зникають.
 * `updatedAt` проставляє викликач — так само, як це робить веб.
 */
export function writeNote(base: NoteInput | null, fields: NoteFields): Note {
  const rest: Record<string, unknown> = { ...(base ?? {}) };
  delete rest.text;
  delete rest.content;

  const tags = fields.tags !== undefined ? mergeTags(fields.tags) : normalizeTagList(base?.tags);
  const linkedTaskId = fields.linkedTaskId !== undefined ? asFilled(fields.linkedTaskId) : asFilled(base?.linkedTaskId);
  const linkedMeetingId = fields.linkedMeetingId !== undefined
    ? asFilled(fields.linkedMeetingId)
    : asFilled(base?.linkedMeetingId);
  const pinned = fields.pinned !== undefined ? fields.pinned : base?.pinned === true;

  return {
    ...(rest as Partial<Note>),
    id: base?.id ?? fields.id ?? '',
    title: fields.title.trim(),
    body: fields.body,
    createdAt: base?.createdAt ?? fields.now,
    updatedAt: fields.now,
    // Порожні нові поля не пишемо зовсім: старий клієнт їх не знає, і запис
    // без них читається ним точно так само, як і до появи можливості.
    tags: tags.length ? tags : undefined,
    pinned: pinned ? true : undefined,
    linkedTaskId,
    linkedMeetingId,
  };
}
