/**
 * app/training/[groupId]/exercises.tsx — бібліотека вправ групи
 * (`training_exercises`, training-module.md §3.2). Тренер додає, редагує,
 * імпортує з особистих вправ (§7.3); учасник лише переглядає.
 *
 * Колекція навмисно НЕ `exercises`: той ключ — особиста бібліотека, і
 * злиття групової з особистою змішало б вправи тренера з вправами учасника.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary } from '@/components/training/hooks';
import { exercisesToImport, readPersonalExercises } from '@/components/training/importPersonal';
import { fmt, TG_ACCENT, TG_ERR, useTrainingColors } from '@/components/training/theme';
import { Card, EmptyState, Field, Notice, PrimaryButton, Stepper } from '@/components/training/TrainingBits';
import { TrainingSheet } from '@/components/training/TrainingSheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { newTrainingId } from '@/utils/trainingSync';
import type { TrainingExercise } from '@/utils/trainingTypes';

function ExerciseSheet({ visible, exercise, onClose, onSave, onDelete }: {
  visible: boolean;
  exercise: TrainingExercise | null;
  onClose: () => void;
  onSave: (ex: TrainingExercise) => void;
  onDelete?: () => void;
}) {
  const { tr } = useI18n();
  const c = useTrainingColors();
  const [draft, setDraft] = useState<TrainingExercise | null>(exercise);
  useEffect(() => { if (visible) setDraft(exercise); }, [visible, exercise]);
  if (!draft) return null;
  return (
    <TrainingSheet
      visible={visible}
      onClose={onClose}
      c={c}
      title={draft.name || tr.tgNewExercise}
      footer={(
        <>
          {onDelete ? <PrimaryButton label={tr.delete} variant="soft" color={TG_ERR} onPress={onDelete} style={{ flex: 1 }} /> : null}
          <PrimaryButton label={tr.save} disabled={!draft.name.trim()} onPress={() => onSave({ ...draft, name: draft.name.trim() })} style={{ flex: 1 }} />
        </>
      )}>
      <Field c={c} label={tr.tgExerciseName} value={draft.name} onChangeText={name => setDraft({ ...draft, name })} maxLength={200} />
      <Field c={c} label={tr.tgMuscleGroup} value={draft.muscleGroup ?? ''} onChangeText={muscleGroup => setDraft({ ...draft, muscleGroup })} maxLength={80} />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <Stepper c={c} label={tr.tgSets} value={draft.defaultSets ?? 3} min={1} max={20} onChange={defaultSets => setDraft({ ...draft, defaultSets })} />
        <Stepper c={c} label={tr.tgReps} value={draft.defaultReps ?? 10} min={1} max={100} onChange={defaultReps => setDraft({ ...draft, defaultReps })} />
      </View>
      <Stepper c={c} label={tr.tgRestSec} value={draft.defaultRestSec ?? 90} step={15} max={600} onChange={defaultRestSec => setDraft({ ...draft, defaultRestSec })} />
    </TrainingSheet>
  );
}

export default function GroupExercisesScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const isCoach = (stream.role ?? group?.role) === 'coach';
  const [editing, setEditing] = useState<TrainingExercise | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);

  const exercises = stream.list<TrainingExercise>('training_exercises').sort((a, b) => a.name.localeCompare(b.name));
  const exists = (id: string) => exercises.some(e => e.id === id);

  const save = useCallback(async (ex: TrainingExercise) => {
    setEditing(null);
    await stream.write('training_exercises', ex.id, ex as unknown as Record<string, unknown>);
  }, [stream]);

  const remove = useCallback((ex: TrainingExercise) => {
    Alert.alert(tr.delete, ex.name, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => { setEditing(null); void stream.remove('training_exercises', ex.id); } },
    ]);
  }, [stream, tr]);

  const importMine = useCallback(async () => {
    const personal = await readPersonalExercises();
    if (personal === null) { setNotice({ text: tr.loadErrorBody, tone: 'error' }); return; }
    const fresh = exercisesToImport(personal, exercises);
    if (!fresh.length) { setNotice({ text: tr.tgNothingToImport, tone: 'info' }); return; }
    for (const ex of fresh) await stream.write('training_exercises', ex.id, ex as unknown as Record<string, unknown>);
    setNotice({ text: fmt(tr.tgImportedExercises, { n: fresh.length }), tone: 'info' });
  }, [exercises, stream, tr]);

  return (
    <GroupScreenShell
      c={c}
      title={tr.tgExercises}
      groupId={groupId}
      groupName={group?.name}
      issue={stream.issue}
      gone={stream.gone}
      onRefresh={() => { void stream.sync(); }}
      refreshing={stream.syncing}>
      {notice ? <Notice c={c} text={notice.text} tone={notice.tone} /> : null}
      {stream.loaded && !exercises.length ? <EmptyState c={c} icon="dumbbell.fill" title={tr.tgNoExercises} /> : null}
      {exercises.length ? (
        <Card c={c}>
          {exercises.map((ex, i) => (
            <TouchableOpacity
              key={ex.id}
              disabled={!isCoach}
              onPress={() => setEditing(ex)}
              accessibilityRole={isCoach ? 'button' : 'text'}
              accessibilityLabel={ex.name}
              style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
              <IconSymbol name="dumbbell.fill" size={16} color={TG_ACCENT} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{ex.name}</Text>
                <Text style={{ color: c.sub, fontSize: 12 }}>
                  {[ex.muscleGroup, `${ex.defaultSets ?? 3}×${ex.defaultReps ?? 10}`, ex.defaultRestSec ? `${ex.defaultRestSec} s` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {isCoach ? <IconSymbol name="pencil" size={14} color={c.faint} /> : null}
            </TouchableOpacity>
          ))}
        </Card>
      ) : null}
      {isCoach ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <PrimaryButton
            label={tr.tgNewExercise}
            icon="plus"
            onPress={() => setEditing({ id: newTrainingId('te'), name: '', defaultSets: 3, defaultReps: 10, defaultRestSec: 90, equipment: 'other', videoUrl: null })}
          />
          <PrimaryButton label={tr.tgImportExercises} icon="square.and.arrow.down" variant="soft" onPress={() => { void importMine(); }} />
        </View>
      ) : null}
      <ExerciseSheet
        visible={!!editing}
        exercise={editing}
        onClose={() => setEditing(null)}
        onSave={ex => { void save(ex); }}
        onDelete={editing && exists(editing.id) ? () => remove(editing) : undefined}
      />
    </GroupScreenShell>
  );
}
