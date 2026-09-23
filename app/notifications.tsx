/**
 * app/notifications.tsx — центр сповіщень (notifications-module.md §10.4, §11).
 *
 * Дві вкладки:
 *  - «Сповіщення» — серверний інбокс: призначення, згадки, дедлайни, зустрічі,
 *    оплати. Непрочитані, «прочитати всі», прибрати зі списку, перехід до
 *    задачі/зустрічі/підписки тапом по картці.
 *  - «Нагадування» — локально заплановані нагадування ОС (ліки, звички, …),
 *    які працюють без інтернету.
 *
 * Події вимкнених модулів (ui_preferences) не показуються — так само, як
 * їхні розділи зникають із меню.
 *
 * Екранний файл тримає лише стан і розкладку: картки, вкладка нагадувань і
 * дані центру — у `components/notifications/` та `api/notifications.ts`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  type InboxItem,
  archiveNotifications,
  loadMoreInbox,
  markAllNotificationsRead,
  markNotificationsRead,
  refreshInbox,
} from '@/api/notifications';
import { fillTemplate, formatNotificationTime } from '@/components/notifications/labels';
import { NotificationRow, type NotificationRowColors } from '@/components/notifications/NotificationRow';
import { ScheduledReminders } from '@/components/notifications/ScheduledReminders';
import { useNotificationInbox, useUnreadNotificationsCount } from '@/components/notifications/use-notification-center';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { notificationRoute } from '@/utils/pushLink';

type Tab = 'inbox' | 'reminders';
type Filter = 'all' | 'unread';

const ACCENT = '#7C3AED';

export default function NotificationsScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'reminders' ? 'reminders' : 'inbox');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const inbox = useNotificationInbox();
  const unread = useUnreadNotificationsCount();
  // Час «5 хв тому» рахується від моменту фокусу, а не від кожного рендера:
  // інакше список перемальовувався б щосекунди без жодної нової події.
  const [now, setNow] = useState(() => new Date());

  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: ACCENT,
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    unreadBg: isDark ? 'rgba(124,58,237,0.10)' : 'rgba(124,58,237,0.06)',
  }), [isDark]);

  const rowColors: NotificationRowColors = useMemo(() => ({
    border: c.border, text: c.text, sub: c.sub, accent: c.accent, unreadBg: c.unreadBg,
  }), [c]);

  useFocusEffect(useCallback(() => {
    setNow(new Date());
    void refreshInbox();
  }, []));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setNow(new Date());
    refreshInbox().finally(() => setRefreshing(false));
  }, []);

  const items = useMemo(
    () => (filter === 'unread' ? inbox.visibleItems.filter(item => !item.read_at) : inbox.visibleItems),
    [inbox.visibleItems, filter],
  );

  const openItem = useCallback((item: InboxItem) => {
    if (!item.read_at) void markNotificationsRead([item.id]);
    const route = notificationRoute({
      event_type: item.event_type,
      url: item.payload?.url ?? null,
      project_id: item.project?.id ?? null,
      collection: item.collection || null,
      local_id: item.local_id || null,
    });
    if (route) router.push(route as never);
  }, [router]);

  const archiveItem = useCallback((item: InboxItem) => {
    void archiveNotifications([item.id]);
  }, []);

  const renderItem = useCallback(({ item }: { item: InboxItem }) => (
    <NotificationRow
      item={item}
      timeText={formatNotificationTime(item.created_at, now, tr, lang)}
      isDark={isDark}
      colors={rowColors}
      unreadLabel={tr.ncUnreadA11y}
      archiveLabel={tr.ncArchive}
      collapsedText={item.collapse_count > 1 ? fillTemplate(tr.ncCollapsedMore, { count: item.collapse_count - 1 }) : null}
      onOpen={openItem}
      onArchive={archiveItem}
    />
  ), [now, tr, lang, isDark, rowColors, openItem, archiveItem]);

  const header = (
    <ScreenHeader
      title={tr.notifications}
      color={c.text}
      titleStyle={st.pageTitle}
      back={{
        onPress: () => router.back(),
        label: tr.back,
        color: c.sub,
        style: { backgroundColor: c.dim, borderColor: c.border },
      }}
      crumbs={[
        { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
        { label: tr.notifications },
      ]}
      crumbColor={c.sub}
      actions={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {tab === 'inbox' && unread > 0 ? (
            <HeaderButton
              onPress={() => { void markAllNotificationsRead(); }}
              accessibilityLabel={tr.ncMarkAllRead}
              style={{ backgroundColor: c.dim, borderColor: c.border }}>
              <IconSymbol name="checkmark.circle" size={17} color={c.accent} />
            </HeaderButton>
          ) : null}
          <HeaderButton
            onPress={() => router.push('/settings-notifications' as never)}
            accessibilityLabel={tr.ncOpenSettings}
            style={{ backgroundColor: c.dim, borderColor: c.border }}>
            <IconSymbol name="gearshape.fill" size={16} color={c.sub} />
          </HeaderButton>
        </View>
      }
    />
  );

  const tabs = (
    <View style={[st.segment, { backgroundColor: c.dim, borderColor: c.border }]} accessibilityRole="tablist">
      {([
        { key: 'inbox' as const, label: tr.ncTabInbox, count: unread },
        { key: 'reminders' as const, label: tr.ncTabReminders, count: 0 },
      ]).map(option => {
        const active = tab === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => setTab(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count > 0 ? `${option.label}, ${fillTemplate(tr.ncUnreadCount, { count: option.count })}` : option.label}
            style={[st.segmentBtn, active && { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#fff' }]}>
            <Text style={[st.segmentText, { color: active ? c.text : c.sub }]}>{option.label}</Text>
            {option.count > 0 ? (
              <View style={[st.countPill, { backgroundColor: c.accent }]}>
                <Text style={st.countText}>{option.count > 99 ? '99+' : option.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const banner = (() => {
    if (inbox.status === 'offline') return { text: tr.ncOffline, icon: 'wifi.slash' as const, retry: false };
    if (inbox.status === 'unavailable') return { text: tr.ncUnavailable, icon: 'info.circle' as const, retry: false };
    if (inbox.status === 'error') return { text: tr.ncLoadFailed, icon: 'exclamationmark.circle' as const, retry: true };
    return null;
  })();

  const inboxHeader = (
    <View style={{ marginTop: 10 }}>
      {tabs}
      {banner ? (
        <View style={[st.banner, { borderColor: c.border, backgroundColor: c.dim }]}>
          <IconSymbol name={banner.icon} size={16} color={c.sub} />
          <Text style={[st.bannerText, { color: c.sub }]}>{banner.text}</Text>
          {banner.retry ? (
            <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={st.retryBtn}>
              <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{tr.ncRetry}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <View style={st.filterRow}>
        {([
          { key: 'all' as const, label: tr.ncFilterAll },
          { key: 'unread' as const, label: tr.ncFilterUnread },
        ]).map(option => {
          const active = filter === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              onPress={() => setFilter(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[st.chip, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent + '1F' : 'transparent' }]}>
              <Text style={{ color: active ? c.accent : c.sub, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {inbox.hiddenByModules ? <Text style={[st.hint, { color: c.sub }]}>{tr.ncHiddenByModules}</Text> : null}
    </View>
  );

  const inboxEmpty = inbox.status === 'loading' && !inbox.items.length ? (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={c.accent} />
    </View>
  ) : (
    <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 12 }}>
      <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
        <IconSymbol name={filter === 'unread' ? 'checkmark.circle' : 'bell'} size={32} color={c.accent} />
      </View>
      <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700', textAlign: 'center' }}>
        {filter === 'unread' ? tr.ncEmptyUnreadTitle : tr.ncEmptyTitle}
      </Text>
      {filter === 'all' ? (
        <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 18 }}>{tr.ncEmptySub}</Text>
      ) : null}
    </View>
  );

  const inboxFooter = inbox.hasMore && filter === 'all' ? (
    <TouchableOpacity
      onPress={() => { void loadMoreInbox(); }}
      disabled={inbox.loadingMore}
      accessibilityRole="button"
      style={[st.moreBtn, { borderColor: c.border }]}>
      {inbox.loadingMore
        ? <ActivityIndicator color={c.accent} />
        : <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>{tr.ncLoadMore}</Text>}
    </TouchableOpacity>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={contentWidth}>{header}</View>
      {tab === 'inbox' ? (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={inboxHeader}
          ListEmptyComponent={inboxEmpty}
          ListFooterComponent={inboxFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (filter === 'all') void loadMoreInbox(); }}
          style={{ flex: 1 }}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }]}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <ScheduledReminders
          isDark={isDark}
          colors={c}
          header={<View style={{ marginTop: 10 }}>{tabs}</View>}
          contentStyle={contentWidth}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle:   { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  segment:     { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 3, marginBottom: 12 },
  segmentBtn:  { flex: 1, minHeight: 40, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segmentText: { fontSize: 14, fontWeight: '700' },
  countPill:   { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText:   { color: '#fff', fontSize: 11, fontWeight: '800' },
  filterRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip:        { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  banner:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  bannerText:  { flex: 1, fontSize: 13, lineHeight: 18 },
  retryBtn:    { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  hint:        { fontSize: 12, marginBottom: 10, marginHorizontal: 2 },
  emptyIcon:   { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  moreBtn:     { minHeight: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
