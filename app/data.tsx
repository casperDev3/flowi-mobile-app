import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useAutoBackup } from '@/store/auto-backup';
import { BACKUP_KEYS } from '@/store/backup-keys';
import { loadData, notifyStorageChanged, saveData } from '@/store/storage';
import { SYNC_ARRAY_KEYS, saveSynced } from '@/store/synced-storage';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { localDateKey } from '@/utils/dateUtils';
import { glassStyles } from '@/components/finance/finPalette';
import { BentoCard, BentoGrid, KpiCounter, MeshBackground, PageHeader } from '@/components/ds';
import { useResponsive } from '@/hooks/use-responsive';

const ALL_KEYS = [
  { key: 'tasks',             label: 'Завдання',    icon: 'checklist',          color: '#7C3AED' },
  { key: 'task_statuses',     label: 'Статуси задач', icon: 'rectangle.3.group', color: '#8B5CF6' },
  { key: 'transactions',      label: 'Транзакції',  icon: 'banknote',           color: '#0EA5E9' },
  { key: 'accounts',          label: 'Рахунки',     icon: 'creditcard.fill',    color: '#0EA5E9' },
  { key: 'time_entries',      label: 'Записи часу', icon: 'timer',              color: '#6366F1' },
  { key: 'notes',             label: 'Нотатки',     icon: 'note.text',          color: '#F59E0B' },
  { key: 'projects',          label: 'Проекти',     icon: 'folder.fill',        color: '#10B981' },
  // Плитка потрібна не лише заради лічильника: файловий експорт нижче
  // збирає payload САМЕ по ALL_KEYS, тож ключ, якого тут немає, у файл не
  // потрапляє — хоч би що стояло в EXPORT_KEY_MAP.
  { key: 'sprints',           label: 'Спринти',     icon: 'flag.fill',          color: '#10B981' },
  { key: 'meetings',          label: 'Зустрічі',    icon: 'calendar',           color: '#6366F1' },
  { key: 'health_entries_v2', label: 'Здоров\'я',   icon: 'heart.fill',         color: '#10B981' },
  { key: 'workouts',          label: 'Тренування',  icon: 'figure.run',         color: '#0EA5E9' },
  { key: 'exercises',         label: 'Вправи',      icon: 'dumbbell.fill',      color: '#0EA5E9' },
  { key: 'workout_programs',  label: 'Програми',    icon: 'clipboard.fill',     color: '#0EA5E9' },
  { key: 'savings_jars',      label: 'Скарбнички',  icon: 'creditcard.fill',    color: '#EAB308' },
  { key: 'containers',        label: 'Ящики',       icon: 'archivebox.fill',    color: '#7C3AED' },
  { key: 'bugs',              label: 'Баги',        icon: 'ladybug.fill',       color: '#EF4444' },
  { key: 'ideas',             label: 'Ідеї',        icon: 'lightbulb.fill',     color: '#8B5CF6' },
  { key: 'health_meds',       label: 'Ліки',        icon: 'pills.fill',         color: '#14B8A6' },
  { key: 'health_checkups',   label: 'Медогляди',   icon: 'cross.case.fill',    color: '#EF4444' },
  { key: 'health_vaccines',   label: 'Щеплення',    icon: 'syringe',            color: '#F97316' },
  { key: 'health_habits',     label: 'Звички',      icon: 'checklist',          color: '#A855F7' },
  { key: 'subscriptions',     label: 'Підписки',    icon: 'repeat',             color: '#8B5CF6' },
] as const;

// Ключі, що йдуть у файловий експорт БЕЗ плитки-лічильника на екрані:
// регулярні доходи (finance-revamp.md §4.2) і контейнери v2 (containers.md §3.4 —
// місця й речі). `media_assets` (метадані фото без байтів) і
// `training_sessions` (розгортає сервер із програми групи) у файл свідомо не
// йдуть — див. NOT_IN_JSON_EXPORT у __tests__/backup-keys.test.ts.
const EXPORT_ONLY_KEYS = ['recurring_incomes', 'container_places', 'container_items'] as const;

