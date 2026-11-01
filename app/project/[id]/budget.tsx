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
import { fontFamily, radius, type } from '@/constants/theme';
import { BentoCard, BentoGrid, KpiCounter, SegmentedProgress } from '@/components/ds';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';

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
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED',project?.appearance);
  const tk = dsTokens(isDark);

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
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.navBudget}
      // Omni KPI: витрачено (частка ліміту) · ліміт · сальдо, якщо є доходи.
      kpis={budget ? (
        <>
          <KpiCounter
            value={formatSubscriptionMoney(spent, currency, allCurrencies, locale)}
            label={tr.overviewBudgetSpent}
            delta={budget.amount > 0 ? `${Math.round((spent / budget.amount) * 100)}%` : undefined}
            deltaTone={spent > budget.amount ? 'down' : 'neutral'}
            valueColor={spent > budget.amount ? tk.status.danger : undefined}
          />
          <KpiCounter value={formatSubscriptionMoney(budget.amount, currency, allCurrencies, locale)} label={tr.projectBudgetLimit} />
          {totals && (totals.income > 0 || projectIncome.length > 0) ? (
            <KpiCounter
              value={`${totals.net < 0 ? '−' : ''}${formatSubscriptionMoney(Math.abs(totals.net), currency, allCurrencies, locale)}`}
              label={tr.finProjectNet}
              valueColor={totals.net < 0 ? tk.status.danger : undefined}
            />
          ) : null}
        </>
      ) : undefined}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: дефолтний keyboardShouldPersistTaps='never' означає, що перший
        // тап по кнопці поруч із полем лише ховає клавіатуру — кнопка
        // виглядає мертвою.
        keyboardShouldPersistTaps="handled">

        {/* Omni bento: ліміт — головна картка з сегментним прогресом. */}
        <BentoCard title={tr.projectBudgetLimit} icon="creditcard.fill" accent="success" style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TextInput
              placeholder={budget ? String(budget.amount) : '0'}
              accessibilityLabel={tr.projectBudgetLimit}
              placeholderTextColor={tk.text.muted}
              value={amountDraft}
              onChangeText={setAmountDraft}
              keyboardType="decimal-pad"
              onSubmitEditing={() => saveAmount(currency)}
              style={{ flex: 1, color: c.text, fontSize: 32, fontFamily: fontFamily.light, letterSpacing: -0.64, fontVariant: ['tabular-nums'], borderBottomWidth: 1, borderColor: c.border, paddingVertical: 6 }}
            />
            <TouchableOpacity onPress={() => saveAmount(currency)} style={{ backgroundColor: tk.action.primary, borderRadius: radius.pill, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 }}>
              <Text style={{ color: tk.text.onAction, fontFamily: fontFamily.semibold }}>{tr.save}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {allCurrencies.map(cur => (
              <TouchableOpacity
                key={cur.code}
                onPress={() => saveAmount(cur.code)}
                style={{ borderRadius: radius.pill, minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: cur.code === currency ? tk.action.primary : tk.surface.subtle }}>
                <Text style={{ color: cur.code === currency ? tk.text.onAction : c.text, fontFamily: fontFamily.semibold, fontSize: 12 }}>{cur.code}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {budget ? (
            <>
              {/* DS v2: витрачене — display-цифри, прогрес — amber (перевитрата — coral). */}
              <Text style={[type.caption, { color: c.sub, marginTop: 20 }]}>{tr.overviewBudgetSpent}</Text>
              <Text style={[type.displaySm, { color: c.text, marginTop: 4 }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatSubscriptionMoney(spent, currency, allCurrencies, locale)}
                <Text style={[type.displayUnit, { color: c.sub }]}> / {formatSubscriptionMoney(budget.amount, currency, allCurrencies, locale)}</Text>
              </Text>
              <SegmentedProgress
                value={budget.amount > 0 ? spent / budget.amount : 0}
                showValue
                accessibilityLabel={`${tr.overviewBudgetSpent}: ${formatSubscriptionMoney(spent, currency, allCurrencies, locale)} / ${formatSubscriptionMoney(budget.amount, currency, allCurrencies, locale)}`}
                style={{ marginTop: 12 }}
              />
            </>
          ) : null}
          {totals && (totals.income > 0 || projectIncome.length > 0) ? (
            <>
              <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginTop: 12 }}>
                {tr.finProjectIncomeTitle}: {formatSubscriptionMoney(totals.income, currency, allCurrencies, locale)}
              </Text>
              <Text style={{ color: totals.net < 0 ? tk.status.danger : c.text, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginTop: 4 }}>
                {tr.finProjectNet}: {totals.net < 0 ? '−' : ''}{formatSubscriptionMoney(Math.abs(totals.net), currency, allCurrencies, locale)}
              </Text>
            </>
          ) : null}
          {uncountedLine ? (
            <Text style={[type.caption, { color: c.sub, marginTop: 6 }]}>{tr.finProjectUncounted.replace('{list}', uncountedLine)}</Text>
          ) : null}
        </BentoCard>

        {/* П3: операція проєкту з телефона — з рахунком (П2). */}
        <TouchableOpacity
          onPress={() => { setTxError(null); setTxFormOpen(true); }}
          accessibilityRole="button"
          accessibilityLabel={tr.finProjectAddTx}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, borderRadius: radius.pill, backgroundColor: tk.action.primary, marginBottom: 20 }}>
          <IconSymbol name="plus" size={16} color={tk.text.onAction} />
          <Text style={{ color: tk.text.onAction, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.finProjectAddTx}</Text>
        </TouchableOpacity>

        {/* Підписки проєкту: та сама секція, що раніше жила в деталі
            (app/projects.tsx) — тепер тут, поруч із рештою бюджету, бо й
            підписки з projectId бачить лише власник (contract §4.1). */}
        <BentoGrid columns={{ compact: 1, medium: 2, expanded: 2 }} style={{ marginBottom: 16 }}>
        <BentoCard
          key="subs"
          span="full"
          title={tr.navSubscriptions}
          icon="arrow.triangle.2.circlepath"
          accent="lavender"
          headerRight={
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/subscriptions', params: { create: '1', projectId } } as never)}
              accessibilityRole="button"
              accessibilityLabel={tr.subNew}
              hitSlop={4}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: tk.surface.subtle }}>
              <IconSymbol name="plus" size={16} color={c.text} />
            </TouchableOpacity>
          }>
        {projectSubscriptions.live.length === 0 ? (
          <Text style={[type.body, { color: c.sub, fontSize: 13 }]}>{tr.subProjectEmpty}</Text>
        ) : (
          <View>
            <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginBottom: 8 }}>{projectSubscriptions.monthlyLine}</Text>
            {projectSubscriptions.live.map(sub => {
              const overdue = subscriptionStatus(sub, projectSubscriptions.today ?? '') === 'overdue';
              return (
                <TouchableOpacity
                  key={sub.id}
                  onPress={() => router.push({ pathname: '/subscriptions', params: { open: sub.id } } as never)}
                  activeOpacity={0.75}
                  style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.nested, backgroundColor: tk.surface.subtle, padding: 16, marginBottom: 8, minHeight: 44 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sub.color || (project?.color ?? c.accent), marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{sub.name}</Text>
                    <Text style={{ color: overdue ? tk.status.danger : c.sub, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'], fontFamily: overdue ? fontFamily.semibold : fontFamily.regular }}>
                      {overdue ? `${tr.subOverdue} · ` : ''}{new Date(`${sub.nextPaymentDate}T00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <Text style={{ color: overdue ? tk.status.danger : c.text, fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
                    {formatSubscriptionMoney(sub.amount, sub.currency, allCurrencies, locale)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        </BentoCard>

        <BentoCard key="tx" title={tr.projectBudgetTransactions} icon="arrow.up.right" accent="coral">
        {projectTx.length === 0 ? (
          <Text style={[type.body, { color: c.sub, fontSize: 13 }]}>{tr.projectBudgetNoTransactions}</Text>
        ) : projectTx.map(tx => (
          <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.nested, backgroundColor: tk.surface.subtle, padding: 16, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{tx.category || tx.note || '—'}</Text>
              <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                {new Date(tx.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </Text>
            </View>
            {/* DS v2: витрати — червоні, доходи — зелені. */}
            <Text style={{ color: tk.status.danger, fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>-{tx.amount.toLocaleString(locale)}</Text>
          </View>
        ))}

        </BentoCard>

        {/* П4: доходи проєкту окремим списком — як на вебі. */}
        <BentoCard key="income" title={tr.finProjectIncomeTitle} icon="arrow.down.left" accent="success">
        {projectIncome.length === 0 ? (
          <Text style={[type.body, { color: c.sub, fontSize: 13 }]}>{tr.finProjectNoIncome}</Text>
        ) : projectIncome.map(tx => (
          <View key={tx.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.nested, backgroundColor: tk.surface.subtle, padding: 16, marginBottom: 8 }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{tx.category || tx.note || '—'}</Text>
              <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                {new Date(tx.date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </Text>
            </View>
            <Text style={{ color: tk.status.success, fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>+{Number(tx.amount).toLocaleString(locale)}</Text>
          </View>
        ))}
        </BentoCard>
        </BentoGrid>

        {/* Регулярні доходи проєкту — та сама секція, що у вкладці «Підписки». */}
        {projectId ? (
          <RecurringIncomesSection
            c={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, card: tk.surface.card, accent: c.accent, green: tk.status.success, red: tk.status.danger, sheet: glassOf(tk).sheet }}
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
          c={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: glassOf(tk).sheet }}
          tr={tr}
          isDark={isDark}
          busy={txBusy}
          error={txError}
        />
      ) : null}
    </ProjectScreenShell>
  );
}
