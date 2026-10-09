/**
 * components/menu/DayPanel.tsx — один день меню: заголовок і прийоми їжі
 * рядками (ліворуч іконка й назва прийому, праворуч страви).
 *
 * Той самий вміст на телефоні (під чипами днів) і на планшеті (права
 * колонка поруч зі списком днів).
 */
import { Atlas } from '@/constants/atlas';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { meals, type Meal, type MenuEntry } from '@/store/menu-api';

import { entriesOf, longDayLabel, MEAL_META } from './model';
import type { MenuColors } from './theme';

export function DayPanel({
  day,
  today,
  entries,
  orderedMeals,
  showAdd,
  busy,
  thumbOf,
  onOpenDish,
  onAdd,
  todayPill,
  wide,
  c,
}: {
  day: string;
  today: string;
  entries: readonly MenuEntry[];
  orderedMeals: readonly Meal[];
  showAdd: boolean;
  busy: boolean;
  /** Мініатюра фото страви, якщо вже завантажена. */
  thumbOf: (e: MenuEntry) => string | null | undefined;
  onOpenDish: (e: MenuEntry) => void;
  onAdd: (day: string, meal: Meal) => void;
  todayPill: React.ReactNode;
  /** Планшет: більший заголовок і ширша колонка назви прийому. */
  wide: boolean;
  c: MenuColors;
}) {
  const dish = (e: MenuEntry) => {
    const thumb = e.has_photo ? thumbOf(e) : null;
    return (
      <Pressable
        key={e.id}
        accessibilityRole="button"
        accessibilityLabel={e.title}
        accessibilityHint={e.description || undefined}
        onPress={() => onOpenDish(e)}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          opacity: pressed ? 0.6 : 1,
        })}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 16, lineHeight: 22 }}>
            {e.title || e.description}
          </Text>
          {!!e.title && !!e.description && (
            <Text numberOfLines={wide ? 3 : 2} style={{ color: c.sub, fontSize: 13, lineHeight: 18 }}>
              {e.description}
            </Text>
          )}
        </View>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            accessibilityIgnoresInvertColors
            style={{ width: wide ? 72 : 56, height: wide ? 72 : 56, borderRadius: Atlas.radius.xlarge }}
          />
        ) : (
          e.has_photo && <IconSymbol name="camera.fill" size={14} color={c.faint} />
        )}
      </Pressable>
    );
  };

  const addRow = (m: Meal) => (
    <Pressable
      key="add"
      accessibilityRole="button"
      accessibilityLabel={`Додати страву: ${meals[m]}`}
      disabled={busy}
      onPress={() => onAdd(day, m)}
      style={({ pressed }) => ({
        minHeight: 44,
        borderRadius: Atlas.radius.large,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: c.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}>
      <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>＋ Додати</Text>
    </Pressable>
  );

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.card,
        borderRadius: Atlas.radius.xlarge,
        paddingHorizontal: wide ? 20 : 16,
        paddingTop: 16,
        paddingBottom: 4,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text accessibilityRole="header" style={{ color: c.text, fontSize: wide ? 20 : 17, fontWeight: '600' }}>
          {longDayLabel(day)}
        </Text>
        {day === today && todayPill}
      </View>
      {orderedMeals.map((m, i) => {
        const list = entriesOf(entries, day, m);
        return (
          <View
            key={m}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 12,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: c.border,
            }}>
            <View style={{ width: wide ? 104 : 92, gap: 4, paddingTop: 2 }}>
              <IconSymbol name={MEAL_META[m].icon} size={18} color={MEAL_META[m].color} />
              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>{meals[m]}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
              {list.map(dish)}
              {showAdd ? (
                addRow(m)
              ) : (
                !list.length && (
                  <Text accessibilityLabel="Не заплановано" style={{ color: c.faint, fontSize: 15, lineHeight: 22 }}>
                    —
                  </Text>
                )
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
