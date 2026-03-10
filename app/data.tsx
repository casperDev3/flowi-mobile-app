import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

export default function DataScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [counts, setCounts] = useState({ tasks: 0, transactions: 0, timeEntries: 0, projects: 0 });
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };

  useEffect(() => {
    Promise.all([
      loadData<any[]>('tasks', []),
      loadData<any[]>('transactions', []),
      loadData<any[]>('time_entries', []),
      loadData<any[]>('projects', []),
    ]).then(([tasks, transactions, timeEntries, projects]) => {
      setCounts({ tasks: tasks.length, transactions: transactions.length, timeEntries: timeEntries.length, projects: projects.length });
    });
  }, []);

  const handleExport = async () => {
    try {
      const [tasks, transactions, timeEntries, projects] = await Promise.all([
        loadData('tasks', []),
        loadData('transactions', []),
        loadData('time_entries', []),
        loadData('projects', []),
      ]);
      const data = { version: '1.0', exportedAt: new Date().toISOString(), tasks, transactions, timeEntries, projects };
      await Share.share({ message: JSON.stringify(data, null, 2), title: 'f-tracking-export.json' });
    } catch {
      Alert.alert('Помилка', 'Не вдалося експортувати дані.');
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const data = JSON.parse(importText.trim());
      await Promise.all([
        data.tasks        && saveData('tasks', data.tasks),
        data.transactions && saveData('transactions', data.transactions),
        data.timeEntries  && saveData('time_entries', data.timeEntries),
        data.projects     && saveData('projects', data.projects),
      ].filter(Boolean));
      Alert.alert('Успішно', 'Дані імпортовано. Перезапустіть додаток для оновлення.');
      setShowImport(false);
      setImportText('');
    } catch {
      Alert.alert('Помилка', 'Невірний формат JSON. Перевірте файл і спробуйте знову.');
    } finally {
      setImporting(false);
    }
  };

  const handleClear = () =>
    Alert.alert('Очистити всі дані?', 'Цю дію неможливо скасувати. Всі завдання, транзакції та записи будуть видалені.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити все', style: 'destructive',
        onPress: async () => {
          await Promise.all([
            saveData('tasks', []),
            saveData('transactions', []),
            saveData('time_entries', []),
            saveData('projects', []),
          ]);
          setCounts({ tasks: 0, transactions: 0, timeEntries: 0, projects: 0 });
          Alert.alert('Готово', 'Всі дані видалено. Перезапустіть додаток.');
        },
      },
    ]);

  const STAT_ITEMS = [
    { label: 'Завдання',     value: counts.tasks,        icon: 'checklist',    color: '#7C3AED' },
    { label: 'Транзакції',   value: counts.transactions, icon: 'banknote',     color: '#0EA5E9' },
    { label: 'Записи часу',  value: counts.timeEntries,  icon: 'timer',        color: '#6366F1' },
    { label: 'Проекти',      value: counts.projects,     icon: 'folder.fill',  color: '#10B981' },
  ] as const;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ marginTop: 10, marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={st.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <IconSymbol name="chevron.left" size={20} color={c.text} />
            </TouchableOpacity>
            <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 8 }]}>Управління даними</Text>
          </View>

          {/* Stats grid */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>СТАТИСТИКА ДАНИХ</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
            {STAT_ITEMS.map(item => (
              <BlurView key={item.label} intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
                style={[st.statCard, { borderColor: c.border, width: '47%' }]}>
                <View style={[st.statIcon, { backgroundColor: item.color + '18' }]}>
                  <IconSymbol name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={{ color: item.color, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: 10 }}>
                  {item.value}
                </Text>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '500', marginTop: 3 }}>{item.label}</Text>
              </BlurView>
            ))}
          </View>

          {/* Actions */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>РЕЗЕРВНЕ КОПІЮВАННЯ</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, marginBottom: 24 }]}>
            <TouchableOpacity onPress={handleExport} style={[st.row, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: '#8B5CF620' }]}>
                <IconSymbol name="square.and.arrow.up" size={17} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>Експортувати дані</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Зберегти всі дані у JSON</Text>
              </View>
              <View style={[st.actionBadge, { backgroundColor: '#8B5CF620' }]}>
                <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>JSON</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setImportText(''); setShowImport(true); }} style={st.row}>
              <View style={[st.iconBox, { backgroundColor: '#0EA5E920' }]}>
                <IconSymbol name="square.and.arrow.down" size={17} color="#0EA5E9" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>Імпортувати дані</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Відновити дані з JSON-файлу</Text>
              </View>
              <View style={[st.actionBadge, { backgroundColor: '#0EA5E920' }]}>
                <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '700' }}>JSON</Text>
              </View>
            </TouchableOpacity>
          </BlurView>

          {/* Danger zone */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>НЕБЕЗПЕЧНА ЗОНА</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: '#EF444430' }]}>
            <View style={[st.dangerHint, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#EF4444" />
              <Text style={{ color: '#EF4444', fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 17 }}>
                Після очищення відновлення даних неможливе. Спочатку зробіть експорт.
              </Text>
            </View>
            <TouchableOpacity onPress={handleClear} style={[st.row, { paddingTop: 12 }]}>
              <View style={[st.iconBox, { backgroundColor: '#EF444420' }]}>
                <IconSymbol name="trash.fill" size={17} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '600' }}>Очистити всі дані</Text>
                <Text style={{ color: '#EF444480', fontSize: 12, marginTop: 2 }}>Видалити завдання, транзакції, час</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color="#EF444460" />
            </TouchableOpacity>
          </BlurView>

        </ScrollView>
      </SafeAreaView>

      {/* ─── Import Modal ─── */}
      <Modal visible={showImport} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowImport(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowImport(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={st.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[st.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowImport(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[st.sheetTitle, { color: c.text }]}>Імпорт даних</Text>
                  <Text style={{ color: c.sub, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
                    Вставте вміст JSON-файлу, отриманого через «Експортувати дані».
                  </Text>

                  <TextInput
                    placeholder='{"version":"1.0","tasks":[...],...}'
                    placeholderTextColor={c.sub}
                    value={importText}
                    onChangeText={setImportText}
                    multiline
                    numberOfLines={6}
                    style={[st.jsonInput, { backgroundColor: c.dim, color: c.text, borderColor: c.border }]}
                    textAlignVertical="top"
                  />

                  <View style={[st.dangerHint, { backgroundColor: '#F59E0B15', borderColor: '#F59E0B40', marginTop: 12 }]}>
                    <IconSymbol name="exclamationmark.triangle" size={14} color="#F59E0B" />
                    <Text style={{ color: '#F59E0B', fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 17 }}>
                      Імпорт замінить поточні дані. Спочатку зробіть експорт, щоб не втратити їх.
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                    <TouchableOpacity onPress={() => setShowImport(false)} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleImport}
                      disabled={!importText.trim() || importing}
                      style={[st.btn, { flex: 2, backgroundColor: !importText.trim() ? c.dim : c.accent }]}>
                      <Text style={{ color: !importText.trim() ? c.sub : '#fff', fontWeight: '700' }}>
                        {importing ? 'Імпортую...' : 'Імпортувати'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle:   { fontSize: 28, fontWeight: '800', letterSpacing: -0.7 },
  headerBtn:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn:     { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  statCard:    { borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  statIcon:    { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card:        { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 0 },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  iconBox:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  dangerHint:  { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, borderWidth: 1, padding: 12, margin: 14, marginBottom: 0 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: '90%' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  jsonInput:   { borderRadius: 12, padding: 13, fontSize: 12, fontFamily: 'monospace', minHeight: 130, borderWidth: 1 },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
