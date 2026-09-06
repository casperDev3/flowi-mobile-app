/**
 * components/tasks/TaskEditForm.tsx
 *
 * Форма редагування завдання: назва, опис, пріоритет, статус, оцінка
 * часу, дедлайн, проєкт і повторення.
 *
 * Весь стан форми належить редакторові (див. use-task-editor): компонент
 * лише малює його й повідомляє про зміни. Тому тут немає жодного
 * useState — форму можна відкрити, закрити й відкрити знову, і вона
 * поводитиметься однаково, бо памʼять у неї одна й зовнішня.
 */
import React from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { PickerField, type PickerCreateOption } from '@/components/shared/PickerField';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { useTaskEditor } from '@/hooks/use-task-editor';
import type { Translations } from '@/store/translations';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import type { Priority } from '@/utils/taskUtils';

export interface EditFormProject {
  id: string;
  name: string;
  color: string;
}

export interface TaskEditFormProps {
  /** Заголовок форми: «Нове завдання» або «Редагувати». */
  title: string;
  /** Підпис кнопки підтвердження. */
  submitLabel: string;
  editor: ReturnType<typeof useTaskEditor>;
  taskStatuses: TaskStatusColumn[];
  /** Лише живі проєкти: в архівний призначати нове немає сенсу. */
  pickableProjects: EditFormProject[];
  /** Повний список — щоб підпис уже призначеного архівного проєкту не зник. */
  projects: EditFormProject[];
  /**
   * Рядок «створити проєкт» у пікері. Готовий приходить згори: рішення, що
   * саме зробити з набраною назвою (створити чи повернути з архіву) і чим це
   * записати, належить екранові — форма стану не має й сховища не знає.
   * Без пропа поле лишається просто вибором зі списку.
   */
  projectCreateOption?: PickerCreateOption;
  /** Сітка місяця для вибору дедлайну. */
  deadlineWeeks: (number | null)[][];
  priorityMeta: Record<Priority, { label: string; color: string }>;
  months: string[];
  weekdays: string[];
  /** Пресети дедлайну: «сьогодні», «завтра», «+3», «+7». */
  deadlinePresets: { label: string; days: number }[];
  today: Date;
  onSave: () => void;
  onCancel: () => void;
  colors: any;
  isDark: boolean;
  tr: Translations;
  locale: string;
}

