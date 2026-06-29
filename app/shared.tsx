import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { Events, track } from '@/utils/analytics';
import { uuid } from '@/utils/uuid';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = 'https://flowi-server-app.vercel.app/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType = 'shopping' | 'tasks' | 'notes';

interface LocalItem {
  local_id: string;
  text: string;
  checked: boolean;
  deleted: boolean;
  updated_at: string;
}

interface SharedSection {
  id: string;
  type: SectionType;
  name: string;
}

interface GroupData {
  id: string;
  name: string;
  secret: string;
  member_count: number;
  sections: SharedSection[];
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_DEVICE = 'shared_device_id';
const KEY_GROUP  = 'shared_group';
const localItemsKey = (type: SectionType) => `shared_local_items_${type}`;

// ─── API helpers ─────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── Section meta ─────────────────────────────────────────────────────────────

const SECTIONS: { type: SectionType; labelKey: 'shShopping' | 'shTasks' | 'shNotes'; icon: string }[] = [
  { type: 'shopping', labelKey: 'shShopping', icon: 'cart.fill' },
  { type: 'tasks',    labelKey: 'shTasks',    icon: 'checklist' },
  { type: 'notes',    labelKey: 'shNotes',    icon: 'note.text' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SharedScreen() {
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const memberLabel = (n: number) => (lang === 'uk' ? pluralMember(n) : tr.participants);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#E0F8FF' : '#0C2A33',
    sub:    isDark ? 'rgba(224,248,255,0.45)' : 'rgba(12,42,51,0.45)',
    accent: '#06B6D4',
    green:  '#10B981',
    red:    '#EF4444',
    sheet:  isDark ? 'rgba(10,22,28,0.98)' : 'rgba(245,252,255,0.98)',
    input:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    dim:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
  };

  // ─── State ────────────────────────────────────────────────────────────────

  const [initialized, setInitialized]     = useState(false);
  const [deviceId, setDeviceId]           = useState<string | null>(null);
  const [group, setGroup]                 = useState<GroupData | null>(null);
  const [activeSection, setActiveSection] = useState<SectionType>('shopping');
  const [items, setItems]                 = useState<Record<SectionType, LocalItem[]>>({
    shopping: [], tasks: [], notes: [],
  });

  const [refreshing, setRefreshing]         = useState(false);
  const [syncing, setSyncing]               = useState(false);
  const [syncError, setSyncError]           = useState(false);
  const [lastSync, setLastSync]             = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal]     = useState(false);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);

  const [groupName, setGroupName]   = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [newItemText, setNewItemText] = useState('');
  const [editItem, setEditItem]       = useState<LocalItem | null>(null);
  const [editText, setEditText]       = useState('');
  const [creating, setCreating]       = useState(false);
  const [joining, setJoining]         = useState(false);
  const [copied, setCopied]           = useState(false);
  const [undoItem, setUndoItem]       = useState<{ type: SectionType; item: LocalItem } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      // load or create device ID
      let did = await AsyncStorage.getItem(KEY_DEVICE);
      if (!did) {
        did = uuid();
        await AsyncStorage.setItem(KEY_DEVICE, did);
      }
      setDeviceId(did);

      // load saved group
      const raw = await AsyncStorage.getItem(KEY_GROUP);
      if (raw) {
        try { setGroup(JSON.parse(raw)); } catch {}
      }

      // load local items for all sections
      const shopping = await loadLocalItems('shopping');
      const tasks    = await loadLocalItems('tasks');
      const notes    = await loadLocalItems('notes');
      setItems({ shopping, tasks, notes });