// export key maps storage key → JSON key (snake_case → camelCase where needed)
const EXPORT_KEY_MAP: Record<string, string> = {
  tasks: 'tasks', task_statuses: 'taskStatuses', transactions: 'transactions', accounts: 'accounts', time_entries: 'timeEntries',
  notes: 'notes', projects: 'projects', bugs: 'bugs', ideas: 'ideas',
  sprints: 'sprints',
  meetings: 'meetings', health_entries_v2: 'healthEntries',
  workouts: 'workouts', exercises: 'exercises', workout_programs: 'workoutPrograms',
  savings_jars: 'savingsJars', containers: 'containers',
  health_meds: 'healthMeds', health_checkups: 'healthCheckups',
  health_vaccines: 'healthVaccines', health_habits: 'healthHabits',
  subscriptions: 'subscriptions',
  recurring_incomes: 'recurringIncomes', container_places: 'containerPlaces', container_items: 'containerItems',
};
const IMPORT_KEY_MAP: Record<string, string> = {
  tasks: 'tasks', taskStatuses: 'task_statuses', transactions: 'transactions', accounts: 'accounts', timeEntries: 'time_entries',
  notes: 'notes', projects: 'projects', bugs: 'bugs', ideas: 'ideas',
  sprints: 'sprints',
  meetings: 'meetings', healthEntries: 'health_entries_v2',
  workouts: 'workouts', exercises: 'exercises', workoutPrograms: 'workout_programs',
  savingsJars: 'savings_jars', containers: 'containers',
  healthMeds: 'health_meds', healthCheckups: 'health_checkups',
  healthVaccines: 'health_vaccines', healthHabits: 'health_habits',
  subscriptions: 'subscriptions',
  recurringIncomes: 'recurring_incomes', containerPlaces: 'container_places', containerItems: 'container_items',
  // categories is an object — handled separately
  categories: 'categories',
};

