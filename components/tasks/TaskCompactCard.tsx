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
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { findSprint, sprintBadgeLabel, type Sprint } from '@/utils/sprintUtils';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import { isOverdue, normalizePriority, type Task } from '@/utils/taskUtils';
import { SegmentedProgress } from '@/components/ds/SegmentedProgress';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';

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
  /**
   * Де стоїть бейдж пріоритету.
   *
   * 'footer' (типово) — особисті картки: бейдж у правому кінці нижнього
   * мета-рядка, а назва займає всю ширину картки (рішення власника, п. 4).
   * 'corner' — колишній вигляд у правому верхньому куті, лишається на
   * екранах простору проєкту (дошка/список/календар проєкту), щоб картки
   * канбану не змінились.
   */
  priorityPlacement?: 'footer' | 'corner';
  /**
   * Картка показана всередині простору СВОГО проєкту: назва проєкту в
   * бейджі там лише повторює заголовок екрана (P2 аудиту 2026-10) —
   * лишаємо тільки спринт, якщо він є.
   */
  hideProject?: boolean;
}

function TaskCompactCardInner<T extends Task>({
  task, statusColumn, onPress, onToggle, onLongPress, c, isDark, projects, sprints, overdueLabel, priorityLabel, subtasksLabel, assigneeLabel,
  priorityPlacement = 'footer', hideProject = false,
}: TaskCompactCardProps<T>) {
  const { tr } = useI18n();
  const priorityLevel = normalizePriority(task);
  const priorityInFooter = priorityPlacement === 'footer';
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  // «Проєкт · Спринт» одним підписом. Колір бейджа лишається проєктовим:
  // спринт живе всередині проєкту, а не поруч із ним. Закритий спринт свій
  // підпис зберігає — див. findSprint в utils/sprintUtils.ts.
  const badgeLabel = hideProject
    ? (findSprint(sprints, task.sprintId)?.name ?? null)
    : sprintBadgeLabel(task, projects, sprints);
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
  const t = dsTokens(isDark);

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
      {/* Omni (DS v2.2): суцільна біла картка surface.card з м'якою тінню,
          без рамки й блюру — як картка канбану в референсі. Вкладені чипи —
          пастельні (тінт кольору статусу/проєкту), а не скло: скляна
          підкладка на білій картці не видна. */}
      <View style={[st.card, { backgroundColor: t.surface.card, ...shadow[isDark ? 'dark' : 'light'].card }]}>
        {/* Ціль дотику чекбокса — справжні 44×44, а не 18 + hitSlop: hitSlop
            не виходить за межі картки (у неї відступ 12/9), тож фактично
            лишалось ~36. Колонка 44pt на всю висоту картки, сам квадратик —
            лише малюнок усередині. Підпис каже ДІЮ: «Позначити виконаним:
            <назва>» — інакше VoiceOver читав ту саму назву двічі (чекбокс і
            рядок), і не було чути, що з них що. */}
        {onToggle ? (
          <Pressable
            onPress={() => onToggle(task)}
            accessibilityRole="checkbox"
            accessibilityLabel={(isDone ? tr.taskToggleUndoneA11y : tr.taskToggleDoneA11y).replace('{title}', task.title)}
            accessibilityState={{ checked: isDone }}
            testID="task-row-checkbox"
            style={st.checkHit}>
            <AnimatedCheck checked={isDone} color={t.status.success} borderColor={c.sub} size={18} radius={5} />
          </Pressable>
        ) : (
          <View style={st.checkHit} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <AnimatedCheck checked={isDone} color={t.status.success} borderColor={c.sub} size={18} radius={5} />
          </View>
        )}

        {/* Два рядки: назва зверху на всю ширину, статус і проєкт під нею.
            В один рядок назва змагалася за місце з рештою і обрізалась першою,
            хоча вона тут найважливіша. Дату свідомо не показуємо — компактний
            вигляд для швидкого перегляду списку, дедлайн видно в повному. */}
        <View
          style={{ flex: 1, marginRight: 10, gap: 4 }}
          accessible
          accessibilityRole="button"
          accessibilityLabel={a11ySummary}
          onAccessibilityTap={() => onPress(task)}>
          <AnimatedText
            style={[{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, textDecorationLine: isDone ? 'line-through' : 'none' } as any, titleAnimStyle]}
            numberOfLines={2}>
            {task.title}
          </AnimatedText>

          {/* Нижній мета-рядок: зліва статус/проєкт/виконавець/підзавдання,
              справа (лише 'footer') — бейдж пріоритету. alignItems flex-end:
              коли ліві чипи переносяться в кілька рядків, бейдж лишається в
              правому НИЖНЬОМУ куті картки. */}
          <View
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}
            importantForAccessibility="no-hide-descendants">
            <View
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <View style={[st.tag, { backgroundColor: statusColumn.color + '1F' }]}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColumn.color, marginRight: 5 }} />
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.medium }}>
                  {statusColumn.name}
                </Text>
              </View>

              {proj && badgeLabel && (
                <View style={[st.tag, { backgroundColor: proj.color + '1F' }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: proj.color, marginRight: 5 }} />
                  {/* maxWidth більший за колишні 110: у бейдж тепер уміщається
                      ще й назва спринта, і на 110 від неї лишалося три літери. */}
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.medium, maxWidth: 180 }}>
                    {badgeLabel}
                  </Text>
                </View>
              )}

              {/* Виконавець (§4.5) — лише коли є (соло-проєкт/особисте завдання
                  чипу не показують: assigneeLabel там завжди null). Ім'я вже
                  озвучене у a11ySummary — сама фраза ховається разом із рештою
                  рядка через importantForAccessibility на батьківському View. */}
              {assigneeLabel && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <IconSymbol name="person.fill" size={10} color={c.sub} />
                  <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.medium, maxWidth: 90 }}>
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
                    color={allSubtasksDone ? t.status.success : c.sub}
                  />
                  <Text style={{
                    color: allSubtasksDone ? t.status.success : c.sub,
                    fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'],
                  }}>
                    {doneSubtasks}/{task.subtasks.length}
                  </Text>
                </View>
              )}
            </View>
            {/* Пріоритет — бейдж P0–P5. Озвучується в a11ySummary картки, тож
                сам бейдж від VoiceOver схований разом із рядком. */}
            {priorityInFooter && priorityLevel !== null && (
              <View testID="task-card-priority-footer">
                <PriorityBadge level={priorityLevel} />
              </View>
            )}
          </View>

          {/* Omni: сегментний прогрес підзавдань (градієнт підпису). Лише
              поки завдання не закрите — на виконаному він нічого не каже.
              Число вже озвучене в a11ySummary, тож смужка від VoiceOver
              схована. */}
          {task.subtasks.length > 0 && !isDone && (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ marginTop: 4 }}>
              <SegmentedProgress
                value={doneSubtasks / task.subtasks.length}
                segments={Math.min(12, Math.max(4, task.subtasks.length))}
                height={6}
              />
            </View>
          )}
        </View>

        {/* Старе місце бейджа — правий верхній кут (картки простору проєкту). */}
        {!priorityInFooter && (
          <View
            style={{
              alignItems: "center",
              justifyContent: "flex-start",
              alignSelf: "flex-start",
            }}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <PriorityBadge level={priorityLevel} />
          </View>
        )}
      </View>
    </PressableScale>
  );
}

export const TaskCompactCard = React.memo(TaskCompactCardInner) as <T extends Task>(
  props: TaskCompactCardProps<T>,
) => React.ReactElement;

const st = StyleSheet.create({
  // minHeight 44 — мінімальна ціль дотику (Apple HIG). Було ~38: рядок цілком
  // клікабельний, тож він мусить відповідати нормі, а не лише чекбокс у ньому.
  // Ліворуч без відступу: його займає 44-пунктова колонка чекбокса.
  // Без overflow:'hidden' — він обрізав би м'яку тінь картки на iOS.
  card: { minHeight: 44, borderRadius: radius.nested, paddingLeft: 0, paddingRight: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start' },
  tag: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  // Колонка чекбокса: 44 завширшки, на всю висоту картки (мінімум 44 —
  // відʼємні відступи «з'їдають» вертикальні 9pt картки).
  checkHit: { width: 44, minHeight: 44, marginVertical: -12, alignSelf: 'stretch', alignItems: 'center', paddingTop: 13 },
});
