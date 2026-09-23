/**
 * Матриця «категорія × канал» з розгортанням до окремих подій
 * (notifications-module.md §4.4, §6.3).
 *
 * Рядок категорії керує всіма її подіями без власного вибору; розгорнувши
 * категорію, можна змінити окрему подію — така подія позначена «змінено» і
 * має кнопку «Як у категорії» (PATCH `events: {code: null}`).
 *
 * Події вимкнених модулів (ui_preferences) не показуються, а категорія без
 * жодної видимої події — теж: перемикач, що нічим не керує, лише плутає.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import {
  type NotificationChannel,
  type PreferenceCategory,
  type PreferencesDoc,
  type PreferencesPatch,
  categoryChannelPatch,
  isEventVisible,
} from '@/api/notifications';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

import { categoryLabel, categoryLook, channelLabel, eventLabel, fillTemplate } from './labels';

export interface MatrixColors {
  border: string;
  text: string;
  sub: string;
  accent: string;
  dim: string;
  card: string;
}

interface Props {
  doc: PreferencesDoc;
  channels: NotificationChannel[];
  disabledModules: readonly string[];
  tr: Translations;
  colors: MatrixColors;
  onChange: (patch: PreferencesPatch) => void;
}

/** Які категорії та події показувати з урахуванням вимкнених модулів. */
export function visibleCategories(doc: PreferencesDoc, disabledModules: readonly string[]): PreferenceCategory[] {
  return doc.categories
    .map(category => ({ ...category, events: category.events.filter(e => isEventVisible(e.key, disabledModules)) }))
    .filter(category => category.events.length > 0);
}

export function PreferencesMatrix({ doc, channels, disabledModules, tr, colors: c, onChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const categories = useMemo(() => visibleCategories(doc, disabledModules), [doc, disabledModules]);
  const channelOff = (channel: NotificationChannel) =>
    !doc.enabled && channel !== 'in_app'
      ? true
      : channel === 'push' ? !doc.push_enabled : channel === 'email' ? !doc.email_enabled : false;

  return (
    <View>
      <View style={st.headRow}>
        <View style={{ flex: 1 }} />
        {channels.map(channel => (
          <Text key={channel} style={[st.headCell, { color: c.sub }]} numberOfLines={2}>
            {channelLabel(tr, channel)}
          </Text>
        ))}
      </View>

      {categories.map(category => {
        const look = categoryLook(category.key);
        const label = categoryLabel(tr, category.key, category.label);
        const isOpen = !!expanded[category.key];
        return (
          <View key={category.key} style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
            <View style={st.row}>
              <View style={st.labelCol}>
                <View style={[st.iconBox, { backgroundColor: look.color + '20' }]}>
                  <IconSymbol name={look.icon} size={15} color={look.color} />
                </View>
                <Text style={[st.catLabel, { color: c.text }]} numberOfLines={2}>{label}</Text>
              </View>
              {channels.map(channel => (
                <ChannelToggle
                  key={channel}
                  value={category.channels[channel]}
                  dimmed={channelOff(channel)}
                  label={fillTemplate(tr.ncChannelA11y, { event: label, channel: channelLabel(tr, channel) })}
                  accent={c.accent}
                  border={c.border}
                  onToggle={() => onChange(categoryChannelPatch(doc, category.key, channel, !category.channels[channel]))}
                />
              ))}
            </View>

            <TouchableOpacity
              onPress={() => setExpanded(prev => ({ ...prev, [category.key]: !isOpen }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${label}: ${isOpen ? tr.ncHideEvents : tr.ncShowEvents}`}
              style={st.expandBtn}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700' }}>
                {isOpen ? tr.ncHideEvents : `${tr.ncShowEvents} · ${category.events.length}`}
              </Text>
              <IconSymbol name={isOpen ? 'chevron.up' : 'chevron.down'} size={13} color={c.accent} />
            </TouchableOpacity>

            {isOpen ? category.events.map(event => {
              const evLabel = eventLabel(tr, event.key, event.label);
              return (
                <View key={event.key} style={[st.eventRow, { borderTopColor: c.border }]}>
                  <View style={st.labelCol}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[st.evLabel, { color: c.text }]} numberOfLines={2}>{evLabel}</Text>
                      {event.overridden ? (
                        <TouchableOpacity
                          onPress={() => onChange({ events: { [event.key]: null } })}
                          accessibilityRole="button"
                          accessibilityLabel={`${evLabel}: ${tr.ncResetEvent}`}
                          style={st.resetBtn}>
                          <Text style={{ color: c.sub, fontSize: 11.5, fontWeight: '600' }}>
                            {tr.ncCustomized} · <Text style={{ color: c.accent }}>{tr.ncResetEvent}</Text>
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                  {channels.map(channel => (
                    <ChannelToggle
                      key={channel}
                      value={event.channels[channel]}
                      dimmed={channelOff(channel)}
                      label={fillTemplate(tr.ncChannelA11y, { event: evLabel, channel: channelLabel(tr, channel) })}
                      accent={c.accent}
                      border={c.border}
                      onToggle={() => onChange({ events: { [event.key]: { [channel]: !event.channels[channel] } } })}
                    />
                  ))}
                </View>
              );
            }) : null}
          </View>
        );
      })}
    </View>
  );
}

interface ToggleProps {
  value: boolean;
  dimmed: boolean;
  label: string;
  accent: string;
  border: string;
  onToggle: () => void;
}

/**
 * Квадрат-прапорець 44×44 (ціль дотику) з видимою частиною 26×26. Не
 * `Switch`: три перемикачі поруч на телефоні не влазять, а прапорець у
 * стовпчику читається як таблиця.
 */
function ChannelToggle({ value, dimmed, label, accent, border, onToggle }: ToggleProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={[st.toggleTarget, dimmed && { opacity: 0.4 }]}>
      <View style={[st.toggleBox, value ? { backgroundColor: accent, borderColor: accent } : { borderColor: border }]}>
        {value ? <IconSymbol name="checkmark" size={14} color="#fff" /> : null}
      </View>
    </TouchableOpacity>
  );
}

const CELL = 56;

const st = StyleSheet.create({
  headRow:    { flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 12, marginBottom: 6 },
  headCell:   { width: CELL, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  card:       { borderRadius: 16, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  row:        { flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingVertical: 6 },
  labelCol:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, paddingRight: 4 },
  iconBox:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catLabel:   { flex: 1, fontSize: 14, fontWeight: '700' },
  expandBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 44 },
  eventRow:   { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth },
  evLabel:    { fontSize: 13.5, fontWeight: '600' },
  resetBtn:   { minHeight: 36, justifyContent: 'center' },
  toggleTarget: { width: CELL, height: 44, alignItems: 'center', justifyContent: 'center' },
  toggleBox:  { width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
