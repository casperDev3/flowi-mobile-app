/**
 * components/time/TimerCell.tsx
 *
 * Клітинка сітки повноекранного режиму.
 *
 * На цей екран дивляться краєм ока, поки працюють, — тому головний і
 * найбільший елемент тут годинник, а назва та кнопка навмисно дрібні й тихі.
 *
 * Що саме показує годинник, вирішує TimerDial: циферблат обирає користувач,
 * і клітинка про його влаштування нічого не знає. Кожен циферблат сам
 * підписаний на спільний тікер — інакше щосекунди перемальовувалася б уся
 * клітинка разом зі списком підзавдань замість одного вузла всередині.
 *
 * Розміри приходять пропами, а не рахуються тут: скільки клітинок влазить на
 * екран, знає лише сітка — вона ж і ділить між ними простір.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { TimerDial } from '@/components/time/dials/TimerDial';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { ActiveTimer } from '@/utils/activeTimers';
import type { DialId } from '@/utils/timerDials';

/** Червоний «Стоп» — той самий, що в деталі завдання (TaskTimerTab). */
const STOP = '#EF4444';

export interface TimerCellColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

/** Рівно те, що клітинці треба знати про підзавдання. */
export interface CellSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TimerCellProps {
  timer: ActiveTimer;
  /**
   * Підзавдання завдання, на якому йде таймер. Порожньо для вільного таймера
   * і для завдання без підзавдань — тоді блока немає взагалі, а не порожній
   * заголовок «Підзавдання» ні над чим.
   */
  subtasks?: CellSubtask[];
  /**
   * Колір проєкту завдання. undefined → крапки немає взагалі: вільний таймер
   * або завдання поза проєктом не отримує сірого «нічого», яке лише шумить.
   */
  projectColor?: string;
  /** Висота клітинки. Рахує сітка — див. коментар до файлу. */
  height: number;
  /** Обраний циферблат — один на застосунок, приходить із хука вище. */
  dial: DialId;
  /**
   * Полотно циферблата. Теж від сітки: у 2×2 воно менше, ніж на самоті.
   * Це не кегль цифр — круглим варіантам потрібен квадрат під фігуру.
   */
  dialSize: number;
  onPress: () => void;
  onStop: () => void;
  /** Відкрити вибір циферблата ДЛЯ ЦЬОГО таймера. */
  onPickDial: () => void;
  /** tr.dialPicker — для голосового доступу до дрібної іконки. */
  dialLabel: string;
  /** tr.stopTimerAction — рядки в компонент не зашиваються. */
  stopLabel: string;
  colors: TimerCellColors;
  isDark: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TimerCell({
  timer,
  subtasks,
  projectColor,
  height,
  dial,
  dialSize,
  onPress,
  onStop,
  onPickDial,
  dialLabel,
  stopLabel,
  colors: c,
  isDark,
  style,
}: TimerCellProps) {
  const all = subtasks ?? [];
  const doneCount = all.filter(s => s.done).length;
  // Скільки рядків показати — вирішує ВИСОТА клітинки, а не смак: у сітці 2×2
  // на телефоні місця під список немає взагалі, і три рядки виштовхнули б
  // кнопку «Стоп» за межі картки. Годинник тут головний, список — довідка.
  const maxRows = height >= 260 ? 3 : height >= 200 ? 2 : height >= 150 ? 1 : 0;
  // Показуємо НЕзроблені: перелік того, що вже закрито, під час роботи не
  // допомагає — потрібне те, що лишилось.
  const pending = all.filter(s => !s.done).slice(0, maxRows);
  const hiddenCount = all.filter(s => !s.done).length - pending.length;
  const showSubtasks = all.length > 0 && maxRows > 0;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={style}>
      <BlurView
        intensity={isDark ? 22 : 42}
        tint={isDark ? 'dark' : 'light'}
        style={[st.card, { height, borderColor: c.border }]}>
        <View style={st.head}>
          {projectColor ? <View style={[st.dot, { backgroundColor: projectColor }]} /> : null}
          <Text numberOfLines={1} style={[st.label, { color: c.sub }]}>{timer.label}</Text>
          {/* Вибір циферблата належить конкретному таймеру, тому кнопка стоїть
              у ЙОГО картці, а не в шапці режиму: у шапці вона неминуче
              читалася б як «для всіх». */}
          <Pressable
            onPress={onPickDial}
            accessibilityRole="button"
            accessibilityLabel={dialLabel}
            hitSlop={10}
            style={[st.dialBtn, { borderColor: c.border }]}>
            <IconSymbol name="square.grid.2x2" size={12} color={c.sub} />
          </Pressable>
        </View>

        <View style={st.clockRow}>
          <TimerDial
            dial={dial}
            startedAt={timer.startedAt}
            size={dialSize}
            colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent }}
          />
        </View>

        {showSubtasks && (
          <View style={st.subs}>
            {pending.map(sub => (
              <View key={sub.id} style={st.subRow}>
                <View style={[st.subDot, { borderColor: c.sub }]} />
                <Text numberOfLines={1} style={[st.subText, { color: c.sub }]}>{sub.title}</Text>
              </View>
            ))}
            {/* Лічильник, а не обрізаний список: він чесно каже, що показане —
                не все, і скільки саме сховано. */}
            <Text style={[st.subCount, { color: c.sub }]}>
              {hiddenCount > 0 ? `+${hiddenCount} · ` : ''}{doneCount}/{all.length}
            </Text>
          </View>
        )}

        {/* Зупинка незворотна — пише сесію в історію і повертає колонку. Тому
            вона тут окремою кнопкою, а не жестом по клітинці. */}
        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel={stopLabel}
          hitSlop={8}
          style={[st.stop, { borderColor: STOP + '55', backgroundColor: STOP + '16' }]}>
          <IconSymbol name="stop.fill" size={13} color={STOP} />
          <Text style={st.stopText}>{stopLabel}</Text>
        </Pressable>
      </BlurView>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
    // Тінь без свічення — правило CLAUDE.md.
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  head:     { flexDirection: 'row', alignItems: 'center' },
  dot:      { width: 8, height: 8, borderRadius: 4, marginRight: 7 },
  label:    { flex: 1, fontSize: 12, fontWeight: '700' },
  dialBtn:  { width: 24, height: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  clockRow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stop: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stopText: { color: STOP, fontSize: 12, fontWeight: '700', marginLeft: 6 },
  subs:     { marginBottom: 10 },
  subRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  subDot:   { width: 7, height: 7, borderRadius: 4, borderWidth: 1.2, marginRight: 7 },
  subText:  { flex: 1, fontSize: 11, opacity: 0.85 },
  subCount: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3, marginTop: 1 },
});
