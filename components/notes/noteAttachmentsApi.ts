/**
 * components/notes/noteAttachmentsApi.ts — файли нотатки на сервері.
 *
 * Байти живуть на сервері (`/api/notes/<id>/attachments/`, модель
 * NoteAttachment, ті самі ліміти, що в медіа зустрічей: 25 МБ на файл), а
 * в самій нотатці — лише метадані `attachments: [{id,name,size,type}]`, що
 * синхронізуються разом із текстом.
 *
 * Сервер приймає файл лише для ВЖЕ синхронізованої нотатки (інакше 404).
 * Свіжа нотатка доїжджає за секунди, тож вивантаження кілька разів повторює
 * спробу з паузою, перш ніж сказати людині «ще синхронізується».
 *
 * Нативні модулі (picker, manipulator, file-system, sharing) — ліниві: у збірці
 * без них людина отримує зрозумілу помилку, а не червоний екран.
 */
import { ApiError, apiFetch, OfflineError } from '@/store/api';
import { isOnlineMode } from '@/store/app-mode';
import { loadData, saveData } from '@/store/storage';
import type { NoteAttachmentMeta } from '@/utils/notes';

export const NOTE_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
/** Найдовша сторона фото після стиснення. */
const PHOTO_MAX_SIDE = 2048;

export interface ServerNoteAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  createdAt?: string;
}

export interface LocalAttachmentFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export class AttachmentTooLargeError extends Error {
  constructor() { super('attachment-too-large'); this.name = 'AttachmentTooLargeError'; }
}
export class AttachmentQuotaError extends Error {
  constructor() { super('attachment-quota'); this.name = 'AttachmentQuotaError'; }
}
export class AttachmentNotSyncedError extends Error {
  constructor() { super('attachment-note-not-synced'); this.name = 'AttachmentNotSyncedError'; }
}

type NoteRef = { id: string; projectId?: string };

function attachmentsPath(note: NoteRef, attachmentId?: string): string {
  const base = `/notes/${encodeURIComponent(note.id)}/attachments/${attachmentId ? `${encodeURIComponent(attachmentId)}/` : ''}`;
  return note.projectId ? `${base}?projectId=${encodeURIComponent(note.projectId)}` : base;
}

export function toAttachmentMeta(row: ServerNoteAttachment): NoteAttachmentMeta {
  return { id: row.id, name: row.name, size: row.size, type: row.contentType || 'application/octet-stream' };
}

export function attachmentsAvailable(): boolean {
  return isOnlineMode();
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Вивантажити файл. На 404 (нотатка ще не на сервері) — кілька повторів. */
export async function uploadNoteAttachment(
  note: NoteRef,
  file: LocalAttachmentFile,
  { attempts = 4, delayMs = 2500 }: { attempts?: number; delayMs?: number } = {},
): Promise<ServerNoteAttachment> {
  if (!isOnlineMode()) throw new OfflineError();
  if (file.size !== undefined && file.size > NOTE_ATTACHMENT_MAX_BYTES) throw new AttachmentTooLargeError();
  for (let attempt = 1; ; attempt += 1) {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    try {
      return await apiFetch<ServerNoteAttachment>(attachmentsPath(note), { method: 'POST', body: form });
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.code === 'invalid_size') throw new AttachmentTooLargeError();
      // 413 storage_quota_exceeded — квота людини/проєкту; 400 quota — 100 МБ на нотатку.
      if (error instanceof ApiError && (error.status === 413 || (error.status === 400 && error.code === 'quota'))) throw new AttachmentQuotaError();
      if (error instanceof ApiError && error.status === 404) {
        if (attempt >= attempts) throw new AttachmentNotSyncedError();
        await wait(delayMs);
        continue;
      }
      throw error;
    }
  }
}

export async function deleteNoteAttachment(note: NoteRef, attachmentId: string): Promise<void> {
  try {
    await apiFetch<void>(attachmentsPath(note, attachmentId), { method: 'DELETE' });
  } catch (error) {
    // Файлу вже немає на сервері — для людини мета та сама: прибрати з нотатки.
    if (error instanceof ApiError && error.status === 404) return;
    throw error;
  }
}

/**
 * Видалення нотатки: прибрати її файли з сервера (інакше вони лишаються на
 * «надгробку» синку й назавжди займають квоту). Найкраща спроба — офлайн чи
 * помилка не заважають видалити саму нотатку.
 */
export async function purgeNoteAttachments(note: NoteRef & { attachments?: readonly { id: string }[] }): Promise<void> {
  if (!note.attachments?.length || !isOnlineMode()) return;
  await Promise.all(note.attachments.map(item => deleteNoteAttachment(note, item.id).catch(error => {
    if (__DEV__) console.warn('[notes] attachment purge failed', error);
  })));
}

/** Вміст файлу (base64) — для перегляду фото чи передачі в «Поділитися». */
export async function fetchNoteAttachment(note: NoteRef, attachmentId: string): Promise<ServerNoteAttachment & { content: string }> {
  return apiFetch<ServerNoteAttachment & { content: string }>(attachmentsPath(note, attachmentId));
}

/** Відкрити файл системним «Поділитися / Відкрити в…». */
export async function openNoteAttachment(note: NoteRef, meta: NoteAttachmentMeta): Promise<void> {
  const data = await fetchNoteAttachment(note, meta.id);
  const FS = await import('expo-file-system/legacy');
  const safeName = meta.name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(-80) || 'file';
  const uri = `${FS.cacheDirectory}note-${meta.id}-${safeName}`;
  await FS.writeAsStringAsync(uri, data.content, { encoding: FS.EncodingType.Base64 });
  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) throw new Error('sharing-unavailable');
  await Sharing.shareAsync(uri, { mimeType: data.contentType || meta.type, dialogTitle: meta.name });
}

