/**
 * components/finance/useFinanceExtras.ts — дані звітів, яких стрічка
 * операцій сама не читає: сирі рядки `categories` (з полями group/cost),
 * підписки й регулярні доходи. Операції й рахунки екран «Фінанси» вже тримає
 * у своєму стані й передає у вкладки напряму — другої копії тут немає.
 *
 * Лише читання: пише кожна колекція у своєму місці (категорії — редактор
 * категорій, підписки — вкладка «Підписки», доходи — RecurringIncomesSection).
 */
import { useCallback, useEffect, useState } from 'react';

import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { loadDataResult } from '@/store/storage';
import type { CategoryRowLike } from '@/utils/finance/classify';
import {
  normalizeRecurringIncomes, RECURRING_INCOMES_KEY, type RecurringIncome,
} from '@/utils/finance/recurring';
import { normalizeSubscriptions, type Subscription } from '@/utils/subscriptions';

const KEYS = ['categories', 'subscriptions', RECURRING_INCOMES_KEY] as const;

export interface FinanceExtras {
  categoryRows: CategoryRowLike[];
  subscriptions: Subscription[];
  recurringIncomes: RecurringIncome[];
  loaded: boolean;
  reload: () => Promise<void>;
}

export function useFinanceExtras(): FinanceExtras {
  const [categoryRows, setCategoryRows] = useState<CategoryRowLike[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [recurringIncomes, setRecurringIncomes] = useState<RecurringIncome[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [cats, subs, incomes] = await Promise.all([
      loadDataResult<unknown>('categories', []),
      loadDataResult<unknown>('subscriptions', []),
      loadDataResult<unknown>(RECURRING_INCOMES_KEY, []),
    ]);
    if (cats.ok) {
      setCategoryRows(Array.isArray(cats.value)
        ? (cats.value as unknown[]).filter((r): r is CategoryRowLike => !!r && typeof r === 'object')
        : []);
    }
    if (subs.ok) setSubscriptions(normalizeSubscriptions(subs.value));
    if (incomes.ok) setRecurringIncomes(normalizeRecurringIncomes(Array.isArray(incomes.value) ? incomes.value : []));
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload().catch(e => { if (__DEV__) console.warn('[finance] звітні дані не прочитались:', e); });
  }, [reload]);

  useStorageRefresh(KEYS, () => reload());

  return { categoryRows, subscriptions, recurringIncomes, loaded, reload };
}
