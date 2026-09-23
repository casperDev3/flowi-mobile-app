/**
 * components/time/TimeEntrySheet.tsx — ручний запис часу: створення І правка.
 *
 * Одна форма на всі випадки навмисно: екран «Час», «Час» проєкту і правка з
 * блоку аномалій відкривають саме її — дві копії розмітки розійшлися б на
 * першій же правці (так у вебі колись зʼявилася форма з полем, якого не було
 * на телефоні).
 *
 * Поля — дзеркало вебової `components/time/entry-form.tsx`: задача (зі списку,
 * пошуком, або вільним текстом), проєкт, дата, «Початок»/«Кінець» із
 * синхронізованою тривалістю, нотатка. Перетворення полів на запис — у чистому
 * `utils/timeEntryEdit.ts` (та сама назва `applyEntryEdit`, що у вебі):
 *  • вільний текст знімає `taskId` — раніше зміна назви лишала старий зв'язок,
 *    і запис рахувався під чужою задачею;
 *  • кінець раніше за початок — наступна доба;
 *  • проєкт задає задача: для проєктної задачі вибір проєкту заблоковано.
 * Зміну `projectId` у потоки синку розводить `saveSynced` (store/synced-storage.ts).
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
import type { TaskProjects, TimeRecord } from '@/utils/timeEntries';
import {
  applyEntryEdit,
  durationFromClock,
  endFromDuration,
  entryEditDraft,
  lockedProjectId,
  parseClock,
  searchTasks,
  type EditableTask,
  type EntryEditError,
} from '@/utils/timeEntryEdit';

export interface TimeEntrySheetProject {
  id: string;
  name: string;
  color?: string;
}

export interface TimeEntrySheetProps {
  visible: boolean;
  /** Є → правка наявного запису; немає → новий. */
  entry: TimeRecord | null;
  c: TimeColors;
  isDark: boolean;
  height: number;
  isWide: boolean;
  tr: Translations;
  /** Задачі для вибору (id, назва, проєкт). */
  tasks: readonly EditableTask[];
  /** Проєкти для вибору; «Особисте» додається само. */
  projects: readonly TimeEntrySheetProject[];
  /** Проєкти задач — щоб запис без `projectId` показати в проєкті його задачі. */
  taskProjects?: TaskProjects;
  /** Проєкт НОВОГО запису (простір проєкту). */
  defaultProjectId?: string | null;
  onClose: () => void;
  onSubmit: (entry: TimeRecord) => void;
}

/** Скільки задач показуємо в підказці одразу. */
const SUGGESTIONS = 6;

function errorText(error: EntryEditError, tr: Translations): string {
  if (error === 'task') return tr.timeEntryErrorTask;
  if (error === 'date') return tr.timeEntryErrorDate;
  if (error === 'start') return tr.timeEntryErrorStart;
  if (error === 'end') return tr.timeEntryErrorEnd;
  return tr.timeEntryErrorDuration;
}

function splitSeconds(seconds: number): { hours: string; minutes: string } {
  return {
    hours: seconds >= 3600 ? String(Math.floor(seconds / 3600)) : '',
    minutes: seconds ? String(Math.floor((seconds % 3600) / 60)) : '',
  };
}

