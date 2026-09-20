/**
 * components/tasks/TaskCompactCard.tsx — компактна картка завдання у списку.
 *
 * Винесена з екрана завдань, бо тепер її малюють двоє: сам список і екран
 * «Всі (N)» однієї групи (app/task-group.tsx). Однакова картка там — не
 * косметика: людина має впізнати ту саму справу в повному списку групи.
 *
 * Мемоізована: у списку її примірників стільки ж, скільки завдань, а екран
 * перемальовується щосекунди, поки йде таймер. Щоб memo працювала,
 * колбеки приймають завдання аргументом — інакше виклик довелося б
 * загортати в стрілку, нову при кожному рендері.
 */
import { BlurView } from 'expo-blur';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sprintBadgeLabel, type Sprint } from '@/utils/sprintUtils';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import { isOverdue, normalizePriority, type Task } from '@/utils/taskUtils';

const AnimatedText = Animated.createAnimatedComponent(Text);

export interface TaskCompactCardProject {
  id: string;
  name: string;
  color: string;
}

export interface TaskCompactCardProps<T extends Task> {
  task: T;
  statusColumn: TaskStatusColumn;
  /** Завдання приходить аргументом, щоб екран міг тримати колбек стабільним. */
  onPress: (task: T) => void;
  /** Без onToggle позначка лише показує стан (екран групи — тільки перегляд). */
  onToggle?: (task: T) => void;
  /** Довгий тап — меню дій над карткою (копіювати тощо). */
  onLongPress?: (task: T) => void;
  c: any;
  isDark: boolean;
  projects: readonly TaskCompactCardProject[];
  /** Лише для підпису бейджа — картка спринти не змінює. */
  sprints: readonly Sprint[];
  /** Для VoiceOver: стан «прострочено» інакше ніяк не озвучується. */
  overdueLabel: string;
  /** Те саме для пріоритету: «Пріоритет P2» (порожньо — без пріоритету). */
  priorityLabel: string;
  /** Підпис до лічильника: «2/5» саме по собі нічого не означає. */
  subtasksLabel: string;
  /**
   * Ім'я виконавця (§4.5, `utils/taskUtils.ts` `assigneeDisplayName`) —
   * `null`/`undefined`, коли виконавця нема або проєкт соло (без кешу
   * команди). Рахується один раз на екрані-джерелі, а не тут: картка сама
   * не знає ні поточного користувача, ні складу команди інших проєктів.
   */
  assigneeLabel?: string | null;
}

