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
import { fontFamily, radius, shadow, space, type as dsType } from '@/constants/theme';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useDS } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';
import type { Translations } from '@/store/translations';
import { activeAccounts, defaultAccountId, type Account } from '@/utils/accounts';
import { buildProjectTransaction } from '@/utils/budgetProject';
import type { Transaction } from '@/utils/financeUtils';
import { GlassBackdrop } from '@/components/ds';
import { useGlassStyles } from '@/components/finance/finPalette';

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

  const account = usable.find((a) => a.id === accountId);
  const canSave = usable.length > 0 && !!account && !busy;
  const { t: ds } = useDS();
  const gs = useGlassStyles();
  const inputBg = (gs.subtle.backgroundColor as string);

  const submit = () => {
    const tx = buildProjectTransaction({ type, amount, category, note, account, projectId, now: new Date() });
    if (!tx) { setInvalid(true); return; }
    onSubmit(tx);
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.sheet, sheetColumnStyle(isWide), { ...gs.strong, maxHeight: height * 0.88 }, shadow[isDark ? 'dark' : 'light'].popover]}>
        <GlassBackdrop style={{ borderRadius: 24, overflow: 'hidden' }} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[st.handle, { backgroundColor: ds.text.muted }]} />
          <Text style={{ color: ds.text.primary, fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold, marginBottom: 12 }}>{tr.finProjectTxTitle}</Text>

          <View accessibilityRole="radiogroup" style={[st.segment, { ...gs.subtle }]}>
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
                  style={[st.segmentBtn, on && { backgroundColor: ds.action.primary }]}>
                  <Text style={{ color: on ? ds.text.onAction : ds.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.label, { color: ds.text.secondary }]}>{tr.amount}{account ? ` (${account.currency})` : ""}
            <Text style={{ color: ds.status.danger }}> *</Text>
          </Text>
          <TextInput
            value={amount}
            onChangeText={v => { setAmount(v); setInvalid(false); }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={ds.text.muted}
            accessibilityLabel={tr.amount}
            style={[st.input, { color: ds.text.primary, backgroundColor: inputBg, borderColor: invalid ? ds.status.danger : 'transparent' }]}
          />
          {invalid ? (
            <Text style={{ color: ds.status.danger, fontSize: 12, marginTop: 4 }}>
              {tr.finProjectInvalid}
            </Text>
          ) : null}

          <Text style={[st.label, { color: ds.text.secondary }]}>{tr.account}</Text>
          {usable.length === 0 ? (
            <Text style={{ ...dsType.body, color: ds.text.secondary }}>
              {tr.finProjectNeedAccount}
            </Text>
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
              <Text style={[st.label, { color: ds.text.secondary }]}>{tr.category}</Text>
              <ChipRow
                items={categories[type].map(n => ({ id: n, label: n }))}
                value={category}
                onChange={v => setCategory(v === category ? '' : v)}
                c={c}
              />
            </>
          ) : null}

          <Text style={[st.label, { color: ds.text.secondary }]}>{tr.note}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            accessibilityLabel={tr.note}
            placeholderTextColor={ds.text.muted}
            style={[st.input, { color: ds.text.primary, backgroundColor: inputBg, borderColor: 'transparent' }]}
          />

          {error ? (
            <Text style={{ color: ds.status.danger, fontSize: 12, marginTop: 10 }}>
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              style={[st.btn, { ...gs.subtle }]}>
              <Text style={{ ...dsType.label, color: ds.action.secondaryText }}>
                {tr.cancel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={submit}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              accessibilityLabel={tr.save}
              style={[st.btn, { flex: 1.6, backgroundColor: canSave ? ds.action.primary : ds.state.disabledBg }]}>
              <Text style={{ ...dsType.label, color: canSave ? ds.text.onAction : ds.state.disabledText }}>
                {tr.save}
              </Text>
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
  const { t: ds } = useDS();
  const gs = useGlassStyles();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
      {items.map((item) => {
        const on = item.id === value;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onChange(item.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={item.label}
            style={[st.chip, { backgroundColor: on ? ds.action.primary : (gs.subtle.backgroundColor as string) }]}>
            <Text numberOfLines={1} style={{ color: on ? ds.text.onAction : ds.text.primary, fontSize: 13, fontFamily: fontFamily.semibold, maxWidth: 180 }}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.cardPadding, paddingBottom: 36 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  segmentBtn: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 16, marginBottom: 6 },
  input: { minHeight: 48, borderRadius: radius.control, paddingHorizontal: space[4], fontSize: 18, fontFamily: fontFamily.medium, borderWidth: 1, ...dsType.numeric },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  btn: { flex: 1, minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
