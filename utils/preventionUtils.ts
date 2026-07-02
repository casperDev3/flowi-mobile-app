// Моделі та утиліти модуля «Профілактика»

export const MEDS_KEY = 'health_meds';
export const CHECKUPS_KEY = 'health_checkups';
export const VACCINES_KEY = 'health_vaccines';
export const HABITS_KEY = 'health_habits';

export interface MedLog { date: string; takenAt: string; }
export interface Medication {
  id: string;
  name: string;
  dose?: string;            // "500 мг", "2 капсули"
  times: string[];          // ["08:00","20:00"]
  startDate: string;
  endDate?: string;
  active: boolean;
  log: MedLog[];
  notifIds?: string[];
  createdAt: string;
}

export type CheckupKind = 'analysis' | 'visit' | 'procedure';
export interface Checkup {
  id: string;
  kind: CheckupKind;
  title: string;
  date: string;             // ISO
  result?: string;
  notes?: string;
  nextDate?: string;
  notifId?: string;
  createdAt: string;
}

export interface Vaccine {
  id: string;
  name: string;
  date: string;
  doseNo?: number;
  nextDate?: string;
  notes?: string;
  notifId?: string;
  createdAt: string;
}

export interface Habit {
  id: string;
  title: string;
  icon: string;
  color: string;
  log: string[];            // ISO-дати виконання (день)
  reminderAt?: string;      // "08:00"
  notifId?: string;
  createdAt: string;
}

let _seq = 0;
export function genId() { _seq = (_seq + 1) % 100000; return `${Date.now()}_${_seq}`; }

const dayKey = (d: Date | string) => new Date(d).toDateString();

// ─── Ліки ────────────────────────────────────────────────────────────────────
export function medTakenToday(med: Medication): number {
  const today = new Date().toDateString();
  return med.log.filter(l => dayKey(l.date) === today).length;
}
export function medDueToday(med: Medication): number {
  if (!med.active) return 0;
  return Math.max(0, med.times.length - medTakenToday(med));
}
/** Дотримання за останні N днів, % */
export function medAdherence(med: Medication, days = 7): number {
  if (!med.times.length) return 0;
  let expected = 0, taken = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    expected += med.times.length;
    taken += med.log.filter(l => dayKey(l.date) === d.toDateString()).length;
  }
  return expected ? Math.round(Math.min(taken / expected, 1) * 100) : 0;
}

// ─── Звички ──────────────────────────────────────────────────────────────────
export function habitDoneToday(habit: Habit): boolean {
  const today = new Date().toDateString();
  return habit.log.some(l => dayKey(l) === today);
}
export function habitStreak(habit: Habit): number {
  const set = new Set(habit.log.map(l => dayKey(l)));
  let streak = 0;
  const d = new Date();
  // якщо сьогодні ще не виконано — рахуємо серію до вчора
  if (!set.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (set.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

// ─── Парсинг часу/дати з тексту ───────────────────────────────────────────────
export function parseTimes(text: string): string[] {
  return text.split(',').map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t))
    .map(t => { const [h, m] = t.split(':'); return `${h.padStart(2, '0')}:${m}`; });
}

// ─── Експорт-звіт для лікаря ───────────────────────────────────────────────────
export function buildHealthReport(opts: {
  meds: Medication[]; checkups: Checkup[]; vaccines: Vaccine[];
  latestWeight: number | null; bmi: number | null;
  todayPulse: number | null; locale: string;
}): string {
  const { meds, checkups, vaccines, latestWeight, bmi, todayPulse, locale } = opts;
  const fmtD = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const L: string[] = [];
  L.push('🩺 ЗВЕДЕННЯ ЗДОРОВ\'Я');
  L.push('');
  if (latestWeight) L.push(`Вага: ${latestWeight} кг${bmi ? ` · ІМТ ${bmi.toFixed(1)}` : ''}`);
  if (todayPulse) L.push(`Пульс: ${todayPulse} уд/хв`);
  const activeMeds = meds.filter(m => m.active);
  if (activeMeds.length) {
    L.push('', '💊 Ліки/добавки:');
    activeMeds.forEach(m => L.push(`• ${m.name}${m.dose ? ` (${m.dose})` : ''} — ${m.times.join(', ')} · дотримання ${medAdherence(m)}%`));
  }
  if (checkups.length) {
    L.push('', '📋 Огляди/аналізи:');
    checkups.slice(0, 12).forEach(ch => L.push(`• ${fmtD(ch.date)} — ${ch.title}${ch.result ? `: ${ch.result}` : ''}`));
  }
  if (vaccines.length) {
    L.push('', '💉 Щеплення:');
    vaccines.forEach(v => L.push(`• ${fmtD(v.date)} — ${v.name}${v.doseNo ? ` (доза ${v.doseNo})` : ''}`));
  }
  L.push('', `Сформовано у Flowi · ${new Date().toLocaleDateString(locale)}`);
  return L.join('\n');
}
