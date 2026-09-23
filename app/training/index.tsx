/**
 * app/training/index.tsx — мої групи тренувань (training-module.md §10.1):
 * бейдж ролі, «Створити групу», «Приєднатись за запрошенням».
 */
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { CreateGroupSheet, JoinGroupSheet } from '@/components/training/GroupSheets';
import { useTrainingGroups, useTrainingScope } from '@/components/training/hooks';
import { fmt, TG_ACCENT, TG_XP, useTrainingColors } from '@/components/training/theme';
import {
  Badge,
  Card,
  EmptyState,
  Notice,
  PrimaryButton,
  ScreenBackground,
} from '@/components/training/TrainingBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useContentWidth } from '@/hooks/use-content-width';
import { trainingRoutes } from '@/components/training/routes';
import { useI18n } from '@/store/i18n';
import type { TrainingGroupSummary } from '@/utils/trainingTypes';

export default function TrainingGroupsScreen() {
  const router = useRouter();
  const { tr } = useI18n();
  const c = useTrainingColors();
  const contentWidth = useContentWidth();
  const { scope, online } = useTrainingScope();
  const { groups, loaded, issue, refresh } = useTrainingGroups();
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  }, [refresh]);

  const open = useCallback((id: string) => {
    router.push(trainingRoutes.group(id));
  }, [router]);

  const afterSheet = useCallback((group: TrainingGroupSummary) => {
    setSheet(null);
    void refresh();
    // Відкриваємо групу ПІСЛЯ того, як аркуш доанімується (NEW-02).
    setTimeout(() => open(group.id), 250);
  }, [refresh, open]);

  const active = groups.filter(g => !g.archived_at);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenBackground c={c} />
      <View style={contentWidth}>
        <ScreenHeader
          title={tr.tgTitle}
          color={c.text}
          back={{ onPress: () => router.back(), label: tr.back, color: c.text }}
          actions={online ? (
            <HeaderButton onPress={() => setSheet('join')} accessibilityLabel={tr.tgJoinGroup}>
              <IconSymbol name="person.badge.plus" size={18} color={c.text} />
            </HeaderButton>
          ) : undefined}
        />
      </View>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TG_ACCENT} />}>
        {!online && <Notice c={c} text={tr.tgOnlineOnly} tone="info" />}
        {online && issue === 'offline' && <Notice c={c} text={tr.tgOfflineNotice} />}
        {online && issue === 'error' && <Notice c={c} text={tr.tgErrorGeneric} tone="error" onRetry={onRefresh} retryLabel={tr.loadErrorRetry} />}

        {loaded && active.length === 0 && !issue ? (
          <EmptyState
            c={c}
            icon="person.2.fill"
            title={tr.tgEmptyTitle}
            body={tr.tgEmptyBody}
            action={online ? (
              <View style={{ gap: 10 }}>
                <PrimaryButton label={tr.tgCreateGroup} icon="plus" onPress={() => setSheet('create')} />
                <PrimaryButton label={tr.tgJoinGroup} icon="link" variant="soft" onPress={() => setSheet('join')} />
              </View>
            ) : undefined}
          />
        ) : null}

        {active.map(g => (
          <TouchableOpacity
            key={g.id}
            onPress={() => open(g.id)}
            accessibilityRole="button"
            accessibilityLabel={`${g.name}, ${g.role === 'coach' ? tr.tgRoleCoach : tr.tgRoleMember}`}
            style={{ marginBottom: 10 }}>
            <Card c={c} accent={g.color}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: g.color + '26', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="dumbbell.fill" size={20} color={g.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{g.name}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {fmt(tr.tgMembersCount, { n: g.member_count })}
                    {g.description ? ` · ${g.description}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Badge label={g.role === 'coach' ? tr.tgRoleCoach : tr.tgRoleMember} color={g.role === 'coach' ? TG_ACCENT : c.sub} />
                  {g.role === 'member' ? (
                    <Text style={{ color: TG_XP, fontSize: 12, fontWeight: '800' }}>
                      {`${g.xp_total} XP · 🔥${g.streak_days}`}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        ))}

        {active.length > 0 && online ? (
          <View style={{ gap: 10, marginTop: 8 }}>
            <PrimaryButton label={tr.tgCreateGroup} icon="plus" variant="soft" onPress={() => setSheet('create')} />
          </View>
        ) : null}
      </ScrollView>

      <CreateGroupSheet
        visible={sheet === 'create'}
        onClose={() => setSheet(null)}
        onCreated={afterSheet}
        c={c}
        scope={scope}
      />
      <JoinGroupSheet
        visible={sheet === 'join'}
        onClose={() => setSheet(null)}
        onJoined={group => afterSheet(group)}
        c={c}
      />
    </View>
  );
}
