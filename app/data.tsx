import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAutoBackup } from '@/store/auto-backup';
import { generateRoomCode, isSyncSupported, startSync, SyncSession, SyncStatus } from '@/store/sync';
import { loadData, saveData } from '@/store/storage';

const ALL_KEYS = [
  { key: 'tasks',        label: 'Завдання',    icon: 'checklist',                    color: '#7C3AED' },
  { key: 'transactions', label: 'Транзакції',  icon: 'banknote',                     color: '#0EA5E9' },
  { key: 'time_entries', label: 'Записи часу', icon: 'timer',                        color: '#6366F1' },
  { key: 'notes',        label: 'Нотатки',     icon: 'note.text',                    color: '#F59E0B' },
  { key: 'projects',     label: 'Проекти',     icon: 'folder.fill',                  color: '#10B981' },
  { key: 'bugs',         label: 'Баги',        icon: 'ladybug.fill',                 color: '#EF4444' },
  { key: 'ideas',        label: 'Ідеї',        icon: 'lightbulb.fill',               color: '#8B5CF6' },
] as const;

// export key maps to storage key (time_entries → timeEntries in JSON)
const EXPORT_KEY_MAP: Record<string, string> = {
  tasks: 'tasks', transactions: 'transactions', time_entries: 'timeEntries',
  notes: 'notes', projects: 'projects', bugs: 'bugs', ideas: 'ideas',
};
const IMPORT_KEY_MAP: Record<string, string> = {
  tasks: 'tasks', transactions: 'transactions', timeEntries: 'time_entries',
  notes: 'notes', projects: 'projects', bugs: 'bugs', ideas: 'ideas',
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  idle:      "Готовий до з'єднання",
  waiting:   'Очікування іншого пристрою...',
  connected: 'Пристрій підключено',
  syncing:   'Синхронізація...',
  done:      'Синхронізовано успішно',
  error:     "Помилка з'єднання",
};
const STATUS_COLOR: Record<SyncStatus, string> = {
  idle:      '#6B7280',
  waiting:   '#F59E0B',
  connected: '#3B82F6',
  syncing:   '#8B5CF6',
  done:      '#10B981',
  error:     '#EF4444',
};

