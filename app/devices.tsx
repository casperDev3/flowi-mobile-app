/**
 * app/devices.tsx — «Пристрої та сесії» (docs/specs/watch-lockscreen-v1.md §11.1).
 *
 * Активні входи акаунта з сервера (GET /auth/sessions/): телефон, браузер,
 * Apple Watch. Чужу сесію можна завершити; свою — лише «Вийти», тому в
 * поточного рядка кнопки немає. Входи до появи сесій сервер не показує —
 * про це рядок унизу.
 *
 * На iOS зверху — блок Apple Watch: годинник не має входу, сесію йому видає
 * телефон (store/watch-link.ts). Після завершення сесії годинника повернути
 * її може лише «Підключити знову».
 */
import { Atlas } from '@/constants/atlas';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { ApiError } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { listSessions, revokeSession, type SessionKind, type SessionOut } from '@/store/sessions-api';
import { markWatchRevoked, useWatchLinkState } from '@/store/watch-link';
import { haptic } from '@/utils/haptics';

const KIND_ICON: Record<SessionKind, 'phone.fill' | 'laptopcomputer' | 'clock.fill' | 'globe'> = {
  mobile: 'phone.fill',
  web: 'laptopcomputer',
  watch: 'clock.fill',
  other: 'globe',
};

const PLATFORM_LABEL: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  watchos: 'watchOS',
  web: 'Web',
};

