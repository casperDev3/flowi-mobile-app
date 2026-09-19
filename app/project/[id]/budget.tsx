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
import { budgetSpentThisMonth } from '@/utils/projectOverview';
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

  const loadAll = useCallback(async () => {
    const [b, tx, acc, cur, subs] = await Promise.all([
      loadData<ProjectBudgetRecord[]>('project_budgets', []),
      loadData<Transaction[]>('transactions', []),
      loadData<Account[]>('accounts', []),
      loadData<Currency[]>('finance_currencies', []),
      loadData<unknown>('subscriptions', []),
    ]);
    setBudgets(b); setTransactions(tx); setAccounts(acc); setCurrencies(cur);
    setSubscriptions(normalizeSubscriptions(subs));
  }, []);
  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  const trackWrite = useStorageRefresh(['project_budgets', 'transactions', 'accounts', 'finance_currencies', 'subscriptions'], loadAll);

  const budget = projectId ? budgets.find(b => b.id === projectId) : undefined;
  const currency = budget?.currency ?? 'UAH';
  const allCurrencies = useMemo(() => [...BUILTIN_CURRENCIES, ...currencies], [currencies]);

  const spent = useMemo(
    () => (projectId ? budgetSpentThisMonth(transactions, accounts, projectId, currency) : 0),
    [projectId, transactions, accounts, currency],
  );
  const projectTx = useMemo(
    () => (projectId ? transactions.filter(t => t.projectId === projectId && t.type === 'expense').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30) : []),
    [transactions, projectId],
  );

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
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>

        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 16, marginBottom: 20 }}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{tr.projectBudgetLimit}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TextInput
              placeholder={budget ? String(budget.amount) : '0'}
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
        </View>

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
      </ScrollView>
    </ProjectScreenShell>
  );
}
