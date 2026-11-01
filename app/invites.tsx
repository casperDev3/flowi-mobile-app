/**
 * app/invites.tsx — «Запрошення»: іменні запрошення в проєкти, що чекають
 * МОЄЇ відповіді (decision 7).
 *
 * Сюди веде тап по сповіщенню/push `project.invite_pending`
 * (`ftrackingapp://invites?invite=<id>` → utils/pushLink.ts). Список читається
 * з `GET /invites/mine/` — той самий виклик заодно прив'язує запрошення,
 * надіслані на мою пошту ще до реєстрації. Запрошення з `?invite=` стоїть
 * першим і підсвічене.
 */
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { InviteActions } from '@/components/notifications/InviteActions';
// Omni (DS v2.2): AppHeader = ScreenHeader (інсет, «Назад») + 🔔 і аватар + KPI.
import { AppHeader } from '@/components/shared/AppHeader';
import { BentoCard, BentoGrid, KpiCounter } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { OfflineError } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { syncMyInvites } from '@/store/invite-inbox';
import { fetchMyInvites, type MyInvite } from '@/store/project-team';
import { fontFamily } from '@/constants/theme';

// DS v2: глибока лаванда (акцент tasks, 5.25:1 з білим) замість легасі #7C3AED
const ACCENT = { light: '#6D4CF5', dark: '#8B6CFF' } as const;

export default function InvitesScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const contentWidth = useContentWidth();
  const { tr, lang } = useI18n();
  const dateLocale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { invite: focusId } = useLocalSearchParams<{ invite?: string }>();

  const k = dsTokens(isDark);

  const c = useMemo(() => ({
    bg1: k.bg.canvas,
    bg2: k.bg.canvas,
    border: k.border.hairline,
    text: k.text.primary,
    sub: k.text.secondary,
    accent: isDark ? ACCENT.dark : ACCENT.light,
    dim: k.surface.subtle,
    card:   k.surface.card,
  }), [k, isDark]);

  const [invites, setInvites] = useState<MyInvite[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'offline'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchMyInvites();
      setInvites(list);
      setStatus('ready');
      // Картки в інбоксі для щойно прив'язаних запрошень.
      if (list.length) void syncMyInvites();
    } catch (e) {
      setStatus(e instanceof OfflineError ? 'offline' : 'error');
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const ordered = useMemo(() => {
    if (!focusId) return invites;
    return [...invites].sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));
  }, [invites, focusId]);

  const roleLabel = (r: MyInvite['role']) => (r === 'manager' ? tr.roleManager : r === 'member' ? tr.roleMember : tr.roleViewer);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg1 }]} />
      <View style={contentWidth}>
        <AppHeader
          title={tr.invitesTitle}
          titleStyle={st.pageTitle}
          kpis={ordered.length > 0 ? <KpiCounter value={ordered.length} label={tr.invitesTitle} /> : undefined}
          back={{
            onPress: () => (router.canGoBack() ? router.back() : router.replace('/notifications' as never)),
            label: tr.back,
            color: c.sub,
            style: { backgroundColor: c.card, borderColor: 'transparent' },
          }}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}>
        {status === 'loading' && !invites.length ? (
          <ActivityIndicator color={c.sub} style={{ marginTop: 40 }} />
        ) : status === 'error' || status === 'offline' ? (
          <View style={[st.banner, { backgroundColor: k.status.danger + '14' }]}>
            <IconSymbol name="exclamationmark.circle" size={16} color={k.status.danger} />
            <Text style={{ flex: 1, color: c.text, fontSize: 13, marginLeft: 8 }}>
              {status === 'offline' ? tr.inviteNetworkError : tr.invitesLoadError}
            </Text>
            <TouchableOpacity onPress={() => { void load(); }} accessibilityRole="button" style={st.retry}>
              <Text style={{ color: c.text, fontFamily: fontFamily.semibold, fontSize: 13, textDecorationLine: 'underline' }}>{tr.adminRetry}</Text>
            </TouchableOpacity>
          </View>
        ) : ordered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 56 }}>
            <View style={[st.emptyIcon, { backgroundColor: c.card }]}>
              <IconSymbol name="person.badge.plus" size={32} color={c.sub} />
            </View>
            <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, marginTop: 16, textAlign: 'center' }}>{tr.invitesEmptyTitle}</Text>
            <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>{tr.invitesEmptySub}</Text>
          </View>
        ) : (
          <BentoGrid>
          {ordered.map(invite => (
          <BentoCard
            key={invite.id}
            style={invite.id === focusId ? { borderWidth: 2, borderColor: k.focus.ring } : null}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {/* Omni icon-chip кольору проєкту. */}
              <View style={[st.chip, { backgroundColor: (invite.project.color || c.accent) + '26' }]}>
                <IconSymbol name="folder.fill" size={16} color={invite.project.color || c.accent} />
              </View>
              <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontSize: 16, fontFamily: fontFamily.semibold }}>
                {invite.project.name}
              </Text>
            </View>
            {invite.invited_by ? (
              <Text style={{ color: c.sub, fontSize: 13, marginBottom: 2 }}>{tr.inviteInvitedByLabel}: {invite.invited_by.name}</Text>
            ) : null}
            <Text style={{ color: c.sub, fontSize: 13, marginBottom: 2 }}>{roleLabel(invite.role)}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginBottom: 12 }}>
              {tr.inviteExpiresLabel}: {new Date(invite.expires_at).toLocaleDateString(dateLocale)}
            </Text>
            <InviteActions
              inviteId={invite.id}
              accent={c.accent}
              text={c.text}
              sub={c.sub}
              border={c.border}
            />
          </BentoCard>
          ))}
          </BentoGrid>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  chip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
});
