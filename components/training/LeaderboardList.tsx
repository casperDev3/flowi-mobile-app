/**
 * components/training/LeaderboardList.tsx — рядки лідерборда (§6.4).
 * Порядок і ранги — з сервера (детерміноване сортування там), клієнт лише
 * малює. Лідерборд несе тільки агрегати — жодних деталей чужого виконання.
 */
import React from 'react';
import { Text, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import type { LeaderboardRow } from '@/utils/trainingTypes';

import { Avatar } from './TrainingBits';
import { fmt, TG_ACCENT, type TrainingColors } from './theme';
import { fontFamily } from '@/constants/theme';

export function LeaderboardRowView({ c, row }: { c: TrainingColors; row: LeaderboardRow }) {
  const { tr } = useI18n();
  const name = row.user?.name || row.user?.email || '—';
  return (
    <View
      accessible
      accessibilityLabel={`${row.rank}. ${row.is_me ? tr.tgYou : name}: ${row.xp} XP`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 10, borderRadius: 16,
        backgroundColor: row.is_me ? c.chip : 'transparent',
      }}>
      <Text style={{ width: 28, textAlign: 'center', color: row.rank <= 3 ? c.text : c.sub, fontFamily: row.rank <= 3 ? fontFamily.semibold : fontFamily.medium, fontSize: 15, fontVariant: ['tabular-nums'] }}>
        {row.rank}
      </Text>
      <Avatar name={name} color={row.is_me ? TG_ACCENT : c.sub} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }} numberOfLines={1}>
          {row.is_me ? `${name} (${tr.tgYou})` : name}
        </Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>
          {`${fmt(tr.tgSessionsShort, { n: row.sessions })} · ${tr.tgStreak} ${fmt(tr.tgStreakDays, { n: row.streak_days })}`}
        </Text>
      </View>
      <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>{`${row.xp} XP`}</Text>
    </View>
  );
}

export function LeaderboardList({ c, rows, limit }: { c: TrainingColors; rows: readonly LeaderboardRow[]; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <View style={{ gap: 2 }}>
      {shown.map(row => <LeaderboardRowView key={row.user?.id ?? row.rank} c={c} row={row} />)}
    </View>
  );
}