export function TimeEntrySheet({
  visible,
  entry,
  c,
  isDark,
  height,
  isWide,
  tr,
  tasks,
  projects,
  taskProjects,
  defaultProjectId,
  onClose,
  onSubmit,
}: TimeEntrySheetProps) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dateText, setDateText] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [taskFocused, setTaskFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Форма наповнюється на КОЖНЕ відкриття, а не один раз при монтуванні:
  // модалка лишається в дереві між викликами, тож без цього друга правка
  // показувала б поля першої.
  useEffect(() => {
    if (!visible) return;
    const draft = entryEditDraft(entry, new Date(), { taskProjects, projectId: defaultProjectId ?? null });
    const split = splitSeconds(draft.durationSeconds);
    setTaskId(draft.taskId);
    setTaskTitle(draft.taskTitle);
    setProjectId(draft.projectId);
    setDateText(draft.date);
    setStart(draft.start);
    setEnd(draft.end);
    setSeconds(draft.durationSeconds);
    setHours(split.hours);
    setMinutes(split.minutes);
    setNote(draft.note);
    setTaskFocused(false);
    setError(null);
    // taskProjects навмисно поза залежностями: перечитування задач у фоні не
    // повинно скидати те, що людина вже набрала.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entry]);

  const locked = lockedProjectId(taskId, tasks);
  const suggestions = useMemo(
    () => (taskId ? [] : searchTasks(tasks, taskTitle, SUGGESTIONS)),
    [tasks, taskTitle, taskId],
  );
  const showSuggestions = taskFocused && suggestions.length > 0;
  const startMin = parseClock(start);
  const endMin = parseClock(end);
  const nextDay = startMin !== null && endMin !== null && endMin < startMin;
  const shownProject = locked ?? projectId;
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const onStart = (value: string) => {
    setStart(value);
    // Початок рухає кінець, тривалість лишається — як і «обрізати»
    // (utils/timeAnomalies.applyDuration тримає початок).
    const nextEnd = endFromDuration(value, seconds);
    if (nextEnd && parseClock(value) !== null) setEnd(nextEnd);
  };

  const onEnd = (value: string) => {
    setEnd(value);
    const fromClock = durationFromClock(start, value);
    if (fromClock !== null) {
      const split = splitSeconds(fromClock);
      setSeconds(fromClock);
      setHours(split.hours);
      setMinutes(split.minutes);
    }
  };

  const onDuration = (nextHours: string, nextMinutes: string) => {
    setHours(nextHours);
    setMinutes(nextMinutes);
    const h = parseInt(nextHours || '0', 10);
    const m = parseInt(nextMinutes || '0', 10);
    const value = (Number.isFinite(h) ? h : 0) * 3600 + (Number.isFinite(m) ? m : 0) * 60;
    setSeconds(value);
    const nextEnd = endFromDuration(start, value);
    if (nextEnd) setEnd(nextEnd);
  };

  const pickTask = (task: EditableTask | null) => {
    setTaskFocused(false);
    if (!task) {
      // «Без задачі»: назва лишається, зв'язок знімається.
      setTaskId(null);
      return;
    }
    setTaskId(task.id);
    setTaskTitle(task.title);
    if (task.projectId) setProjectId(task.projectId);
  };

  const canSave = !!taskTitle.trim() && seconds > 0;

  const submit = () => {
    const result = applyEntryEdit(
      entry,
      { date: dateText, start, durationSeconds: seconds, taskId, taskTitle, projectId, note },
      { tasks, id: entry?.id ?? `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` },
    );
    if (!result.ok) {
      setError(errorText(result.error, tr));
      return;
    }
    onSubmit(result.entry as TimeRecord);
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
                    <TouchableOpacity
                      onPress={onClose}
                      accessibilityRole="button"
                      accessibilityLabel={tr.cancel}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[s.sheetTitle, { color: c.text }]}>
                  {entry ? tr.timeEditEntry : tr.timeNewEntry}
                </Text>

                {/* ─── Задача ─── */}
                <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryTaskLabel}</Text>
                <TextInput
                  placeholder={tr.timeEntrySearchTask}
                  placeholderTextColor={c.sub}
                  value={taskTitle}
                  onChangeText={value => {
                    setTaskTitle(value);
                    // Вільний текст — це вже інша задача: старий зв'язок не лишаємо.
                    setTaskId(null);
                    setTaskFocused(true);
                  }}
                  onFocus={() => setTaskFocused(true)}
                  accessibilityLabel={tr.timeEntryTaskLabel}
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                />
                {showSuggestions && (
                  <View style={[s.suggestBox, { borderColor: c.border }]}>
                    {suggestions.map(task => (
                      <TouchableOpacity
                        key={task.id}
                        onPress={() => pickTask(task)}
                        accessibilityRole="button"
                        accessibilityLabel={`${tr.timeEntryPickTask}: ${task.title}`}
                        style={s.suggestRow}>
                        <IconSymbol name="checklist" size={13} color={c.indigo} />
                        <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '600', marginLeft: 8, flex: 1 }}>
                          {task.title}
                        </Text>
                        {task.projectId && projectById.get(task.projectId) ? (
                          <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, marginLeft: 8, maxWidth: '40%' }}>
                            {projectById.get(task.projectId)?.name}
                          </Text>
                        ) : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {taskId ? (
                  <View style={s.linkedRow}>
                    <IconSymbol name="link" size={12} color={c.indigo} />
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, marginLeft: 6, flex: 1 }}>
                      {tr.timeEntryPickTask}
                    </Text>
                    <TouchableOpacity
                      onPress={() => pickTask(null)}
                      accessibilityRole="button"
                      style={[s.chip, { borderColor: c.border }]}>
                      <IconSymbol name="xmark" size={10} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{tr.timeEntryNoTask}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* ─── Проєкт ─── */}
                <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryProjectLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {[{ id: null as string | null, name: tr.timeEntryPersonal, color: c.sub }, ...projects.map(p => ({ id: p.id as string | null, name: p.name, color: p.color ?? c.indigo }))]
                      .map(option => {
                        const active = (shownProject ?? null) === option.id;
                        const disabled = !!locked && !active;
                        return (
                          <TouchableOpacity
                            key={option.id ?? 'personal'}
                            disabled={!!locked}
                            onPress={() => setProjectId(option.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active, disabled: !!locked }}
                            style={[
                              s.chip,
                              {
                                borderColor: active ? option.color : c.border,
                                backgroundColor: active ? option.color + '22' : 'transparent',
                                opacity: disabled ? 0.4 : 1,
                              },
                            ]}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: option.color }} />
                            <Text numberOfLines={1} style={{ color: c.text, fontSize: 12, fontWeight: active ? '700' : '500', marginLeft: 6, maxWidth: 160 }}>
                              {option.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                </ScrollView>
                {locked ? (
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{tr.timeEntryProjectLocked}</Text>
                ) : null}

                {/* ─── Коли ─── */}
                <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryDateLabel}</Text>
                <TextInput
                  placeholder={tr.timeEntryDatePlaceholder}
                  placeholderTextColor={c.sub}
                  value={dateText}
                  onChangeText={setDateText}
                  autoCorrect={false}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={tr.timeEntryDateLabel}
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryStartLabel}</Text>
                    <TextInput
                      placeholder={tr.timeEntryClockPlaceholder}
                      placeholderTextColor={c.sub}
                      value={start}
                      onChangeText={onStart}
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      accessibilityLabel={tr.timeEntryStartLabel}
                      style={[s.input, { backgroundColor: c.dim, color: c.text, textAlign: 'center' }]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: c.sub }]}>
                      {tr.timeEntryEndLabel}{nextDay ? ` · ${tr.timeEntryNextDay}` : ''}
                    </Text>
                    <TextInput
                      placeholder={tr.timeEntryClockPlaceholder}
                      placeholderTextColor={c.sub}
                      value={end}
                      onChangeText={onEnd}
                      autoCorrect={false}
                      keyboardType="numbers-and-punctuation"
                      accessibilityLabel={nextDay ? `${tr.timeEntryEndLabel}, ${tr.timeEntryNextDay}` : tr.timeEntryEndLabel}
                      style={[s.input, { backgroundColor: c.dim, color: c.text, textAlign: 'center' }]}
                    />
                  </View>
                </View>

                <Text style={[s.label, { color: c.sub }]}>{tr.duration}</Text>
                <View style={[s.durBlock, { backgroundColor: c.indigo + '12', borderColor: c.indigo + '30' }]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      placeholder="0"
                      placeholderTextColor={c.sub}
                      value={hours}
                      onChangeText={value => onDuration(value, minutes)}
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
                      onChangeText={value => onDuration(hours, value)}
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
                  accessibilityLabel={tr.note}
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
                    disabled={!canSave}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canSave }}
                    style={[s.btn, { flex: 2, backgroundColor: canSave ? c.indigo : c.dim }]}>
                    <IconSymbol name="checkmark" size={15} color={canSave ? '#fff' : c.sub} />
                    <Text style={{ color: canSave ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>
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
  suggestBox: { borderRadius: 12, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 44 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, minHeight: 36 },
  durBlock: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start' },
  durInput: { color: '#6366F1', fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1, alignSelf: 'stretch' },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
