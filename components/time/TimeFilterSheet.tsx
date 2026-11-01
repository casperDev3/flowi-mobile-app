/**
 * components/time/TimeFilterSheet.tsx — фільтри, сортування і режим показу.
 *
 * Усе в одній шухляді, бо всі ці перемикачі відповідають на одне питання
 * «що я зараз дивлюся»: період, проєкт, задача, порядок, «Список ↔ Групи за
 * проєктом». Розкидані по шапці, вони з'їдали б рядок, якого на телефоні
 * немає, а на планшеті розповзалися б у другий ряд кнопок.
 *
 * Набір і значення перемикачів — ті самі, що у вебі (`lib/time-entries.ts`):
 * фільтр, який є лише на одній платформі, робить із двох клієнтів два різні
 * продукти.
 */

import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { TimeColors } from '@/components/time/TimePalette';
import type { Translations } from '@/store/translations';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, type as dsType } from '@/constants/theme';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import {
  TIME_PERIODS,
  TIME_SORTS,
  type ProjectLike,
  type TaskOption,
  type TimeGrouping,
  type TimePeriod,
  type TimeSort,
} from '@/utils/timeEntries';
import { OverlayMaterial } from '@/components/ds';

export interface TimeFilterSheetProps {
  visible: boolean;
  c: TimeColors;
  isDark: boolean;
  height: number;
  isWide: boolean;
  period: TimePeriod;
  sort: TimeSort;
  grouping: TimeGrouping;
  projectId: string | null;
  taskKey: string | null;
  projects: ProjectLike[];
  tasks: TaskOption[];
  /** Підписи періодів — зі словника екрана (tr.periodToday тощо). */
  periodLabels: Record<TimePeriod, string>;
  tr: Translations;
  onChange: (next: {
    period?: TimePeriod;
    sort?: TimeSort;
    grouping?: TimeGrouping;
    projectId?: string | null;
    taskKey?: string | null;
  }) => void;
  onReset: () => void;
  onClose: () => void;
}

export function TimeFilterSheet({
  visible,
  c,
  isDark,
  height,
  isWide,
  period,
  sort,
  grouping,
  projectId,
  taskKey,
  projects,
  tasks,
  periodLabels,
  tr,
  onChange,
  onReset,
  onClose,
}: TimeFilterSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable accessible={false} style={[s.overlay, { backgroundColor: c.t.surface.overlay }]} onPress={onClose}>
        <Pressable accessible={false} onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
          <View style={[s.sheet, { ...c.gl.strong, maxHeight: height * 0.85 }, shadow[isDark ? 'dark' : 'light'].popover]}>
            <OverlayMaterial isDark={isDark} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.t.text.muted }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[s.sheetTitle, { color: c.text }]}>{tr.filtersAndSort}</Text>

              <Group label={tr.timePeriodGroup} c={c}>
                <View style={s.chipRow}>
                  {TIME_PERIODS.map(value => (
                    <Chip
                      key={value}
                      c={c}
                      label={periodLabels[value]}
                      active={period === value}
                      onPress={() => onChange({ period: value })}
                    />
                  ))}
                </View>
              </Group>

              <Group label={tr.timeModeGroup} c={c}>
                <View style={s.chipRow}>
                  <Chip c={c} label={tr.timeGroupingList} active={grouping === 'list'} onPress={() => onChange({ grouping: 'list' })} />
                  <Chip
                    c={c}
                    label={tr.timeGroupingProject}
                    active={grouping === 'project'}
                    onPress={() => onChange({ grouping: 'project' })}
                  />
                </View>
              </Group>

              <Group label={tr.sorting} c={c}>
                <View style={s.chipRow}>
                  {TIME_SORTS.map(value => (
                    <Chip
                      key={value}
                      c={c}
                      label={sortLabel(value, tr)}
                      active={sort === value}
                      onPress={() => onChange({ sort: value })}
                    />
                  ))}
                </View>
              </Group>

              {projects.length > 0 && (
                <Group label={tr.project} c={c}>
                  <View style={s.chipRow}>
                    <Chip c={c} label={tr.all} active={!projectId} onPress={() => onChange({ projectId: null })} />
                    {projects.map(project => (
                      <Chip
                        key={project.id}
                        c={c}
                        color={project.color}
                        label={project.name}
                        active={projectId === project.id}
                        // Задача належить проєкту, тож зміна проєкту скидає
                        // вибрану задачу — інакше лишався б фільтр, під який
                        // не підпадає жоден запис, і список мовчки порожнів.
                        onPress={() => onChange({ projectId: projectId === project.id ? null : project.id, taskKey: null })}
                      />
                    ))}
                  </View>
                </Group>
              )}

              {tasks.length > 1 && (
                <Group label={tr.tasks} c={c}>
                  <View style={s.chipRow}>
                    <Chip c={c} label={tr.all} active={!taskKey} onPress={() => onChange({ taskKey: null })} />
                    {tasks.slice(0, 30).map(task => (
                      <Chip
                        key={task.key}
                        c={c}
                        label={task.label}
                        active={taskKey === task.key}
                        onPress={() => onChange({ taskKey: taskKey === task.key ? null : task.key })}
                      />
                    ))}
                  </View>
                </Group>
              )}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
                <TouchableOpacity onPress={onReset} style={[s.btn, { ...c.gl.subtle, flex: 1 }]}>
                  <Text style={{ ...dsType.label, color: c.t.action.secondaryText }}>{tr.reset}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 2, backgroundColor: c.t.action.primary }]}>
                  <Text style={{ ...dsType.label, color: c.t.text.onAction }}>{tr.close}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Підпис порядку — зі словника; таблиця в цьому файлі була тимчасовою. */
function sortLabel(value: TimeSort, tr: Translations): string {
  if (value === 'date-desc') return tr.timeSortDateDesc;
  if (value === 'date-asc') return tr.timeSortDateAsc;
  if (value === 'duration-desc') return tr.timeSortDurationDesc;
  return tr.timeSortDurationAsc;
}

function Group({ label, c, children }: { label: string; c: TimeColors; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={[s.label, { color: c.sub }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  c,
  label,
  active,
  color,
  onPress,
}: {
  c: TimeColors;
  label: string;
  active: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[s.chip, { backgroundColor: active ? c.t.action.primary : c.dim }]}>
      {color && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 6 }} />}
      <Text numberOfLines={1} style={{ color: active ? c.t.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet: { borderRadius: radius.card, padding: space.cardPaddingCompact, overflow: 'hidden' },
  handleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold },
  label: { fontSize: 11, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', minHeight: 36, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  btn: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
