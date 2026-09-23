/**
 * utils/meetings.ts — нарада як дані і її таймер.
 *
 * Тип Meeting жив двома копіями: в app/meetings.tsx і в app/(tabs)/index.tsx.
 * Поки в наради були лише назва й час, копії ще сходились; тепер у неї є
 * власні timeEntries, і розбіжність коштувала б даних: екран, чий тип не знає
 * про поле, спокійно пише масив нарад назад у сховище — і сесії, дописані
 * таймером, зникають при першому ж редагуванні з іншого екрана. Тип тут один
 * саме тому.
 *
 * Облік часу наради навмисно ТОЙ САМИЙ, що в завдання:
 *   active_timers        — сесія, що ТРИВАЄ;
 *   meeting.timeEntries  — сесії, що ЗАВЕРШИЛИСЬ (endedAt є завжди).
 * Тому арифметику підсумків рахує utils/taskTimer.ts, а не власна копія
 * reduce: два незалежні підрахунки того самого рано чи пізно розходяться на
 * трактуванні відкритого запису зі старих даних.
 */

// Форму правила повтору задає сама форма наради — вона ж єдина його створює.
// Копія тут була б третьою по рахунку і першою, яка тихо відстане.
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';

import { type ActiveTimer } from './activeTimers';
import { totalTrackedSeconds, type TimeEntry } from './taskTimer';

