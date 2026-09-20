import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { getAllScheduledNotifications, requestNotificationPermissions } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { useContentWidth } from '@/hooks/use-content-width';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduledItem {
  identifier: string;
  title: string;
  body: string;
  fireDate: Date | null;
  isRecurring: boolean;
}

type NotifGroup = 'tasks' | 'meetings' | 'daily' | 'meds' | 'checkups' | 'vaccines' | 'habits' | 'other';

function getGroup(id: string): NotifGroup {
  if (id.startsWith('reminder_')) return 'tasks';
  if (id.startsWith('meeting_')) return 'meetings';
  if (id.startsWith('daily_')) return 'daily';
  if (id.startsWith('med_')) return 'meds';
  if (id.startsWith('checkup_')) return 'checkups';
  if (id.startsWith('vaccine_')) return 'vaccines';
  if (id.startsWith('habit_')) return 'habits';
  return 'other';
}

const GROUP_ORDER: NotifGroup[] = ['tasks', 'meetings', 'daily', 'meds', 'checkups', 'vaccines', 'habits', 'other'];

interface GroupMeta {
  icon: IconSymbolName;
  color: string;
}

const GROUP_ICONS: Record<NotifGroup, GroupMeta> = {
  tasks:    { icon: 'list.bullet',       color: '#7C3AED' },
  meetings: { icon: 'calendar',          color: '#6366F1' },
  daily:    { icon: 'clock.fill',        color: '#0EA5E9' },
  meds:     { icon: 'cross.case.fill',   color: '#10B981' },
  checkups: { icon: 'stethoscope',       color: '#10B981' },
  vaccines: { icon: 'syringe.fill',      color: '#10B981' },
  habits:   { icon: 'star.fill',         color: '#F59E0B' },
  other:    { icon: 'bell.fill',         color: '#7C3AED' },
};

