/**
 * components/training/ProgramEditorParts.tsx — частини конструктора програми
 * (training-module.md §3.3, §5, §6.3): аркуш блоку з прогресією, вибір
 * вправи, аркуш призначення, прев'ю навантаження по тижнях.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { blockPreview, previewWeekIndexes, sessionCount } from '@/utils/trainingPrograms';
import { formatKg, parseKgToG } from '@/utils/trainingSessions';
import type { ProgramBlock, ProgramDay, TrainingExercise, TrainingMember, TrainingProgram } from '@/utils/trainingTypes';
import { addDays, type Progression, type ProgressionMode } from '@/utils/trainingXp';

import { Chip, Field, Notice, PrimaryButton, Stepper } from './TrainingBits';
import { TrainingSheet } from './TrainingSheet';
import { fmt, TG_ACCENT, type TrainingColors } from './theme';

export function progressionSummary(tr: Translations, p: Progression | undefined): string {
  const every = p?.everyWeeks && p.everyWeeks > 1 ? ` / ${p.everyWeeks} ${tr.tgWeeks.replace('{n}', '').trim()}` : '';
  switch (p?.mode) {
    case 'linear_weight': return `+${formatKg(p.stepG ?? 0)} ${tr.tgUnitKg}${every}`;
    case 'linear_reps': return `+${p.stepReps ?? 0} ${tr.tgReps.toLowerCase()}${every}`;
    case 'percent': return `+${((p.percentBp ?? 0) / 100).toFixed(1)}%${every}`;
    default: return tr.tgProgNone;
  }
}

export function BlockEditorSheet({ c, visible, block, onClose, onSave }: {
  c: TrainingColors;
  visible: boolean;
  block: ProgramBlock | null;
  onClose: () => void;
  onSave: (b: ProgramBlock) => void;
}) {
  const { tr } = useI18n();
  const [draft, setDraft] = useState<ProgramBlock | null>(block);
  const [weight, setWeight] = useState('');
  const [stepKg, setStepKg] = useState('');
  const [capKg, setCapKg] = useState('');
  const [percent, setPercent] = useState('');

  useEffect(() => {
    if (!visible || !block) return;
    setDraft(block);
    setWeight(formatKg(block.weightG));
    setStepKg(formatKg(block.progression?.stepG ?? 2500));
    setCapKg(block.progression?.capG != null ? formatKg(block.progression.capG) : '');
    setPercent(block.progression?.percentBp != null ? String(block.progression.percentBp / 100) : '2.5');
  }, [visible, block]);

  if (!draft) return null;
  const p = draft.progression ?? { mode: 'none' };
  const mode = (p.mode ?? 'none') as ProgressionMode;
  const setP = (patch: Partial<Progression>) => setDraft({ ...draft, progression: { ...p, ...patch } });

  const save = () => {
    const weightG = parseKgToG(weight) ?? draft.weightG;
    const prog: Progression = { mode, everyWeeks: Math.max(1, p.everyWeeks ?? 1) };
    if (mode === 'linear_weight') {
      prog.stepG = parseKgToG(stepKg) ?? 0;
      const cap = capKg.trim() ? parseKgToG(capKg) : null;
      if (cap !== null) prog.capG = cap;
    } else if (mode === 'linear_reps') {
      prog.stepReps = Math.max(0, p.stepReps ?? 1);
      if (p.capReps != null) prog.capReps = p.capReps;
    } else if (mode === 'percent') {
      const pct = Number(percent.replace(',', '.'));
      prog.percentBp = Number.isFinite(pct) ? Math.round(pct * 100) : 0;
      const cap = capKg.trim() ? parseKgToG(capKg) : null;
      if (cap !== null) prog.capG = cap;
    }
    onSave({ ...draft, weightG, progression: mode === 'none' ? { mode: 'none' } : prog });
  };

  const modes: { key: ProgressionMode; label: string }[] = [
    { key: 'none', label: tr.tgProgNone },
    { key: 'linear_weight', label: tr.tgProgLinearWeight },
    { key: 'linear_reps', label: tr.tgProgLinearReps },
    { key: 'percent', label: tr.tgProgPercent },
  ];

  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={draft.name || tr.tgAddExercise}
      footer={(
        <>
          <PrimaryButton label={tr.cancel} variant="soft" onPress={onClose} style={{ flex: 1 }} />
          <PrimaryButton label={tr.save} onPress={save} style={{ flex: 1 }} />
        </>
      )}>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Stepper c={c} label={tr.tgSets} value={draft.sets} min={1} max={20} onChange={sets => setDraft({ ...draft, sets })} />
        <Stepper c={c} label={tr.tgReps} value={draft.reps} min={1} max={100} onChange={reps => setDraft({ ...draft, reps })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field c={c} label={tr.tgWeightKg} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Stepper
          c={c}
          label={tr.tgRestSec}
          value={draft.restSec ?? 0}
          step={15}
          max={600}
          onChange={restSec => setDraft({ ...draft, restSec })}
        />
      </View>

      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{tr.tgProgression}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {modes.map(m => (
          <Chip key={m.key} c={c} label={m.label} active={mode === m.key} onPress={() => setP({ mode: m.key })} />
        ))}
      </View>

      {mode === 'linear_weight' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field c={c} label={tr.tgStepKg} value={stepKg} onChangeText={setStepKg} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field c={c} label={tr.tgCapKg} value={capKg} onChangeText={setCapKg} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </View>
      ) : null}
      {mode === 'linear_reps' ? (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <Stepper c={c} label={tr.tgStepReps} value={p.stepReps ?? 1} min={0} max={20} onChange={stepReps => setP({ stepReps })} />
          <Stepper c={c} label={tr.tgCapReps} value={p.capReps ?? draft.reps + 10} min={1} max={200} onChange={capReps => setP({ capReps })} />
        </View>
      ) : null}
      {mode === 'percent' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field c={c} label={`${tr.tgPercent}, %`} value={percent} onChangeText={setPercent} keyboardType="decimal-pad" style={{ flex: 1 }} />
          <Field c={c} label={tr.tgCapKg} value={capKg} onChangeText={setCapKg} keyboardType="decimal-pad" style={{ flex: 1 }} />
        </View>
      ) : null}
      {mode !== 'none' ? (
        <Stepper c={c} label={tr.tgEveryWeeks} value={p.everyWeeks ?? 1} min={1} max={12} onChange={everyWeeks => setP({ everyWeeks })} />
      ) : null}
    </TrainingSheet>
  );
}

export function ExercisePickerSheet({ c, visible, exercises, onClose, onPick, onCreate }: {
  c: TrainingColors;
  visible: boolean;
  exercises: readonly TrainingExercise[];
  onClose: () => void;
  onPick: (ex: TrainingExercise) => void;
  onCreate: (name: string) => void;
}) {
  const { tr } = useI18n();
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) setQuery(''); }, [visible]);
  const q = query.trim().toLowerCase();
  const shown = exercises
    .filter(e => !q || e.name.toLowerCase().includes(q) || (e.muscleGroup ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={tr.tgPickExercise}
      footer={<PrimaryButton label={tr.cancel} variant="soft" onPress={onClose} style={{ flex: 1 }} />}>
      <Field c={c} label={tr.tgExerciseName} value={query} onChangeText={setQuery} placeholder={tr.tgExerciseName} />
      {shown.map(ex => (
        <TouchableOpacity
          key={ex.id}
          onPress={() => onPick(ex)}
          accessibilityRole="button"
          accessibilityLabel={ex.name}
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <IconSymbol name="dumbbell.fill" size={16} color={TG_ACCENT} />
          <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>{ex.name}</Text>
          {ex.muscleGroup ? <Text style={{ color: c.sub, fontSize: 12 }}>{ex.muscleGroup}</Text> : null}
        </TouchableOpacity>
      ))}
      {q && !shown.some(e => e.name.toLowerCase() === q) ? (
        <PrimaryButton
          label={`${tr.tgNewExercise}: ${query.trim()}`}
          icon="plus"
          variant="soft"
          onPress={() => onCreate(query.trim())}
          style={{ marginTop: 12 }}
        />
      ) : null}
      {!exercises.length && !q ? <Text style={{ color: c.sub, marginTop: 8 }}>{tr.tgNoExercises}</Text> : null}
    </TrainingSheet>
  );
}

/** Прев'ю «тиждень 1 / 4 / 8» з реальними числами прогресії (§10.1). */
export function ProgressionPreview({ c, program, day }: { c: TrainingColors; program: TrainingProgram; day: ProgramDay }) {
  const { tr } = useI18n();
  const weeks = previewWeekIndexes(program.weekCount);
  const blocks = [...day.blocks].sort((a, b) => a.order - b.order);
  if (!blocks.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ flex: 2, color: c.faint, fontSize: 12, fontWeight: '700' }} />
        {weeks.map(w => (
          <Text key={w} style={{ flex: 1, color: c.sub, fontSize: 12, fontWeight: '800', textAlign: 'right' }}>
            {fmt(tr.tgWeekN, { n: w + 1 })}
          </Text>
        ))}
      </View>
      {blocks.map(b => (
        <View key={`${b.exerciseId}:${b.order}`} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 2, color: c.text, fontSize: 13 }} numberOfLines={1}>{b.name || b.exerciseId}</Text>
          {weeks.map(w => {
            const v = blockPreview(b, w);
            return (
              <Text key={w} style={{ flex: 1, color: c.text, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                {`${v.reps}×${formatKg(v.weightG)}`}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function AssignSheet({ c, visible, onClose, program, members, today, busy, error, onAssign }: {
  c: TrainingColors;
  visible: boolean;
  onClose: () => void;
  program: TrainingProgram;
  members: readonly TrainingMember[];
  today: string;
  busy?: boolean;
  error?: string | null;
  onAssign: (userIds: number[], startDate: string, weekCount: number) => void;
}) {
  const { tr } = useI18n();
  const candidates = useMemo(() => members.filter(m => m.role === 'member'), [members]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [start, setStart] = useState(today);
  const [weeks, setWeeks] = useState(program.weekCount);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(candidates.map(m => m.user.id)));
    setStart(today);
    setWeeks(program.weekCount);
  }, [visible, candidates, today, program.weekCount]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= addDays(today, -14) && start <= addDays(today, 180);
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={tr.tgAssignTitle}
      footer={(
        <>
          <PrimaryButton label={tr.cancel} variant="soft" onPress={onClose} style={{ flex: 1 }} />
          <PrimaryButton
            label={tr.tgAssign}
            busy={busy}
            disabled={!selected.size || !validDate}
            onPress={() => onAssign([...selected], start, weeks)}
            style={{ flex: 1 }}
          />
        </>
      )}>
      {error ? <Notice c={c} text={error} tone="error" /> : null}
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 10 }}>{program.name}</Text>
      <Field c={c} label={tr.tgStartDate} value={start} onChangeText={setStart} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
      {!validDate ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -6, marginBottom: 10 }}>{tr.tgDateInvalid}</Text> : null}
      <Stepper c={c} label={tr.tgWeekCount} value={weeks} min={1} max={Math.min(52, program.weekCount)} onChange={setWeeks} />
      <Text style={{ color: c.sub, fontSize: 13, marginVertical: 10 }}>
        {fmt(tr.tgAssignSessions, { n: sessionCount(program, weeks) })}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.tgSelectMembers}</Text>
        <Chip
          c={c}
          label={tr.tgSelectAll}
          active={selected.size === candidates.length && candidates.length > 0}
          onPress={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map(m => m.user.id)))}
        />
      </View>
      {candidates.length === 0 ? <Text style={{ color: c.sub, marginTop: 8 }}>{tr.tgNoMembers}</Text> : null}
      {candidates.map(m => {
        const on = selected.has(m.user.id);
        return (
          <TouchableOpacity
            key={m.user.id}
            onPress={() => toggle(m.user.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={m.user.name || m.user.email}
            style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <IconSymbol name={on ? 'checkmark.circle.fill' : 'circle'} size={20} color={on ? TG_ACCENT : c.faint} />
            <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>{m.user.name || m.user.email}</Text>
          </TouchableOpacity>
        );
      })}
    </TrainingSheet>
  );
}
