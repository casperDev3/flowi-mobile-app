import { Atlas } from '@/constants/atlas';
/**
 * components/finance/TxDateField.tsx — поле «Дата» форми операції.
 *
 * Спільне для головної форми Фінансів і форми операції бюджету проєкту
 * (дзеркало веб transaction-form.tsx / project-budget.tsx): кнопка з довгою
 * датою, чипи «Сьогодні» / «Вчора» і календар, що розкривається ВСЕРЕДИНІ
 * того самого аркуша — друга модалка поверх аркуша лишала невидимий шар, що
 * ковтав дотики (NAT-02).
 *
 * Значення — локальний ключ дня 'YYYY-MM-DD'. Як із нього зробити момент
 * часу (день + поточний чи збережений час доби) — вирішує форма.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, type as dsType } from '@/constants/theme';
import { ds, useDS } from '@/hooks/use-ds';
import type { Translations } from '@/store/translations';
import { monthGrid } from '@/utils/dateUtils';
import { addDaysKey, dateKeyOf, parseDateKey } from '@/utils/subscriptions';

export interface TxDateFieldColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
}

/** «18 жовтня 2026 р.» — повна дата, рік завжди (операції бувають і торішні). */
export function formatTxDateKey(dateKey: string, locale: string): string {
  const p = parseDateKey(dateKey);
  if (!p) return dateKey || '—';
  try {
    return new Date(p.y, p.m - 1, p.d).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateKey;
  }
}

export function TxDateField({ value, onChange, locale, c, tr, labelStyle }: {
  value: string;
  onChange: (dateKey: string) => void;
  locale: string;
  c: TxDateFieldColors;
  tr: Translations;
  /** Стиль підпису — щоб збігався з іншими полями форми. */
  labelStyle?: object;
}) {
  const { t } = useDS();
  const [open, setOpen] = useState(false);
  const today = dateKeyOf(new Date());
  const yesterday = addDaysKey(today, -1);
  const text = formatTxDateKey(value, locale);

  const chips: { key: string; label: string }[] = [
    { key: today, label: tr.dateToday },
    { key: yesterday, label: tr.yesterday },
  ];

  return (
    <View>
      <Text style={[st.label, { color: c.sub }, labelStyle]}>{tr.date}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          onPress={() => setOpen(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${tr.date}: ${text}`}
          style={[st.dateBtn, { flex: 1, borderColor: open ? t.text.primary : 'transparent', backgroundColor: t.surface.subtle }]}>
          <IconSymbol name="calendar" size={16} color={open ? t.text.primary : t.text.secondary} />
          <Text numberOfLines={1} style={{ flex: 1, color: t.text.primary, fontSize: 14, fontFamily: fontFamily.medium, ...dsType.numeric }}>{text}</Text>
          <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={12} color={t.text.secondary} />
        </TouchableOpacity>
        {chips.map(chip => {
          const on = value === chip.key;
          return (
            <TouchableOpacity
              key={chip.label}
              onPress={() => { onChange(chip.key); setOpen(false); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[ds.chip(t, on), st.chip]}>
              <Text style={ds.chipText(t, on)}>{chip.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {open ? (
        <InlineCalendar
          value={value}
          onPick={key => { onChange(key); setOpen(false); }}
          c={c}
          tr={tr}
        />
      ) : null}
    </View>
  );
}

function InlineCalendar({ value, onPick, c, tr }: {
  value: string;
  onPick: (dateKey: string) => void;
  c: TxDateFieldColors;
  tr: Translations;
}) {
  const { t } = useDS();
  const parsed = parseDateKey(value);
  const today = new Date();
  const [year, setYear] = useState(parsed ? parsed.y : today.getFullYear());
  const [month, setMonth] = useState(parsed ? parsed.m - 1 : today.getMonth());
  const selected = parsed ? new Date(parsed.y, parsed.m - 1, parsed.d).toDateString() : null;
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const empty = useMemo(() => new Set<string>(), []);

  const shift = (delta: number) => {
    const total = year * 12 + month + delta;
    setYear(Math.floor(total / 12));
    setMonth(((total % 12) + 12) % 12);
  };

  return (
    <View style={[st.calendar, { backgroundColor: t.surface.subtle }]}>
      <CalendarGrid
        year={year}
        month={month}
        markedDays={empty}
        selectedDate={selected}
        todayDate={today}
        weeks={weeks}
        onPrevMonth={() => shift(-1)}
        onNextMonth={() => shift(1)}
        onSelectDay={d => onPick(dateKeyOf(d))}
        c={c}
        months={tr.months}
        weekdays={tr.weekdays}
      />
    </View>
  );
}

const st = StyleSheet.create({
  label:    { fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 16, marginBottom: 8 },
  dateBtn:  { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Atlas.radius.medium, borderWidth: 1, paddingHorizontal: 12, minHeight: 44 },
  chip:     { minHeight: 44, paddingHorizontal: 12 },
  calendar: { borderRadius: Atlas.radius.large, padding: 12, marginTop: 8 },
});
