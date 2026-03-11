import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

type TxType = 'income' | 'expense';

interface Transaction {
  id: string; type: TxType; category: string; amount: number; note: string; date: string;
}

const CATEGORIES: Record<TxType, string[]> = {
  income:  ['Зарплата', 'Фріланс', 'Інвестиції', 'Подарунок', 'Інше'],
  expense: ['Їжа', 'Транспорт', 'Розваги', "Здоров'я", 'Комунальні', 'Одяг', 'Інше'],
};

const CATEGORY_ICONS: Record<string, IconSymbolName> = {
  'Зарплата':    'briefcase.fill',
  'Фріланс':     'laptopcomputer',
  'Інвестиції':  'chart.line.uptrend.xyaxis',
  'Подарунок':   'gift.fill',
  'Їжа':         'fork.knife',
  'Транспорт':   'car.fill',
  'Розваги':     'gamecontroller.fill',
  "Здоров'я":    'cross.fill',
  'Комунальні':  'house.fill',
  'Одяг':        'tag.fill',
  'Інше':        'ellipsis.circle.fill',
};

const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WEEKDAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function groupLabel(date: Date) {
  if (date.toDateString() === today.toDateString()) return 'Сьогодні';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

const fmt = (n: number) => n.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 });

export default function FinanceScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [filter, setFilter] = useState<'all' | TxType>('all');
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [txType, setTxType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [compact, setCompact] = useState(false);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Load from storage
  useEffect(() => {
    loadData<Transaction[]>('transactions', []).then(data => {
      setTxs(data);
      setInitialized(true);
    });
  }, []);

  // Save to storage
  useEffect(() => {
    if (initialized) saveData('transactions', txs);
  }, [txs, initialized]);

  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const savingsPct = income > 0 ? Math.max(0, Math.round((balance / income) * 100)) : 0;

  const filtered = useMemo(() => txs.filter(t => {
    if (filter !== 'all' && t.type !== filter) return false;
    if (dateFilter) {
      const d = new Date(t.date);
      if (d.toDateString() !== dateFilter) return false;
    }
    return true;
  }), [txs, filter, dateFilter]);

  const groups = useMemo(() => {
    const map: Record<string, { label: string; items: Transaction[]; dayIncome: number; dayExpense: number }> = {};
    const order: string[] = [];
    filtered.forEach(t => {
      const d = new Date(t.date);
      const key = d.toDateString();
      if (!map[key]) { map[key] = { label: groupLabel(d), items: [], dayIncome: 0, dayExpense: 0 }; order.push(key); }
      map[key].items.push(t);
      if (t.type === 'income') map[key].dayIncome += t.amount;
      else map[key].dayExpense += t.amount;
    });
    return order.map(k => map[k]);
  }, [filtered]);

  const addTx = () => {
    const num = parseFloat(amount.replace(',', '.'));
    if (!num || num <= 0 || !category) return;
    setTxs(p => [{ id: Date.now().toString(), type: txType, category, amount: num, note: note.trim(), date: new Date().toISOString() }, ...p]);
    setAmount(''); setCategory(''); setNote(''); setShowAdd(false);
  };

  const deleteTx = (id: string) => { setTxs(p => p.filter(t => t.id !== id)); if (selected?.id === id) setSelected(null); };

  // Calendar helpers
  const firstDay = (() => { const d = new Date(calYear, calMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let i = 1; i <= daysInMonth; i++) calCells.push(i);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calWeeks = chunk(calCells, 7);

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    txs.forEach(t => {
      const d = new Date(t.date);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [txs]);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,170,240,0.4)',
    text:   isDark ? '#F4F2FF' : '#0A0818',
    sub:    isDark ? 'rgba(244,242,255,0.45)' : 'rgba(10,8,24,0.45)',
    green:  '#10B981',
    red:    '#EF4444',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>Фінанси</Text>
          <TouchableOpacity
            onPress={() => setCompact(v => !v)}
            style={[s.headerBtn, { backgroundColor: compact ? c.accent + '20' : c.dim, borderColor: compact ? c.accent : c.border }]}>
            <IconSymbol name={compact ? 'list.bullet' : 'rectangle.stack'} size={17} color={compact ? c.accent : c.sub} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowMenu(true)}
            style={[s.headerBtn, { backgroundColor: dateFilter ? c.accent + '20' : c.dim, borderColor: dateFilter ? c.accent : c.border }]}>
            <IconSymbol name="ellipsis" size={17} color={dateFilter ? c.accent : c.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}>

          {/* Date filter chip */}
          {dateFilter && (
            <TouchableOpacity
              onPress={() => setDateFilter(null)}
              style={[s.dateChip, { backgroundColor: c.accent + '20', borderColor: c.accent + '60' }]}>
              <IconSymbol name="calendar" size={13} color={c.accent} />
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                {new Date(dateFilter).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
              </Text>
              <IconSymbol name="xmark" size={13} color={c.accent} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}

          {/* Balance Card */}
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.balCard, { borderColor: c.border }]}>
            <Text style={[s.balLabel, { color: c.sub }]}>Баланс</Text>
            <Text style={[s.balAmount, { color: balance >= 0 ? c.green : c.red }]}>{fmt(balance)}</Text>
            <View style={[s.divider, { backgroundColor: c.border, marginVertical: 16 }]} />
            <View style={{ flexDirection: 'row' }}>
              <SummaryItem label="Доходи"  value={fmt(income)}  color={c.green} sub={c.sub} />
              <View style={{ width: 1, backgroundColor: c.border }} />
              <SummaryItem label="Витрати" value={fmt(expense)} color={c.red}   sub={c.sub} />
            </View>
            {income > 0 && (
              <>
                <View style={[s.divider, { backgroundColor: c.border, marginTop: 16, marginBottom: 12 }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.miniLabel, { color: c.sub, marginBottom: 6 }]}>Заощадження</Text>
                    <View style={s.progressBg}>
                      <View style={[s.progressFill, { width: `${savingsPct}%`, backgroundColor: c.green }]} />
                    </View>
                  </View>
                  <Text style={{ color: c.green, fontSize: 18, fontWeight: '800' }}>{savingsPct}%</Text>
                </View>
              </>
            )}
          </BlurView>

          {/* Filters */}
          <View style={[s.filterRow, { backgroundColor: c.card, borderColor: c.border, marginTop: 16, marginBottom: 22 }]}>
            {(['all', 'income', 'expense'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[s.filterBtn, filter === f && { backgroundColor: f === 'income' ? c.green : f === 'expense' ? c.red : c.accent }]}>
                <Text style={[s.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                  {f === 'all' ? 'Всі' : f === 'income' ? 'Доходи' : 'Витрати'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Empty state */}
          {groups.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <IconSymbol name="banknote" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>Немає транзакцій</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>Натисніть + щоб додати</Text>
            </View>
          )}

          {/* Grouped transactions */}
          {groups.map(group => (
            <View key={group.label} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{group.label}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
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

              <View style={{ gap: compact ? 4 : 8 }}>
                {group.items.map(tx => {
                  const isIncome = tx.type === 'income';
                  const color = isIncome ? c.green : c.red;
                  const iconName: IconSymbolName = CATEGORY_ICONS[tx.category] ?? (isIncome ? 'arrow.up.trend' : 'arrow.down.trend');
                  if (compact) {
                    return (
                      <TouchableOpacity key={tx.id} activeOpacity={0.75} onPress={() => setSelected(tx)}>
                        <View style={[s.txCompact, { borderColor: c.border, backgroundColor: c.card }]}>
                          <View style={[s.txAccentBar, { backgroundColor: color }]} />
                          <View style={[s.txIconSm, { backgroundColor: color + (isDark ? '22' : '15'), marginLeft: 10 }]}>
                            <IconSymbol name={iconName} size={13} color={color} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 9 }}>
                            <Text style={[s.txCategorySm, { color: c.text }]} numberOfLines={1}>{tx.category}</Text>
                            {tx.note ? <Text style={[s.txNoteSm, { color: c.sub, marginTop: 1 }]} numberOfLines={1}>{tx.note}</Text> : null}
                          </View>
                          <Text style={[s.txAmountSm, { color, marginLeft: 8 }]}>{isIncome ? '+' : '−'}{fmt(tx.amount)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }
                  return (
                    <TouchableOpacity key={tx.id} activeOpacity={0.75} onPress={() => setSelected(tx)}>
                      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.txCard, { borderColor: c.border }]}>
                        <View style={[s.txIcon, { backgroundColor: color + (isDark ? '22' : '15') }]}>
                          <IconSymbol name={iconName} size={17} color={color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 13 }}>
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

      {/* ─── Context Menu Modal ─── */}
      <Modal visible={showMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowMenu(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
          onPress={() => setShowMenu(false)}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{ position: 'absolute', top: insets.top + 62, right: 16, width: 220 }}>
            <BlurView intensity={isDark ? 60 : 75} tint={isDark ? 'dark' : 'light'} style={[s.menuBox, { borderColor: c.border }]}>

              {/* Статистика */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/finance-stats'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#0EA5E9' + '25' }]}>
                  <IconSymbol name="chart.bar.fill" size={15} color="#0EA5E9" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>Статистика</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Банки */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); router.push('/banks'); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: '#10B981' + '25' }]}>
                  <IconSymbol name="building.columns.fill" size={15} color="#10B981" />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>Скарбнички</Text>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>

              <View style={[s.menuDivider, { backgroundColor: c.border }]} />

              {/* Календар */}
              <TouchableOpacity
                onPress={() => { setShowMenu(false); setShowCal(true); }}
                style={s.menuItem}>
                <View style={[s.menuIconBox, { backgroundColor: dateFilter ? c.accent + '25' : c.dim }]}>
                  <IconSymbol name="calendar" size={15} color={dateFilter ? c.accent : c.sub} />
                </View>
                <Text style={[s.menuLabel, { color: c.text }]}>Календар</Text>
                {dateFilter
                  ? <View style={[s.menuPill, { backgroundColor: c.accent + '20', borderColor: c.accent + '40' }]}>
                      <Text style={[s.menuPillText, { color: c.accent }]}>
                        {new Date(dateFilter).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                      </Text>
                    </View>
                  : <IconSymbol name="chevron.right" size={13} color={c.sub} />
                }
              </TouchableOpacity>

            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Calendar Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>

                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowCal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Month nav */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.left" size={20} color={c.sub} />
                  </TouchableOpacity>
                  <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
                    {MONTHS_UA[calMonth]} {calYear}
                  </Text>
                  <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.right" size={20} color={c.sub} />
                  </TouchableOpacity>
                </View>

                {/* Weekdays */}
                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                  {WEEKDAYS_SHORT.map(d => (
                    <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                  ))}
                </View>

                {/* Days */}
                {calWeeks.map((week, wi) => (
                  <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {week.map((day, di) => {
                      if (!day) return <View key={di} style={{ flex: 1 }} />;
                      const dayDate = new Date(calYear, calMonth, day);
                      const keyStr = `${calYear}-${calMonth}-${day}`;
                      const isToday = dayDate.toDateString() === today.toDateString();
                      const isSel = dateFilter === dayDate.toDateString();
                      const hasMark = markedDays.has(keyStr);
                      return (
                        <TouchableOpacity
                          key={di}
                          onPress={() => { setDateFilter(isSel ? null : dayDate.toDateString()); setShowCal(false); }}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                          <View style={[s.dayCell, isSel && { backgroundColor: c.accent }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.accent }]}>
                            <Text style={{ color: isSel ? '#fff' : isToday ? c.accent : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                          </View>
                          {hasMark && !isSel && <View style={[s.daydot, { backgroundColor: c.accent }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>Скинути фільтр</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Modal ─── */}
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Type toggle */}
                  <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 20 }]}>
                    {(['income', 'expense'] as TxType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { setTxType(t); setCategory(''); }}
                        style={[s.typeBtn, txType === t && { backgroundColor: t === 'income' ? c.green : c.red }]}>
                        <IconSymbol name={t === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={14} color={txType === t ? '#fff' : c.sub} />
                        <Text style={{ fontSize: 13, fontWeight: '700', marginLeft: 5, color: txType === t ? '#fff' : c.sub }}>
                          {t === 'income' ? 'Дохід' : 'Витрата'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Amount display */}
                  <View style={[s.amountBlock, { backgroundColor: (txType === 'income' ? c.green : c.red) + '12', borderColor: (txType === 'income' ? c.green : c.red) + '30' }]}>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>СУМА (₴)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: txType === 'income' ? c.green : c.red, fontSize: 28, fontWeight: '300' }}>₴</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="decimal-pad"
                        style={{ color: txType === 'income' ? c.green : c.red, fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
                      />
                    </View>
                  </View>

                  {/* Category */}
                  <Text style={[s.label, { color: c.sub }]}>Категорія</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                    {CATEGORIES[txType].map(cat => {
                      const catIcon: IconSymbolName = CATEGORY_ICONS[cat] ?? 'ellipsis.circle.fill';
                      const isSelected = category === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => setCategory(cat)}
                          style={[s.catChip, { backgroundColor: isSelected ? c.accent : c.dim, borderColor: isSelected ? c.accent : c.border }]}>
                          <IconSymbol name={catIcon} size={13} color={isSelected ? '#fff' : c.sub} />
                          <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Note */}
                  <Text style={[s.label, { color: c.sub }]}>Нотатка</Text>
                  <TextInput
                    placeholder="Необов'язково..."
                    placeholderTextColor={c.sub}
                    value={note}
                    onChangeText={setNote}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={addTx}
                      disabled={!amount.trim() || !category}
                      style={[s.btn, { flex: 2, backgroundColor: (!amount.trim() || !category) ? c.dim : c.accent }]}>
                      <IconSymbol name={txType === 'income' ? 'arrow.up.trend' : 'arrow.down.trend'} size={15} color={(!amount.trim() || !category) ? c.sub : '#fff'} />
                      <Text style={{ color: (!amount.trim() || !category) ? c.sub : '#fff', fontWeight: '700', marginLeft: 6 }}>Додати</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelected(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              {selected && (() => {
                const isIncome = selected.type === 'income';
                const color = isIncome ? c.green : c.red;
                const iconName: IconSymbolName = CATEGORY_ICONS[selected.category] ?? (isIncome ? 'arrow.up.trend' : 'arrow.down.trend');
                return (
                  <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <View style={s.handleRow}>
                        <View style={{ flex: 1 }} />
                        <View style={[s.handle, { backgroundColor: c.border }]} />
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="xmark" size={17} color={c.sub} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Hero */}
                      <View style={[s.detailHero, { backgroundColor: color + '12', borderColor: color + '25' }]}>
                        <View style={[s.detailIcon, { backgroundColor: color + '25' }]}>
                          <IconSymbol name={iconName} size={30} color={color} />
                        </View>
                        <Text style={[s.detailAmount, { color, marginTop: 12 }]}>
                          {isIncome ? '+' : '−'}{fmt(selected.amount)}
                        </Text>
                        <Text style={[s.detailCat, { color: c.text, marginTop: 4 }]}>{selected.category}</Text>
                        <View style={[s.typePill, { backgroundColor: color + '20', borderColor: color + '40', marginTop: 10 }]}>
                          <IconSymbol name={isIncome ? 'arrow.up.trend' : 'arrow.down.trend'} size={11} color={color} />
                          <Text style={{ color, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>{isIncome ? 'Дохід' : 'Витрата'}</Text>
                        </View>
                      </View>

                      <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginTop: 14 }]}>
                        {selected.note ? <InfoRow icon="doc.text" label="Нотатка" value={selected.note} color={c.sub} text={c.text} sub={c.sub} border={c.border} last={false} /> : null}
                        <InfoRow icon="calendar" label="Дата" value={new Date(selected.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} color={c.sub} text={c.text} sub={c.sub} border={c.border} last />
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
                    </ScrollView>
                  </BlurView>
                );
              })()}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SummaryItem({ label, value, color, sub }: any) {
  return (
    <View style={{ flex: 1, padding: 6 }}>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', letterSpacing: 0.3, marginBottom: 5 }}>{label}</Text>
      <Text style={{ color, fontSize: 17, fontWeight: '800', letterSpacing: -0.4 }}>{value}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, color, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 13 }, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <IconSymbol name={icon} size={15} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontWeight: '600', width: 72, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dateChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  balCard:     { borderRadius: 20, borderWidth: 1, padding: 20, overflow: 'hidden' },
  balLabel:    { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  balAmount:   { fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  divider:     { height: 1 },
  miniLabel:   { fontSize: 11, fontWeight: '600' },
  progressBg:  { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 2 },
  filterRow:   { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  filterBtn:   { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  groupLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  txCard:      { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  txIcon:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txCategory:  { fontSize: 14, fontWeight: '600' },
  txNote:      { fontSize: 11, marginTop: 2 },
  txAmount:    { fontSize: 14, fontWeight: '800' },
  fab:         { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 108 : 88, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.88 },
  amountBlock: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 4 },
  detailHero:  { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center' },
  typePill:    { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  typeRow:     { flexDirection: 'row', borderRadius: 12, padding: 3 },
  typeBtn:     { flex: 1, flexDirection: 'row', paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  catChip:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 9, borderWidth: 1 },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailAmount:{ fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  detailCat:   { fontSize: 15, fontWeight: '600', marginTop: 4 },
  infoBlock:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  navBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot:      { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  // Context menu
  menuBox:     { borderRadius: 18, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12, elevation: 10 },
  menuItem:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  menuIconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  menuLabel:   { flex: 1, fontSize: 14, fontWeight: '600' },
  menuDivider: { height: 1, marginHorizontal: 14 },
  menuToggle:  { width: 34, height: 20, borderRadius: 10, borderWidth: 1, padding: 2, justifyContent: 'center' },
  menuToggleDot:{ width: 14, height: 14, borderRadius: 7 },
  menuPill:    { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  menuPillText:{ fontSize: 11, fontWeight: '700' },
  // Compact rows
  txCompact:   { borderRadius: 12, borderWidth: 1, paddingRight: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  txAccentBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginRight: 0 },
  txIconSm:    { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  txCategorySm:{ fontSize: 13, fontWeight: '600' },
  txNoteSm:    { fontSize: 11, fontWeight: '400' },
  txAmountSm:  { fontSize: 13, fontWeight: '800' },
});
