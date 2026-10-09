/**
 * components/tasks/card/TaskCardSections.tsx — вміст вкладок картки завдання.
 *
 * Картка одна на особисті й проєктні задачі. Вкладки:
 *   Основне    — статус, пріоритет, дедлайн, проєкт; підзавдання
 *   Деталі     — опис; оцінка, дата початку, повторення, нагадування (+ спринт соло-проєкту)
 *   Команда    — components/projects/TeamTaskPanel.tsx
 *   Активність — таймер, історія, коментарі (лише задача проєкту)
 *
 * Компоненти тут лише складають рядки й слоти: усі правки йдуть колбеками в
 * екран, який знає права, історію й синк. Складні наявні шматки (підзавдання,
 * коментарі) приходять готовими слотами — їхня логіка й далі живе там, де жила.
 * Кнопка таймера тут не живе: вона в липкій шапці (TaskDetailHeader →
 * timerSlot), видна на кожній вкладці.
 */
import React from 'react';
import { Text, View } from 'react-native';

import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import type { PickerCreateOption } from '@/components/shared/PickerField';
import { useI18n } from '@/store/i18n';
import type { TaskPriority } from '@/utils/taskUtils';

import {
  DateField,
  EstimateField,
  InlineTextArea,
  OptionField,
  PriorityField,
  ReminderField,
  RepeatField,
  formatDay,
  type FieldOption,
} from './fields';
import { FieldTrigger, PropertyGroup, SectionTitle, type CardColors } from './primitives';

// ─── Основне ─────────────────────────────────────────────────────────────────

export interface TaskCardMainProps {
  status: { options: FieldOption[]; value: string; onChange: (id: string) => void };
  priority: TaskPriority;
  onPriority: (level: TaskPriority) => void;
  deadline: string | undefined;
  overdue: boolean;
  onDeadline: (iso: string | null) => void;
  project: {
    options: FieldOption[];
    value: string | null;
    /** Назва з повного списку — для архівного проєкту, якого нема серед options. */
    selectedLabel: string | null;
    onChange: (id: string | null) => void;
    createOption?: PickerCreateOption;
    /** Проєкт не змінюється тут (картка в просторі проєкту) — рядок лише показує його. */
    locked?: boolean;
  };
  /** Право змінювати хід роботи (статус, підзавдання) — виконавець/лід. */
  canExecute: boolean;
  /** Право планувати (назва, пріоритет, дедлайн, проєкт). */
  canPlan: boolean;
  subtasksSlot: React.ReactNode;
  /** «Видалити / Виконано» внизу. */
  actionsSlot?: React.ReactNode;
  today: Date;
  colors: CardColors;
  isDark: boolean;
  locale: string;
}

export function TaskCardMain({
  status, priority, onPriority, deadline, overdue, onDeadline, project,
  canExecute, canPlan, subtasksSlot, actionsSlot, today, colors: c, isDark, locale,
}: TaskCardMainProps) {
  const { tr } = useI18n();
  return (
    <View>
      <PropertyGroup colors={c}>
        <OptionField
          icon="rectangle.3.group"
          label={tr.status}
          options={status.options}
          value={status.value}
          onChange={id => { if (id) status.onChange(id); }}
          colorValue
          disabled={!canExecute}
          colors={c}
          isDark={isDark}
        />
        <PriorityField value={priority} onChange={onPriority} disabled={!canPlan} colors={c} isDark={isDark} />
        <DateField
          icon="flag"
          label={tr.deadline}
          value={deadline}
          onChange={onDeadline}
          danger={overdue}
          disabled={!canPlan}
          today={today}
          colors={c}
          isDark={isDark}
          locale={locale}
        />
        <OptionField
          icon="folder"
          label={tr.project}
          options={project.options}
          value={project.value}
          selectedLabel={project.selectedLabel}
          onChange={project.onChange}
          emptyOption={{ label: tr.noProject, icon: 'tray' }}
          createOption={project.createOption}
          search
          disabled={!canPlan || !!project.locked}
          colors={c}
          isDark={isDark}
        />
      </PropertyGroup>

      {subtasksSlot}

      {actionsSlot}
    </View>
  );
}

// ─── Деталі ──────────────────────────────────────────────────────────────────

