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
import { fmt, TG_ACCENT, TG_XP, type TrainingColors } from './theme';

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardRowView({ c, row }: { c: TrainingColors; row: LeaderboardRow }) {
  const { tr } = useI18n();
  const name = row.user?.name || row.user?.email || '—';
  return (
    <View
      accessible
      accessibilityLabel={`${row.rank}. ${row.is_me ? tr.tgYou : name}: ${row.xp} XP`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 10, borderRadius: 12,
        backgroundColor: row.is_me ? TG_ACCENT + '14' : 'transparent',
      }}>
      <Text style={{ width: 28, textAlign: 'center', color: c.sub, fontWeight: '800', fontSize: row.rank <= 3 ? 18 : 14 }}>
        {row.rank <= 3 ? MEDALS[row.rank - 1] : row.rank}
      </Text>
      <Avatar name={name} color={row.is_me ? TG_ACCENT : '#8B5CF6'} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
          {row.is_me ? `${name} (${tr.tgYou})` : name}
        </Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>
          {`${fmt(tr.tgSessionsShort, { n: row.sessions })} · 🔥${row.streak_days}`}
        </Text>
      </View>
      <Text style={{ color: TG_XP, fontSize: 15, fontWeight: '800' }}>{`${row.xp} XP`}</Text>
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
