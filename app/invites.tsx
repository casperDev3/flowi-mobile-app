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
import { Atlas } from '@/constants/atlas';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { InviteActions } from '@/components/notifications/InviteActions';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { OfflineError } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { syncMyInvites } from '@/store/invite-inbox';
import { fetchMyInvites, type MyInvite } from '@/store/project-team';

const ACCENT = '#7C3AED';

export default function InvitesScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const contentWidth = useContentWidth();
  const { tr, lang } = useI18n();
  const dateLocale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { invite: focusId } = useLocalSearchParams<{ invite?: string }>();

  const c = useMemo(() => ({
    bg1: isDark ? '#0C0C14' : '#F4F2FF',
    bg2: isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text: isDark ? '#F0EEFF' : '#1A1433',
    sub: isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: ACCENT,
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  }), [isDark]);

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
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={contentWidth}>
        <ScreenHeader
          title={tr.invitesTitle}
          color={c.text}
          titleStyle={st.pageTitle}
          back={{
            onPress: () => (router.canGoBack() ? router.back() : router.replace('/notifications' as never)),
            label: tr.back,
            color: c.sub,
            style: { backgroundColor: c.dim, borderColor: c.border },
          }}
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
        {status === 'loading' && !invites.length ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : status === 'error' || status === 'offline' ? (
          <View style={[st.banner, { borderColor: '#EF444440', backgroundColor: '#EF444412' }]}>
            <IconSymbol name="exclamationmark.circle" size={16} color="#EF4444" />
            <Text style={{ flex: 1, color: c.text, fontSize: 13, marginLeft: 8 }}>
              {status === 'offline' ? tr.inviteNetworkError : tr.invitesLoadError}
            </Text>
            <TouchableOpacity onPress={() => { void load(); }} accessibilityRole="button" style={st.retry}>
              <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{tr.adminRetry}</Text>
            </TouchableOpacity>
          </View>
        ) : ordered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 56 }}>
            <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
              <IconSymbol name="person.badge.plus" size={30} color={c.accent} />
            </View>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>{tr.invitesEmptyTitle}</Text>
            <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>{tr.invitesEmptySub}</Text>
          </View>
        ) : ordered.map(invite => (
          <BlurView
            key={invite.id}
            intensity={isDark ? 20 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={[st.card, { borderColor: invite.id === focusId ? c.accent : c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <View style={[st.dot, { backgroundColor: invite.project.color || c.accent }]} />
              <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontSize: 16, fontWeight: Atlas.type.headingWeight }}>
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
          </BlurView>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.6 },
  card: { borderRadius: Atlas.radius.large, borderWidth: 1, overflow: 'hidden', padding: 16, marginBottom: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Atlas.radius.large, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  emptyIcon: { width: 72, height: 72, borderRadius: Atlas.radius.xlarge, alignItems: 'center', justifyContent: 'center' },
});
