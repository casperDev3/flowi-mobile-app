/**
 * components/finance/RecurringIncomesSection.tsx — «Регулярні доходи» у вкладці
 * «Підписки» (finance-revamp.md §4.2, §9.5).
 *
 * Дзеркало підписок у зворотний бік: список із підсумком «/міс», форма,
 * архів, і дія «Отримано» — ЗВИЧАЙНА операція type='income' + зсув дати
 * наступного надходження (receiveRecurringIncome). Зворотного посилання з
 * операції на дохід немає: видалення операції дату не чіпає.
 *
 * Запис — завжди read-modify-write свіжого сховища (updateSynced): записи,
 * що приїхали синком, мають пережити збереження. Порядок «Отримано» — спершу
 * дохід (там захист від повторного отримання того самого циклу), потім
 * операція: гірший випадок — зсунутий цикл без операції, яку людина бачить і
 * додасть руками, а не подвійний дохід.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { loadDataResult } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import type { Translations } from '@/store/translations';
import { activeAccounts, type Account } from '@/utils/accounts';
import {
  buildRecurringIncome, compactRecord, newRecurringIncomeId, normalizeRecurringIncome, normalizeRecurringIncomes,
  receiveRecurringIncome, recurringIncomeDraftError, recurringIncomeStatus, recurringIncomeToDraft,
  recurringIncomeTotals, RECURRING_INCOMES_KEY, sortRecurringIncomes,
  type RecurringIncome, type RecurringIncomeDraft,
} from '@/utils/finance/recurring';
import { BUILTIN_CURRENCIES, type Currency, type Transaction } from '@/utils/financeUtils';
import {
  addPeriod, dateKeyOf, formatDateKey, formatPeriod, formatSubscriptionMoney, formatTotalsLine,
  PERIOD_UNITS, periodUnitLabel,
  type PeriodUnit,
} from '@/utils/subscriptions';
import { uuidV4 } from '@/utils/uuid';
import type { FinColors } from './financeLabels';

type RawItem = { id: string } & Record<string, unknown>;

const KEYS = [RECURRING_INCOMES_KEY, 'accounts', 'finance_currencies', 'categories', 'finance_primary_currency'] as const;

function emptyDraft(today: string, currency: string, projectId?: string): RecurringIncomeDraft {
  return { ...recurringIncomeToDraft(null, { currency, today }), projectId: projectId ?? '' };
}

export function RecurringIncomesSection({ c, tr, lang, isDark, projectId }: {
  c: FinColors;
  tr: Translations;
  lang: 'uk' | 'en';
  isDark: boolean;
  /** Показати лише доходи проєкту й створювати нові з цим projectId. */
  projectId?: string;
}) {
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { isWide, height } = useResponsive();
  const [items, setItems] = useState<RecurringIncome[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>(BUILTIN_CURRENCIES);
  const [incomeCategories, setIncomeCategories] = useState<string[]>([]);
  const [primary, setPrimary] = useState('UAH');
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<{ editing: RecurringIncome | null; draft: RecurringIncomeDraft } | null>(null);
  const [formError, setFormError] = useState(false);
  const [receive, setReceive] = useState<{ id: string; date: string; amount: string; accountId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const today = dateKeyOf(new Date());

  const load = useCallback(async () => {
    const [raw, accs, cur, cats, prim] = await Promise.all([
      loadDataResult<unknown>(RECURRING_INCOMES_KEY, []),
      loadDataResult<Account[]>('accounts', []),
      loadDataResult<Currency[]>('finance_currencies', []),
      loadDataResult<unknown>('categories', []),
      loadDataResult<string>('finance_primary_currency', 'UAH'),
    ]);
    if (raw.ok) setItems(sortRecurringIncomes(normalizeRecurringIncomes(Array.isArray(raw.value) ? raw.value : [])));
    if (accs.ok) setAccounts(Array.isArray(accs.value) ? accs.value : []);
    if (cur.ok && Array.isArray(cur.value)) {
      setCurrencies([...BUILTIN_CURRENCIES, ...cur.value.filter(x => x && !BUILTIN_CURRENCIES.some(b => b.code === x.code))]);
    }
    if (cats.ok && Array.isArray(cats.value)) {
      setIncomeCategories((cats.value as { type?: string; name?: string }[])
        .filter(r => r && r.type === 'income' && typeof r.name === 'string' && r.name)
        .map(r => r.name as string));
    }
    if (prim.ok && typeof prim.value === 'string' && prim.value) setPrimary(prim.value);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch(e => { if (__DEV__) console.warn('[recurring] не прочиталось:', e); });
  }, [load]);
  const trackWrite = useStorageRefresh(KEYS, () => load(), loaded);

  const visible = useMemo(
    () => (projectId ? items.filter(i => i.projectId === projectId) : items),
    [items, projectId],
  );
  const live = visible.filter(i => recurringIncomeStatus(i, today) !== 'archived');
  const archived = visible.filter(i => recurringIncomeStatus(i, today) === 'archived');
  // §9.5: для доходів — ТА САМА totalsByCurrency, що в підписок.
  const totals = useMemo(() => recurringIncomeTotals(live, today), [live, today]);
  const usableAccounts = useMemo(() => activeAccounts(accounts), [accounts]);
  const money = (n: number, code: string) => formatSubscriptionMoney(n, code, currencies, locale);

  const mutate = useCallback(async (fn: (raw: RawItem[]) => RawItem[]) => {
    await trackWrite(async () => { await updateSynced<RawItem>(RECURRING_INCOMES_KEY, fn); });
    await load();
  }, [trackWrite, load]);

  const reportError = useCallback((e: unknown) => {
    if (__DEV__) console.warn('[recurring] запис не вдався:', e);
    Alert.alert(tr.finRiSaveFailed);
  }, [tr]);

  const submit = useCallback(async () => {
    if (!form) return;
    if (recurringIncomeDraftError(form.draft)) { setFormError(true); return; }
    const full = buildRecurringIncome(form.draft, form.editing, { id: newRecurringIncomeId() });
    setBusy(true);
    try {
      await mutate(raw => {
        const idx = raw.findIndex(r => r && r.id === full.id);
        if (idx < 0) return [...raw, compactRecord(full) as unknown as RawItem];
        // Правка — поверх СВІЖОГО запису: невідомі поля новіших клієнтів
        // лишаються, а поле, яке форма очистила (undefined), прибирається.
        const merged: RawItem = { ...raw[idx] };
        for (const [k, v] of Object.entries(full)) {
          if (v === undefined) delete merged[k]; else merged[k] = v;
        }
        const next = [...raw];
        next[idx] = merged;
        return next;
      });
      setForm(null);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [form, mutate, reportError]);

  const setArchived = useCallback(async (item: RecurringIncome, on: boolean) => {
    setBusy(true);
    try {
      await mutate(raw => raw.map(r => {
        if (!r || r.id !== item.id) return r;
        const next: RawItem = { ...r, updatedAt: new Date().toISOString() };
        if (on) next.archivedAt = new Date().toISOString(); else delete next.archivedAt;
        return next;
      }));
      setForm(null);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [mutate, reportError]);

  const remove = useCallback((item: RecurringIncome) => {
    Alert.alert(tr.finRiDelete, tr.finRiDeleteConfirm.replace('{name}', item.name), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          void mutate(raw => raw.filter(r => !r || r.id !== item.id))
            .then(() => setForm(null))
            .catch(reportError);
        },
      },
    ]);
  }, [mutate, reportError, tr]);

  const openReceive = (item: RecurringIncome) => {
    const fallbackAccount = item.accountId && usableAccounts.some(a => a.id === item.accountId)
      ? item.accountId
      : (usableAccounts.find(a => a.currency === item.currency)?.id ?? '');
    setReceive({ id: item.id, date: item.nextPaymentDate, amount: String(item.amount), accountId: fallbackAccount });
  };

  const receiveItem = receive ? items.find(i => i.id === receive.id) ?? null : null;
  const receiveAmount = receive ? Number(receive.amount.replace(/\s/g, '').replace(',', '.')) : NaN;
  const receiveValid = Number.isFinite(receiveAmount) && receiveAmount > 0;
  const receiveAccount = receive ? usableAccounts.find(a => a.id === receive.accountId) : undefined;

  const confirmReceive = useCallback(async () => {
    if (!receive || !receiveValid) return;
    setBusy(true);
    let tx: Transaction | null = null;
    try {
      await trackWrite(async () => {
        await updateSynced<RawItem>(RECURRING_INCOMES_KEY, raw => {
          let changed = false;
          const next = raw.map(r => {
            if (!r || r.id !== receive.id) return r;
            const item = normalizeRecurringIncome(r);
            // Цикл уже отримали на іншому пристрої (pull між відкриттям і
            // тапом) — вдруге не зсуваємо й операцію не створюємо.
            if (!item || item.nextPaymentDate !== receive.date) return r;
            const result = receiveRecurringIncome(item, {
              id: uuidV4(),
              accountId: receiveAccount?.id,
              currency: receiveAccount?.currency,
              amount: receiveAmount,
              fallbackCategory: tr.finRiDefaultCategory,
            });
            tx = result.transaction;
            changed = true;
            return {
              ...r,
              nextPaymentDate: result.income.nextPaymentDate,
              history: result.income.history,
              updatedAt: result.income.updatedAt,
            };
          });
          return changed ? next : raw;
        });
        const created = tx as Transaction | null;
        if (created) await updateSynced<Transaction>('transactions', fresh => [...fresh, created]);
      }, [RECURRING_INCOMES_KEY]);
      await load();
      setReceive(null);
      if (!tx) Alert.alert(tr.finRiStale);
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
    }
  }, [receive, receiveValid, receiveAmount, receiveAccount, trackWrite, load, reportError, tr]);

  const rowOf = (item: RecurringIncome) => {
    const status = recurringIncomeStatus(item, today);
    const overdue = status === 'overdue';
    return (
      <View key={item.id} style={[st.row, { borderColor: c.border, backgroundColor: c.dim }]}>
        <TouchableOpacity
          onPress={() => { setFormError(false); setForm({ editing: item, draft: draftOf(item) }); }}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${money(item.amount, item.currency)}, ${formatDateKey(item.nextPaymentDate, locale)}`}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
          <View style={[st.icon, { backgroundColor: (item.color || c.green) + '22' }]}>
            <IconSymbol name={(item.icon || 'arrow.down.circle') as IconSymbolName} size={16} color={item.color || c.green} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
            <Text style={{ color: overdue ? c.red : c.sub, fontSize: 11, marginTop: 2, fontWeight: overdue ? '700' : '400' }}>
              {overdue ? `${tr.subOverdue} · ` : ''}{formatDateKey(item.nextPaymentDate, locale)} · {formatPeriod(item.period, lang)}
            </Text>
          </View>
          <Text style={{ color: c.green, fontSize: 14, fontWeight: '800' }}>+{money(item.amount, item.currency)}</Text>
        </TouchableOpacity>
        {status !== 'archived' ? (
          <TouchableOpacity
            onPress={() => openReceive(item)}
            accessibilityRole="button"
            accessibilityLabel={`${tr.finRiReceived}: ${item.name}`}
            style={[st.receiveBtn, { borderColor: c.green + '66', backgroundColor: c.green + '14' }]}>
            <IconSymbol name="checkmark" size={12} color={c.green} />
            <Text style={{ color: c.green, fontSize: 12, fontWeight: '700' }}>{tr.finRiReceived}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const draft = form?.draft;
  const setDraft = (patch: Partial<RecurringIncomeDraft>) =>
    setForm(prev => (prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev));
  const inputBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';

  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[st.section, { color: c.sub, flex: 1 }]}>{tr.finRecurringIncomes}</Text>
        <TouchableOpacity
          onPress={() => { setFormError(false); setForm({ editing: null, draft: emptyDraft(today, primary, projectId) }); }}
          accessibilityRole="button"
          accessibilityLabel={tr.finRiNew}
          style={st.addIcon}>
          <IconSymbol name="plus" size={17} color={c.accent} />
        </TouchableOpacity>
      </View>
      {totals.length > 0 ? (
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>
          {formatTotalsLine(totals, 'monthly', tr.subPerMonth, currencies, locale)}
        </Text>
      ) : null}
      {live.length === 0 && loaded ? (
        <Text style={{ color: c.sub, fontSize: 13, marginBottom: 8 }}>{tr.finRiEmpty}</Text>
      ) : null}
      <View style={{ gap: 8 }}>{live.map(rowOf)}</View>

      {archived.length > 0 ? (
        <>
          <TouchableOpacity
            onPress={() => setShowArchive(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchive }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 6 }}>
            <IconSymbol name={showArchive ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>
              {tr.subArchiveCount.replace('{count}', String(archived.length))}
            </Text>
          </TouchableOpacity>
          {showArchive ? <View style={{ gap: 8 }}>{archived.map(rowOf)}</View> : null}
        </>
      ) : null}

      {/* Форма доходу */}
      <SheetModal visible={!!form} onClose={() => setForm(null)}>
        <View style={[st.sheet, sheetColumnStyle(isWide), { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[st.handle, { backgroundColor: c.border }]} />
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>
              {form?.editing ? tr.finRiEdit : tr.finRiNew}
            </Text>
            {draft ? (
              <>
                <Text style={[st.label, { color: c.sub }]}>{tr.finRiName}</Text>
                <TextInput
                  value={draft.name}
                  onChangeText={name => setDraft({ name })}
                  accessibilityLabel={tr.finRiName}
                  placeholder={tr.finRiNamePlaceholder}
                  placeholderTextColor={c.sub}
                  style={[st.input, { color: c.text, backgroundColor: inputBg }]}
                />
                <Text style={[st.label, { color: c.sub }]}>{tr.amount}</Text>
                <TextInput
                  value={draft.amount}
                  onChangeText={amount => setDraft({ amount })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={c.sub}
                  accessibilityLabel={tr.amount}
                  style={[st.input, { color: c.text, backgroundColor: inputBg }]}
                />
                <ChipRow
                  items={currencies.map(cur => ({ id: cur.code, label: cur.code }))}
                  value={draft.currency}
                  onChange={currency => setDraft({ currency })}
                  c={c}
                />
                <Text style={[st.label, { color: c.sub }]}>{tr.finRiEvery}</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <TextInput
                    value={draft.every}
                    onChangeText={v => setDraft({ every: v.replace(/\D/g, '').slice(0, 2) })}
                    keyboardType="number-pad"
                    accessibilityLabel={tr.finRiEvery}
                    style={[st.input, { color: c.text, backgroundColor: inputBg, width: 64, flex: 0 }]}
                  />
                  <View style={{ flex: 1 }}>
                    <ChipRow
                      items={PERIOD_UNITS.map(u => ({ id: u, label: periodUnitLabel(u, Number(draft.every) || 1, lang) }))}
                      value={draft.unit}
                      onChange={unit => setDraft({ unit: unit as PeriodUnit })}
                      c={c}
                    />
                  </View>
                </View>
                <Text style={[st.label, { color: c.sub }]}>{tr.finRiNext}</Text>
                <TextInput
                  value={draft.nextPaymentDate}
                  onChangeText={nextPaymentDate => setDraft({ nextPaymentDate: nextPaymentDate.trim() })}
                  placeholder={today}
                  placeholderTextColor={c.sub}
                  autoCapitalize="none"
                  accessibilityLabel={tr.finRiNext}
                  style={[st.input, { color: c.text, backgroundColor: inputBg }]}
                />
                {usableAccounts.length > 0 ? (
                  <>
                    <Text style={[st.label, { color: c.sub }]}>{tr.account}</Text>
                    <ChipRow
                      items={[{ id: '', label: tr.finRiNoAccount }, ...usableAccounts.map(a => ({ id: a.id, label: `${a.name} · ${a.currency}` }))]}
                      value={draft.accountId}
                      onChange={accountId => {
                        const acc = usableAccounts.find(a => a.id === accountId);
                        setDraft({ accountId, ...(acc ? { currency: acc.currency } : {}) });
                      }}
                      c={c}
                    />
                  </>
                ) : null}
                {incomeCategories.length > 0 ? (
                  <>
                    <Text style={[st.label, { color: c.sub }]}>{tr.category}</Text>
                    <ChipRow
                      items={incomeCategories.map(n => ({ id: n, label: n }))}
                      value={draft.category}
                      onChange={category => setDraft({ category: category === draft.category ? '' : category })}
                      c={c}
                    />
                  </>
                ) : null}
                {formError ? (
                  <Text style={{ color: c.red, fontSize: 12, marginTop: 10 }}>{tr.finRiInvalid}</Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => { void submit(); }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy }}
                  style={[st.primary, { backgroundColor: c.accent, marginTop: 18 }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
                </TouchableOpacity>
                {form?.editing ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() => { if (form.editing) void setArchived(form.editing, !form.editing.archivedAt); }}
                      accessibilityRole="button"
                      style={[st.secondary, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.text, fontWeight: '600' }}>
                        {form.editing.archivedAt ? tr.finRiRestore : tr.finRiArchive}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { if (form.editing) remove(form.editing); }}
                      accessibilityRole="button"
                      style={[st.secondary, { borderColor: c.red + '55', backgroundColor: c.red + '12' }]}>
                      <Text style={{ color: c.red, fontWeight: '600' }}>{tr.delete}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </SheetModal>

      {/* «Отримано» */}
      <SheetModal visible={!!receive} onClose={() => setReceive(null)}>
        <View style={[st.sheet, sheetColumnStyle(isWide), { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[st.handle, { backgroundColor: c.border }]} />
            {receive && receiveItem ? (
              <>
                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{tr.finRiReceiveTitle}</Text>
                <Text numberOfLines={2} style={{ color: c.text, fontSize: 19, fontWeight: '800', marginTop: 4 }}>{receiveItem.name}</Text>
                <Text style={[st.label, { color: c.sub }]}>{tr.amount} ({receiveAccount?.currency || receiveItem.currency})</Text>
                <TextInput
                  value={receive.amount}
                  onChangeText={amount => setReceive(prev => (prev ? { ...prev, amount } : prev))}
                  keyboardType="decimal-pad"
                  accessibilityLabel={tr.amount}
                  style={[st.input, { color: c.text, backgroundColor: inputBg, borderWidth: 1, borderColor: receiveValid ? 'transparent' : c.red }]}
                />
                {usableAccounts.length > 0 ? (
                  <>
                    <Text style={[st.label, { color: c.sub }]}>{tr.account}</Text>
                    <ChipRow
                      items={[{ id: '', label: tr.finRiNoAccount }, ...usableAccounts.map(a => ({ id: a.id, label: `${a.name} · ${a.currency}` }))]}
                      value={receive.accountId}
                      onChange={accountId => setReceive(prev => (prev ? { ...prev, accountId } : prev))}
                      c={c}
                    />
                  </>
                ) : null}
                <Text style={{ color: c.sub, fontSize: 12, lineHeight: 18, marginTop: 10 }}>
                  {tr.finRiReceiveHint
                    .replace('{category}', (receiveItem.category ?? '').trim() || tr.finRiDefaultCategory)
                    .replace('{account}', receiveAccount ? `${receiveAccount.name} · ${receiveAccount.currency}` : tr.finRiNoAccount)
                    .replace('{date}', formatDateKey(addPeriod(receiveItem.nextPaymentDate, receiveItem.period, receiveItem.billingDay), locale))}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                  <TouchableOpacity
                    onPress={() => setReceive(null)}
                    accessibilityRole="button"
                    style={[st.secondary, { borderColor: c.border, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { void confirmReceive(); }}
                    disabled={!receiveValid || busy}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !receiveValid || busy }}
                    accessibilityLabel={tr.finRiReceived}
                    style={[st.primary, { flex: 1.6, backgroundColor: receiveValid && !busy ? c.green : c.dim }]}>
                    <Text style={{ color: receiveValid && !busy ? '#fff' : c.sub, fontWeight: '700' }}>{tr.finRiReceived}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </SheetModal>
    </View>
  );
}

function draftOf(item: RecurringIncome): RecurringIncomeDraft {
  return recurringIncomeToDraft(item, { currency: item.currency, today: item.nextPaymentDate });
}

function ChipRow({ items, value, onChange, c }: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  c: FinColors;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 6, paddingVertical: 6 }}
      accessibilityRole="radiogroup">
      {items.map(item => {
        const on = item.id === value;
        return (
          <TouchableOpacity
            key={item.id || '__none'}
            onPress={() => onChange(item.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={item.label}
            style={[st.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '18' : 'transparent' }]}>
            <Text numberOfLines={1} style={{ color: on ? c.accent : c.sub, fontSize: 12, fontWeight: '700', maxWidth: 180 }}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  addIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  receiveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 36 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { flex: 1, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  secondary: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
