/**
 * app/project/[id]/budget.tsx — Бюджет проєкту (WORKSPACE_PROJECTS_CONTRACT
 * §3.3 `project_budgets`, §4.1: «бюджет бачить лише власник»).
 *
 * Розділ вмикається `modules.budget` І лише власнику — фільтрація вже на
 * рівні навігації (`visibleProjectNavItems`), тут — захист про всяк випадок,
 * якщо на екран потрапили прямим посиланням (сервер лишається джерелом
 * істини, contract §4.1).
 *
 * `project_budgets`: один запис на проєкт, `local_id == project.id`
 * (contract §3.3) — тому `useSyncedList` тут не підходить (він диф-ить за
 * `id`, але порядок і кількість записів довільні); пишемо READ-MODIFY-WRITE,
 * як решта одиничних записів застосунку.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ProjectTransactionForm } from '@/components/finance/ProjectTransactionForm';
import { RecurringIncomesSection } from '@/components/finance/RecurringIncomesSection';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import type { Account } from '@/utils/accounts';
import { localDateKey } from '@/utils/dateUtils';
import { BUILTIN_CURRENCIES, type Currency, type Transaction } from '@/utils/financeUtils';
import {
  formatSubscriptionMoney, formatTotalsLine, normalizeSubscriptions, subscriptionStatus,
  subscriptionsForProject, totalsByCurrency, type Subscription,
} from '@/utils/subscriptions';
import { projectMoneyTotals, projectTransactions } from '@/utils/budgetProject';
import { categoryOptions } from '@/utils/financeCategories';
import type { CategoryRowLike } from '@/utils/financeCategories';
import { haptic } from '@/utils/haptics';
import { MODULES_BY_TEMPLATE, projectModules } from '@/utils/projectUtils';

interface ProjectBudgetRecord {
  id: string;
  projectId: string;
  amount: number;
  currency: string;
  updatedAt?: string;
}

export default function ProjectBudgetScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  const role = useProjectRole(projectId);
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const [budgets, setBudgets] = useState<ProjectBudgetRecord[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [amountDraft, setAmountDraft] = useState('');
  const [categoryRows, setCategoryRows] = useState<CategoryRowLike[]>([]);
  /** Форма «+ операція» (П3): витрата чи дохід проєкту з рахунком. */
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [txBusy, setTxBusy] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [b, tx, acc, cur, subs, cats] = await Promise.all([
      loadData<ProjectBudgetRecord[]>('project_budgets', []),
      loadData<Transaction[]>('transactions', []),
      loadData<Account[]>('accounts', []),
      loadData<Currency[]>('finance_currencies', []),
      loadData<unknown>('subscriptions', []),
      loadData<unknown>('categories', []),
    ]);
    setBudgets(b); setTransactions(tx); setAccounts(acc); setCurrencies(cur);
    setSubscriptions(normalizeSubscriptions(subs));
    setCategoryRows(Array.isArray(cats) ? (cats as CategoryRowLike[]).filter(r => !!r && typeof r === 'object') : []);
  }, []);
  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  const trackWrite = useStorageRefresh(['project_budgets', 'transactions', 'accounts', 'finance_currencies', 'subscriptions', 'categories'], loadAll);

  const budget = projectId ? budgets.find(b => b.id === projectId) : undefined;
  const currency = budget?.currency ?? 'UAH';
  const allCurrencies = useMemo(() => [...BUILTIN_CURRENCIES, ...currencies], [currencies]);

  /**
   * «Витрачено» — ЗА ВЕСЬ ЧАС проєкту, як і у вебі.
   *
   * Було `budgetSpentThisMonth`, і поруч із лімітом, заданим на проєкт цілком,
   * воно означало дурницю: 1 січня цифра оберталась на нуль, хоча гроші
   * нікуди не поділись, а браузер на тих самих даних показував інше число.
   */
  const totals = useMemo(
    () => (projectId ? projectMoneyTotals(transactions, accounts, projectId, currency) : null),
    [projectId, transactions, accounts, currency],
  );
  const spent = totals?.spent ?? 0;
  const projectTx = useMemo(
    () => (projectId ? projectTransactions(transactions, projectId, 'expense') : []),
    [transactions, projectId],
  );
  /** Доходи проєкту (П4) — так само, як їх показує веб, окремим списком. */
  const projectIncome = useMemo(
    () => (projectId ? projectTransactions(transactions, projectId, 'income') : []),
    [transactions, projectId],
  );
  const uncountedLine = useMemo(() => {
    if (!totals) return '';
    return Object.entries(totals.uncounted)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([code, v]) => {
        const parts: string[] = [];
        if (v.income) parts.push(`+${formatSubscriptionMoney(v.income, code, allCurrencies, locale)}`);
        if (v.expense) parts.push(`−${formatSubscriptionMoney(v.expense, code, allCurrencies, locale)}`);
        return parts.join(' ');
      })
      .filter(Boolean)
      .join(', ');
  }, [totals, allCurrencies, locale]);
  const formCategories = useMemo(() => ({
    income: categoryOptions(categoryRows, transactions, 'income', lang).map(cat => cat.name),
    expense: categoryOptions(categoryRows, transactions, 'expense', lang).map(cat => cat.name),
  }), [categoryRows, transactions, lang]);

  /**
   * Нова операція проєкту: read-modify-write свіжого сховища, щоб операції,
   * що приїхали синком, пережили запис. Маршрутизацію в потік проєкту робить
   * шар синку за `projectId` (utils/projectStream.ts).
   */
  const addTransaction = useCallback(async (tx: Transaction) => {
    setTxBusy(true);
    setTxError(null);
    try {
      await trackWrite(async () => {
        const next = await updateSynced<Transaction>('transactions', fresh => [...fresh, tx]);
        setTransactions(next);
      });
      haptic.success();
      setTxFormOpen(false);
    } catch (e) {
      if (__DEV__) console.warn('[project/budget] операція не записалась:', e);
      setTxError(tr.finProjectSaveFailed);
    } finally {
      setTxBusy(false);
    }
  }, [trackWrite, tr]);

  /** Підписки проєкту: живі (без архівних) + сума за місяць по кожній валюті. */
  const projectSubscriptions = useMemo(() => {
    if (!projectId) return { live: [] as Subscription[], monthlyLine: '' };
    const today = localDateKey(new Date());
    const all = subscriptionsForProject(subscriptions, projectId);
    const live = all.filter(sub => subscriptionStatus(sub, today) !== 'archived');
    const monthlyLine = formatTotalsLine(totalsByCurrency(live, today), 'monthly', tr.subPerMonth, allCurrencies, locale);
    return { live, monthlyLine, today };
  }, [subscriptions, projectId, allCurrencies, locale, tr]);

  const saveAmount = useCallback(async (nextCurrency: string) => {
    if (!projectId) return;
    const parsed = parseFloat(amountDraft.replace(',', '.'));
    const amount = Number.isFinite(parsed) && parsed >= 0 ? parsed : (budget?.amount ?? 0);
    try {
      await trackWrite(async () => {
        const next = await updateSynced<ProjectBudgetRecord>('project_budgets', fresh => {
          const exists = fresh.some(b => b.id === projectId);
          const record: ProjectBudgetRecord = { id: projectId, projectId, amount, currency: nextCurrency };
          return exists ? fresh.map(b => (b.id === projectId ? record : b)) : [...fresh, record];
        });
        setBudgets(next);
      });
      haptic.success();
    } catch (e) {
      if (__DEV__) console.warn('[project/budget] запис не вдався:', e);
    }
  }, [projectId, amountDraft, budget, trackWrite]);

  if (role !== 'owner') {
    return (
      <ProjectScreenShell project={project} isDark={isDark} title={tr.navBudget}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center' }}>{tr.projectBudgetOwnerOnly}</Text>
        </View>
      </ProjectScreenShell>
    );
  }

  // Мінор із ревʼю: коментар угорі файлу обіцяв «захист про всяк випадок» і
  // для вимкненого `modules.budget`, але код перевіряв лише роль — deep
  // link/`router.push`, чи «залишився на екрані під час вимкнення» розділу,
  // і далі показував і давав редагувати бюджет вимкненого розділу.
  const modules = project ? projectModules(project) : MODULES_BY_TEMPLATE.work;
  if (project && !modules.budget) {
    return (
      <ProjectScreenShell project={project} isDark={isDark} title={tr.navBudget}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center' }}>{tr.projectModuleDisabled}</Text>
        </View>
      </ProjectScreenShell>
    );
  }

  return (
    <ProjectScreenShell project={project} isDark={isDark} title={tr.navBudget}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: дефолтний keyboardShouldPersistTaps='never' означає, що перший
        // тап по кнопці поруч із полем лише ховає клавіатуру — кнопка
        // виглядає мертвою.
        keyboardShouldPersistTaps="handled">

        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{tr.projectBudgetLimit}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TextInput
              placeholder={budget ? String(budget.amount) : '0'}
              accessibilityLabel={tr.projectBudgetLimit}
              placeholderTextColor={c.sub}
              value={amountDraft}
              onChangeText={setAmountDraft}
              keyboardType="decimal-pad"
              onSubmitEditing={() => saveAmount(currency)}
              style={{ flex: 1, color: c.text, fontSize: 20, fontWeight: '800', borderBottomWidth: 1, borderColor: c.border, paddingVertical: 6 }}
            />
            <TouchableOpacity onPress={() => saveAmount(currency)} style={{ backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {allCurrencies.map(cur => (
              <TouchableOpacity
                key={cur.code}
                onPress={() => saveAmount(cur.code)}
                style={{ borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderColor: cur.code === currency ? c.accent : c.border, backgroundColor: cur.code === currency ? c.accent + '18' : 'transparent' }}>
                <Text style={{ color: cur.code === currency ? c.accent : c.sub, fontWeight: '700', fontSize: 12 }}>{cur.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {budget ? (
            <Text style={{ color: spent > budget.amount ? '#EF4444' : c.text, fontSize: 14, fontWeight: '700', marginTop: 14 }}>
              {tr.overviewBudgetSpent}: {formatSubscriptionMoney(spent, currency, allCurrencies, locale)} / {formatSubscriptionMoney(budget.amount, currency, allCurrencies, locale)}
            </Text>
          ) : null}
          {totals && (totals.income > 0 || projectIncome.length > 0) ? (
            <>
              <Text style={{ color: '#10B981', fontSize: 14, fontWeight: '700', marginTop: 6 }}>
                {tr.finProjectIncomeTitle}: {formatSubscriptionMoney(totals.income, currency, allCurrencies, locale)}
              </Text>
              <Text style={{ color: totals.net < 0 ? '#EF4444' : c.text, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                {tr.finProjectNet}: {totals.net < 0 ? '−' : ''}{formatSubscriptionMoney(Math.abs(totals.net), currency, allCurrencies, locale)}
              </Text>
            </>
          ) : null}
          {uncountedLine ? (
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{tr.finProjectUncounted.replace('{list}', uncountedLine)}</Text>
          ) : null}
        </View>

        {/* П3: операція проєкту з телефона — з рахунком (П2). */}
        <TouchableOpacity
          onPress={() => { setTxError(null); setTxFormOpen(true); }}
          accessibilityRole="button"
          accessibilityLabel={tr.finProjectAddTx}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.accent + '55', backgroundColor: c.accent + '14', marginBottom: 20 }}>
          <IconSymbol name="plus" size={15} color={c.accent} />
          <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>{tr.finProjectAddTx}</Text>
        </TouchableOpacity>

        {/* Підписки проєкту: та сама секція, що раніше жила в деталі
            (app/projects.tsx) — тепер тут, поруч із рештою бюджету, бо й
            підписки з projectId бачить лише власник (contract §4.1). */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text style={{ flex: 1, color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.navSubscriptions}</Text>
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/subscriptions', params: { create: '1', projectId } } as never)}
            accessibilityRole="button"
            accessibilityLabel={tr.subNew}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="plus" size={17} color={c.accent} />
          </TouchableOpacity>
        </View>
        {projectSubscriptions.live.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 13, opacity: 0.8, marginBottom: 20 }}>{tr.subProjectEmpty}</Text>
        ) : (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', marginBottom: 6 }}>{projectSubscriptions.monthlyLine}</Text>
            {projectSubscriptions.live.map(sub => {
              const overdue = subscriptionStatus(sub, projectSubscriptions.today ?? '') === 'overdue';
              return (
                <TouchableOpacity
                  key={sub.id}
                  onPress={() => router.push({ pathname: '/subscriptions', params: { open: sub.id } } as never)}
                  activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 8 }}>
                  <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: sub.color || (project?.color ?? c.accent), marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{sub.name}</Text>
                    <Text style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 11, marginTop: 2, fontWeight: overdue ? '700' : '400' }}>
                      {overdue ? `${tr.subOverdue} · ` : ''}{new Date(`${sub.nextPaymentDate}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={{ color: overdue ? '#EF4444' : c.text, fontSize: 13, fontWeight: '700' }}>
                    {formatSubscriptionMoney(sub.amount, sub.currency, allCurrencies, locale)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{tr.projectBudgetTransactions}</Text>
        {projectTx.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 13, opacity: 0.8 }}>{tr.projectBudgetNoTransactions}</Text>
        ) : projectTx.map(tx => (
          <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{tx.category || tx.note || '—'}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                {new Date(tx.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>-{tx.amount.toLocaleString(locale)}</Text>
          </View>
        ))}

        {/* П4: доходи проєкту окремим списком — як на вебі. */}
        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 20 }}>{tr.finProjectIncomeTitle}</Text>
        {projectIncome.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 13, opacity: 0.8 }}>{tr.finProjectNoIncome}</Text>
        ) : projectIncome.map(tx => (
          <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{tx.category || tx.note || '—'}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                {new Date(tx.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <Text style={{ color: '#10B981', fontSize: 13, fontWeight: '700' }}>+{Number(tx.amount).toLocaleString(locale)}</Text>
          </View>
        ))}

        {/* Регулярні доходи проєкту — та сама секція, що у вкладці «Підписки». */}
        {projectId ? (
          <RecurringIncomesSection
            c={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, card: c.dim, accent: c.accent, green: '#10B981', red: '#EF4444', sheet: isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)' }}
            tr={tr}
            lang={lang === 'en' ? 'en' : 'uk'}
            isDark={isDark}
            projectId={projectId}
          />
        ) : null}
      </ScrollView>
      {projectId ? (
        <ProjectTransactionForm
          visible={txFormOpen}
          onClose={() => setTxFormOpen(false)}
          onSubmit={tx => { void addTransaction(tx); }}
          projectId={projectId}
          accounts={accounts}
          categories={formCategories}
          c={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)' }}
          tr={tr}
          isDark={isDark}
          busy={txBusy}
          error={txError}
        />
      ) : null}
    </ProjectScreenShell>
  );
}
