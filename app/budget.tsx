import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
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

import { MonthPicker } from '@/components/shared/MonthPicker';
import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type TxType = 'income' | 'expense';

interface Transaction {
  id: string; type: TxType; category: string; amount: number; note: string; date: string;
}

interface BudgetLimit {
  category: string;
  icon: IconSymbolName;
  limit: number; // monthly limit in UAH
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#0EA5E9';

const DEFAULT_BUDGET_CATEGORIES: BudgetLimit[] = [
  { category: 'Їжа',        icon: 'fork.knife',           limit: 0 },
  { category: 'Транспорт',  icon: 'car.fill',             limit: 0 },
  { category: 'Розваги',    icon: 'gamecontroller.fill',  limit: 0 },
  { category: "Здоров'я",   icon: 'cross.fill',           limit: 0 },
  { category: 'Комунальні', icon: 'house.fill',           limit: 0 },
  { category: 'Одяг',       icon: 'tag.fill',             limit: 0 },
  { category: 'Інше',       icon: 'ellipsis.circle.fill', limit: 0 },
];

const ICON_OPTIONS: IconSymbolName[] = [
  'fork.knife', 'car.fill', 'gamecontroller.fill', 'cross.fill', 'house.fill',
  'tag.fill', 'ellipsis.circle.fill', 'cart.fill', 'bag.fill', 'creditcard.fill',
  'banknote', 'person.fill', 'airplane', 'heart.fill', 'star.fill', 'flame.fill',
  'bolt.fill', 'leaf.fill', 'books.vertical.fill', 'graduationcap.fill',
  'phone.fill', 'camera.fill', 'bicycle', 'figure.walk', 'drop.fill',
  'pawprint.fill', 'building.2.fill', 'wrench.fill', 'chart.bar.fill',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameMonth(dateStr: string, month: Date): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
}

function formatCurrency(n: number): string {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BudgetScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const { tr } = useI18n();

  const c = {
    bg1:    isDark ? '#080E18' : '#EFF5FF',
    bg2:    isDark ? '#0F1A2E' : '#E0ECFF',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.80)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#EEF4FF' : '#0A1628',
    sub:    isDark ? 'rgba(220,235,255,0.45)' : 'rgba(10,22,40,0.45)',
    dim:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(8,14,24,0.98)' : 'rgba(239,245,255,0.98)',
    input:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    green:  '#10B981',
    amber:  '#F59E0B',
    red:    '#EF4444',
  };

  // ─── State ────────────────────────────────────────────────────────────────

