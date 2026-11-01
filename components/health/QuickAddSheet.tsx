import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';

import { useWideModal } from '@/components/health/HealthLayout';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  ACCENT, ACCENT_CAL, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT,
} from '@/utils/healthTheme';
import { getHealthDSColors } from '@/components/health/palette';
import { fontFamily } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { EntryType } from '@/utils/healthUtils';
import { useSheetSurface } from '@/hooks/use-content-width';
import { useGlassStyles } from '@/components/finance/finPalette';
import { OverlayMaterial } from '@/components/ds';

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

  useEffect(() => { if (visible) setVals({}); }, [visible]);

  const save = () => {
    const records: QuickRecord[] = [];
    FIELDS.forEach(f => {
      const v = parseFloat((vals[f.type] ?? '').replace(',', '.'));
      if (!isNaN(v) && v > 0) records.push({ type: f.type, value: Math.round(v * (f.mul ?? 1)) });
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
              {/* Брудне скло (Layout System v2.4): аркуш поверх вмісту не просвічує. */}
              <OverlayMaterial isDark={isDark} radius={24} />
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
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: f.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <IconSymbol name={f.icon as any} size={16} color={f.color} />
                    </View>
                    <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.medium, flex: 1, marginLeft: 10 }}>{tr[f.labelKey]}</Text>
                    <TextInput
                      accessibilityLabel={`${tr[f.labelKey]}, ${f.unit}`}
                      value={vals[f.type] ?? ''}
                      onChangeText={t => setVals(p => ({ ...p, [f.type]: t }))}
                      keyboardType="decimal-pad"
                      placeholder="—" placeholderTextColor={k.text.muted}
                      style={{ width: 96, minHeight: 44, color: c.text, fontSize: 24, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.48, textAlign: 'right', paddingVertical: 8 }}
                    />
                    <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, width: 28, textAlign: 'right' }}>{f.unit}</Text>
                  </View>
                ))}
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
  title:     { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 10 },
  row:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
  btn:          { minHeight: 48, paddingVertical: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