      setInitialized(true);
    })();
  }, []);

  // Очищення таймера undo при розмонтуванні
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  // ─── Sync on focus ────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    if (initialized && group && deviceId) {
      syncWithServer(group, deviceId);
      connectWs(group.id, deviceId);
      // Polling-fallback: WS на Vercel ненадійний, тож періодично підтягуємо дельту,
      // поки екран у фокусі. Це гарантує оновлення навіть без realtime.
      const iv = setInterval(() => syncWithServer(group, deviceId), 25000);
      return () => {
        clearInterval(iv);
        wsRef.current?.close();
        wsRef.current = null;
      };
    }
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [initialized, group?.id, deviceId]));

  // ─── WebSocket ────────────────────────────────────────────────────────────

  function connectWs(groupId: string, did: string) {
    if (wsRef.current) return;
    try {
      const ws = new WebSocket(`wss://flowi-server-app.vercel.app/ws/group/${groupId}/?device_id=${did}`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'item_updated') {
            const { section_id, item } = msg;
            // find which local section type this belongs to
            setGroup(g => {
              if (!g) return g;
              const sec = g.sections.find(s => s.id === section_id);
              if (!sec) return g;
              applyRemoteItem(sec.type, item);
              return g;
            });
          }
        } catch {}
      };
      ws.onerror = () => {};
      wsRef.current = ws;
    } catch {}
  }

  function applyRemoteItem(type: SectionType, remote: any) {
    setItems(prev => {
      const list = [...prev[type]];
      const idx = list.findIndex(i => i.local_id === remote.local_id);
      const merged: LocalItem = {
        local_id: remote.local_id,
        text: remote.data?.text ?? '',
        checked: remote.data?.checked ?? false,
        deleted: remote.deleted ?? false,
        updated_at: remote.updated_at,
      };
      if (idx >= 0) {
        // Conflict-resolution: застосовуємо віддалене лише якщо воно не старіше
        // за локальне (last-write-wins за updated_at) — щоб не затерти свіжі локальні правки.
        const local = list[idx];
        const localT = local.updated_at ? new Date(local.updated_at).getTime() : 0;
        const remoteT = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;
        if (localT > remoteT) return prev; // локальне свіжіше — не чіпаємо
        list[idx] = merged;
      } else {
        list.unshift(merged);
      }
      const next = { ...prev, [type]: list };
      saveLocalItems(type, list);
      return next;
    });
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  async function syncWithServer(g: GroupData, did: string) {
    setSyncing(true);
    try {
      // collect all local items across sections
      const outgoing: any[] = [];
      for (const sec of g.sections) {
        const localList = items[sec.type] ?? [];
        for (const item of localList) {
          outgoing.push({
            section_id: sec.id,
            local_id: item.local_id,
            data: { text: item.text, checked: item.checked },
            deleted: item.deleted,
          });
        }
      }

      const res = await apiFetch('/sync/', {
        method: 'POST',
        body: JSON.stringify({
          device_id: did,
          group_id: g.id,
          since: lastSync,
          items: outgoing,
        }),
      });

      setLastSync(res.server_time);

      // apply remote delta
      for (const remote of (res.items ?? [])) {
        const sec = g.sections.find(s => s.id === remote.section_id);
        if (sec) applyRemoteItem(sec.type, remote);
      }

      // also refresh group info (member count etc)
      const freshGroup = await apiFetch(`/groups/${g.id}/`);
      const updated = { ...g, member_count: freshGroup.member_count, sections: freshGroup.sections };
      setGroup(updated);
      await AsyncStorage.setItem(KEY_GROUP, JSON.stringify(updated));

      setSyncError(false);
    } catch (e) {
      if (__DEV__) console.warn('[shared] sync failed:', e);
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }

  // ─── Local items helpers ──────────────────────────────────────────────────

  async function loadLocalItems(type: SectionType): Promise<LocalItem[]> {
    try {
      const raw = await AsyncStorage.getItem(localItemsKey(type));
      if (!raw) return [];
      return JSON.parse(raw);
    } catch { return []; }
  }

  async function saveLocalItems(type: SectionType, list: LocalItem[]) {
    await AsyncStorage.setItem(localItemsKey(type), JSON.stringify(list));
  }

  async function persistItem(type: SectionType, item: LocalItem) {
    setItems(prev => {
      const list = [...prev[type]];
      const idx = list.findIndex(i => i.local_id === item.local_id);
      if (idx >= 0) list[idx] = item;
      else list.unshift(item);
      saveLocalItems(type, list);
      return { ...prev, [type]: list };
    });

    // push to server if group
    if (group && deviceId) {
      const sec = group.sections.find(s => s.type === type);
      if (sec) {
        try {
          await apiFetch(`/sections/${sec.id}/items/`, {
            method: 'POST',
            body: JSON.stringify({
              device_id: deviceId,
              local_id: item.local_id,
              data: { text: item.text, checked: item.checked },
              deleted: item.deleted,
            }),
          });
        } catch {}
      }
    }
  }

  // ─── Item actions ─────────────────────────────────────────────────────────

  async function addItem() {
    const text = newItemText.trim();
    if (!text) return;
    const item: LocalItem = {
      local_id: uuid(),
      text,
      checked: false,
      deleted: false,
      updated_at: new Date().toISOString(),
    };
    await persistItem(activeSection, item);
    setNewItemText('');
    setShowAddModal(false);
  }

  async function toggleItem(item: LocalItem) {
    const updated = { ...item, checked: !item.checked, updated_at: new Date().toISOString() };
    await persistItem(activeSection, updated);
  }

  async function deleteItem(item: LocalItem) {
    const updated = { ...item, deleted: true, updated_at: new Date().toISOString() };
    await persistItem(activeSection, updated);
  }

  // Видалення з можливістю «Скасувати» (для кнопки кошика в рядку)
  function deleteWithUndo(item: LocalItem) {
    const type = activeSection;
    deleteItem(item);
    setUndoItem({ type, item });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    Animated.timing(toastAnim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    undoTimer.current = setTimeout(hideUndo, 4000);
  }

  function hideUndo() {
    Animated.timing(toastAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setUndoItem(null));
  }

  async function restoreUndo() {
    if (!undoItem) return;
    const restored = { ...undoItem.item, deleted: false, updated_at: new Date().toISOString() };
    const type = undoItem.type;
    setItems(prev => {
      const list = [...prev[type]];
      const idx = list.findIndex(i => i.local_id === restored.local_id);
      if (idx >= 0) list[idx] = restored; else list.unshift(restored);
      saveLocalItems(type, list);
      return { ...prev, [type]: list };
    });
    if (group && deviceId) {
      const sec = group.sections.find(s => s.type === type);
      if (sec) {
        try {
          await apiFetch(`/sections/${sec.id}/items/`, {
            method: 'POST',
            body: JSON.stringify({ device_id: deviceId, local_id: restored.local_id, data: { text: restored.text, checked: restored.checked }, deleted: false }),
          });
        } catch {}
      }
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    hideUndo();
  }

  async function copySecret() {
    if (!group?.secret) return;
    await Clipboard.setStringAsync(group.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function shareSecret() {
    if (!group?.secret) return;
    try {
      await Share.share({ message: tr.shInvite.replace('{name}', group.name).replace('{code}', group.secret) });
      track(Events.SharedSecretShared);
    } catch {}
  }

  async function saveEditItem() {
    if (!editItem || !editText.trim()) return;
    const updated = { ...editItem, text: editText.trim(), updated_at: new Date().toISOString() };
    await persistItem(activeSection, updated);
    setShowEditModal(false);
    setEditItem(null);
  }

  // ─── Group actions ────────────────────────────────────────────────────────

  async function createGroup() {
    if (!deviceId) return;
    setCreating(true);
    try {
      const data = await apiFetch('/groups/create/', {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, name: groupName.trim() || tr.sharedTitle }),
      });
      const g: GroupData = {
        id: data.id, name: data.name, secret: data.secret,
        member_count: data.member_count, sections: data.sections,
      };
      setGroup(g);
      await AsyncStorage.setItem(KEY_GROUP, JSON.stringify(g));
      track(Events.SharedGroupCreated);
      setShowCreateModal(false);
      setGroupName('');
      setShowSecretModal(true);
      // sync local items to server
      setTimeout(() => syncWithServer(g, deviceId), 500);
    } catch {
      Alert.alert(tr.errGeneric, tr.errCreateGroup);
    } finally {
      setCreating(false);
    }
  }

  async function joinGroup() {
    if (!deviceId || !secretInput.trim()) return;
    setJoining(true);
    try {
      const data = await apiFetch('/groups/join/', {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, secret: secretInput.trim() }),
      });
      const g: GroupData = {
        id: data.id, name: data.name, secret: data.secret,
        member_count: data.member_count, sections: data.sections,
      };
      setGroup(g);
      await AsyncStorage.setItem(KEY_GROUP, JSON.stringify(g));
      setShowJoinModal(false);
      setSecretInput('');
      syncWithServer(g, deviceId);
    } catch {
      Alert.alert(tr.errGeneric, tr.errInvalidCode);
    } finally {
      setJoining(false);
    }
  }

  async function leaveGroup() {
    Alert.alert(tr.leaveGroupTitle, tr.leaveGroupMsg.replace('{name}', group?.name ?? ''), [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.leave, style: 'destructive', onPress: async () => {
          if (group && deviceId) {
            try {
              await apiFetch(`/groups/${group.id}/leave/`, {
                method: 'POST',
                body: JSON.stringify({ device_id: deviceId }),
              });
            } catch {}
          }
          wsRef.current?.close();
          wsRef.current = null;
          setGroup(null);
          setLastSync(null);
          await AsyncStorage.removeItem(KEY_GROUP);
        },
      },
    ]);
  }

  // ─── Refresh ─────────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (group && deviceId) {
      syncWithServer(group, deviceId).finally(() => setRefreshing(false));
    } else {
      (async () => {
        const s = await loadLocalItems(activeSection);
        setItems(prev => ({ ...prev, [activeSection]: s }));
        setRefreshing(false);
      })();
    }
  }, [group, deviceId, activeSection]);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const visibleItems = (items[activeSection] ?? []).filter(i => !i.deleted);
  const checkedCount = visibleItems.filter(i => i.checked).length;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <View style={st.header}>
          <View>
            <Text style={[st.title, { color: c.text }]}>{tr.sharedTitle}</Text>
            {group ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <View style={[st.dot, { backgroundColor: syncError ? c.red : c.green }]} />
                <Text style={[st.subtitle, { color: c.sub }]}>
                  {group.name} · {group.member_count} {memberLabel(group.member_count)}
                </Text>
                {syncing
                  ? <ActivityIndicator size="small" color={c.accent} style={{ marginLeft: 4 }} />
                  : syncError && <Text style={[st.subtitle, { color: c.red, marginLeft: 2 }]}>· {tr.shOffline}</Text>}
              </View>
            ) : (
              <Text style={[st.subtitle, { color: c.sub }]}>{tr.shLocalData}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {group && (
              <TouchableOpacity
                onPress={() => setShowSecretModal(true)}
                accessibilityRole="button" accessibilityLabel={tr.shSecretTitle}
                style={[st.headerBtn, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="person.badge.key.fill" size={18} color={c.accent} />
              </TouchableOpacity>
            )}
            {group ? (
              <TouchableOpacity
                onPress={leaveGroup}
                accessibilityRole="button" accessibilityLabel={tr.leave}
                style={[st.headerBtn, { backgroundColor: c.red + '18' }]}>
                <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color={c.red} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setShowCreateModal(true)}
                accessibilityRole="button" accessibilityLabel={tr.createGroup}
                style={[st.headerBtn, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="person.2.badge.plus" size={18} color={c.accent} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── Section tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4, gap: 8 }}
          style={{ flexGrow: 0, marginBottom: 8 }}>
          {SECTIONS.map(s => {
            const active = activeSection === s.type;
            return (
              <TouchableOpacity
                key={s.type}
                onPress={() => setActiveSection(s.type)}
                style={[
                  st.tab,
                  active
                    ? { backgroundColor: c.accent }
                    : { backgroundColor: c.dim, borderColor: c.border, borderWidth: 1 },
                ]}>
                <IconSymbol name={s.icon as any} size={15} color={active ? '#fff' : c.sub} />
                <Text style={[st.tabLabel, { color: active ? '#fff' : c.sub }]}>{tr[s.labelKey]}</Text>
                {!active && items[s.type].filter(i => !i.deleted && !i.checked).length > 0 && (
                  <View style={[st.badge, { backgroundColor: c.accent }]}>
                    <Text style={st.badgeText}>{items[s.type].filter(i => !i.deleted && !i.checked).length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Sync error banner ── */}
        {group && syncError && (
          <View style={[st.syncBanner, { backgroundColor: c.red + '18', borderColor: c.red + '30' }]}>
            <IconSymbol name="exclamationmark.triangle.fill" size={12} color={c.red} />
            <Text style={{ color: c.red, fontSize: 12, fontWeight: '600', marginLeft: 6, flex: 1 }}>
              {tr.offlineBanner}
            </Text>
          </View>
        )}

        {/* ── Items list ── */}
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

          {/* No group banner */}
          {!group && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border, marginBottom: 16 }]}>
              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View style={[st.iconBox, { backgroundColor: c.accent + '20' }]}>
                    <IconSymbol name="person.2.fill" size={18} color={c.accent} />
                  </View>
                  <Text style={[st.cardTitle, { color: c.text }]}>{tr.shShareAccess}</Text>
                </View>
                <Text style={[st.cardDesc, { color: c.sub }]}>
                  {tr.shLocalDesc}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => setShowCreateModal(true)}
                    style={[st.btn, { backgroundColor: c.accent, flex: 1 }]}>
                    <IconSymbol name="plus" size={15} color="#fff" />
                    <Text style={[st.btnLabel, { color: '#fff' }]}>{tr.createGroup}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowJoinModal(true)}
                    style={[st.btn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, flex: 1 }]}>
                    <IconSymbol name="key.fill" size={15} color={c.accent} />
                    <Text style={[st.btnLabel, { color: c.accent }]}>{tr.joinByCode}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          )}

          {/* Progress bar for shopping */}
          {activeSection === 'shopping' && visibleItems.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={[st.progressLabel, { color: c.sub }]}>{tr.shBought}</Text>
                <Text style={[st.progressLabel, { color: c.sub }]}>{checkedCount} / {visibleItems.length}</Text>
              </View>
              <View style={[st.progressTrack, { backgroundColor: c.dim }]}>
                <View style={[st.progressFill, {
                  backgroundColor: c.green,
                  width: `${visibleItems.length ? (checkedCount / visibleItems.length) * 100 : 0}%`,
                }]} />
              </View>
            </View>
          )}

          {/* Empty state */}
          {visibleItems.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <IconSymbol name={SECTIONS.find(s => s.type === activeSection)!.icon as any} size={44} color={c.sub} />
              <Text style={[st.emptyTitle, { color: c.text }]}>{tr.emptyListTitle}</Text>
              <Text style={[st.emptyDesc, { color: c.sub }]}>{tr.pressPlusToAdd}</Text>
            </View>
          )}

          {/* Items */}
          {visibleItems.length > 0 && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}>
              {visibleItems.map((item, idx) => {
                const isNotes = activeSection === 'notes';
                return (
                  <View
                    key={item.local_id}
                    style={[st.itemRow, idx < visibleItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    {!isNotes && (
                      <TouchableOpacity onPress={() => toggleItem(item)} style={st.checkbox}>
                        <View style={[
                          st.checkCircle,
                          {
                            borderColor: item.checked ? c.green : c.border,
                            backgroundColor: item.checked ? c.green : 'transparent',
                          },
                        ]}>
                          {item.checked && <IconSymbol name="checkmark" size={11} color="#fff" />}
                        </View>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => {
                        setEditItem(item);
                        setEditText(item.text);
                        setShowEditModal(true);
                      }}>
                      <Text style={[st.itemText, {
                        color: !isNotes && item.checked ? c.sub : c.text,
                        textDecorationLine: !isNotes && item.checked ? 'line-through' : 'none',
                      }]}>{item.text}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteWithUndo(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="trash" size={16} color={c.red} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </BlurView>
          )}

          {/* Clear checked (shopping only) */}
          {activeSection === 'shopping' && checkedCount > 0 && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(tr.shClearBought, tr.shClearBoughtMsg.replace('{n}', String(checkedCount)), [
                  { text: tr.cancel, style: 'cancel' },
                  { text: tr.delete, style: 'destructive', onPress: () => visibleItems.filter(i => i.checked).forEach(i => deleteItem(i)) },
                ]);
              }}
              style={[st.clearBtn, { borderColor: c.border }]}>
              <IconSymbol name="trash" size={14} color={c.sub} />
              <Text style={[st.clearLabel, { color: c.sub }]}>{tr.shClearBought} ({checkedCount})</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── FAB ── */}
      <TouchableOpacity
        onPress={() => setShowAddModal(true)}
        accessibilityRole="button" accessibilityLabel={tr.add}
        style={[st.fab, { backgroundColor: c.accent, bottom: Platform.OS === 'ios' ? 108 : 88 }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ── Undo toast ── */}
      {undoItem && (
        <Animated.View pointerEvents="box-none"
          style={[st.toast, {
            bottom: Platform.OS === 'ios' ? 116 : 96,
            opacity: toastAnim,
            transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          }]}>
          <BlurView intensity={isDark ? 60 : 85} tint={isDark ? 'dark' : 'light'} style={[st.toastInner, { borderColor: c.border }]}>
            <IconSymbol name="trash" size={14} color={c.sub} />
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 8 }}>{tr.shDeleted}</Text>
            <TouchableOpacity onPress={restoreUndo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '800' }}>{tr.shUndo}</Text>
            </TouchableOpacity>
          </BlurView>
        </Animated.View>
      )}

      {/* ── Add Item Modal ── */}
      <Modal visible={showAddModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowAddModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowAddModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowAddModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>
                  {tr.shAddTo.replace('{name}', tr[SECTIONS.find(s => s.type === activeSection)!.labelKey])}
                </Text>
                <TextInput
                  autoFocus
                  placeholder={tr.shTextPh}
                  placeholderTextColor={c.sub}
                  value={newItemText}
                  onChangeText={setNewItemText}
                  onSubmitEditing={addItem}
                  returnKeyType="done"
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />
                <TouchableOpacity
                  onPress={addItem}
                  disabled={!newItemText.trim()}
                  style={[st.btn, { backgroundColor: newItemText.trim() ? c.accent : c.dim, marginTop: 4 }]}>
                  <Text style={[st.btnLabel, { color: newItemText.trim() ? '#fff' : c.sub }]}>{tr.add}</Text>
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Item Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowEditModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowEditModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.edit}</Text>
                <TextInput
                  autoFocus
                  placeholder={tr.shTextPh}
                  placeholderTextColor={c.sub}
                  value={editText}
                  onChangeText={setEditText}
                  onSubmitEditing={saveEditItem}
                  returnKeyType="done"
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />
                <TouchableOpacity
                  onPress={saveEditItem}
                  disabled={!editText.trim()}
                  style={[st.btn, { backgroundColor: editText.trim() ? c.accent : c.dim, marginTop: 4 }]}>
                  <Text style={[st.btnLabel, { color: editText.trim() ? '#fff' : c.sub }]}>{tr.save}</Text>
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Group Modal ── */}
      <Modal visible={showCreateModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowCreateModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowCreateModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.newGroupTitle}</Text>
                <Text style={[st.sheetDesc, { color: c.sub }]}>
                  {tr.newGroupDesc}
                </Text>
                <TextInput
                  placeholder={tr.groupNamePh}
                  placeholderTextColor={c.sub}
                  value={groupName}
                  onChangeText={setGroupName}
                  returnKeyType="done"
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />
                <TouchableOpacity
                  onPress={createGroup}
                  disabled={creating}
                  style={[st.btn, { backgroundColor: c.accent, marginTop: 4 }]}>
                  {creating
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[st.btnLabel, { color: '#fff' }]}>{tr.createGroup}</Text>}
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Join Group Modal ── */}
      <Modal visible={showJoinModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowJoinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowJoinModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowJoinModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.joinTitle}</Text>
                <Text style={[st.sheetDesc, { color: c.sub }]}>
                  {tr.joinDesc}
                </Text>
                <TextInput
                  autoFocus
                  autoCapitalize="characters"
                  placeholder="XXXX-0000"
                  placeholderTextColor={c.sub}
                  value={secretInput}
                  onChangeText={t => setSecretInput(t.toUpperCase())}
                  returnKeyType="done"
                  onSubmitEditing={joinGroup}
                  style={[st.input, {
                    backgroundColor: c.input, color: c.text, borderColor: c.border,
                    fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 4,
                  }]}
                />
                <TouchableOpacity
                  onPress={joinGroup}
                  disabled={joining || !secretInput.trim()}
                  style={[st.btn, { backgroundColor: secretInput.trim() ? c.accent : c.dim, marginTop: 4 }]}>
                  {joining
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[st.btnLabel, { color: secretInput.trim() ? '#fff' : c.sub }]}>{tr.joinAction}</Text>}
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Secret Modal ── */}
      <Modal visible={showSecretModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowSecretModal(false)}>
        <Pressable style={st.overlay} onPress={() => setShowSecretModal(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
              style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <HandleRow c={c} onClose={() => setShowSecretModal(false)} />
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <View style={[st.secretIcon, { backgroundColor: c.accent + '20' }]}>
                  <IconSymbol name="key.fill" size={28} color={c.accent} />
                </View>
                <Text style={[st.sheetTitle, { color: c.text, marginTop: 14 }]}>{tr.shSecretTitle}</Text>
                <Text style={[st.sheetDesc, { color: c.sub, textAlign: 'center' }]}>
                  {tr.shareCodeDesc.replace('{name}', group?.name ?? '')}
                </Text>
                <View style={[st.secretBox, { backgroundColor: c.accent + '15', borderColor: c.accent + '40' }]}>
                  <Text style={[st.secretText, { color: c.accent }]}>{group?.secret}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' }}>
                  <TouchableOpacity onPress={copySecret}
                    style={[st.btn, { flex: 1, backgroundColor: copied ? c.green : c.accent + '20' }]}>
                    <IconSymbol name={copied ? 'checkmark' : 'doc.on.clipboard'} size={15} color={copied ? '#fff' : c.accent} />
                    <Text style={[st.btnLabel, { color: copied ? '#fff' : c.accent }]}>{copied ? tr.shCopied : tr.shCopy}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={shareSecret}
                    style={[st.btn, { flex: 1, backgroundColor: c.accent }]}>
                    <IconSymbol name="square.and.arrow.up" size={15} color="#fff" />
                    <Text style={[st.btnLabel, { color: '#fff' }]}>{tr.shShareBtn}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[{ color: c.sub, fontSize: 12, marginTop: 12 }]}>
                  {group?.member_count} {memberLabel(group?.member_count ?? 1)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowSecretModal(false)}
                style={[st.btn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, marginTop: 8 }]}>
                <Text style={[st.btnLabel, { color: c.sub }]}>{tr.close}</Text>
              </TouchableOpacity>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Handle row helper ────────────────────────────────────────────────────────

