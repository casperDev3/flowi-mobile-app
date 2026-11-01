import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { useWideModal } from '@/components/health/HealthLayout';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  ACCENT, ACCENT_CAL, ACCENT_MOOD, ACCENT_PROT, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT,
  ModalKey,
} from '@/utils/healthTheme';
import { dsTokensFor, getHealthDSColors, healthGlassStyles } from '@/components/health/palette';
import { fontFamily } from '@/constants/theme';

import { EntryType } from '@/utils/healthUtils';
import { useSheetSurface } from '@/hooks/use-content-width';

export interface NewEntryPayload {
  type: EntryType; value: number; note?: string;
  protein?: number; fat?: number; carbs?: number;
}

export function isValidHealthEntryInput(
  modalKey: ModalKey | null,
  value: string,
  secondaryValue = '',
): boolean {
  if (modalKey === 'sleep') {
    const hours = parseInt(value || '0', 10);
    const minutes = parseInt(secondaryValue || '0', 10);
    return hours >= 0 && minutes >= 0 && minutes < 60 && hours * 60 + minutes > 0;
  }
  const parsed = parseFloat(value.replace(',', '.'));
  return modalKey !== null && Number.isFinite(parsed) && parsed > 0;
}

export function HealthEntryModal({ modalKey, onClose, onSubmit, isDark, tr }: {
  modalKey: ModalKey | null;
  onClose: () => void;
  onSubmit: (e: NewEntryPayload) => void;
  isDark: boolean;
  tr: any;
}) {
  const c = getHealthDSColors(isDark);
  // Без hooks/use-ds: модуль імпортують чисті тести (health-modal.test).
  const gs = healthGlassStyles(isDark);
  const k = dsTokensFor(c);
  const sheetSurface = useSheetSurface();
  const wm = useWideModal();
  const [val, setVal] = useState('');
  const [val2, setVal2] = useState('');
  const [note, setNote] = useState('');
  const [prot, setProt] = useState('');
  const [fat, setFat] = useState('');
  const [carb, setCarb] = useState('');

  useEffect(() => {
    if (modalKey) { setVal(''); setVal2(''); setNote(''); setProt(''); setFat(''); setCarb(''); }
  }, [modalKey]);

  const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return isNaN(v) ? undefined : v; };
  const canSave = isValidHealthEntryInput(modalKey, val, val2);

  const save = () => {
    if (!canSave) return;
    if (modalKey === 'sleep') {
      const mins = parseInt(val || '0', 10) * 60 + parseInt(val2 || '0', 10);
      if (!mins) return;
      onSubmit({ type: 'sleep', value: mins, note: note || undefined });
      return;
    }
    const v = parseFloat(val.replace(',', '.'));
    if (!v || isNaN(v)) return;
    const macros = modalKey === 'calories' ? { protein: num(prot), fat: num(fat), carbs: num(carb) } : {};
    onSubmit({ type: modalKey as EntryType, value: v, note: note || undefined, ...macros });
  };

  return (
    <Modal visible={modalKey !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={onClose}>
          <Pressable
            onPress={e => e.stopPropagation()}
            style={[s.sheetWrapper, wm.column]}
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
                  <TouchableOpacity
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={tr.cancel}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <IconSymbol name="xmark" size={18} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.content}
              >

              {modalKey === 'water' && <>
                <ModalTitle title={tr.addWater} icon="drop.fill" color={ACCENT} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>КІЛЬКІСТЬ (МЛ)</Text>
                <TextInput placeholder="250" placeholderTextColor={k.text.muted} value={val} onChangeText={setVal}
                  accessibilityLabel={tr.addWater}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: c.text, backgroundColor: c.dim }]} />
                <Presets values={[150, 250, 350, 500]} val={val} setVal={setVal} color={ACCENT} c={c} />
              </>}

              {modalKey === 'calories' && <>
                <ModalTitle title={tr.calories} icon="flame.fill" color={ACCENT_CAL} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>КІЛОКАЛОРІЇ</Text>
                <TextInput placeholder="350" placeholderTextColor={k.text.muted} value={val} onChangeText={setVal}
                  accessibilityLabel={tr.calories}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: c.text, backgroundColor: c.dim }]} />
                <Presets values={[200, 350, 500, 700]} val={val} setVal={setVal} color={ACCENT_CAL} c={c} />
                <Text style={[s.label, { color: c.sub }]}>{tr.macrosOptional}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Macro label={tr.protein} value={prot} onChange={setProt} color={ACCENT_PROT} c={c} />
                  <Macro label={tr.fats} value={fat} onChange={setFat} color={ACCENT_MOOD} c={c} />
                  <Macro label={tr.carbs} value={carb} onChange={setCarb} color={ACCENT_STEPS} c={c} />
                </View>
                <Text style={[s.label, { color: c.sub }]}>НОТАТКА (страва)</Text>
                <TextInput placeholder="Обід, гречка з куркою" placeholderTextColor={k.text.muted} value={note} onChangeText={setNote}
                  accessibilityLabel={tr.note}
                  style={[s.noteInput, { color: c.text, backgroundColor: c.dim }]} />
              </>}

              {modalKey === 'weight' && <>
                <ModalTitle title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>ВАГА (КГ)</Text>
                <TextInput placeholder="70.5" placeholderTextColor={k.text.muted} value={val} onChangeText={setVal}
                  accessibilityLabel={tr.weight}
                  keyboardType="decimal-pad" autoFocus
                  style={[s.bigInput, { color: c.text, backgroundColor: c.dim }]} />
              </>}

              {modalKey === 'sleep' && <>
                <ModalTitle title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>ТРИВАЛІСТЬ</Text>
                <View style={[s.durBlock, { backgroundColor: c.dim }]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput placeholder="7" placeholderTextColor={k.text.muted} value={val} onChangeText={setVal}
                      accessibilityLabel={`${tr.sleep}, ${tr.hrs}`}
                      keyboardType="number-pad" autoFocus
                      style={{ color: c.text, fontSize: 44, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], textAlign: 'center', letterSpacing: -0.88 }} />
                    <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium }}>{tr.hrs}</Text>
                  </View>
                  <Text style={{ color: c.sub, fontSize: 30, fontFamily: fontFamily.light, alignSelf: 'center', marginBottom: 18 }}>:</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput placeholder="30" placeholderTextColor={k.text.muted} value={val2} onChangeText={setVal2}
                      accessibilityLabel={`${tr.sleep}, ${tr.mins}`}
                      keyboardType="number-pad"
                      style={{ color: c.text, fontSize: 44, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], textAlign: 'center', letterSpacing: -0.88 }} />
                    <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium }}>{tr.mins}</Text>
                  </View>
                </View>
                <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[360, 420, 480, 540].map(mins => (
                    <TouchableOpacity key={mins}
                      onPress={() => { setVal(String(Math.floor(mins / 60))); setVal2('00'); }}
                      accessibilityRole="button"
                      accessibilityLabel={`${Math.floor(mins / 60)} ${tr.hrs}`}
                      accessibilityState={{ selected: val === String(Math.floor(mins / 60)) }}
                      style={[s.presetBtn, { backgroundColor: val === String(Math.floor(mins / 60)) ? k.action.primary : c.dim }]}>
                      <Text style={{ color: val === String(Math.floor(mins / 60)) ? k.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{Math.floor(mins / 60)}г</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>}

              {modalKey === 'steps' && <>
                <ModalTitle title={tr.steps} icon="figure.walk" color={ACCENT_STEPS} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>КІЛЬКІСТЬ КРОКІВ</Text>
                <TextInput placeholder="5000" placeholderTextColor={k.text.muted} value={val} onChangeText={setVal}
                  accessibilityLabel={tr.steps}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: c.text, backgroundColor: c.dim }]} />
                <Presets values={[1000, 3000, 5000, 10000]} val={val} setVal={setVal} color={ACCENT_STEPS} c={c} fmt={st => (st >= 1000 ? `${st / 1000}т` : String(st))} />
              </>}

              {modalKey === 'pulse' && <>
                <ModalTitle title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>УДАРИ ЗА ХВИЛИНУ</Text>
                <TextInput placeholder="72" placeholderTextColor={k.text.muted} value={val} onChangeText={setVal}
                  accessibilityLabel={tr.pulse}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: c.text, backgroundColor: c.dim }]} />
                <Presets values={[60, 70, 80, 90]} val={val} setVal={setVal} color={ACCENT_PULSE} c={c} />
              </>}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
                <TouchableOpacity accessibilityRole="button" onPress={onClose} style={[s.btn, { ...gs.subtle, flex: 1 }]}>
                  <Text style={{ color: k.action.secondaryText, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSave }}
                  disabled={!canSave}
                  onPress={save}
                  style={[s.btn, {
                    flex: 2,
                    backgroundColor: canSave ? k.action.primary : k.state.disabledBg,
                  }]}
                >
                  <Text style={{ color: canSave ? k.text.onAction : k.state.disabledText, fontFamily: fontFamily.semibold }}>{tr.save}</Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Presets({ values, val, setVal, color, c, fmt }: {
  values: number[]; val: string; setVal: (s: string) => void; color: string; c: any; fmt?: (n: number) => string;
}) {
  const k = dsTokensFor(c);
  return (
    <>
      <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {values.map(v => (
          <TouchableOpacity key={v} onPress={() => setVal(String(v))}
            accessibilityRole="button"
            accessibilityLabel={String(fmt ? fmt(v) : v)}
            accessibilityState={{ selected: val === String(v) }}
            style={[s.presetBtn, { backgroundColor: val === String(v) ? k.action.primary : c.dim }]}>
            <Text style={{ color: val === String(v) ? k.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{fmt ? fmt(v) : v}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

function Macro({ label, value, onChange, color, c }: {
  label: string; value: string; onChange: (t: string) => void; color: string; c: any;
}) {
  const k = dsTokensFor(c);
  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="0" placeholderTextColor={k.text.muted} value={value} onChangeText={onChange} keyboardType="number-pad"
        accessibilityLabel={label}
        style={{ color: c.text, fontSize: 20, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], textAlign: 'center', borderRadius: 14, backgroundColor: c.dim, paddingVertical: 10, minHeight: 44 }} />
      {/* Колір макросу — тонкою позначкою під полем. */}
      <View style={{ alignSelf: 'center', width: 14, height: 3, borderRadius: 2, backgroundColor: color, marginTop: 6 }} />
      <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function ModalTitle({ title, icon, color, textColor }: { title: string; icon: any; color: string; textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={18} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 20, fontFamily: fontFamily.semibold }}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(17,17,19,0.40)' /* surface.overlay */, justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(); відсоток від батька з
  // height:auto не рахується і обмеження просто зникає (NAT-01).
  sheet:        { borderRadius: 24, padding: 24 },
  content:      { paddingBottom: 2 },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2 },
  label:        { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8, marginTop: 14 },
  // Великі тонкі цифри (display DS v2): Light 300, tabular-nums, tracking −2%.
  bigInput:     { fontSize: 48, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], textAlign: 'center', borderRadius: 16, paddingVertical: 16, letterSpacing: -0.96 },
  noteInput:    { fontSize: 14, fontFamily: fontFamily.regular, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 },
  durBlock:     { flexDirection: 'row', borderRadius: 16, padding: 16, alignItems: 'flex-start' },
  presetBtn:    { flex: 1, borderRadius: 999, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  btn:          { minHeight: 48, paddingVertical: 14, borderRadius: 999, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
