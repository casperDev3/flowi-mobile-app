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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { InviteActions } from '@/components/notifications/InviteActions';
import { NotificationRow, type NotificationRowColors } from '@/components/notifications/NotificationRow';
import { ScheduledReminders } from '@/components/notifications/ScheduledReminders';
import { useNotificationInbox, useUnreadNotificationsCount } from '@/components/notifications/use-notification-center';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { INVITE_EVENT_PENDING, inviteIdFromPayload, syncMyInvites } from '@/store/invite-inbox';
import { notificationRoute } from '@/utils/pushLink';
import { fontFamily } from '@/constants/theme';
import { Atlas } from '@/constants/atlas';
import { BulkActionBar, SwipeRow, ZoneSkeleton, type BulkAction, type SwipeAction } from '@/components/layout-zones';
import { useFinanceLayoutStrings } from '@/components/finance/layoutStrings';
import { KpiCounter, MeshBackground, PageHeader } from '@/components/ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';
import { AccentIcon } from '@/components/shared/GlassBits';

type Tab = 'inbox' | 'reminders';
type Filter = 'all' | 'unread';

// DS v2: глибока лаванда (акцент tasks, 5.25:1 з білим) замість легасі #7C3AED

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

  const k = dsTokens(isDark);

  const c = useMemo(() => ({
    bg1:    k.bg.canvas,
    bg2:    k.bg.canvas,
    border: k.border.hairline,
    text:   k.text.primary,
    sub:    k.text.secondary,
    accent: glassOf(k).accent.lavender.ink, // DS v2.1: lavender ink на склі
    // Omni (DS v2.2): картки суцільні (surface.card), вкладене — surface.subtle;
    // скло лишається лише функціональному шару (шапка, кнопки).
    dim:    k.surface.subtle,
    unreadBg: k.accent.lavenderSoft,
    card:   k.surface.card,
  }), [k]);

  const rowColors: NotificationRowColors = useMemo(() => ({
    border: c.border, text: c.text, sub: c.sub, accent: c.accent, unreadBg: c.unreadBg,
  }), [c]);

  useFocusEffect(useCallback(() => {
    setNow(new Date());
    void refreshInbox();
    // Decision 7: запрошення, надіслані на мою пошту до появи акаунта,
    // прив'язуються й отримують картку саме цим викликом.
    void syncMyInvites();
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

  /*
   * Layout System v2.4. Деталь сповіщення — це екран, куди воно веде, тож
   * динамічної зони тут немає (тап = перехід). Із патернів зон працюють:
   * свайп рядка («Прочитано» / «В архів» без переходу) і масовий вибір
   * (довгий дотик → «N вибрано · Дії ▾ · ✕»). Ті самі API, що й кнопки.
   */
  const lz = useFinanceLayoutStrings();
  const [bulkIds, setBulkIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = bulkIds.size > 0;
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);
  const toggleBulk = useCallback((item: InboxItem) => {
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
      return next;
    });
  }, []);
  // Вибір — лише серед того, що видно: інша вкладка/фільтр — скидаємо.
  useEffect(() => { clearBulk(); }, [tab, filter, clearBulk]);
  const bulkActions = useMemo<BulkAction[]>(() => {
    const ids = [...bulkIds];
    const anyUnread = items.some(item => bulkIds.has(item.id) && !item.read_at);
    return [
      {
        key: 'read', label: lz.bulkRead, icon: 'checkmark.circle', disabled: !anyUnread, testID: 'nc-bulk-read',
        onPress: () => { void markNotificationsRead(ids); clearBulk(); },
      },
      {
        key: 'archive', label: tr.ncArchive, icon: 'archivebox.fill', testID: 'nc-bulk-archive',
        onPress: () => { void archiveNotifications(ids); clearBulk(); },
      },
    ];
  }, [bulkIds, items, lz, tr, clearBulk]);
  const swipeActionsFor = useCallback((item: InboxItem): SwipeAction[] => [
    ...(!item.read_at
      ? [{ key: 'read', label: lz.swipeRead, icon: 'checkmark.circle' as const, tone: 'success' as const, onPress: () => { void markNotificationsRead([item.id]); } }]
      : []),
    { key: 'archive', label: tr.ncArchive, icon: 'archivebox.fill', tone: 'neutral', onPress: () => archiveItem(item) },
  ], [lz, tr, archiveItem]);

  /** «Прийняти/Відхилити» прямо в картці запрошення в проєкт (decision 7). */
  const inviteFooter = useCallback((item: InboxItem) => {
    if (item.event_type !== INVITE_EVENT_PENDING) return null;
    const inviteId = inviteIdFromPayload(item.payload);
    if (!inviteId) return null;
    return (
      <InviteActions
        inviteId={inviteId}
        accent={c.accent}
        text={c.text}
        sub={c.sub}
        border={c.border}
        onDone={() => { if (!item.read_at) void markNotificationsRead([item.id]); }}
      />
    );
  }, [c]);

  const renderItem = useCallback(({ item }: { item: InboxItem }) => (
    // Відступ між картками — на обгортці: інакше кнопки свайпу тягнулись би
    // і на поле під карткою.
    <View style={{ marginBottom: 8 }}>
    <SwipeRow actions={swipeActionsFor(item)} enabled={!selectionMode} radius={Atlas.radius.xlarge}>
      {a11y => (
    <NotificationRow
      {...a11y}
      style={{ marginBottom: 0 }}
      selectionMode={selectionMode}
      selected={bulkIds.has(item.id)}
      onLongPress={toggleBulk}
      item={item}
      timeText={formatNotificationTime(item.created_at, now, tr, lang)}
      isDark={isDark}
      colors={rowColors}
      unreadLabel={tr.ncUnreadA11y}
      archiveLabel={tr.ncArchive}
      collapsedText={item.collapse_count > 1 ? fillTemplate(tr.ncCollapsedMore, { count: item.collapse_count - 1 }) : null}
      onOpen={selectionMode ? toggleBulk : openItem}
      onArchive={archiveItem}
      footer={inviteFooter(item)}
    />
      )}
    </SwipeRow>
    </View>
  ), [now, tr, lang, isDark, rowColors, openItem, archiveItem, inviteFooter, swipeActionsFor, selectionMode, bulkIds, toggleBulk]);

  const header = (
    <ScreenHeader
      title={tr.notifications}
      color={c.text}
      titleStyle={st.pageTitle}
      back={{
        onPress: () => router.back(),
        label: tr.back,
        color: c.sub,
        style: { backgroundColor: c.card, borderColor: 'transparent' },
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
              style={{ backgroundColor: c.card, borderColor: 'transparent' }}>
              <IconSymbol name="checkmark.circle" size={17} color={c.text} />
            </HeaderButton>
          ) : null}
          <HeaderButton
            onPress={() => router.push('/settings-notifications' as never)}
            accessibilityLabel={tr.ncOpenSettings}
            style={{ backgroundColor: c.card, borderColor: 'transparent' }}>
            <IconSymbol name="gearshape.fill" size={16} color={c.sub} />
          </HeaderButton>
        </View>
      }>
      {/* Omni: KPI сторінки — великі тонкі числа (непрочитані червоною
          дельтою не фарбуємо: це не прострочення). Лише вкладка інбоксу
          і лише коли серверний список доступний. */}
      {tab === 'inbox' && inbox.status !== 'offline' && inbox.status !== 'unavailable' && inbox.items.length > 0 ? (
        <PageHeader
          bleed={20}
          kpis={
            <>
              <KpiCounter value={unread} label={tr.ncFilterUnread} />
              <KpiCounter value={inbox.visibleItems.length} label={tr.ncTabInbox} />
            </>
          }
        />
      ) : null}
    </ScreenHeader>
  );

  const tabs = (
    // Omni: вкладки розділу — pill-таби з іконкою (активна — чорна pill,
    // у темній — біла); лічильник непрочитаних — коралова pill.
    <View style={st.segment} accessibilityRole="tablist">
      {([
        { key: 'inbox' as const, label: tr.ncTabInbox, count: unread, icon: 'bell' as const },
        { key: 'reminders' as const, label: tr.ncTabReminders, count: 0, icon: 'clock' as const },
      ]).map(option => {
        const active = tab === option.key;
        return (
          <TouchableOpacity
            key={option.key}
            onPress={() => setTab(option.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count > 0 ? `${option.label}, ${fillTemplate(tr.ncUnreadCount, { count: option.count })}` : option.label}
            style={[st.segmentBtn, active ? { backgroundColor: k.action.primary } : { backgroundColor: c.card }]}>
            <IconSymbol name={option.icon} size={14} color={active ? k.text.onAction : c.sub} />
            <Text style={[st.segmentText, { color: active ? k.text.onAction : c.text }]}>{option.label}</Text>
            {option.count > 0 ? (
              <View style={[st.countPill, { backgroundColor: k.accent.coral }]}>
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
        <View style={[st.banner, { backgroundColor: c.card }]}>
          <IconSymbol name={banner.icon} size={16} color={c.sub} />
          <Text style={[st.bannerText, { color: c.sub }]}>{banner.text}</Text>
          {banner.retry ? (
            <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={st.retryBtn}>
              <Text style={{ color: c.text, fontFamily: fontFamily.semibold, fontSize: 13, textDecorationLine: 'underline' }}>{tr.ncRetry}</Text>
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
              style={[st.chip, { backgroundColor: active ? k.action.primary : c.card }]}>
              <Text style={{ color: active ? k.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {inbox.hiddenByModules ? <Text style={[st.hint, { color: c.sub }]}>{tr.ncHiddenByModules}</Text> : null}
    </View>
  );

  // Стан зони «завантаження» — скелет у формі карток, а не спінер.
  const inboxEmpty = inbox.status === 'loading' && !inbox.items.length ? (
    <ZoneSkeleton variant="list" rows={5} />
  ) : (
    <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 12 }}>
      <AccentIcon isDark={isDark} icon={filter === 'unread' ? 'checkmark.circle' : 'bell'} accent="lavender" size="lg" style={st.emptyIcon} />
      <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontFamily: fontFamily.semibold, textAlign: 'center' }}>
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
      style={[st.moreBtn, { backgroundColor: glassOf(k).surfaceSubtle, ...glassRim(k, 'subtle') }]}>
      {inbox.loadingMore
        ? <ActivityIndicator color={c.sub} />
        : <Text style={{ color: k.action.secondaryText, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.ncLoadMore}</Text>}
    </TouchableOpacity>
  ) : null;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MeshBackground />
      <View style={contentWidth}>{header}</View>
      {tab === 'inbox' ? (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListHeaderComponent={inboxHeader}
          ListEmptyComponent={inboxEmpty}
          ListFooterComponent={inboxFooter}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (filter === 'all') void loadMoreInbox(); }}
          style={{ flex: 1 }}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: (Platform.OS === 'ios' ? 40 : 24) + (selectionMode ? 72 : 0) }]}
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
      {tab === 'inbox' ? (
        <BulkActionBar
          testID="nc-bulk-bar"
          count={bulkIds.size}
          actions={bulkActions}
          onClear={clearBulk}
          bottom={Platform.OS === 'ios' ? 28 : 16}
        />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  segment:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  segmentBtn:  { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segmentText: { fontSize: 14, fontFamily: fontFamily.semibold },
  countPill:   { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText:   { color: '#fff', fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  filterRow:   { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip:        { minHeight: 36, paddingHorizontal: 16, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  banner:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
  bannerText:  { flex: 1, fontSize: 13, lineHeight: 18 },
  retryBtn:    { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  hint:        { fontSize: 12, marginBottom: 10, marginHorizontal: 2 },
  emptyIcon:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  moreBtn:     { minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
