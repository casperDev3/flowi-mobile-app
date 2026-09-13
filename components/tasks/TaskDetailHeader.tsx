/**
 * components/tasks/TaskDetailHeader.tsx — липка шапка деталі завдання.
 *
 * Живе в `header` у DetailPane, тобто ПОЗА прокруткою: у довгій задачі
 * (підзавдання, історія, сесії таймера) кнопки ✎/✕ і перемикач вкладок
 * раніше їхали вгору разом із вмістом, і щоб закрити лист чи перейти на
 * «Трекер», доводилося гортати назад на початок. Тепер гортається лише тіло.
 *
 * Однакова для модального листа (телефон) і колонки праворуч (планшет) —
 * різниця лише в «ручці», яка має сенс тільки там, де лист тягнуть пальцем.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

export type TaskDetailTab = 'info' | 'timer' | 'history';

const TABS: readonly TaskDetailTab[] = ['info', 'timer', 'history'];
const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export interface TaskDetailHeaderProps {
  title: string;
  /** Бейдж пріоритету (або будь-який інший) праворуч від назви. */
  badge?: React.ReactNode;
  /** Що стоїть перед назвою — напр. позначка «виконано». Ховається під час редагування. */
  leading?: React.ReactNode;
  /** Відкрита форма редагування: шапка показує «Редагувати завдання» і лише ✕. */
  editing: boolean;
  tab: TaskDetailTab;
  onTabChange: (tab: TaskDetailTab) => void;
  /** Крапка на вкладці «Трекер», коли таймер задачі йде. */
  timerRunning: boolean;
  onEdit: () => void;
  onClose: () => void;
  /** Показувати «ручку» листа (лише на вузькому екрані). */
  showHandle: boolean;
  colors: { text: string; sub: string; border: string; dim: string; accent: string };
  tr: Pick<Translations, 'details' | 'tracker' | 'history' | 'edit' | 'close' | 'editTask'>;
}

export function TaskDetailHeader({
  title, badge, leading, editing, tab, onTabChange, timerRunning, onEdit, onClose, showHandle, colors: c, tr,
}: TaskDetailHeaderProps) {
  return (
    <View style={st.wrap}>
      {showHandle ? <View style={[st.handle, { backgroundColor: c.border }]} /> : null}

      <View style={st.titleRow}>
        {/* Місце під ✎ тримається й під час редагування: інакше назва
            стрибала б ліворуч щоразу, коли відкривається форма. */}
        <View style={st.sideBtn}>
          {!editing ? (
            <TouchableOpacity
              onPress={onEdit}
              hitSlop={HIT}
              accessibilityRole="button"
              accessibilityLabel={tr.edit}>
              <IconSymbol name="pencil" size={17} color={c.sub} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={st.titleBox}>
          {!editing && leading ? <View style={st.leading}>{leading}</View> : null}
          <Text
            numberOfLines={2}
            accessibilityRole="header"
            style={[st.title, { color: c.text }]}>
            {editing ? tr.editTask : title}
          </Text>
          {!editing && badge ? <View style={st.badge}>{badge}</View> : null}
        </View>

        <View style={[st.sideBtn, { alignItems: 'flex-end' }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={HIT}
            accessibilityRole="button"
            accessibilityLabel={tr.close}>
            <IconSymbol name="xmark" size={17} color={c.sub} />
          </TouchableOpacity>
        </View>
      </View>

      {!editing ? (
        <View style={[st.tabs, { backgroundColor: c.dim }]}>
          {TABS.map(key => {
            const active = tab === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => onTabChange(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[st.tab, { backgroundColor: active ? c.accent : 'transparent' }]}>
                <IconSymbol
                  name={key === 'info' ? 'list.bullet' : key === 'timer' ? 'timer' : 'clock.arrow.circlepath'}
                  size={12}
                  color={active ? '#fff' : c.sub}
                />
                <Text style={{ color: active ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>
                  {key === 'info' ? tr.details : key === 'timer' ? tr.tracker : tr.history}
                </Text>
                {key === 'timer' && timerRunning ? (
                  <View style={[st.runDot, { backgroundColor: active ? '#fff' : '#6366F1' }]} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap:     { paddingBottom: 12 },
  handle:   { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  sideBtn:  { width: 28, paddingTop: 3 },
  titleBox: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', marginHorizontal: 6 },
  leading:  { marginRight: 10, marginTop: 1 },
  title:    { flex: 1, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  badge:    { marginLeft: 8, marginTop: 2 },
  tabs:     { flexDirection: 'row', gap: 5, borderRadius: 12, padding: 4 },
  tab:      { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 },
  runDot:   { width: 6, height: 6, borderRadius: 3 },
});