export interface TaskCardDetailsProps {
  description: string;
  onDescription: (text: string) => void;
  estimate: number | undefined;
  onEstimate: (minutes: number | undefined) => void;
  startDate: string | undefined;
  onStartDate: (iso: string | null) => void;
  recurrence: RecurrenceRule | undefined;
  onRecurrence: (rule: RecurrenceRule | undefined) => void;
  reminderAt: string | undefined;
  onSetReminder: (moment: Date) => void;
  onRemoveReminder: () => void;
  createdAt: string;
  hasDeadline: boolean;
  /** Спринт соло-проєкту — коли вкладки «Команда» немає, а спринти є. */
  sprintSlot?: React.ReactNode;
  canExecute: boolean;
  /** Право планувати (опис, дата початку, повторення). */
  canPlan: boolean;
  today: Date;
  colors: CardColors;
  isDark: boolean;
  locale: string;
}

export function TaskCardDetails({
  description, onDescription, estimate, onEstimate, startDate, onStartDate, recurrence, onRecurrence, reminderAt, onSetReminder,
  onRemoveReminder, createdAt, hasDeadline, sprintSlot, canExecute, canPlan, today, colors: c, isDark, locale,
}: TaskCardDetailsProps) {
  const { tr } = useI18n();
  return (
    <View>
      {/* Опис — першим у «Деталях»: «Основне» лишається коротким (статус,
          терміни, підзавдання), а опис читають і правлять уже свідомо. */}
      <InlineTextArea
        value={description}
        onCommit={onDescription}
        placeholder={tr.cardDescPlaceholder}
        label={tr.cardDescPlaceholder}
        editable={canPlan}
        minHeight={64}
        colors={c}
      />

      <PropertyGroup colors={c}>
        <EstimateField value={estimate} onChange={onEstimate} disabled={!canExecute} colors={c} isDark={isDark} />
        <DateField
          icon="calendar.badge.plus"
          label={tr.cardStartDate}
          value={startDate}
          onChange={onStartDate}
          disabled={!canPlan}
          today={today}
          colors={c}
          isDark={isDark}
          locale={locale}
        />
        <RepeatField value={recurrence} onChange={onRecurrence} disabled={!canPlan} today={today} colors={c} isDark={isDark} locale={locale} />
        <ReminderField value={reminderAt} onSave={onSetReminder} onRemove={onRemoveReminder} disabled={!canExecute}
          today={today} colors={c} isDark={isDark} locale={locale} />
        {sprintSlot ?? null}
      </PropertyGroup>

      <PropertyGroup colors={c}>
        <FieldTrigger icon="clock" label={tr.cardCreated} value={formatDay(createdAt, locale)} colors={c} />
      </PropertyGroup>

      {/* Наступний екземпляр створюється від дедлайну (toggleTask) — без
          нього повторення мовчки не спрацювало б. */}
      {recurrence && !hasDeadline ? (
        <Text style={{ color: '#F59E0B', fontSize: 12, marginTop: 8, marginLeft: 2 }}>{tr.cardRepeatNeedsDeadline}</Text>
      ) : null}
    </View>
  );
}

// ─── Активність ──────────────────────────────────────────────────────────────

export function TaskCardActivity({ timerSlot, historySlot, commentsSlot, linksSlot, colors: c }: {
  timerSlot: React.ReactNode;
  /** Повʼязані обговорення проєкту — першими: це «куди піти поговорити». */
  linksSlot?: React.ReactNode;
  historySlot: React.ReactNode;
  /** Лише задача проєкту — особисті задачі коментарів не мають. */
  commentsSlot?: React.ReactNode;
  colors: CardColors;
}) {
  const { tr } = useI18n();
  return (
    <View>
      {linksSlot ? (
        <>
          <SectionTitle color={c.sub}>{tr.taskCardDiscussions}</SectionTitle>
          {linksSlot}
        </>
      ) : null}
      {commentsSlot ? (
        <>
          <SectionTitle color={c.sub}>{tr.commentsTitle}</SectionTitle>
          {commentsSlot}
        </>
      ) : null}
      <SectionTitle color={c.sub}>{tr.tracker}</SectionTitle>
      {timerSlot}
      <SectionTitle color={c.sub}>{tr.history}</SectionTitle>
      {historySlot}
    </View>
  );
}
