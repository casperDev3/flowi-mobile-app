import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  ACCENT, ACCENT_CAL, ACCENT_MOOD, ACCENT_PROT, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT,
  ModalKey, getHealthColors,
} from '@/utils/healthTheme';
import { EntryType } from '@/utils/healthUtils';

export interface NewEntryPayload {
  type: EntryType; value: number; note?: string;
  protein?: number; fat?: number; carbs?: number;
}

const KEY_COLOR: Record<ModalKey, string> = {
  water: ACCENT, calories: ACCENT_CAL, weight: ACCENT_WEIGHT, steps: ACCENT_STEPS, pulse: ACCENT_PULSE, sleep: ACCENT_SLEEP,
};

export function HealthEntryModal({ modalKey, onClose, onSubmit, isDark, tr }: {
  modalKey: ModalKey | null;
  onClose: () => void;
  onSubmit: (e: NewEntryPayload) => void;
  isDark: boolean;
  tr: any;
}) {
  const c = getHealthColors(isDark);
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

  const save = () => {
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
        <Pressable style={s.overlay} onPress={onClose}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
              style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>

              {modalKey === 'water' && <>
                <ModalTitle title={tr.addWater} icon="drop.fill" color={ACCENT} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>КІЛЬКІСТЬ (МЛ)</Text>
                <TextInput placeholder="250" placeholderTextColor={c.sub} value={val} onChangeText={setVal}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: ACCENT, borderColor: ACCENT + '40', backgroundColor: ACCENT + '10' }]} />
                <Presets values={[150, 250, 350, 500]} val={val} setVal={setVal} color={ACCENT} c={c} />
              </>}

              {modalKey === 'calories' && <>
                <ModalTitle title={tr.calories} icon="flame.fill" color={ACCENT_CAL} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>КІЛОКАЛОРІЇ</Text>
                <TextInput placeholder="350" placeholderTextColor={c.sub} value={val} onChangeText={setVal}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: ACCENT_CAL, borderColor: ACCENT_CAL + '40', backgroundColor: ACCENT_CAL + '10' }]} />
                <Presets values={[200, 350, 500, 700]} val={val} setVal={setVal} color={ACCENT_CAL} c={c} />
                <Text style={[s.label, { color: c.sub }]}>{tr.macrosOptional}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Macro label={tr.protein} value={prot} onChange={setProt} color={ACCENT_PROT} c={c} />
                  <Macro label={tr.fats} value={fat} onChange={setFat} color={ACCENT_MOOD} c={c} />
                  <Macro label={tr.carbs} value={carb} onChange={setCarb} color={ACCENT_STEPS} c={c} />
                </View>
                <Text style={[s.label, { color: c.sub }]}>НОТАТКА (страва)</Text>
                <TextInput placeholder="Обід, гречка з куркою…" placeholderTextColor={c.sub} value={note} onChangeText={setNote}
                  style={[s.noteInput, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
              </>}

              {modalKey === 'weight' && <>
                <ModalTitle title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>ВАГА (КГ)</Text>
                <TextInput placeholder="70.5" placeholderTextColor={c.sub} value={val} onChangeText={setVal}
                  keyboardType="decimal-pad" autoFocus
                  style={[s.bigInput, { color: ACCENT_WEIGHT, borderColor: ACCENT_WEIGHT + '40', backgroundColor: ACCENT_WEIGHT + '10' }]} />
              </>}

              {modalKey === 'sleep' && <>
                <ModalTitle title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>ТРИВАЛІСТЬ</Text>
                <View style={[s.durBlock, { backgroundColor: ACCENT_SLEEP + '12', borderColor: ACCENT_SLEEP + '30' }]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput placeholder="7" placeholderTextColor={c.sub} value={val} onChangeText={setVal}
                      keyboardType="number-pad" autoFocus
                      style={{ color: ACCENT_SLEEP, fontSize: 38, fontWeight: '800', textAlign: 'center', letterSpacing: -1 }} />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.hrs}</Text>
                  </View>
                  <Text style={{ color: c.sub, fontSize: 30, fontWeight: '200', alignSelf: 'center', marginBottom: 18 }}>:</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput placeholder="30" placeholderTextColor={c.sub} value={val2} onChangeText={setVal2}
                      keyboardType="number-pad"
                      style={{ color: ACCENT_SLEEP, fontSize: 38, fontWeight: '800', textAlign: 'center', letterSpacing: -1 }} />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.mins}</Text>
                  </View>
                </View>
                <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[360, 420, 480, 540].map(mins => (
                    <TouchableOpacity key={mins}
                      onPress={() => { setVal(String(Math.floor(mins / 60))); setVal2('00'); }}
                      style={[s.presetBtn, { borderColor: ACCENT_SLEEP + '40', backgroundColor: val === String(Math.floor(mins / 60)) ? ACCENT_SLEEP + '25' : c.dim }]}>
                      <Text style={{ color: ACCENT_SLEEP, fontSize: 13, fontWeight: '700' }}>{Math.floor(mins / 60)}г</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>}

              {modalKey === 'steps' && <>
                <ModalTitle title={tr.steps} icon="figure.walk" color={ACCENT_STEPS} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>КІЛЬКІСТЬ КРОКІВ</Text>
                <TextInput placeholder="5000" placeholderTextColor={c.sub} value={val} onChangeText={setVal}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: ACCENT_STEPS, borderColor: ACCENT_STEPS + '40', backgroundColor: ACCENT_STEPS + '10' }]} />
                <Presets values={[1000, 3000, 5000, 10000]} val={val} setVal={setVal} color={ACCENT_STEPS} c={c} fmt={st => (st >= 1000 ? `${st / 1000}т` : String(st))} />
              </>}

              {modalKey === 'pulse' && <>
                <ModalTitle title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
                <Text style={[s.label, { color: c.sub }]}>УДАРИ ЗА ХВИЛИНУ</Text>
                <TextInput placeholder="72" placeholderTextColor={c.sub} value={val} onChangeText={setVal}
                  keyboardType="number-pad" autoFocus
                  style={[s.bigInput, { color: ACCENT_PULSE, borderColor: ACCENT_PULSE + '40', backgroundColor: ACCENT_PULSE + '10' }]} />
                <Presets values={[60, 70, 80, 90]} val={val} setVal={setVal} color={ACCENT_PULSE} c={c} />
              </>}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
                <TouchableOpacity onPress={onClose} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                  <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={save}
                  style={[s.btn, { flex: 2, backgroundColor: modalKey ? KEY_COLOR[modalKey] : ACCENT }]}>
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