// Службові ключі синхронізації — очищуються разом з даними, але НЕ: auth, app_mode, lang, notificationsEnabled
const SERVICE_CLEAR_KEYS = [
  'sync_outbox',
  'sync_pending_conflicts',
  // Стан протоколу v2. Без цих трьох очищення даних лишало ненульовий курсор і
  // мапу ревізій на записи, яких уже немає — це давало тихий розсинхрон.
  'server_change_cursor_v2',
  'server_record_revisions_v2',
  'last_server_sync_error_v2',
  'last_server_sync_completed_at',
  'last_backup_at',
  // Legacy: писались P2P-синком і тумбстоунами, прибрані у 2026-08. Лишені в
  // списку, щоб очистити наявні інсталяції.
  'sync_tombstones',
  'last_sync_timestamp',
] as const;

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
  const { tr } = useI18n();
  const contentWidth = useContentWidth();
  const { t, g, isDark, reduceTransparency } = useDS();
  const router = useRouter();
  const { triggerBackup, getLastBackupTime, getLastBackupUri, isAutoBackupEnabled, setAutoBackupEnabled } = useAutoBackup();

  const [counts, setCounts] = useState<Counts>({});
  const [lastBackup, setLastBackup] = useState<Date | null>(null);
  const [autoBackup, setAutoBackup] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  const [openingBackup, setOpeningBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // Палітра — у useMemo: рядки статистики під React.memo інакше
  // перемальовувалися б через новий об'єкт кольорів на кожен рендер.
  // DS v2: токени теми замість фіолетової палітри екрана.
  // DS v2.1: mesh-основа, скляні картки (gl), акцент — lavender (ink/tint).
  const c = useMemo(() => ({
    bg1:    g.mesh.base,
    bg2:    g.mesh.base,
    card:   reduceTransparency ? g.solid.card : g.surface,
    border: t.border.hairline,
    text:   t.text.primary,
    sub:    t.text.secondary,
    accent: g.accent.lavender.ink,
    accentTint: g.accent.lavender.tint,
    dim:    g.surfaceSubtle,
    danger: t.status.danger,
    cardShadow: g.shadow,
    gl:     glassStyles(isDark, reduceTransparency),
  }), [t, g, isDark, reduceTransparency]);

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

  const handleAutoBackupToggle = useCallback(async (val: boolean) => {
    setAutoBackup(val);
    await setAutoBackupEnabled(val);
  }, [setAutoBackupEnabled]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const results = await Promise.all(ALL_KEYS.map(k => loadData(k.key, [])));
      const categories = await loadData<object>('categories', {});
      const payload: Record<string, unknown> = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
      };
      ALL_KEYS.forEach((k, i) => { payload[EXPORT_KEY_MAP[k.key]] = results[i]; });
      const extra = await Promise.all(EXPORT_ONLY_KEYS.map(key => loadData(key, [])));
      EXPORT_ONLY_KEYS.forEach((key, i) => { payload[EXPORT_KEY_MAP[key]] = extra[i]; });
      payload['categories'] = categories;

      const dateStr = localDateKey(new Date()); // локальна доба, не UTC
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
  }, [exporting]);

  const handleImport = useCallback(async () => {
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
                    .map(([exportKey, storageKey]) => {
                      const isSyncArray = (SYNC_ARRAY_KEYS as readonly string[]).includes(storageKey);
                      if (isSyncArray && Array.isArray(parsed[exportKey])) {
                        return saveSynced(storageKey, parsed[exportKey]);
                      }
                      return saveData(storageKey, parsed[exportKey]);
                    })
                );
                await loadCounts();
                Alert.alert('Успішно', 'Дані завантажено.', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
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
  }, [importing, loadCounts, router]);

  const handleBackupNow = useCallback(async () => {
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
  }, [backingUp, triggerBackup, getLastBackupTime]);

  const handleOpenLastBackup = useCallback(async () => {
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
  }, [openingBackup, getLastBackupUri]);

  const handleRestoreFromBackup = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const uri = await getLastBackupUri();
      if (!uri) {
        Alert.alert('Немає копії', 'Резервний файл не знайдено. Спочатку створіть копію.');
        setRestoring(false);
        return;
      }
      Alert.alert(
        'Відновити з бекапу?',
        'Поточні дані буде замінено даними з резервної копії.',
        [
          { text: 'Скасувати', style: 'cancel', onPress: () => setRestoring(false) },
          {
            text: 'Відновити', style: 'destructive',
            onPress: async () => {
              try {
                const file = new File(uri);
                const parsed = JSON.parse(await file.text());
                if (!parsed || typeof parsed !== 'object') throw new Error('Bad format');

                // v2.0 backup: keys stored under their storage key names directly
                // v1.0 / manual export (camelCase): handled via IMPORT_KEY_MAP
                const saves: Promise<void>[] = [];

                // Direct storage key format (v2.0 flowi-backup-* files)
                for (const key of BACKUP_KEYS) {
                  if (parsed[key] !== undefined) {
                    const isSyncArray = (SYNC_ARRAY_KEYS as readonly string[]).includes(key);
                    saves.push(
                      isSyncArray && Array.isArray(parsed[key])
                        ? saveSynced(key, parsed[key])
                        : saveData(key, parsed[key])
                    );
                  }
                }

                // camelCase format fallback (v1.0 f-tracking-* or manual export files)
                for (const [exportKey, storageKey] of Object.entries(IMPORT_KEY_MAP)) {
                  if (parsed[exportKey] !== undefined && parsed[storageKey] === undefined) {
                    const isSyncArray = (SYNC_ARRAY_KEYS as readonly string[]).includes(storageKey);
                    saves.push(
                      isSyncArray && Array.isArray(parsed[exportKey])
                        ? saveSynced(storageKey, parsed[exportKey])
                        : saveData(storageKey, parsed[exportKey])
                    );
                  }
                }

                await Promise.all(saves);
                await loadCounts();
                Alert.alert('Успішно', 'Дані відновлено.', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              } catch {
                Alert.alert('Помилка', 'Не вдалося відновити дані.');
              } finally {
                setRestoring(false);
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert('Помилка', 'Не вдалося прочитати файл резервної копії.');
      setRestoring(false);
    }
  }, [restoring, getLastBackupUri, loadCounts, router]);

  const handleClear = useCallback(() =>
    Alert.alert(
      'Очистити всі дані?',
      'Цю дію неможливо скасувати. Всі записи будуть видалені.\nАкаунт і налаштування залишаться.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Продовжити', style: 'destructive',
          onPress: () => Alert.alert(
            'Останнє підтвердження',
            'Ви впевнені? Після очищення відновлення даних неможливе.\nАкаунт і налаштування залишаться без змін.',
            [
              { text: 'Скасувати', style: 'cancel' },
              {
                text: 'Видалити все', style: 'destructive',
                onPress: async () => {
                  // Remove all BACKUP_KEYS data + service/sync keys
                  const cleared = [
                    ...(BACKUP_KEYS as readonly string[]),
                    ...(SERVICE_CLEAR_KEYS as readonly string[]),
                  ];
                  await AsyncStorage.multiRemove(cleared);
                  // multiRemove іде повз saveData, тож підписники сховища про
                  // очищення не дізнались би. Стор активних таймерів після
                  // цього повернув би стертий реєстр першим же стартом.
                  // Стрілка, а не `forEach(notifyStorageChanged)`: у сигналу
                  // тепер є другий параметр (джерело запису), і точкова
                  // передача передавала б туди ІНДЕКС масиву.
                  cleared.forEach(key => notifyStorageChanged(key));
                  const empty: Counts = {};
                  ALL_KEYS.forEach(k => { empty[k.key] = 0; });
                  setCounts(empty);
                  Alert.alert('Готово', 'Всі дані видалено. Акаунт і налаштування збережено.\nПерезапустіть додаток.');
                },
              },
            ],
          ),
        },
      ],
    ), []);

  const totalItems = Object.values(counts).reduce((s, v) => s + v, 0);
  const { isCompact } = useResponsive();

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* Заголовок був вшитий рядком — тепер зі словника. Розділу немає в
            сайдбарі, тож на планшеті замість стрілки — шлях «Налаштування →
            Управління даними»: він каже, звідки прийшов, чого стрілка не
            казала ніколи. */}
        <ScreenHeader
          title={tr.dataManagement}
          color={c.text}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { ...c.gl.card, borderColor: 'transparent' },
          }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.dataManagement },
          ]}
          crumbColor={c.sub}>
          {/* Omni: KPI сторінки — з даних, що вже є на екрані. */}
          <PageHeader
            bleed={isCompact ? 20 : 0}
            kpis={
              <>
                <KpiCounter value={totalItems} label="Всього записів" />
                <KpiCounter value={formatBackupTime(lastBackup)} label="Остання копія" />
              </>
            }
          />
        </ScreenHeader>

        <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 40 }]} showsVerticalScrollIndicator={false}>

          {/* Omni: розділи — bento-картки (1 колонка на телефоні, 2 на планшеті). */}
          <BentoGrid columns={{ compact: 1, medium: 2, expanded: 2 }}>
          {/* ─── Auto-backup ─── */}
          <BentoCard title="Авто-резервування" icon="clock.arrow.2.circlepath" accent="lavender">
            <View style={[st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: c.accentTint }]}>
                <IconSymbol name="clock.arrow.2.circlepath" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>Авто-резервування</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Кожні 3 години поки додаток активний</Text>
              </View>
              <Switch
                value={autoBackup}
                onValueChange={handleAutoBackupToggle}
                trackColor={{ false: t.border.hairline, true: t.status.success }}
                thumbColor="#fff"
                ios_backgroundColor={t.border.hairline}
              />
            </View>

            <View style={[st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: t.status.success + '1F' }]}>
                <IconSymbol name="checkmark.shield.fill" size={17} color={t.status.success} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>Остання копія</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{formatBackupTime(lastBackup)}</Text>
              </View>
            </View>

            <TouchableOpacity onPress={handleBackupNow} disabled={backingUp} style={[st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: t.action.primary }]}>
                <IconSymbol name="arrow.clockwise" size={17} color={t.text.onAction} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: backingUp ? c.sub : c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
                  {backingUp ? 'Збереження...' : 'Зробити копію зараз'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Зберегти у Documents додатку</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleOpenLastBackup} disabled={openingBackup} style={[st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: c.accentTint }]}>
                <IconSymbol name="folder.badge.magnifyingglass" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: openingBackup ? c.sub : c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
                  {openingBackup ? 'Відкриття...' : 'Відкрити останню копію'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Переглянути або поділитись файлом</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleRestoreFromBackup} disabled={restoring} style={st.row}>
              <View style={[st.iconBox, { backgroundColor: c.accentTint }]}>
                <IconSymbol name="arrow.triangle.2.circlepath" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: restoring ? c.sub : c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
                  {restoring ? 'Відновлення...' : 'Відновити з останнього бекапу'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Замінити поточні дані даними з копії</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>
          </BentoCard>

          {/* ─── Export / Import ─── */}
          <BentoCard title="Вивантаження та завантаження" icon="square.and.arrow.up" accent="lavender">
            <TouchableOpacity onPress={handleExport} disabled={exporting} style={[st.row, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <View style={[st.iconBox, { backgroundColor: c.accentTint }]}>
                <IconSymbol name="square.and.arrow.up" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: exporting ? c.sub : c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
                  {exporting ? 'Підготовка...' : 'Вивантажити дані'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Зберегти JSON-файл на телефон</Text>
              </View>
              <View style={[st.actionBadge, { backgroundColor: c.dim }]}>
                <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold }}>JSON</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleImport} disabled={importing} style={st.row}>
              <View style={[st.iconBox, { backgroundColor: c.accentTint }]}>
                <IconSymbol name="square.and.arrow.down" size={17} color={c.accent} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: importing ? c.sub : c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>
                  {importing ? 'Завантаження...' : 'Завантажити дані'}
                </Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Вибрати JSON-файл з телефону</Text>
              </View>
              <View style={[st.actionBadge, { backgroundColor: c.dim }]}>
                <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold }}>JSON</Text>
              </View>
            </TouchableOpacity>
          </BentoCard>

          {/* ─── Danger ─── */}
          <BentoCard title="Небезпечна зона" icon="exclamationmark.triangle.fill" accent="coral">
            {/* Небезпечна зона: корал — лише гліфами й тлом-тінтом; текст лишається читабельним (4.5:1). */}
            <View style={[st.dangerHint, { backgroundColor: c.danger + '12' }]}>
              <IconSymbol name="exclamationmark.triangle.fill" size={14} color={t.accent.coral} />
              <Text style={{ ...dsType.caption, color: c.text, marginLeft: 8, flex: 1, lineHeight: 17 }}>
                Після очищення відновлення даних неможливе. Спочатку зробіть вивантаження.
              </Text>
            </View>
            <TouchableOpacity onPress={handleClear} style={[st.row, { paddingTop: 12 }]}>
              <View style={[st.iconBox, { backgroundColor: c.danger + '1F' }]}>
                <IconSymbol name="trash.fill" size={17} color={c.danger} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.danger, fontSize: 14, fontFamily: fontFamily.semibold }}>Очистити всі дані</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>Видалити всі записи без можливості відновлення</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={c.sub} />
            </TouchableOpacity>
          </BentoCard>

          {/* ─── Stats compact ─── */}
          <BentoCard title="Статистика даних" icon="externaldrive.fill" accent="info">
            {/* Total */}
            <View style={[st.statRow, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
              <View style={[st.statDot, { backgroundColor: c.dim }]}>
                <IconSymbol name="externaldrive.fill" size={13} color={c.text} />
              </View>
              <Text style={[st.statLabel, { color: c.text }]}>Всього записів</Text>
              {/* Лічильник — display-цифри DS. */}
              <Text style={{ ...dsType.displaySm, fontSize: 32, lineHeight: 36, color: c.text }}>{totalItems}</Text>
            </View>
            {ALL_KEYS.map((item, i) => (
              <StatRow
                key={item.key}
                icon={item.icon as IconSymbolName}
                color={item.color}
                label={item.label}
                value={counts[item.key] ?? 0}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={i === ALL_KEYS.length - 1}
              />
            ))}
          </BentoCard>
          </BentoGrid>
        </ScrollView>
      </SafeAreaView>

    </View>
  );
}

