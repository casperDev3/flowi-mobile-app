/**
 * components/finance/useFinanceFilter.ts — спільний фільтр розділу «Фінанси»
 * (період · валюта · ракурс), finance-revamp.md §3.
 *
 * Один стан на весь розділ. Живе в ЛОКАЛЬНИХ ключах AsyncStorage
 * (`finance_period`, `finance_currency`, наявний `finance_money_scope`): це
 * стан погляду на пристрої, а не дані — синхронізувати його означало б
 * перемикати період на телефоні через те, що хтось відкрив звіт на планшеті.
 *
 * Запис у сховище — лише після першого читання (`ready`): інакше типове
 * значення першого кадру перезаписало б збережений вибір.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadDataResult, saveData } from '@/store/storage';
import { MONEY_SCOPE_KEY, normalizeMoneyScope, type MoneyScope } from '@/utils/budgetScope';
import {
  FINANCE_CURRENCY_KEY, FINANCE_PERIOD_KEY, parseStoredPeriod, resolvePeriod, storedPeriodOf,
  type FinanceFilter, type PeriodRange,
} from '@/utils/finance/period';

export interface FinanceFilterState {
  filter: FinanceFilter;
  ready: boolean;
  setPeriod: (period: PeriodRange) => void;
  /** null — повернутись до основної валюти (типове значення). */
  setCurrency: (code: string | null) => void;
  setScope: (scope: MoneyScope) => void;
}

export function useFinanceFilter(primary: string): FinanceFilterState {
  const [period, setPeriodState] = useState<PeriodRange>(() => resolvePeriod('month', '', new Date()));
  /** Явно обрана валюта; null — «основна» (стежить за finance_primary_currency). */
  const [currency, setCurrencyState] = useState<string | null>(null);
  const [scope, setScopeState] = useState<MoneyScope>('all');
  const [ready, setReady] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void Promise.all([
      loadDataResult<unknown>(FINANCE_PERIOD_KEY, null),
      loadDataResult<unknown>(FINANCE_CURRENCY_KEY, null),
      loadDataResult<unknown>(MONEY_SCOPE_KEY, null),
    ]).then(([p, cur, sc]) => {
      if (!alive.current) return;
      if (p.ok) setPeriodState(parseStoredPeriod(p.value, new Date()));
      if (cur.ok && typeof cur.value === 'string' && cur.value) setCurrencyState(cur.value);
      if (sc.ok) setScopeState(normalizeMoneyScope(sc.value));
      setReady(true);
    }).catch(e => {
      if (__DEV__) console.warn('[finance] фільтр не прочитався:', e);
      if (alive.current) setReady(true);
    });
    return () => { alive.current = false; };
  }, []);

  const persist = useCallback((key: string, value: unknown) => {
    void saveData(key, value).catch(e => {
      if (__DEV__) console.warn(`[finance] запис ${key} не вдався:`, e);
    });
  }, []);

  const setPeriod = useCallback((next: PeriodRange) => {
    setPeriodState(next);
    persist(FINANCE_PERIOD_KEY, storedPeriodOf(next, new Date()));
  }, [persist]);

  const setCurrency = useCallback((code: string | null) => {
    setCurrencyState(code);
    persist(FINANCE_CURRENCY_KEY, code ?? '');
  }, [persist]);

  const setScope = useCallback((next: MoneyScope) => {
    setScopeState(next);
    persist(MONEY_SCOPE_KEY, next);
  }, [persist]);

  const filter = useMemo<FinanceFilter>(
    () => ({ period, currency: currency || primary || 'UAH', scope }),
    [period, currency, primary, scope],
  );

  return { filter, ready, setPeriod, setCurrency, setScope };
}