function HandleRow({ c, onClose }: { c: any; onClose: () => void }) {
  return (
    <View style={st.handleRow}>
      <View style={{ flex: 1 }} />
      <View style={[st.handle, { backgroundColor: c.border }]} />
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <IconSymbol name="xmark" size={17} color={c.sub} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Util ─────────────────────────────────────────────────────────────────────

function pluralMember(n: number) {
  if (n === 1) return 'учасник';
  if (n >= 2 && n <= 4) return 'учасники';
  return 'учасників';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 },
  title:         { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  subtitle:      { fontSize: 13, fontWeight: '500' },
  dot:           { width: 7, height: 7, borderRadius: 4 },
  headerBtn:     { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tab:           { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabLabel:      { fontSize: 13, fontWeight: '600' },
  badge:         { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText:     { color: '#fff', fontSize: 10, fontWeight: '800' },
  card:          { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  cardTitle:     { fontSize: 16, fontWeight: '700' },
  cardDesc:      { fontSize: 13, lineHeight: 19 },
  iconBox:       { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  itemRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  checkbox:      { padding: 2 },
  checkCircle:   { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  itemText:      { fontSize: 15, fontWeight: '500', flex: 1 },
  emptyTitle:    { fontSize: 17, fontWeight: '700', marginTop: 14, marginBottom: 6 },
  emptyDesc:     { fontSize: 14 },
  progressLabel: { fontSize: 12, fontWeight: '500' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill:  { height: 6, borderRadius: 3 },
  clearBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderRadius: 12, marginTop: 4 },
  clearLabel:    { fontSize: 13, fontWeight: '500' },
  fab:           { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#06B6D4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
  toast:         { position: 'absolute', left: 16, right: 16 },
  toastInner:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, overflow: 'hidden' },
  syncBanner:    { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper:  { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:         { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:        { width: 36, height: 4, borderRadius: 2 },
  sheetTitle:    { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  sheetDesc:     { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  input:         { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12 },
  btn:           { paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  btnLabel:      { fontSize: 15, fontWeight: '700' },
  secretIcon:    { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  secretBox:     { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16, marginTop: 16 },
  secretText:    { fontSize: 28, fontWeight: '800', letterSpacing: 6 },
});
