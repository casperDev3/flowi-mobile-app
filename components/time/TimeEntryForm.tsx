/**
 * components/time/TimeEntryForm.tsx — поля ручного запису часу без обгортки.
 *
 * Винесено з TimeEntrySheet, бо та сама форма тепер живе у двох місцях:
 *  • аркуш поверх екрана (телефон, портрет планшета, «Час» проєкту);
 *  • права панель широкого екрана «Час» — правка запису НЕ перекриває
 *    список, з якого її відкрили.
 * Логіку й поля див. у шапці TimeEntrySheet.tsx — вони не змінились.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { TimeColors } from '@/components/time/TimePalette';
import type { Translations } from '@/store/translations';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, space, touchTarget, type as dsType } from '@/constants/theme';
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

export interface TimeEntryFormProject {
  id: string;
  name: string;
  color?: string;
}

export interface TimeEntryFormProps {
  /**
   * Коли форма «відкрита». Поля наповнюються заново на кожен перехід у true
   * і на кожну зміну `entry`: аркуш лишається в дереві між відкриттями.
   */
  active: boolean;
  /** Є → правка наявного запису; немає → новий. */
  entry: TimeRecord | null;
  c: TimeColors;
  tr: Translations;
  tasks: readonly EditableTask[];
  projects: readonly TimeEntryFormProject[];
  taskProjects?: TaskProjects;
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

export function TimeEntryForm({
  active,
  entry,
  c,
  tr,
  tasks,
  projects,
  taskProjects,
  defaultProjectId,
  onClose,
  onSubmit,
}: TimeEntryFormProps) {
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
    if (!active) return;
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
  }, [active, entry]);

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
    <View>
      <View style={s.titleRow}>
        <Text style={[s.sheetTitle, { color: c.text, flex: 1 }]} accessibilityRole="header">
          {entry ? tr.timeEditEntry : tr.timeNewEntry}
        </Text>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={tr.cancel}
          style={s.closeBtn}>
          <IconSymbol name="xmark" size={17} color={c.sub} />
        </TouchableOpacity>
      </View>

      {/* ─── Задача ─── */}
      <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryTaskLabel}</Text>
      <TextInput
        placeholder={tr.timeEntrySearchTask}
        placeholderTextColor={c.muted}
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
        <View style={[s.suggestBox, { backgroundColor: c.dim }]}>
          {suggestions.map(task => (
            <TouchableOpacity
              key={task.id}
              onPress={() => pickTask(task)}
              accessibilityRole="button"
              accessibilityLabel={`${tr.timeEntryPickTask}: ${task.title}`}
              style={s.suggestRow}>
              <IconSymbol name="checklist" size={13} color={c.sub} />
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.medium, marginLeft: 8, flex: 1 }}>
                {task.title}
              </Text>
              {task.projectId && projectById.get(task.projectId) ? (
                <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, marginLeft: 8, maxWidth: '40%' }}>
                  {projectById.get(task.projectId)?.name}
                </Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
      {taskId ? (
        <View style={s.linkedRow}>
          <IconSymbol name="link" size={12} color={c.sub} />
          <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, marginLeft: 6, flex: 1 }}>
            {tr.timeEntryPickTask}
          </Text>
          <TouchableOpacity
            onPress={() => pickTask(null)}
            accessibilityRole="button"
            style={[s.chip, { backgroundColor: c.dim }]}>
            <IconSymbol name="xmark" size={10} color={c.text} />
            <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{tr.timeEntryNoTask}</Text>
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
                      backgroundColor: active ? c.t.action.primary : c.dim,
                      opacity: disabled ? 0.4 : 1,
                    },
                  ]}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: option.color }} />
                  <Text numberOfLines={1} style={{ color: active ? c.t.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 6, maxWidth: 160 }}>
                    {option.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
        </View>
      </ScrollView>
      {locked ? (
        <Text style={{ ...dsType.caption, color: c.sub, marginTop: 6 }}>{tr.timeEntryProjectLocked}</Text>
      ) : null}

      {/* ─── Коли ─── */}
      <Text style={[s.label, { color: c.sub }]}>{tr.timeEntryDateLabel}</Text>
      <TextInput
        placeholder={tr.timeEntryDatePlaceholder}
        placeholderTextColor={c.muted}
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
            placeholderTextColor={c.muted}
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
            placeholderTextColor={c.muted}
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
      <View style={[s.durBlock, { backgroundColor: c.dim }]}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <TextInput
            placeholder="0"
            placeholderTextColor={c.muted}
            value={hours}
            onChangeText={value => onDuration(value, minutes)}
            keyboardType="number-pad"
            accessibilityLabel={tr.hrs}
            style={[s.durInput, { color: c.text }]}
          />
          <Text style={{ ...dsType.caption, color: c.sub }}>{tr.hrs}</Text>
        </View>
        <Text style={{ color: c.sub, fontSize: 28, fontFamily: fontFamily.light, alignSelf: 'center', marginBottom: 16 }}>:</Text>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <TextInput
            placeholder="0"
            placeholderTextColor={c.muted}
            value={minutes}
            onChangeText={value => onDuration(hours, value)}
            keyboardType="number-pad"
            accessibilityLabel={tr.mins}
            style={[s.durInput, { color: c.text }]}
          />
          <Text style={{ ...dsType.caption, color: c.sub }}>{tr.mins}</Text>
        </View>
      </View>

      <Text style={[s.label, { color: c.sub }]}>{tr.note}</Text>
      <TextInput
        placeholder={tr.timeEntryNotePlaceholder}
        placeholderTextColor={c.muted}
        value={note}
        onChangeText={setNote}
        multiline
        accessibilityLabel={tr.note}
        style={[s.input, { backgroundColor: c.dim, color: c.text, minHeight: 64, textAlignVertical: 'top' }]}
      />

      {error && (
        <Text style={{ color: c.danger, fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 10 }}>{error}</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
        <TouchableOpacity onPress={onClose} style={[s.btn, { ...c.gl.subtle, flex: 1 }]}>
          <Text style={{ ...dsType.label, color: c.t.action.secondaryText }}>{tr.cancel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          style={[s.btn, { flex: 2, backgroundColor: canSave ? c.t.action.primary : c.t.state.disabledBg }]}>
          <IconSymbol name="checkmark" size={15} color={canSave ? c.t.text.onAction : c.t.state.disabledText} />
          <Text style={{ ...dsType.label, color: canSave ? c.t.text.onAction : c.t.state.disabledText, marginLeft: 6 }}>
            {tr.save}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  sheetTitle: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold, marginBottom: 4 },
  label: { fontSize: 11, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  input: { borderRadius: radius.control, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 12, fontSize: 15, fontFamily: fontFamily.regular, ...dsType.numeric },
  suggestBox: { borderRadius: radius.nestedCompact, marginTop: 6, overflow: 'hidden' },
  suggestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 44 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 36 },
  durBlock: { flexDirection: 'row', borderRadius: radius.nested, padding: 16, alignItems: 'flex-start' },
  // Тривалість — display-цифри: тонкі, великі, табличні.
  durInput: { ...dsType.display, fontSize: 44, lineHeight: 50, textAlign: 'center', alignSelf: 'stretch' },
  btn: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