function formatBackupTime(date: Date | null): string {
  if (!date) return 'Ще не було';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Щойно';
  if (mins < 60) return `${mins} хв тому`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} год тому`;
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

type Counts = Record<string, number>;

export default function DataScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { triggerBackup, getLastBackupTime, getLastBackupUri, isAutoBackupEnabled, setAutoBackupEnabled } = useAutoBackup();

  const [counts, setCounts] = useState<Counts>({});
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  const [autoBackup, setAutoBackup] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [openingBackup, setOpeningBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showSyncSheet, setShowSyncSheet] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [peerCount, setPeerCount] = useState(0);
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [joinMode, setJoinMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const syncSessionRef = useRef<SyncSession | null>(null);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)',
    overlay:isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)',
    sheet:  isDark ? '#1A1830' : '#F8F6FF',
  };
  const syncSupported = isSyncSupported();

  const loadCounts = useCallback(async () => {
    const results = await Promise.all(ALL_KEYS.map(k => loadData<any[]>(k.key, [])));
    const next: Counts = {};
    ALL_KEYS.forEach((k, i) => { next[k.key] = results[i].length; });
    setCounts(next);
  }, []);

  useEffect(() => {
    loadCounts();
    getLastBackupTime().then(setLastBackup);
    isAutoBackupEnabled().then(setAutoBackup);
  }, [loadCounts, getLastBackupTime, isAutoBackupEnabled]);

  useEffect(() => () => {
    syncSessionRef.current?.leave();
  }, []);

  const handleAutoBackupToggle = async (val: boolean) => {
    setAutoBackup(val);
    await setAutoBackupEnabled(val);
  };

  const beginSync = useCallback((code: string) => {
    if (!syncSupported) {
      setSyncStatus('error');
      return;
    }
    syncSessionRef.current?.leave();
    const session = startSync(
      code,
      (s) => {
        setSyncStatus(s);
        if (s === 'done') loadCounts();
      },
      setPeerCount,
    );
    syncSessionRef.current = session;
  }, [loadCounts, syncSupported]);

  const openSyncSheet = () => {
    const code = generateRoomCode();
    setShowSyncSheet(true);
    setSyncStatus('idle');
    setPeerCount(0);
    setJoinMode(false);
    setInputCode('');
    if (syncSupported) {
      setRoomCode(code);
      beginSync(code);
    } else {
      setRoomCode('');
      setSyncStatus('error');
      Alert.alert('Синхронізація недоступна', 'На цьому пристрої немає підтримки WebRTC. Спробуйте на десктопі або у веб-версії.');
    }
  };

  const closeSyncSheet = () => {
    syncSessionRef.current?.leave();
    syncSessionRef.current = null;
    setShowSyncSheet(false);
    setSyncStatus('idle');
    setPeerCount(0);
    setJoinMode(false);
    if (syncStatus === 'done') {
      loadCounts();
      Alert.alert('Готово', 'Синхронізацію завершено.');
    }
  };

  const switchJoinMode = (isJoin: boolean) => {
    setJoinMode(isJoin);
    syncSessionRef.current?.leave();
    syncSessionRef.current = null;
    setSyncStatus('idle');
    setPeerCount(0);
    if (!isJoin && syncSupported) {
      const code = roomCode || generateRoomCode();
      if (!roomCode) setRoomCode(code);
      beginSync(code);
    }
  };

  const handleStartAsHost = () => {
    if (!syncSupported) return;
    if (!roomCode) return;
    beginSync(roomCode);
  };

  const handleJoinRoom = () => {
    if (!syncSupported) return;
    const code = inputCode.trim().toUpperCase();
    if (code.length < 4) return;
    beginSync(code);
  };

  const handleNewCode = () => {
    if (!syncSupported) return;
    syncSessionRef.current?.leave();
    syncSessionRef.current = null;
    const code = generateRoomCode();
    setRoomCode(code);
    setSyncStatus('idle');
    setPeerCount(0);
    beginSync(code);
  };

  const copyCode = async () => {
    await Clipboard.setStringAsync(joinMode ? inputCode : roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const results = await Promise.all(ALL_KEYS.map(k => loadData(k.key, [])));
      const payload: Record<string, unknown> = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
      };
      ALL_KEYS.forEach((k, i) => { payload[EXPORT_KEY_MAP[k.key]] = results[i]; });

      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `flowi-export-${dateStr}.json`;
      const file = new File(Paths.document, fileName);
      file.create({ overwrite: true });
      file.write(JSON.stringify(payload, null, 2));

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Зберегти дані Flowi' });
      } else {
        Alert.alert('Готово', 'Файл збережено у Documents.');
      }
    } catch {
      Alert.alert('Помилка', 'Не вдалося експортувати дані.');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setImporting(false);
        return;
      }

      const file = new File(result.assets[0].uri);
      const parsed = JSON.parse(await file.text());

      if (!parsed || typeof parsed !== 'object') {
        Alert.alert('Помилка', 'Невірний формат файлу.');
        setImporting(false);
        return;
      }

      Alert.alert(
        'Завантажити дані?',
        'Поточні дані буде замінено даними з файлу. Спочатку зробіть резервну копію.',
        [
          { text: 'Скасувати', style: 'cancel', onPress: () => setImporting(false) },
          {
            text: 'Завантажити', style: 'destructive',
            onPress: async () => {
              try {
                await Promise.all(
                  Object.entries(IMPORT_KEY_MAP)
                    .filter(([exportKey]) => parsed[exportKey] !== undefined)
                    .map(([exportKey, storageKey]) => saveData(storageKey, parsed[exportKey]))
                );
                await loadCounts();
                Alert.alert('Успішно', 'Дані завантажено. Перезапустіть додаток для оновлення.');
              } catch {
                Alert.alert('Помилка', 'Не вдалося зберегти дані.');
              } finally {
                setImporting(false);
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert('Помилка', 'Не вдалося прочитати файл. Перевірте формат JSON.');
      setImporting(false);
    }
  };

  const handleBackupNow = async () => {
    if (backingUp) return;
    setBackingUp(true);
    const path = await triggerBackup();
    setLastBackup(await getLastBackupTime());
    setBackingUp(false);
    if (path) {
      Alert.alert('Резервну копію збережено', 'Файл збережено у Documents.\nФайли → На iPhone → Flowi.');
    } else {
      Alert.alert('Помилка', 'Не вдалося створити резервну копію.');
    }
  };

  const handleOpenLastBackup = async () => {
    if (openingBackup) return;
    setOpeningBackup(true);
    try {
      const uri = await getLastBackupUri();
      if (!uri) { Alert.alert('Немає копії', 'Спочатку створіть резервну копію.'); return; }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Відкрити резервну копію' });
      } else {
        Alert.alert('Файл', uri);
      }
    } catch {
      Alert.alert('Помилка', 'Не вдалося відкрити файл.');
    } finally {
      setOpeningBackup(false);
    }
  };

  const handleClear = () =>
    Alert.alert('Очистити всі дані?', 'Цю дію неможливо скасувати. Всі дані будуть видалені.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити все', style: 'destructive',
        onPress: async () => {
          await Promise.all(ALL_KEYS.map(k => saveData(k.key, [])));
          const empty: Counts = {};
          ALL_KEYS.forEach(k => { empty[k.key] = 0; });
          setCounts(empty);
          Alert.alert('Готово', 'Всі дані видалено. Перезапустіть додаток.');
        },
      },
    ]);

  const totalItems = Object.values(counts).reduce((s, v) => s + v, 0);
  const isActive = syncStatus !== 'idle' && syncStatus !== 'done' && syncStatus !== 'error';

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={[st.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[st.title, { color: c.text }]}>Управління даними</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {/* ─── Sync ─── */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>СИНХРОНІЗАЦІЯ</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, marginBottom: 24 }]}>
            <TouchableOpacity onPress={openSyncSheet} style={st.row}>
              <View style={[st.iconBox, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="arrow.up.arrow.down" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>Синхронізація між моїми пристроями</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>P2P — без сервера, напряму між пристроями</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>
          </BlurView>

          {/* ─── Auto-backup ─── */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>АВТО-РЕЗЕРВУВАННЯ</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, marginBottom: 24 }]}>
            <View style={[st.row, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: '#6366F120' }]}>
                <IconSymbol name="clock.arrow.2.circlepath" size={17} color="#6366F1" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>Авто-резервування</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Кожні 3 години поки додаток активний</Text>
              </View>
              <Switch
                value={autoBackup}
                onValueChange={handleAutoBackupToggle}
                trackColor={{ false: 'rgba(128,128,128,0.3)', true: c.accent }}
                thumbColor="#fff"
                ios_backgroundColor="rgba(128,128,128,0.3)"
              />
            </View>

            <View style={[st.row, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: '#10B98120' }]}>
                <IconSymbol name="checkmark.shield.fill" size={17} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>Остання копія</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{formatBackupTime(lastBackup)}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={handleBackupNow} disabled={backingUp} style={[st.row, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="arrow.clockwise" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: backingUp ? c.sub : c.accent, fontSize: 14, fontWeight: '600' }}>
                  {backingUp ? 'Збереження...' : 'Зробити копію зараз'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Зберегти у Documents додатку</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleOpenLastBackup} disabled={openingBackup} style={st.row}>
              <View style={[st.iconBox, { backgroundColor: '#10B98120' }]}>
                <IconSymbol name="folder.badge.magnifyingglass" size={17} color="#10B981" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: openingBackup ? c.sub : c.text, fontSize: 14, fontWeight: '600' }}>
                  {openingBackup ? 'Відкриття...' : 'Відкрити останню копію'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Переглянути або поділитись файлом</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>
          </BlurView>

          {/* ─── Export / Import ─── */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>ВИВАНТАЖЕННЯ ТА ЗАВАНТАЖЕННЯ</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, marginBottom: 24 }]}>
            <TouchableOpacity onPress={handleExport} disabled={exporting} style={[st.row, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: '#8B5CF620' }]}>
                <IconSymbol name="square.and.arrow.up" size={17} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: exporting ? c.sub : c.text, fontSize: 14, fontWeight: '600' }}>
                  {exporting ? 'Підготовка...' : 'Вивантажити дані'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Зберегти JSON-файл на телефон</Text>
              </View>
              <View style={[st.actionBadge, { backgroundColor: '#8B5CF620' }]}>
                <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>JSON</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleImport} disabled={importing} style={st.row}>
              <View style={[st.iconBox, { backgroundColor: '#0EA5E920' }]}>
                <IconSymbol name="square.and.arrow.down" size={17} color="#0EA5E9" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: importing ? c.sub : c.text, fontSize: 14, fontWeight: '600' }}>
                  {importing ? 'Завантаження...' : 'Завантажити дані'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Вибрати JSON-файл з телефону</Text>
              </View>
              <View style={[st.actionBadge, { backgroundColor: '#0EA5E920' }]}>
                <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '700' }}>JSON</Text>
              </View>
            </TouchableOpacity>
          </BlurView>

          {/* ─── Danger ─── */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>НЕБЕЗПЕЧНА ЗОНА</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: '#EF444430' }]}>
            <View style={[st.dangerHint, { backgroundColor: '#EF444410', borderColor: '#EF444430' }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#EF4444" />
              <Text style={{ color: '#EF4444', fontSize: 12, marginLeft: 8, flex: 1, lineHeight: 17 }}>
                Після очищення відновлення даних неможливе. Спочатку зробіть вивантаження.
              </Text>
            </View>
            <TouchableOpacity onPress={handleClear} style={[st.row, { paddingTop: 12 }]}>
              <View style={[st.iconBox, { backgroundColor: '#EF444420' }]}>
                <IconSymbol name="trash.fill" size={17} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '600' }}>Очистити всі дані</Text>
                <Text style={{ color: '#EF444480', fontSize: 12, marginTop: 2 }}>Видалити всі записи без можливості відновлення</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color="#EF444460" />
            </TouchableOpacity>
          </BlurView>

          {/* ─── Stats compact ─── */}
          <Text style={[st.sectionLabel, { color: c.sub, marginTop: 24 }]}>СТАТИСТИКА ДАНИХ</Text>
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, marginBottom: 24 }]}>
            {/* Total */}
            <View style={[st.statRow, { borderBottomWidth: 1, borderBottomColor: c.border }]}>
              <View style={[st.statDot, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="externaldrive.fill" size={13} color={c.accent} />
              </View>
              <Text style={[st.statLabel, { color: c.text }]}>Всього записів</Text>
              <Text style={[st.statVal, { color: c.accent }]}>{totalItems}</Text>
            </View>
            {ALL_KEYS.map((item, i) => (
              <View
                key={item.key}
                style={[st.statRow, i < ALL_KEYS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                <View style={[st.statDot, { backgroundColor: item.color + '20' }]}>
                  <IconSymbol name={item.icon as IconSymbolName} size={13} color={item.color} />
                </View>
                <Text style={[st.statLabel, { color: c.sub }]}>{item.label}</Text>
                <Text style={[st.statVal, { color: counts[item.key] ? c.text : c.sub }]}>
                  {counts[item.key] ?? 0}
                </Text>
              </View>
            ))}
          </BlurView>
        </ScrollView>
      </SafeAreaView>

      {showSyncSheet && (
        <View style={st.sheetOverlay}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeSyncSheet}
            style={[StyleSheet.absoluteFillObject, { backgroundColor: c.overlay }]}
          />
          <View style={[st.sheet, { backgroundColor: c.sheet, borderColor: c.border }]}>
            <View style={[st.sheetHandle, { backgroundColor: c.border }]} />

            <View style={st.sheetTitleRow}>
              <View style={[st.sheetIcon, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="arrow.up.arrow.down" size={18} color={c.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>Синхронізація пристроїв</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 1 }}>P2P через WebRTC — без сервера</Text>
              </View>
              <TouchableOpacity
                onPress={closeSyncSheet}
                style={[st.sheetClose, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="xmark" size={14} color={c.sub} />
              </TouchableOpacity>
            </View>

            <View style={[st.statusBar, { backgroundColor: STATUS_COLOR[syncStatus] + '15', borderColor: STATUS_COLOR[syncStatus] + '30' }]}>
              <View style={[st.statusDot, { backgroundColor: STATUS_COLOR[syncStatus] }]} />
              <Text style={[st.statusText, { color: STATUS_COLOR[syncStatus] }]}>{STATUS_LABEL[syncStatus]}</Text>
              {peerCount > 0 && (
                <View style={st.peerWrap}>
                  <IconSymbol name="checkmark.circle" size={13} color={STATUS_COLOR[syncStatus]} />
                  <Text style={[st.peerText, { color: STATUS_COLOR[syncStatus] }]}>{peerCount}</Text>
                </View>
              )}
            </View>
            {!syncSupported && (
              <View style={[st.unsupportedBox, { backgroundColor: '#EF444415', borderColor: '#EF444430' }]}>
                <IconSymbol name="exclamationmark.circle" size={14} color="#EF4444" />
                <Text style={[st.unsupportedText, { color: '#EF4444' }]}>
                  WebRTC недоступний на цьому пристрої. Синхронізація працює лише у десктопі або веб-версії.
                </Text>
              </View>
            )}

            {syncSupported && (
              <>
                <View style={[st.tabBar, { backgroundColor: c.dim, borderColor: c.border }]}>
                  {[false, true].map(isJoin => (
                    <TouchableOpacity
                      key={String(isJoin)}
                      onPress={() => switchJoinMode(isJoin)}
                      style={[
                        st.tabBtn,
                        {
                          backgroundColor: joinMode === isJoin ? c.card : 'transparent',
                          borderColor: joinMode === isJoin ? c.border : 'transparent',
                        },
                      ]}>
                      <Text style={{ color: joinMode === isJoin ? c.text : c.sub, fontSize: 13, fontWeight: '600' }}>
                        {isJoin ? 'Приєднатись' : 'Створити кімнату'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {!joinMode ? (
                  <View>
                    <Text style={[st.sheetLabel, { color: c.sub }]}>КОД КІМНАТИ</Text>
                    <View style={st.codeRow}>
                      <View style={[st.codeBox, { backgroundColor: c.dim, borderColor: c.border, marginRight: 8 }]}>
                        <Text style={[st.codeText, { color: c.accent }]}>{roomCode}</Text>
                      </View>
                      <View style={st.codeBtns}>
                        <TouchableOpacity
                          onPress={copyCode}
                          style={[
                            st.smallBtn,
                            { borderColor: c.border, backgroundColor: copied ? '#10B98120' : c.dim, marginBottom: 6 },
                          ]}>
                          <IconSymbol name={copied ? 'checkmark.circle.fill' : 'doc.on.clipboard'} size={16} color={copied ? '#10B981' : c.sub} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleNewCode}
                          style={[st.smallBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
                          <IconSymbol name="arrow.clockwise" size={16} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={[st.sheetHelp, { color: c.sub }]}>
                      Введіть цей код на іншому пристрої в розділі "Приєднатись". Обидва пристрої мають бути підключені до інтернету.
                    </Text>
                    <TouchableOpacity
                      onPress={handleStartAsHost}
                      disabled={isActive}
                      style={[
                        st.primaryBtn,
                        {
                          backgroundColor: isActive ? c.dim : c.accent,
                        },
                      ]}>
                      <IconSymbol name="arrow.up.arrow.down" size={16} color={isActive ? c.sub : '#fff'} />
                      <Text style={{ color: isActive ? c.sub : '#fff', fontSize: 15, fontWeight: '700', marginLeft: 8 }}>
                        {isActive ? 'Очікування...' : 'Відкрити кімнату'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={[st.sheetLabel, { color: c.sub }]}>КОД З ІНШОГО ПРИСТРОЮ</Text>
                    <View style={st.codeRow}>
                      <TextInput
                        value={inputCode}
                        onChangeText={t => setInputCode(t.toUpperCase())}
                        placeholder="XXXXXX"
                        maxLength={8}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        style={[st.codeInput, { backgroundColor: c.dim, borderColor: c.border, color: c.accent }]}
                        placeholderTextColor={c.sub}
                      />
                    </View>
                    <Text style={[st.sheetHelp, { color: c.sub }]}>
                      Введіть код з пристрою, який створив кімнату. Синхронізація відбудеться автоматично після підключення.
                    </Text>
                    <TouchableOpacity
                      onPress={handleJoinRoom}
                      disabled={inputCode.trim().length < 4 || isActive}
                      style={[
                        st.primaryBtn,
                        {
                          backgroundColor: inputCode.trim().length >= 4 && !isActive ? c.accent : c.dim,
                        },
                      ]}>
                      <IconSymbol name="paperplane.fill" size={16} color={inputCode.trim().length >= 4 && !isActive ? '#fff' : c.sub} />
                      <Text style={{ color: inputCode.trim().length >= 4 && !isActive ? '#fff' : c.sub, fontSize: 15, fontWeight: '700', marginLeft: 8 }}>
                        {isActive ? 'Підключення...' : 'Приєднатись'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  header:      { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  title:       { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  backBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 10, marginLeft: 2 },
  card:        { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 0 },
  statRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  statDot:     { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statLabel:   { flex: 1, fontSize: 13, fontWeight: '500' },
  statVal:     { fontSize: 14, fontWeight: '700', minWidth: 24, textAlign: 'right' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  iconBox:     { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actionBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  dangerHint:  { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10, borderWidth: 1, padding: 12, margin: 14, marginBottom: 0 },
  sheetOverlay:{ ...StyleSheet.absoluteFillObject, zIndex: 20, justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 20, paddingBottom: 24, paddingTop: 12 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  sheetTitleRow:{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sheetIcon:   { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sheetClose:  { width: 32, height: 32, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  statusDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText:  { fontSize: 13, fontWeight: '600', flex: 1 },
  peerWrap:    { flexDirection: 'row', alignItems: 'center' },
  peerText:    { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  unsupportedBox:{ flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 16 },
  unsupportedText:{ fontSize: 12, lineHeight: 16, marginLeft: 8, flex: 1 },
  tabBar:      { flexDirection: 'row', borderRadius: 12, padding: 4, borderWidth: 1, marginBottom: 16 },
  tabBtn:      { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', borderWidth: 1 },
  sheetLabel:  { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  codeRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  codeBox:     { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  codeText:    { fontSize: 22, fontWeight: '800', letterSpacing: 8, fontFamily: 'monospace' },
  codeBtns:    { flexDirection: 'column' },
  smallBtn:    { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sheetHelp:   { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  primaryBtn:  { width: '100%', paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  codeInput:   { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 14, fontSize: 22, fontWeight: '800', letterSpacing: 8, fontFamily: 'monospace', textAlign: 'center' },
});
