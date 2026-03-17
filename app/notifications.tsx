import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';
import { cancelReminder, getAllScheduledNotifications, requestNotificationPermissions } from '@/store/notifications';

interface ScheduledItem {
  identifier: string;
  title: string;
  body: string;
  taskId: string | null;
  subtaskId: string | null;
  fireDate: Date | null;
}

export default function NotificationsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [permGranted, setPermGranted] = useState<boolean | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
    warn:   '#F59E0B',
  };

  const load = useCallback(async () => {
    // Check permission status
    const { status } = await Notifications.getPermissionsAsync();
    setPermGranted(status === 'granted');

    // Load global toggle from storage
    const enabled = await loadData<boolean>('notificationsEnabled', true);
    setGlobalEnabled(enabled);

    // Load scheduled notifications
    const scheduled = await getAllScheduledNotifications();
    const mapped: ScheduledItem[] = scheduled
      .filter(n => n.identifier.startsWith('reminder_'))
      .map(n => {
        const trigger = n.trigger as any;
        let fireDate: Date | null = null;
        if (trigger?.value) fireDate = new Date(trigger.value * 1000);
        else if (trigger?.date) fireDate = new Date(trigger.date);
        const data = n.content.data as any;
        return {
          identifier: n.identifier,
          title: n.content.title ?? '',
          body: n.content.body ?? '',
          taskId: data?.taskId ?? null,
          subtaskId: data?.subtaskId ?? null,
          fireDate,
        };
      })
      .sort((a, b) => {
        if (!a.fireDate) return 1;
        if (!b.fireDate) return -1;
        return a.fireDate.getTime() - b.fireDate.getTime();
      });
    setItems(mapped);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const requestPerm = async () => {
    const granted = await requestNotificationPermissions();
    setPermGranted(granted);
    if (!granted) Alert.alert('Дозвіл відхилено', 'Увімкніть сповіщення у Налаштуваннях пристрою.');
  };

  const toggleGlobal = async (val: boolean) => {
    setGlobalEnabled(val);
    await saveData('notificationsEnabled', val);
  };

  const cancelItem = async (item: ScheduledItem) => {
    Alert.alert('Видалити нагадування?', item.body, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити', style: 'destructive', onPress: async () => {
          await cancelReminder(item.taskId ?? '', item.subtaskId ?? undefined);
          setItems(prev => prev.filter(i => i.identifier !== item.identifier));
        },
      },
    ]);
  };

  const cancelAll = () => {
    Alert.alert('Видалити всі нагадування?', `${items.length} сповіщень буде видалено.`, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити всі', style: 'destructive', onPress: async () => {
          await Notifications.cancelAllScheduledNotificationsAsync();
          setItems([]);
        },
      },
    ]);
  };

  const formatDate = (d: Date | null) => {
    if (!d) return '—';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tom = new Date(now); tom.setDate(tom.getDate() + 1);
    const isTomorrow = d.toDateString() === tom.toDateString();
    const timeStr = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Сьогодні · ${timeStr}`;
    if (isTomorrow) return `Завтра · ${timeStr}`;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' }) + ` · ${timeStr}`;
  };

  const isPast = (d: Date | null) => d ? d < new Date() : false;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ marginTop: 14, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[ns.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
              <IconSymbol name="chevron.left" size={17} color={c.sub} />
            </TouchableOpacity>
            <Text style={[ns.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Сповіщення</Text>
            {items.length > 0 && (
              <TouchableOpacity
                onPress={cancelAll}
                style={[ns.headerBtn, { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.3)' }]}>
                <IconSymbol name="trash" size={16} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>

          {/* Permission banner */}
          {permGranted === false && (
            <TouchableOpacity onPress={requestPerm} style={[ns.banner, { backgroundColor: '#EF444415', borderColor: '#EF444440' }]}>
              <View style={[ns.bannerIcon, { backgroundColor: '#EF444420' }]}>
                <IconSymbol name="bell.slash" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#EF4444', fontSize: 14, fontWeight: '700' }}>Сповіщення вимкнено</Text>
                <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 2, opacity: 0.8 }}>Натисніть щоб надати дозвіл</Text>
              </View>
              <IconSymbol name="chevron.right" size={15} color="#EF4444" />
            </TouchableOpacity>
          )}

          {/* Global toggle */}
          <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[ns.card, { borderColor: c.border, marginBottom: 20 }]}>
            <View style={ns.toggleRow}>
              <View style={[ns.iconBox, { backgroundColor: '#F59E0B20' }]}>
                <IconSymbol name="bell.badge" size={17} color="#F59E0B" />
              </View>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 12 }}>Push-сповіщення</Text>
              <Switch
                value={globalEnabled}
                onValueChange={toggleGlobal}
                trackColor={{ false: 'rgba(128,128,128,0.3)', true: '#7C3AED' }}
                thumbColor="#fff"
                ios_backgroundColor="rgba(128,128,128,0.3)"
              />
            </View>
          </BlurView>

          {/* Stats */}
          {items.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[ns.statCard, { borderColor: c.border, flex: 1 }]}>
                <Text style={{ color: c.accent, fontSize: 24, fontWeight: '800' }}>{items.length}</Text>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>Всього</Text>
              </BlurView>
              <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[ns.statCard, { borderColor: c.border, flex: 1 }]}>
                <Text style={{ color: '#10B981', fontSize: 24, fontWeight: '800' }}>{items.filter(i => !isPast(i.fireDate)).length}</Text>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>Активних</Text>
              </BlurView>
              <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[ns.statCard, { borderColor: c.border, flex: 1 }]}>
                <Text style={{ color: '#EF4444', fontSize: 24, fontWeight: '800' }}>{items.filter(i => isPast(i.fireDate)).length}</Text>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>Минулих</Text>
              </BlurView>
            </View>
          )}

          {/* Section: active */}
          {items.filter(i => !isPast(i.fireDate)).length > 0 && (
            <>
              <Text style={[ns.sectionLabel, { color: c.sub }]}>ЗАПЛАНОВАНІ</Text>
              <View style={{ gap: 8, marginBottom: 16 }}>
                {items.filter(i => !isPast(i.fireDate)).map(item => (
                  <BlurView key={item.identifier} intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[ns.itemCard, { borderColor: c.border }]}>
                    <View style={[ns.iconBox, { backgroundColor: '#F59E0B20' }]}>
                      <IconSymbol name={item.subtaskId ? 'checkmark.circle' : 'list.bullet'} size={17} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.body}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
                        <IconSymbol name="clock" size={11} color="#F59E0B" />
                        <Text style={{ color: '#F59E0B', fontSize: 12, fontWeight: '600' }}>{formatDate(item.fireDate)}</Text>
                      </View>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {item.subtaskId ? 'Підзавдання' : 'Завдання'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => cancelItem(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[ns.deleteBtn, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                      <IconSymbol name="xmark" size={13} color="#EF4444" />
                    </TouchableOpacity>
                  </BlurView>
                ))}
              </View>
            </>
          )}

          {/* Section: past */}
          {items.filter(i => isPast(i.fireDate)).length > 0 && (
            <>
              <Text style={[ns.sectionLabel, { color: c.sub }]}>МИНУЛІ</Text>
              <View style={{ gap: 8, marginBottom: 16 }}>
                {items.filter(i => isPast(i.fireDate)).map(item => (
                  <BlurView key={item.identifier} intensity={isDark ? 15 : 30} tint={isDark ? 'dark' : 'light'} style={[ns.itemCard, { borderColor: c.border, opacity: 0.6 }]}>
                    <View style={[ns.iconBox, { backgroundColor: c.dim }]}>
                      <IconSymbol name={item.subtaskId ? 'checkmark.circle' : 'list.bullet'} size={17} color={c.sub} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.body}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6 }}>
                        <IconSymbol name="clock" size={11} color={c.sub} />
                        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>{formatDate(item.fireDate)}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => cancelItem(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={[ns.deleteBtn, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
                      <IconSymbol name="xmark" size={13} color="#EF4444" />
                    </TouchableOpacity>
                  </BlurView>
                ))}
              </View>
            </>
          )}

          {/* Empty state */}
          {items.length === 0 && permGranted !== false && (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[ns.emptyIcon, { backgroundColor: c.accent + '18' }]}>
                <IconSymbol name="bell.slash" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700' }}>Немає сповіщень</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                Відкрийте завдання або підзавдання{'\n'}щоб встановити нагадування
              </Text>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ns = StyleSheet.create({
  pageTitle:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  headerBtn:    { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginLeft: 2 },
  card:         { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  toggleRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  iconBox:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  statCard:     { borderRadius: 14, borderWidth: 1, overflow: 'hidden', paddingVertical: 14, paddingHorizontal: 14 },
  itemCard:     { borderRadius: 16, borderWidth: 1, overflow: 'hidden', padding: 12, flexDirection: 'row', alignItems: 'center' },
  deleteBtn:    { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  banner:       { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  bannerIcon:   { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:    { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