function TaskCompactCardInner<T extends Task>({
  task, statusColumn, onPress, onToggle, onLongPress, c, isDark, projects, sprints, overdueLabel, priorityLabel, subtasksLabel, assigneeLabel,
}: TaskCompactCardProps<T>) {
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  // «Проєкт · Спринт» одним підписом. Колір бейджа лишається проєктовим:
  // спринт живе всередині проєкту, а не поруч із ним. Закритий спринт свій
  // підпис зберігає — див. findSprint в utils/sprintUtils.ts.
  const badgeLabel = sprintBadgeLabel(task, projects, sprints);
  const isDone = task.status === 'done';
  const doneSubtasks = task.subtasks.filter(sub => sub.done).length;
  const allSubtasksDone = task.subtasks.length > 0 && doneSubtasks === task.subtasks.length;

  /* Animate text opacity when done state changes */
  const titleOpacity = useSharedValue(isDone ? 0.45 : 1);
  useEffect(() => {
    titleOpacity.value = withTiming(isDone ? 0.45 : 1, { duration: 250 });
    // titleOpacity у deps — це об'єкт із useSharedValue, стабільний на весь
    // час життя компонента, тож ефект від цього не починає бігати частіше.
    // Раніше тут стояв eslint-disable, а від нього React Compiler мовчки
    // припиняв оптимізувати ВСЮ картку (PERF-2).
  }, [isDone, titleOpacity]);
  const titleAnimStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  // Опис рядка для VoiceOver: інакше озвучувалась лише назва, а статус,
  // дедлайн, пріоритет і проєкт передавались виключно кольором.
  // Дата тут не озвучується, бо її не видно: опис має відповідати тому, що
  // на екрані. Прострочення лишається — це стан, а не дата, і саме воно
  // потребує уваги.
  const a11ySummary = [
    task.title,
    statusColumn.name,
    task.subtasks.length > 0 ? `${subtasksLabel}: ${doneSubtasks}/${task.subtasks.length}` : null,
    overdue ? overdueLabel : null,
    priorityLabel,
    badgeLabel,
    assigneeLabel,
  ].filter(Boolean).join(', ');

  return (
    <PressableScale
      onPress={() => onPress(task)}
      onLongPress={onLongPress ? () => onLongPress(task) : undefined}
      delayLongPress={350}
      /*
       * accessible={false} — інакше картка стає ОДНИМ елементом доступності
       * і поглинає правильно розмічений чекбокс усередині: на пристрої вся
       * картка була одним вузлом 362×55 з назвою «A11Y тест, До роботи,
       * Пріоритет P3», а окремого вузла чекбокса в дереві не існувало —
       * тобто відмітити завдання виконаним з VoiceOver було нічим.
       * Сам onPress/onLongPress від цього не страждає (це лише прапорець
       * дерева доступності), а роль і назву картки бере на себе блок тексту
       * нижче, у якого є onAccessibilityTap.
       */
      accessible={false}>
      <BlurView
        intensity={isDark ? 18 : 35}
        tint={isDark ? 'dark' : 'light'}
        style={st.card}>
        <AnimatedCheck
          checked={isDone}
          color="#10B981"
          borderColor={c.border}
          size={18}
          radius={5}
          onPress={onToggle ? () => onToggle(task) : undefined}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          accessibilityRole="checkbox"
          accessibilityLabel={task.title}
          accessibilityState={{ checked: isDone }}
          style={{ marginTop: 1 }}
        />

        {/* Два рядки: назва зверху на всю ширину, статус і проєкт під нею.
            В один рядок назва змагалася за місце з рештою і обрізалась першою,
            хоча вона тут найважливіша. Дату свідомо не показуємо — компактний
            вигляд для швидкого перегляду списку, дедлайн видно в повному. */}
        <View
          style={{ flex: 1, marginHorizontal: 10, gap: 4 }}
          accessible
          accessibilityRole="button"
          accessibilityLabel={a11ySummary}
          onAccessibilityTap={() => onPress(task)}>
          <AnimatedText
            style={[{ color: c.text, fontSize: 14, fontWeight: '600', textDecorationLine: isDone ? 'line-through' : 'none' } as any, titleAnimStyle]}
            numberOfLines={2}>
            {task.title}
          </AnimatedText>

          <View
            style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}
            importantForAccessibility="no-hide-descendants">
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: statusColumn.color + '16' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusColumn.color, marginRight: 4 }} />
              <Text numberOfLines={1} style={{ color: statusColumn.color, fontSize: 10, fontWeight: '700' }}>{statusColumn.name}</Text>
            </View>

            {proj && badgeLabel && (
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: proj.color + '16' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: proj.color, marginRight: 4 }} />
                {/* maxWidth більший за колишні 110: у бейдж тепер уміщається
                    ще й назва спринта, і на 110 від неї лишалося три літери. */}
                <Text numberOfLines={1} style={{ color: proj.color, fontSize: 10, fontWeight: '600', maxWidth: 180 }}>{badgeLabel}</Text>
              </View>
            )}

            {/* Виконавець (§4.5) — лише коли є (соло-проєкт/особисте завдання
                чипу не показують: assigneeLabel там завжди null). Ім'я вже
                озвучене у a11ySummary — сама фраза ховається разом із рештою
                рядка через importantForAccessibility на батьківському View. */}
            {assigneeLabel && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <IconSymbol name="person.fill" size={10} color={c.sub} />
                <Text numberOfLines={1} style={{ color: c.sub, fontSize: 10, fontWeight: '600', maxWidth: 90 }}>
                  {assigneeLabel}
                </Text>
              </View>
            )}

            {/* Виконані підзавдання. Показуємо лише коли вони є: «0/0» на
                завданні без підзавдань — це шум, а не інформація. */}
            {task.subtasks.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <IconSymbol
                  name={allSubtasksDone ? 'checkmark.circle.fill' : 'list.bullet'}
                  size={10}
                  color={allSubtasksDone ? '#10B981' : c.sub}
                />
                <Text style={{
                  color: allSubtasksDone ? '#10B981' : c.sub,
                  fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'],
                }}>
                  {doneSubtasks}/{task.subtasks.length}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Пріоритет — бейдж P0–P5 (замість кольорової крапки). Озвучується
            в a11ySummary картки, тож сам бейдж від VoiceOver схований. */}
        <View style={{ alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <PriorityBadge level={normalizePriority(task)} />
        </View>
      </BlurView>
    </PressableScale>
  );
}

export const TaskCompactCard = React.memo(TaskCompactCardInner) as <T extends Task>(
  props: TaskCompactCardProps<T>,
) => React.ReactElement;

const st = StyleSheet.create({
  // minHeight 44 — мінімальна ціль дотику (Apple HIG). Було ~38: рядок цілком
  // клікабельний, тож він мусить відповідати нормі, а не лише чекбокс у ньому.
  card: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start' },
});
