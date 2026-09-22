/**
 * components/tasks/TaskSubtasks.tsx
 *
 * Блок підзавдань у деталі: смужка прогресу, список і рядок додавання.
 *
 * Показується не більше чотирьох: деталь — це огляд завдання, а не
 * робота зі списком. Коли підзавдань більше, знизу зʼявляється перехід
 * на окремий екран, де їх видно всі й можна впорядковувати.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskSubtasksProps {
  task: { id: string; status: 'active' | 'done'; subtasks: Subtask[] };
  progressPercent: number;
  /** Підзавдання в режимі перейменування, якщо таке є. */
  editingId: string | null;
  editingText: string;
  onChangeEditingText: (text: string) => void;
  onSaveEdit: (subtaskId: string, text: string) => void;
  onToggle: (subtaskId: string) => void;
  /** Кнопка копіювання в рядку: у буфер іде лише назва підзавдання. */
  onCopy: (subtask: Subtask) => void;
  /** Довгий тап або «…»: меню дій над підзавданням. */
  onShowActions: (subtask: Subtask, indexInTask: number) => void;
  /** Перехід на повний екран підзавдань. */
  onOpenAll: () => void;
  newText: string;
  onChangeNewText: (text: string) => void;
  onAdd: () => void;
  /** Доскролити до низу, щоб клавіатура не накрила поле вводу. */
  onFocusInput: () => void;
  colors: any;
  isDark: boolean;
  tr: Translations;
}

export function TaskSubtasks({
  task, progressPercent, editingId, editingText, onChangeEditingText, onSaveEdit,
  onToggle, onCopy, onShowActions, onOpenAll, newText, onChangeNewText, onAdd, onFocusInput,
  colors: c, isDark, tr,
}: TaskSubtasksProps) {
  return (
    <View style={{ marginTop: 14, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: c.border, padding: 12 }}>

    {task.subtasks.length > 0 && (
      <View style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <IconSymbol name="list.bullet" size={13} color={c.sub} />
          <Text style={[st.label, { color: c.sub, marginLeft: 5, marginTop: 0, marginBottom: 0, flex: 1 }]}>
            {tr.subtasks} · {task.subtasks.filter(x => x.done).length}/{task.subtasks.length}
          </Text>
          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{progressPercent}%</Text>
        </View>
        <View style={st.progressBg}>
          <View style={[st.progressFill, { width: `${progressPercent}%`, backgroundColor: task.status === 'done' ? '#10B981' : c.accent }]} />
        </View>
      </View>
    )}

    {!task.subtasks.length && (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <IconSymbol name="list.bullet" size={13} color={c.sub} />
        <Text style={[st.label, { color: c.sub, marginLeft: 5, marginTop: 0, marginBottom: 0 }]}>{tr.subtasks}</Text>
      </View>
    )}

    {(() => {
      // completed subtasks go to end
      const sortedSubs = [...task.subtasks].sort((a, b) => Number(a.done) - Number(b.done));
      const LIMIT = 4;
      const hasMore = sortedSubs.length > LIMIT;
      const displaySubs = hasMore ? sortedSubs.slice(0, LIMIT) : sortedSubs;
      return (
        <View style={{ gap: 7 }}>
          {displaySubs.map((sub) => {
            const originalIdx = task.subtasks.findIndex(item => item.id === sub.id);
            if (editingId === sub.id) {
              return (
                <View key={sub.id} style={[st.subRow, { backgroundColor: c.dim, borderColor: c.accent + '80' }]}>
                  <View style={[st.subCheck, { borderColor: c.accent, backgroundColor: 'transparent' }]} />
                  <TextInput
                    value={editingText}
                    onChangeText={onChangeEditingText}
                    autoFocus
                    onSubmitEditing={() => onSaveEdit(sub.id, editingText)}
                    returnKeyType="done"
                    style={[st.subTitle, { color: c.text, flex: 1, marginHorizontal: 10 }]}
                  />
                  <TouchableOpacity onPress={() => onSaveEdit(sub.id, editingText)}>
                    <IconSymbol name="checkmark.circle.fill" size={20} color={c.accent} />
                  </TouchableOpacity>
                </View>
              );
            }
            return (
              <TouchableOpacity
                key={sub.id}
                activeOpacity={0.7}
                onPress={() => onToggle(sub.id)}
                onLongPress={() => onShowActions(sub, originalIdx)}
                delayLongPress={350}
                style={[st.subRow, { backgroundColor: c.dim, borderColor: sub.done ? '#10B98130' : c.border }]}>
                <View style={[st.subCheck, { borderColor: sub.done ? '#10B981' : c.border, backgroundColor: sub.done ? '#10B981' : 'transparent' }]}>
                  {sub.done && <IconSymbol name="checkmark" size={10} color="#fff" />}
                </View>
                <Text style={[st.subTitle, { color: sub.done ? c.sub : c.text, textDecorationLine: sub.done ? 'line-through' : 'none', flex: 1, marginHorizontal: 10 }]}>{sub.title}</Text>
                <TouchableOpacity
                  onPress={() => onCopy(sub)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.copySubtask}: ${sub.title}`}
                  style={{ marginRight: 14 }}>
                  <IconSymbol name="doc.on.doc" size={13} color={c.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onShowActions(sub, originalIdx)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}>
                  <IconSymbol name="ellipsis" size={14} color={c.sub} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          {hasMore && (
            <TouchableOpacity
              onPress={onOpenAll}
              style={[st.viewAllBtn, { backgroundColor: c.accent + '12', borderColor: c.accent + '40' }]}>
              <IconSymbol name="list.bullet" size={14} color={c.accent} />
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 8 }}>
                {tr.viewAllSubtasks} · {task.subtasks.length}
              </Text>
              <IconSymbol name="chevron.right" size={12} color={c.accent} />
            </TouchableOpacity>
          )}

          <View style={[st.addSubRow, { borderColor: c.border, backgroundColor: c.dim }]}>
            <IconSymbol name="plus" size={15} color={c.sub} />
            <TextInput
              placeholder={tr.addSubtask}
              placeholderTextColor={c.sub}
              value={newText}
              onChangeText={onChangeNewText}
              onSubmitEditing={() => onAdd()}
              returnKeyType="done"
              onFocus={() => onFocusInput()}
              style={[st.subInput, { color: c.text, flex: 1, marginLeft: 8 }]}
            />
            {newText.trim() ? (
              <TouchableOpacity onPress={() => onAdd()}>
                <IconSymbol name="checkmark.circle.fill" size={20} color={c.accent} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    })()}

    </View>
  );
}

const st = StyleSheet.create({
  label:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  progressBg:   { height: 3, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  subRow:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10 },
  subCheck:     { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  subTitle:     { fontSize: 13, fontWeight: '500' },
  subInput:     { fontSize: 13, paddingVertical: 0 },
  addSubRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 10 },
  viewAllBtn:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
});