export interface Meeting {
  id: string;
  title: string;
  date: string;          // 'YYYY-MM-DD'
  time: string;          // 'HH:MM'
  durationMinutes: number;
  location?: string;
  link?: string;
  notes?: string;
  color: string;
  recurrence?: RecurrenceRule;
  /** Google Calendar event ID — за ним імпорт впізнає вже завантажене. */
  gcalId?: string;
  /** Локальні URI аудіозаписів. */
  recordings?: string[];
  /**
   * Завершені сесії таймера. Форма — як у завдання (utils/taskTimer.ts):
   * підсумки, історія і формат тривалості спільні, і власна структура тут
   * означала б другу гілку в кожному місці, де час просто додають.
   */
  timeEntries?: TimeEntry[];
  /**
   * Проєкт усієї зустрічі (для повторів — рівень серії: лежить лише на
   * оригіналі, екземпляри успадковують спредом). Відсутній — без проєкту.
   * Невідомий id показується як «без проєкту»; видалення проєкту зустрічі
   * НЕ переписує (CONTRACT §C.1).
   */
  projectId?: string;
  /** Лише в памʼяті: позначка розгорнутого екземпляра повтору. */
  _origId?: string;
  /** Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
}

/** Префікс local_id таймера наради. Публічний, бо за ним читають чужі записи. */
export const MEETING_TIMER_PREFIX = 'meeting:';

/**
 * id таймера наради ПОХІДНИЙ від id наради, а не випадковий.
 *
 * Причина та сама, що в taskTimerId: та сама нарада, запущена з телефона й з
 * браузера, мусить зійтися в ОДИН запис за LWW. З випадковими id вийшло б два
 * паралельні таймери на одну нараду, і зупинка одного лишила б другий вічно
 * активним — прибрати його було б нічим, бо жоден екран його вже не показує
 * як «мій».
 */
export function meetingTimerId(meetingId: string): string {
  return `${MEETING_TIMER_PREFIX}${meetingId}`;
}

/**
 * Чи це таймер наради.
 *
 * Питаємо поле meetingId, а не розбираємо id: id — ключ синхронізації, і код,
 * який вміє його читати по літерах, назавжди прив'язує формат ключа до UI.
 */
export function isMeetingTimer(timer: ActiveTimer): boolean {
  return Boolean(timer.meetingId);
}

export function findTimerForMeeting(
  timers: ActiveTimer[],
  meetingId: string,
): ActiveTimer | undefined {
  return timers.find(timer => timer.meetingId === meetingId);
}

/**
 * Запис реєстру для наради.
 *
 * Колонки дошки в наради немає, тож restoreColumn тут не буває взагалі — і
 * саме тому стоп наради коротший за стоп завдання рівно на цей крок.
 */
export function buildMeetingTimer(
  meeting: Pick<Meeting, 'id' | 'title'> & { projectId?: string },
  now: Date = new Date(),
): ActiveTimer {
  return {
    id: meetingTimerId(meeting.id),
    meetingId: meeting.id,
    label: meeting.title,
    startedAt: now.toISOString(),
    // Сесія проєктної наради рахується за проєктом, а не як «Особисте».
    ...(meeting.projectId ? { projectId: meeting.projectId } : {}),
  };
}

/**
 * Нарада із дописаною завершеною сесією.
 *
 * `duration` приходить ззовні, а не рахується тут удруге: те саме число йде в
 * дзеркало 'time_entries', і два незалежні підрахунки розійшлися б на секунду
 * рівно тоді, коли між ними встиг проскочити тік годинника.
 *
 * id сесії детермінований (`<id таймера>-<мс кінця>`), як і в завдання: якщо
 * стоп якимось чином прилетить двічі, другий запис перекриє перший, а не
 * подвоїть час.
 */
export function closeMeetingSession<T extends { timeEntries?: TimeEntry[] }>(
  meeting: T,
  timer: ActiveTimer,
  endedAt: Date,
  duration: number,
): T {
  return {
    ...meeting,
    timeEntries: [
      ...(meeting.timeEntries ?? []),
      {
        id: `${timer.id}-${endedAt.getTime().toString(36)}`,
        startedAt: timer.startedAt,
        endedAt: endedAt.toISOString(),
        duration,
      },
    ],
  };
}

/** Увесь протрекований час наради, секунди. Лише завершені сесії. */
export function meetingTrackedSeconds(meeting: { timeEntries?: TimeEntry[] }): number {
  return totalTrackedSeconds(meeting);
}

/**
 * Оригінал для розгорнутого екземпляра повтору.
 *
 * Копії повторів (`_origId`) існують лише в памʼяті: редагування, видалення,
 * запис і таймер мусять адресувати запис, що лежить у сховищі. Якщо оригінал
 * уже зник (видалили з іншого пристрою), повертаємо сам екземпляр — показати
 * його краще, ніж упасти; а зберігати його ніхто не повинен.
 */
export function resolveOriginalMeeting<T extends Pick<Meeting, 'id' | '_origId'>>(
  instance: T,
  meetings: readonly T[],
): T {
  if (!instance._origId) return instance;
  return meetings.find(m => m.id === instance._origId) ?? instance;
}

/**
 * Який екземпляр відкрити за `?open=<id>` (deep link `ftrackingapp://meeting/{id}`,
 * тап по сповіщенню). Точний збіг id — він і є; інакше це id повторюваної
 * наради: беремо найближчий екземпляр від `todayStr` (включно), а коли всі в
 * минулому — останній. `null` — такої наради в розгорнутому списку немає.
 */
export function pickMeetingInstanceToOpen<T extends Pick<Meeting, 'id' | '_origId' | 'date'>>(
  expanded: readonly T[],
  id: string,
  todayStr: string,
): T | null {
  if (!id) return null;
  const exact = expanded.find(m => m.id === id);
  if (exact) return exact;
  const instances = expanded.filter(m => m._origId === id).sort((a, b) => a.date.localeCompare(b.date));
  if (!instances.length) return null;
  return instances.find(m => m.date >= todayStr) ?? instances[instances.length - 1];
}

/**
 * Дописує аудіозапис до зустрічі з ТОЧНИМ id оригіналу.
 *
 * id не розбирається: у імпортованих з Google Calendar зустрічей він сам має
 * підкреслення (`gcal_<eventId>`), і `split('_')[0]` давав би 'gcal' — запис
 * мовчки губився. Невідомий id → масив без змін.
 */
export function withMeetingRecording<T extends Pick<Meeting, 'id' | 'recordings'>>(
  meetings: readonly T[],
  meetingId: string,
  uri: string,
): T[] {
  return meetings.map(m => (m.id === meetingId
    ? { ...m, recordings: [...(m.recordings ?? []), uri] }
    : m));
}

// ─── Розгортання повторів ────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Скільки кроків (екземплярів; для тижневої з днями — тижнів) видно ДО `fromDate` — як завжди було. */
const RECURRENCE_STEP_CAP = 500;
const RECURRENCE_WEEK_CAP = 300;
/** Запобіжник від зациклення (битий запис), незалежний від вікна. */
const RECURRENCE_HARD_GUARD = 100_000;
const DAY_MS = 86_400_000;

/** Різниця в календарних днях між двома локальними північчю (DST-стійко). */
function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Екземпляри повторюваної зустрічі до `toDate` (перенесено з app/meetings.tsx).
 * Звичайна зустріч повертається як є.
 *
 * Екземпляр — `{ ...meeting, id: `${id}_${YYYY-MM-DD}`, date, _origId }`,
 * існує лише в памʼяті; зберігати його НЕ можна (див. resolveOriginalMeeting).
 * Місячний крок — setMonth без обрізання (31 січня → 3 березня), як і на вебі.
 *
 * Вікно: екземпляри з датою >= доби `fromDate` рахуються окремим лімітом
 * (500 кроків; 300 тижнів для тижневої з днями), тож давня серія (щоденний
 * стендап від 2019-го) все одно доходить до сьогодні — як веб
 * lib/meeting-schedule.ts. Екземпляри ДО `fromDate` лишаються як були
 * (перші 500 кроків / 300 тижнів від старту серії — фільтр за датою роблять
 * виклики), далі курсор перескакує до вікна без проміжних копій.
 * Інтервал < 1 чи не число трактується як 1 (як на вебі) — інакше цикл без
 * поступу.
 */
export function expandRecurring(meeting: Meeting, fromDate: Date, toDate: Date): Meeting[] {
  if (!meeting.recurrence) return [meeting];
  const { freq, daysOfWeek, until } = meeting.recurrence;
  const interval = Math.max(1, Math.floor(Number(meeting.recurrence.interval)) || 1);
  const instances: Meeting[] = [];
  const start = new Date(meeting.date + 'T00:00');
  if (Number.isNaN(start.getTime())) return instances;
  const limitTs = until
    ? Math.min(new Date(until + 'T00:00').getTime(), toDate.getTime())
    : toDate.getTime();
  const limit = new Date(limitTs);
  const fromDay = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
  const push = (d: Date) => {
    const dateStr = toDateStr(d);
    instances.push({ ...meeting, id: `${meeting.id}_${dateStr}`, date: dateStr, _origId: meeting.id });
  };

  if (freq === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    const days = [...daysOfWeek].sort((a, b) => a - b);
    const stepDays = interval * 7;
    // align cursor to Monday of the week containing `start`
    const dow0 = start.getDay();
    const daysBack = dow0 === 0 ? 6 : dow0 - 1;
    let weekCursor = addDays(start, -daysBack);
    let steps = 0;      // тижні від старту серії (до перескоку)
    let inWindow = 0;   // тижні, що зачіпають вікно
    let guard = 0;
    while (weekCursor <= limit && inWindow < RECURRENCE_WEEK_CAP && guard++ < RECURRENCE_HARD_GUARD) {
      const touchesWindow = addDays(weekCursor, 6) >= fromDay;
      if (!touchesWindow && steps >= RECURRENCE_WEEK_CAP) {
        // Понеділок тижня з fromDay мінус ціла кількість інтервалів.
        const k = Math.floor(dayDiff(weekCursor, fromDay) / stepDays);
        if (k > 0) { weekCursor = addDays(weekCursor, k * stepDays); continue; }
      }
      const early = steps < RECURRENCE_WEEK_CAP;
      for (const dayIdx of days) {
        const candidate = addDays(weekCursor, dayIdx);
        if (candidate >= start && candidate <= limit && (early || candidate >= fromDay)) push(candidate);
      }
      if (touchesWindow) inWindow++;
      steps++;
      weekCursor = addDays(weekCursor, stepDays);
    }
  } else {
    let current = new Date(start);
    let steps = 0;
    let inWindow = 0;
    let guard = 0;
    while (current <= limit && inWindow < RECURRENCE_STEP_CAP && guard++ < RECURRENCE_HARD_GUARD) {
      const isInWindow = current >= fromDay;
      if (!isInWindow && steps >= RECURRENCE_STEP_CAP && (freq === 'daily' || freq === 'weekly')) {
        const stepDays = freq === 'weekly' ? interval * 7 : interval;
        const k = Math.floor(dayDiff(current, fromDay) / stepDays);
        if (k > 0) { current = addDays(current, k * stepDays); continue; }
      }
      if (isInWindow) { push(current); inWindow++; }
      else if (steps < RECURRENCE_STEP_CAP) push(current);
      steps++;
      switch (freq) {
        case 'daily':   current = addDays(current, interval); break;
        case 'weekly':  current = addDays(current, interval * 7); break;
        case 'monthly': { const n = new Date(current); n.setMonth(n.getMonth() + interval); current = n; break; }
        case 'yearly':  { const n = new Date(current); n.setFullYear(n.getFullYear() + interval); current = n; break; }
        default: return instances;
      }
    }
  }
  return instances;
}

/** Усі зустрічі з розгорнутими повторами. Звичайні — як є, без фільтра за датою. */
export function expandMeetings(meetings: Meeting[], from: Date, to: Date): Meeting[] {
  const result: Meeting[] = [];
  for (const m of meetings) {
    if (!m.recurrence) result.push(m);
    else for (const inst of expandRecurring(m, from, to)) result.push(inst);
  }
  return result;
}

/** Зустрічі одного дня (локальна дата), РАЗОМ з екземплярами повторів. */
export function meetingsOnDate(meetings: Meeting[], day: Date): Meeting[] {
  const key = toDateStr(day);
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  const result: Meeting[] = [];
  for (const m of meetings) {
    if (!m.recurrence) {
      if (m.date === key) result.push(m);
      continue;
    }
    for (const inst of expandRecurring(m, from, to)) {
      if (inst.date === key) result.push(inst);
    }
  }
  return result;
}

// ─── «Зустрічі сьогодні» ─────────────────────────────────────────────────────

export type TodayMeetingPhase = 'current' | 'upcoming' | 'past';

/** Скільки зустрічей видно до «Показати всі (N)». */
export const TODAY_MEETINGS_PREVIEW = 4;

function meetingStart(m: Pick<Meeting, 'date' | 'time'>): Date {
  const [y, mo, d] = m.date.split('-').map(Number);
  const match = /^(\d{1,2}):(\d{2})$/.exec(m.time ?? '');
  const h = match ? Number(match[1]) : 0;
  const min = match ? Number(match[2]) : 0;
  return new Date(y, (mo || 1) - 1, d || 1, h, min, 0, 0);
}

/**
 * Порядок секції зустрічей (CONTRACT §C.3): поточні й майбутні за часом
 * початку, потім минулі (теж за початком). `'--:--'`/порожній час → 00:00.
 * past ⇔ кінець <= now; current ⇔ початок <= now < кінець; інакше upcoming.
 */
export function orderTodayMeetings(
  instances: Meeting[],
  now: Date,
): { meeting: Meeting; phase: TodayMeetingPhase }[] {
  const nowTs = now.getTime();
  const rows = instances.map(meeting => {
    const start = meetingStart(meeting).getTime();
    const dur = Number.isFinite(meeting.durationMinutes) ? Math.max(0, meeting.durationMinutes) : 0;
    const end = start + dur * 60000;
    const phase: TodayMeetingPhase = end <= nowTs ? 'past' : start <= nowTs ? 'current' : 'upcoming';
    return { meeting, phase, start };
  });
  const cmp = (a: typeof rows[number], b: typeof rows[number]) =>
    a.start - b.start
    || a.meeting.title.localeCompare(b.meeting.title, 'uk')
    || (a.meeting.id < b.meeting.id ? -1 : a.meeting.id > b.meeting.id ? 1 : 0);
  const live = rows.filter(r => r.phase !== 'past').sort(cmp);
  const past = rows.filter(r => r.phase === 'past').sort(cmp);
  return [...live, ...past].map(({ meeting, phase }) => ({ meeting, phase }));
}

// ─── Зустріч → проєкт ────────────────────────────────────────────────────────

/**
 * Зустріч із проставленим/знятим проєктом. Порожній id ключ саме ВИДАЛЯЄ
 * (як clearTaskSprint): undefined зник би при JSON випадково, а порожній рядок
 * доїхав би на інший пристрій як «проєкт із id ''». Незмінний проєкт — той
 * самий обʼєкт, щоб зайва правка не будила синк.
 */
export function withMeetingProject<T extends { projectId?: string }>(
  meeting: T,
  projectId: string | null | undefined,
): T {
  if (projectId) {
    return meeting.projectId === projectId ? meeting : { ...meeting, projectId };
  }
  if (!('projectId' in meeting)) return meeting;
  const { projectId: _removed, ...rest } = meeting;
  void _removed;
  return rest as T;
}

/** Проєкт зустрічі, або null — без проєкту чи висяче посилання. */
export function meetingProject<P extends { id: string }>(
  meeting: Pick<Meeting, 'projectId'>,
  projects: readonly P[],
): P | null {
  if (!meeting.projectId) return null;
  return projects.find(project => project.id === meeting.projectId) ?? null;
}

export interface ProjectMeetingOccurrence {
  /** ОРИГІНАЛ (не екземпляр) — редагування/таймер адресують його. */
  meeting: Meeting;
  /** Дата найближчого екземпляра, 'YYYY-MM-DD'. */
  date: string;
  time: string;
}

export interface ProjectMeetingSections {
  upcoming: ProjectMeetingOccurrence[];
  past: Meeting[];
}

const PROJECT_MEETING_LOOKAHEAD_DAYS = 365;

/** 'YYYY-MM-DD' → локальна північ, або null (як веб parseDateKey). */
function parseDateKey(key: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function meetingEndTs(m: Pick<Meeting, 'date' | 'time' | 'durationMinutes'>): number {
  const dur = Number.isFinite(m.durationMinutes) ? Math.max(0, m.durationMinutes) : 0;
  return meetingStart(m).getTime() + dur * 60000;
}

/**
 * Секція «Зустрічі» деталі проєкту (CONTRACT §I G3, дзеркало веба).
 *
 * upcoming — для кожної зустрічі проєкту її найближчий екземпляр, що ще не
 * закінчився (end > now); повтори розгортаються від max(сьогодні, старт серії)
 * на +365 днів (серія, що стартує пізніше ніж за рік, теж потрапляє сюди).
 * Порядок — дата+час за зростанням (далі назва, id).
 * past — звичайні зустрічі, що вже закінчились, і серії без жодного
 * майбутнього екземпляра; порядок — дата (потім час) за спаданням.
 * Екземпляри повторів сюди не потрапляють — лише оригінали.
 */
export function projectMeetingSections(
  meetings: readonly Meeting[],
  projectId: string,
  now: Date,
): ProjectMeetingSections {
  const nowTs = now.getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const upcoming: (ProjectMeetingOccurrence & { start: number })[] = [];
  const past: Meeting[] = [];
  for (const meeting of meetings) {
    if (!projectId || meeting.projectId !== projectId || meeting._origId) continue;
    // Битої дати веб не показує ні там, ні там — так само тут.
    const seriesStart = parseDateKey(meeting.date);
    if (!seriesStart) continue;
    if (!meeting.recurrence) {
      if (meetingEndTs(meeting) > nowTs) {
        upcoming.push({ meeting, date: meeting.date, time: meeting.time, start: meetingStart(meeting).getTime() });
      } else {
        past.push(meeting);
      }
      continue;
    }
    const from = seriesStart > today ? seriesStart : today;
    const to = addDays(from, PROJECT_MEETING_LOOKAHEAD_DAYS);
    to.setHours(23, 59, 59, 999);
    const next = expandRecurring(meeting, from, to)
      .find(inst => inst.date >= toDateStr(from) && meetingEndTs(inst) > nowTs);
    if (next) {
      upcoming.push({ meeting, date: next.date, time: next.time, start: meetingStart(next).getTime() });
    } else {
      past.push(meeting);
    }
  }
  upcoming.sort((a, b) =>
    a.start - b.start
    || a.meeting.title.localeCompare(b.meeting.title, 'uk')
    || (a.meeting.id < b.meeting.id ? -1 : a.meeting.id > b.meeting.id ? 1 : 0));
  past.sort((a, b) =>
    meetingStart(b).getTime() - meetingStart(a).getTime()
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    upcoming: upcoming.map(({ meeting, date, time }) => ({ meeting, date, time })),
    past,
  };
}