function Presets({ values, val, setVal, color, c, fmt }: {
  values: number[]; val: string; setVal: (s: string) => void; color: string; c: any; fmt?: (n: number) => string;
}) {
  return (
    <>
      <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {values.map(v => (
          <TouchableOpacity key={v} onPress={() => setVal(String(v))}
            style={[s.presetBtn, { borderColor: color + '40', backgroundColor: val === String(v) ? color + '25' : c.dim }]}>
            <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{fmt ? fmt(v) : v}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}

function Macro({ label, value, onChange, color, c }: {
  label: string; value: string; onChange: (t: string) => void; color: string; c: any;
}) {
  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="0" placeholderTextColor={c.sub} value={value} onChangeText={onChange} keyboardType="number-pad"
        style={{ color, fontSize: 18, fontWeight: '800', textAlign: 'center', borderRadius: 12, borderWidth: 1, borderColor: color + '40', backgroundColor: color + '10', paddingVertical: 10 }} />
      <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function ModalTitle({ title, icon, color, textColor }: { title: string; icon: any; color: string; textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={18} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 20, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2 },
  label:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  bigInput:     { fontSize: 36, fontWeight: '800', textAlign: 'center', borderRadius: 16, borderWidth: 1.5, paddingVertical: 16, letterSpacing: -1 },
  noteInput:    { fontSize: 14, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  durBlock:     { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start' },
  presetBtn:    { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  btn:          { paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
