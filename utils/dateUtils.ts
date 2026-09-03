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
