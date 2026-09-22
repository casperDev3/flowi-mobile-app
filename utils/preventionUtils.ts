// Моделі та утиліти модуля «Профілактика»

export const MEDS_KEY = 'health_meds';
export const CHECKUPS_KEY = 'health_checkups';
export const VACCINES_KEY = 'health_vaccines';
export const HABITS_KEY = 'health_habits';

export interface MedLog { date: string; takenAt: string; }
export interface Medication {
  id: string;
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
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
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
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
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
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
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
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

/**
 * I18N-07. Підписи звіту.
 *
 * `buildHealthReport` — не підпис на екрані, а текст, який людина копіює або
 * надсилає лікарю через Share. Функція сумлінно форматувала дати за `locale`,
 * але всі заголовки, підписи й одиниці були зашиті українською: англомовний
 * отримував документ, якого сам не прочитає.
 *
 * Тому підписи приходять ззовні (екран збирає їх із `tr.*`), а типове
 * значення лишається українським — щоб жоден наявний виклик не змінив
 * поведінку мовчки.
 */
export interface HealthReportLabels {
  title: string;
  weight: string;
  bmi: string;
  pulse: string;
  unitKg: string;
  unitBpm: string;
  meds: string;
  adherence: string;
  checkups: string;
  vaccines: string;
  dose: string;
  generatedBy: string;
}

export const UK_HEALTH_REPORT_LABELS: HealthReportLabels = {
  title: "ЗВЕДЕННЯ ЗДОРОВ'Я",
  weight: 'Вага',
  bmi: 'ІМТ',
  pulse: 'Пульс',
  unitKg: 'кг',
  unitBpm: 'уд/хв',
  meds: 'Ліки/добавки',
  adherence: 'дотримання',
  checkups: 'Огляди/аналізи',
  vaccines: 'Щеплення',
  dose: 'доза',
  generatedBy: 'Сформовано у Flowi',
};

export function buildHealthReport(opts: {
  meds: Medication[]; checkups: Checkup[]; vaccines: Vaccine[];
  latestWeight: number | null; bmi: number | null;
  todayPulse: number | null; locale: string;
  labels?: HealthReportLabels;
}): string {
  const { meds, checkups, vaccines, latestWeight, bmi, todayPulse, locale } = opts;
  const t = opts.labels ?? UK_HEALTH_REPORT_LABELS;
  const fmtD = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const L: string[] = [];
  L.push(`🩺 ${t.title}`);
  L.push('');
  if (latestWeight) L.push(`${t.weight}: ${latestWeight} ${t.unitKg}${bmi ? ` · ${t.bmi} ${bmi.toFixed(1)}` : ''}`);
  if (todayPulse) L.push(`${t.pulse}: ${todayPulse} ${t.unitBpm}`);
  const activeMeds = meds.filter(m => m.active);
  if (activeMeds.length) {
    L.push('', `💊 ${t.meds}:`);
    activeMeds.forEach(m => L.push(`• ${m.name}${m.dose ? ` (${m.dose})` : ''} — ${m.times.join(', ')} · ${t.adherence} ${medAdherence(m)}%`));
  }
  if (checkups.length) {
    L.push('', `📋 ${t.checkups}:`);
    checkups.slice(0, 12).forEach(ch => L.push(`• ${fmtD(ch.date)} — ${ch.title}${ch.result ? `: ${ch.result}` : ''}`));
  }
  if (vaccines.length) {
    L.push('', `💉 ${t.vaccines}:`);
    vaccines.forEach(v => L.push(`• ${fmtD(v.date)} — ${v.name}${v.doseNo ? ` (${t.dose} ${v.doseNo})` : ''}`));
  }
  L.push('', `${t.generatedBy} · ${new Date().toLocaleDateString(locale)}`);
  return L.join('\n');
}
