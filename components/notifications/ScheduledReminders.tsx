/**
 * Вкладка «Нагадування» центру сповіщень — локально заплановані нагадування
 * ОС (notifications-module.md §10.4). Раніше це був увесь екран
 * `app/notifications.tsx`; тепер серверний інбокс поруч, а тут лишилося те,
 * що працює без інтернету: ліки, звички, здоров'я, огляди, щеплення — і
 * нагадування, які сервер ще не взяв на себе.
 *
 * Перемикач `notificationsEnabled` — вимикач саме ЛОКАЛЬНИХ нагадувань;
 * серверні керуються налаштуваннями сповіщень (окремий екран).
 */
import { BlurView } from 'expo-blur';
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import {
  getAllScheduledNotifications,
  loadServerHandledReminders,
  requestNotificationPermissions,
} from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';

interface ScheduledItem {
  identifier: string;
  title: string;
  body: string;
  fireDate: Date | null;
  isRecurring: boolean;
}

type NotifGroup = 'tasks' | 'meetings' | 'subscriptions' | 'meds' | 'habits' | 'checkups' | 'vaccines' | 'daily' | 'other';

/** Порядок перевірки важливий: `daily_habit_` — звичка, а не загальне щоденне. */
export function reminderGroup(id: string): NotifGroup {
  if (id.startsWith('reminder_')) return 'tasks';
  if (id.startsWith('meeting_')) return 'meetings';
  if (id.startsWith('sub_')) return 'subscriptions';
  if (id.startsWith('med_')) return 'meds';
  if (id.startsWith('daily_habit_') || id.startsWith('habit_')) return 'habits';
  if (id.startsWith('checkup_')) return 'checkups';
  if (id.startsWith('vaccine_')) return 'vaccines';
  if (id.startsWith('daily_')) return 'daily';
  return 'other';
}

const GROUP_ORDER: NotifGroup[] = ['meds', 'habits', 'daily', 'checkups', 'vaccines', 'tasks', 'meetings', 'subscriptions', 'other'];

interface GroupMeta { icon: IconSymbolName; color: string }

const GROUP_ICONS: Record<NotifGroup, GroupMeta> = {
  tasks:         { icon: 'list.bullet',     color: '#7C3AED' },
  meetings:      { icon: 'calendar',        color: '#6366F1' },
  subscriptions: { icon: 'creditcard.fill', color: '#0EA5E9' },
  daily:         { icon: 'clock.fill',      color: '#0EA5E9' },
  meds:          { icon: 'cross.case.fill', color: '#10B981' },
  checkups:      { icon: 'stethoscope',     color: '#10B981' },
  vaccines:      { icon: 'syringe.fill',    color: '#10B981' },
  habits:        { icon: 'star.fill',       color: '#F59E0B' },
  other:         { icon: 'bell.fill',       color: '#7C3AED' },
};

interface NotifSection { group: NotifGroup; title: string; meta: GroupMeta; data: ScheduledItem[] }

export interface ReminderColors {
  border: string;
  text: string;
  sub: string;
  accent: string;
  dim: string;
}

interface Props {
  isDark: boolean;
  colors: ReminderColors;
  /** Спільна для обох вкладок шапка (перемикач вкладок) — над вмістом списку. */
  header: React.ReactElement;
  contentStyle: StyleProp<ViewStyle>;
}

