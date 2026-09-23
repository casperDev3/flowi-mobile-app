/**
 * app/training/[groupId]/members.tsx — учасники групи (training-module.md
 * §8, §10.1). Тренер: стрік, XP тижня, % виконання, ролі, видалення,
 * запрошення (посилання/email). Учасник: склад групи й «Вийти з групи».
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary } from '@/components/training/hooks';
import { InvitePanel } from '@/components/training/InvitePanel';
import { MembersList } from '@/components/training/MembersList';
import { trainingRoutes } from '@/components/training/routes';
import { TG_ERR, useTrainingColors } from '@/components/training/theme';
import { Card, EmptyState, Notice, PrimaryButton } from '@/components/training/TrainingBits';
import { useMembers } from '@/components/training/useMembers';
import { useI18n } from '@/store/i18n';
import { dayKeyInZone } from '@/utils/trainingSessions';

export default function MembersScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const isCoach = (stream.role ?? group?.role) === 'coach';
  const today = dayKeyInZone(new Date(), group?.timezone);
  const m = useMembers(groupId, stream, isCoach, today, group?.name ?? '');

  return (
    <GroupScreenShell
      c={c}
      title={tr.tgMembers}
      groupId={groupId}
      groupName={group?.name}
      issue={m.issue}
      onRefresh={() => { void m.load(); void stream.sync(); }}>
      {m.error ? <Notice c={c} text={m.error} tone="error" /> : null}
      {isCoach ? <Notice c={c} text={tr.tgPrivacyNote} tone="info" /> : null}
      {m.members.length ? (
        <Card c={c}>
          <MembersList
            c={c}
            members={m.members}
            stats={m.stats}
            isCoach={isCoach}
            meId={m.userId}
            onOpen={isCoach ? mem => router.push(trainingRoutes.member(groupId, mem.user.id)) : undefined}
            onMenu={isCoach ? m.memberMenu : undefined}
          />
        </Card>
      ) : m.issue ? null : <EmptyState c={c} icon="person.2.fill" title={tr.tgNoMembers} />}

      {isCoach ? <InvitePanel c={c} groupId={groupId} onMemberAdded={() => { void m.load(); }} /> : null}

      <View style={{ gap: 10, marginTop: 24 }}>
        <PrimaryButton label={tr.tgLeaveGroup} variant="soft" color={TG_ERR} onPress={m.leave} />
        {isCoach ? <PrimaryButton label={tr.tgDeleteGroup} variant="soft" color={TG_ERR} onPress={m.deleteGroup} /> : null}
      </View>
    </GroupScreenShell>
  );
}
