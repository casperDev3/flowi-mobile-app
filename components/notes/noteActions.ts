/**
 * components/notes/noteActions.ts — запис нотаток і того, що з них народжується.
 *
 * Усе тут іде через ті самі `saveSyncedChanges`, що й екрани задач і зустрічей:
 * запис у сховище + outbox із маршрутизацією потоку (особистий / проєкт за
 * `projectId`, §3.5). Зміна `projectId` нотатки (переміщення) — це звичайна
 * правка поля: synced-storage сам розкладає її на дві мутації (видалення в
 * старому потоці + створення в новому) з тим самим id.
 *
 * Звʼязок «нотатка → задача/зустріч» ставиться ПІСЛЯ того, як задача чи
 * зустріч уже лягла в сховище, і на СВІЖІЙ копії нотатки: між відкриттям листа
 * й «Створити» синк міг переписати нотатку, і патч від старої копії
 * відкотив би чужу правку.
 */
import { flushAttachmentMoves, queueAttachmentMove } from '@/components/notes/noteAttachmentsApi';
import { loadData, loadDataResult } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';
import {
  linkNote,
  moveNote,
  normalizeNotes,
  noteToTaskDraft,
  type Note,
  type NoteDraftPriority,
  type NoteToMeetingDraft,
  type NoteToTaskDraft,
} from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

/** Перший колір форми зустрічі (MeetingFormSheet MEETING_COLORS[0]). */
export const DEFAULT_MEETING_COLOR = '#6366F1';

/** Ключ вибору «Список / Сітка» — локальний, на пристрій (не синк, не бекап). */
export const NOTES_VIEW_MODE_KEY = 'notes_view_mode_v1';
export type NotesViewMode = 'list' | 'grid';

/** Записати нотатку: `prev` null — нова. Повертає свіжу колекцію або null. */
export async function persistNote(prev: Note | null, next: Note): Promise<Note[] | null> {
  const result = await saveSyncedChanges<Note>('notes', prev ? [prev] : [], [next], { checked: true });
  return result ? normalizeNotes(result) : null;
}

export async function deleteNoteRecord(note: Note): Promise<Note[] | null> {
  const result = await saveSyncedChanges<Note>('notes', [note], [], { checked: true });
  return result ? normalizeNotes(result) : null;
}

/** Свіжа копія нотатки зі сховища (null — немає або не прочиталось). */
export async function readNoteById(id: string): Promise<Note | null> {
  const result = await loadDataResult<unknown>('notes', []);
  if (!result.ok || !Array.isArray(result.value)) return null;
  return normalizeNotes(result.value).find(note => note.id === id) ?? null;
}

/**
 * id поточного користувача з кешу сесії — автор проєктної задачі (§3.3).
 * Не `useAuth()`: той тягне expo-router і push, а тут потрібен лише id.
 */
export async function readAuthUserId(): Promise<string | null> {
  const cached = await loadData<{ id?: unknown } | null>('auth_user', null);
  const id = cached && typeof cached === 'object' ? cached.id : undefined;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}

/** Привʼязати нотатку (свіжу копію) до задачі чи зустрічі. */
async function linkFresh(note: Note, link: { taskId?: string; meetingId?: string }): Promise<Note> {
  const fresh = (await readNoteById(note.id)) ?? note;
  const next = linkNote(fresh, link, new Date().toISOString());
  await persistNote(fresh, next);
  return next;
}

export interface TaskFromNoteInput {
  /** null — особиста задача. */
  projectId: string | null;
  title: string;
  deadline?: string;
  priorityLevel?: NoteDraftPriority;
  userId?: string | null;
}

/** Нотатка → задача: задача в сховище, потім звʼязок на нотатці. */
export async function createTaskFromNote(note: Note, input: TaskFromNoteInput): Promise<{ task: NoteToTaskDraft; note: Note }> {
  const now = new Date().toISOString();
  const draft = noteToTaskDraft(note, {
    id: uuidV4(),
    now,
    projectId: input.projectId,
    createdBy: input.userId ?? undefined,
    deadline: input.deadline,
    priorityLevel: input.priorityLevel,
  });
  const task: NoteToTaskDraft = { ...draft, title: input.title.trim() || draft.title };
  await saveSyncedChanges('tasks', [], [task], { checked: true });
  const linked = await linkFresh(note, { taskId: task.id });
  return { task, note: linked };
}

/** Нотатка → зустріч (чернетку готує лист: дата/час/тривалість уже виправлені людиною). */
export async function createMeetingFromNote(note: Note, draft: NoteToMeetingDraft): Promise<{ meetingId: string; note: Note }> {
  const now = new Date().toISOString();
  const meeting = {
    ...draft,
    title: draft.title.trim(),
    color: DEFAULT_MEETING_COLOR,
    agenda: draft.agenda,
    updatedAt: now,
  };
  await saveSyncedChanges('meetings', [], [meeting], { checked: true });
  const linked = await linkFresh(note, { meetingId: draft.id });
  return { meetingId: draft.id, note: linked };
}

/** Перенести нотатку між «Особистими» й проєктом (той самий id). */
export async function moveNoteRecord(note: Note, projectId: string | null): Promise<Note> {
  const fresh = (await readNoteById(note.id)) ?? note;
  const next = moveNote(fresh, projectId, new Date().toISOString());
  await persistNote(fresh, next);
  if (fresh.attachments?.length) {
    // Файли їдуть окремим викликом, коли нотатка вже буде на сервері в новому місці.
    await queueAttachmentMove(fresh.id, fresh.projectId ?? null, next.projectId ?? null);
    setTimeout(() => { void flushAttachmentMoves(); }, 4000);
  }
  return next;
}

/** Куди відкривати задачу/зустріч зі звʼязку нотатки (маршрути, як у pushLink). */
export function linkedHref(kind: 'task' | 'meeting', id: string, projectId?: string): string {
  const target = encodeURIComponent(id);
  if (projectId) {
    const project = encodeURIComponent(projectId);
    return kind === 'task' ? `/project/${project}/tasks?open=${target}` : `/project/${project}/calendar?open=${target}`;
  }
  return kind === 'task' ? `/(tabs)?open=${target}` : `/meetings?open=${target}`;
}

/** Перехід без жорсткої залежності від expo-router (екран живе й у тестах). */
export function navigateTo(href: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- лінивий імпорт: роутер тягне нативні модулі
    const { router } = require('expo-router') as typeof import('expo-router');
    router.push(href as never);
  } catch (error) {
    if (__DEV__) console.warn('[notes] navigation failed', error);
  }
}