export type AttachmentSource = 'library' | 'camera' | 'file';

/**
 * Обрати файл. Фото стискаються ДО вивантаження (довша сторона ≤ 2048 px,
 * JPEG 0.8) — оригінал з камери легко важить 5–10 МБ. null — скасовано.
 */
export async function pickNoteAttachment(source: AttachmentSource): Promise<LocalAttachmentFile | null> {
  if (source === 'file') {
    const Picker = await import('expo-document-picker');
    const result = await Picker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return { uri: asset.uri, name: asset.name, type: asset.mimeType || 'application/octet-stream', size: asset.size ?? undefined };
  }
  const Picker = await import('expo-image-picker');
  const permission = source === 'camera'
    ? await Picker.requestCameraPermissionsAsync()
    : await Picker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('permission-denied');
  const options = { mediaTypes: ['images'] as ('images')[], quality: 1, exif: false };
  const result = source === 'camera' ? await Picker.launchCameraAsync(options) : await Picker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const compressed = await compressPhoto(asset.uri, asset.width, asset.height);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return { uri: compressed.uri, name: `Photo-${stamp}.jpg`, type: 'image/jpeg', size: compressed.size };
}

async function compressPhoto(uri: string, width: number, height: number): Promise<{ uri: string; size?: number }> {
  try {
    const Manipulator = await import('expo-image-manipulator');
    const longest = Math.max(width || 0, height || 0);
    const scale = longest > PHOTO_MAX_SIDE ? PHOTO_MAX_SIDE / longest : 1;
    const actions = scale < 1 ? [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }] : [];
    const out = await Manipulator.manipulateAsync(uri, actions, { compress: 0.8, format: Manipulator.SaveFormat.JPEG });
    const FS = await import('expo-file-system/legacy');
    const info = await FS.getInfoAsync(out.uri);
    return { uri: out.uri, size: info.exists ? info.size : undefined };
  } catch (error) {
    // Без маніпулятора (стара збірка) — вивантажуємо оригінал; ліміт усе одно перевірить сервер.
    if (__DEV__) console.warn('[notes] photo compression skipped', error);
    return { uri };
  }
}

// ─── Переміщення файлів разом із нотаткою ────────────────────────────────────
//
// Сервер переносить файли окремим викликом `POST …/attachments/move/` — і лише
// ПІСЛЯ того, як нотатка вже синхронізувалась у новому місці. Тож переміщення
// стає в локальну чергу й повторюється, доки ціль не зʼявиться на сервері.

/** Локальна черга переносу файлів (не синк, не бекап). */
export const NOTE_ATTACHMENT_MOVES_KEY = 'notes_attachment_moves_v1';
const MAX_MOVE_ATTEMPTS = 30;

interface PendingMove {
  noteId: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  attempts: number;
}

async function readMoves(): Promise<PendingMove[]> {
  const raw = await loadData<unknown>(NOTE_ATTACHMENT_MOVES_KEY, []);
  return Array.isArray(raw) ? raw.filter((item): item is PendingMove => !!item && typeof (item as PendingMove).noteId === 'string') : [];
}

export async function queueAttachmentMove(noteId: string, fromProjectId: string | null, toProjectId: string | null): Promise<void> {
  if ((fromProjectId ?? null) === (toProjectId ?? null)) return;
  const moves = await readMoves();
  // Ланцюжок переміщень (А→Б, потім Б→В) зводиться до одного: звідки почали → куди дійшли.
  const previous = moves.find(move => move.noteId === noteId);
  const from = previous ? previous.fromProjectId : fromProjectId;
  const rest = moves.filter(move => move.noteId !== noteId);
  if ((from ?? null) !== (toProjectId ?? null)) rest.push({ noteId, fromProjectId: from, toProjectId, attempts: 0 });
  await saveData(NOTE_ATTACHMENT_MOVES_KEY, rest);
}

let flushing: Promise<void> | null = null;

/** Спробувати всі відкладені переноси. Безпечно викликати будь-коли. */
export function flushAttachmentMoves(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      if (!isOnlineMode()) return;
      const moves = await readMoves();
      if (!moves.length) return;
      const left: PendingMove[] = [];
      for (const move of moves) {
        try {
          await apiFetch(`/notes/${encodeURIComponent(move.noteId)}/attachments/move/`, {
            method: 'POST',
            body: {
              ...(move.fromProjectId ? { fromProjectId: move.fromProjectId } : {}),
              ...(move.toProjectId ? { toProjectId: move.toProjectId } : {}),
            },
          });
        } catch (error) {
          // 404 — ціль ще не синхронізувалась; мережа — пізніше. Інші коди (403,
          // 400 same_scope) повтор не виправить.
          const retryable = !(error instanceof ApiError) || error.status === 404 || error.status === 0 || error.status >= 500 || error.status === 429;
          if (retryable && move.attempts + 1 < MAX_MOVE_ATTEMPTS) left.push({ ...move, attempts: move.attempts + 1 });
        }
      }
      // Черга могла поповнитись під час проходу — зливаємо з новими записами.
      const latest = await readMoves();
      const sig = (move: PendingMove) => `${move.noteId}|${move.fromProjectId ?? ''}|${move.toProjectId ?? ''}`;
      const processed = new Set(moves.map(sig));
      const fresh = latest.filter(move => !processed.has(sig(move)));
      const freshIds = new Set(fresh.map(move => move.noteId));
      await saveData(NOTE_ATTACHMENT_MOVES_KEY, [...left.filter(move => !freshIds.has(move.noteId)), ...fresh]);
    } catch (error) {
      if (__DEV__) console.warn('[notes] attachment move flush failed', error);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
