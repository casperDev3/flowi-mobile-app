// Date utility helpers shared across all screens

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Ключ доби для групування — `2026-09-03` з ЛОКАЛЬНИХ полів дати.
 *
 * Свідомо не `toDateString()`: він локалізовано-залежний і timezone-небезпечний
 * (CLAUDE.md прямо забороняє його для порівняння дат). Такий ключ ще й
 * сортується лексикографічно = хронологічно, тож денні секції не потребують
 * окремого парсингу дати для впорядкування.
 */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Парсить рядок `YYYY-MM-DD` (ручне текстове поле дати, напр. Таймлайн
 * проєкту) як ПІВНІЧ ЛОКАЛЬНОГО часового поясу.
 *
 * `new Date('YYYY-MM-DD')` за специфікацією ECMA-262 парсить дату-без-часу
 * як UTC-північ — на захід від UTC це той самий момент, що локально є
 * ВЕЧОРОМ ПОПЕРЕДНЬОГО дня (review finding: «users west of UTC see the
 * previous day»). Тут — `new Date(y, m-1, d)`, локальний конструктор.
 *
 * Строго валідує формат і календарні межі: `new Date(y, m, d)` сам
 * НОРМАЛІЗУЄ переповнення (лютий 30 → березень 2, місяць 13 → січень
 * наступного року) замість NaN — звіряємо компоненти результату з уведеними,
 * і невідповідність трактуємо як невалідний ввід (`null`), а не тихо
 * «перекочовуємо» чи закриваємо поле (той самий finding: типова помилка на
 * зразок «2026-13-01» не має мовчки стирати наявну дату).
 */
export function parseLocalDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Поля рядкового редактора дат Таймлайна проєкту + значення на момент відкриття. */
export interface TimelineDateEdit {
  start: string;
  deadline: string;
  origStart: string;
  origDeadline: string;
}

/**
 * `undefined` — поле НЕ чіпати (людина не редагувала його в цьому сеансі
 * форми); `null` — прибрати дату; ISO-рядок — новe значення.
 */
export interface TimelineDatePatch {
  ok: boolean;
  startDate?: string | null;
  deadline?: string | null;
}

/**
 * Патч дат Таймлайна проєкту з текстового редактора (`app/project/[id]/tasks.tsx`
 * saveDates) — review finding.
 *
 * Поле форми завжди переднаповнене (обидва рядки під графіком показують
 * поточні дати), тож наївне «розпарсити обидва поля й записати» переписувало
 * б і те поле, якого людина НЕ чіпала, — round-trip через
 * `parseLocalDateInput`/`toISOString` того самого рядка ідемпотентний лише
 * для дат РІВНО опівночі; коли він не такий (мс, час доби), «Зберегти» без
 * правки одного поля тихо зсувало друге. Порівнюємо з `orig*`, а не з тим,
 * що вже лежить у задачі: `orig*` — те, що людина БАЧИЛА у формі, і саме
 * зміну відносно побаченого рахуємо «правкою».
 */
export function resolveTimelineDatePatch(edit: TimelineDateEdit): TimelineDatePatch {
  const startTouched = edit.start !== edit.origStart;
  const deadlineTouched = edit.deadline !== edit.origDeadline;
  const startDate = startTouched && edit.start.trim() ? parseLocalDateInput(edit.start) : null;
  const deadlineDate = deadlineTouched && edit.deadline.trim() ? parseLocalDateInput(edit.deadline) : null;
  const startInvalid = startTouched && edit.start.trim() !== '' && !startDate;
  const deadlineInvalid = deadlineTouched && edit.deadline.trim() !== '' && !deadlineDate;
  if (startInvalid || deadlineInvalid) return { ok: false };
  const patch: TimelineDatePatch = { ok: true };
  if (startTouched) patch.startDate = startDate ? startDate.toISOString() : null;
  if (deadlineTouched) patch.deadline = deadlineDate ? deadlineDate.toISOString() : null;
  return patch;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** "Квітень 2025" or "April 2025" */
export function formatMonthYear(d: Date, months: string[]): string {
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function prevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export function nextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

/** Returns true if date falls within the given month */
export function isInMonth(date: Date, month: Date): boolean {
  return isSameMonth(date, month);
}

// ─── Сітка місяця для календарів ──────────────────────────────────────────────

/**
 * Клітинки місяця, розкладені по тижнях: null — порожнє місце до першого
 * або після останнього числа.
 *
 * Тиждень починається з понеділка. getDay() віддає 0 для неділі, тож її
 * зсув — шість, а не мінус один; помилка тут зсуває весь місяць на день
 * і помітна лише при погляді на конкретне число.
 *
 * Останній тиждень добивається порожніми клітинками до семи, щоб рядки
 * сітки мали однакову довжину й не «стрибали» шириною.
 */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const lead = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
