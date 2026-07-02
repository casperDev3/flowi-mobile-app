import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ACCENT_WEIGHT, getHealthColors } from '@/utils/healthTheme';
import { EntryType } from '@/utils/healthUtils';

export interface BodyRecord { type: EntryType; value: number; }

const FIELDS: { type: EntryType; labelKey: string; unit: string }[] = [
  { type: 'weight', labelKey: 'weight',   unit: 'кг' },
  { type: 'waist',  labelKey: 'mWaist',   unit: 'см' },
  { type: 'hips',   labelKey: 'mHips',    unit: 'см' },
  { type: 'chest',  labelKey: 'mChest',   unit: 'см' },
  { type: 'biceps', labelKey: 'mBiceps',  unit: 'см' },
  { type: 'thigh',  labelKey: 'mThigh',   unit: 'см' },
  { type: 'neck',   labelKey: 'mNeck',    unit: 'см' },
  { type: 'calf',   labelKey: 'mCalf',    unit: 'см' },
  { type: 'bodyfat', labelKey: 'mBodyfat', unit: '%' },
];

export function BodyEntrySheet({ visible, onClose, onSubmit, defaults, isDark, tr }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (records: BodyRecord[]) => void;
  defaults: Partial<Record<EntryType, number | null>>;
  isDark: boolean;
  tr: any;
}) {
  const c = getHealthColors(isDark);
  const [vals, setVals] = useState<Record<string, string>>({});

  // Префіл останніми значеннями при відкритті
  useEffect(() => {
    if (!visible) return;
    const init: Record<string, string> = {};
    FIELDS.forEach(f => { const d = defaults[f.type]; init[f.type] = d != null ? String(d) : ''; });
    setVals(init);
  }, [visible]);

  const save = () => {
    const records: BodyRecord[] = [];
    FIELDS.forEach(f => {
      const v = parseFloat((vals[f.type] ?? '').replace(',', '.'));
      if (!isNaN(v) && v > 0) records.push({ type: f.type, value: v });
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

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
                <View style={s.grid}>
                  {FIELDS.map(f => (
                    <View key={f.type} style={s.cell}>
                      <Text style={[s.label, { color: c.sub }]}>{tr[f.labelKey]}</Text>
                      <View style={[s.inputWrap, { borderColor: c.border, backgroundColor: c.dim }]}>
                        <TextInput
                          value={vals[f.type] ?? ''}
                          onChangeText={t => setVals(p => ({ ...p, [f.type]: t }))}
                          keyboardType="decimal-pad"
                          placeholder="—" placeholderTextColor={c.sub}
                          style={{ flex: 1, color: c.text, fontSize: 17, fontWeight: '700', paddingVertical: 10 }}
                        />
                        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{f.unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                  <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={save} style={[s.btn, { flex: 2, backgroundColor: ACCENT_WEIGHT }]}>
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
  title:     { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell:      { width: '47%' },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
