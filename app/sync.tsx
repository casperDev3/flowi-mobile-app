import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { collectAllData, mergeAndSave } from '@/store/sync';
import { loadConflicts, resolveConflict, SyncConflict } from '@/store/sync-conflicts';

const DEFAULT_PORT = 7842;

const DATA_KEY_LABELS: Record<string, string> = {
  tasks: 'Завдання', transactions: 'Транзакції', time_entries: 'Час',
  notes: 'Нотатки', projects: 'Проекти', bugs: 'Баги', ideas: 'Ідеї',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Назва', name: 'Назва', description: 'Опис', status: 'Статус',
  priority: 'Пріоритет', fixed: 'Виправлено', severity: 'Серйозність',
  updatedAt: 'Оновлено', amount: 'Сума', type: 'Тип', color: 'Колір',
};

type SyncStatus = 'idle' | 'fetching' | 'merging' | 'posting' | 'done' | 'error';

const STATUS_LABELS: Record<SyncStatus, string> = {
  idle:     'Очікує підключення',
  fetching: 'Отримання даних…',
  merging:  'Об\'єднання даних…',
  posting:  'Відправка назад…',
  done:     'Синхронізовано',
  error:    'Помилка',
};

export default function SyncScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [manualIp, setManualIp] = useState('');
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [newConflictCount, setNewConflictCount] = useState(0);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED', green: '#10B981', orange: '#F59E0B', red: '#EF4444',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  const refreshConflicts = useCallback(async () => {
    setConflicts(await loadConflicts());
  }, []);

  useEffect(() => { refreshConflicts(); }, [refreshConflicts]);

  // ─── Core sync logic ──────────────────────────────────────────────────────
  const syncWithHost = useCallback(async (ip: string, port: number = DEFAULT_PORT) => {
    const url = `http://${ip.trim()}:${port}`;
    setErrorMsg('');
    try {
      // 1. Fetch data from desktop
      setStatus('fetching');
      const res = await fetch(`${url}/`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Сервер відповів: ${res.status}`);
      const remoteData: Record<string, any[]> = await res.json();

      // 2. Merge locally
      setStatus('merging');
      const conflictCount = await mergeAndSave(remoteData);

      // 3. Send merged data back
      setStatus('posting');
      const merged = await collectAllData();
      const postRes = await fetch(`${url}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (!postRes.ok) throw new Error(`Помилка відправки: ${postRes.status}`);

      setNewConflictCount(prev => prev + conflictCount);
      await refreshConflicts();
      setStatus('done');
    } catch (e: any) {
      setErrorMsg(String(e?.message ?? e));
      setStatus('error');
    }
  }, [refreshConflicts]);

  const handleManualConnect = () => {
    const ip = manualIp.trim();
    if (!ip) return;
    syncWithHost(ip);
  };

  const handleResolve = async (id: string, choice: 'local' | 'remote') => {
    await resolveConflict(id, choice);
    await refreshConflicts();
  };

  const isLoading = status === 'fetching' || status === 'merging' || status === 'posting';
  const statusColor =
    status === 'done' ? c.green :
    status === 'error' ? c.red :
    isLoading ? c.accent : c.sub;

  // ─── Main screen ──────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name="chevron.left" size={22} color={c.accent} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: c.text }]}>Синхронізація</Text>
          <View style={{ width: 28 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">

            {/* ── Connect card ── */}
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}>

              {/* Status row */}
              <View style={[st.statusRow, { backgroundColor: statusColor + '15', borderColor: statusColor + '30' }]}>
                <View style={[st.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[st.statusText, { color: statusColor }]}>
                  {STATUS_LABELS[status]}
                </Text>
                {isLoading && <ActivityIndicator size="small" color={statusColor} style={{ marginLeft: 6 }} />}
              </View>

              {/* WiFi note */}
              <View style={[st.wifiNote, { backgroundColor: c.accent + '10', borderColor: c.accent + '20' }]}>
                <IconSymbol name="wifi" size={14} color={c.accent} />
                <Text style={[st.wifiNoteText, { color: c.accent }]}>
                  Пристрої мають бути в одній WiFi мережі
                </Text>
              </View>

              {/* Error */}
              {status === 'error' && errorMsg ? (
                <View style={[st.errorBox, { backgroundColor: c.red + '12', borderColor: c.red + '28' }]}>
                  <IconSymbol name="exclamationmark.circle" size={14} color={c.red} />
                  <Text style={[st.errorText, { color: c.red }]}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Manual IP input */}
              <View style={[st.ipRow, { borderColor: c.border }]}>
                <TextInput
                  style={[st.ipInput, { color: c.text }]}
                  placeholder="192.168.1.X"
                  placeholderTextColor={c.sub}
                  value={manualIp}
                  onChangeText={setManualIp}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={handleManualConnect}
                  disabled={!manualIp.trim() || isLoading}
                  style={[st.ipBtn, {
                    backgroundColor: manualIp.trim() && !isLoading ? c.accent : c.border,
                  }]}>
                  <IconSymbol name="arrow.right" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </BlurView>

            {/* ── Success ── */}
            {status === 'done' && conflicts.length === 0 && (
              <View style={[st.banner, { backgroundColor: c.green + '12', borderColor: c.green + '28' }]}>
                <View style={[st.bannerIcon, { backgroundColor: c.green + '20' }]}>
                  <IconSymbol name="checkmark" size={18} color={c.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.bannerTitle, { color: c.green }]}>Синхронізовано успішно</Text>
                  <Text style={[st.bannerSub, { color: c.sub }]}>Всі дані актуальні</Text>
                </View>
              </View>
            )}

            {/* ── New conflicts banner ── */}
            {newConflictCount > 0 && (
              <View style={[st.banner, { backgroundColor: c.orange + '12', borderColor: c.orange + '28' }]}>
                <View style={[st.bannerIcon, { backgroundColor: c.orange + '20' }]}>
                  <IconSymbol name="exclamationmark.triangle" size={18} color={c.orange} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.bannerTitle, { color: c.orange }]}>Знайдено {newConflictCount} конфліктів</Text>
                  <Text style={[st.bannerSub, { color: c.sub }]}>Перегляньте та вирішіть нижче</Text>
                </View>
              </View>
            )}

            {/* ── Conflicts ── */}
            {conflicts.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={[st.sectionLabel, { color: c.sub }]}>КОНФЛІКТИ ({conflicts.length})</Text>
                {conflicts.map(conflict => (
                  <ConflictCard key={conflict.id} conflict={conflict}
                    onResolve={handleResolve} c={c} isDark={isDark} />
                ))}
              </View>
            )}

            {/* ── How-to ── */}
            {status === 'idle' && conflicts.length === 0 && (
              <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
                style={[st.card, { borderColor: c.border }]}>
                <Text style={[st.howTitle, { color: c.text }]}>Як синхронізувати?</Text>
                {[
                  'Відкрийте Flowi на комп\'ютері',
                  'Перейдіть до «Синхронізація» у боковому меню',
                  'Натисніть «Запустити сервер»',
                  'Введіть IP-адресу комп\'ютера у поле вище та натисніть →',
                ].map((text, i) => (
                  <View key={i} style={st.stepRow}>
                    <View style={[st.stepNum, { backgroundColor: c.accent + '18' }]}>
                      <Text style={[st.stepNumText, { color: c.accent }]}>{i + 1}</Text>
                    </View>
                    <Text style={[st.stepText, { color: c.sub }]}>{text}</Text>
                  </View>
                ))}
              </BlurView>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── ConflictCard ─────────────────────────────────────────────────────────────

function ConflictCard({ conflict, onResolve, c, isDark }: {
  conflict: SyncConflict;
  onResolve: (id: string, choice: 'local' | 'remote') => void;
  c: any; isDark: boolean;
}) {
  const label = DATA_KEY_LABELS[conflict.dataKey] ?? conflict.dataKey;
  const name = conflict.local?.title ?? conflict.local?.name ?? `#${String(conflict.local?.id ?? '').slice(0, 6)}`;
  const diffs = getFieldDiffs(conflict.local, conflict.remote);

  return (
    <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
      style={[st.conflictCard, { borderColor: '#F59E0B28' }]}>

      <View style={[st.conflictHead, { borderBottomColor: c.border }]}>
        <View style={[st.conflictDot, { backgroundColor: '#F59E0B' }]} />
        <Text style={st.conflictLabel}>{label.toUpperCase()}</Text>
        <Text style={[st.conflictName, { color: c.text, flex: 1 }]} numberOfLines={1}>{name}</Text>
        <Text style={[st.diffCount, { color: c.sub }]}>{diffs.length} змін</Text>
      </View>

      <View style={st.versionsRow}>
        <VersionPanel label="Мій пристрій" accent="#7C3AED" diffs={diffs} version="local" c={c} />
        <View style={[st.vDivider, { backgroundColor: c.border }]} />
        <VersionPanel label="Інший пристрій" accent="#6366F1" diffs={diffs} version="remote" c={c} />
      </View>

      <View style={[st.conflictActions, { borderTopColor: c.border }]}>
        <TouchableOpacity onPress={() => onResolve(conflict.id, 'local')}
          style={[st.resolveBtn, { backgroundColor: 'rgba(124,58,237,0.1)', borderRightColor: c.border }]}>
          <IconSymbol name="checkmark" size={13} color="#7C3AED" />
          <Text style={[st.resolveBtnText, { color: '#7C3AED' }]}>Залишити моє</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onResolve(conflict.id, 'remote')}
          style={[st.resolveBtn, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
          <IconSymbol name="checkmark" size={13} color="#6366F1" />
          <Text style={[st.resolveBtnText, { color: '#6366F1' }]}>Прийняти інше</Text>
        </TouchableOpacity>
      </View>
    </BlurView>
  );
}

function VersionPanel({ label, accent, diffs, version, c }: {
  label: string; accent: string;
  diffs: { key: string; local: string; remote: string }[];
  version: 'local' | 'remote'; c: any;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={st.vLabelRow}>
        <View style={[st.vDot, { backgroundColor: accent }]} />
        <Text style={[st.vLabel, { color: accent }]}>{label.toUpperCase()}</Text>
      </View>
      {diffs.length === 0
        ? <Text style={{ fontSize: 12, color: c.sub }}>Без змін</Text>
        : diffs.map(f => (
          <View key={f.key} style={{ marginBottom: 7 }}>
            <Text style={[st.fKey, { color: c.sub }]}>{(FIELD_LABELS[f.key] ?? f.key).toUpperCase()}</Text>
            <Text style={[st.fVal, { color: c.text }]} numberOfLines={2}>
              {version === 'local' ? f.local : f.remote}
            </Text>
          </View>
        ))
      }
    </View>
  );
}

function getFieldDiffs(local: any, remote: any) {
  const IGNORE = new Set(['id', 'createdAt']);
  return [...new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])]
    .filter(k => !IGNORE.has(k))
    .map(key => ({ key, local: fmt(local?.[key]), remote: fmt(remote?.[key]) }))
    .filter(f => f.local !== f.remote)
    .slice(0, 5);
}

function fmt(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Так' : 'Ні';
  if (Array.isArray(v)) return `${v.length} ел.`;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s))
    return new Date(s).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return s.slice(0, 60);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  card:          { borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 20, marginBottom: 16 },
  statusRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  statusDot:     { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  statusText:    { fontSize: 13, fontWeight: '600', flex: 1 },
  wifiNote:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  wifiNoteText:  { fontSize: 12, fontWeight: '600', flex: 1 },
  errorBox:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  errorText:     { flex: 1, fontSize: 12, lineHeight: 18 },
  divRow:        { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  divLine:       { flex: 1, height: 1 },
  divLabel:      { fontSize: 12, fontWeight: '500' },
  ipRow:         { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  ipInput:       { flex: 1, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  ipBtn:         { width: 48, height: 50, alignItems: 'center', justifyContent: 'center' },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  bannerIcon:    { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bannerTitle:   { fontSize: 14, fontWeight: '700' },
  bannerSub:     { fontSize: 12, marginTop: 2 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, marginLeft: 2 },
  howTitle:      { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  stepRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum:       { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepNumText:   { fontSize: 11, fontWeight: '800' },
  stepText:      { flex: 1, fontSize: 13, lineHeight: 20 },
  conflictCard:  { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  conflictHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  conflictDot:   { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  conflictLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: '#F59E0B' },
  conflictName:  { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  diffCount:     { fontSize: 10, fontWeight: '600' },
  versionsRow:   { flexDirection: 'row', padding: 14, gap: 12 },
  vDivider:      { width: 1 },
  vLabelRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  vDot:          { width: 5, height: 5, borderRadius: 3 },
  vLabel:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fKey:          { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2 },
  fVal:          { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  conflictActions:{ flexDirection: 'row', borderTopWidth: 1 },
  resolveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13, borderRightWidth: 1 },
  resolveBtnText:{ fontSize: 13, fontWeight: '700' },
});
