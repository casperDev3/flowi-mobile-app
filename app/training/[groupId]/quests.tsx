/**
 * app/training/[groupId]/quests.tsx — квести групи (training-module.md §3.4,
 * §10.1). Учасник: вимірювані з прогрес-баром (пише сервер), чек-завдання
 * закриває сам (опційне фото — лише на пристрої, §11.5). Тренер: створює,
 * редагує, архівує, бачить скільки закрили, перераховує вимірювані.
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary, useTrainingScope } from '@/components/training/hooks';
import { pickQuestPhoto, QuestCard } from '@/components/training/QuestCard';
import { QuestFormSheet } from '@/components/training/QuestFormSheet';
import { dayKeyInZone } from '@/utils/trainingSessions';
import { useTrainingColors } from '@/components/training/theme';
import { EmptyState, Notice, PrimaryButton, SectionTitle } from '@/components/training/TrainingBits';
import { useI18n } from '@/store/i18n';
import { isOffline, listTrainingMembers, recomputeQuest } from '@/utils/trainingApi';
import { checkboxProgress, isAssignedTo, isQuestActive, progressId } from '@/utils/trainingQuests';
import { newTrainingId } from '@/utils/trainingSync';
import type { Quest, QuestProgress, TrainingMember } from '@/utils/trainingTypes';

export default function QuestsScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { userId, online } = useTrainingScope();
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const role = stream.role ?? group?.role ?? null;
  const isCoach = role === 'coach';
  const today = dayKeyInZone(new Date(), group?.timezone);
  const [editing, setEditing] = useState<Quest | null>(null);
  const [members, setMembers] = useState<TrainingMember[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!online || !isCoach) return;
    listTrainingMembers(groupId).then(setMembers).catch(() => undefined);
  }, [online, isCoach, groupId]));

  const all = stream.list<Quest>('quests');
  const progress = stream.list<QuestProgress>('quest_progress');
  const visible = all.filter(q => !q.archivedAt).filter(q => isCoach || (userId !== null && isAssignedTo(q, userId, role)));
  const active = visible.filter(q => isQuestActive(q, today));
  const finished = visible.filter(q => !isQuestActive(q, today));
  const mine = (q: Quest) => (userId === null ? null : progress.find(p => p.id === progressId(q.id, userId)) ?? null);
  const memberCount = members.filter(m => m.role === 'member').length;

  const toggle = useCallback(async (q: Quest, completed: boolean) => {
    if (userId === null) return;
    setBusy(q.id); setError(null);
    try {
      let photo: string | null = mine(q)?.photoUri ?? null;
      if (completed && q.photoRequired) {
        photo = await pickQuestPhoto(tr);
        if (!photo) return;
      }
      const rec = checkboxProgress(q, userId, completed, photo, new Date().toISOString());
      await stream.write('quest_progress', rec.id, rec as unknown as Record<string, unknown>);
    } finally {
      setBusy(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, stream, tr, progress]);

  const recompute = useCallback(async (q: Quest) => {
    setBusy(q.id); setError(null);
    try {
      await recomputeQuest(groupId, q.id);
      await stream.sync();
    } catch (e) {
      setError(isOffline(e) ? tr.tgOfflineNotice : tr.tgErrorGeneric);
    } finally {
      setBusy(null);
    }
  }, [groupId, stream, tr]);

  const save = useCallback(async (q: Quest) => {
    setEditing(null);
    await stream.write('quests', q.id, q as unknown as Record<string, unknown>);
  }, [stream]);

  const archive = useCallback(async (q: Quest) => {
    setEditing(null);
    await stream.write('quests', q.id, { ...q, archivedAt: new Date().toISOString() } as unknown as Record<string, unknown>);
  }, [stream]);

  const card = (q: Quest) => (
    <QuestCard
      key={q.id}
      c={c}
      quest={q}
      progress={mine(q)}
      mode={isCoach ? 'coach' : 'member'}
      doneCount={progress.filter(p => p.questId === q.id && p.completed).length}
      assigneeCount={q.assigneeIds?.length || memberCount || undefined}
      onToggle={isCoach ? undefined : completed => { void toggle(q, completed); }}
      onRecompute={isCoach ? () => { void recompute(q); } : undefined}
      onEdit={isCoach ? () => setEditing(q) : undefined}
      busy={busy === q.id}
    />
  );

  return (
    <GroupScreenShell
      c={c}
      title={tr.tgQuests}
      groupId={groupId}
      groupName={group?.name}
      issue={stream.issue}
      gone={stream.gone}
      onRefresh={() => { void stream.sync(); }}
      refreshing={stream.syncing}>
      {error ? <Notice c={c} text={error} tone="error" /> : null}
      {stream.loaded && !visible.length ? <EmptyState c={c} icon="flag.checkered" title={tr.tgNoQuests} /> : null}
      {active.map(card)}
      {finished.length ? (
        <>
          <SectionTitle c={c}>{tr.tgStatusCompleted}</SectionTitle>
          {finished.map(card)}
        </>
      ) : null}
      {isCoach ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton
            label={tr.tgNewQuest}
            icon="plus"
            onPress={() => setEditing({
              id: newTrainingId('q'), type: 'measurable', title: '', metric: 'session_count', targetValue: 10,
              startDate: today, dueDate: null, xpReward: 100, assigneeIds: [], photoRequired: false, archivedAt: null,
            })}
          />
        </View>
      ) : null}
      <QuestFormSheet
        c={c}
        visible={!!editing}
        quest={editing}
        members={members}
        onClose={() => setEditing(null)}
        onSave={q => { void save(q); }}
        onArchive={editing && all.some(q => q.id === editing.id) ? () => { void archive(editing); } : undefined}
      />
    </GroupScreenShell>
  );
}
