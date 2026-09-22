/**
 * __tests__/translations-parity.test.ts — набори ключів uk і en мусять збігатися.
 *
 * Ключ, доданий лише в один словник, не падає при компіляції другого (обидва
 * типізовані як Translations, тож TS ловить лише пропуск) — але його дуже
 * легко додати в uk і забути в en у сусідньому рядку. Тоді користувач бачить
 * `undefined` замість тексту саме тією мовою, якою не тестували.
 */

import { allTranslations } from '@/store/translations';

test('uk і en мають однаковий набір ключів', () => {
  const uk = Object.keys(allTranslations.uk).sort();
  const en = Object.keys(allTranslations.en).sort();
  expect(uk).toEqual(en);
});

test('нові ключі активних таймерів є в обох мовах', () => {
  const keys = [
    'activeTimers',
    'newTimer',
    'noActiveTimers',
    'noActiveTimersHint',
    'fullscreenTimers',
    'exitFullscreen',
    'startTimerAction',
    'stopTimerAction',
    'timerLabel',
    'currentSession',
    'parallelTimers',
  ] as const;
  for (const key of keys) {
    expect(typeof allTranslations.uk[key]).toBe('string');
    expect(allTranslations.uk[key].length).toBeGreaterThan(0);
    expect(typeof allTranslations.en[key]).toBe('string');
    expect(allTranslations.en[key].length).toBeGreaterThan(0);
  }
});

test('нові ключі рахунків і переказів є в обох мовах', () => {
  const keys = [
    'account',
    'accounts',
    'accountCash',
    'accountCard',
    'accountSavings',
    'accountDefaultName',
    'newAccount',
    'openingBalance',
    'selectAccount',
    'noAccounts',
    'noAccountsHint',
    'accountArchived',
    'archiveAccount',
    'unarchiveAccount',
    'accountCurrencyLocked',
    'transfer',
    'transferFrom',
    'transferTo',
    'transferReceived',
    'transferRate',
    'transfersNotCounted',
    'markAsTransfer',
  ] as const;
  for (const key of keys) {
    expect(typeof allTranslations.uk[key]).toBe('string');
    expect(allTranslations.uk[key].length).toBeGreaterThan(0);
    expect(typeof allTranslations.en[key]).toBe('string');
    expect(allTranslations.en[key].length).toBeGreaterThan(0);
  }
});

test('нові ключі аналітики проєктів є в обох мовах', () => {
  const keys = [
    'projectAnalytics',
    'projectAnalyticsHint',
    'chartColumns',
    'chartDoneWeeks',
    'chartDeadlinesAhead',
    'chartTimeSpent',
    'chartWeeksSpan',
    'chartTimerSessions',
    'chartNoTasksInScope',
    'chartNoSessions',
    'chartDoneEarlier',
    'chartDoneUndated',
    'chartOverdueDebt',
    'chartBeyondHorizon',
    'chartNoDeadline',
    'ganttLegendReal',
    'ganttLegendEstimated',
    'ganttLegendColor',
    'ganttToday',
    'ganttNothingToDraw',
    'ganttNoStartDate',
    'ganttHidden',
    'ganttStartFromCreated',
    'ganttStartExact',
    'ganttEndDeadline',
    'ganttEndDone',
    'ganttEndOpen',
    'ganttDaysShort',
  ] as const;
  for (const key of keys) {
    expect(typeof allTranslations.uk[key]).toBe('string');
    expect(allTranslations.uk[key].length).toBeGreaterThan(0);
    expect(typeof allTranslations.en[key]).toBe('string');
    expect(allTranslations.en[key].length).toBeGreaterThan(0);
  }
});