  const [initialized, setInitialized] = useState(false);
  const [budgets, setBudgets]         = useState<BudgetLimit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeMonth, setActiveMonth] = useState(() => {
    const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  // Edit modal
  const [editItem, setEditItem]         = useState<BudgetLimit | null>(null);
  const [editLimit, setEditLimit]       = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Add category modal
  const [showAddModal, setShowAddModal]   = useState(false);
  const [newCatName, setNewCatName]       = useState('');
  const [newCatIcon, setNewCatIcon]       = useState<IconSymbolName>('ellipsis.circle.fill');
  const [newCatLimit, setNewCatLimit]     = useState('');

  // ─── Load ─────────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    (async () => {
      const [savedBudgets, txs] = await Promise.all([
        loadData<BudgetLimit[]>('budget_limits', []),
        loadData<Transaction[]>('transactions', []),
      ]);

      // Merge saved budgets with defaults (add new default categories that don't exist yet)
      const merged = [...savedBudgets];
      for (const def of DEFAULT_BUDGET_CATEGORIES) {
        if (!merged.find(b => b.category === def.category)) {
          merged.push(def);
        }
      }
      setBudgets(merged);
      setTransactions(txs);
      setInitialized(true);
    })();
  }, []));

  const saveBudgets = useCallback((next: BudgetLimit[]) => {
    setBudgets(next);
    saveData('budget_limits', next);
  }, []);

  // ─── Computed ─────────────────────────────────────────────────────────────

  // Actual spending per category for selected month
  const actualByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter(tx => tx.type === 'expense' && isSameMonth(tx.date, activeMonth))
      .forEach(tx => {
        map[tx.category] = (map[tx.category] ?? 0) + tx.amount;
      });
    return map;
  }, [transactions, activeMonth]);

  // Merged display list: saved budgets + auto-added from transactions
  const displayBudgets = useMemo(() => {
    const result: BudgetLimit[] = [...budgets];
    // Auto-add categories from transactions that aren't already tracked
    Object.keys(actualByCategory).forEach(cat => {
      if (!result.find(b => b.category === cat)) {
        result.push({ category: cat, icon: 'ellipsis.circle.fill' as IconSymbolName, limit: 0 });
      }
    });
    // Sort: highest spending first, then alphabetically
    return result.sort((a, b) => {
      const diff = (actualByCategory[b.category] ?? 0) - (actualByCategory[a.category] ?? 0);
      return diff !== 0 ? diff : a.category.localeCompare(b.category, 'uk');
    });
  }, [budgets, actualByCategory]);

  // Total budget and total spent
  const totals = useMemo(() => {
    const totalBudget = budgets.filter(b => b.limit > 0).reduce((s, b) => s + b.limit, 0);
    const totalSpent  = Object.values(actualByCategory).reduce((s, v) => s + v, 0);
    return { totalBudget, totalSpent };
  }, [budgets, actualByCategory]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  function openEdit(item: BudgetLimit) {
    setEditItem(item);
    setEditLimit(item.limit > 0 ? String(item.limit) : '');
    setShowEditModal(true);
  }

  function saveEdit() {
    if (!editItem) return;
    const limit = parseFloat(editLimit.replace(',', '.')) || 0;
    const alreadySaved = budgets.find(b => b.category === editItem.category);
    if (alreadySaved) {
      saveBudgets(budgets.map(b => b.category === editItem.category ? { ...b, limit } : b));
    } else {
      saveBudgets([...budgets, { ...editItem, limit }]);
    }
    setShowEditModal(false);
  }

  function deleteCategory(cat: string) {
    Alert.alert('Видалити категорію?', `«${cat}» буде видалено з бюджету.`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => saveBudgets(budgets.filter(b => b.category !== cat)) },
    ]);
  }

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    if (budgets.find(b => b.category === name)) {
      Alert.alert('Категорія вже існує');
      return;
    }
    const limit = parseFloat(newCatLimit.replace(',', '.')) || 0;
    saveBudgets([...budgets, { category: name, icon: newCatIcon, limit }]);
    setNewCatName(''); setNewCatIcon('ellipsis.circle.fill'); setNewCatLimit('');
    setShowAddModal(false);
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={st.header}>
          <Text style={[st.title, { color: c.text }]}>Бюджет</Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={[st.headerBtn, { backgroundColor: ACCENT + '20' }]}>
            <IconSymbol name="plus" size={18} color={ACCENT} />
          </TouchableOpacity>
        </View>

        {/* Month picker */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <MonthPicker
            month={activeMonth}
            onChange={setActiveMonth}
            months={tr.months}
            monthsShort={tr.monthsShort}
            monthsGenitive={tr.monthsGenitive}
            accentColor={ACCENT}
            textColor={c.text}
            subColor={c.sub}
            dimColor={c.dim}
            borderColor={c.border}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}>

          {/* Total summary card */}
          {totals.totalBudget > 0 && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.summaryCard, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 12, color: c.sub, fontWeight: '600' }}>ВИТРАЧЕНО</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: c.text, marginTop: 2, letterSpacing: -0.5 }}>
                    {formatCurrency(totals.totalSpent)} ₴
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: c.sub, fontWeight: '600' }}>БЮДЖЕТ</Text>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: ACCENT, marginTop: 2, letterSpacing: -0.5 }}>
                    {formatCurrency(totals.totalBudget)} ₴
                  </Text>
                </View>
              </View>
              <ProgressBar spent={totals.totalSpent} limit={totals.totalBudget} c={c} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: c.sub }}>
                  Залишилось: <Text style={{ fontWeight: '700', color: totals.totalSpent > totals.totalBudget ? c.red : c.green }}>
                    {formatCurrency(Math.max(0, totals.totalBudget - totals.totalSpent))} ₴
                  </Text>
                </Text>
                <Text style={{ fontSize: 12, color: c.sub }}>
                  {totals.totalBudget > 0
                    ? `${Math.round((totals.totalSpent / totals.totalBudget) * 100)}%`
                    : '0%'}
                </Text>
              </View>
            </BlurView>
          )}

          {/* Category rows */}
          {displayBudgets.length > 0 && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}>
              {displayBudgets.map((item, idx) => {
                const spent = actualByCategory[item.category] ?? 0;
                const pct = item.limit > 0 ? Math.min(spent / item.limit, 1) : 0;
                const isOver = item.limit > 0 && spent > item.limit;
                const barColor = isOver ? c.red : pct > 0.8 ? c.amber : ACCENT;
                const isAutoAdded = !budgets.find(b => b.category === item.category);
                return (
                  <TouchableOpacity key={item.category} onPress={() => openEdit(item)} activeOpacity={0.75}>
                    <View style={[st.categoryRow,
                      idx < displayBudgets.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                      {/* Icon */}
                      <View style={[st.catIconBox, { backgroundColor: isAutoAdded ? c.dim : ACCENT + '18' }]}>
                        <IconSymbol name={item.icon} size={16} color={isAutoAdded ? c.sub : ACCENT} />
                      </View>
                      {/* Info */}
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.category}</Text>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: isOver ? c.red : c.text }}>
                            {formatCurrency(spent)} ₴
                            {item.limit > 0 && (
                              <Text style={{ color: c.sub, fontWeight: '400' }}> / {formatCurrency(item.limit)} ₴</Text>
                            )}
                          </Text>
                        </View>
                        {item.limit > 0 ? (
                          <View style={[st.progressTrack, { backgroundColor: c.dim }]}>
                            <View style={[st.progressFill, { backgroundColor: barColor, width: `${pct * 100}%` as any }]} />
                          </View>
                        ) : (
                          <Text style={{ fontSize: 11, color: c.sub, fontStyle: 'italic' }}>
                            Натисніть щоб встановити прогноз
                          </Text>
                        )}
                      </View>
                      {/* Chevron */}
                      <IconSymbol name="chevron.right" size={14} color={c.sub} style={{ marginLeft: 6 }} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </BlurView>
          )}

          {/* Empty state */}
          {displayBudgets.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[st.emptyIcon, { backgroundColor: ACCENT + '15' }]}>
                <IconSymbol name="chart.pie.fill" size={36} color={ACCENT} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: c.text, marginTop: 16 }}>
                Бюджет не налаштовано
              </Text>
              <Text style={{ fontSize: 14, color: c.sub, marginTop: 6, textAlign: 'center' }}>
                Категорії з'являться автоматично{'\n'}після додавання витрат у Фінансах
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                style={[st.addBtn, { backgroundColor: ACCENT, marginTop: 24 }]}>
                <IconSymbol name="plus" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Додати вручну</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Tips */}
          {displayBudgets.length > 0 && (
            <Text style={{ fontSize: 12, color: c.sub, textAlign: 'center', marginTop: 16 }}>
              Натисніть на категорію щоб встановити прогноз витрат
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── Edit Limit Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowEditModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>

                {/* Handle */}
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                </View>

                {/* Icon + title */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                  <View style={[st.catIconBox, { backgroundColor: ACCENT + '18', width: 44, height: 44, borderRadius: 13 }]}>
                    {editItem && <IconSymbol name={editItem.icon} size={20} color={ACCENT} />}
                  </View>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: '700', color: c.text }}>{editItem?.category}</Text>
                    <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>Прогноз витрат на місяць</Text>
                  </View>
                </View>

                {/* Actual spent */}
                {editItem && (
                  <View style={[st.spentRow, { backgroundColor: c.dim, borderColor: c.border }]}>
                    <Text style={{ fontSize: 13, color: c.sub }}>Фактично витрачено:</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>
                      {formatCurrency(actualByCategory[editItem.category] ?? 0)} ₴
                    </Text>
                  </View>
                )}

                {/* Limit input */}
                <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontWeight: '500' }}>Заплановано на місяць (₴)</Text>
                <TextInput
                  autoFocus
                  placeholder="0"
                  placeholderTextColor={c.sub}
                  value={editLimit}
                  onChangeText={setEditLimit}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={saveEdit}
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />

                {/* Quick presets */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ gap: 8, paddingVertical: 4 }} style={{ marginBottom: 16 }}>
                  {[500, 1000, 1500, 2000, 3000, 5000, 10000].map(v => (
                    <TouchableOpacity key={v} onPress={() => setEditLimit(String(v))}
                      style={[st.preset, { borderColor: editLimit === String(v) ? ACCENT : c.border,
                        backgroundColor: editLimit === String(v) ? ACCENT + '15' : c.dim }]}>
                      <Text style={{ fontSize: 13, fontWeight: '600',
                        color: editLimit === String(v) ? ACCENT : c.sub }}>{v.toLocaleString('uk-UA')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Buttons */}
                <TouchableOpacity onPress={saveEdit}
                  style={[st.btn, { backgroundColor: ACCENT }]}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Зберегти</Text>
                </TouchableOpacity>

                {editItem && !!budgets.find(b => b.category === editItem?.category) && (
                  <TouchableOpacity
                    onPress={() => { setShowEditModal(false); deleteCategory(editItem.category); }}
                    style={[st.btn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.red + '50', marginTop: 8 }]}>
                    <IconSymbol name="trash" size={15} color={c.red} />
                    <Text style={{ color: c.red, fontSize: 15, fontWeight: '600' }}>Видалити категорію</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Add Category Modal ── */}
      <Modal visible={showAddModal} transparent animationType="slide" statusBarTranslucent
        onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowAddModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet, maxHeight: '90%' }]}>

                <ScrollView keyboardShouldPersistTaps="handled">
                  {/* Handle */}
                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
                  </View>

                  <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, marginBottom: 20 }}>
                    Нова категорія бюджету
                  </Text>

                  {/* Name */}
                  <Text style={{ fontSize: 13, color: c.sub, marginBottom: 6, fontWeight: '500' }}>Назва</Text>
                  <TextInput
                    autoFocus
                    placeholder="Назва категорії"
                    placeholderTextColor={c.sub}
                    value={newCatName}
                    onChangeText={setNewCatName}
                    style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                  />

                  {/* Limit */}
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 14, marginBottom: 6, fontWeight: '500' }}>
                    Заплановано на місяць (₴)
                  </Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={c.sub}
                    value={newCatLimit}
                    onChangeText={setNewCatLimit}
                    keyboardType="decimal-pad"
                    style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                  />

                  {/* Icon picker */}
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 14, marginBottom: 8, fontWeight: '500' }}>Іконка</Text>
                  {chunk(ICON_OPTIONS, 7).map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                      {row.map(icon => (
                        <TouchableOpacity key={icon} onPress={() => setNewCatIcon(icon)}
                          style={[st.iconOption, {
                            backgroundColor: newCatIcon === icon ? ACCENT + '25' : c.dim,
                            borderColor: newCatIcon === icon ? ACCENT : 'transparent',
                          }]}>
                          <IconSymbol name={icon} size={18} color={newCatIcon === icon ? ACCENT : c.sub} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}

                  <TouchableOpacity onPress={addCategory}
                    style={[st.btn, { backgroundColor: newCatName.trim() ? ACCENT : c.dim, marginTop: 8 }]}>
                    <Text style={{ color: newCatName.trim() ? '#fff' : c.sub, fontSize: 15, fontWeight: '700' }}>
                      Додати категорію
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ spent, limit, c }: { spent: number; limit: number; c: any }) {
  const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
  const isOver = limit > 0 && spent > limit;
  const color = isOver ? c.red : pct > 0.8 ? c.amber : ACCENT;
  return (
    <View style={[{ height: 8, borderRadius: 4, overflow: 'hidden' }, { backgroundColor: c.dim }]}>
      <View style={{ height: '100%', width: `${pct * 100}%` as any, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:        { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:    { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryCard:  { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 16, marginBottom: 16 },
  card:         { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  categoryRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  catIconBox:   { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  progressTrack:{ height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  warningCard:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  emptyIcon:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { width: '100%' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, padding: 24, paddingBottom: 36 },
  input:        { borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 8 },
  spentRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  preset:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  btn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24 },
  iconOption:   { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1.5, padding: 6 },
});
