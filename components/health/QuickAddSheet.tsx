import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  ACCENT, ACCENT_CAL, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT, getHealthColors,
} from '@/utils/healthTheme';
import { EntryType } from '@/utils/healthUtils';

export interface QuickRecord { type: EntryType; value: number; }

interface Field { type: EntryType; labelKey: string; unit: string; color: string; icon: string; mul?: number; }

const FIELDS: Field[] = [
  { type: 'water',    labelKey: 'water',    unit: 'мл',  color: ACCENT,        icon: 'drop.fill' },
  { type: 'calories', labelKey: 'calories', unit: 'кк',  color: ACCENT_CAL,    icon: 'flame.fill' },
  { type: 'steps',    labelKey: 'steps',    unit: 'кр',  color: ACCENT_STEPS,  icon: 'figure.walk' },
  { type: 'weight',   labelKey: 'weight',   unit: 'кг',  color: ACCENT_WEIGHT, icon: 'scalemass.fill' },
  { type: 'pulse',    labelKey: 'pulse',    unit: 'уд',  color: ACCENT_PULSE,  icon: 'waveform.path.ecg' },
  { type: 'sleep',    labelKey: 'sleep',    unit: 'год', color: ACCENT_SLEEP,  icon: 'moon.fill', mul: 60 },
];

export function QuickAddSheet({ visible, onClose, onSubmit, isDark, tr }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (records: QuickRecord[]) => void;
  isDark: boolean;
  tr: any;
}) {
  const c = getHealthColors(isDark);
  const [vals, setVals] = useState<Record<string, string>>({});

  useEffect(() => { if (visible) setVals({}); }, [visible]);

  const save = () => {
    const records: QuickRecord[] = [];
    FIELDS.forEach(f => {
      const v = parseFloat((vals[f.type] ?? '').replace(',', '.'));
      if (!isNaN(v) && v > 0) records.push({ type: f.type, value: Math.round(v * (f.mul ?? 1)) });
    });
    if (records.length) onSubmit(records);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={s.overlay} onPress={onClose}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrap}>
            <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.cancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[s.title, { color: c.text }]}>{tr.bodyEntryTitle}</Text>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 380 }}>
                {FIELDS.map(f => (
                  <View key={f.type} style={[s.row, { borderColor: c.border }]}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: f.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <IconSymbol name={f.icon as any} size={16} color={f.color} />
                    </View>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', flex: 1, marginLeft: 10 }}>{tr[f.labelKey]}</Text>
                    <TextInput
                      value={vals[f.type] ?? ''}
                      onChangeText={t => setVals(p => ({ ...p, [f.type]: t }))}
                      keyboardType="decimal-pad"
                      placeholder="—" placeholderTextColor={c.sub}
                      style={{ width: 84, color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'right', paddingVertical: 8 }}
                    />
                    <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', width: 28, textAlign: 'right' }}>{f.unit}</Text>
                  </View>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                  <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={save} style={[s.btn, { flex: 2, backgroundColor: ACCENT }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  handle:    { width: 36, height: 4, borderRadius: 2 },
  title:     { fontSize: 20, fontWeight: '800', marginBottom: 10 },
  row:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
