import { fmtSleep } from '@/utils/healthTheme';
import { formatDuration } from '@/utils/durationFormat';
import { DEFAULT_TASK_STATUS_COLUMNS } from '@/utils/taskStatuses';
import { pluralForm } from '@/utils/activeTimersBar';
import { buildHealthReport } from '@/utils/preventionUtils';
import { DEFAULT_CATEGORIES_EN } from '@/utils/financeCategories';

const CYR = /[Ѐ-ӿ]/;

describe('I18N-02: fmtSleep ignores language', () => {
  it('always emits Ukrainian unit abbreviations', () => {
    expect(fmtSleep(150)).toBe('2г 30хв');
    expect(CYR.test(fmtSleep(150))).toBe(true);
    expect(CYR.test(fmtSleep(120))).toBe(true);
    expect(CYR.test(fmtSleep(45))).toBe(true);
  });
  it('the bilingual helper that should replace it produces English', () => {
    expect(formatDuration(150 * 60, { hour: 'h', hourLong: 'hr', minute: 'min' })).toBe('2h 30min');
  });
});

describe('I18N-04: default task status columns are Ukrainian-only', () => {
  it('every seeded column name is Cyrillic regardless of language', () => {
    expect(DEFAULT_TASK_STATUS_COLUMNS.map(c => c.name)).toEqual(['До роботи', 'У процесі', 'На перевірці', 'Готово']);
    DEFAULT_TASK_STATUS_COLUMNS.forEach(c => expect(CYR.test(c.name)).toBe(true));
  });
  it('finance categories do have an EN variant — so the pattern exists', () => {
    DEFAULT_CATEGORIES_EN.expense.forEach(c => expect(CYR.test(c.name)).toBe(false));
  });
});

describe('I18N-07: health report for the doctor is Ukrainian-only under en locale', () => {
  it('headings and units stay Cyrillic when locale is en-US', () => {
    const txt = buildHealthReport({
      meds: [], checkups: [], vaccines: [],
      latestWeight: 71, bmi: 22.1, todayPulse: 72, locale: 'en-US',
    });
    expect(txt).toContain('ЗВЕДЕННЯ ЗДОРОВ');
    expect(txt).toContain('Вага: 71 кг');
    expect(txt).toContain('Пульс: 72 уд/хв');
    expect(txt).toContain('Сформовано у Flowi');
  });
});

describe('I18N-08: containers inline plural rule diverges from the project helper', () => {
  // repro of app/containers.tsx:58-61 (itemsWord is module-private)
  const itemsWord = (n: number) => (n === 1 ? 'річ' : n < 5 ? 'речі' : 'речей');
  it('n<5 is wrong for 21/22 where pluralForm is right', () => {
    expect(pluralForm(21, 'uk')).toBe('one');   // «21 річ»
    expect(itemsWord(21)).toBe('речей');        // but the screen prints «21 речей»
    expect(pluralForm(22, 'uk')).toBe('few');   // «22 речі»
    expect(itemsWord(22)).toBe('речей');        // screen prints «22 речей»
  });
  it('has no English form at all', () => {
    expect(CYR.test(itemsWord(3))).toBe(true);
  });
});
