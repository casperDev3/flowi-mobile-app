/**
 * app/training/[groupId]/programs.tsx — програми групи (training-module.md
 * §10.1): тренер пише, учасник читає; на планшеті — дві колонки
 * (MasonryColumns). Тренеру — «Імпортувати мою програму» (§7.3).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { MasonryColumns } from '@/components/shared/MasonryColumns';
import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary } from '@/components/training/hooks';
import { importProgramPlan, readPersonalExercises, readPersonalPrograms } from '@/components/training/importPersonal';
import { trainingRoutes } from '@/components/training/routes';
import { fmt, TG_ACCENT, useTrainingColors } from '@/components/training/theme';
import { Badge, Card, EmptyState, Notice, PrimaryButton } from '@/components/training/TrainingBits';
import { TrainingSheet } from '@/components/training/TrainingSheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import type { PersonalProgram } from '@/utils/trainingPrograms';
import { newTrainingId } from '@/utils/trainingSync';
import type { TrainingAssignment, TrainingExercise, TrainingProgram } from '@/utils/trainingTypes';
import { trainingDays } from '@/utils/trainingXp';

export default function ProgramsScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { isWide } = useResponsive();
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const isCoach = (stream.role ?? group?.role) === 'coach';
  const [importOpen, setImportOpen] = useState(false);
  const [personal, setPersonal] = useState<PersonalProgram[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const programs = stream.list<TrainingProgram>('training_programs').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const assignments = stream.list<TrainingAssignment>('training_assignments');
  const exercises = stream.list<TrainingExercise>('training_exercises');

  const openImport = useCallback(async () => {
    const list = await readPersonalPrograms();
    if (list === null) { setNotice(tr.loadErrorBody); return; }
    setPersonal(list);
    setImportOpen(true);
  }, [tr]);

  const doImport = useCallback(async (p: PersonalProgram) => {
    setImportOpen(false);
    const personalEx = await readPersonalExercises();
    if (personalEx === null) { setNotice(tr.loadErrorBody); return; }
    const plan = importProgramPlan(p, personalEx, exercises);
    for (const ex of plan.exercises) {
      await stream.write('training_exercises', ex.id, ex as unknown as Record<string, unknown>);
    }
    await stream.write('training_programs', plan.program.id, plan.program as unknown as Record<string, unknown>);
    setTimeout(() => router.push(trainingRoutes.program(groupId, plan.program.id)), 250);
  }, [exercises, stream, router, groupId, tr]);

  const cards = programs.map(p => {
    const days = trainingDays(p).length;
    const active = assignments.filter(a => a.programId === p.id && a.status === 'active').length;
    return {
      key: p.id,
      node: (
        <TouchableOpacity
          onPress={() => router.push(trainingRoutes.program(groupId, p.id))}
          accessibilityRole="button"
          accessibilityLabel={p.name}
          style={{ marginBottom: 10 }}>
          <Card c={c} accent={p.color}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, alignSelf: 'stretch', borderRadius: 5, backgroundColor: p.color || TG_ACCENT }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }} numberOfLines={2}>{p.name}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4 }}>
                  {`${fmt(tr.tgWeeks, { n: p.weekCount })} · ${fmt(tr.tgDaysPerWeek, { n: days })}`}
                </Text>
              </View>
              {isCoach && active ? <Badge label={`${tr.tgAssignments}: ${active}`} color={TG_ACCENT} /> : null}
              <IconSymbol name="chevron.right" size={14} color={c.faint} />
            </View>
          </Card>
        </TouchableOpacity>
      ),
    };
  });

  return (
    <GroupScreenShell
      c={c}
      title={tr.tgPrograms}
      groupId={groupId}
      groupName={group?.name}
      issue={stream.issue}
      gone={stream.gone}
      onRefresh={() => { void stream.sync(); }}
      refreshing={stream.syncing}>
      {notice ? <Notice c={c} text={notice} tone="error" /> : null}
      {stream.loaded && !programs.length ? (
        <EmptyState c={c} icon="list.bullet.clipboard" title={tr.tgNoPrograms} body={isCoach ? tr.tgNoPlanCoach : tr.tgNoProgramsMember} />
      ) : (
        <MasonryColumns items={cards} columnCount={isWide ? 2 : 1} />
      )}
      {isCoach ? (
        <View style={{ gap: 10, marginTop: 8 }}>
          <PrimaryButton
            label={tr.tgNewProgram}
            icon="plus"
            onPress={() => router.push(trainingRoutes.program(groupId, newTrainingId('tp')))}
          />
          <PrimaryButton label={tr.tgImportProgram} icon="square.and.arrow.down" variant="soft" onPress={() => { void openImport(); }} />
        </View>
      ) : null}

      <TrainingSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        c={c}
        title={tr.tgImportProgram}
        footer={<PrimaryButton label={tr.cancel} variant="soft" onPress={() => setImportOpen(false)} style={{ flex: 1 }} />}>
        {personal && personal.length === 0 ? <Text style={{ color: c.sub }}>{tr.tgNoPrograms}</Text> : null}
        {(personal ?? []).map(p => (
          <TouchableOpacity
            key={p.id}
            onPress={() => { void doImport(p); }}
            accessibilityRole="button"
            accessibilityLabel={p.name}
            style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: p.color || TG_ACCENT }} />
            <Text style={{ color: c.text, fontSize: 15, flex: 1 }}>{p.name}</Text>
            <Text style={{ color: c.sub, fontSize: 12 }}>{fmt(tr.tgExercisesCount, { n: p.exerciseIds.length })}</Text>
          </TouchableOpacity>
        ))}
      </TrainingSheet>
    </GroupScreenShell>
  );
}
