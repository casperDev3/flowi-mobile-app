import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { useWideModal } from '@/components/health/HealthLayout';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getHealthDSColors } from '@/components/health/palette';
import { fontFamily } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { EntryType } from '@/utils/healthUtils';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useGlassStyles } from '@/components/finance/finPalette';
import { GlassBackdrop } from '@/components/ds';

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
  const c = getHealthDSColors(isDark);
  const gs = useGlassStyles();
  const k = dsTokens(isDark);
  const sheetSurface = useSheetSurface();
  const wm = useWideModal();
  const [vals, setVals] = useState<Record<string, string>>({});
  const canSave = FIELDS.some(field => {
    const value = parseFloat((vals[field.type] ?? '').replace(',', '.'));
    return Number.isFinite(value) && value > 0;
  });

  const wasVisible = useRef(false);

  // Префіл лише при відкритті: фонове оновлення не стирає введені значення.
  useEffect(() => {
    const opening = visible && !wasVisible.current;
    wasVisible.current = visible;
    if (!opening) return;
    const init: Record<string, string> = {};
    FIELDS.forEach(f => { const d = defaults[f.type]; init[f.type] = d != null ? String(d) : ''; });
    setVals(init);
  }, [visible, defaults]);

  const save = () => {
    const records: BodyRecord[] = [];
    FIELDS.forEach(f => {
      const v = parseFloat((vals[f.type] ?? '').replace(',', '.'));
      if (!isNaN(v) && v > 0) records.push({ type: f.type, value: v });
    });
    if (!records.length) return;
    onSubmit(records);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={onClose}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={[s.sheetWrap, wm.column]}
            accessible={false}
            accessibilityViewIsModal
            importantForAccessibility="yes"
          >
            <View style={[s.sheet, sheetSurface, { ...gs.strong }]}>
              <GlassBackdrop style={{ borderRadius: 24, overflow: 'hidden' }} />
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
                      <View style={[s.inputWrap, { backgroundColor: c.dim }]}>
                        <TextInput
                          accessibilityLabel={`${tr[f.labelKey]}, ${f.unit}`}
                          value={vals[f.type] ?? ''}
                          onChangeText={t => setVals(p => ({ ...p, [f.type]: t }))}
                          keyboardType="decimal-pad"
                          placeholder="—" placeholderTextColor={k.text.muted}
                          style={{ flex: 1, minHeight: 44, color: c.text, fontSize: 22, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.44, paddingVertical: 10 }}
                        />
                        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular }}>{f.unit}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                <TouchableOpacity accessibilityRole="button" onPress={onClose} style={[s.btn, { ...gs.subtle, flex: 1 }]}>
                  <Text style={{ color: k.action.secondaryText, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSave }}
                  disabled={!canSave}
                  onPress={save}
                  style={[s.btn, { flex: 2, backgroundColor: canSave ? k.action.primary : k.state.disabledBg }]}
                >
                  <Text style={{ color: canSave ? k.text.onAction : k.state.disabledText, fontFamily: fontFamily.semibold }}>{tr.save}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(17,17,19,0.40)' /* surface.overlay */, justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(); відсоток від батька з
  // height:auto не рахується і обмеження просто зникає (NAT-01).
  sheet:     { borderRadius: 24, padding: 24 },
  handleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  handle:    { width: 36, height: 4, borderRadius: 2 },
  title:     { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 12 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell:      { width: '47%' },
  label:        { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 5 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 14 },
  btn:          { minHeight: 48, paddingVertical: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
