/**
 * app/training/[groupId]/program/[programId].tsx — конструктор програми
 * (training-module.md §3.3, §5, §10.1): тижневий шаблон (7 днів × блоки),
 * кількість тижнів, прогресія, прев'ю «тиждень 1 / 4 / 8» з реальними
 * числами; призначення учасникам і керування призначеннями.
 *
 * Тренер пише, учасник лише читає. Програма зберігається в потік групи
 * (`training_programs`); розгортає її в календар учасника СЕРВЕР при
 * `POST …/assign/` — клієнт прогресію для сесій не рахує (§4.2).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary, useTrainingScope } from '@/components/training/hooks';
import {
  AssignSheet,
  BlockEditorSheet,
  ExercisePickerSheet,
  progressionSummary,
  ProgressionPreview,
} from '@/components/training/ProgramEditorParts';
import { fmt, TG_ACCENT, TG_ERR, TG_WARN, useTrainingColors } from '@/components/training/theme';
import { Badge, Card, Chip, Field, Notice, PrimaryButton, SectionTitle, Stepper } from '@/components/training/TrainingBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import {
  assignProgram,
  isOffline,
  listTrainingMembers,
  reexpandAssignment,
  revokeAssignment,
  trainingErrorCode,
} from '@/utils/trainingApi';
import {
  addBlock,
  assignmentNeedsReexpand,
  blockFromExercise,
  emptyProgram,
  ensureDay,
  MAX_WEEKS,
  moveBlock,
  normalizeProgram,
  PROGRAM_COLORS,
  removeBlock,
  removeDay,
  replaceBlock,
  setDay,
  sortedBlocks,
  validateProgram,
} from '@/utils/trainingPrograms';
import { dayKeyInZone, formatKg } from '@/utils/trainingSessions';
import { isPending } from '@/utils/trainingStream';
import { newTrainingId, syncGroup } from '@/utils/trainingSync';
import type {
  ProgramBlock,
  TrainingAssignment,
  TrainingExercise,
  TrainingMember,
  TrainingProgram,
} from '@/utils/trainingTypes';

/** Порядок днів у шаблоні: з понеділка, як `tr.weekdays`. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function ProgramEditorScreen() {
  const { groupId = '', programId = '' } = useLocalSearchParams<{ groupId: string; programId: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { scope, online } = useTrainingScope();
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const isCoach = (stream.role ?? group?.role) === 'coach';
  const today = dayKeyInZone(new Date(), group?.timezone);

  const stored = stream.get<TrainingProgram>('training_programs', programId);
  const [program, setProgram] = useState<TrainingProgram>(() => emptyProgram(programId));
  const [dirty, setDirty] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [editing, setEditing] = useState<{ index: number; block: ProgramBlock } | null>(null);
  const [picker, setPicker] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [members, setMembers] = useState<TrainingMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' | 'warn' } | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Серверна версія переписує форму лише доки людина нічого не змінила.
  useEffect(() => {
    if (stored && !dirty) setProgram(normalizeProgram(stored, programId));
  }, [stored, dirty, programId]);

  const loadMembers = useCallback(async () => {
    if (!online || !groupId) return;
    try { setMembers(await listTrainingMembers(groupId)); } catch (e) {
      if (__DEV__) console.warn('[training] members failed', e);
    }
  }, [online, groupId]);
  useFocusEffect(useCallback(() => { void loadMembers(); }, [loadMembers]));

  const exercises = stream.list<TrainingExercise>('training_exercises');
  const day = ensureDay(program, dayOfWeek);
  const blocks = sortedBlocks(day);

  const update = (next: TrainingProgram) => { setProgram(next); setDirty(true); };
  const updateDay = (nextDay: typeof day) => update(nextDay.blocks.length ? setDay(program, nextDay) : removeDay(program, nextDay.dayOfWeek));

  const issues = validateProgram(program);

  const save = useCallback(async () => {
    if (issues.length) {
      setMessage({ text: issues.includes('name') ? tr.tgProgramInvalidName : tr.tgProgramInvalidDays, tone: 'error' });
      return;
    }
    setMessage(null);
    const { updatedAt: _u, ...data } = program;
    await stream.write('training_programs', programId, { ...data, name: program.name.trim() } as unknown as Record<string, unknown>);
    setDirty(false);
  }, [issues, program, programId, stream, tr]);

  const createExercise = useCallback(async (name: string) => {
    const id = newTrainingId('te');
    const ex: TrainingExercise = { id, name, defaultSets: 3, defaultReps: 10, defaultRestSec: 90, equipment: 'other', videoUrl: null };
    await stream.write('training_exercises', id, ex as unknown as Record<string, unknown>);
    return ex;
  }, [stream]);

  const pick = useCallback((ex: TrainingExercise) => {
    setPicker(false);
    const b = blockFromExercise(ex, blocks.length + 1);
    updateDay(addBlock(day, b));
    // Одразу — у налаштування блоку, але після анімації закриття (NEW-02).
    setTimeout(() => setEditing({ index: blocks.length, block: b }), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.length, day, program]);

  const assignments = stream.list<TrainingAssignment>('training_assignments')
    .filter(a => a.programId === programId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const programRevision = stream.revision('training_programs', programId);
  const memberName = (id: number) => {
    const m = members.find(x => x.user.id === id);
    return m ? m.user.name || m.user.email : `#${id}`;
  };

  const explain = (e: unknown) => {
    if (isOffline(e)) return tr.tgOfflineNotice;
    const code = trainingErrorCode(e);
    if (code === 'program_not_found') return tr.tgSaveFirst;
    if (code === 'invalid_request') return tr.tgDateInvalid;
    return tr.tgErrorGeneric;
  };

  const doAssign = useCallback(async (userIds: number[], startDate: string, weekCount: number) => {
    setBusy('assign'); setAssignError(null);
    try {
      // Сервер має бачити програму: спершу дошлемо outbox.
      if (dirty) await save();
      const synced = await syncGroup(scope, groupId);
      if (isPending(synced, 'training_programs', programId)) { setAssignError(tr.tgSaveFirst); return; }
      const results = await assignProgram(groupId, programId, { user_ids: userIds, start_date: startDate, week_count: weekCount });
      const ok = results.filter(r => !r.error).length;
      setAssignOpen(false);
      setMessage({ text: fmt(tr.tgAssignDone, { n: ok }), tone: 'info' });
      void stream.sync();
    } catch (e) {
      setAssignError(explain(e));
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, save, scope, groupId, programId, stream, tr]);

  const revoke = (a: TrainingAssignment) => {
    Alert.alert(tr.tgRevoke, tr.tgRevokeConfirm, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.tgRevoke, style: 'destructive', onPress: async () => {
          setBusy(a.id);
          try { await revokeAssignment(groupId, a.id); await stream.sync(); } catch (e) {
            setMessage({ text: explain(e), tone: 'error' });
          } finally { setBusy(null); }
        },
      },
    ]);
  };

  const reexpand = async (a: TrainingAssignment) => {
    setBusy(a.id);
    try { await reexpandAssignment(groupId, a.id); await stream.sync(); } catch (e) {
      setMessage({ text: explain(e), tone: 'error' });
    } finally { setBusy(null); }
  };

  const deleteProgram = () => {
    Alert.alert(tr.tgDeleteProgram, fmt(tr.tgDeleteProgramConfirm, { name: program.name }), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          await stream.remove('training_programs', programId);
          router.back();
        },
      },
    ]);
  };

  const readOnly = !isCoach;
  const pending = isPending(stream.state, 'training_programs', programId);
  const hasAnyDay = useMemo(() => program.days.some(d => d.blocks.length), [program.days]);

  return (
    <GroupScreenShell
      c={c}
      title={program.name || tr.tgNewProgram}
      groupId={groupId}
      groupName={group?.name}
      issue={stream.issue}
      gone={stream.gone}
      onRefresh={() => { void stream.sync(); }}
      refreshing={stream.syncing}
      actions={isCoach && stored ? (
        <TouchableOpacity onPress={deleteProgram} accessibilityRole="button" accessibilityLabel={tr.tgDeleteProgram}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="trash" size={18} color={TG_ERR} />
        </TouchableOpacity>
      ) : undefined}>
      {message ? <Notice c={c} text={message.text} tone={message.tone} /> : null}
      {pending ? <Notice c={c} text={tr.tgSyncPending} tone="info" /> : null}

      <Card c={c}>
        {readOnly ? (
          <>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{program.name}</Text>
            <Text style={{ color: c.sub, fontSize: 13, marginTop: 4 }}>{fmt(tr.tgWeeks, { n: program.weekCount })}</Text>
            {program.notes ? <Text style={{ color: c.text, fontSize: 14, marginTop: 8 }}>{program.notes}</Text> : null}
          </>
        ) : (
          <>
            <Field c={c} label={tr.tgProgramName} value={program.name} onChangeText={name => update({ ...program, name })} maxLength={200} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {PROGRAM_COLORS.map(col => (
                <Chip key={col} c={c} label="●" color={col} active={program.color === col}
                  onPress={() => update({ ...program, color: col })} accessibilityLabel={`${tr.tgColor} ${col}`} />
              ))}
            </View>
            <Stepper c={c} label={tr.tgWeekCount} value={program.weekCount} min={1} max={MAX_WEEKS}
              onChange={weekCount => update({ ...program, weekCount })} />
            <View style={{ height: 12 }} />
            <Field c={c} label={tr.tgNotes} value={program.notes ?? ''} onChangeText={notes => update({ ...program, notes })} multiline maxLength={2000} />
          </>
        )}
      </Card>

      <SectionTitle c={c}>{tr.tgWeekTemplate}</SectionTitle>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {DAY_ORDER.map((dow, i) => {
          const d = program.days.find(x => x.dayOfWeek === dow);
          const active = dow === dayOfWeek;
          const training = !!d?.blocks.length;
          return (
            <TouchableOpacity
              key={dow}
              onPress={() => setDayOfWeek(dow)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${tr.weekdaysFull[i]}: ${training ? fmt(tr.tgExercisesCount, { n: d?.blocks.length ?? 0 }) : tr.tgRestDayShort}`}
              style={{
                flex: 1, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1,
                borderColor: active ? TG_ACCENT : c.border, backgroundColor: active ? TG_ACCENT + '1C' : c.card,
              }}>
              <Text style={{ color: active ? TG_ACCENT : c.sub, fontSize: 12, fontWeight: '800' }}>{tr.weekdays[i]}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: training ? (program.color || TG_ACCENT) : 'transparent', borderWidth: training ? 0 : 1, borderColor: c.border }} />
            </TouchableOpacity>
          );
        })}
      </View>

      <Card c={c} style={{ marginTop: 10 }}>
        {!readOnly ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field c={c} label={tr.tgDayTitle} value={day.title ?? ''} placeholder={tr.tgDayTitlePlaceholder}
              onChangeText={title => updateDay({ ...day, title })} style={{ flex: 1 }} />
            <Stepper c={c} label={tr.tgEstimatedMin} value={day.estimatedMin ?? 60} step={5} min={5} max={300}
              onChange={estimatedMin => updateDay({ ...day, estimatedMin })} />
          </View>
        ) : day.title ? <Text style={{ color: c.text, fontSize: 16, fontWeight: '800', marginBottom: 8 }}>{day.title}</Text> : null}

        {blocks.length === 0 ? (
          <Text style={{ color: c.sub, fontSize: 14, marginVertical: 6 }}>{tr.tgRestDayShort}</Text>
        ) : blocks.map((b, i) => (
          <View key={`${b.exerciseId}:${b.order}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
            <TouchableOpacity
              disabled={readOnly}
              onPress={() => setEditing({ index: i, block: b })}
              accessibilityRole="button"
              accessibilityLabel={`${b.name || b.exerciseId}, ${b.sets}×${b.reps}`}
              style={{ flex: 1, paddingVertical: 8 }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{`${i + 1}. ${b.name || b.exerciseId}`}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                {`${b.sets}×${b.reps} · ${formatKg(b.weightG)} ${tr.tgUnitKg}${b.restSec ? ` · ${b.restSec} s` : ''} · ${progressionSummary(tr, b.progression)}`}
              </Text>
            </TouchableOpacity>
            {!readOnly ? (
              <>
                <TouchableOpacity onPress={() => updateDay(moveBlock(day, i, -1))} disabled={i === 0} accessibilityRole="button" accessibilityLabel={tr.tgMoveUp}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.3 : 1 }}>
                  <IconSymbol name="arrow.up" size={15} color={c.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => updateDay(moveBlock(day, i, 1))} disabled={i === blocks.length - 1} accessibilityRole="button" accessibilityLabel={tr.tgMoveDown}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === blocks.length - 1 ? 0.3 : 1 }}>
                  <IconSymbol name="arrow.down" size={15} color={c.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => updateDay(removeBlock(day, i))} accessibilityRole="button" accessibilityLabel={`${tr.tgRemove}: ${b.name}`}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="xmark" size={15} color={TG_ERR} />
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ))}

        {!readOnly ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <PrimaryButton label={tr.tgAddExercise} icon="plus" variant="soft" onPress={() => setPicker(true)} style={{ flex: 1 }} />
            {blocks.length ? (
              <PrimaryButton label={tr.tgRemoveDay} variant="soft" color={c.sub} onPress={() => update(removeDay(program, dayOfWeek))} style={{ flex: 1 }} />
            ) : null}
          </View>
        ) : null}
      </Card>

      {blocks.length ? (
        <>
          <SectionTitle c={c}>{tr.tgPreview}</SectionTitle>
          <Card c={c}><ProgressionPreview c={c} program={program} day={day} /></Card>
        </>
      ) : null}

      {isCoach ? (
        <View style={{ gap: 10, marginTop: 16 }}>
          <PrimaryButton label={tr.save} icon="checkmark" onPress={() => { void save(); }} disabled={!dirty} />
          <PrimaryButton
            label={tr.tgAssign}
            icon="calendar.badge.plus"
            variant="soft"
            disabled={!hasAnyDay || !online}
            onPress={() => { setAssignError(null); void loadMembers(); setAssignOpen(true); }}
          />
        </View>
      ) : null}

      {isCoach && assignments.length ? (
        <>
          <SectionTitle c={c}>{tr.tgAssignments}</SectionTitle>
          {assignments.map(a => {
            const stale = assignmentNeedsReexpand(a, programRevision);
            return (
              <Card key={a.id} c={c} style={{ marginBottom: 8 }} accent={stale ? TG_WARN : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{memberName(Number(a.userId))}</Text>
                    <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                      {`${a.startDate} · ${fmt(tr.tgWeeks, { n: a.weekCount })}${a.sessionCount ? ` · ${a.sessionCount}` : ''}`}
                    </Text>
                  </View>
                  <Badge label={a.status} color={a.status === 'active' ? TG_ACCENT : c.sub} />
                </View>
                {a.status === 'active' ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    {stale ? (
                      <PrimaryButton label={tr.tgReexpand} color={TG_WARN} busy={busy === a.id} onPress={() => { void reexpand(a); }} style={{ flex: 1 }} />
                    ) : null}
                    <PrimaryButton label={tr.tgRevoke} variant="soft" color={TG_ERR} onPress={() => revoke(a)} style={{ flex: 1 }} />
                  </View>
                ) : null}
                {stale ? <Text style={{ color: TG_WARN, fontSize: 12, marginTop: 6 }}>{tr.tgReexpandHint}</Text> : null}
              </Card>
            );
          })}
        </>
      ) : null}

      <ExercisePickerSheet
        c={c}
        visible={picker}
        exercises={exercises}
        onClose={() => setPicker(false)}
        onPick={pick}
        onCreate={name => { void createExercise(name).then(pick); }}
      />
      <BlockEditorSheet
        c={c}
        visible={!!editing}
        block={editing?.block ?? null}
        onClose={() => setEditing(null)}
        onSave={b => {
          if (editing) updateDay(replaceBlock(day, editing.index, b));
          setEditing(null);
        }}
      />
      <AssignSheet
        c={c}
        visible={assignOpen}
        onClose={() => setAssignOpen(false)}
        program={program}
        members={members}
        today={today}
        busy={busy === 'assign'}
        error={assignError}
        onAssign={(ids, start, weeks) => { void doAssign(ids, start, weeks); }}
      />
    </GroupScreenShell>
  );
}
