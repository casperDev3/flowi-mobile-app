import { Atlas } from '@/constants/atlas';
/**
 * components/tasks/card/TaskQuickCreate.tsx — коротка форма створення завдання.
 *
 * Назва + ряд чипів (дедлайн, пріоритет, проєкт; спринт — лише коли в проєкту
 * є з чого вибирати). Кожен чип відкриває той самий аркуш, що й рядок у
 * картці. Решта полів (оцінка, повторення, нагадування, командні) — у повній
 * картці: «Детальніше» створює завдання і відразу відкриває його картку.
 *
 * Стан — чернетка редактора (hooks/use-task-editor.ts): той самий набір полів,
 * той самий шлях запису `addTask` на екрані, що й раніше.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { PickerCreateOption } from '@/components/shared/PickerField';
import { draftCurrentSprintId, type useTaskEditor } from '@/hooks/use-task-editor';
import { useI18n } from '@/store/i18n';
import {
  sprintFieldVisible,
  sprintOptionLabel,
  sprintOptionsForTask,
  type Sprint,
} from '@/utils/sprintUtils';

import { DateField, OptionField, PriorityField } from './fields';
import { cardStyles, type CardColors } from './primitives';

export interface QuickCreateProject {
  id: string;
  name: string;
  color: string;
}

export interface TaskQuickCreateProps {
  editor: ReturnType<typeof useTaskEditor>;
  pickableProjects: QuickCreateProject[];
  projects: QuickCreateProject[];
  projectCreateOption?: PickerCreateOption;
  sprints?: readonly Sprint[];
  today: Date;
  /** Створити й закрити. */
  onSave: () => void;
  /** Створити й відкрити повну картку. */
  onMore: () => void;
  /** Простір проєкту: проєкт задано самим простором — чип лише показує його. */
  projectLocked?: boolean;
  colors: CardColors;
  isDark: boolean;
  locale: string;
}

const NO_SPRINTS: readonly Sprint[] = [];
/** Після входу аркуша — див. ефект фокусу нижче. */
export const FOCUS_DELAY_MS = 320;

export function TaskQuickCreate({
  editor, pickableProjects, projects, projectCreateOption, sprints = NO_SPRINTS, today, onSave, onMore,
  projectLocked = false, colors: c, isDark, locale,
}: TaskQuickCreateProps) {
  const { tr } = useI18n();
  const titleRef = useRef<TextInput>(null);
  const [attempted, setAttempted] = useState(false);
  const { projectId, sprintId } = editor.draft;
  const currentSprintId = draftCurrentSprintId(editor.draft, editor.original);
  const showSprint = sprintFieldVisible(sprints, projectId, currentSprintId);
  const sprintOptions = showSprint ? sprintOptionsForTask(sprints, projectId, currentSprintId) : [];
  const sprintLabels = { closedSuffix: tr.sprintClosedSuffix, foreign: tr.sprintForeignProject };
  const missingTitle = attempted && !editor.draft.title.trim();

  // Фокус — ПІСЛЯ того, як аркуш доїхав (spring SheetModal ~300 мс). З
  // autoFocus клавіатура піднімалась посеред анімації входу, і
  // KeyboardAvoidingView штовхав картку вдруге — вона «стрибала».
  useEffect(() => {
    const timer = setTimeout(() => titleRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const submit = (then: () => void) => {
    setAttempted(true);
    if (!editor.draft.title.trim()) { titleRef.current?.focus(); return; }
    setAttempted(false);
    then();
  };

  return (
    <View>
      <Text accessibilityRole="header" style={[st.title, { color: c.text }]}>{tr.newTask}</Text>

      <TextInput
        ref={titleRef}
        value={editor.draft.title}
        onChangeText={v => editor.patch({ title: v })}
        placeholder={tr.cardQuickPlaceholder}
        placeholderTextColor={c.sub}
        accessibilityLabel={tr.taskNamePlaceholder}
        returnKeyType="done"
        onSubmitEditing={() => submit(onSave)}
        style={[st.input, {
          backgroundColor: c.dim,
          color: c.text,
          borderColor: missingTitle ? '#EF4444' : c.border,
        }]}
      />
      {missingTitle ? <Text accessibilityRole="alert" style={st.error}>{tr.cardTitleRequired}</Text> : null}

      {/* Чипи переносяться на новий рядок, а не їдуть горизонтальним
          скролом: їх три-чотири, і схований за краєм «Проєкт» ніхто не знайде. */}
      <View style={st.chips}>
        <DateField
          variant="chip"
          icon="flag"
          label={tr.deadline}
          value={editor.draft.deadline}
          onChange={iso => editor.patch({ deadline: iso })}
          today={today}
          colors={c}
          isDark={isDark}
          locale={locale}
        />
        <PriorityField
          variant="chip"
          value={editor.draft.priorityLevel}
          onChange={level => editor.patch({ priorityLevel: level })}
          colors={c}
          isDark={isDark}
        />
        <OptionField
          variant="chip"
          icon="folder"
          label={tr.project}
          options={pickableProjects.map(p => ({ id: p.id, label: p.name, color: p.color }))}
          value={projectId}
          selectedLabel={projects.find(p => p.id === projectId)?.name ?? null}
          // Зміна проєкту скидає спринт у «Беклог»: спринт належить проєкту.
          onChange={id => editor.patch(id === projectId ? { projectId: id } : { projectId: id, sprintId: null })}
          emptyOption={{ label: tr.noProject, icon: 'tray' }}
          createOption={projectLocked ? undefined : projectCreateOption}
          search
          disabled={projectLocked}
          colors={c}
          isDark={isDark}
        />
        {showSprint ? (
          <OptionField
            variant="chip"
            icon="flag.checkered"
            label={tr.sprintField}
            options={sprintOptions.map(o => ({ id: o.id, label: sprintOptionLabel(o, sprintLabels), icon: 'flag' as const }))}
            value={sprintId}
            onChange={id => editor.patch({ sprintId: id })}
            emptyOption={{ label: tr.sprintBacklog, icon: 'tray' }}
            colors={c}
            isDark={isDark}
          />
        ) : null}
      </View>

      <View style={st.buttons}>
        <TouchableOpacity
          onPress={() => submit(onMore)}
          accessibilityRole="button"
          accessibilityHint={tr.cardMoreHint}
          style={[cardStyles.btn, { flex: 1, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
          <Text style={{ color: c.text, fontWeight: '600' }}>{tr.cardMore}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => submit(onSave)}
          accessibilityRole="button"
          style={[cardStyles.btn, { flex: 1.4, backgroundColor: c.accent }]}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.add}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Обгортка з прокруткою — щоб на низькому вікні з клавіатурою кнопки лишались досяжні. */
export function TaskQuickCreateScroll(props: TaskQuickCreateProps) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TaskQuickCreate {...props} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  title:   { fontSize: 19, fontWeight: '700', marginBottom: 12 },
  input:   { borderRadius: Atlas.radius.medium, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 13, fontSize: 16, fontWeight: '500' },
  error:   { color: '#EF4444', fontSize: 12, marginTop: 5 },
  chips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 4 },
});
