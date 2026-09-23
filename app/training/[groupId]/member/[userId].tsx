/**
 * app/training/[groupId]/member/[userId].tsx — виконання учасника для
 * тренера (training-module.md §10.1). Лише тренування, квести й XP —
 * **жодного блоку даних здоровʼя** (§0.5).
 *
 * Планшет — master-detail: список учасників ліворуч, деталі праворуч;
 * вибір у списку міняє параметр маршруту замість нового екрана в стеку.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary } from '@/components/training/hooks';
import { MemberHistory } from '@/components/training/MemberHistory';
import { MembersList } from '@/components/training/MembersList';
import { trainingRoutes } from '@/components/training/routes';
import { useTrainingColors } from '@/components/training/theme';
import { Card, EmptyState } from '@/components/training/TrainingBits';
import { useMembers } from '@/components/training/useMembers';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { dayKeyInZone } from '@/utils/trainingSessions';

export default function MemberDetailScreen() {
  const { groupId = '', userId: raw = '' } = useLocalSearchParams<{ groupId: string; userId: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { isWide } = useResponsive();
  const { group } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const isCoach = (stream.role ?? group?.role) === 'coach';
  const today = dayKeyInZone(new Date(), group?.timezone);
  const m = useMembers(groupId, stream, isCoach, today, group?.name ?? '');
  const userId = Number(raw);
  const member = m.members.find(x => x.user.id === userId);
  const valid = Number.isFinite(userId) && userId > 0;

  const detail = valid ? (
    <MemberHistory key={userId} c={c} groupId={groupId} userId={userId} stream={stream} canNote={isCoach} />
  ) : (
    <EmptyState c={c} icon="person.fill" title={tr.tgSelectMember} />
  );

  return (
    <GroupScreenShell
      c={c}
      title={member ? member.user.name || member.user.email : tr.tgMemberHistory}
      groupId={groupId}
      groupName={group?.name}
      issue={stream.issue}
      wide={isWide}>
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ flex: 2 }}>
            <Card c={c}>
              <MembersList
                c={c}
                members={m.members}
                stats={m.stats}
                isCoach={isCoach}
                meId={m.userId}
                selectedId={userId}
                onOpen={mem => router.setParams({ userId: String(mem.user.id) })}
              />
            </Card>
          </View>
          <View style={{ flex: 3 }}>{detail}</View>
        </View>
      ) : detail}
      {/* Телефон без вибраного учасника (битий deep link) — список, щоб було з чого обрати. */}
      {!isWide && !valid ? (
        <View style={{ marginTop: 12 }}>
          <Card c={c}>
            <MembersList c={c} members={m.members} stats={m.stats} isCoach={isCoach} meId={m.userId}
              onOpen={mem => router.replace(trainingRoutes.member(groupId, mem.user.id))} />
          </Card>
        </View>
      ) : null}
    </GroupScreenShell>
  );
}
