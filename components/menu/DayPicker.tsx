/**
 * components/menu/DayPicker.tsx — вибір дня тижня.
 *
 *   DayChips — телефон: сім чипів у ряд, крапка = є страви / сьогодні.
 *   DayList  — планшет: ліва колонка, рядок дня з коротким зведенням страв
 *              за прийомами (як список завдань ліворуч від деталі).
 */
import { Atlas } from '@/constants/atlas';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { Meal, MenuEntry } from '@/store/menu-api';

import { cap, dateLabel, daySummary, MEAL_META, weekdayLabel } from './model';
import type { MenuColors } from './theme';

const dayA11y = (d: string, isToday: boolean) =>
  cap(weekdayLabel(d, 'long')) + ', ' + dateLabel(d) + (isToday ? ', сьогодні' : '');

export function DayChips({
  days,
  day,
  today,
  entries,
  onSelect,
  c,
}: {
  days: readonly string[];
  day: string;
  today: string;
  entries: readonly MenuEntry[];
  onSelect: (d: string) => void;
  c: MenuColors;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {days.map((d) => {
        const selected = d === day,
          isToday = d === today,
          hasDish = entries.some((e) => e.date === d);
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityLabel={dayA11y(d, isToday)}
            accessibilityState={{ selected }}
            onPress={() => onSelect(d)}
            style={{
              flex: 1,
              minHeight: 60,
              borderRadius: Atlas.radius.xlarge,
              paddingVertical: 8,
              alignItems: 'center',
              gap: 2,
              borderWidth: 1.5,
              borderColor: selected || isToday ? c.accent : c.border,
              backgroundColor: selected ? c.accent : c.card,
            }}>
            <Text style={{ fontSize: 11, color: selected ? '#fff' : c.sub }}>{weekdayLabel(d, 'short')}</Text>
            <Text style={{ fontSize: 18, color: selected ? '#fff' : c.text, fontWeight: '700' }}>
              {Number(d.slice(-2))}
            </Text>
            <View
              style={{
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: selected
                  ? isToday || hasDish
                    ? '#fff'
                    : 'transparent'
                  : isToday
                    ? c.accent
                    : hasDish
                      ? c.faint
                      : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

export function DayList({
  days,
  day,
  today,
  dimBefore,
  entries,
  orderedMeals,
  onSelect,
  todayPill,
  c,
}: {
  days: readonly string[];
  day: string;
  today: string;
  /** Дні раніше за цю дату приглушені (минулі дні поточного тижня). */
  dimBefore: string;
  entries: readonly MenuEntry[];
  orderedMeals: readonly Meal[];
  onSelect: (d: string) => void;
  todayPill: React.ReactNode;
  c: MenuColors;
}) {
  const { tr } = useI18n();
  return (
    <View
      accessibilityRole="list"
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        borderRadius: Atlas.radius.xlarge,
        overflow: 'hidden',
      }}>
      {days.map((d, i) => {
        const selected = d === day,
          isToday = d === today,
          { lines, dishes } = daySummary(entries, d, orderedMeals);
        return (
          <Pressable
            key={d}
            accessibilityRole="button"
            accessibilityLabel={dayA11y(d, isToday)}
            accessibilityHint={dishes ? tr.menu.dayDishes.replace('{n}', String(dishes)) : tr.menu.dayEmpty}
            accessibilityState={{ selected }}
            onPress={() => onSelect(d)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: c.border,
              backgroundColor: selected ? c.accent + '1F' : pressed ? c.dim : 'transparent',
              opacity: d < dimBefore && !selected ? 0.6 : 1,
            })}>
            {/* Смужка вибраного: колір не єдиний сигнал — ще й фон рядка. */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 8,
                bottom: 8,
                width: 3,
                borderRadius: 2,
                backgroundColor: selected ? c.accent : 'transparent',
              }}
            />
            <View style={{ width: 44, alignItems: 'center' }}>
              <Text
                style={{
                  color: isToday ? c.accent : c.sub,
                  fontSize: 11,
                  fontWeight: '700',
                  textTransform: 'uppercase',
                }}>
                {weekdayLabel(d, 'short')}
              </Text>
              <Text style={{ color: selected ? c.accent : c.text, fontSize: 20, fontWeight: '700' }}>
                {Number(d.slice(-2))}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>
                  {cap(weekdayLabel(d, 'long'))}
                </Text>
                {isToday && todayPill}
              </View>
              {dishes === 0 ? (
                <Text style={{ color: c.faint, fontSize: 12 }}>{tr.menu.dayEmpty}</Text>
              ) : (
                lines
                  .filter((l) => l.titles.length)
                  .map((l) => (
                    <View key={l.meal} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <IconSymbol name={MEAL_META[l.meal].icon} size={11} color={MEAL_META[l.meal].color} />
                      <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, flex: 1 }}>
                        {l.titles.join(', ')}
                      </Text>
                    </View>
                  ))
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