interface NotifSection {
  group: NotifGroup;
  title: string;
  meta: GroupMeta;
  data: ScheduledItem[];
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);

  // Палітра — у useMemo, інакше картки під React.memo перемальовуються на
  // кожен рендер екрана через новий об'єкт кольорів.
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  }), [isDark]);

  // Group label lookup — must be inside component to use tr
  const GROUP_LABELS: Record<NotifGroup, string> = useMemo(() => ({
    tasks:    tr.tasks,
    meetings: tr.meetings,
    daily:    tr.notifGroupDaily,
    meds:     tr.meds,
    checkups: tr.checkups,
    vaccines: tr.vaccines,
    habits:   tr.habits,
    other:    tr.catOther,
  }), [tr]);

  const load = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermGranted(status === 'granted');

    const enabled = await loadData<boolean>('notificationsEnabled', true);
    setGlobalEnabled(enabled);

    const scheduled = await getAllScheduledNotifications();
    const mapped: ScheduledItem[] = scheduled.map(n => {
      const trigger = n.trigger as Record<string, unknown> | null;
      let fireDate: Date | null = null;
      let isRecurring = false;

      if (trigger) {
        const triggerType = trigger.type as string | undefined;
        if (triggerType === 'date') {
          if (typeof trigger.value === 'number') {
            fireDate = new Date((trigger.value as number) * 1000);
          } else if (trigger.date instanceof Date) {
            fireDate = trigger.date as Date;
          } else if (typeof trigger.date === 'number') {
            fireDate = new Date((trigger.date as number) * 1000);
          }
        } else {
          // daily, weekly, calendar — recurring
          isRecurring = true;
        }
      } else {
        isRecurring = true;
      }

      return {
        identifier: n.identifier,
        title: n.content.title ?? '',
        body: n.content.body ?? '',
        fireDate,
        isRecurring,
      };
    }).sort((a, b) => {
      // Recurring first within groups, then by date
      if (a.isRecurring && !b.isRecurring) return -1;
      if (!a.isRecurring && b.isRecurring) return 1;
      if (!a.fireDate) return 1;
      if (!b.fireDate) return -1;
      return a.fireDate.getTime() - b.fireDate.getTime();
    });

    setItems(mapped);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requestPerm = useCallback(async () => {
    const granted = await requestNotificationPermissions();
    setPermGranted(granted);
    if (!granted) Alert.alert(tr.notifDisabled, tr.notifDisabledSub);
  }, [tr]);

  const toggleGlobal = useCallback((val: boolean) => {
    if (!val) {
      // Confirm before disabling and cancelling all
      Alert.alert(
        tr.pushNotifications,
        tr.notifDisableConfirm,
        [
          { text: tr.cancel, style: 'cancel' },
          {
            text: tr.deleteAll,
            style: 'destructive',
            onPress: async () => {
              await Notifications.cancelAllScheduledNotificationsAsync();
              setGlobalEnabled(false);
              await saveData('notificationsEnabled', false);
              setItems([]);
            },
          },
        ],
      );
      // Don't update globalEnabled yet — wait for user confirmation
    } else {
      setGlobalEnabled(true);
      saveData('notificationsEnabled', true);
      Alert.alert(tr.pushNotifications, tr.notifReenableHint, [{ text: 'OK' }]);
    }
  }, [tr]);

  // Елемент приходить аргументом — колбек лишається одним на весь список і не
  // ламає React.memo на картках.
  const cancelItem = useCallback((item: ScheduledItem) => {
    Alert.alert(tr.deleteReminder, item.body || item.title, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: async () => {
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
          setItems(prev => prev.filter(i => i.identifier !== item.identifier));
        },
      },
    ]);
  }, [tr]);

  const cancelAll = useCallback(() => {
    Alert.alert(tr.deleteAllReminders, `${items.length} ${tr.totalNotif.toLowerCase()}.`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.deleteAll,
        style: 'destructive',
        onPress: async () => {
          await Notifications.cancelAllScheduledNotificationsAsync();
          setItems([]);
        },
      },
    ]);
  }, [tr, items.length]);

  const formatDate = useCallback((item: ScheduledItem): string => {
    if (item.isRecurring) return tr.notifRecurring;
    const d = item.fireDate;
    if (!d) return '—';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const isTomorrow = d.toDateString() === tom.toDateString();
    // I18N-03: локаль бралася жорстко 'uk-UA' — англійський інтерфейс
    // показував «12 листопада» поруч із перекладеними «Today»/«Tomorrow».
    const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
    const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `${tr.today} · ${timeStr}`;
    if (isTomorrow) return `${tr.tomorrow} · ${timeStr}`;
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' }) + ` · ${timeStr}`;
  }, [tr, lang]);

  const oneTimeCount = items.filter(i => !i.isRecurring).length;
  const recurringCount = items.filter(i => i.isRecurring).length;

  // Секції рахуються один раз на зміну списку: раніше кожна з восьми груп
  // перефільтровувала весь масив просто під час рендера.
  const sections: NotifSection[] = useMemo(() => {
    const byGroup = new Map<NotifGroup, ScheduledItem[]>();
    for (const item of items) {
      const group = getGroup(item.identifier);
      const bucket = byGroup.get(group);
      if (bucket) bucket.push(item);
      else byGroup.set(group, [item]);
    }
    return GROUP_ORDER
      .filter(group => byGroup.has(group))
      .map(group => ({
        group,
        title: GROUP_LABELS[group],
        meta: GROUP_ICONS[group],
        data: byGroup.get(group)!,
      }));
  }, [items, GROUP_LABELS]);

  const renderItem = useCallback(({ item, section }: { item: ScheduledItem; section: NotifSection }) => (
    <NotifCard
      item={item}
      meta={section.meta}
      dateText={formatDate(item)}
      isDark={isDark}
      border={c.border}
      text={c.text}
      sub={c.sub}
      deleteLabel={tr.delete}
      onDelete={cancelItem}
    />
  ), [formatDate, isDark, c.border, c.text, c.sub, tr.delete, cancelItem]);

  const renderSectionHeader = useCallback(({ section }: { section: NotifSection }) => (
    <Text style={[ns.sectionLabel, { color: c.sub }]}>{section.title.toUpperCase()}</Text>
  ), [c.sub]);

  const listHeader = (
    <View>
      {/* Header */}
      <View style={{ marginTop: 14, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tr.back}
          style={[ns.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
          <IconSymbol name="chevron.left" size={17} color={c.sub} />
        </TouchableOpacity>
        <Text style={[ns.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>
          {tr.notifications}
        </Text>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={cancelAll}
            accessibilityRole="button"
            accessibilityLabel={tr.deleteAllReminders}
            style={[ns.headerBtn, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)' }]}>
            <IconSymbol name="trash" size={16} color="#EF4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Permission banner */}
      {permGranted === false && (
        <TouchableOpacity
          onPress={requestPerm}
          accessibilityRole="button"
          accessibilityLabel={`${tr.notifDisabled}. ${tr.notifDisabledSub}`}
          style={[ns.banner, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
          <View style={[ns.bannerIcon, { backgroundColor: '#EF444420' }]}>
            <IconSymbol name="bell.slash" size={20} color="#EF4444" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '700' }}>
              {tr.notifDisabled}
            </Text>
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 2, opacity: 0.8 }}>
              {tr.notifDisabledSub}
            </Text>
          </View>
          <IconSymbol name="chevron.right" size={15} color="#EF4444" />
        </TouchableOpacity>
      )}

      {/* Global toggle */}
      <BlurView
        intensity={isDark ? 20 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={[ns.card, { borderColor: c.border, marginBottom: 20 }]}>
        <View style={ns.toggleRow}>
          <View style={[ns.iconBox, { backgroundColor: '#F59E0B20' }]}>
            <IconSymbol name="bell.badge" size={17} color="#F59E0B" />
          </View>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 12 }}>
            {tr.pushNotifications}
          </Text>
          {/* A11Y-03: глобальний тумблер push — дія з наслідками; без імені
              VoiceOver читав лише «увімкнено, перемикач». */}
          <Switch
            value={globalEnabled}
            onValueChange={toggleGlobal}
            accessibilityLabel={tr.pushNotifications}
            accessibilityState={{ checked: globalEnabled }}
            trackColor={{ false: 'rgba(128,128,128,0.3)', true: '#7C3AED' }}
            thumbColor="#fff"
            ios_backgroundColor="rgba(128,128,128,0.3)"
          />
        </View>
      </BlurView>

      {/* Stats */}
      {items.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <BlurView
            intensity={isDark ? 20 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={[ns.statCard, { borderColor: c.border, flex: 1 }]}>
            <Text style={{ color: c.accent, fontSize: 24, fontWeight: '800' }}>{items.length}</Text>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
              {tr.totalNotif}
            </Text>
          </BlurView>
          <BlurView
            intensity={isDark ? 20 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={[ns.statCard, { borderColor: c.border, flex: 1 }]}>
            <Text style={{ color: '#10B981', fontSize: 24, fontWeight: '800' }}>{oneTimeCount}</Text>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
              {tr.activeNotif}
            </Text>
          </BlurView>
          <BlurView
            intensity={isDark ? 20 : 40}
            tint={isDark ? 'dark' : 'light'}
            style={[ns.statCard, { borderColor: c.border, flex: 1 }]}>
            <Text style={{ color: '#0EA5E9', fontSize: 24, fontWeight: '800' }}>{recurringCount}</Text>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
              {tr.notifRecurring}
            </Text>
          </BlurView>
        </View>
      )}
    </View>
  );

  // Порожній список — глухий кут: нагадування створюються не тут, а в завданнях,
  // тому даємо перехід туди прямо з порожнього стану.
  const listEmpty = permGranted === false ? null : (
    <View style={{ alignItems: 'center', paddingVertical: 64 }}>
      <View style={[ns.emptyIcon, { backgroundColor: c.accent + '18' }]}>
        <IconSymbol name="bell.slash" size={32} color={c.accent} />
      </View>
      <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700' }}>
        {tr.noNotifications}
      </Text>
      <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
        {tr.noNotifSub}
      </Text>
      <TouchableOpacity
        onPress={() => router.push('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel={tr.addTask}
        style={[ns.emptyBtn, { backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={15} color="#fff" />
        <Text style={ns.emptyBtnText}>{tr.addTask}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <SectionList
          sections={sections}
          keyExtractor={item => item.identifier}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          // Хвіст секції добирає ті самі 16pt відступу, що давав контейнер групи.
          renderSectionFooter={() => <View style={{ height: 8 }} />}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          style={{ flex: 1 }}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }]}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Картка нагадування ──────────────────────────────────────────────────────

interface NotifCardProps {
  item: ScheduledItem;
  meta: GroupMeta;
  dateText: string;
  isDark: boolean;
  border: string;
  text: string;
  sub: string;
  deleteLabel: string;
  onDelete: (item: ScheduledItem) => void;
}

const NotifCard = React.memo(function NotifCard(
  { item, meta, dateText, isDark, border, text, sub, deleteLabel, onDelete }: NotifCardProps,
) {
  const handleDelete = useCallback(() => onDelete(item), [onDelete, item]);
  return (
    <BlurView
      intensity={isDark ? 20 : 40}
      tint={isDark ? 'dark' : 'light'}
      style={[ns.itemCard, { borderColor: border }]}>
      <View style={[ns.iconBox, { backgroundColor: meta.color + '20' }]}>
        <IconSymbol name={meta.icon} size={17} color={meta.color} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        {item.title ? (
          <Text style={{ color: sub, fontSize: 11, fontWeight: '600', marginBottom: 1 }}
            numberOfLines={1}>
            {item.title}
          </Text>
        ) : null}
        <Text style={{ color: text, fontSize: 14, fontWeight: '600' }}
          numberOfLines={2}>
          {item.body || item.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
          <IconSymbol
            name={item.isRecurring ? 'arrow.clockwise' : 'clock'}
            size={11}
            color={meta.color}
          />
          <Text style={{ color: meta.color, fontSize: 12, fontWeight: '600' }}>
            {dateText}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={handleDelete}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={deleteLabel}
        style={[ns.deleteBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
        <IconSymbol name="xmark" size={13} color="#EF4444" />
      </TouchableOpacity>
    </BlurView>
  );
});

const ns = StyleSheet.create({
  pageTitle:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  headerBtn:    { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  card:         { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  iconBox:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statCard:     { borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 14 },
  // marginBottom замінює gap контейнера групи, якого у SectionList більше немає.
  itemCard:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  deleteBtn:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  banner:       { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bannerIcon:   { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:    { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 13, marginTop: 20 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
