/**
 * components/training/useMembers.ts — склад групи + агрегати для тренера:
 * XP тижня (з лідерборда), % виконання (з призначень і логів потоку групи),
 * і дії: роль, видалення, вихід, видалення групи.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';

import { useI18n } from '@/store/i18n';
import {
  deleteTrainingGroup,
  getLeaderboard,
  isOffline,
  listTrainingMembers,
  removeTrainingMember,
  setTrainingMemberRole,
  trainingErrorCode,
} from '@/utils/trainingApi';
import { completionFor } from '@/utils/trainingPrograms';
import { removeCachedGroup } from '@/utils/trainingSync';
import type { TrainingAssignment, TrainingMember, TrainingProgram, WorkoutLog } from '@/utils/trainingTypes';

import { type GroupStream, type LoadIssue, useTrainingScope } from './hooks';
import type { MemberRowStats } from './MembersList';
import { trainingRoutes } from './routes';
import { fmt } from './theme';

export function useMembers(groupId: string, stream: GroupStream, isCoach: boolean, today: string, groupName: string) {
  const { tr } = useI18n();
  const router = useRouter();
  const { scope, userId, online } = useTrainingScope();
  const [members, setMembers] = useState<TrainingMember[]>([]);
  const [weekXp, setWeekXp] = useState<Map<number, number>>(new Map());
  const [issue, setIssue] = useState<LoadIssue>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!online) { setIssue('offline'); return; }
    try {
      const [list, board] = await Promise.all([
        listTrainingMembers(groupId),
        getLeaderboard(groupId, 'week').catch(() => null),
      ]);
      setMembers(list);
      if (board) setWeekXp(new Map(board.results.map(r => [r.user.id, r.xp])));
      setIssue(null);
    } catch (e) {
      setIssue(isOffline(e) ? 'offline' : 'error');
    }
  }, [online, groupId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const stats = useMemo(() => {
    const out = new Map<number, MemberRowStats>();
    if (!isCoach) return out;
    const programs = new Map(stream.list<TrainingProgram>('training_programs').map(p => [p.id, p]));
    const assignments = stream.list<TrainingAssignment>('training_assignments');
    const logs = stream.list<WorkoutLog>('workout_logs');
    for (const m of members) {
      out.set(m.user.id, {
        weekXp: weekXp.get(m.user.id) ?? 0,
        completion: completionFor(m.user.id, assignments, programs, logs, today),
      });
    }
    return out;
  }, [isCoach, stream, members, weekXp, today]);

  const explain = useCallback((e: unknown) => {
    if (isOffline(e)) return tr.tgOfflineNotice;
    if (trainingErrorCode(e) === 'last_coach') return tr.tgLastCoach;
    return tr.tgErrorGeneric;
  }, [tr]);

  const memberMenu = useCallback((m: TrainingMember) => {
    const name = m.user.name || m.user.email;
    Alert.alert(name, undefined, [
      {
        text: m.role === 'coach' ? tr.tgMakeMember : tr.tgMakeCoach,
        onPress: () => {
          setTrainingMemberRole(groupId, m.user.id, m.role === 'coach' ? 'member' : 'coach')
            .then(() => load()).catch(e => setError(explain(e)));
        },
      },
      {
        text: tr.tgRemoveMember, style: 'destructive',
        onPress: () => Alert.alert(tr.tgRemoveMember, fmt(tr.tgRemoveMemberConfirm, { name }), [
          { text: tr.cancel, style: 'cancel' },
          {
            text: tr.tgRemoveMember, style: 'destructive',
            onPress: () => { removeTrainingMember(groupId, m.user.id).then(() => load()).catch(e => setError(explain(e))); },
          },
        ]),
      },
      { text: tr.cancel, style: 'cancel' },
    ]);
  }, [groupId, load, explain, tr]);

  const leave = useCallback(() => {
    if (userId === null) return;
    Alert.alert(tr.tgLeaveGroup, fmt(tr.tgLeaveConfirm, { name: groupName }), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.tgLeaveGroup, style: 'destructive', onPress: async () => {
          try {
            await removeTrainingMember(groupId, userId);
            await removeCachedGroup(scope, groupId);
            router.navigate(trainingRoutes.list());
          } catch (e) { setError(explain(e)); }
        },
      },
    ]);
  }, [userId, groupId, groupName, scope, router, explain, tr]);

  const deleteGroup = useCallback(() => {
    Alert.alert(tr.tgDeleteGroup, fmt(tr.tgDeleteGroupConfirm, { name: groupName }), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete, style: 'destructive', onPress: async () => {
          try {
            await deleteTrainingGroup(groupId);
            await removeCachedGroup(scope, groupId);
            router.navigate(trainingRoutes.list());
          } catch (e) { setError(explain(e)); }
        },
      },
    ]);
  }, [groupId, groupName, scope, router, explain, tr]);

  return { members, stats, issue, error, load, memberMenu, leave, deleteGroup, userId };
}