export function TaskEditForm({
  title, submitLabel, editor, taskStatuses, pickableProjects, projects, projectCreateOption, deadlineWeeks,
  priorityMeta: PRIORITY, months: MONTHS_UA, weekdays: WEEKDAYS_SHORT,
  deadlinePresets: DEADLINE_PRESETS,
  today, onSave, onCancel, colors: c, isDark, tr, locale,
}: TaskEditFormProps) {
  return (
    <>
        <Text style={[st.sheetTitle, { color: c.text }]}>{title}</Text>

        <TextInput
          placeholder={tr.taskNamePlaceholder}
          placeholderTextColor={c.sub}
          value={editor.draft.title}
          onChangeText={v => editor.patch({ title: v })}
          style={[st.input, { backgroundColor: c.dim, color: c.text }]}
        />
        <TextInput
          placeholder={tr.taskDescPlaceholder}
          placeholderTextColor={c.sub}
          value={editor.draft.desc}
          onChangeText={v => editor.patch({ desc: v })}
          style={[st.input, { backgroundColor: c.dim, color: c.text, marginTop: 8 }]}
        />

        <Text style={[st.label, { color: c.sub }]}>{tr.priority}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['high', 'medium', 'low'] as Priority[]).map(p => (
            <TouchableOpacity key={p} onPress={() => editor.patch({ priority: p })} style={[st.priorityBtn, { borderColor: PRIORITY[p].color, backgroundColor: editor.draft.priority === p ? PRIORITY[p].color : 'transparent' }]}>
              <Text style={{ color: editor.draft.priority === p ? '#fff' : PRIORITY[p].color, fontSize: 12, fontWeight: '600' }}>{PRIORITY[p].label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[st.label, { color: c.sub }]}>{tr.statusLabel}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {taskStatuses.map(column => (
              <TouchableOpacity key={column.id} onPress={() => editor.patch({ statusId: column.id })} style={[st.sortChip, { backgroundColor: editor.draft.statusId === column.id ? column.color : c.dim, borderColor: editor.draft.statusId === column.id ? column.color : c.border }]}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: editor.draft.statusId === column.id ? '#fff' : column.color, marginRight: 5 }} />
                <Text style={{ color: editor.draft.statusId === column.id ? '#fff' : c.text, fontSize: 12, fontWeight: '600' }}>{column.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Через PickerField, а не власний випадний список: він дає пошук і
            один вигляд на всі пікери застосунку. Поле показується ЗАВЖДИ, навіть
            коли живих проєктів немає: інакше задача, чий проєкт заархівували,
            втрачала б і підпис, і спосіб від нього відчепитись. */}
        <PickerField
          label={tr.project}
          icon="folder"
          options={pickableProjects.map(p => ({ id: p.id, label: p.name, color: p.color }))}
          value={editor.draft.projectId ?? null}
          onSelect={id => editor.patch({ projectId: id })}
          emptyOption={{ label: tr.noProject }}
          selectedLabel={projects.find(p => p.id === editor.draft.projectId)?.name ?? null}
          alwaysSearch
          createOption={projectCreateOption}
          colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.sheet }}
          isDark={isDark}
          tr={tr}
        />

        <Text style={[st.label, { color: c.sub }]}>{tr.timeEstimate}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            placeholder={tr.hoursPlaceholder}
            placeholderTextColor={c.sub}
            value={editor.draft.estHours}
            onChangeText={v => editor.patch({ estHours: v })}
            keyboardType="number-pad"
            style={[st.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
          />
          <TextInput
            placeholder={tr.minutesPlaceholder}
            placeholderTextColor={c.sub}
            value={editor.draft.estMins}
            onChangeText={v => editor.patch({ estMins: v })}
            keyboardType="number-pad"
            style={[st.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
          />
        </View>

        <Text style={[st.label, { color: c.sub }]}>{tr.deadline}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {DEADLINE_PRESETS.map(preset => {
              const d = new Date(); d.setDate(d.getDate() + preset.days);
              const iso = d.toISOString();
              const isSelected = editor.draft.deadline && new Date(editor.draft.deadline).toDateString() === d.toDateString();
              return (
                <TouchableOpacity
                  key={preset.label}
                  onPress={() => editor.patch({ deadline: isSelected ? null : iso })}
                  style={[st.sortChip, { backgroundColor: isSelected ? c.accent : c.dim, borderColor: isSelected ? c.accent : c.border }]}>
                  <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>{preset.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => { Keyboard.dismiss(); editor.setShowDeadlineCal(v => !v); }}
              style={[st.sortChip, { backgroundColor: editor.showDeadlineCal ? c.accent + '20' : c.dim, borderColor: editor.showDeadlineCal ? c.accent : c.border }]}>
              <IconSymbol name="calendar" size={13} color={editor.showDeadlineCal ? c.accent : c.sub} />
              <Text style={{ color: editor.showDeadlineCal ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{tr.select}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {editor.draft.deadline && (
          <View style={[st.badge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50', alignSelf: 'flex-start', marginBottom: 8 }]}>
            <IconSymbol name="calendar" size={11} color={c.accent} />
            <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
              {new Date(editor.draft.deadline).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}
            </Text>
            <TouchableOpacity onPress={() => editor.patch({ deadline: null })} style={{ marginLeft: 6 }}>
              <IconSymbol name="xmark" size={11} color={c.accent} />
            </TouchableOpacity>
          </View>
        )}

        {editor.showDeadlineCal && (
          <View style={[st.inlineCalendar, { borderColor: c.border, backgroundColor: c.dim }]}>
            <CalendarGrid
              year={editor.calYear} month={editor.calMonth}
              markedDays={new Set()}
              selectedDate={editor.draft.deadline ? new Date(editor.draft.deadline).toDateString() : null}
              todayDate={today}
              weeks={deadlineWeeks}
              months={MONTHS_UA}
              weekdays={WEEKDAYS_SHORT}
              onPrevMonth={() => { if (editor.calMonth === 0) { editor.setCalMonth(11); editor.setCalYear(y => y - 1); } else editor.setCalMonth(m => m - 1); }}
              onNextMonth={() => { if (editor.calMonth === 11) { editor.setCalMonth(0); editor.setCalYear(y => y + 1); } else editor.setCalMonth(m => m + 1); }}
              onSelectDay={(d) => { editor.patch({ deadline: d.toISOString() }); editor.setShowDeadlineCal(false); }}
              c={c}
            />
          </View>
        )}

        {/* Recurrence (edit) */}
        <TouchableOpacity
          onPress={() => editor.patch({ repeat: !editor.draft.repeat })}
          style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1,
            paddingHorizontal: 11, paddingVertical: 9, marginTop: 8,
            borderColor: editor.draft.repeat ? c.accent + '55' : c.border,
            backgroundColor: editor.draft.repeat ? c.accent + '10' : c.dim }}>
          <IconSymbol name="repeat" size={13} color={editor.draft.repeat ? c.accent : c.sub} />
          <Text style={{ color: editor.draft.repeat ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 6, flex: 1 }}>
            {tr.repeat ?? 'Повторювати'}
          </Text>
          <View style={{ width: 36, height: 22, borderRadius: 11, backgroundColor: editor.draft.repeat ? c.accent : c.border, justifyContent: 'center', paddingHorizontal: 2 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: editor.draft.repeat ? 'flex-end' : 'flex-start' }} />
          </View>
        </TouchableOpacity>

        {editor.draft.repeat && (
          <View style={{ borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 7,
            borderColor: c.accent + '40', backgroundColor: c.accent + '08' }}>
            <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10 }}>
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(f => {
                const labels = { daily: 'Щодня', weekly: 'Щотижня', monthly: 'Щомісяця', yearly: 'Щороку' };
                const on = editor.draft.repeatFreq === f;
                return (
                  <TouchableOpacity key={f} onPress={() => { editor.patch({ repeatFreq: f }); if (f !== 'weekly') editor.patch({ repeatDays: [] }); }}
                    style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                      backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                    <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{labels[f]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>Кожні</Text>
              <TouchableOpacity onPress={() => editor.patch({ repeatInterval: Math.max(1, editor.draft.repeatInterval - 1) })}
                style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>−</Text>
              </TouchableOpacity>
              <Text style={{ color: c.accent, fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'center' }}>{editor.draft.repeatInterval}</Text>
              <TouchableOpacity onPress={() => editor.patch({ repeatInterval: Math.min(99, editor.draft.repeatInterval + 1) })}
                style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>+</Text>
              </TouchableOpacity>
              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>
                {editor.draft.repeatFreq === 'daily' ? (editor.draft.repeatInterval === 1 ? 'день' : 'дн.') :
                 editor.draft.repeatFreq === 'weekly' ? (editor.draft.repeatInterval === 1 ? 'тиждень' : 'тиж.') :
                 editor.draft.repeatFreq === 'monthly' ? (editor.draft.repeatInterval === 1 ? 'місяць' : 'міс.') : 'рік'}
              </Text>
            </View>
            {editor.draft.repeatFreq === 'weekly' && (
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map((d, i) => {
                  const on = editor.draft.repeatDays.includes(i);
                  return (
                    <TouchableOpacity key={i} onPress={() => editor.patch({ repeatDays: on ? editor.draft.repeatDays.filter(x => x !== i) : [...editor.draft.repeatDays, i] })}
                      style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8,
                        backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                      <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {(['never', 'until'] as const).map(type => {
                const labels = { never: 'Ніколи', until: 'До дати' };
                const on = editor.draft.repeatEndType === type;
                return (
                  <TouchableOpacity key={type} onPress={() => editor.patch({ repeatEndType: type })}
                    style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                      backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                    <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{labels[type]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {editor.draft.repeatEndType === 'until' && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1,
                  paddingHorizontal: 11, paddingVertical: 9,
                  borderColor: editor.draft.repeatUntil ? c.accent + '55' : c.border,
                  backgroundColor: editor.draft.repeatUntil ? c.accent + '10' : c.dim }}>
                  <IconSymbol name="calendar" size={13} color={editor.draft.repeatUntil ? c.accent : c.sub} />
                  <TextInput
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={c.sub}
                    value={editor.draft.repeatUntil}
                    onChangeText={v => editor.patch({ repeatUntil: v })}
                    style={{ color: editor.draft.repeatUntil ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5, flex: 1, padding: 0 }}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 8 }}>
          <TouchableOpacity onPress={onCancel} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
            <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onSave} style={[st.btn, { flex: 2, backgroundColor: c.accent }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
    </>
  );
}

const st = StyleSheet.create({
  sheetTitle:     { fontSize: 20, fontWeight: '800', marginBottom: 18 },
  label:          { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:          { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  priorityBtn:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  badge:          { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  btn:            { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  sortChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  inlineCalendar: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  dropdownBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11 },
  dropdownList:   { borderRadius: 12, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  dropdownItem:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11 },
});
