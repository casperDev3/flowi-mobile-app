/**
 * app/training/session/[sessionId].tsx — виконавець сесії (training-module.md
 * §10.1): вправа за вправою, чекбокс підходу, поля повторів/ваги/RPE, таймер
 * відпочинку, «Завершити».
 *
 * Закриття пише три записи однією дією (§4.3, utils/trainingSessions.ts):
 * сесію (особистий `training_sessions`), звичайний `Workout` (журнал і
 * статистика, що вже працюють) і `workout_logs` у потік групи (бачить
 * тренер). Калорії, якщо людина їх ввела, живуть лише в тому одному
 * Workout — окремого `calories_out` немає, тож «Спалено» не подвоюється.
 *
 * Незавершене виконання — чернетка в локальному ключі (не синхронізується):
 * вихід з екрана чи перезапуск застосунку не губить відмічених підходів.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary, usePersonalSessions, useTrainingScope } from '@/components/training/hooks';
import { statusColor, statusLabel, formatSessionDate } from '@/components/training/SessionCards';
import {
  ElapsedClock,
  FinishSheet,
  RestTimerBar,
  SetRow,
  type FinishForm,
} from '@/components/training/SessionRunnerParts';
import { fmt, TG_ERR, useTrainingColors } from '@/components/training/theme';
import { Card, EmptyState, Notice, PrimaryButton, SectionTitle } from '@/components/training/TrainingBits';
import { useI18n } from '@/store/i18n';
import { loadData, removeData, saveData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { haptic } from '@/utils/haptics';
import {
  buildFinishRecords,
  countSets,
  durationMinutes,
  formatKg,
  initialActual,
  logIdForSession,
  statusFromSets,
  totalVolumeG,
} from '@/utils/trainingSessions';
import type { LogExercise, LogSet, LogStatus, TrainingGroupRecord, WorkoutLog } from '@/utils/trainingTypes';
import { awardXp, sessionBaseXp } from '@/utils/trainingXp';

interface Draft {
  startedAt: string | null;
  exercises: LogExercise[];
}

const draftKey = (sessionId: string) => `training_session_draft_v1:${sessionId}`;

export default function TrainingSessionScreen() {
  const { sessionId = '' } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { userId } = useTrainingScope();
  const sessionsApi = usePersonalSessions();
  const session = sessionsApi.all.find(s => s.id === sessionId) ?? null;
  const groupId = session?.groupId ?? '';
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftLoaded = useRef(false);

  const open = session?.status === 'planned';

  // Чернетку піднімаємо один раз, коли сесія вже прочитана.
  useEffect(() => {
    if (!session || draftLoaded.current) return;
    draftLoaded.current = true;
    if (!open) {
      setDraft({ startedAt: session.actual?.startedAt ?? null, exercises: session.actual?.exercises ?? [] });
      return;
    }
    loadData<Draft | null>(draftKey(session.id), null).then(saved => {
      setDraft(saved && Array.isArray(saved.exercises)
        ? saved
        : { startedAt: null, exercises: initialActual(session.plannedExercises) });
    }).catch(() => setDraft({ startedAt: null, exercises: initialActual(session.plannedExercises) }));
  }, [session, open]);

  const persist = useCallback((next: Draft) => {
    setDraft(next);
    if (open) saveData(draftKey(sessionId), next).catch(e => { if (__DEV__) console.warn('[training] draft save failed', e); });
  }, [open, sessionId]);

  const restFor = useCallback((exerciseId: string) => {
    const planned = session?.plannedExercises.find(p => p.exerciseId === exerciseId);
    return planned?.restSec && planned.restSec > 0 ? planned.restSec : 0;
  }, [session]);

  const changeSet = useCallback((exIndex: number, next: LogSet) => {
    if (!draft) return;
    const startedAt = draft.startedAt ?? new Date().toISOString();
    const prev = draft.exercises[exIndex].sets.find(s => s.setIndex === next.setIndex);
    const exercises = draft.exercises.map((ex, i) => (i !== exIndex ? ex : {
      ...ex, sets: ex.sets.map(s => (s.setIndex === next.setIndex ? next : s)),
    }));
    persist({ startedAt, exercises });
    if (next.done && !prev?.done) {
      haptic.success();
      const rest = restFor(draft.exercises[exIndex].exerciseId);
      if (rest) setRestEndsAt(Date.now() + rest * 1000);
    }
  }, [draft, persist, restFor]);

  const counts = draft ? countSets(draft.exercises) : { done: 0, total: 0 };
  const status: LogStatus = draft ? statusFromSets(draft.exercises) : 'skipped';
  const groupRecord = stream.get<TrainingGroupRecord>('training_groups', groupId);
  const xpEstimate = awardXp(sessionBaseXp(groupRecord?.xpRules), group?.streak_days ?? 0);
  const existingLog = stream.get<WorkoutLog>('workout_logs', logIdForSession(sessionId));

  const writeAll = useCallback(async (finalStatus: LogStatus, form: FinishForm | null) => {
    if (!session || !draft) return;
    if (userId === null) { setError(tr.tgOnlineOnly); return; }
    setBusy(true); setError(null);
    try {
      const completedAt = new Date().toISOString();
      const records = buildFinishRecords({
        session,
        exercises: draft.exercises,
        status: finalStatus,
        userId,
        startedAt: draft.startedAt,
        completedAt,
        durationMin: form?.durationMin ?? null,
        memberNote: form?.memberNote ?? null,
        calories: form?.calories ?? null,
        xpEstimate,
        // Нотатка тренера в уже наявному лозі — його, не наша: не затираємо.
        existingLog,
      });
      const log = records.log;

      await sessionsApi.update(fresh => fresh.map(s => (s.id === session.id ? records.session : s)));
      if (records.workout) {
        const workout = records.workout;
        await updateSynced<{ id: string }>('workouts', fresh => {
          const found = fresh.find(w => w.id === workout.id);
          return found
            ? fresh.map(w => (w.id === workout.id ? { ...w, ...workout } : w))
            : [...fresh, workout as { id: string }];
        });
      }
      await stream.write('workout_logs', log.id, log as unknown as Record<string, unknown>);
      await removeData(draftKey(session.id)).catch(() => undefined);
      haptic.success();
      router.back();
    } catch (e) {
      if (__DEV__) console.warn('[training] finish failed', e);
      setError(tr.tgErrorGeneric);
    } finally {
      setBusy(false);
    }
  }, [session, draft, userId, xpEstimate, existingLog, sessionsApi, stream, router, tr]);

  const confirmSkip = useCallback(() => {
    Alert.alert(tr.tgSkipSession, tr.tgSkipConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.tgSkipSession, style: 'destructive', onPress: () => { void writeAll('skipped', null); } },
    ]);
  }, [tr, writeAll]);

  const defaultMinutes = useMemo(
    () => (draft?.startedAt ? durationMinutes(draft.startedAt, new Date().toISOString()) : session?.estimatedMin ?? 0),
    // Пересчитуємо при відкритті аркуша, а не щосекунди.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finishOpen, draft?.startedAt, session?.estimatedMin],
  );

  const title = session?.title || session?.programName || tr.workoutsLabel;

  if (sessionsApi.loaded && !sessionsApi.failed && !session) {
    return (
      <GroupScreenShell c={c} title={tr.workoutsLabel}>
        <EmptyState c={c} icon="exclamationmark.circle" title={tr.tgSessionNotFound} />
      </GroupScreenShell>
    );
  }

  return (
    <GroupScreenShell
      c={c}
      title={title}
      groupId={groupId || undefined}
      groupName={session?.groupName || group?.name}
      actions={open && draft?.startedAt ? <ElapsedClock c={c} startedAt={draft.startedAt} /> : undefined}>
      {sessionsApi.failed ? (
        <Notice c={c} text={tr.loadErrorBody} tone="error" onRetry={() => { void sessionsApi.reload(); }} retryLabel={tr.loadErrorRetry} />
      ) : null}
      {error ? <Notice c={c} text={error} tone="error" /> : null}

      {session ? (
        <Card c={c} style={{ marginBottom: 8 }}>
          <Text style={{ color: c.sub, fontSize: 13 }}>
            {[formatSessionDate(tr, session.date), session.programName, session.weekIndex != null ? fmt(tr.tgWeekN, { n: session.weekIndex + 1 }) : null]
              .filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ color: statusColor(session.status, c), fontWeight: '800' }}>{statusLabel(tr, session.status)}</Text>
            {draft ? (
              <Text style={{ color: c.sub, fontSize: 13 }}>
                {`${counts.done}/${counts.total} · ${fmt(tr.tgVolume, { kg: formatKg(totalVolumeG(draft.exercises)) })}`}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      {draft?.exercises.map((ex, i) => {
        const planned = session?.plannedExercises.find(p => p.exerciseId === ex.exerciseId);
        return (
          <View key={`${ex.exerciseId}:${i}`}>
            <SectionTitle c={c}>{`${i + 1}. ${ex.name}`}</SectionTitle>
            <Card c={c}>
              {planned ? (
                <Text style={{ color: c.faint, fontSize: 12, marginBottom: 4 }}>
                  {`${planned.sets ?? 1}×${planned.reps} · ${formatKg(planned.weightG)} ${tr.tgUnitKg}${planned.restSec ? ` · ${tr.tgRestSec} ${planned.restSec}` : ''}`}
                </Text>
              ) : null}
              {ex.sets.map(s => (
                <SetRow key={s.setIndex} c={c} set={s} readOnly={!open} onChange={next => changeSet(i, next)} />
              ))}
            </Card>
          </View>
        );
      })}

      {!open && (session?.actual?.memberNote || existingLog?.coachNote) ? (
        <Card c={c} style={{ marginTop: 12 }}>
          {session?.actual?.memberNote ? (
            <Text style={{ color: c.text, fontSize: 14 }}>{`${tr.tgMemberNoteLabel}: ${session.actual.memberNote}`}</Text>
          ) : null}
          {existingLog?.coachNote ? (
            <Text style={{ color: c.text, fontSize: 14, marginTop: 6 }}>{`${tr.tgCoachNote}: ${existingLog.coachNote}`}</Text>
          ) : null}
        </Card>
      ) : null}

      {open && draft ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          {restEndsAt ? (
            <RestTimerBar
              c={c}
              endsAt={restEndsAt}
              onAdd={() => setRestEndsAt(t => (t ?? Date.now()) + 30_000)}
              onSkip={() => setRestEndsAt(null)}
              onDone={() => { setRestEndsAt(null); haptic.medium(); }}
            />
          ) : null}
          <PrimaryButton
            label={tr.tgFinish}
            icon="flag.checkered"
            disabled={counts.done === 0}
            onPress={() => setFinishOpen(true)}
          />
          <PrimaryButton label={tr.tgSkipSession} variant="soft" color={TG_ERR} onPress={confirmSkip} busy={busy && !finishOpen} />
        </View>
      ) : null}

      <FinishSheet
        c={c}
        visible={finishOpen}
        onClose={() => setFinishOpen(false)}
        onConfirm={form => { setFinishOpen(false); setTimeout(() => { void writeAll(status, form); }, 200); }}
        status={status}
        done={counts.done}
        total={counts.total}
        defaultMinutes={defaultMinutes}
        xpEstimate={xpEstimate}
        busy={busy}
      />
    </GroupScreenShell>
  );
}