function toItem(n: Notifications.NotificationRequest): ScheduledItem {
  const trigger = n.trigger as Record<string, unknown> | null;
  let fireDate: Date | null = null;
  let isRecurring = false;
  if (trigger) {
    const triggerType = trigger.type as string | undefined;
    if (triggerType === 'date') {
      if (typeof trigger.value === 'number') fireDate = new Date((trigger.value as number) * 1000);
      else if (trigger.date instanceof Date) fireDate = trigger.date as Date;
      else if (typeof trigger.date === 'number') fireDate = new Date((trigger.date as number) * 1000);
    } else {
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
}

export function ScheduledReminders({ isDark, colors: c, header, contentStyle }: Props) {
  const router = useRouter();
  const { tr, lang } = useI18n();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [localEnabled, setLocalEnabled] = useState(true);
  const [serverHandles, setServerHandles] = useState(false);

  const GROUP_LABELS: Record<NotifGroup, string> = useMemo(() => ({
    tasks: tr.tasks,
    meetings: tr.meetings,
    subscriptions: tr.navSubscriptions,
    daily: tr.notifGroupDaily,
    meds: tr.meds,
    checkups: tr.checkups,
    vaccines: tr.vaccines,
    habits: tr.habits,
    other: tr.catOther,
  }), [tr]);

  const load = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermGranted(status === 'granted');
    } catch {
      setPermGranted(null);
    }
    setLocalEnabled(await loadData<boolean>('notificationsEnabled', true));
    setServerHandles((await loadServerHandledReminders()).size > 0);
    const scheduled = await getAllScheduledNotifications();
    setItems(scheduled.map(toItem).sort((a, b) => {
      if (a.isRecurring && !b.isRecurring) return -1;
      if (!a.isRecurring && b.isRecurring) return 1;
      if (!a.fireDate) return 1;
      if (!b.fireDate) return -1;
      return a.fireDate.getTime() - b.fireDate.getTime();
    }));
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const requestPerm = useCallback(async () => {
    const granted = await requestNotificationPermissions();
    setPermGranted(granted);
    if (!granted) Alert.alert(tr.notifDisabled, tr.notifDisabledSub);
  }, [tr]);

  const toggleLocal = useCallback((val: boolean) => {
    if (!val) {
      Alert.alert(tr.ncLocalRemindersToggle, tr.notifDisableConfirm, [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.deleteAll,
          style: 'destructive',
          onPress: async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            setLocalEnabled(false);
            await saveData('notificationsEnabled', false);
            setItems([]);
          },
        },
      ]);
    } else {
      setLocalEnabled(true);
      void saveData('notificationsEnabled', true);
      Alert.alert(tr.ncLocalRemindersToggle, tr.notifReenableHint, [{ text: 'OK' }]);
    }
  }, [tr]);

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
    const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const tom = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
    const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (same(d, now)) return `${tr.today} · ${timeStr}`;
    if (same(d, tom)) return `${tr.tomorrow} · ${timeStr}`;
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' }) + ` · ${timeStr}`;
  }, [tr, lang]);

  const sections: NotifSection[] = useMemo(() => {
    const byGroup = new Map<NotifGroup, ScheduledItem[]>();
    for (const item of items) {
      const group = reminderGroup(item.identifier);
      const bucket = byGroup.get(group);
      if (bucket) bucket.push(item);
      else byGroup.set(group, [item]);
    }
    return GROUP_ORDER
      .filter(group => byGroup.has(group))
      .map(group => ({ group, title: GROUP_LABELS[group], meta: GROUP_ICONS[group], data: byGroup.get(group)! }));
  }, [items, GROUP_LABELS]);

  const oneTimeCount = items.filter(i => !i.isRecurring).length;
  const recurringCount = items.length - oneTimeCount;

  const renderItem = useCallback(({ item, section }: { item: ScheduledItem; section: NotifSection }) => (
    <ReminderCard
      item={item}
      meta={section.meta}
      dateText={formatDate(item)}
      isDark={isDark}
      colors={c}
      deleteLabel={tr.delete}
      onDelete={cancelItem}
    />
  ), [formatDate, isDark, c, tr.delete, cancelItem]);

  const listHeader = (
    <View>
      {header}
      {permGranted === false && (
        <TouchableOpacity
          onPress={requestPerm}
          accessibilityRole="button"
          accessibilityLabel={`${tr.notifDisabled}. ${tr.notifDisabledSub}`}
          style={[st.banner, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
          <View style={[st.bannerIcon, { backgroundColor: '#EF444420' }]}>
            <IconSymbol name="bell.slash" size={20} color="#EF4444" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '700' }}>{tr.notifDisabled}</Text>
            <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 2, opacity: 0.8 }}>{tr.notifDisabledSub}</Text>
          </View>
          <IconSymbol name="chevron.right" size={15} color="#EF4444" />
        </TouchableOpacity>
      )}

      <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, marginBottom: 10 }]}>
        <View style={st.toggleRow}>
          <View style={[st.iconBox, { backgroundColor: '#F59E0B20' }]}>
            <IconSymbol name="bell.badge" size={17} color="#F59E0B" />
          </View>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 12 }}>
            {tr.ncLocalRemindersToggle}
          </Text>
          <Switch
            value={localEnabled}
            onValueChange={toggleLocal}
            accessibilityLabel={tr.ncLocalRemindersToggle}
            accessibilityState={{ checked: localEnabled }}
            trackColor={{ false: 'rgba(128,128,128,0.3)', true: c.accent }}
            thumbColor="#fff"
            ios_backgroundColor="rgba(128,128,128,0.3)"
          />
        </View>
      </BlurView>
      <Text style={[st.hint, { color: c.sub }]}>{tr.ncLocalRemindersHint}</Text>
      {serverHandles ? <Text style={[st.hint, { color: c.sub }]}>{tr.ncServerRemindersHint}</Text> : null}

      {items.length > 0 && (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, marginBottom: 12 }}>
            {[
              { value: items.length, label: tr.totalNotif, color: c.accent },
              { value: oneTimeCount, label: tr.activeNotif, color: '#10B981' },
              { value: recurringCount, label: tr.notifRecurring, color: '#0EA5E9' },
            ].map(stat => (
              <BlurView
                key={stat.label}
                intensity={isDark ? 20 : 40}
                tint={isDark ? 'dark' : 'light'}
                style={[st.statCard, { borderColor: c.border, flex: 1 }]}>
                <Text style={{ color: stat.color, fontSize: 24, fontWeight: '800' }}>{stat.value}</Text>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{stat.label}</Text>
              </BlurView>
            ))}
          </View>
          <TouchableOpacity
            onPress={cancelAll}
            accessibilityRole="button"
            accessibilityLabel={tr.deleteAllReminders}
            style={[st.deleteAll, { borderColor: 'rgba(239,68,68,0.3)' }]}>
            <IconSymbol name="trash" size={14} color="#EF4444" />
            <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>{tr.deleteAllReminders}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const listEmpty = permGranted === false ? null : (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
        <IconSymbol name="bell.slash" size={32} color={c.accent} />
      </View>
      <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700' }}>{tr.noNotifications}</Text>
      <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }}>{tr.noNotifSub}</Text>
      <TouchableOpacity
        onPress={() => router.push('/(tabs)')}
        accessibilityRole="button"
        accessibilityLabel={tr.addTask}
        style={[st.emptyBtn, { backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={15} color="#fff" />
        <Text style={st.emptyBtnText}>{tr.addTask}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={item => item.identifier}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => (
        <Text style={[st.sectionLabel, { color: c.sub }]}>{section.title.toUpperCase()}</Text>
      )}
      renderSectionFooter={() => <View style={{ height: 8 }} />}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={listEmpty}
      style={{ flex: 1 }}
      contentContainerStyle={[contentStyle, { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }]}
      showsVerticalScrollIndicator={false}
    />
  );
}

