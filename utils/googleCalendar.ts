/**
 * utils/googleCalendar.ts — особиста синхронізація зустрічей з Google Calendar
 * (серверний OAuth, /api/integrations/google/…).
 *
 * Лише типи контракту й чисті помічники без мережі (тест —
 * __tests__/google-calendar.test.ts). Запити — components/calendar/
 * useGoogleCalendarSync.ts. Той самий набір живе у вебі
 * (flowi-web-app/lib/google-calendar.ts): однакова відповідь сервера дає
 * однаковий вибір календарів і однакові поля конфлікту.
 */

export type GcalState = 'draft' | 'active' | 'retry' | 'attention' | 'disconnected';

/** Календар, уже обраний у підключенні (статус). */
export interface GcalSelectedCalendar {
  id: string;
  label: string;
  color: string;
  writable: boolean;
  import: boolean;
  export: boolean;
}

export interface GcalConnection {
  id: string;
  state: GcalState | string;
  error_code: string;
  account: string;
  time_zone: string;
  last_success: string | null;
  next_run: string | null;
  export_calendar: string | null;
  import_calendars: string[];
  calendars: GcalSelectedCalendar[];
  conflicts: number;
  needs_setup: boolean;
}

export interface GcalStatus {
  configured: boolean;
  connected: boolean;
  connection: GcalConnection | null;
}

/** Живий перелік календарів із Google. */
export interface GcalCalendar {
  id: string;
  label: string;
  primary?: boolean;
  writable: boolean;
  color?: string;
  timeZone?: string;
  import: boolean;
  export: boolean;
}

export interface GcalCalendarsResponse {
  calendars: GcalCalendar[];
  export_calendar: string | null;
  import_calendars: string[];
}

export interface GcalConflictSide {
  title?: string | null;
  date?: string | null;
  time?: string | null;
  durationMinutes?: number | null;
  allDay?: boolean | null;
  location?: string | null;
  description?: string | null;
  recurrence?: unknown;
  cancelled?: boolean | null;
}

export interface GcalConflict {
  id: string;
  meeting_id: string | null;
  title: string | null;
  calendar_id: string;
  calendar_label: string;
  fields: string[];
  local: GcalConflictSide | null;
  remote: GcalConflictSide | null;
  detected_at: string | null;
}

export interface GcalSelection {
  import: string[];
  export: string | null;
}

export const GCAL_MAX_CALENDARS = 20;

/**
 * Куди сервер повертає після Google. openAuthSessionAsync чекає саме на цю
 * адресу; якщо система все ж відкриє її як посилання — app/integrations/google.tsx.
 */
export const GCAL_RETURN_URL = 'ftrackingapp://integrations/google';

/** Ключ підпису поля конфлікту: start/end зливаються в один «Час». */
export type GcalConflictField = 'title' | 'time' | 'description' | 'location' | 'recurrence' | 'cancelled';

const FIELD_MAP: Record<string, GcalConflictField> = {
  title: 'title',
  start: 'time',
  end: 'time',
  description: 'description',
  location: 'location',
  externalRecurrence: 'recurrence',
  cancelled: 'cancelled',
};

