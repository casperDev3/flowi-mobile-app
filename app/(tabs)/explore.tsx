import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TxType = 'income' | 'expense';

interface Transaction {
  id: string; type: TxType; category: string; amount: number; note: string; date: Date;
}

const CATEGORIES: Record<TxType, string[]> = {
  income:  ['Зарплата', 'Фріланс', 'Інвестиції', 'Подарунок', 'Інше'],
  expense: ['Їжа', 'Транспорт', 'Розваги', 'Здоров\'я', 'Комунальні', 'Одяг', 'Інше'],
};

const d = (daysAgo: number) => { const dt = new Date(); dt.setDate(dt.getDate() - daysAgo); return dt; };

const INITIAL: Transaction[] = [
  { id: '1', type: 'income',  category: 'Зарплата',  amount: 45000, note: 'Березень 2026',      date: d(0) },
  { id: '2', type: 'expense', category: 'Їжа',       amount: 3200,  note: 'Тиждень продуктів',  date: d(0) },
  { id: '3', type: 'income',  category: 'Фріланс',   amount: 12000, note: 'Проект X',            date: d(1) },
  { id: '4', type: 'expense', category: 'Транспорт', amount: 800,   note: 'Метро та таксі',      date: d(1) },
  { id: '5', type: 'expense', category: 'Розваги',   amount: 1500,  note: 'Кіно + ресторан',     date: d(3) },
  { id: '6', type: 'expense', category: 'Здоров\'я', amount: 600,   note: 'Аптека',              date: d(3) },
];

const fmt = (n: number) => n.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 });

const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

