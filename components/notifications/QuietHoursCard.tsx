/**
 * Тихі години (notifications-module.md §4.5, §8.3): у цей проміжок сервер
 * відкладає push до кінця вікна, а в застосунку сповіщення з'являються
 * одразу. Інтервал може переходити через північ (22:00 → 08:00).
 *
 * Час змінюється кроком 30 хв кнопками «Раніше / Пізніше» — без нативного
 * пікера: той різний на iOS/Android і на планшеті відкривається модально
 * поверх аркуша, а тут потрібні лише дві «круглі» години.
 */
import React from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { formatHm, parseHm } from '@/api/notifications';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

import { fillTemplate } from './labels';

const STEP_MINUTES = 30;

interface Colors {
  border: string;
  text: string;
  sub: string;
  accent: string;
  dim: string;
  card: string;
}

interface Props {
  enabled: boolean;
  start: string | null;
  end: string | null;
  timezone: string;
  tr: Translations;
  colors: Colors;
  onToggle: (enabled: boolean) => void;
  onChangeTime: (edge: 'start' | 'end', value: string) => void;
}

/** Крок часу з обгортанням через північ; некоректне значення — від типового. */
export function stepTime(value: string | null, fallback: string, delta: number): string {
  const base = parseHm(value) ?? parseHm(fallback) ?? 0;
  return formatHm(base + delta);
}

export function QuietHoursCard({ enabled, start, end, timezone, tr, colors: c, onToggle, onChangeTime }: Props) {
  const rows: { edge: 'start' | 'end'; label: string; value: string; fallback: string }[] = [
    { edge: 'start', label: tr.ncQuietFrom, value: start ?? '22:00', fallback: '22:00' },
    { edge: 'end', label: tr.ncQuietTo, value: end ?? '08:00', fallback: '08:00' },
  ];
  return (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={st.toggleRow}>
        <View style={[st.iconBox, { backgroundColor: '#6366F120' }]}>
          <IconSymbol name="moon.fill" size={16} color="#6366F1" />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{tr.ncQuietHours}</Text>
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 2, lineHeight: 16 }}>{tr.ncQuietHoursSub}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          accessibilityLabel={tr.ncQuietHours}
          accessibilityState={{ checked: enabled }}
          trackColor={{ false: 'rgba(128,128,128,0.3)', true: c.accent }}
          thumbColor="#fff"
          ios_backgroundColor="rgba(128,128,128,0.3)"
        />
      </View>
      {enabled ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
          {rows.map(row => (
            <View key={row.edge} style={[st.timeRow, { borderTopColor: c.border }]}>
              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', width: 36 }}>{row.label}</Text>
              <TouchableOpacity
                onPress={() => onChangeTime(row.edge, stepTime(row.value, row.fallback, -STEP_MINUTES))}
                accessibilityRole="button"
                accessibilityLabel={`${row.label} ${row.value}: ${tr.ncEarlier}`}
                style={[st.stepBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name="minus" size={14} color={c.text} />
              </TouchableOpacity>
              <Text
                style={[st.time, { color: c.text }]}
                accessibilityLabel={`${row.label} ${row.value}`}>
                {row.value}
              </Text>
              <TouchableOpacity
                onPress={() => onChangeTime(row.edge, stepTime(row.value, row.fallback, STEP_MINUTES))}
                accessibilityRole="button"
                accessibilityLabel={`${row.label} ${row.value}: ${tr.ncLater}`}
                style={[st.stepBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name="plus" size={14} color={c.text} />
              </TouchableOpacity>
            </View>
          ))}
          {timezone ? (
            <Text style={{ color: c.sub, fontSize: 11.5, marginTop: 8 }}>{fillTemplate(tr.ncTimezone, { tz: timezone })}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card:      { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  iconBox:   { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  timeRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  stepBtn:   { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  time:      { fontSize: 20, fontWeight: '800', minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
