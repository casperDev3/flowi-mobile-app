/**
 * app/training/invite.tsx — прийняття запрошення в групу тренувань за
 * посиланням (`ftrackingapp://training-invite?ws=&g=&t=` або веб-посилання
 * `…/invite/training?…`, training-module.md §8.1). Аналог `app/invite.tsx`
 * для проєктів, але окремий: груповий токен не можна відкривати як
 * проєктний.
 *
 * Параметри: `t` (токен), `ws` (сервер), `g` (id групи). Без токена екран
 * пропонує вставити посилання руками.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';

import { JoinInvitePanel } from '@/components/training/GroupSheets';
import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useTrainingScope } from '@/components/training/hooks';
import { trainingRoutes } from '@/components/training/routes';
import { TG_OK, useTrainingColors } from '@/components/training/theme';
import { Card, Notice, PrimaryButton } from '@/components/training/TrainingBits';
import { useI18n } from '@/store/i18n';
import { upsertCachedGroup } from '@/utils/trainingSync';
import type { TrainingGroupSummary } from '@/utils/trainingTypes';

export default function TrainingInviteScreen() {
  const params = useLocalSearchParams<{ t?: string; token?: string; ws?: string; g?: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { scope, online } = useTrainingScope();
  const [joined, setJoined] = useState<{ group: TrainingGroupSummary; already: boolean } | null>(null);

  const token = params.t || params.token || '';
  const initial = token ? { token, ws: params.ws ?? null, groupId: params.g ?? null } : null;

  const onJoined = useCallback((group: TrainingGroupSummary, already: boolean) => {
    void upsertCachedGroup(scope, group);
    setJoined({ group, already });
  }, [scope]);

  return (
    <GroupScreenShell c={c} title={tr.tgJoinGroup}>
      {!online ? <Notice c={c} text={tr.tgOnlineOnly} tone="info" /> : null}
      {joined ? (
        <Card c={c} accent={TG_OK}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{joined.group.name}</Text>
          <Text style={{ color: c.sub, fontSize: 14, marginTop: 6 }}>{joined.already ? tr.tgAlreadyMember : tr.tgJoined}</Text>
          <PrimaryButton
            label={tr.tgOpenGroup}
            onPress={() => router.replace(trainingRoutes.group(joined.group.id))}
            style={{ marginTop: 14 }}
          />
        </Card>
      ) : online ? (
        <JoinInvitePanel c={c} initial={initial} onJoined={onJoined} />
      ) : null}
    </GroupScreenShell>
  );
}
