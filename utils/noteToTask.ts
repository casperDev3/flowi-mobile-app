/**
 * utils/noteToTask.ts — «Перетворити на задачу»: нотатка → поля нової задачі.
 *
 * Дзеркало вебового `lib/note-to-task.ts` (ті самі правила й ті самі поля):
 * чиста функція без React і без збереження. Аркуш показує людині ці поля вже
 * заповненими, вона їх править, а записує задачу викликач наявним шляхом
 * (`saveSyncedChanges('tasks', …)`), як і задачу з рядка нотатки.
 *
 * Поля задачі — ЛИШЕ наявні в `Task`: назва, опис, проєкт, статус «active»,
 * порожні підзадачі, мітки часу, автор проєктної задачі (§3.3 CONTRACT).
 * Пріоритет і дедлайн не вигадуємо: у нотатці їх немає.
 */
import { taskTitleFromLine, type Note, type NoteInput } from './notes';
import { projectTaskUrl } from './pushLink';

/** Те, що показує й правити дає аркуш. */
export interface NoteTaskFields {
  title: string;
  description: string;
  /** null — особиста задача (без проєкту). */
  projectId: string | null;
}

/** Довжина назви — та сама стеля, що й у задачі з рядка нотатки. */
export const NOTE_TASK_TITLE_MAX = 200;

export interface NoteTaskRecord {
  id: string;
  title: string;
  description?: string;
  status: 'active';
  subtasks: [];
  createdAt: string;
  updatedAt: string;
  projectId?: string;
  createdBy?: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Текст нотатки з урахуванням легасі-полів старого вебу (як noteBody). */
function bodyOf(note: NoteInput): string {
  return text(note.body) || text(note.content) || text(note.text);
}

/**
 * Поля аркуша з нотатки: назва — назва нотатки (або, якщо її немає, перший
 * непорожній рядок тексту без розмітки), опис — увесь текст нотатки, проєкт —
 * проєкт нотатки.
 */
export function noteTaskFields(note: NoteInput): NoteTaskFields {
  const body = bodyOf(note);
  let title = text(note.title).trim();
  if (!title) {
    const first = body.split('\n').find(line => taskTitleFromLine(line).length > 0) ?? '';
    title = taskTitleFromLine(first);
  }
  return {
    title: title.slice(0, NOTE_TASK_TITLE_MAX),
    description: body.trim(),
    projectId: typeof note.projectId === 'string' && note.projectId ? note.projectId : null,
  };
}

/**
 * Поля аркуша → запис задачі. `null` — назва порожня (зберігати нічого).
 * `userId` ставиться автором (`createdBy`) лише проєктній задачі — §3.3
 * CONTRACT, те саме, що робить задача з рядка нотатки.
 */
export function noteTaskRecord(
  fields: NoteTaskFields,
  at: { id: string; now: string; userId?: string | null },
): NoteTaskRecord | null {
  const title = fields.title.trim().slice(0, NOTE_TASK_TITLE_MAX);
  if (!title) return null;
  const description = fields.description.trim();
  const projectId = fields.projectId || null;
  return {
    id: at.id,
    title,
    ...(description ? { description } : {}),
    status: 'active',
    subtasks: [],
    createdAt: at.now,
    updatedAt: at.now,
    ...(projectId ? { projectId } : {}),
    ...(projectId && at.userId ? { createdBy: String(at.userId) } : {}),
  };
}

/**
 * Що зробити з нотаткою після перетворення: видалити (якщо людина так
 * обрала), зв'язати із задачею (коли зв'язку ще немає) або нічого — як `convertNote`
 * на вебі.
 */
export function noteAfterConversion(
  note: Note,
  taskId: string,
  deleteNote: boolean,
  now: string,
): { action: 'delete' } | { action: 'link'; next: Note } | { action: 'keep' } {
  if (deleteNote) return { action: 'delete' };
  if (note.linkedTaskId) return { action: 'keep' };
  return { action: 'link', next: { ...note, linkedTaskId: taskId, updatedAt: now } };
}

/**
 * Куди вести «Відкрити задачу» — рядок маршруту. Особиста — вкладка
 * «Завдання» з `?open=<id>` (картка в панелі деталей); проєктна — завдання
 * її проєкту (`projectTaskUrl`), бо особистий редактор задачу проєкту не
 * відкриває.
 */
export function noteTaskHref(task: Pick<NoteTaskRecord, 'id' | 'projectId'>): string {
  if (task.projectId) return projectTaskUrl(task.projectId, task.id);
  return `/(tabs)?open=${encodeURIComponent(task.id)}`;
}
