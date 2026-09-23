/**
 * components/training/SessionRunnerParts.tsx — частини виконавця сесії
 * (training-module.md §10.1): рядок підходу, таймер відпочинку, аркуш
 * завершення.
 *
 * Вага вводиться в кг із комою чи крапкою, але в стані — лише грами
 * (parseKgToG): обчислень у кілограмах немає ніде (§3.3).
 */
import React, { useEffect, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { formatKg, parseKgToG } from '@/utils/trainingSessions';
import type { LogSet, LogStatus } from '@/utils/trainingTypes';

import { Field, Notice, PrimaryButton } from './TrainingBits';
import { TrainingSheet } from './TrainingSheet';
import { fmt, TG_ACCENT, TG_OK, TG_XP, type TrainingColors } from './theme';

function NumberCell({ c, value, onCommit, label, width = 64, decimal }: {
  c: TrainingColors;
  value: string;
  onCommit: (text: string) => void;
  label: string;
  width?: number;
  decimal?: boolean;
}) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={() => onCommit(text)}
      onBlur={() => onCommit(text)}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      accessibilityLabel={label}
      selectTextOnFocus
      style={{
        width, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.input,
        color: c.text, fontSize: 16, fontWeight: '700', textAlign: 'center',
      }}
    />
  );
}

export function SetRow({ c, set, onChange, readOnly }: {
  c: TrainingColors;
  set: LogSet;
  onChange: (next: LogSet) => void;
  readOnly?: boolean;
}) {
  const { tr } = useI18n();
  const n = set.setIndex;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
      <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700', width: 64 }}>{fmt(tr.tgSetN, { n })}</Text>
      {readOnly ? (
        <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>
          {`${set.reps} × ${formatKg(set.weightG)} ${tr.tgUnitKg}${set.rpe ? ` · RPE ${set.rpe}` : ''}`}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
          <NumberCell
            c={c}
            value={String(set.reps)}
            label={`${fmt(tr.tgSetN, { n })}: ${tr.tgReps}`}
            onCommit={t => {
              const reps = Math.max(0, Math.trunc(Number(t) || 0));
              if (reps !== set.reps) onChange({ ...set, reps });
            }}
          />
          <NumberCell
            c={c}
            width={76}
            decimal
            value={formatKg(set.weightG)}
            label={`${fmt(tr.tgSetN, { n })}: ${tr.tgWeightKg}`}
            onCommit={t => {
              const g = parseKgToG(t);
              if (g !== null && g !== set.weightG) onChange({ ...set, weightG: g });
            }}
          />
          <NumberCell
            c={c}
            width={52}
            value={set.rpe ? String(set.rpe) : ''}
            label={`${fmt(tr.tgSetN, { n })}: ${tr.tgRpe}`}
            onCommit={t => {
              const v = Math.trunc(Number(t) || 0);
              const rpe = v >= 1 && v <= 10 ? v : null;
              if (rpe !== (set.rpe ?? null)) onChange({ ...set, rpe });
            }}
          />
        </View>
      )}
      <TouchableOpacity
        disabled={readOnly}
        onPress={() => onChange({ ...set, done: !set.done })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: set.done, disabled: !!readOnly }}
        accessibilityLabel={set.done ? fmt(tr.tgSetDone, { n }) : fmt(tr.tgSetNotDone, { n })}
        style={{
          width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: set.done ? TG_OK : c.chip, borderWidth: 1, borderColor: set.done ? TG_OK : c.border,
        }}>
        {set.done ? <IconSymbol name="checkmark" size={18} color="#fff" /> : null}
      </TouchableOpacity>
    </View>
  );
}

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Таймер відпочинку: рахує до `endsAt` (мс), а не від тиків — фон не збиває. */
export function RestTimerBar({ c, endsAt, onAdd, onSkip, onDone }: {
  c: TrainingColors;
  endsAt: number;
  onAdd: () => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const { tr } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = (endsAt - now) / 1000;
  useEffect(() => { if (left <= 0) onDone(); }, [left, onDone]);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16,
        backgroundColor: c.isDark ? '#1C2A3A' : '#E0F2FE', borderWidth: 1, borderColor: TG_ACCENT + '66',
      }}>
      <IconSymbol name="timer" size={20} color={TG_ACCENT} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.tgRestTimer}</Text>
        <Text accessibilityLabel={`${tr.tgRestTimer} ${mmss(left)}`} style={{ color: c.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {mmss(left)}
        </Text>
      </View>
      <PrimaryButton label={tr.tgAddRest} variant="soft" onPress={onAdd} />
      <PrimaryButton label={tr.tgSkipRest} onPress={onSkip} />
    </View>
  );
}

export function ElapsedClock({ c, startedAt }: { c: TrainingColors; startedAt: string | null }) {
  const { tr } = useI18n();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = startedAt ? (now - new Date(startedAt).getTime()) / 1000 : 0;
  const h = Math.floor(sec / 3600);
  const label = h > 0 ? `${h}:${mmss(sec - h * 3600).padStart(5, '0')}` : mmss(sec);
  return (
    <Text accessibilityLabel={`${tr.tgElapsed} ${label}`} style={{ color: c.sub, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
      {`⏱ ${label}`}
    </Text>
  );
}

export interface FinishForm {
  durationMin: number;
  calories: number | null;
  memberNote: string;
}

export function FinishSheet({ c, visible, onClose, onConfirm, status, done, total, defaultMinutes, xpEstimate, busy }: {
  c: TrainingColors;
  visible: boolean;
  onClose: () => void;
  onConfirm: (form: FinishForm) => void;
  status: LogStatus;
  done: number;
  total: number;
  defaultMinutes: number;
  xpEstimate: number;
  busy?: boolean;
}) {
  const { tr } = useI18n();
  const [minutes, setMinutes] = useState('');
  const [calories, setCalories] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!visible) return;
    setMinutes(String(Math.max(1, defaultMinutes)));
    setCalories('');
    setNote('');
  }, [visible, defaultMinutes]);

  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={tr.tgFinishTitle}
      footer={(
        <>
          <PrimaryButton label={tr.cancel} variant="soft" onPress={onClose} style={{ flex: 1 }} />
          <PrimaryButton
            label={tr.tgFinish}
            busy={busy}
            color={TG_OK}
            onPress={() => onConfirm({
              durationMin: Math.max(0, Math.trunc(Number(minutes) || 0)),
              calories: Math.trunc(Number(calories) || 0) || null,
              memberNote: note,
            })}
            style={{ flex: 1 }}
          />
        </>
      )}>
      {status === 'completed' ? (
        <Text style={{ color: TG_XP, fontSize: 22, fontWeight: '800', marginBottom: 12 }}>{fmt(tr.tgXpEstimate, { n: xpEstimate })}</Text>
      ) : (
        <Notice c={c} text={fmt(tr.tgFinishPartial, { done, total })} />
      )}
      <Field c={c} label={tr.tgDurationMin} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
      <Field c={c} label={tr.tgCalories} value={calories} onChangeText={setCalories} keyboardType="number-pad" />
      <Field c={c} label={tr.tgMemberNote} value={note} onChangeText={setNote} multiline maxLength={1000} />
    </TrainingSheet>
  );
}