// ─── Рядок статистики ────────────────────────────────────────────────────────

interface StatRowProps {
  icon: IconSymbolName;
  color: string;
  label: string;
  value: number;
  text: string;
  sub: string;
  border: string;
  last: boolean;
}

const StatRow = React.memo(function StatRow(
  { icon, color, label, value, text, sub, border, last }: StatRowProps,
) {
  // DS v2: нейтральні гліфи на subtle-плашці; колір модуля — тонкою крапкою.
  return (
    <View style={[st.statRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <View style={[st.statDot, { backgroundColor: color + '1F' }]}>
        <IconSymbol name={icon} size={13} color={color} />
      </View>
      <Text style={[st.statLabel, { color: sub }]}>{label}</Text>
      <Text style={[st.statVal, { color: value ? text : sub }]}>{value}</Text>
    </View>
  );
});

const st = StyleSheet.create({
  // Рядки лежать усередині BentoCard (вона дає бічні поля) — власних немає.
  statRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, paddingVertical: 10, gap: 10, minHeight: 44 },
  statDot:     { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  statLabel:   { flex: 1, fontSize: 14, fontFamily: fontFamily.regular },
  statVal:     { fontSize: 14, fontFamily: fontFamily.semibold, minWidth: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, paddingVertical: 14, minHeight: 56 },
  iconBox:     { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  actionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  dangerHint:  { flexDirection: 'row', alignItems: 'flex-start', borderRadius: radius.nestedCompact, padding: 12, marginBottom: 4 },
});
