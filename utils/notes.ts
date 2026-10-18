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
  /** В архіві: зникає зі звичайного списку, видно у фільтрі «Архів». */
  archived?: boolean;
  /** Коли заархівовано (ISO). */
  archivedAt?: string;
  /** Метадані вкладень; самі файли — `/api/notes/<id>/attachments/`. */
  attachments?: NoteAttachmentMeta[];
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
  archived?: boolean;
  archivedAt?: string;
  attachments?: NoteAttachmentMeta[];
}

/** Метадані вкладення нотатки (вміст — на сервері). */
export interface NoteAttachmentMeta {
  id: string;
  name: string;
  /** Байти. */
  size: number;
  /** MIME-тип. */
  type: string;
}

/** Назва, спільна з вебом (`lib/notes.ts`): там це `Note` з `lib/types.ts`. */
export type NoteRecord = Note;

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
 * Метадані вкладень зі сховища: запис без id пропускається, дублікати за id
 * зводяться до першого, розмір — ціле невідʼємне число, тип за замовчуванням —
 * `application/octet-stream`.
 */
export function normalizeAttachments(raw: unknown): NoteAttachmentMeta[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: NoteAttachmentMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const id = readId(source.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const size = typeof source.size === "number" && Number.isFinite(source.size) && source.size > 0 ? Math.round(source.size) : 0;
    out.push({
      id,
      name: asFilled(source.name) ?? id,
      size,
      type: asFilled(source.type) ?? "application/octet-stream",
    });
  }
  return out;
}

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
  if (source.archived === true) {
    note.archived = true;
    const archivedAt = asFilled(source.archivedAt);
    if (archivedAt) note.archivedAt = archivedAt;
  }
  const attachments = normalizeAttachments(source.attachments);
  if (attachments.length) note.attachments = attachments;
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
  /** Архів: за замовчуванням — лише неархівні («active»). */
  archived?: NoteArchiveFilter;
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
  const archived = query.archived ?? 'active';

  const filtered = filterNotesByArchive(notes, archived).filter(note => {
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

// ─── Паритет екранів (пункт 2) ────────────────────────────────────────────────
//
// Однакові назви й правила з вебом (`lib/notes.ts`). Спільна фікстура —
// `__tests__/notes-parity.json` тут і `lib/notes-parity.json` у вебі
// (побайтова копія): якщо правило розійдеться, впаде тест на обох платформах.

/** Фільтр агрегованого екрана: усі, лише особисті (без проєкту) чи лише проєктні. */
export type NoteScope = 'all' | 'personal' | 'projects';

export function filterNotesByScope<T extends NoteInput>(notes: readonly T[], scope: NoteScope): T[] {
  if (scope === 'personal') return notes.filter((note) => !note.projectId);
  if (scope === 'projects') return notes.filter((note) => Boolean(note.projectId));
  return [...notes];
}

export interface NoteGroup<T> {
  /** null — особисті нотатки. */
  projectId: string | null;
  /** Назва проєкту; null — особисті або проєкт, назви якого ще не знаємо. */
  name: string | null;
  notes: T[];
}

/**
 * Групи списку: спершу особисті, далі проєкти за абеткою назв. Порядок
 * усередині групи — той, що прийшов (тобто результат `selectNotes`).
 */
export function groupNotesByProject<T extends NoteInput>(
  notes: readonly T[],
  projectNames: Readonly<Record<string, string>>,
  locale = 'uk-UA',
): NoteGroup<T>[] {
  const grouped = new Map<string, T[]>();
  for (const note of notes) {
    const key = note.projectId ?? '';
    const bucket = grouped.get(key);
    if (bucket) bucket.push(note);
    else grouped.set(key, [note]);
  }
  const label = (key: string) => projectNames[key] ?? key;
  return [...grouped.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : label(a).localeCompare(label(b), locale)))
    .map(([key, items]) => ({
      projectId: key || null,
      name: key ? projectNames[key] ?? null : null,
      notes: items,
    }));
}

/**
 * Чи може людина правити саме цю нотатку. Особиста — так; проєктна — за роллю
 * в її проєкті (`canEditProject`, платформний хелпер ролей). `limit` —
 * верхня межа від екрана (простір проєкту вже знає роль і передає її).
 */
export function canEditNote(
  note: Pick<NoteInput, 'projectId'> | null | undefined,
  canEditProject: (projectId: string) => boolean,
  limit = true,
): boolean {
  if (!limit) return false;
  const projectId = note?.projectId;
  return projectId ? canEditProject(projectId) : true;
}

/** Поля редактора в тому вигляді, в якому їх тримає форма. */
export interface NoteDraftState {
  title: string;
  body: string;
  tags: readonly string[];
  pinned: boolean;
  linkedTaskId: string | null;
  linkedMeetingId: string | null;
}

/**
 * Чи відрізняється редактор від збереженої нотатки. Порівнюється те, що
 * реально ляже на диск через `writeNote`: назва без країв, теги без регістру
 * й дублів, порожній звʼязок = відсутній.
 */
export function isNoteDraftDirty(note: NoteInput, draft: NoteDraftState): boolean {
  const savedTags = normalizeTagList(note.tags).map(tagKey);
  const draftTags = mergeTags(draft.tags).map(tagKey);
  return (
    draft.title.trim() !== noteTitle(note) ||
    draft.body !== noteBody(note) ||
    savedTags.length !== draftTags.length ||
    savedTags.some((tag, index) => tag !== draftTags[index]) ||
    draft.pinned !== (note.pinned === true) ||
    (asFilled(draft.linkedTaskId) ?? null) !== (asFilled(note.linkedTaskId) ?? null) ||
    (asFilled(draft.linkedMeetingId) ?? null) !== (asFilled(note.linkedMeetingId) ?? null)
  );
}

/**
 * Що робити, коли людина йде з редактора (інша нотатка, «Скасувати», «Назад»,
 * закриття вкладки): під час збереження — лишитись, з незбереженими змінами —
 * спитати, інакше — просто піти.
 */
export function noteLeaveDecision(state: { dirty: boolean; busy?: boolean }): 'stay' | 'leave' | 'confirm' {
  if (state.busy) return 'stay';
  return state.dirty ? 'confirm' : 'leave';
}

/**
 * Тиха правка з режиму читання: чек-бокс і закріплення зберігаються одразу,
 * без редактора. Назва, теги й звʼязки лишаються як були.
 */
export function patchNote(
  note: NoteInput,
  change: { body?: string; pinned?: boolean },
  now: string,
): Note {
  return writeNote(note, {
    title: noteTitle(note),
    body: change.body ?? noteBody(note),
    pinned: change.pinned ?? note.pinned === true,
    now,
  });
}

// ─── Доробка нотаток: архів, вкладення, звʼязки, переміщення ─────────────────
//
// СПІЛЬНИЙ БЛОК: від цього заголовка до кінця файлу текст однаковий у
// `utils/notes.ts` (мобільний) і `lib/notes.ts` (веб) — і за поведінкою, і
// побуквено. Випадки — у спільній фікстурі `notes-parity.json`.

/** Фільтр архіву. За замовчуванням список показує лише неархівні. */
export type NoteArchiveFilter = "active" | "archived" | "all";

export function isNoteArchived(note: Pick<NoteInput, "archived"> | null | undefined): boolean {
  return note?.archived === true;
}

export function filterNotesByArchive<T extends NoteInput>(
  notes: readonly T[],
  mode: NoteArchiveFilter = "active",
): T[] {
  if (mode === "all") return [...notes];
  const wanted = mode === "archived";
  return notes.filter((note) => isNoteArchived(note) === wanted);
}

/** Той самий запис, переписаний через `writeNote` (легасі-поля зникають). */
function rewrite(note: NoteInput, now: string): NoteRecord {
  return writeNote(note, { title: noteTitle(note), body: noteBody(note), now });
}

/** Архівувати / повернути з архіву. Повернення прибирає обидва поля зовсім. */
export function setNoteArchived(note: NoteInput, archived: boolean, now: string): NoteRecord {
  const next = rewrite(note, now);
  next.archived = archived ? true : undefined;
  next.archivedAt = archived ? now : undefined;
  return next;
}

/** Додати (або замінити за id) метадані вкладення. Сам файл живе на сервері. */
export function addNoteAttachment(note: NoteInput, attachment: NoteAttachmentMeta, now: string): NoteRecord {
  const [clean] = normalizeAttachments([attachment]);
  const list = normalizeAttachments(note.attachments);
  const next = rewrite(note, now);
  if (!clean) return next;
  const at = list.findIndex((item) => item.id === clean.id);
  if (at >= 0) list[at] = clean;
  else list.push(clean);
  next.attachments = list;
  return next;
}

export function removeNoteAttachment(note: NoteInput, attachmentId: string, now: string): NoteRecord {
  const list = normalizeAttachments(note.attachments).filter((item) => item.id !== attachmentId);
  const next = rewrite(note, now);
  next.attachments = list.length ? list : undefined;
  return next;
}

/**
 * Привʼязати нотатку до задачі/зустрічі (після перетворення або «+ Нотатка»).
 * undefined — лишити як є, null чи "" — прибрати звʼязок.
 */
export function linkNote(
  note: NoteInput,
  link: { taskId?: string | null; meetingId?: string | null },
  now: string,
): NoteRecord {
  return writeNote(note, {
    title: noteTitle(note),
    body: noteBody(note),
    now,
    linkedTaskId: link.taskId,
    linkedMeetingId: link.meetingId,
  });
}

/** Ціль зворотних посилань: секція «Нотатки» у задачі чи зустрічі. */
export type NoteLinkTarget = { taskId: string } | { meetingId: string };

/** Усі нотатки, привʼязані до задачі чи зустрічі, — найсвіжіші першими. */
export function notesLinkedTo<T extends NoteInput>(notes: readonly T[], target: NoteLinkTarget): T[] {
  const taskId = "taskId" in target ? asFilled(target.taskId) : undefined;
  const meetingId = "meetingId" in target ? asFilled(target.meetingId) : undefined;
  if (!taskId && !meetingId) return [];
  return notes
    .filter((note) => (taskId ? asFilled(note.linkedTaskId) === taskId : asFilled(note.linkedMeetingId) === meetingId))
    .sort((a, b) => noteStamp(b).localeCompare(noteStamp(a)));
}

/**
 * Перенести нотатку між «Особистими» й проєктом: той самий id і поля, інший
 * `projectId` (null — в особисті). Видалення з колекції-джерела й запис у
 * колекцію-ціль — справа синку платформи.
 */
export function moveNote(note: NoteInput, projectId: string | null, now: string): NoteRecord {
  const next = rewrite(note, now);
  const target = asFilled(projectId);
  if (target) next.projectId = target;
  else delete next.projectId;
  return next;
}

// ─── Швидкий запис ────────────────────────────────────────────────────────────

const LIST_LINE = /^\s*(?:[-*]\s+|\d+[.)]\s+)/;

