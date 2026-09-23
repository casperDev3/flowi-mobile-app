/**
 * components/finance/ProjectTransactionForm.tsx — операція проєкту з телефона
 * (finance-revamp.md §10.2, П3).
 *
 * Та сама модель, що особиста операція (колекція `transactions`), з
 * передвстановленим `projectId`. Форма ПИТАЄ РАХУНОК (П2): операція без
 * рахунку потрапляє в «без рахунку» і не входить у жоден видимий баланс, тож
 * кожна така витрата додавала б людині ручної роботи. Валюта — рахунку.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import type { Translations } from '@/store/translations';
import { activeAccounts, defaultAccountId, type Account } from '@/utils/accounts';
import { buildProjectTransaction } from '@/utils/budgetProject';
import type { Transaction } from '@/utils/financeUtils';

interface Colors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
  sheet: string;
}

export function ProjectTransactionForm({
  visible, onClose, onSubmit, projectId, accounts, categories, c, tr, isDark, busy, error,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (tx: Transaction) => void;
  projectId: string;
  accounts: readonly Account[];
  /** Назви категорій за типом. */
  categories: Record<'income' | 'expense', string[]>;
  c: Colors;
  tr: Translations;
  isDark: boolean;
  busy: boolean;
  error: string | null;
}) {
  const { isWide, height } = useResponsive();
  const usable = useMemo(() => activeAccounts([...accounts]), [accounts]);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  // Скидаємо поля лише на ВІДКРИТТІ: рахунки перечитуються синком і поки
  // форма відкрита — це не привід стирати набране.
  const usableRef = useRef(usable);
  usableRef.current = usable;
  useEffect(() => {
    if (!visible) return;
    setType('expense'); setAmount(''); setCategory(''); setNote(''); setInvalid(false);
    setAccountId(defaultAccountId([...usableRef.current]));
  }, [visible]);

  const account = usable.find(a => a.id === accountId);
  const canSave = usable.length > 0 && !!account && !busy;
  const inputBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';

  const submit = () => {
    const tx = buildProjectTransaction({ type, amount, category, note, account, projectId, now: new Date() });
    if (!tx) { setInvalid(true); return; }
    onSubmit(tx);
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.sheet, sheetColumnStyle(isWide), { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border }]}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[st.handle, { backgroundColor: c.border }]} />
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>{tr.finProjectTxTitle}</Text>

          <View accessibilityRole="radiogroup" style={[st.segment, { backgroundColor: c.dim, borderColor: c.border }]}>
            {(['expense', 'income'] as const).map(t => {
              const on = t === type;
              const label = t === 'income' ? tr.income : tr.expense;
              return (
                <TouchableOpacity
                  key={t}
                  onPress={() => { setType(t); setCategory(''); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={label}
                  style={[st.segmentBtn, on && { backgroundColor: t === 'income' ? '#10B981' : '#EF4444' }]}>
                  <Text style={{ color: on ? '#fff' : c.sub, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.label, { color: c.sub }]}>{tr.amount}{account ? ` (${account.currency})` : ''}</Text>
          <TextInput
            value={amount}
            onChangeText={v => { setAmount(v); setInvalid(false); }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={c.sub}
            accessibilityLabel={tr.amount}
            style={[st.input, { color: c.text, backgroundColor: inputBg, borderColor: invalid ? '#EF4444' : 'transparent' }]}
          />
          {invalid ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4 }}>{tr.finProjectInvalid}</Text> : null}

          <Text style={[st.label, { color: c.sub }]}>{tr.account}</Text>
          {usable.length === 0 ? (
            <Text style={{ color: c.sub, fontSize: 13, lineHeight: 18 }}>{tr.finProjectNeedAccount}</Text>
          ) : (
            <ChipRow
              items={usable.map(a => ({ id: a.id, label: `${a.name} · ${a.currency}` }))}
              value={accountId ?? ''}
              onChange={setAccountId}
              c={c}
            />
          )}

          {categories[type].length > 0 ? (
            <>
              <Text style={[st.label, { color: c.sub }]}>{tr.category}</Text>
              <ChipRow
                items={categories[type].map(n => ({ id: n, label: n }))}
                value={category}
                onChange={v => setCategory(v === category ? '' : v)}
                c={c}
              />
            </>
          ) : null}

          <Text style={[st.label, { color: c.sub }]}>{tr.note}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            accessibilityLabel={tr.note}
            placeholderTextColor={c.sub}
            style={[st.input, { color: c.text, backgroundColor: inputBg, borderColor: 'transparent' }]}
          />

          {error ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 10 }}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              style={[st.btn, { backgroundColor: c.dim }]}>
              <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              accessibilityLabel={tr.save}
              style={[st.btn, { flex: 1.6, backgroundColor: canSave ? c.accent : c.dim }]}>
              <Text style={{ color: canSave ? '#fff' : c.sub, fontWeight: '700' }}>{tr.save}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SheetModal>
  );
}

function ChipRow({ items, value, onChange, c }: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  c: Colors;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {items.map(item => {
        const on = item.id === value;
        return (
          <TouchableOpacity
            key={item.id}
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
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 36 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  segment: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  segmentBtn: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, borderWidth: 1 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
