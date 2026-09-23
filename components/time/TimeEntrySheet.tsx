/**
 * components/time/TimeEntrySheet.tsx — ручний запис часу: створення І правка.
 *
 * Одна форма на обидва випадки навмисно: поля однакові (задача, дата,
 * тривалість, нотатка), а дві копії розмітки розійшлися б на першій же правці —
 * саме так у вебі колись зʼявилася форма з полем, якого не було на телефоні.
 *
 * Поля «зміна» тут немає і не буде: поділ на ранок/день/вечір/ніч прибрано з
 * продукту. Старим записам `shift` не чіпаємо — просто не показуємо й не
 * пишемо.
 */

import { BlurView } from 'expo-blur';
import React, { useEffect, useMemo, useState } from 'react';
import {
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

import type { TimeColors } from '@/components/time/TimePalette';
import type { Translations } from '@/store/translations';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import type { TimeRecord } from '@/utils/timeEntries';

export interface TimeEntrySheetProps {
  visible: boolean;
  /** Є → правка наявного запису; немає → новий. */
  entry: TimeRecord | null;
  c: TimeColors;
  isDark: boolean;
  height: number;
  isWide: boolean;
  tr: Translations;
  onClose: () => void;
  onSubmit: (entry: TimeRecord) => void;
}

/** yyyy-mm-dd за ЛОКАЛЬНИМ часом — саме його набирає людина. */
function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Дата з поля + година доби.
 *
 * Час бере з наявного запису, а нового ставить на полудень: опівніч зробила б
 * кожен ручний запис прикордонним — будь-яка тривалість «перетинала» б північ
 * і запис одразу летів би в чергу на перевірку.
 */
function isoFromInput(dateText: string, previous: string | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const base = previous ? new Date(previous) : null;
  const hours = base && !Number.isNaN(base.getTime()) ? base.getHours() : 12;
  const minutes = base && !Number.isNaN(base.getTime()) ? base.getMinutes() : 0;
  const date = new Date(Number(y), Number(m) - 1, Number(d), hours, minutes, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function TimeEntrySheet({
  visible,
  entry,
  c,
  isDark,
  height,
  isWide,
  tr,
  onClose,
  onSubmit,
}: TimeEntrySheetProps) {
  const [task, setTask] = useState('');
  const [dateText, setDateText] = useState(() => toInputDate(new Date()));
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Форма наповнюється на КОЖНЕ відкриття, а не один раз при монтуванні:
  // модалка лишається в дереві між викликами, тож без цього друга правка
  // показувала б поля першої.
  useEffect(() => {
    if (!visible) return;
    const seconds = Math.max(0, Math.floor(Number(entry?.duration) || 0));
    setTask(entry?.task ?? '');
    setDateText(toInputDate(entry?.date ? new Date(entry.date) : new Date()));
    setHours(seconds >= 3600 ? String(Math.floor(seconds / 3600)) : '');
    setMinutes(seconds ? String(Math.floor((seconds % 3600) / 60)) : '');
    setNote(entry?.note ?? '');
    setError(null);
  }, [visible, entry]);

  const duration = useMemo(() => {
    const h = parseInt(hours || '0', 10);
    const m = parseInt(minutes || '0', 10);
    return (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
  }, [hours, minutes]);

  const submit = () => {
    const title = task.trim();
    if (!title) { setError(tr.timeEntryErrorTask); return; }
    if (duration <= 0) { setError(tr.timeEntryErrorDuration); return; }
    const iso = isoFromInput(dateText, entry?.date);
    if (!iso) { setError(tr.timeEntryErrorDate); return; }

    if (entry) {
      // Дата у формі — це КІНЕЦЬ сесії (так її пише і дзеркало таймера), тож
      // початок перераховуємо від нього на нову тривалість. Інакше в
      // перенесених записів лишився б старий `startedAt`, і «перетинає північ»
      // рахувалося б по проміжку, якого вже немає.
      const startIso = new Date(Date.parse(iso) - duration * 1000).toISOString();
      onSubmit({
        ...entry,
        task: title,
        duration,
        date: iso,
        ...(entry.startedAt ? { startedAt: startIso } : {}),
        ...(entry.endedAt ? { endedAt: iso } : {}),
        note: note.trim() || undefined,
      });
    } else {
      onSubmit({
        id: `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        task: title,
        duration,
        date: iso,
        note: note.trim() || undefined,
      });
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable accessible={false} style={s.overlay} onPress={onClose}>
          <Pressable accessible={false} onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
            <BlurView
              intensity={isDark ? 50 : 70}
              tint={isDark ? 'dark' : 'light'}
              style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[s.sheetTitle, { color: c.text }]}>
                  {entry ? tr.timeEditEntry : tr.timeNewEntry}
                </Text>

                <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryTaskLabel}</Text>
                <TextInput
                  placeholder={tr.timeEntryTaskPlaceholder}
                  placeholderTextColor={c.sub}
                  value={task}
                  onChangeText={setTask}
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                />

                <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryDateLabel}</Text>
                <TextInput
                  placeholder={tr.timeEntryDatePlaceholder}
                  placeholderTextColor={c.sub}
                  value={dateText}
                  onChangeText={setDateText}
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                />

                <Text style={[s.label, { color: c.sub }]}>{tr.duration}</Text>
                <View style={[s.durBlock, { backgroundColor: c.indigo + '12', borderColor: c.indigo + '30' }]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor={c.sub}
                      value={hours}
                      onChangeText={setHours}
                      keyboardType="number-pad"
                      accessibilityLabel={tr.hrs}
                      style={s.durInput}
                    />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.hrs}</Text>
                  </View>
                  <Text style={{ color: c.sub, fontSize: 28, fontWeight: '200', alignSelf: 'center', marginBottom: 16 }}>:</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor={c.sub}
                      value={minutes}
                      onChangeText={setMinutes}
                      keyboardType="number-pad"
                      accessibilityLabel={tr.mins}
                      style={s.durInput}
                    />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.mins}</Text>
                  </View>
                </View>

                <Text style={[s.label, { color: c.sub }]}>{tr.note}</Text>
                <TextInput
                  placeholder={tr.timeEntryNotePlaceholder}
                  placeholderTextColor={c.sub}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  style={[s.input, { backgroundColor: c.dim, color: c.text, minHeight: 64, textAlignVertical: 'top' }]}
                />

                {error && (
                  <Text style={{ color: c.danger, fontSize: 12, fontWeight: '600', marginTop: 10 }}>{error}</Text>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
                  <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={submit}
                    disabled={!task.trim() || duration <= 0}
                    style={[s.btn, { flex: 2, backgroundColor: task.trim() && duration > 0 ? c.indigo : c.dim }]}>
                    <IconSymbol name="checkmark" size={15} color={task.trim() && duration > 0 ? '#fff' : c.sub} />
                    <Text style={{ color: task.trim() && duration > 0 ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>
                      {tr.save}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input: { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  durBlock: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start' },
  durInput: { color: '#6366F1', fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1, alignSelf: 'stretch' },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
