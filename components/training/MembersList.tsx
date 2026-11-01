/**
 * components/training/MembersList.tsx — список учасників групи
 * (training-module.md §10.1): стрік, XP тижня, % виконання — для тренера;
 * для учасника — лише імена й ролі (деталі чужого виконання бачить тільки
 * тренер, §11 п.10).
 */
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import type { CompletionStats } from '@/utils/trainingPrograms';
import type { TrainingMember } from '@/utils/trainingTypes';

import { Avatar, Badge } from './TrainingBits';
import { fmt, TG_ACCENT, type TrainingColors } from './theme';
import { fontFamily } from '@/constants/theme';

export interface MemberRowStats {
  weekXp: number;
  completion: CompletionStats | null;
}

export function MembersList({ c, members, stats, isCoach, selectedId, meId, onOpen, onMenu }: {
  c: TrainingColors;
  members: readonly TrainingMember[];
  stats: ReadonlyMap<number, MemberRowStats>;
  isCoach: boolean;
  selectedId?: number | null;
  meId: number | null;
  onOpen?: (m: TrainingMember) => void;
  onMenu?: (m: TrainingMember) => void;
}) {
  const { tr } = useI18n();
  return (
    <View>
      {members.map((m, i) => {
        const s = stats.get(m.user.id);
        const name = m.user.name || m.user.email;
        const selected = selectedId === m.user.id;
        return (
          <View key={m.user.id} style={{
            flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: c.border,
            backgroundColor: selected ? c.chip : 'transparent', borderRadius: selected ? 14 : 0,
          }}>
            <TouchableOpacity
              disabled={!onOpen}
              onPress={() => onOpen?.(m)}
              accessibilityRole={onOpen ? 'button' : 'text'}
              accessibilityState={{ selected }}
              accessibilityLabel={`${name}, ${m.role === 'coach' ? tr.tgRoleCoach : tr.tgRoleMember}`}
              style={{ flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 }}>
              <Avatar name={name} color={m.role === 'coach' ? TG_ACCENT : c.sub} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }} numberOfLines={1}>
                  {m.user.id === meId ? `${name} (${tr.tgYou})` : name}
                </Text>
                {isCoach && m.role === 'member' ? (
                  <Text style={{ color: c.sub, fontSize: 12 }}>
                    {`${tr.tgStreak} ${fmt(tr.tgStreakDays, { n: m.streak_days })} · `}
                    <Text style={{ color: c.text, fontVariant: ['tabular-nums'] }}>{`${s?.weekXp ?? 0} ${tr.tgWeekXp}`}</Text>
                    {s?.completion?.percent != null ? (
                      <Text style={{ color: c.sub, fontVariant: ['tabular-nums'] }}>{` · ${s.completion.percent}% (${s.completion.completed}/${s.completion.due})`}</Text>
                    ) : null}
                  </Text>
                ) : null}
              </View>
              {m.role === 'coach' ? <Badge label={tr.tgRoleCoach} color={TG_ACCENT} /> : null}
            </TouchableOpacity>
            {onMenu && m.user.id !== meId ? (
              <TouchableOpacity
                onPress={() => onMenu(m)}
                accessibilityRole="button"
                accessibilityLabel={`${tr.edit}: ${name}`}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="ellipsis" size={18} color={c.sub} />
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