/**
 * Текст швидкого запису → назва й тіло: перший непорожній рядок — назва
 * (без «# »), решта — тіло. Якщо перший рядок — пункт списку чи чек-листа,
 * назви немає і ВЕСЬ текст іде в тіло: інакше чек-бокс перетворився б на
 * назву й зник.
 */
export function splitCaptureText(text: string): { title: string; body: string } {
  const lines = (text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first < 0) return { title: "", body: "" };
  const tidy = (rest: string[]) => rest.join("\n").replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
  if (LIST_LINE.test(lines[first])) return { title: "", body: tidy(lines.slice(first)) };
  return { title: lines[first].trim().replace(/^#{1,6}\s+/, "").trim(), body: tidy(lines.slice(first + 1)) };
}

/**
 * Швидкий запис → нова нотатка. Завжди особиста (без `projectId`), навіть коли
 * створена з проєктної задачі/зустрічі — тоді лише зі звʼязком. Порожній
 * текст — null: нічого не зберігаємо.
 */
export function captureTextToNote(
  text: string,
  now: string,
  opts: { id?: string; linkedTaskId?: string; linkedMeetingId?: string } = {},
): NoteRecord | null {
  const { title, body } = splitCaptureText(text);
  if (!title && !body) return null;
  return writeNote(null, {
    id: opts.id,
    title,
    body,
    now,
    linkedTaskId: opts.linkedTaskId,
    linkedMeetingId: opts.linkedMeetingId,
  });
}

// ─── Панель форматування ──────────────────────────────────────────────────────

/** Номер рядка, у якому стоїть курсор (`offset` — позиція в тексті). */
export function lineIndexAt(body: string, offset: number): number {
  const text = (body ?? "").slice(0, Math.max(0, offset));
  let count = 0;
  for (const char of text) if (char === "\n") count += 1;
  return count;
}

export type NoteLineFormat = "todo" | "bullet" | "heading";

const LINE_MARKER = /^(\s*)(?:#{1,6}\s+|[-*]\s+\[[ xX]\]\s?|[-*]\s+|\d+[.)]\s+)?(.*)$/;

function lineFormatOf(line: string): NoteLineFormat | null {
  if (HEADING.test(line)) return "heading";
  if (TODO.test(line)) return "todo";
  if (BULLET.test(line)) return "bullet";
  return null;
}

/**
 * Кнопка панелі для рядка `line`: рядок уже має цей формат — маркер
 * знімається, інакше старий маркер замінюється новим. Відступ лишається.
 */
export function toggleLineFormat(body: string, line: number, format: NoteLineFormat): string {
  const lines = (body ?? "").split("\n");
  const current = lines[line];
  if (current === undefined) return body ?? "";
  const match = LINE_MARKER.exec(current);
  const indent = match ? match[1] : "";
  const rest = match ? match[2] : current;
  if (lineFormatOf(current) === format) {
    lines[line] = `${indent}${rest}`;
  } else {
    const prefix = format === "todo" ? "- [ ] " : format === "bullet" ? "- " : "# ";
    lines[line] = format === "heading" ? `${prefix}${rest}` : `${indent}${prefix}${rest}`;
  }
  return lines.join("\n");
}

/**
 * Обгорнути виділення маркером (`**` — жирне). Порожнє виділення — пара
 * маркерів із курсором усередині. Повертає новий текст і нове виділення.
 */
export function wrapSelection(
  body: string,
  start: number,
  end: number,
  marker = "**",
): { text: string; start: number; end: number } {
  const text = body ?? "";
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.min(text.length, Math.max(start, end));
  const before = text.slice(0, from);
  const inside = text.slice(from, to);
  const after = text.slice(to);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text: `${before.slice(0, -marker.length)}${inside}${after.slice(marker.length)}`,
      start: from - marker.length,
      end: to - marker.length,
    };
  }
  return { text: `${before}${marker}${inside}${marker}${after}`, start: from + marker.length, end: to + marker.length };
}

// ─── Нотатка → задача ─────────────────────────────────────────────────────────

export type NoteDraftPriority = 0 | 1 | 2 | 3 | 4 | 5 | null;

export interface NoteToTaskOptions {
  id: string;
  now: string;
  /** undefined — проєкт нотатки; null чи "" — особиста задача. */
  projectId?: string | null;
  /** §3.3 CONTRACT: автор задачі в проєкті. Для особистої ігнорується. */
  createdBy?: string;
  deadline?: string;
  priorityLevel?: NoteDraftPriority;
  /** id підзадачі за її номером; за замовчуванням `${id}-s${n}`. */
  subtaskId?: (index: number) => string;
}

export interface NoteToTaskDraft {
  id: string;
  title: string;
  description?: string;
  status: "active";
  subtasks: { id: string; title: string; done: boolean }[];
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  createdBy?: string;
  deadline?: string;
  priorityLevel?: NoteDraftPriority;
}

/** Рядки тексту без зайвих порожніх: не більше одного підряд, без країв. */
function tidyLines(lines: readonly string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Назва для задачі/зустрічі: назва нотатки, а без неї — перший текстовий
 * рядок тіла (тоді він не дублюється в описі). `skip` — рядки, які назвою
 * бути не можуть (пункти чек-листа чи порядку денного).
 */
function draftTitle(note: NoteInput, skip: (kind: NoteBlockKind) => boolean): { title: string; line: number } {
  const own = stripInline(noteTitle(note)).trim().slice(0, 200);
  if (own) return { title: own, line: -1 };
  const block = parseNoteMarkdown(noteBody(note)).find((item) => item.kind !== "empty" && !skip(item.kind));
  if (!block) return { title: "", line: -1 };
  return { title: taskTitleFromLine(block.text), line: block.line };
}

/**
 * Нотатка → чернетка задачі для листа перетворення: назва з назви, опис — тіло
 * без рядків чек-листа, рядки «- [ ]»/«- [x]» → підзадачі (стан зберігається).
 */
export function noteToTaskDraft(note: NoteInput, opts: NoteToTaskOptions): NoteToTaskDraft {
  const blocks = parseNoteMarkdown(noteBody(note));
  const { title, line: titleLine } = draftTitle(note, (kind) => kind === "todo");
  const subtasks: NoteToTaskDraft["subtasks"] = [];
  for (const block of blocks) {
    if (block.kind !== "todo") continue;
    const text = stripInline(block.text).trim();
    if (!text) continue;
    const index = subtasks.length;
    subtasks.push({ id: opts.subtaskId ? opts.subtaskId(index) : `${opts.id}-s${index + 1}`, title: text, done: block.done === true });
  }
  const lines = noteBody(note).split("\n");
  const description = tidyLines(lines.filter((_, index) => index !== titleLine && blocks[index]?.kind !== "todo"));
  const projectId = opts.projectId === undefined ? asFilled(note.projectId) : asFilled(opts.projectId);

  const draft: NoteToTaskDraft = {
    id: opts.id,
    title,
    status: "active",
    subtasks,
    createdAt: opts.now,
    updatedAt: opts.now,
  };
  if (description) draft.description = description;
  if (projectId) {
    draft.projectId = projectId;
    const author = asFilled(opts.createdBy);
    if (author) draft.createdBy = author;
  }
  const deadline = asFilled(opts.deadline);
  if (deadline) draft.deadline = deadline;
  if (opts.priorityLevel !== undefined) draft.priorityLevel = opts.priorityLevel;
  return draft;
}

// ─── Дата й час із тексту ─────────────────────────────────────────────────────

/** Знайдені в тексті дата й час. `spans` — [початок, кінець) знайдених фраз. */
export interface DateTimePhrase {
  date: string;
  /** null — у тексті є лише дата, без часу. */
  time: string | null;
  spans: [number, number][];
}

const pad2 = (value: number) => String(value).padStart(2, "0");
const ymd = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const asDate = (now: Date | string) => (now instanceof Date ? new Date(now.getTime()) : new Date(now));
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Наступна повна година від `now` (10:20 → 11:00, 10:00 → 11:00, 23:40 → завтра 00:00). */
export function nextFullHour(now: Date | string): { date: string; time: string } {
  const at = asDate(now);
  const next = new Date(at.getFullYear(), at.getMonth(), at.getDate(), at.getHours() + 1, 0, 0, 0);
  return { date: ymd(next), time: `${pad2(next.getHours())}:00` };
}

// Межі слова для кирилиці: `\b` у JS бачить лише латиницю.
const BEFORE = "(^|[^\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";

const RELATIVE_DAYS: [string, number][] = [
  ["післязавтра", 2],
  ["day after tomorrow", 2],
  ["сьогодні", 0],
  ["today", 0],
  ["завтра", 1],
  ["tomorrow", 1],
];

const WEEKDAYS_LONG: [string, number][] = [
  ["понеділ(?:ок|ка)", 1],
  ["вівтор(?:ок|ка)", 2],
  ["серед(?:а|у|и)", 3],
  ["четвер(?:га)?", 4],
  ["п'ятниц(?:я|ю|і)", 5],
  ["субот(?:а|у|и)", 6],
  ["неділ(?:я|ю|і)", 0],
  ["monday", 1],
  ["tuesday", 2],
  ["wednesday", 3],
  ["thursday", 4],
  ["friday", 5],
  ["saturday", 6],
  ["sunday", 0],
];

/** Скорочення беремо лише поруч із часом («пт 14:00»): «sat» чи «ср» самі — надто часто не дата. */
const WEEKDAYS_SHORT: [string, number][] = [
  ["пн", 1],
  ["вт", 2],
  ["ср", 3],
  ["чт", 4],
  ["пт", 5],
  ["сб", 6],
  ["нд", 0],
  ["mon", 1],
  ["tues?", 2],
  ["wed", 3],
  ["thu(?:rs?)?", 4],
  ["fri", 5],
  ["sat", 6],
  ["sun", 0],
];

const MONTHS: [string, number][] = [
  ["січня", 1],
  ["лютого", 2],
  ["березня", 3],
  ["квітня", 4],
  ["травня", 5],
  ["червня", 6],
  ["липня", 7],
  ["серпня", 8],
  ["вересня", 9],
  ["жовтня", 10],
  ["листопада", 11],
  ["грудня", 12],
  ["jan(?:uary)?", 1],
  ["feb(?:ruary)?", 2],
  ["mar(?:ch)?", 3],
  ["apr(?:il)?", 4],
  ["may", 5],
  ["june?", 6],
  ["july?", 7],
  ["aug(?:ust)?", 8],
  ["sep(?:t|tember)?", 9],
  ["oct(?:ober)?", 10],
  ["nov(?:ember)?", 11],
  ["dec(?:ember)?", 12],
];

const alternation = (items: readonly [string, number][]) => items.map(([source]) => `(${source})`).join("|");
const indexOfGroup = (match: RegExpExecArray, first: number, items: readonly [string, number][]) =>
  items.findIndex((_, index) => match[first + index] !== undefined);

interface Found {
  start: number;
  end: number;
}

/** Пошук із «межею слова» спереду: індекс зсувається за захоплений символ-межу. */
function seek(pattern: RegExp, text: string): (Found & { match: RegExpExecArray }) | null {
  const match = pattern.exec(text);
  if (!match) return null;
  const start = match.index + match[1].length;
  return { start, end: match.index + match[0].length, match };
}

const TIME_PREFIX = "(?:(?:о|об|в|у|at|@)\\s*)?";
const TIME_CLOCK = new RegExp(`${BEFORE}${TIME_PREFIX}(\\d{1,2}):(\\d{2})(?:\\s*(am|pm|a\\.m\\.|p\\.m\\.))?${AFTER}`, "u");
const TIME_MERIDIEM = new RegExp(`${BEFORE}${TIME_PREFIX}(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)(?![\\p{L}\\p{N}])`, "u");
const TIME_BARE = new RegExp(`${BEFORE}(?:о|об|at)\\s+(\\d{1,2})(?![\\d.:/])${AFTER}`, "u");

function findTime(text: string): (Found & { hours: number; minutes: number }) | null {
  const toHours = (hours: number, meridiem: string | undefined) => {
    if (!meridiem) return hours;
    if (hours < 1 || hours > 12) return -1;
    const pm = meridiem.startsWith("p");
    return (hours % 12) + (pm ? 12 : 0);
  };
  const clock = seek(TIME_CLOCK, text);
  if (clock) {
    const hours = toHours(Number(clock.match[2]), clock.match[4]);
    const minutes = Number(clock.match[3]);
    if (hours >= 0 && hours <= 23 && minutes <= 59) return { start: clock.start, end: clock.end, hours, minutes };
  }
  const meridiem = seek(TIME_MERIDIEM, text);
  if (meridiem) {
    const hours = toHours(Number(meridiem.match[2]), meridiem.match[3]);
    if (hours >= 0 && hours <= 23) return { start: meridiem.start, end: meridiem.end, hours, minutes: 0 };
  }
  const bare = seek(TIME_BARE, text);
  if (bare) {
    const hours = Number(bare.match[2]);
    if (hours <= 23) return { start: bare.start, end: bare.end, hours, minutes: 0 };
  }
  return null;
}

const DAY_PREFIX = "(?:(?:в|у|на|on|next|наступн(?:ий|ого|у|ої|а))\\s+)?";
const RELATIVE_RE = new RegExp(`${BEFORE}(?:${alternation(RELATIVE_DAYS)})${AFTER}`, "u");
const WEEKDAY_LONG_RE = new RegExp(`${BEFORE}${DAY_PREFIX}(?:${alternation(WEEKDAYS_LONG)})${AFTER}`, "u");
const WEEKDAY_SHORT_RE = new RegExp(
  `${BEFORE}(?:${alternation(WEEKDAYS_SHORT)})\\.?${AFTER}(?=,?\\s*(?:(?:о|об|at|в|у)\\s*)?\\d{1,2}(?::\\d{2}|\\s*(?:am|pm)))`,
  "u",
);
const NUMERIC_DATE_RE = new RegExp(`${BEFORE}(\\d{1,2})[./](\\d{2})(?:[./](\\d{4}|\\d{2}))?(?![\\d:]|[./]\\d)`, "u");
const DAY_MONTH_RE = new RegExp(`${BEFORE}(\\d{1,2})(?:-?(?:го|st|nd|rd|th))?\\s+(?:${alternation(MONTHS)})${AFTER}`, "u");
const MONTH_DAY_RE = new RegExp(`${BEFORE}(?:${alternation(MONTHS)})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?${AFTER}`, "u");

type DateHit = Found & ({ kind: "offset"; days: number } | { kind: "weekday"; day: number } | { kind: "calendar"; month: number; day: number; year?: number });

function findDate(text: string): DateHit | null {
  const hits: DateHit[] = [];
  const relative = seek(RELATIVE_RE, text);
  if (relative) {
    const index = indexOfGroup(relative.match, 2, RELATIVE_DAYS);
    hits.push({ start: relative.start, end: relative.end, kind: "offset", days: RELATIVE_DAYS[index][1] });
  }
  const long = seek(WEEKDAY_LONG_RE, text);
  if (long) {
    const index = indexOfGroup(long.match, 2, WEEKDAYS_LONG);
    hits.push({ start: long.start, end: long.end, kind: "weekday", day: WEEKDAYS_LONG[index][1] });
  }
  const short = seek(WEEKDAY_SHORT_RE, text);
  if (short) {
    const index = indexOfGroup(short.match, 2, WEEKDAYS_SHORT);
    hits.push({ start: short.start, end: short.end, kind: "weekday", day: WEEKDAYS_SHORT[index][1] });
  }
  const numeric = seek(NUMERIC_DATE_RE, text);
  if (numeric) {
    const raw = numeric.match[4];
    const year = raw === undefined ? undefined : raw.length === 2 ? 2000 + Number(raw) : Number(raw);
    hits.push({ start: numeric.start, end: numeric.end, kind: "calendar", day: Number(numeric.match[2]), month: Number(numeric.match[3]), year });
  }
  const dayMonth = seek(DAY_MONTH_RE, text);
  if (dayMonth) {
    const index = indexOfGroup(dayMonth.match, 3, MONTHS);
    hits.push({ start: dayMonth.start, end: dayMonth.end, kind: "calendar", day: Number(dayMonth.match[2]), month: MONTHS[index][1] });
  }
  const monthDay = seek(MONTH_DAY_RE, text);
  if (monthDay) {
    const index = indexOfGroup(monthDay.match, 2, MONTHS);
    hits.push({ start: monthDay.start, end: monthDay.end, kind: "calendar", day: Number(monthDay.match[2 + MONTHS.length]), month: MONTHS[index][1] });
  }
  hits.sort((a, b) => a.start - b.start);
  return hits[0] ?? null;
}

function validCalendar(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1) return null;
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * Дата й час із вільного тексту, українською чи англійською: «завтра о 15:00»,
 * «сьогодні 9:30», «пт 14:00», «25.10 о 10», «tomorrow 3pm», «25 жовтня»,
 * «Oct 25». Числова дата — «ДД.ММ» з двоцифровим місяцем («1.5 кг» — не дата).
 * Лише час — сьогодні, а якщо він минув — завтра. День тижня —
 * найближчий такий (сьогоднішній, якщо час ще попереду). Дата без року —
 * цього року, а якщо вже минула — наступного. Нічого не знайдено — null.
 */
export function parseDateTimePhrase(text: string, now: Date | string): DateTimePhrase | null {
  const source = (text ?? "").toLowerCase().replace(/[’ʼ‘`]/g, "'");
  const at = asDate(now);
  const today = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const time = findTime(source);
  const dateHit = findDate(source);
  if (!time && !dateHit) return null;
  const nowMinutes = at.getHours() * 60 + at.getMinutes();
  const timeMinutes = time ? time.hours * 60 + time.minutes : null;
  const isAhead = timeMinutes !== null && timeMinutes > nowMinutes;

  let date: Date | null = null;
  if (!dateHit) {
    date = isAhead ? today : addDays(today, 1);
  } else if (dateHit.kind === "offset") {
    date = addDays(today, dateHit.days);
  } else if (dateHit.kind === "weekday") {
    let diff = (dateHit.day - today.getDay() + 7) % 7;
    if (diff === 0 && timeMinutes !== null && !isAhead) diff = 7;
    date = addDays(today, diff);
  } else {
    const year = dateHit.year ?? today.getFullYear();
    date = validCalendar(year, dateHit.month, dateHit.day);
    if (date && dateHit.year === undefined && date < today) date = validCalendar(year + 1, dateHit.month, dateHit.day);
  }
  if (!date) {
    if (!time) return null;
    date = isAhead ? today : addDays(today, 1);
  }

  const spans: [number, number][] = [];
  if (dateHit && (dateHit.kind !== "calendar" || validCalendar(dateHit.year ?? today.getFullYear(), dateHit.month, dateHit.day))) {
    spans.push([dateHit.start, dateHit.end]);
  }
  if (time) spans.push([time.start, time.end]);
  spans.sort((a, b) => a[0] - b[0]);
  return {
    date: ymd(date),
    time: time ? `${pad2(time.hours)}:${pad2(time.minutes)}` : null,
    spans,
  };
}

/** Текст без знайдених фраз: зайві пробіли й розділові знаки на краях зникають. */
function cutSpans(text: string, spans: readonly [number, number][]): string {
  let out = text;
  for (const [start, end] of [...spans].sort((a, b) => b[0] - a[0])) out = `${out.slice(0, start)} ${out.slice(end)}`;
  return out
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:–—-]+|[\s,;:–—-]+$/g, "")
    .trim();
}

// ─── Нотатка → зустріч ────────────────────────────────────────────────────────

export interface NoteToMeetingOptions {
  id: string;
  /** undefined — проєкт нотатки; null чи "" — без проєкту. */
  projectId?: string | null;
  durationMinutes?: number;
  /** id пункту порядку денного за його номером; за замовчуванням `${id}-a${n}`. */
  agendaId?: (index: number) => string;
}

export interface NoteToMeetingDraft {
  id: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  agenda: { id: string; text: string; done: boolean }[];
  notes?: string;
  projectId?: string;
}

/** Час для дати без часу: сьогодні — наступна повна година, інший день — 09:00. */
const DEFAULT_DAY_TIME = "09:00";

/**
 * Нотатка → чернетка зустрічі. Дата й час — із фрази в назві (вона з назви
 * вирізається) або в тексті; інакше наступна повна година. Тривалість — 30 хв.
 * Пункти чек-листа й списку → порядок денний, решта тексту → нотатки зустрічі.
 */
export function noteToMeetingDraft(note: NoteInput, now: Date | string, opts: NoteToMeetingOptions): NoteToMeetingDraft {
  const blocks = parseNoteMarkdown(noteBody(note));
  const isAgenda = (kind: NoteBlockKind) => kind === "todo" || kind === "bullet";
  const picked = draftTitle(note, isAgenda);
  let title = picked.title;

  const fallback = nextFullHour(now);
  let phrase = parseDateTimePhrase(title, now);
  if (phrase) {
    const cut = cutSpans(title, phrase.spans);
    if (cut) title = cut;
  } else {
    phrase = parseDateTimePhrase(noteBody(note), now);
  }
  let date = fallback.date;
  let time = fallback.time;
  if (phrase?.time) {
    date = phrase.date;
    time = phrase.time;
  } else if (phrase && phrase.date !== ymd(asDate(now))) {
    // Лише дата, і не сьогодні: зустріч — на ранок того дня.
    date = phrase.date;
    time = DEFAULT_DAY_TIME;
  }

  const agenda: NoteToMeetingDraft["agenda"] = [];
  for (const block of blocks) {
    if (!isAgenda(block.kind)) continue;
    const text = stripInline(block.text).trim();
    if (!text) continue;
    const index = agenda.length;
    agenda.push({ id: opts.agendaId ? opts.agendaId(index) : `${opts.id}-a${index + 1}`, text, done: block.done === true });
  }
  const lines = noteBody(note).split("\n");
  const notes = tidyLines(lines.filter((_, index) => index !== picked.line && !isAgenda(blocks[index]?.kind ?? "empty")));
  const projectId = opts.projectId === undefined ? asFilled(note.projectId) : asFilled(opts.projectId);
  const duration = opts.durationMinutes && opts.durationMinutes > 0 ? Math.round(opts.durationMinutes) : 30;

  const draft: NoteToMeetingDraft = { id: opts.id, title, date, time, durationMinutes: duration, agenda };
  if (notes) draft.notes = notes;
  if (projectId) draft.projectId = projectId;
  return draft;
}
