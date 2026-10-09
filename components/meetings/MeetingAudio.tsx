import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Audio } from 'expo-av';
import { Atlas } from '@/constants/atlas';
import { useProjectRole } from '@/hooks/use-project-role';
import { apiFetch } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { updateSynced } from '@/store/synced-storage';
import { setAdvertisingRecording } from '@/store/advertising-safety';
import type { Meeting } from '@/utils/meetings';
import { uuidV4 } from '@/utils/uuid';
import type { MeetingDetailColors } from './MeetingDetail';

type AudioFile = { id: string; name: string; size: number; contentType: string };
export function MeetingAudio({ meeting, colors: c }: { meeting: Meeting; colors: MeetingDetailColors }) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const t = (uk: string, english: string) => en ? english : uk;
  const canEdit = useProjectRole(meeting.projectId) !== 'viewer';
  const path = `/meetings/${encodeURIComponent(meeting.id)}/media/`;
  const query = meeting.projectId ? `?projectId=${encodeURIComponent(meeting.projectId)}` : '';
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const recorder = useRef<Audio.Recording | null>(null);
  const sound = useRef<Audio.Sound | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const cacheFiles = useRef<string[]>([]);
  const load = useCallback(async () => {
    try { const data = await apiFetch<{ results: AudioFile[] }>(path + query); if (mounted.current) { setFiles(data.results); setError(''); } }
    catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Audio unavailable'); }
  }, [path, query]);
  const persistRecording = useCallback(async (uri: string) => {
    const FS = await import('expo-file-system/legacy');
    const savedUri = `${FS.documentDirectory}meeting-${uuidV4()}.m4a`;
    await FS.copyAsync({ from: uri, to: savedUri });
    await updateSynced<Meeting>('meetings', fresh => fresh.map(item => item.id === meeting.id ? { ...item, recordings: [...(item.recordings ?? []), savedUri] } : item));
    return savedUri;
  }, [meeting.id]);
  useEffect(() => { const downloads = cacheFiles.current; mounted.current = true; void load(); return () => {
    mounted.current = false;
    const rec = recorder.current; recorder.current = null;
    if (rec) void rec.stopAndUnloadAsync().then(async () => { const uri = rec.getURI(); if (uri) await persistRecording(uri); }).catch(() => {});
    if (rec) {
      void import('expo-av').then(({ Audio: AV }) => AV.setAudioModeAsync({ allowsRecordingIOS: false })).catch(() => {});
      setAdvertisingRecording(false);
    }
    void sound.current?.unloadAsync();
    void import('expo-file-system/legacy').then(FS => Promise.all(downloads.map(uri => FS.deleteAsync(uri, { idempotent: true }))));
  }; }, [load, persistRecording]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : t('Не вдалося виконати дію', 'Action failed')); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const upload = async (uri: string, name: string, mimeType = 'audio/mp4', local = false) => {
    const FS = await import('expo-file-system/legacy');
    const info = await FS.getInfoAsync(uri);
    if (!info.exists || !info.size || info.size > 25 * 1024 * 1024) throw new Error(t('Файл недоступний на цьому пристрої або перевищує 25 МБ.', 'File unavailable on this device or larger than 25 MB.'));
    const form = new FormData();
    form.append('file', { uri, name, type: mimeType } as unknown as Blob);
    const saved = await apiFetch<AudioFile>(path + query, { method: 'POST', body: form });
    if (mounted.current) setFiles(current => [...current.filter(item => item.id !== saved.id), saved]);
    if (local) await updateSynced<Meeting>('meetings', fresh => fresh.map(item => item.id === meeting.id ? { ...item, recordings: (item.recordings ?? []).filter(value => value !== uri) } : item));
  };
  const start = () => void run(async () => {
    const { Audio: AV } = await import('expo-av');
    if (!(await AV.requestPermissionsAsync()).granted) throw new Error(t('Дозвольте доступ до мікрофона в налаштуваннях.', 'Allow microphone access in Settings.'));
    await sound.current?.unloadAsync(); sound.current = null; setPlaying(null);
    await AV.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    try {
      const { recording: rec } = await AV.Recording.createAsync(AV.RecordingOptionsPresets.HIGH_QUALITY);
      if (!mounted.current) { await rec.stopAndUnloadAsync(); await AV.setAudioModeAsync({ allowsRecordingIOS: false }); return; }
      recorder.current = rec; setRecording(true); setAdvertisingRecording(true);
    } catch (err) { await AV.setAudioModeAsync({ allowsRecordingIOS: false }); throw err; }
  });
  const stop = () => void run(async () => {
    const rec = recorder.current; if (!rec) return;
    await rec.stopAndUnloadAsync(); recorder.current = null; setRecording(false); setAdvertisingRecording(false);
    const { Audio: AV } = await import('expo-av'); await AV.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = rec.getURI(); if (!uri) throw new Error(t('Запис не збережено', 'Recording was not saved'));
    const savedUri = await persistRecording(uri);
    await upload(savedUri, `Meeting-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.m4a`, 'audio/mp4', true);
  });
  const button = (label: string, onPress: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={[st.button, { backgroundColor: c.dim, borderColor: c.border, opacity: disabled || busy ? 0.5 : 1 }]}><Text style={{ color: c.text, fontWeight: Atlas.type.headingWeight }}>{label}</Text></TouchableOpacity>;
  return <View style={[st.section, { borderColor: c.border }]}>
    <Text accessibilityRole="header" style={{ color: c.text, fontWeight: Atlas.type.headingWeight, fontSize: 15 }}>{t('Медіа та файли', 'Media and files')}</Text>
    <Text style={{ color: c.sub, fontSize: 12 }}>{t('До 25 МБ на файл. Збережені записи доступні на інших пристроях.', 'Up to 25 MB per file. Saved recordings are available on other devices.')}{meeting.projectId ? t(' Учасники проєкту також мають доступ.', ' Project members also have access.') : ''}</Text>
    {files.map(file => <View key={file.id} style={{ gap: 8 }}><Text style={{ color: c.text }}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</Text><View style={st.actions}>
      {button(playing === file.id ? t('Стоп', 'Stop') : (file.contentType.startsWith('audio/') ? t('Відтворити', 'Play') : t('Відкрити / поділитися', 'Open / share')), () => void run(async () => {
        await sound.current?.unloadAsync(); sound.current = null;
        if (playing === file.id) { setPlaying(null); return; }
        const data = await apiFetch<AudioFile & { content: string }>(path + file.id + '/' + query);
        const FS = await import('expo-file-system/legacy');
        const extension = (/^[a-zA-Z0-9]{1,10}$/.test(file.name.split('.').pop() || '') && file.name.includes('.') ? file.name.split('.').pop() : null) || ({ 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm' } as Record<string, string>)[data.contentType] || 'm4a';
        const uri = `${FS.cacheDirectory}meeting-audio-${file.id}.${extension}`;
        await FS.writeAsStringAsync(uri, data.content, { encoding: FS.EncodingType.Base64 }); cacheFiles.current.push(uri);
        if (!data.contentType.startsWith('audio/')) {
          const Sharing = await import('expo-sharing');
          if (!await Sharing.isAvailableAsync()) throw new Error(t('Відкриття файлів недоступне на цьому пристрої.', 'File sharing is unavailable on this device.'));
          await Sharing.shareAsync(uri, { mimeType: data.contentType, dialogTitle: file.name }); return;
        }
        const { Audio: AV } = await import('expo-av');
        await AV.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const result = await AV.Sound.createAsync({ uri }, { shouldPlay: true }, status => { if (status.isLoaded && status.didJustFinish && mounted.current) setPlaying(null); });
        if (!mounted.current) { await result.sound.unloadAsync(); await FS.deleteAsync(uri, { idempotent: true }); return; }
        sound.current = result.sound; setPlaying(file.id);
      }), recording)}
      {canEdit ? button(t('Видалити', 'Delete'), () => Alert.alert(t('Видалити файл?', 'Delete file?'), file.name, [{ text: t('Скасувати', 'Cancel'), style: 'cancel' }, { text: t('Видалити', 'Delete'), style: 'destructive', onPress: () => void run(async () => {
        await apiFetch(path + file.id + '/' + query, { method: 'DELETE' }); setFiles(current => current.filter(item => item.id !== file.id));
        if (playing === file.id) { await sound.current?.unloadAsync(); sound.current = null; setPlaying(null); }
      }) }]), recording) : null}
    </View></View>)}
    {canEdit ? <>
      <View style={st.actions}>
        {button(t('Прикріпити файл', 'Attach file'), () => void run(async () => {
          const Picker = await import('expo-document-picker');
          const result = await Picker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
          if (result.canceled) return;
          const file = result.assets[0]; await upload(file.uri, file.name, file.mimeType);
        }), recording)}
        {button(t('Фото й відео', 'Photos and videos'), () => void run(async () => {
          const Picker = await import('expo-image-picker');
          const result = await Picker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 });
          if (result.canceled) return;
          const file = result.assets[0]; await upload(file.uri, file.fileName || (file.type === 'video' ? 'Video.mp4' : 'Photo.jpg'), file.mimeType || 'application/octet-stream');
        }), recording)}
        {button(recording ? t('Зупинити й зберегти', 'Stop and save') : t('Записати аудіо', 'Record audio'), recording ? stop : start)}
      </View>
      {recording ? <Text accessibilityRole="alert" style={{ color: c.text }}>{t('● Запис триває', '● Recording')}</Text> : null}
      {(meeting.recordings ?? []).map((uri, index) => <View key={uri}>{button(t(`Завантажити локальний запис ${index + 1}`, `Upload local recording ${index + 1}`), () => void run(() => upload(uri, uri.split('/').pop() || 'Recording.m4a', 'audio/mp4', true)), recording)}</View>)}
    </> : null}
    {error ? <><Text accessibilityRole="alert" style={{ color: '#DE350B' }}>{error}</Text>{button(t('Оновити файли', 'Refresh files'), () => void load())}</> : null}
  </View>;
}
const st = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: Atlas.radius.large, padding: 12, gap: 12, marginVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: Atlas.controlHeight, padding: 12, borderWidth: 1, borderRadius: Atlas.radius.medium, justifyContent: 'center' },
});
