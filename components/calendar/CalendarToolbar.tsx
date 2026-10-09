/**
 * components/calendar/CalendarToolbar.tsx — керування видом календаря.
 *
 *   рядок 1: Місяць / Тиждень / День (сегменти) — на широкому поруч із
 *            навігацією періоду, на телефоні окремим рядком;
 *   рядок 2: ‹ період ›;
 *   рядок 3: фільтри — проєкт (Усі / Особисте / кожен проєкт), «Виконані»,
 *            «Лише мої» (проєктні завдання, призначені мені).
 *
 * Чипи фільтра — горизонтальний ScrollView: проєктів буває багато, а
 * переноси рядків штовхали б сітку вниз щоразу по-різному.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import type { Translations } from '@/store/translations';

import {
  CALENDAR_VIEWS, PERSONAL_FILTER, type CalendarProject, type CalendarView, type ProjectFilter,
} from './calendarModel';
import type { CalendarColors } from './palette';

const VIEW_KEYS: Record<CalendarView, 'calViewMonth' | 'calViewWeek' | 'calViewDay'> = {
  month: 'calViewMonth', week: 'calViewWeek', day: 'calViewDay',
};

/**
 * Підписи чипів проєктів без дублів (P2 аудиту 2026-10: «P0 Project» ×2,
 * «Regress E2» ×3 — не зрозуміло, котрий з них котрий). Однакові назви
 * отримують порядковий номер: «Regress E2», «Regress E2 (2)», …
 */
export function projectChipLabels<P extends { id: string; name: string }>(
  projects: readonly P[],
): { project: P; label: string }[] {
  const total = new Map<string, number>();
  for (const p of projects) {
    const key = p.name.trim().toLocaleLowerCase();
    total.set(key, (total.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return projects.map(project => {
    const key = project.name.trim().toLocaleLowerCase();
    if ((total.get(key) ?? 0) < 2) return { project, label: project.name };
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return { project, label: n === 1 ? project.name : `${project.name} (${n})` };
  });
}

export interface CalendarToolbarProps {
  view: CalendarView;
  onViewChange: (v: CalendarView) => void;
  title: string;
  onPrev: () => void;
  onNext: () => void;
  projects: readonly CalendarProject[];
  filter: ProjectFilter;
  onFilterChange: (f: ProjectFilter) => void;
  showDone: boolean;
  onToggleDone: () => void;
  onlyMine: boolean;
  onToggleOnlyMine: () => void;
  /** «Лише мої» має сенс, лише коли є проєкти й акаунт. */
  canFilterMine: boolean;
  /** Ряд фільтрів. Календар проєкту його не показує: проєкт там один. */
  showFilters?: boolean;
  wide: boolean;
  c: CalendarColors;
  tr: Translations;
}

export function CalendarToolbar({
  view, onViewChange, title, onPrev, onNext, projects, filter, onFilterChange,
  showDone, onToggleDone, onlyMine, onToggleOnlyMine, canFilterMine, showFilters = true, wide, c, tr,
}: CalendarToolbarProps) {
  const segments = (
    <View accessibilityRole="tablist" style={[st.segments, { backgroundColor: c.dim }, wide && { width: 300 }]}>
      {CALENDAR_VIEWS.map(v => {
        const active = v === view;
        return (
          <TouchableOpacity
            key={v}
            onPress={() => onViewChange(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[st.segment, { backgroundColor: active ? c.accent : 'transparent' }]}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#fff' : c.sub }}>{tr[VIEW_KEYS[v]]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const nav = (
    <View style={[st.navRow, wide && { flex: 1 }]}>
      <TouchableOpacity onPress={onPrev} accessibilityRole="button" accessibilityLabel={tr.calPrevPeriod}
        style={[st.navBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
        <IconSymbol name="chevron.left" size={15} color={c.sub} />
      </TouchableOpacity>
      <Text accessibilityRole="header" style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 15, fontWeight: '800' }}
        numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {title}
      </Text>
      <TouchableOpacity onPress={onNext} accessibilityRole="button" accessibilityLabel={tr.calNextPeriod}
        style={[st.navBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
        <IconSymbol name="chevron.right" size={15} color={c.sub} />
      </TouchableOpacity>
    </View>
  );

  const chip = (key: string, label: string, active: boolean, onPress: () => void, color?: string, icon?: 'eye' | 'eye.slash' | 'person.fill') => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[st.chip, {
        borderColor: active ? (color ?? c.accent) : c.border,
        backgroundColor: active ? (color ?? c.accent) + '22' : c.dim,
      }]}>
      {icon ? <IconSymbol name={icon} size={12} color={active ? (color ?? c.accent) : c.sub} /> : null}
      {color && !icon ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
      <Text style={{ color: active ? c.text : c.sub, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: 10, paddingHorizontal: 16, marginBottom: 10 }}>
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          {segments}
          {nav}
        </View>
      ) : (
        <>
          {segments}
          {nav}
        </>
      )}
      {showFilters ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
        {chip('all', tr.calFilterAll, filter === null, () => onFilterChange(null))}
        {chip('personal', tr.calFilterPersonal, filter === PERSONAL_FILTER, () => onFilterChange(filter === PERSONAL_FILTER ? null : PERSONAL_FILTER), '#7C3AED')}
        {projectChipLabels(projects).map(({ project: p, label }) => chip(p.id, label, filter === p.id, () => onFilterChange(filter === p.id ? null : p.id), p.color))}
        <View style={[st.sep, { backgroundColor: c.border }]} />
        {chip('done', tr.calFilterDone, showDone, onToggleDone, '#10B981', showDone ? 'eye' : 'eye.slash')}
        {canFilterMine ? chip('mine', tr.calFilterMine, onlyMine, onToggleOnlyMine, undefined, 'person.fill') : null}
      </ScrollView> : null}
    </View>
  );
}

const st = StyleSheet.create({
  segments: { flexDirection: 'row', borderRadius: 13, padding: 3 },
  segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: { width: 44, height: 44, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, maxWidth: 200 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sep: { width: 1, marginVertical: 6, marginHorizontal: 2 },
});