interface CardProps {
  item: ScheduledItem;
  meta: GroupMeta;
  dateText: string;
  isDark: boolean;
  colors: ReminderColors;
  deleteLabel: string;
  onDelete: (item: ScheduledItem) => void;
}

const ReminderCard = React.memo(function ReminderCard({ item, meta, dateText, isDark, colors, deleteLabel, onDelete }: CardProps) {
  const handleDelete = useCallback(() => onDelete(item), [onDelete, item]);
  return (
    <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.itemCard, { borderColor: colors.border }]}>
      <View style={[st.iconBox, { backgroundColor: meta.color + '20' }]}>
        <IconSymbol name={meta.icon} size={17} color={meta.color} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        {item.title ? (
          <Text style={{ color: colors.sub, fontSize: 11, fontWeight: '600', marginBottom: 1 }} numberOfLines={1}>{item.title}</Text>
        ) : null}
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={2}>{item.body || item.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
          <IconSymbol name={item.isRecurring ? 'arrow.clockwise' : 'clock'} size={11} color={meta.color} />
          <Text style={{ color: meta.color, fontSize: 12, fontWeight: '600' }}>{dateText}</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={handleDelete}
        accessibilityRole="button"
        accessibilityLabel={`${deleteLabel}: ${item.body || item.title}`}
        style={st.deleteBtnTarget}>
        <View style={[st.deleteBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
          <IconSymbol name="xmark" size={13} color="#EF4444" />
        </View>
      </TouchableOpacity>
    </BlurView>
  );
});

const st = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  card:         { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  iconBox:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statCard:     { borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 14 },
  itemCard:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingVertical: 6, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  deleteBtnTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  deleteBtn:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  banner:       { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bannerIcon:   { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  hint:         { fontSize: 12, lineHeight: 17, marginBottom: 8, marginHorizontal: 2 },
  deleteAll:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, minHeight: 44, marginBottom: 16 },
  emptyIcon:    { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 18, paddingVertical: 11, borderRadius: 13, marginTop: 20 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
