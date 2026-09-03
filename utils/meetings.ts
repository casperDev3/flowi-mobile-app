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

import { shiftForDate, type ActiveTimer } from './activeTimers';
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
  meeting: Pick<Meeting, 'id' | 'title'>,
  now: Date = new Date(),
): ActiveTimer {
  return {
    id: meetingTimerId(meeting.id),
    meetingId: meeting.id,
    label: meeting.title,
    startedAt: now.toISOString(),
    // Зміну доби беремо з годинника, як для завдання: нараду не «планують на
    // вечір» окремо від того, коли її насправді почали трекати.
    shift: shiftForDate(now),
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
