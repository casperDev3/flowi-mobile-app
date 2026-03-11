import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

interface SavingsJar {
  id: string;
  name: string;
  goal: number;
  saved: number;
  icon: IconSymbolName;
  color: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const JAR_ICONS: IconSymbolName[] = [
  'star.fill', 'house.fill', 'car.fill', 'airplane',
  'gift.fill', 'gamecontroller.fill', 'laptopcomputer', 'heart.fill',
  'bag.fill', 'camera.fill', 'music.note', 'graduationcap.fill',
];

const JAR_COLORS = [
  '#0EA5E9', '#10B981', '#6366F1', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#84CC16',
];

const fmt = (n: number) =>
  n.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH', maximumFractionDigits: 0 });

export default function BanksScreen() {
  const isDark = useColorScheme() === 'dark';
  const [jars, setJars] = useState<SavingsJar[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Screens: 'list' | 'add' | 'edit' | 'deposit'
  const [showForm, setShowForm] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [editingJar, setEditingJar] = useState<SavingsJar | null>(null);
  const [depositJar, setDepositJar] = useState<SavingsJar | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositSign, setDepositSign] = useState<'+' | '-'>('+');

  // Form state
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [saved, setSaved] = useState('');
  const [note, setNote] = useState('');
  const [selIcon, setSelIcon] = useState<IconSymbolName>('star.fill');
  const [selColor, setSelColor] = useState(JAR_COLORS[0]);

  useEffect(() => {
    loadData<SavingsJar[]>('savings_jars', []).then(data => {
      setJars(data);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (initialized) saveData('savings_jars', jars);
  }, [jars, initialized]);

  const totalSaved = jars.reduce((s, j) => s + j.saved, 0);
  const totalGoal  = jars.reduce((s, j) => s + j.goal, 0);

  const openAdd = () => {
    setEditingJar(null);
    setName(''); setGoal(''); setSaved('0'); setNote('');
    setSelIcon('star.fill');
    setSelColor(JAR_COLORS[0]);
    setShowForm(true);
  };

  const openEdit = (jar: SavingsJar) => {
    setEditingJar(jar);
    setName(jar.name);
    setGoal(jar.goal.toString());
    setSaved(jar.saved.toString());
    setNote(jar.note);
    setSelIcon(jar.icon);
    setSelColor(jar.color);
    setShowForm(true);
  };

  const openDeposit = (jar: SavingsJar) => {
    setDepositJar(jar);
    setDepositAmount('');
    setDepositSign('+');
    setShowDeposit(true);
  };

  const saveForm = () => {
    const goalNum  = parseFloat(goal.replace(',', '.'));
    const savedNum = parseFloat(saved.replace(',', '.'));
    if (!name.trim() || isNaN(goalNum) || goalNum <= 0) return;
    const now = new Date().toISOString();
    if (editingJar) {
      setJars(p => p.map(j => j.id === editingJar.id
        ? { ...j, name: name.trim(), goal: goalNum, saved: isNaN(savedNum) ? 0 : savedNum, icon: selIcon, color: selColor, note: note.trim(), updatedAt: now }
        : j
      ));
    } else {
      setJars(p => [...p, {
        id: Date.now().toString(),
        name: name.trim(),
        goal: goalNum,
        saved: isNaN(savedNum) ? 0 : Math.max(0, savedNum),
        icon: selIcon, color: selColor,
        note: note.trim(),
        createdAt: now, updatedAt: now,
      }]);
    }
    setShowForm(false);
  };

  const applyDeposit = () => {
    if (!depositJar) return;
    const num = parseFloat(depositAmount.replace(',', '.'));
    if (isNaN(num) || num <= 0) return;
    const delta = depositSign === '+' ? num : -num;
    setJars(p => p.map(j => j.id === depositJar.id
      ? { ...j, saved: Math.max(0, j.saved + delta), updatedAt: new Date().toISOString() }
      : j
    ));
    setShowDeposit(false);
  };

  const deleteJar = (id: string) => {
    setJars(p => p.filter(j => j.id !== id));
    setShowForm(false);
  };

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(100,160,240,0.3)',
    text:   isDark ? '#EFF5FF' : '#071524',
    sub:    isDark ? 'rgba(239,245,255,0.45)' : 'rgba(7,21,36,0.45)',
    accent: '#0EA5E9',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(8,14,24,0.98)' : 'rgba(239,245,255,0.98)',
    green:  '#10B981',
    gold:   '#F59E0B',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>Скарбнички</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}>

          {/* Summary card */}
          {jars.length > 0 && (
            <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.summaryCard, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', marginBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.summaryLabel, { color: c.sub }]}>Накопичено</Text>
                  <Text style={[s.summaryAmount, { color: c.green }]}>{fmt(totalSaved)}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: c.border }} />
                <View style={{ flex: 1, paddingLeft: 16 }}>
                  <Text style={[s.summaryLabel, { color: c.sub }]}>Мета</Text>
                  <Text style={[s.summaryAmount, { color: c.text }]}>{fmt(totalGoal)}</Text>
                </View>
              </View>
              {totalGoal > 0 && (
                <>
                  <View style={[s.progressBg, { height: 6 }]}>
                    <View style={[s.progressFill, {
                      width: `${Math.min(100, Math.round((totalSaved / totalGoal) * 100))}%`,
                      backgroundColor: c.green,
                    }]} />
                  </View>
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 7 }}>
                    {Math.min(100, Math.round((totalSaved / totalGoal) * 100))}% від загальної мети
                  </Text>
                </>
              )}
            </BlurView>
          )}

          {/* Empty state */}
          {jars.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Text style={{ fontSize: 48 }}>🫙</Text>
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>Немає скарбничок</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>Натисніть + щоб створити ціль</Text>
            </View>
          )}

          {/* Jars list */}
          <View style={{ gap: 12, marginTop: jars.length > 0 ? 16 : 0 }}>
            {jars.map(jar => {
              const pct = jar.goal > 0 ? Math.min(100, (jar.saved / jar.goal) * 100) : 0;
              const done = pct >= 100;
              return (
                <BlurView key={jar.id} intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.jarCard, { borderColor: done ? jar.color + '60' : c.border }]}>
                  {/* Top row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <View style={[s.jarIcon, { backgroundColor: jar.color + (isDark ? '22' : '18') }]}>
                      <IconSymbol name={jar.icon} size={20} color={jar.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.jarName, { color: c.text }]}>{jar.name}</Text>
                        {done && (
                          <View style={[s.doneBadge, { backgroundColor: jar.color + '20', borderColor: jar.color + '40' }]}>
                            <Text style={{ color: jar.color, fontSize: 10, fontWeight: '700' }}>✓ Виконано</Text>
                          </View>
                        )}
                      </View>
                      {jar.note ? <Text style={[s.jarNote, { color: c.sub }]} numberOfLines={1}>{jar.note}</Text> : null}
                    </View>
                    <TouchableOpacity
                      onPress={() => openEdit(jar)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[s.editBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
                      <IconSymbol name="pencil" size={13} color={c.sub} />
                    </TouchableOpacity>
                  </View>

                  {/* Amounts */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
                    <Text style={[s.savedAmt, { color: jar.color }]}>{fmt(jar.saved)}</Text>
                    <Text style={[s.goalAmt, { color: c.sub }]}> / {fmt(jar.goal)}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={[s.pctLabel, { color: done ? jar.color : c.sub }]}>{Math.round(pct)}%</Text>
                  </View>

                  {/* Progress */}
                  <View style={[s.progressBg, { marginBottom: 12 }]}>
                    <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: jar.color }]} />
                  </View>

                  {/* Deposit button */}
                  <TouchableOpacity
                    onPress={() => openDeposit(jar)}
                    style={[s.depositBtn, { backgroundColor: jar.color + '18', borderColor: jar.color + '35' }]}>
                    <IconSymbol name="plus.circle.fill" size={15} color={jar.color} />
                    <Text style={{ color: jar.color, fontSize: 13, fontWeight: '700', marginLeft: 6 }}>Поповнити</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={{ color: c.sub, fontSize: 11 }}>
                      Залишилось {fmt(Math.max(0, jar.goal - jar.saved))}
                    </Text>
                  </TouchableOpacity>
                </BlurView>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={openAdd} style={[s.fab, { backgroundColor: c.accent }]} activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ─── Add / Edit Modal ─── */}
      <Modal visible={showForm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowForm(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[s.sheetTitle, { color: c.text }]}>
                    {editingJar ? 'Редагувати скарбничку' : 'Нова скарбничка'}
                  </Text>

                  {/* Goal amount */}
                  <View style={[s.amountBlock, { backgroundColor: selColor + '12', borderColor: selColor + '30' }]}>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>ЦІЛЬ (₴)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: selColor, fontSize: 28, fontWeight: '300' }}>₴</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={goal}
                        onChangeText={setGoal}
                        keyboardType="decimal-pad"
                        style={{ color: selColor, fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
                      />
                    </View>
                  </View>

                  {/* Name */}
                  <Text style={[s.label, { color: c.sub }]}>Назва</Text>
                  <TextInput
                    placeholder="напр. На відпустку, Новий ноутбук..."
                    placeholderTextColor={c.sub}
                    value={name}
                    onChangeText={setName}
                    style={[s.input, { backgroundColor: c.dim, color: c.text, borderColor: c.border, borderWidth: 1 }]}
                  />

                  {/* Already saved */}
                  <Text style={[s.label, { color: c.sub }]}>Вже накопичено (₴)</Text>
                  <TextInput
                    placeholder="0"
                    placeholderTextColor={c.sub}
                    value={saved}
                    onChangeText={setSaved}
                    keyboardType="decimal-pad"
                    style={[s.input, { backgroundColor: c.dim, color: c.text, borderColor: c.border, borderWidth: 1 }]}
                  />

                  {/* Note */}
                  <Text style={[s.label, { color: c.sub }]}>Нотатка</Text>
                  <TextInput
                    placeholder="Необов'язково..."
                    placeholderTextColor={c.sub}
                    value={note}
                    onChangeText={setNote}
                    style={[s.input, { backgroundColor: c.dim, color: c.text, borderColor: c.border, borderWidth: 1 }]}
                  />

                  {/* Icon picker */}
                  <Text style={[s.label, { color: c.sub }]}>Іконка</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {JAR_ICONS.map(icon => (
                      <TouchableOpacity
                        key={icon}
                        onPress={() => setSelIcon(icon)}
                        style={[s.iconChip, {
                          backgroundColor: selIcon === icon ? selColor + '25' : c.dim,
                          borderColor: selIcon === icon ? selColor : c.border,
                          borderWidth: 1,
                        }]}>
                        <IconSymbol name={icon} size={18} color={selIcon === icon ? selColor : c.sub} />
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Color picker */}
                  <Text style={[s.label, { color: c.sub }]}>Колір</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {JAR_COLORS.map(color => (
                      <TouchableOpacity
                        key={color}
                        onPress={() => setSelColor(color)}
                        style={[s.colorDot, { backgroundColor: color, borderWidth: selColor === color ? 3 : 0, borderColor: isDark ? '#fff' : '#333' }]}
                      />
                    ))}
                  </View>

                  {/* Buttons */}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    {editingJar && (
                      <TouchableOpacity
                        onPress={() => deleteJar(editingJar.id)}
                        style={[s.btn, { width: 46, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                        <IconSymbol name="trash" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setShowForm(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveForm}
                      disabled={!name.trim() || !goal.trim()}
                      style={[s.btn, { flex: 2, backgroundColor: (!name.trim() || !goal.trim()) ? c.dim : selColor }]}>
                      <IconSymbol name={editingJar ? 'checkmark' : 'plus'} size={15} color={(!name.trim() || !goal.trim()) ? c.sub : '#fff'} />
                      <Text style={{ color: (!name.trim() || !goal.trim()) ? c.sub : '#fff', fontWeight: '700', marginLeft: 6 }}>
                        {editingJar ? 'Зберегти' : 'Створити'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Deposit Modal ─── */}
      <Modal visible={showDeposit} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowDeposit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowDeposit(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              {depositJar && (
                <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowDeposit(false)} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Jar preview */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 }}>
                    <View style={[s.jarIcon, { backgroundColor: depositJar.color + (isDark ? '22' : '18') }]}>
                      <IconSymbol name={depositJar.icon} size={20} color={depositJar.color} />
                    </View>
                    <View>
                      <Text style={[s.jarName, { color: c.text }]}>{depositJar.name}</Text>
                      <Text style={{ color: c.sub, fontSize: 12 }}>
                        {fmt(depositJar.saved)} / {fmt(depositJar.goal)}
                      </Text>
                    </View>
                  </View>

                  {/* Sign toggle */}
                  <View style={[s.typeRow, { backgroundColor: c.dim, marginBottom: 16 }]}>
                    {(['+', '-'] as const).map(sign => (
                      <TouchableOpacity
                        key={sign}
                        onPress={() => setDepositSign(sign)}
                        style={[s.typeBtn, depositSign === sign && { backgroundColor: sign === '+' ? c.green : '#EF4444' }]}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: depositSign === sign ? '#fff' : c.sub }}>{sign}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '600', marginLeft: 5, color: depositSign === sign ? '#fff' : c.sub }}>
                          {sign === '+' ? 'Поповнення' : 'Зняття'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Amount input */}
                  <View style={[s.amountBlock, {
                    backgroundColor: (depositSign === '+' ? c.green : '#EF4444') + '12',
                    borderColor: (depositSign === '+' ? c.green : '#EF4444') + '30',
                  }]}>
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 }}>СУМА (₴)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ color: depositSign === '+' ? c.green : '#EF4444', fontSize: 28, fontWeight: '300' }}>₴</Text>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={depositAmount}
                        onChangeText={setDepositAmount}
                        keyboardType="decimal-pad"
                        autoFocus
                        style={{ color: depositSign === '+' ? c.green : '#EF4444', fontSize: 38, fontWeight: '700', letterSpacing: -1, flex: 1 }}
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setShowDeposit(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={applyDeposit}
                      disabled={!depositAmount.trim()}
                      style={[s.btn, { flex: 2, backgroundColor: !depositAmount.trim() ? c.dim : (depositSign === '+' ? c.green : '#EF4444') }]}>
                      <Text style={{ color: !depositAmount.trim() ? c.sub : '#fff', fontWeight: '700' }}>
                        {depositSign === '+' ? 'Поповнити' : 'Зняти'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:    { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:    { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  summaryCard:  { borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  summaryAmount:{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  jarCard:      { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  jarIcon:      { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  jarName:      { fontSize: 15, fontWeight: '700' },
  jarNote:      { fontSize: 12, marginTop: 2 },
  doneBadge:    { borderRadius: 7, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  editBtn:      { width: 30, height: 30, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  savedAmt:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  goalAmt:      { fontSize: 14, fontWeight: '500', paddingBottom: 2 },
  pctLabel:     { fontSize: 13, fontWeight: '700' },
  progressBg:   { height: 5, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  depositBtn:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10 },
  fab:          { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 48 : 28, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.92 },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  amountBlock:  { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 4 },
  label:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:        { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  iconChip:     { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorDot:     { width: 30, height: 30, borderRadius: 15 },
  btn:          { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  typeRow:      { flexDirection: 'row', borderRadius: 12, padding: 3 },
  typeBtn:      { flex: 1, flexDirection: 'row', paddingVertical: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
