/**
 * app/training/[groupId]/leaderboard.tsx — лідерборд (training-module.md
 * §6.4, §10.1): перемикач «Тиждень / За весь час», навігація ISO-тижнями,
 * своє місце закріплене знизу (сервер віддає `me` окремо — видно навіть
 * коли список довгий).
 */
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { GroupScreenShell } from '@/components/training/GroupScreenShell';
import { useGroupSummary, useTrainingScope, type LoadIssue } from '@/components/training/hooks';
import { LeaderboardList } from '@/components/training/LeaderboardList';
import { fmt, TG_ACCENT, TG_XP, useTrainingColors } from '@/components/training/theme';
import { Card, Chip, EmptyState } from '@/components/training/TrainingBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { getLeaderboard, isOffline } from '@/utils/trainingApi';
import { dayKeyInZone } from '@/utils/trainingSessions';
import type { LeaderboardResponse } from '@/utils/trainingTypes';
import { addDays, isoWeekLabel, isoWeekMonday } from '@/utils/trainingXp';

export default function LeaderboardScreen() {
  const { groupId = '' } = useLocalSearchParams<{ groupId: string }>();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const { online } = useTrainingScope();
  const { group } = useGroupSummary(groupId);
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const thisMonday = isoWeekMonday(dayKeyInZone(new Date(), group?.timezone));
  const [monday, setMonday] = useState<string | null>(null);
  const weekMonday = monday ?? thisMonday;
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [issue, setIssue] = useState<LoadIssue>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!online) { setIssue('offline'); return; }
    try {
      setData(await getLeaderboard(groupId, period, period === 'week' ? isoWeekLabel(weekMonday) : undefined));
      setIssue(null);
    } catch (e) {
      setIssue(isOffline(e) ? 'offline' : 'error');
    }
  }, [online, groupId, period, weekMonday]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const refresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const rows = data?.results ?? [];
  const meRow = rows.find(r => r.is_me);

  return (
    <GroupScreenShell
      c={c}
      title={tr.tgLeaderboard}
      groupId={groupId}
      groupName={group?.name}
      issue={issue}
      onRefresh={refresh}
      refreshing={refreshing}
      footer={data?.me ? (
        <Card c={c} accent={TG_ACCENT}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
              {fmt(tr.tgYourPlace, { rank: data.me.rank, xp: data.me.xp })}
            </Text>
            {meRow ? <Text style={{ color: TG_XP, fontWeight: '800' }}>{`🔥${meRow.streak_days}`}</Text> : null}
          </View>
        </Card>
      ) : undefined}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip c={c} label={tr.tgPeriodWeek} active={period === 'week'} onPress={() => setPeriod('week')} />
        <Chip c={c} label={tr.tgPeriodAll} active={period === 'all'} onPress={() => setPeriod('all')} />
      </View>
      {period === 'week' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <TouchableOpacity onPress={() => setMonday(addDays(weekMonday, -7))} accessibilityRole="button" accessibilityLabel={tr.tgPrevWeek}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name="chevron.left" size={16} color={c.text} />
          </TouchableOpacity>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>
            {`${data?.from ?? weekMonday} — ${data?.to ?? addDays(weekMonday, 6)}`}
          </Text>
          <TouchableOpacity
            onPress={() => setMonday(addDays(weekMonday, 7))}
            disabled={weekMonday >= thisMonday}
            accessibilityRole="button"
            accessibilityLabel={tr.tgNextWeek}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: weekMonday >= thisMonday ? 0.3 : 1 }}>
            <IconSymbol name="chevron.right" size={16} color={c.text} />
          </TouchableOpacity>
        </View>
      ) : null}
      {data && !rows.length ? <EmptyState c={c} icon="star.fill" title={tr.tgNoLeaderboard} /> : null}
      {rows.length ? <Card c={c}><LeaderboardList c={c} rows={rows} /></Card> : null}
    </GroupScreenShell>
  );
}