export default function DevicesScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const contentWidth = useContentWidth();
  const c = { ...getScreenColors('auth', isDark), red: '#EF4444', green: '#10B981' };
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  /** Повідомлення останнього «Завершити» (паритет з вебом: текст + перечитування списку). */
  const [revokeNotice, setRevokeNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listSessions();
      setSessions(rows);
      setFailed(false);
    } catch (e) {
      if (__DEV__) console.warn('[devices] сесії не завантажено:', e);
      // «Не завантажилось» — не те саме, що «сесій немає»: старий список лишаємо.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const kindLabel = (kind: SessionKind) => ({
    mobile: tr.devicesKindMobile,
    web: tr.devicesKindWeb,
    watch: tr.devicesKindWatch,
    other: tr.devicesKindOther,
  })[kind];

  const lastSeen = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const when = d.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return tr.devicesLastSeen.replace('{when}', when);
  };

  const askRevoke = (session: SessionOut) => {
    const name = session.name || kindLabel(session.kind);
    Alert.alert(
      tr.devicesRevokeConfirmTitle,
      tr.devicesRevokeConfirmBody.replace('{name}', name),
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.devicesRevoke,
          style: 'destructive',
          onPress: async () => {
            setRevoking(session.id);
            setRevokeNotice(null);
            try {
              await revokeSession(session.id);
              haptic.success();
              if (session.kind === 'watch') await markWatchRevoked(session.id);
              setSessions(prev => prev.filter(s => s.id !== session.id));
            } catch (e) {
              // 404 session_not_found — сесію вже завершено деінде. Як на вебі
              // (sessionErrorMessage): кажемо про це й перечитуємо список, а не
              // мовчки прибираємо рядок.
              if (e instanceof ApiError && e.code === 'session_not_found') {
                if (session.kind === 'watch') await markWatchRevoked(session.id);
                setRevokeNotice(tr.devicesSessionGone);
                setSessions(prev => prev.filter(s => s.id !== session.id));
                void load();
                return;
              }
              haptic.error();
              if (__DEV__) console.warn('[devices] сесію не завершено:', e);
              Alert.alert(tr.devicesRevokeConfirmTitle, tr.devicesRevokeError);
              void load();
            } finally {
              setRevoking(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['bottom', 'left', 'right']}>
        <ScreenHeader
          title={tr.devicesTitle}
          color={c.text}
          titleStyle={st.title}
          back={{ onPress: () => router.back(), label: tr.back, color: c.accent }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.accountManage, onPress: () => router.push('/account') },
            { label: tr.devicesTitle },
          ]}
          crumbColor={c.sub}
        />
        <ScrollView
          contentContainerStyle={[st.scroll, contentWidth]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
        >
          {Platform.OS === 'ios' && <WatchBlock colors={c} isDark={isDark} />}

          <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.devicesTitle.toUpperCase()}</Text>
          {loading ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} accessibilityLabel={tr.loading} />
          ) : (
            <>
              {failed && (
                <TouchableOpacity
                  onPress={() => { setLoading(sessions.length === 0); void load(); }}
                  style={[st.notice, { borderColor: c.red + '40' }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.devicesLoadError}. ${tr.loadErrorRetry}`}
                >
                  <IconSymbol name="exclamationmark.triangle.fill" size={16} color={c.red} />
                  <Text style={[st.noticeText, { color: c.text }]}>{tr.devicesLoadError}</Text>
                  <Text style={[st.noticeAction, { color: c.accent }]}>{tr.loadErrorRetry}</Text>
                </TouchableOpacity>
              )}
              {revokeNotice && (
                <View
                  style={[st.notice, { borderColor: c.accent + '40' }]}
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  testID="devices-revoke-notice"
                >
                  <IconSymbol name="info.circle.fill" size={16} color={c.accent} />
                  <Text style={[st.noticeText, { color: c.text }]}>{revokeNotice}</Text>
                </View>
              )}
              {!failed && sessions.length === 0 && (
                <Text style={[st.empty, { color: c.sub }]}>{tr.devicesEmpty}</Text>
              )}
              {sessions.length > 0 && (
                <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
                  {sessions.map((session, index) => (
                    <View
                      key={session.id}
                      style={[st.row, index > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}
                    >
                      <View style={[st.iconBox, { backgroundColor: c.accent + '20' }]}>
                        <IconSymbol name={KIND_ICON[session.kind]} size={17} color={c.accent} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={st.nameLine}>
                          <Text style={[st.name, { color: c.text }]} numberOfLines={1}>
                            {session.name || kindLabel(session.kind)}
                          </Text>
                          {session.current && (
                            <View style={[st.badge, { backgroundColor: c.green + '22' }]}>
                              <Text style={[st.badgeText, { color: c.green }]}>{tr.devicesThisDevice}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[st.meta, { color: c.sub }]} numberOfLines={1}>
                          {[kindLabel(session.kind), PLATFORM_LABEL[session.platform] ?? session.platform, session.app_version]
                            .filter(Boolean).join(' · ')}
                        </Text>
                        {!!session.last_seen_at && (
                          <Text style={[st.meta, { color: c.sub }]} numberOfLines={1}>{lastSeen(session.last_seen_at)}</Text>
                        )}
                      </View>
                      {!session.current && (
                        <TouchableOpacity
                          onPress={() => askRevoke(session)}
                          disabled={revoking === session.id}
                          style={st.revokeBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`${tr.devicesRevoke}: ${session.name || kindLabel(session.kind)}`}
                          accessibilityState={{ busy: revoking === session.id }}
                        >
                          {revoking === session.id
                            ? <ActivityIndicator color={c.red} />
                            : <Text style={[st.revokeText, { color: c.red }]}>{tr.devicesRevoke}</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </BlurView>
              )}
              <Text style={[st.legacy, { color: c.sub }]}>{tr.devicesLegacyNote}</Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function WatchBlock({ colors: c, isDark }: {
  colors: ReturnType<typeof getScreenColors> & { red: string; green: string };
  isDark: boolean;
}) {
  const { tr } = useI18n();
  const { watch, link, busy, error, connect } = useWatchLinkState();

  let status: string;
  let action: string | null = null;
  if (!watch.paired) status = tr.watchNotPaired;
  else if (!watch.installed) status = tr.watchAppNotInstalled;
  else if (link?.state === 'connected') status = tr.watchConnected;
  else if (link?.state === 'revoked') { status = tr.watchDisconnected; action = tr.watchReconnect; }
  else { status = ''; action = tr.watchConnect; }
  const statusColor = link?.state === 'connected' && watch.installed ? c.green : c.sub;

  return (
    <>
      <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.watchSectionTitle.toUpperCase()}</Text>
      <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
        <View style={st.row}>
          <View style={[st.iconBox, { backgroundColor: c.accent + '20' }]}>
            <IconSymbol name="clock.fill" size={17} color={c.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[st.name, { color: c.text }]}>{tr.watchSectionTitle}</Text>
            {!!status && <Text style={[st.meta, { color: statusColor }]}>{status}</Text>}
            {error && <Text style={[st.meta, { color: c.red }]}>{tr.watchConnectError}</Text>}
          </View>
          {action && watch.paired && watch.installed && (
            <TouchableOpacity
              onPress={() => { void connect(); }}
              disabled={busy}
              style={[st.connectBtn, { backgroundColor: c.accent, opacity: busy ? 0.7 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel={action}
              accessibilityState={{ busy, disabled: busy }}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.connectText}>{action}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </>
  );
}

const st = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card: {
    borderRadius: Atlas.radius.xlarge,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  iconBox: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  meta: { fontSize: 13 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  revokeBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 8 },
  revokeText: { fontSize: 14, fontWeight: '600' },
  connectBtn: { borderRadius: Atlas.radius.large, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  connectText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  notice: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Atlas.radius.large,
    paddingHorizontal: 14, minHeight: 48, marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 14 },
  noticeAction: { fontSize: 14, fontWeight: '700' },
  empty: { fontSize: 14, textAlign: 'center', marginTop: 16 },
  legacy: { fontSize: 12, lineHeight: 17, marginTop: 14, marginHorizontal: 4 },
});
