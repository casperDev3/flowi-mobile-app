/**
 * components/tasks/TaskHistoryTab.tsx
 *
 * Стрічка подій завдання: створено, відредаговано, таймер запущено тощо.
 *
 * Оформлення події — іконка, колір, підпис — жило в трьох різних місцях
 * екрана: дві функції на рівні модуля й словник усередині компонента.
 * Тут це одна таблиця: додаючи новий тип події, важко забути частину.
 */
import React from 'react';
import { Text, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

export type HistoryEventType =
  | 'created' | 'edited' | 'done' | 'active'
  | 'timer_start' | 'timer_stop'
  | 'subtask_add' | 'subtask_done' | 'subtask_undone';

export interface TaskHistoryEvent {
  id: string;
  at: string;
  type: HistoryEventType;
  note?: string;
}

/** Іконка, колір і ключ підпису — разом, щоб їх не можна було розсинхронити. */
export const HISTORY_EVENT_STYLE: Record<HistoryEventType, {
  icon: IconSymbolName;
  color: string;
  labelKey: keyof Translations;
}> = {
  created:        { icon: 'plus.circle.fill',                   color: '#10B981', labelKey: 'historyCreated' },
  edited:         { icon: 'pencil.circle.fill',                 color: '#F59E0B', labelKey: 'historyEdited' },
  done:           { icon: 'checkmark.circle.fill',              color: '#10B981', labelKey: 'historyDone' },
  active:         { icon: 'arrow.counterclockwise.circle.fill', color: '#6366F1', labelKey: 'historyRestored' },
  timer_start:    { icon: 'play.circle.fill',                   color: '#6366F1', labelKey: 'historyTimerStart' },
  timer_stop:     { icon: 'stop.circle.fill',                   color: '#EF4444', labelKey: 'historyTimerStop' },
  subtask_add:    { icon: 'plus.square.fill',                   color: '#0EA5E9', labelKey: 'historySubtaskAdd' },
  subtask_done:   { icon: 'checkmark.square.fill',              color: '#10B981', labelKey: 'historySubtaskDone' },
  subtask_undone: { icon: 'square.dashed',                      color: '#F59E0B', labelKey: 'historySubtaskUndone' },
};

export interface TaskHistoryTabProps {
  events: TaskHistoryEvent[];
  textColor: string;
  subColor: string;
  tr: Translations;
  /** Локаль для дати Й часу — раніше час був жорстко українським. */
  locale: string;
}

export function TaskHistoryTab({ events, textColor, subColor, tr, locale }: TaskHistoryTabProps) {
  if (events.length === 0) {
    return (
      <Text style={{ color: subColor, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
        {tr.historyEmpty}
      </Text>
    );
  }

  return (
    <View>
      {/* Найновіше зверху: свіжі події потрібні частіше за давні. */}
      {[...events].reverse().map(event => {
        const style = HISTORY_EVENT_STYLE[event.type];
        const at = new Date(event.at);
        return (
          <View key={event.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: style.color + '20', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <IconSymbol name={style.icon} size={14} color={style.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: textColor, fontSize: 13, fontWeight: '600' }}>{String(tr[style.labelKey])}</Text>
              {event.note ? (
                <Text style={{ color: subColor, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{event.note}</Text>
              ) : null}
              <Text style={{ color: subColor, fontSize: 11, marginTop: 3 }}>
                {at.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                {' · '}
                {at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
