import { Atlas } from '@/constants/atlas';
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
import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TimeEntryForm, type TimeEntryFormProject } from '@/components/time/TimeEntryForm';
import type { TimeColors } from '@/components/time/TimePalette';
import type { Translations } from '@/store/translations';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import type { TaskProjects, TimeRecord } from '@/utils/timeEntries';
import type { EditableTask } from '@/utils/timeEntryEdit';

export type TimeEntrySheetProject = TimeEntryFormProject;

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
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <TimeEntryForm
                  active={visible}
                  entry={entry}
                  c={c}
                  tr={tr}
                  tasks={tasks}
                  projects={projects}
                  taskProjects={taskProjects}
                  defaultProjectId={defaultProjectId}
                  onClose={onClose}
                  onSubmit={onSubmit}
                />
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
  sheet: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
});
