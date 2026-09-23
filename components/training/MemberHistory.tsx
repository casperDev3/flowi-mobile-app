/**
 * components/training/MemberHistory.tsx — історія виконання учасника для
 * тренера (training-module.md §0.5, §10.1): сесії, вправи, підходи, вага,
 * час; прогрес квестів; XP; поле `coachNote`.
 *
 * ЖОДНОГО блоку даних здоровʼя: `GET …/members/{id}/progress/` їх і не
 * віддає (у груповому потоці немає колекцій здоровʼя за складом, §2.4), а
 * тут ми й не просимо — екран будується лише з `workout_logs`,
 * `quest_progress` і книги XP.
 *
 * Нотатка тренера — мутація `workout_logs` із РІВНО тими самими даними,
 * що на сервері, і зміненим лише `coachNote` (§2.3): будь-яке інше поле в
 * чужому лозі сервер відхилить як `forbidden`.
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import { getMemberProgress, isOffline } from '@/utils/trainingApi';
import { formatMetricValue } from '@/utils/trainingQuests';
import { formatKg, withCoachNote } from '@/utils/trainingSessions';
import type { MemberProgressResponse, Quest, WorkoutLog } from '@/utils/trainingTypes';

import type { GroupStream } from './hooks';
import { formatSessionDate, statusColor, statusLabel } from './SessionCards';
import { Avatar, Card, Notice, PrimaryButton, SectionTitle } from './TrainingBits';
import { fmt, TG_ACCENT, TG_XP, type TrainingColors } from './theme';

function LogCard({ c, localId, log, onSaveNote, canNote }: {
  c: TrainingColors;
  localId: string;
  log: WorkoutLog;
  canNote: boolean;
  onSaveNote: (localId: string, note: string) => Promise<void>;
}) {
  const { tr } = useI18n();
  const [note, setNote] = useState(log.coachNote ?? '');
  const [saving, setSaving] = useState(false);
  const changed = (note.trim() || null) !== (log.coachNote ?? null);
  return (
    <Card c={c} style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{log.title || formatSessionDate(tr, log.date)}</Text>
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
            {[formatSessionDate(tr, log.date), log.durationMin ? fmt(tr.tgMinutesShort, { n: log.durationMin }) : null,
              log.totalVolumeG ? fmt(tr.tgVolume, { kg: formatKg(log.totalVolumeG) }) : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={{ color: statusColor(log.status, c), fontWeight: '800' }}>{statusLabel(tr, log.status)}</Text>
      </View>
      {(log.exercises ?? []).map(ex => (
        <View key={ex.exerciseId + ex.name} style={{ marginTop: 8 }}>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{ex.name}</Text>
          <Text style={{ color: c.sub, fontSize: 13 }}>
            {ex.sets.map(s => `${s.done ? '' : '✕ '}${s.reps}×${formatKg(s.weightG)}${s.rpe ? `@${s.rpe}` : ''}`).join('  ·  ')}
          </Text>
        </View>
      ))}
      {log.memberNote ? (
        <Text style={{ color: c.text, fontSize: 13, marginTop: 8 }}>{`${tr.tgMemberNoteLabel}: ${log.memberNote}`}</Text>
      ) : null}
      {canNote ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={tr.tgNotePlaceholder}
            placeholderTextColor={c.faint}
            accessibilityLabel={tr.tgCoachNote}
            multiline
            maxLength={2000}
            style={{ minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.input, color: c.text, padding: 10, fontSize: 14 }}
          />
          {changed ? (
            <PrimaryButton
              label={tr.tgSaveNote}
              variant="soft"
              busy={saving}
              onPress={() => { setSaving(true); onSaveNote(localId, note).finally(() => setSaving(false)); }}
            />
          ) : null}
        </View>
      ) : log.coachNote ? (
        <Text style={{ color: TG_ACCENT, fontSize: 13, marginTop: 8 }}>{`${tr.tgCoachNote}: ${log.coachNote}`}</Text>
      ) : null}
    </Card>
  );
}

export function MemberHistory({ c, groupId, userId, stream, canNote }: {
  c: TrainingColors;
  groupId: string;
  userId: number;
  stream: GroupStream;
  canNote: boolean;
}) {
  const { tr } = useI18n();
  const [data, setData] = useState<MemberProgressResponse | null>(null);
  const [issue, setIssue] = useState<'offline' | 'error' | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getMemberProgress(groupId, userId));
      setIssue(null);
    } catch (e) {
      setIssue(isOffline(e) ? 'offline' : 'error');
    }
  }, [groupId, userId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const saveNote = useCallback(async (localId: string, note: string) => {
    // Беремо ПОТОЧНУ серверну версію з потоку групи (тренер бачить усі логи),
    // а без неї — дані з progress/ як є, без жодних доповнень: будь-яка
    // різниця в іншому полі чужого лога дала б `forbidden`.
    const fromProgress = data?.workout_logs.find(l => l.local_id === localId)?.data;
    const current = stream.get<WorkoutLog>('workout_logs', localId) ?? fromProgress;
    if (!current) return;
    const next = withCoachNote(current, note);
    await stream.write('workout_logs', localId, next as unknown as Record<string, unknown>);
    setData(d => d && {
      ...d,
      workout_logs: d.workout_logs.map(l => (l.local_id === localId ? { ...l, data: next } : l)),
    });
  }, [stream, data]);

  const quests = stream.list<Quest>('quests');
  const questTitle = (id: string) => quests.find(q => q.id === id)?.title ?? id;
  const member = data?.member;
  const xpTotal = data?.xp_events.reduce((s, e) => s + e.xp, 0) ?? 0;

  return (
    <View>
      <Notice c={c} text={tr.tgPrivacyNote} tone="info" />
      {issue === 'offline' ? <Notice c={c} text={tr.tgOfflineNotice} /> : null}
      {issue === 'error' ? <Notice c={c} text={tr.tgErrorGeneric} tone="error" onRetry={() => { void load(); }} retryLabel={tr.loadErrorRetry} /> : null}

      {member ? (
        <Card c={c}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={member.user.name || member.user.email} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{member.user.name || member.user.email}</Text>
              <Text style={{ color: c.sub, fontSize: 13 }}>{member.role === 'coach' ? tr.tgRoleCoach : tr.tgRoleMember}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: TG_XP, fontSize: 16, fontWeight: '800' }}>{`${member.xp_total || xpTotal} XP`}</Text>
              <Text style={{ color: c.sub, fontSize: 13 }}>{`🔥 ${fmt(tr.tgStreakDays, { n: member.streak_days })}`}</Text>
            </View>
          </View>
        </Card>
      ) : null}

      {data?.quest_progress.length ? (
        <>
          <SectionTitle c={c}>{tr.tgQuestProgress}</SectionTitle>
          <Card c={c}>
            {data.quest_progress.map(({ local_id, data: p }) => (
              <View key={local_id} style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, alignItems: 'center' }}>
                <Text style={{ color: c.text, fontSize: 14, flex: 1 }} numberOfLines={1}>{questTitle(p.questId)}</Text>
                <Text style={{ color: p.completed ? '#10B981' : c.sub, fontSize: 13, fontWeight: '700' }}>
                  {p.completed ? tr.tgStatusCompleted
                    : p.targetValue != null ? `${formatMetricValue(p.currentValue)} / ${formatMetricValue(p.targetValue)} ${p.unit ?? ''}` : '—'}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle c={c}>{tr.tgMemberHistory}</SectionTitle>
      {data && !data.workout_logs.length ? <Text style={{ color: c.sub, fontSize: 14 }}>{tr.tgNoLogs}</Text> : null}
      {data?.workout_logs.map(({ local_id, data: log }) => (
        <LogCard key={local_id} c={c} localId={local_id} log={log} canNote={canNote} onSaveNote={saveNote} />
      ))}
    </View>
  );
}
