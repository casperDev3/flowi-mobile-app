/**
 * store/note-capture.ts — глобальний запит «швидкий запис нотатки».
 *
 * Хто просить: deep link `ftrackingapp:///notes?capture=1` / `?create=1`
 * (віджет головного екрана, віджет екрана блокування — перехоплює
 * app/+native-intent.tsx), швидка дія іконки застосунку «Нова нотатка»
 * (store/quick-actions.ts) і будь-який екран через `requestNoteCapture()`.
 *
 * Хто показує: `GlobalNoteCapture` у корені (app/_layout.tsx) — один
 * `NoteCaptureSheet` на весь застосунок, поверх поточного екрана, без переходу
 * на повний екран нотаток.
 *
 * Модуль без React і без expo-router: його імпортує +native-intent, який
 * виконується ще до того, як дерево змонтовано. Запит, що прийшов раніше за
 * монтування (холодний старт), лишається висіти, доки хост не підпишеться.
 */

export interface NoteCaptureRequest {
  /** Наростає на кожен запит — хост відрізняє новий запит від уже показаного. */
  seq: number;
  /** Коли попросили (мс) — хост не показує запит, що провисів до входу в акаунт. */
  at: number;
  /** Звʼязок нової нотатки (зазвичай немає — «+ Нотатка» з деталі має власний аркуш). */
  links?: { taskId?: string; meetingId?: string };
}

type Listener = (request: NoteCaptureRequest | null) => void;

let current: NoteCaptureRequest | null = null;
let seq = 0;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(current);
}

/** Відкрити швидкий запис поверх поточного екрана. */
export function requestNoteCapture(links?: NoteCaptureRequest['links']): NoteCaptureRequest {
  seq += 1;
  current = links ? { seq, at: Date.now(), links } : { seq, at: Date.now() };
  emit();
  return current;
}

/** Запит, старший за це, хост мовчки відкидає (людина вже давно не чекає аркуша). */
export const NOTE_CAPTURE_STALE_MS = 2 * 60 * 1000;

/** Поточний (ще не закритий) запит. */
export function pendingNoteCapture(): NoteCaptureRequest | null {
  return current;
}

/** Хост закрив аркуш. `seq` — щоб пізнє закриття старого не прибрало новіший запит. */
export function finishNoteCapture(requestSeq?: number): void {
  if (!current) return;
  if (requestSeq !== undefined && current.seq !== requestSeq) return;
  current = null;
  emit();
}

export function subscribeNoteCapture(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Чи це посилання — «швидкий запис»: шлях `/notes` (будь-яка схема/хост
 * ftrackingapp, з потрійним слешем чи без) з `capture=1` або `create=1`.
 * `?open=` і голий `/notes` — звичайна навігація на екран.
 */
export function isNoteCaptureLink(path: string | null | undefined): boolean {
  if (!path) return false;
  const raw = String(path).trim();
  const qIndex = raw.indexOf('?');
  if (qIndex < 0) return false;
  let pathname = raw.slice(0, qIndex);
  const query = raw.slice(qIndex + 1).split('#')[0];
  // ftrackingapp:///notes, ftrackingapp://notes, /notes, notes, /--/notes (Expo Go).
  pathname = pathname.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '/').replace(/^\/--\//, '/');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length !== 1 || segments[0] !== 'notes') return false;
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    try { params.set(decodeURIComponent(k), decodeURIComponent(v)); } catch { /* битий параметр */ }
  }
  if (params.get('open')) return false;
  return params.get('capture') === '1' || params.get('create') === '1';
}

/** Лише для тестів. */
export function __resetNoteCaptureForTests(): void {
  current = null;
  seq = 0;
  listeners.clear();
}