function groupLabel(date: Date) {
  if (date.toDateString() === today.toDateString()) return 'Сьогодні';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

export default function FinanceScreen() {
  const isDark = useColorScheme() === 'dark';
  const [txs, setTxs] = useState<Transaction[]>(INITIAL);
  const [filter, setFilter] = useState<'all' | TxType>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;

  const filtered = useMemo(() => txs.filter(t => filter === 'all' || t.type === filter), [txs, filter]);

  // Group by date
  const groups = useMemo(() => {
    const map: Record<string, { label: string; items: Transaction[]; dayIncome: number; dayExpense: number }> = {};
    const order: string[] = [];
    filtered.forEach(t => {
      const key = t.date.toDateString();
      if (!map[key]) { map[key] = { label: groupLabel(t.date), items: [], dayIncome: 0, dayExpense: 0 }; order.push(key); }
      map[key].items.push(t);
      if (t.type === 'income') map[key].dayIncome += t.amount;
      else map[key].dayExpense += t.amount;
    });
    return order.map(k => map[k]);
  }, [filtered]);

  const addTx = () => {
    const num = parseFloat(amount.replace(',', '.'));
    if (!num || num <= 0 || !category) return;
    setTxs(p => [{ id: Date.now().toString(), type: txType, category, amount: num, note: note.trim(), date: new Date() }, ...p]);
    setAmount(''); setCategory(''); setNote(''); setShowAdd(false);
  };

  const deleteTx = (id: string) => { setTxs(p => p.filter(t => t.id !== id)); if (selected?.id === id) setSelected(null); };

  const c = {
    bg1: isDark ? '#080E18' : '#EFF5FF',
    bg2: isDark ? '#0F1A2E' : '#E0ECFF',
    card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(195,215,255,0.5)',
    text: isDark ? '#EFF5FF' : '#0A1929',
    sub: isDark ? 'rgba(239,245,255,0.45)' : 'rgba(10,25,41,0.45)',
    green: '#10B981',
    red: '#EF4444',
    accent: '#0EA5E9',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet: isDark ? 'rgba(8,14,24,0.98)' : 'rgba(250,253,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 104 : 84 }} showsVerticalScrollIndicator={false}>

          <View style={{ marginTop: 10, marginBottom: 24 }}>
            <Text style={[s.pageTitle, { color: c.text }]}>Фінанси</Text>
          </View>

          {/* Balance Card */}
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.balCard, { borderColor: c.border }]}>
            <Text style={[s.balLabel, { color: c.sub }]}>Баланс</Text>
            <Text style={[s.balAmount, { color: balance >= 0 ? c.green : c.red }]}>{fmt(balance)}</Text>
            <View style={[s.divider, { backgroundColor: c.border, marginVertical: 14 }]} />
            <View style={{ flexDirection: 'row' }}>
              <SummaryItem icon="arrow.up.trend" label="Доходи" value={fmt(income)} color={c.green} text={c.text} sub={c.sub} />
              <View style={{ width: 1, backgroundColor: c.border }} />
              <SummaryItem icon="arrow.down.trend" label="Витрати" value={fmt(expense)} color={c.red} text={c.text} sub={c.sub} />
            </View>
            {income > 0 && (
              <>
                <View style={[s.divider, { backgroundColor: c.border, marginTop: 14, marginBottom: 10 }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.miniLabel, { color: c.sub, marginBottom: 5 }]}>Заощадження</Text>
                    <View style={s.progressBg}>
                      <View style={[s.progressFill, { width: `${savingsPct}%`, backgroundColor: c.green }]} />
                    </View>
                  </View>
                  <Text style={{ color: c.green, fontSize: 17, fontWeight: '800' }}>{savingsPct}%</Text>
                </View>
              </>
            )}
          </BlurView>

          {/* Filters */}
          <View style={[s.filterRow, { backgroundColor: c.card, borderColor: c.border, marginTop: 14, marginBottom: 20 }]}>
            {(['all', 'income', 'expense'] as const).map(f => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[s.filterBtn, filter === f && { backgroundColor: f === 'income' ? c.green : f === 'expense' ? c.red : c.accent }]}>
                <Text style={[s.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                  {f === 'all' ? 'Всі' : f === 'income' ? 'Доходи' : 'Витрати'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Grouped transactions */}
          {groups.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <IconSymbol name="banknote" size={36} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '500' }}>Немає транзакцій</Text>
            </View>
          )}
          {groups.map(group => (
            <View key={group.label} style={{ marginBottom: 4 }}>
              {/* Group header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{group.label}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {group.dayIncome > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <IconSymbol name="arrow.up.trend" size={11} color={c.green} />
                      <Text style={{ color: c.green, fontSize: 11, fontWeight: '700' }}>{fmt(group.dayIncome)}</Text>
                    </View>
                  )}
                  {group.dayExpense > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <IconSymbol name="arrow.down.trend" size={11} color={c.red} />
                      <Text style={{ color: c.red, fontSize: 11, fontWeight: '700' }}>{fmt(group.dayExpense)}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ gap: 7 }}>
                {group.items.map(tx => {
                  const isIncome = tx.type === 'income';
                  const color = isIncome ? c.green : c.red;
                  return (
                    <TouchableOpacity key={tx.id} activeOpacity={0.7} onPress={() => setSelected(tx)}>
                      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.txCard, { borderColor: c.border }]}>
                        <View style={[s.txIcon, { backgroundColor: color + (isDark ? '22' : '15') }]}>
                          <IconSymbol name={isIncome ? 'arrow.up.trend' : 'arrow.down.trend'} size={17} color={color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={[s.txCategory, { color: c.text }]}>{tx.category}</Text>
                          {tx.note ? <Text style={[s.txNote, { color: c.sub }]} numberOfLines={1}>{tx.note}</Text> : null}
                        </View>
                        <Text style={[s.txAmount, { color }]}>{isIncome ? '+' : '−'}{fmt(tx.amount)}</Text>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.fab, { backgroundColor: c.accent }]} activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Add Modal */}
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={[s.handle, { backgroundColor: c.border }]} />
              <Text style={[s.sheetTitle, { color: c.text }]}>Нова транзакція</Text>
              <View style={[s.typeRow, { backgroundColor: c.dim }]}>
                {(['income', 'expense'] as TxType[]).map(t => (
                  <TouchableOpacity key={t} onPress={() => { setTxType(t); setCategory(''); }} style={[s.typeBtn, txType === t && { backgroundColor: t === 'income' ? c.green : c.red }]}>
                    <IconSymbol name={t === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={14} color={txType === t ? '#fff' : c.sub} />
                    <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: txType === t ? '#fff' : c.sub }}>
                      {t === 'income' ? 'Дохід' : 'Витрата'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput placeholder="Сума (₴)" placeholderTextColor={c.sub} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={[s.input, { backgroundColor: c.dim, color: c.text, marginTop: 10 }]} />
              <Text style={[s.label, { color: c.sub }]}>Категорія</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 7 }}>
                  {CATEGORIES[txType].map(cat => (
                    <TouchableOpacity key={cat} onPress={() => setCategory(cat)} style={[s.catChip, { backgroundColor: category === cat ? c.accent : c.dim, borderColor: category === cat ? c.accent : c.border }]}>
                      <Text style={{ color: category === cat ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TextInput placeholder="Нотатка" placeholderTextColor={c.sub} value={note} onChangeText={setNote} style={[s.input, { backgroundColor: c.dim, color: c.text, marginTop: 8 }]} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                  <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addTx} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Додати</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <Pressable style={s.overlay} onPress={() => setSelected(null)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            {selected && (
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <View style={[s.detailIcon, { backgroundColor: (selected.type === 'income' ? c.green : c.red) + '20' }]}>
                    <IconSymbol name={selected.type === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={28} color={selected.type === 'income' ? c.green : c.red} />
                  </View>
                  <Text style={[s.detailAmount, { color: selected.type === 'income' ? c.green : c.red, marginTop: 12 }]}>
                    {selected.type === 'income' ? '+' : '−'}{fmt(selected.amount)}
                  </Text>
                  <Text style={[s.detailCat, { color: c.text }]}>{selected.category}</Text>
                </View>
                <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <InfoRow icon="tag" label="Тип" value={selected.type === 'income' ? 'Дохід' : 'Витрата'} color={selected.type === 'income' ? c.green : c.red} text={c.text} sub={c.sub} border={c.border} last={!selected.note} />
                  {selected.note ? <InfoRow icon="doc.text" label="Нотатка" value={selected.note} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} /> : null}
                  <InfoRow icon="calendar" label="Дата" value={selected.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} color={c.sub} text={c.text} sub={c.sub} border={c.border} last />
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                  <TouchableOpacity onPress={() => deleteTx(selected.id)} style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                    <IconSymbol name="trash" size={15} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>Видалити</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Закрити</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SummaryItem({ icon, label, value, color, text, sub }: any) {
  return (
    <View style={{ flex: 1, padding: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <IconSymbol name={icon} size={13} color={color} />
        <Text style={{ color: sub, fontSize: 10, fontWeight: '600' }}>{label}</Text>
      </View>
      <Text style={{ color: text, fontSize: 15, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, color, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 12 }, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <IconSymbol name={icon} size={15} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontWeight: '600', width: 70, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  balCard: { borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden' },
  balLabel: { fontSize: 12, fontWeight: '600', marginBottom: 3 },
  balAmount: { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  divider: { height: 1 },
  miniLabel: { fontSize: 11, fontWeight: '600' },
  progressBg: { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  filterRow: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  filterBtn: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  groupLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  txCard: { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  txIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  txCategory: { fontSize: 14, fontWeight: '600' },
  txNote: { fontSize: 11, marginTop: 1 },
  txAmount: { fontSize: 14, fontWeight: '800' },
  fab: { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 104 : 84, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#0EA5E9', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  typeRow: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  typeBtn: { flex: 1, flexDirection: 'row', paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  input: { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  detailAmount: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  detailCat: { fontSize: 15, fontWeight: '600', marginTop: 3 },
  infoBlock: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
});
