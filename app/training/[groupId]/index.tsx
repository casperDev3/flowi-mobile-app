/**
 * app/training/[groupId]/index.tsx — огляд групи (training-module.md §10.1):
 * сьогоднішня сесія великою карткою, тиждень стрічкою, стрік і XP, топ-3
 * лідерборда, активні квести. Тренеру — ще й входи в програми, учасників,
 * вправи. На планшеті — дві колонки: план ліворуч, лідерборд і квести праворуч.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupStream, useGroupSummary, usePersonalSessions, useTrainingScope } from '@/components/training/hooks';
import { LeaderboardList } from '@/components/training/LeaderboardList';
import { QuestCard } from '@/components/training/QuestCard';
import { StreakXpCard, TodaySessionCard, WeekStrip } from '@/components/training/SessionCards';
import { TG_ACCENT, useTrainingColors } from '@/components/training/theme';
import { Card, EmptyState, Notice, SectionTitle } from '@/components/training/TrainingBits';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useResponsive } from '@/hooks/use-responsive';
import { trainingRoutes } from '@/components/training/routes';
import { useI18n } from '@/store/i18n';
import { getLeaderboard } from '@/utils/trainingApi';
import { isAssignedTo, isQuestActive, progressId } from '@/utils/trainingQuests';
import {
  applyMissed,
  dayKeyInZone,
  nextSession,
  sessionsForGroup,
  sessionsToMarkMissed,
  todaySession,
  weekDays,
} from '@/utils/trainingSessions';
import type { LeaderboardRow, Quest, QuestProgress, TrainingSession } from '@/utils/trainingTypes';

export default function TrainingGroupHome() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { isWide } = useResponsive();
  const { userId, online } = useTrainingScope();
  const { group, issue: groupIssue, refresh: refreshGroup } = useGroupSummary(groupId);
  const stream = useGroupStream(groupId);
  const sessionsApi = usePersonalSessions();
  const [top, setTop] = useState<LeaderboardRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const role = stream.role ?? group?.role ?? null;
  const isCoach = role === 'coach';
  const tz = group?.timezone ?? null;
  const today = dayKeyInZone(new Date(), tz);
  const groupName = group?.name ?? (stream.get<{ name?: string }>('training_groups', groupId)?.name || '');

  const sessions = useMemo(() => sessionsForGroup(sessionsApi.all, groupId), [sessionsApi.all, groupId]);
  const todays = todaySession(sessions, today);
  const upcoming = nextSession(sessions, today);
  const days = weekDays(today, group?.week_start ?? 1);

  // §4.2: `missed` проставляє клієнт на першому запуску після дня, що
  // лишився `planned`. Лише після успішного читання — поверх збою не пишемо.
  const missedDone = useRef('');
  useEffect(() => {
    if (!sessionsApi.loaded || sessionsApi.failed) return;
    const ids = sessionsToMarkMissed(sessions, today);
    const sig = `${today}:${ids.join(',')}`;
    if (!ids.length || missedDone.current === sig) return;
    missedDone.current = sig;
    sessionsApi.update(fresh => applyMissed(fresh, new Set(ids))).catch(e => {
      if (__DEV__) console.warn('[training] mark missed failed', e);
    });
  }, [sessions, today, sessionsApi]);

  const loadTop = useCallback(async () => {
    if (!online || !groupId) return;
    try {
      const res = await getLeaderboard(groupId, 'week');
      setTop(res.results ?? []);
    } catch (e) {
      if (__DEV__) console.warn('[training] leaderboard failed', e);
    }
  }, [groupId, online]);
  useFocusEffect(useCallback(() => { void loadTop(); }, [loadTop]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([stream.sync(), refreshGroup(), loadTop(), sessionsApi.reload()]).finally(() => setRefreshing(false));
  }, [stream, refreshGroup, loadTop, sessionsApi]);

  const openSession = useCallback((s: TrainingSession) => {
    router.push(trainingRoutes.session(s.id));
  }, [router]);

  const quests = stream.list<Quest>('quests')
    .filter(q => isQuestActive(q, today))
    .filter(q => isCoach || (userId !== null && isAssignedTo(q, userId, role)));
  const progress = stream.list<QuestProgress>('quest_progress');
  const myProgress = (q: Quest) => (userId === null ? null : progress.find(p => p.id === progressId(q.id, userId)) ?? null);

  const go = (path: 'programs' | 'members' | 'quests' | 'leaderboard' | 'exercises') =>
    router.push(trainingRoutes.section(groupId, path));

  const coachTiles: { key: Parameters<typeof go>[0]; icon: IconSymbolName; label: string }[] = [
    { key: 'programs', icon: 'list.bullet.clipboard', label: tr.tgPrograms },
    { key: 'members', icon: 'person.2.fill', label: tr.tgMembers },
    { key: 'exercises', icon: 'dumbbell.fill', label: tr.tgExercises },
    { key: 'quests', icon: 'flag.checkered', label: tr.tgQuests },
  ];
  const memberTiles: typeof coachTiles = [
    { key: 'programs', icon: 'list.bullet.clipboard', label: tr.tgPrograms },
    { key: 'quests', icon: 'flag.checkered', label: tr.tgQuests },
    { key: 'members', icon: 'person.2.fill', label: tr.tgMembers },
  ];

  const tiles = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      {(isCoach ? coachTiles : memberTiles).map(t => (
        <TouchableOpacity
          key={t.key}
          onPress={() => go(t.key)}
          accessibilityRole="button"
          accessibilityLabel={t.label}
          style={{
            flexGrow: 1, flexBasis: '45%', minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: c.border,
            backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
          }}>
          <IconSymbol name={t.icon} size={18} color={TG_ACCENT} />
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{t.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const planColumn = (
    <View>
      {sessions.length > 0 || !isCoach ? (
        <>
          <TodaySessionCard
            c={c}
            session={todays}
            next={upcoming}
            onOpen={openSession}
            noPlanText={tr.tgNoPlan}
          />
          {sessions.length > 0 ? (
            <>
              <SectionTitle c={c}>{tr.tgThisWeek}</SectionTitle>
              <WeekStrip c={c} days={days} sessions={sessions} today={today} onOpen={openSession} />
            </>
          ) : null}
        </>
      ) : (
        <Card c={c}>
          <EmptyState c={c} icon="list.bullet.clipboard" title={tr.tgNoPlan} body={tr.tgNoPlanCoach} />
        </Card>
      )}
      {!isCoach ? (
        <View style={{ marginTop: 12 }}>
          <StreakXpCard c={c} xpTotal={group?.xp_total ?? 0} streakDays={group?.streak_days ?? 0} />
        </View>
      ) : null}
      {tiles}
    </View>
  );

  const sideColumn = (
    <View>
      <SectionTitle c={c} action={{ label: tr.tgSeeAll, onPress: () => go('leaderboard') }}>{tr.tgLeaderboard}</SectionTitle>
      <Card c={c}>
        {top.length ? <LeaderboardList c={c} rows={top} limit={3} /> : (
          <Text style={{ color: c.sub, fontSize: 14 }}>{tr.tgNoLeaderboard}</Text>
        )}
      </Card>
      <SectionTitle c={c} action={{ label: tr.tgSeeAll, onPress: () => go('quests') }}>{tr.tgActiveQuests}</SectionTitle>
      {quests.length ? quests.slice(0, 3).map(q => (
        <QuestCard
          key={q.id}
          c={c}
          quest={q}
          progress={myProgress(q)}
          mode={isCoach ? 'coach' : 'member'}
          doneCount={progress.filter(p => p.questId === q.id && p.completed).length}
        />
      )) : (
        <Card c={c}><Text style={{ color: c.sub, fontSize: 14 }}>{tr.tgNoQuests}</Text></Card>
      )}
    </View>
  );

  const lastRejected = stream.state.rejected[stream.state.rejected.length - 1];
  const recentRejection = lastRejected && Date.now() - new Date(lastRejected.at).getTime() < 60_000 ? lastRejected.reason : null;

  return (
    <GroupScreenShell
      c={c}
      title={groupName || tr.tgTitle}
      groupId={groupId}
      groupName={groupName}
      issue={stream.issue ?? groupIssue}
      gone={stream.gone}
      rejectedReason={recentRejection}
      onRefresh={onRefresh}
      refreshing={refreshing}
      wide={isWide}>
      {sessionsApi.failed ? (
        <Notice c={c} text={tr.loadErrorBody} tone="error" onRetry={() => { void sessionsApi.reload(); }} retryLabel={tr.loadErrorRetry} />
      ) : isWide ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
          <View style={{ flex: 3 }}>{planColumn}</View>
          <View style={{ flex: 2 }}>{sideColumn}</View>
        </View>
      ) : (
        <>
          {planColumn}
          {sideColumn}
        </>
      )}
    </GroupScreenShell>
  );
}