/** Поля сервера → унікальні ключі підписів у стабільному порядку. */
export function conflictFieldKeys(fields: readonly string[]): GcalConflictField[] {
  const out: GcalConflictField[] = [];
  for (const f of fields) {
    const key = FIELD_MAP[f];
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Значення одного поля сторони конфлікту як короткий текст. */
export function conflictValue(
  side: GcalConflictSide | null | undefined,
  field: GcalConflictField,
  words: { yes: string; no: string; allDay: string; minutes: string; empty: string } = {
    yes: 'Так', no: 'Ні', allDay: 'увесь день', minutes: '{n} хв', empty: '—',
  },
): string {
  if (!side) return words.empty;
  switch (field) {
    case 'title': return side.title?.trim() || words.empty;
    case 'description': return side.description?.trim() || words.empty;
    case 'location': return side.location?.trim() || words.empty;
    case 'cancelled': return side.cancelled ? words.yes : words.no;
    case 'recurrence': return side.recurrence ? words.yes : words.no;
    case 'time': {
      if (!side.date) return words.empty;
      if (side.allDay) return `${side.date} · ${words.allDay}`;
      const dur = typeof side.durationMinutes === 'number' ? ` · ${words.minutes.replace('{n}', String(side.durationMinutes))}` : '';
      return `${side.date}${side.time ? ` ${side.time}` : ''}${dur}`;
    }
  }
}

/** Початковий вибір із живого переліку. */
export function selectionFromCalendars(res: Pick<GcalCalendarsResponse, 'calendars' | 'export_calendar' | 'import_calendars'>): GcalSelection {
  const ids = new Set(res.calendars.map((c) => c.id));
  const imported = (res.import_calendars ?? []).filter((id) => ids.has(id));
  const exp = res.export_calendar && ids.has(res.export_calendar) ? res.export_calendar : null;
  if (imported.length === 0 && !exp) {
    // Перше налаштування: основний календар — і джерело, і ціль.
    const primary = res.calendars.find((c) => c.primary) ?? null;
    if (primary) return { import: [primary.id], export: primary.writable ? primary.id : null };
  }
  return { import: exp && !imported.includes(exp) ? [...imported, exp] : imported, export: exp };
}

/** Перемкнути імпорт календаря. Зняти імпорт із цілі експорту = зняти й експорт. */
export function toggleImportCalendar(sel: GcalSelection, id: string): GcalSelection {
  if (sel.import.includes(id)) {
    return { import: sel.import.filter((x) => x !== id), export: sel.export === id ? null : sel.export };
  }
  if (sel.import.length >= GCAL_MAX_CALENDARS) return sel;
  return { import: [...sel.import, id], export: sel.export };
}

/** Обрати ціль експорту (лише записуваний); вона автоматично імпортується. */
export function setExportCalendar(sel: GcalSelection, id: string | null, calendars?: readonly Pick<GcalCalendar, 'id' | 'writable'>[]): GcalSelection {
  if (id === null) return { ...sel, export: null };
  if (calendars && !calendars.find((c) => c.id === id)?.writable) return sel;
  if (!sel.import.includes(id) && sel.import.length >= GCAL_MAX_CALENDARS) return sel;
  return { import: sel.import.includes(id) ? sel.import : [...sel.import, id], export: id };
}

export function sameSelection(a: GcalSelection, b: GcalSelection): boolean {
  return a.export === b.export && a.import.length === b.import.length && a.import.every((id) => b.import.includes(id));
}

export type GcalReturn = { result: 'connected' | 'cancelled' | 'error'; code: string };

/** `?gcal=connected|cancelled|error&code=…` після повернення з Google. */
export function parseGcalReturn(search: string | URLSearchParams | null | undefined): GcalReturn | null {
  if (!search) return null;
  let params: URLSearchParams;
  if (typeof search === 'string') {
    const q = search.includes('?') ? search.slice(search.indexOf('?') + 1) : search;
    params = new URLSearchParams(q.split('#')[0]);
  } else params = search;
  const value = params.get('gcal');
  if (value !== 'connected' && value !== 'cancelled' && value !== 'error') return null;
  return { result: value, code: params.get('code') ?? '' };
}

/** Потрібен повторний вхід у Google (кнопка «Підключити Google» знову). */
export function needsReconnect(status: GcalStatus | null | undefined): boolean {
  const c = status?.connection;
  return !c || c.error_code === 'reauth_required' || c.state === 'disconnected';
}

/** Чи має сенс автоматичний «sync now» при відкритті календаря. */
export function canAutoSync(status: GcalStatus | null | undefined): boolean {
  const c = status?.connection;
  return !!c && !c.needs_setup && c.state !== 'draft' && c.state !== 'disconnected' && c.error_code !== 'reauth_required';
}

type TrashFields = {
  deletedAt?: string | null;
  deletedSource?: string | null;
  integrationCancelled?: boolean;
  cancelled?: boolean;
};

/** Зустріч у кошику (видалена в Google або у Flowi) — у календарі не показується. */
export function isTrashedMeeting(m: TrashFields): boolean {
  return Boolean(m.deletedAt) || m.integrationCancelled === true;
}

/** Відновлення через звичайний синк: прибрати позначки кошика, решту зберегти. */
export function restoredMeeting<T extends TrashFields>(m: T): T {
  const next = { ...m, integrationCancelled: false, cancelled: false } as T & TrashFields;
  delete next.deletedAt;
  delete next.deletedSource;
  return next;
}
