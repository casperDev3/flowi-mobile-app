import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = 'https://api.flowi.casperdev.site/api';
const WS_BASE  = 'wss://api.flowi.casperdev.site/ws';

// ─── Utils ────────────────────────────────────────────────────────────────────

function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

async function api(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw Object.assign(new Error(`API ${res.status}`), { status: res.status, json });
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SectionType = 'shopping' | 'tasks' | 'notes';
type Priority    = 'high' | 'medium' | 'low';
type SortMode    = 'newest' | 'oldest' | 'alpha' | 'priority';
type FilterMode  = 'all' | 'active' | 'done';

interface LocalItem {
  local_id:  string;
  text:      string;
  checked:   boolean;
  deleted:   boolean;
  updated_at: string;
  // type-specific extras
  qty?:      string;
  unit?:     string;
  priority?: Priority;
  note?:     string;
}

interface SharedSection { id: string; type: SectionType; name: string }

interface GroupData {
  id: string; name: string;
  secret: string; secret_rotated_at: string;
  member_count: number; sections: SharedSection[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
const SIDEBAR_W = Math.round(SCREEN_W * 0.92);

const SECTION_META: Record<SectionType, { label: string; icon: string; placeholder: string }> = {
  shopping: { label: 'Покупки',  icon: 'cart.fill',  placeholder: 'Список покупок' },
  tasks:    { label: 'Завдання', icon: 'checklist',   placeholder: 'Список завдань' },
  notes:    { label: 'Нотатки',  icon: 'note.text',   placeholder: 'Нотатник' },
};

const TAB_ORDER: SectionType[] = ['shopping', 'tasks', 'notes'];

const UNITS = ['шт', 'кг', 'г', 'л', 'мл', 'упак', 'пачк'];

const PRIORITY_COLOR: Record<Priority, string> = {
  high: '#EF4444', medium: '#F59E0B', low: '#10B981',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Висока', medium: 'Середня', low: 'Низька',
};

const SORT_LABEL: Record<SortMode, string> = {
  newest: 'Нові↓', oldest: 'Старі↑', alpha: 'А-Я', priority: 'Пріор.',
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const KEY_DEVICE        = 'shared_device_id';
const KEY_GROUPS        = 'shared_groups_list';
const KEY_LAST_SYNC     = (gid: string) => `shared_sync_${gid}`;
const KEY_SECTION_ITEMS = (sid: string) => `shared_items_${sid}`;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SharedScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#E0F8FF' : '#0C2A33',
    sub:    isDark ? 'rgba(224,248,255,0.45)' : 'rgba(12,42,51,0.45)',
    accent: '#06B6D4',
    green:  '#10B981',
    red:    '#EF4444',
    amber:  '#F59E0B',
    sheet:  isDark ? 'rgba(10,22,28,0.98)' : 'rgba(245,252,255,0.98)',
    input:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    dim:    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    sidebar: isDark ? '#0A1018' : '#F5F9FF',
    toolbar: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
  };

  // ─── Core state ───────────────────────────────────────────────────────────

  const [initialized, setInitialized] = useState(false);
  const [deviceId, setDeviceId]       = useState<string | null>(null);
  const [groups, setGroups]           = useState<GroupData[]>([]);
  const [viewMode, setViewMode]       = useState<'groups' | 'group'>('groups');
  const [activeGroup, setActiveGroup] = useState<GroupData | null>(null);
  const [activeTab, setActiveTab]     = useState<SectionType>('shopping');

  // ─── Sidebar state ────────────────────────────────────────────────────────

  const [sidebarSection, setSidebarSection] = useState<SharedSection | null>(null);
  const [sidebarItems, setSidebarItems]     = useState<LocalItem[]>([]);
  const [sidebarSyncing, setSidebarSyncing] = useState(false);

  // Filter / Sort / Search
  const [sbFilter, setSbFilter]         = useState<FilterMode>('active');
  const [sbSort, setSbSort]             = useState<SortMode>('newest');
  const [sbSearch, setSbSearch]         = useState('');
  const [sbSearchOpen, setSbSearchOpen] = useState(false);
  const [showDone, setShowDone]         = useState(false);
  const [sbMenuOpen, setSbMenuOpen]     = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);

  // Add-item form
  const [addText, setAddText]       = useState('');
  const [addQty, setAddQty]         = useState('1');
  const [addUnit, setAddUnit]       = useState('шт');
  const [addPriority, setAddPriority] = useState<Priority>('medium');
  const [addNote, setAddNote]       = useState('');

  // ─── Group / section search ────────────────────────────────────────────────

  const [groupSearch, setGroupSearch]         = useState('');
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [sectionSearch, setSectionSearch]     = useState('');
  const [sectionSearchOpen, setSectionSearchOpen] = useState(false);

  // ─── Animations ───────────────────────────────────────────────────────────

  const sidebarAnim  = useRef(new Animated.Value(SIDEBAR_W)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // ─── Loading ──────────────────────────────────────────────────────────────

  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // ─── Modals ───────────────────────────────────────────────────────────────

  const [showGroupSheet, setShowGroupSheet]           = useState(false);
  const [showCreateModal, setShowCreateModal]         = useState(false);
  const [showJoinModal, setShowJoinModal]             = useState(false);
  const [showSecretModal, setShowSecretModal]         = useState(false);
  const [showAddSectionModal, setShowAddSectionModal] = useState(false);

  const [groupName, setGroupName]           = useState('');
  const [secretInput, setSecretInput]       = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [creating, setCreating]             = useState(false);
  const [joining, setJoining]               = useState(false);
  const [secretCopied, setSecretCopied]     = useState(false);

  // ─── Refs for WS reconnect (avoid stale closures) ────────────────────────

  const wsRef               = useRef<WebSocket | null>(null);
  const wsReconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectAttempts = useRef(0);
  const activeGroupRef      = useRef<GroupData | null>(null);
  const deviceIdRef         = useRef<string | null>(null);

  useEffect(() => { activeGroupRef.current = activeGroup; }, [activeGroup]);
  useEffect(() => { deviceIdRef.current   = deviceId;    }, [deviceId]);

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      let did = await AsyncStorage.getItem(KEY_DEVICE);
      if (!did) { did = randomUUID(); await AsyncStorage.setItem(KEY_DEVICE, did); }
      try { await api('/devices/register/', 'POST', { device_id: did }); } catch {}
      setDeviceId(did);

      let loadedGroups: GroupData[] = [];
      const rawGroups = await AsyncStorage.getItem(KEY_GROUPS);
      if (rawGroups) {
        try { loadedGroups = JSON.parse(rawGroups); } catch {}
      } else {
        const rawOld = await AsyncStorage.getItem('shared_group');
        if (rawOld) {
          try {
            const old = JSON.parse(rawOld);
            loadedGroups = [{ ...old, secret_rotated_at: old.secret_rotated_at ?? new Date().toISOString() }];
            await AsyncStorage.setItem(KEY_GROUPS, JSON.stringify(loadedGroups));
          } catch {}
        }
      }
      setGroups(loadedGroups);
      setInitialized(true);
    })();
  }, []);

  // ─── Focus / WS ───────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => {
    if (initialized && activeGroup && deviceId) {
      syncGroup(activeGroup, deviceId);
      connectWS(activeGroup, deviceId);
    }
    return () => {
      if (wsReconnectTimer.current) { clearTimeout(wsReconnectTimer.current); wsReconnectTimer.current = null; }
      wsRef.current?.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [initialized, activeGroup?.id, deviceId]));

  // ─── WebSocket with auto-reconnect ────────────────────────────────────────

  function connectWS(g: GroupData, did: string) {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsReconnectTimer.current) { clearTimeout(wsReconnectTimer.current); wsReconnectTimer.current = null; }

    try {
      const ws = new WebSocket(`${WS_BASE}/group/${g.id}/?device_id=${did}`);

      ws.onopen = () => {
        wsReconnectAttempts.current = 0;
        setWsConnected(true);
        // pull any missed updates on reconnect
        if (deviceIdRef.current) syncGroup(g, deviceIdRef.current);
      };

      ws.onmessage = (e) => {
        try { handleWSMessage(JSON.parse(e.data)); } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        wsRef.current = null;
        setWsConnected(false);
        // reconnect with exponential backoff while still in this group
        if (activeGroupRef.current?.id === g.id) {
          const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempts.current), 30000);
          wsReconnectAttempts.current++;
          wsReconnectTimer.current = setTimeout(() => {
            const ag = activeGroupRef.current;
            const d  = deviceIdRef.current;
            if (ag?.id === g.id && d) connectWS(ag, d);
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch (e) {
      if (__DEV__) console.warn('[shared] ws failed:', e);
    }
  }

  function handleWSMessage(msg: any) {
    if (msg.type === 'item_updated' && msg.item && msg.section_id) {
      const item = remoteToLocal(msg.item);
      // Save to local cache
      saveItemToSection(msg.section_id, item);
      // Instant UI update if that section is open in sidebar
      setSidebarSection(prev => {
        if (prev?.id === msg.section_id) {
          setSidebarItems(prevItems => {
            const next = mergeItem(prevItems, item);
            return next;
          });
        }
        return prev;
      });
    }
    if (msg.type === 'section_created') {
      // Refresh group so new section appears
      const ag = activeGroupRef.current;
      const d  = deviceIdRef.current;
      if (ag && d) refreshGroupDetail(ag, d);
    }
    if (msg.type === 'secret_rotated' || msg.type === 'member_joined') {
      const ag = activeGroupRef.current;
      const d  = deviceIdRef.current;
      if (ag && d) refreshGroupDetail(ag, d);
    }
  }

  // ─── Sync ─────────────────────────────────────────────────────────────────

  async function syncGroup(g: GroupData, did: string) {
    setSyncing(true);
    try {
      const since = await AsyncStorage.getItem(KEY_LAST_SYNC(g.id));
      const res = await api('/sync/', 'POST', {
        device_id: did, group_id: g.id,
        since: since ?? undefined, items: [],
      });
      await AsyncStorage.setItem(KEY_LAST_SYNC(g.id), res.server_time);

      for (const remote of res.items ?? []) {
        const item = remoteToLocal(remote);
        await saveItemToSection(remote.section_id, item);
        setSidebarSection(prev => {
          if (prev?.id === remote.section_id)
            setSidebarItems(prevItems => mergeItem(prevItems, item));
          return prev;
        });
      }
      await refreshGroupDetail(g, did);
    } catch (e) {
      if (__DEV__) console.warn('[shared] sync failed:', e);
    } finally {
      setSyncing(false);
    }
  }

  async function refreshGroupDetail(g: GroupData, did: string) {
    try {
      const data = await api(`/groups/${g.id}/?device_id=${did}`);
      const updated: GroupData = {
        id: data.id, name: data.name,
        secret: data.secret ?? g.secret,
        secret_rotated_at: data.secret_rotated_at ?? g.secret_rotated_at,
        member_count: data.member_count,
        sections: (data.sections ?? []).map((s: any) => ({ id: s.id, type: s.type, name: s.name })),
      };
      updateGroupInList(updated);
      setActiveGroup(prev => prev?.id === updated.id ? updated : prev);
    } catch {}
  }

  // ─── Storage helpers ──────────────────────────────────────────────────────

  function remoteToLocal(remote: any): LocalItem {
    return {
      local_id:   remote.local_id,
      text:       remote.data?.text    ?? '',
      checked:    remote.data?.checked ?? false,
      deleted:    remote.deleted       ?? false,
      updated_at: remote.updated_at,
      qty:        remote.data?.qty,
      unit:       remote.data?.unit,
      priority:   remote.data?.priority,
      note:       remote.data?.note,
    };
  }

  function mergeItem(list: LocalItem[], item: LocalItem): LocalItem[] {
    const next = [...list];
    const idx = next.findIndex(i => i.local_id === item.local_id);
    if (idx >= 0) next[idx] = item; else next.unshift(item);
    return next;
  }

  async function loadSectionItems(sid: string): Promise<LocalItem[]> {
    try {
      const raw = await AsyncStorage.getItem(KEY_SECTION_ITEMS(sid));
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  async function saveItemToSection(sid: string, item: LocalItem) {
    const list = await loadSectionItems(sid);
    const merged = mergeItem(list, item);
    await AsyncStorage.setItem(KEY_SECTION_ITEMS(sid), JSON.stringify(merged));
  }

  function updateGroupInList(updated: GroupData) {
    setGroups(prev => {
      const next = prev.map(g => g.id === updated.id ? updated : g);
      AsyncStorage.setItem(KEY_GROUPS, JSON.stringify(next));
      return next;
    });
  }

  // ─── Item persistence ─────────────────────────────────────────────────────

  async function persistItem(section: SharedSection, item: LocalItem) {
    // Optimistic local update
    setSidebarItems(prev => {
      const next = mergeItem(prev, item);
      AsyncStorage.setItem(KEY_SECTION_ITEMS(section.id), JSON.stringify(next));
      return next;
    });

    if (activeGroup && deviceId) {
      try {
        await api('/sync/', 'POST', {
          device_id: deviceId, group_id: activeGroup.id,
          items: [{
            section_id: section.id,
            local_id:   item.local_id,
            data: {
              text: item.text, checked: item.checked,
              ...(item.qty      !== undefined && { qty: item.qty }),
              ...(item.unit     !== undefined && { unit: item.unit }),
              ...(item.priority !== undefined && { priority: item.priority }),
              ...(item.note     !== undefined && { note: item.note }),
            },
            deleted: item.deleted,
          }],
        });
      } catch (e) {
        if (__DEV__) console.warn('[shared] persist failed:', e);
      }
    }
  }

  // ─── Item actions ─────────────────────────────────────────────────────────

  async function addItem() {
    if (!sidebarSection || !addText.trim()) return;
    const type = sidebarSection.type;
    const item: LocalItem = {
      local_id:   randomUUID(),
      text:       addText.trim(),
      checked:    false,
      deleted:    false,
      updated_at: new Date().toISOString(),
      ...(type === 'shopping' && { qty: addQty || '1', unit: addUnit }),
      ...(type === 'tasks'    && { priority: addPriority }),
      ...(type === 'notes'    && addNote.trim() && { note: addNote.trim() }),
    };
    setAddText('');
    setAddNote('');
    setAddQty('1');
    await persistItem(sidebarSection, item);
  }

  async function toggleItem(item: LocalItem) {
    if (!sidebarSection) return;
    await persistItem(sidebarSection, { ...item, checked: !item.checked, updated_at: new Date().toISOString() });
  }

  async function deleteItem(item: LocalItem) {
    if (!sidebarSection) return;
    await persistItem(sidebarSection, { ...item, deleted: true, updated_at: new Date().toISOString() });
  }

  // ─── Group actions ────────────────────────────────────────────────────────

  async function createGroup() {
    if (!deviceId) return;
    setCreating(true);
    try {
      const name = groupName.trim() || 'Спільна група';
      const g = mapGroupData(await api('/groups/create/', 'POST', { device_id: deviceId, name }));
      const next = [...groups, g];
      setGroups(next);
      await AsyncStorage.setItem(KEY_GROUPS, JSON.stringify(next));
      setShowCreateModal(false); setGroupName(''); setShowGroupSheet(false);
      enterGroup(g);
      setTimeout(() => setShowSecretModal(true), 300);
    } catch { Alert.alert('Помилка', 'Не вдалося створити групу.'); }
    finally { setCreating(false); }
  }

  async function joinGroup() {
    if (!deviceId || !secretInput.trim()) return;
    setJoining(true);
    try {
      const g = mapGroupData(await api('/groups/join/', 'POST', {
        device_id: deviceId, secret: secretInput.trim().toUpperCase(),
      }));
      setGroups(prev => {
        const next = prev.some(x => x.id === g.id) ? prev.map(x => x.id === g.id ? g : x) : [...prev, g];
        AsyncStorage.setItem(KEY_GROUPS, JSON.stringify(next));
        return next;
      });
      setShowJoinModal(false); setSecretInput(''); setShowGroupSheet(false);
      enterGroup(g);
      if (deviceId) syncGroup(g, deviceId);
    } catch (e: any) {
      Alert.alert('Помилка', e?.json?.error ?? 'Невірний або застарілий код.');
    } finally { setJoining(false); }
  }

  async function leaveGroup(g: GroupData) {
    Alert.alert('Вийти з групи', `Покинути «${g.name}»?`, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Вийти', style: 'destructive', onPress: async () => {
        if (deviceId) try { await api(`/groups/${g.id}/leave/`, 'POST', { device_id: deviceId }); } catch {}
        if (wsReconnectTimer.current) { clearTimeout(wsReconnectTimer.current); wsReconnectTimer.current = null; }
        wsRef.current?.close(); wsRef.current = null;
        setGroups(prev => { const next = prev.filter(x => x.id !== g.id); AsyncStorage.setItem(KEY_GROUPS, JSON.stringify(next)); return next; });
        setShowSecretModal(false); closeSidebar(true); setViewMode('groups'); setActiveGroup(null);
      }},
    ]);
  }

  function mapGroupData(d: any): GroupData {
    return {
      id: d.id, name: d.name,
      secret: d.secret ?? '',
      secret_rotated_at: d.secret_rotated_at ?? new Date().toISOString(),
      member_count: d.member_count ?? 1,
      sections: (d.sections ?? []).map((s: any) => ({ id: s.id, type: s.type, name: s.name })),
    };
  }

  // ─── Section actions ──────────────────────────────────────────────────────

  async function createSection() {
    if (!activeGroup) return;
    const name = newSectionName.trim() || SECTION_META[activeTab].placeholder;
    try {
      const data = await api(`/groups/${activeGroup.id}/sections/`, 'POST', { type: activeTab, name });
      const newSec: SharedSection = { id: data.id, type: data.type, name: data.name };
      const updated = { ...activeGroup, sections: [...activeGroup.sections, newSec] };
      setActiveGroup(updated); updateGroupInList(updated);
      setShowAddSectionModal(false); setNewSectionName('');
      openSidebar(newSec);
    } catch { Alert.alert('Помилка', 'Не вдалося створити список.'); }
  }

  // ─── Navigation ───────────────────────────────────────────────────────────

  function enterGroup(g: GroupData) {
    setActiveGroup(g); setViewMode('group'); setActiveTab('shopping');
    setSectionSearch(''); setSectionSearchOpen(false);
    if (deviceId) { connectWS(g, deviceId); syncGroup(g, deviceId); }
  }

  function goBackToGroups() {
    closeSidebar(true);
    if (wsReconnectTimer.current) { clearTimeout(wsReconnectTimer.current); wsReconnectTimer.current = null; }
    wsRef.current?.close(); wsRef.current = null; setWsConnected(false);
    setViewMode('groups'); setActiveGroup(null);
  }

  async function openSidebar(section: SharedSection) {
    // Reset sidebar state
    setSbFilter('active'); setSbSort('newest'); setSbSearch(''); setSbSearchOpen(false);
    setSbMenuOpen(false); setShowUnitPicker(false);
    setShowDone(false); setAddText(''); setAddQty('1'); setAddNote('');
    setSidebarSection(section);
    setSidebarSyncing(true);

    const localItems = await loadSectionItems(section.id);
    setSidebarItems(localItems);
    setSidebarSyncing(false);

    // Animate in
    Animated.parallel([
      Animated.spring(sidebarAnim,  { toValue: 0, useNativeDriver: true, tension: 80, friction: 11 }),
      Animated.timing(backdropAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    // Fetch fresh from server in background
    try {
      const data: any[] = await api(`/sections/${section.id}/items/`);
      const merged = [...localItems];
      for (const remote of data) {
        const item = remoteToLocal(remote);
        const idx = merged.findIndex(i => i.local_id === item.local_id);
        if (idx >= 0) merged[idx] = item; else merged.unshift(item);
      }
      await AsyncStorage.setItem(KEY_SECTION_ITEMS(section.id), JSON.stringify(merged));
      setSidebarItems(merged);
    } catch {}
  }

  function closeSidebar(immediate = false) {
    setAddText(''); setAddNote(''); setSbSearch(''); setSbMenuOpen(false); setShowUnitPicker(false);
    if (immediate) {
      sidebarAnim.setValue(SIDEBAR_W); backdropAnim.setValue(0);
      setSidebarSection(null); setSidebarItems([]);
      return;
    }
    Animated.parallel([
      Animated.timing(sidebarAnim,  { toValue: SIDEBAR_W, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropAnim, { toValue: 0,         duration: 200, useNativeDriver: true }),
    ]).start(() => { setSidebarSection(null); setSidebarItems([]); });
  }

  // ─── Secret ───────────────────────────────────────────────────────────────

  function secretExpiresIn(at: string): string {
    const diff = new Date(at).getTime() + 86400000 - Date.now();
    if (diff <= 0) return 'Термін вичерпано';
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `Діє ще ${h}г ${m}хв` : `Діє ще ${m}хв`;
  }

  async function rotateSecret() {
    if (!activeGroup || !deviceId) return;
    try {
      const d = await api(`/groups/${activeGroup.id}/refresh-secret/`, 'POST', { device_id: deviceId });
      const updated = { ...activeGroup, secret: d.secret, secret_rotated_at: d.secret_rotated_at };
      setActiveGroup(updated); updateGroupInList(updated);
    } catch { Alert.alert('Помилка', 'Не вдалося оновити код.'); }
  }

  // ─── Derived: filtered + sorted sidebar items ─────────────────────────────

  const { activeItems, doneItems } = useMemo(() => {
    const q = sbSearch.trim().toLowerCase();
    const all = sidebarItems.filter(i => {
      if (i.deleted) return false;
      if (q && !i.text.toLowerCase().includes(q) && !i.note?.toLowerCase().includes(q)) return false;
      return true;
    });

    const sortFn = (a: LocalItem, b: LocalItem): number => {
      if (sbSort === 'newest')   return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sbSort === 'oldest')   return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      if (sbSort === 'alpha')    return a.text.localeCompare(b.text, 'uk');
      if (sbSort === 'priority') {
        const ord: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (ord[a.priority ?? 'low'] ?? 2) - (ord[b.priority ?? 'low'] ?? 2);
      }
      return 0;
    };

    const active = all.filter(i => !i.checked).sort(sortFn);
    const done   = all.filter(i =>  i.checked).sort(sortFn);
    return { activeItems: active, doneItems: done };
  }, [sidebarItems, sbSearch, sbSort]);

  // ─── Derived: filtered sections and groups ────────────────────────────────

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => g.name.toLowerCase().includes(q));
  }, [groups, groupSearch]);

  function tabSections(tab: SectionType): SharedSection[] {
    const q = sectionSearch.trim().toLowerCase();
    return (activeGroup?.sections ?? [])
      .filter(s => s.type === tab && (!q || s.name.toLowerCase().includes(q)));
  }

  // ─── Cycle sort ───────────────────────────────────────────────────────────

  function cycleSbSort() {
    const opts: SortMode[] = sidebarSection?.type === 'tasks'
      ? ['newest', 'oldest', 'alpha', 'priority']
      : ['newest', 'oldest', 'alpha'];
    const idx = opts.indexOf(sbSort);
    setSbSort(opts[(idx + 1) % opts.length]);
  }

  // ─── Refresh ──────────────────────────────────────────────────────────────

  const onRefresh = useCallback(() => {
    if (!activeGroup || !deviceId) { setRefreshing(false); return; }
    setRefreshing(true);
    syncGroup(activeGroup, deviceId).finally(() => setRefreshing(false));
  }, [activeGroup?.id, deviceId]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {!initialized ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : viewMode === 'groups' ? (

          /* ══════════════════════════════ GROUPS LIST ══════════════════════════════ */
          <>
            <View style={st.header}>
              <Text style={[st.title, { color: c.text }]}>Спільне</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setGroupSearchOpen(v => !v); setGroupSearch(''); }}
                  style={[st.headerBtn, { backgroundColor: groupSearchOpen ? c.accent + '30' : c.dim }]}>
                  <IconSymbol name="magnifyingglass" size={17} color={groupSearchOpen ? c.accent : c.sub} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowGroupSheet(true)}
                  style={[st.headerBtn, { backgroundColor: c.accent + '20' }]}>
                  <IconSymbol name="plus" size={18} color={c.accent} />
                </TouchableOpacity>
              </View>
            </View>

            {groupSearchOpen && (
              <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
                <TextInput
                  autoFocus placeholder="Пошук груп..."
                  placeholderTextColor={c.sub} value={groupSearch}
                  onChangeText={setGroupSearch}
                  style={[st.searchInput, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />
              </View>
            )}

            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
              showsVerticalScrollIndicator={false}>

              {filteredGroups.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 64 }}>
                  <View style={[st.emptyIconBox, { backgroundColor: c.accent + '15' }]}>
                    <IconSymbol name="person.2.fill" size={36} color={c.accent} />
                  </View>
                  <Text style={[st.emptyTitle, { color: c.text }]}>
                    {groupSearch ? 'Нічого не знайдено' : 'Немає груп'}
                  </Text>
                  {!groupSearch && (
                    <>
                      <Text style={[st.emptyDesc, { color: c.sub, textAlign: 'center' }]}>
                        Створіть групу або приєднайтесь за кодом
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
                        <TouchableOpacity onPress={() => setShowCreateModal(true)}
                          style={[st.btn, { backgroundColor: c.accent, paddingHorizontal: 20 }]}>
                          <IconSymbol name="plus" size={15} color="#fff" />
                          <Text style={[st.btnLabel, { color: '#fff' }]}>Створити</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowJoinModal(true)}
                          style={[st.btn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, paddingHorizontal: 20 }]}>
                          <IconSymbol name="key.fill" size={15} color={c.accent} />
                          <Text style={[st.btnLabel, { color: c.accent }]}>Ввести код</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              ) : filteredGroups.map(g => (
                <TouchableOpacity key={g.id} onPress={() => enterGroup(g)} activeOpacity={0.75} style={{ marginBottom: 12 }}>
                  <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
                    style={[st.groupCard, { borderColor: c.border }]}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[st.groupName, { color: c.text }]}>{g.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[st.dot, { backgroundColor: c.accent }]} />
                        <Text style={{ fontSize: 13, color: c.sub }}>
                          {g.member_count} {pluralMember(g.member_count)}
                          {g.sections.length > 0 ? ` · ${g.sections.length} списків` : ''}
                        </Text>
                      </View>
                      {g.sections.length > 0 && (
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          {TAB_ORDER.map(type => {
                            const cnt = g.sections.filter(s => s.type === type).length;
                            if (!cnt) return null;
                            return (
                              <View key={type} style={[st.pill, { backgroundColor: c.accent + '18' }]}>
                                <IconSymbol name={SECTION_META[type].icon as any} size={11} color={c.accent} />
                                <Text style={{ fontSize: 11, color: c.accent, fontWeight: '600' }}>{cnt}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </View>
                    <IconSymbol name="chevron.right" size={16} color={c.sub} />
                  </BlurView>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>

        ) : (

          /* ════════════════════════════ GROUP DETAIL ════════════════════════════ */
          <>
            {/* Header */}
            <View style={st.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <TouchableOpacity onPress={goBackToGroups} style={[st.headerBtn, { backgroundColor: c.dim }]}>
                  <IconSymbol name="chevron.left" size={18} color={c.text} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <Text style={[st.groupHeaderName, { color: c.text }]} numberOfLines={1}>{activeGroup?.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    {/* WS status dot */}
                    <View style={[st.dot, { backgroundColor: wsConnected ? c.green : c.amber }]} />
                    <Text style={{ fontSize: 12, color: c.sub }}>
                      {activeGroup?.member_count} {pluralMember(activeGroup?.member_count ?? 1)}
                      {syncing ? ' · синхр...' : ''}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setSectionSearchOpen(v => !v); setSectionSearch(''); }}
                  style={[st.headerBtn, { backgroundColor: sectionSearchOpen ? c.accent + '30' : c.dim }]}>
                  <IconSymbol name="magnifyingglass" size={17} color={sectionSearchOpen ? c.accent : c.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowSecretModal(true)}
                  style={[st.headerBtn, { backgroundColor: c.accent + '20' }]}>
                  <IconSymbol name="person.badge.key.fill" size={18} color={c.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => activeGroup && leaveGroup(activeGroup)}
                  style={[st.headerBtn, { backgroundColor: c.red + '18' }]}>
                  <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color={c.red} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Section search */}
            {sectionSearchOpen && (
              <View style={{ paddingHorizontal: 20, marginBottom: 4 }}>
                <TextInput
                  autoFocus placeholder="Пошук списків..."
                  placeholderTextColor={c.sub} value={sectionSearch}
                  onChangeText={setSectionSearch}
                  style={[st.searchInput, { backgroundColor: c.input, color: c.text, borderColor: c.border }]}
                />
              </View>
            )}

            {/* Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4, gap: 8 }}
              style={{ flexGrow: 0, marginBottom: 8 }}>
              {TAB_ORDER.map(tab => {
                const active = activeTab === tab;
                const cnt = tabSections(tab).length;
                return (
                  <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
                    style={[st.tab, active ? { backgroundColor: c.accent } : { backgroundColor: c.dim, borderColor: c.border, borderWidth: 1 }]}>
                    <IconSymbol name={SECTION_META[tab].icon as any} size={15} color={active ? '#fff' : c.sub} />
                    <Text style={[st.tabLabel, { color: active ? '#fff' : c.sub }]}>{SECTION_META[tab].label}</Text>
                    {!active && cnt > 0 && (
                      <View style={[st.badge, { backgroundColor: c.accent }]}>
                        <Text style={st.badgeText}>{cnt}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Sections list */}
            <ScrollView
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

              {tabSections(activeTab).length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                  <IconSymbol name={SECTION_META[activeTab].icon as any} size={44} color={c.sub} />
                  <Text style={[st.emptyTitle, { color: c.text }]}>
                    {sectionSearch ? 'Нічого не знайдено' : 'Немає списків'}
                  </Text>
                  {!sectionSearch && <Text style={[st.emptyDesc, { color: c.sub }]}>Натисніть + щоб додати</Text>}
                </View>
              ) : tabSections(activeTab).map(section => (
                <TouchableOpacity key={section.id} onPress={() => openSidebar(section)}
                  activeOpacity={0.75} style={{ marginBottom: 10 }}>
                  <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
                    style={[st.sectionCard, { borderColor: c.border }]}>
                    <View style={[st.sectionIconBox, { backgroundColor: c.accent + '18' }]}>
                      <IconSymbol name={SECTION_META[activeTab].icon as any} size={18} color={c.accent} />
                    </View>
                    <Text style={[st.sectionCardName, { color: c.text, flex: 1 }]}>{section.name}</Text>
                    <IconSymbol name="chevron.right" size={16} color={c.sub} />
                  </BlurView>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </SafeAreaView>

      {/* ── FAB ── */}
      {viewMode === 'group' && !sidebarSection && (
        <TouchableOpacity onPress={() => setShowAddSectionModal(true)}
          style={[st.fab, { backgroundColor: c.accent, bottom: Platform.OS === 'ios' ? 108 : 88 }]}>
          <IconSymbol name="plus" size={26} color="#fff" />
        </TouchableOpacity>
      )}

      {/* ══════════════════════════════ SIDEBAR ══════════════════════════════ */}

      <Modal visible={!!sidebarSection} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeSidebar()}>
        {/* Backdrop */}
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: backdropAnim }]}
          pointerEvents="auto">
          <Pressable style={{ flex: 1 }} onPress={() => closeSidebar()} />
        </Animated.View>

        {/* Panel */}
        {!!sidebarSection && (
        <Animated.View style={[
          st.sidebarPanel,
          { backgroundColor: c.sidebar, borderLeftColor: c.border },
          { transform: [{ translateX: sidebarAnim }] },
        ]}>
          <View style={{ flex: 1 }}>

            {/* ── Header ── */}
            <View style={[st.sidebarHeader, { borderBottomColor: c.border, paddingTop: insets.top + 10 }]}>
              <TouchableOpacity onPress={() => closeSidebar()}
                style={st.iconBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <IconSymbol name="chevron.left" size={18} color={c.sub} />
              </TouchableOpacity>

              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 6 }}>
                <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.accent + '18',
                  alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name={SECTION_META[sidebarSection.type].icon as any} size={15} color={c.accent} />
                </View>
                <Text style={[st.sidebarTitle, { color: c.text }]} numberOfLines={1}>{sidebarSection.name}</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {sidebarSyncing && <ActivityIndicator size="small" color={c.accent} style={{ marginRight: 4 }} />}
                <View style={[st.wsDot, { backgroundColor: wsConnected ? c.green : c.amber }]} />
                <TouchableOpacity
                  onPress={() => { setSbSearchOpen(v => !v); setSbSearch(''); setSbMenuOpen(false); }}
                  style={[st.iconBtn, { backgroundColor: sbSearchOpen ? c.accent + '25' : 'transparent' }]}>
                  <IconSymbol name="magnifyingglass" size={16} color={sbSearchOpen ? c.accent : c.sub} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setSbMenuOpen(v => !v); setSbSearchOpen(false); setSbSearch(''); }}
                  style={[st.iconBtn, {
                    backgroundColor: sbMenuOpen ? c.accent + '25'
                      : (sbFilter !== 'active' || sbSort !== 'newest') ? c.accent + '18' : 'transparent',
                  }]}>
                  <IconSymbol name="slider.horizontal.3" size={15}
                    color={(sbMenuOpen || sbFilter !== 'active' || sbSort !== 'newest') ? c.accent : c.sub} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Filter / Sort dropdown ── */}
            {sbMenuOpen && (
              <View style={[st.sbDropdown, { backgroundColor: c.sheet, borderBottomColor: c.border }]}>
                <Text style={[st.sbDropdownLabel, { color: c.sub }]}>ФІЛЬТР</Text>
                {([
                  { v: 'active' as FilterMode, label: 'Активні',   icon: 'circle'               },
                  { v: 'all'    as FilterMode, label: 'Всі',        icon: 'square.grid.2x2'      },
                  { v: 'done'   as FilterMode, label: 'Виконані',   icon: 'checkmark.circle.fill' },
                ] as const).map(({ v, label, icon }) => (
                  <TouchableOpacity key={v} onPress={() => { setSbFilter(v); setSbMenuOpen(false); }}
                    style={[st.sbDropdownItem, { backgroundColor: sbFilter === v ? c.accent + '12' : 'transparent' }]}>
                    <IconSymbol name={icon as any} size={17} color={sbFilter === v ? c.accent : c.sub} />
                    <Text style={{ flex: 1, fontSize: 14, color: sbFilter === v ? c.accent : c.text,
                      fontWeight: sbFilter === v ? '600' : '400' }}>{label}</Text>
                    {sbFilter === v && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                  </TouchableOpacity>
                ))}

                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 6, marginHorizontal: 14 }} />

                <Text style={[st.sbDropdownLabel, { color: c.sub }]}>СОРТУВАННЯ</Text>
                {(sidebarSection.type === 'tasks'
                  ? ['newest', 'oldest', 'alpha', 'priority'] as SortMode[]
                  : ['newest', 'oldest', 'alpha'] as SortMode[]
                ).map(s => {
                  const iconMap: Record<SortMode, string> = {
                    newest: 'clock', oldest: 'clock.arrow.circlepath',
                    alpha: 'textformat.abc', priority: 'exclamationmark.circle',
                  };
                  return (
                    <TouchableOpacity key={s} onPress={() => { setSbSort(s); setSbMenuOpen(false); }}
                      style={[st.sbDropdownItem, { backgroundColor: sbSort === s ? c.accent + '12' : 'transparent' }]}>
                      <IconSymbol name={iconMap[s] as any} size={17} color={sbSort === s ? c.accent : c.sub} />
                      <Text style={{ flex: 1, fontSize: 14, color: sbSort === s ? c.accent : c.text,
                        fontWeight: sbSort === s ? '600' : '400' }}>{SORT_LABEL[s]}</Text>
                      {sbSort === s && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Search bar ── */}
            {sbSearchOpen && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }}>
                <TextInput
                  autoFocus placeholder="Пошук..." placeholderTextColor={c.sub}
                  value={sbSearch} onChangeText={setSbSearch}
                  style={[st.searchInput, { backgroundColor: c.input, color: c.text, borderColor: 'transparent' }]}
                />
              </View>
            )}

            {/* ── Shopping progress ── */}
            {sidebarSection.type === 'shopping' && (activeItems.length + doneItems.length) > 0 && (
              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: c.sub, fontWeight: '500' }}>
                    <Text style={{ color: c.green, fontWeight: '700' }}>{doneItems.length}</Text>
                    {' '}з {activeItems.length + doneItems.length} куплено
                  </Text>
                  {doneItems.length > 0 && (
                    <TouchableOpacity onPress={() => doneItems.forEach(i => deleteItem(i))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <IconSymbol name="trash" size={11} color={c.red + 'BB'} />
                      <Text style={{ fontSize: 12, color: c.red + 'BB', fontWeight: '500' }}>Очистити</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={[st.progressTrack, { backgroundColor: c.dim }]}>
                  <View style={[st.progressFill, {
                    backgroundColor: c.green,
                    width: `${Math.round((doneItems.length / (activeItems.length + doneItems.length)) * 100)}%` as any,
                  }]} />
                </View>
              </View>
            )}

            {/* ── Items list ── */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => { setSbMenuOpen(false); setShowUnitPicker(false); }}>

              {/* Empty state */}
              {activeItems.length === 0 && doneItems.length === 0 && !sidebarSyncing && (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: c.accent + '12',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <IconSymbol name={SECTION_META[sidebarSection.type].icon as any} size={28} color={c.accent + '80'} />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>Список порожній</Text>
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 4 }}>Додайте перший елемент нижче</Text>
                </View>
              )}

              {/* Active items */}
              {(sbFilter === 'active' || sbFilter === 'all') && activeItems.map((item, idx) => (
                <ItemRow
                  key={item.local_id}
                  item={item}
                  isLast={idx === activeItems.length - 1 && (sbFilter === 'all' ? doneItems.length === 0 : true)}
                  type={sidebarSection!.type}
                  c={c}
                  onToggle={() => toggleItem(item)}
                  onDelete={() => deleteItem(item)}
                />
              ))}

              {/* Done items */}
              {sbFilter !== 'active' && doneItems.length > 0 && (
                <>
                  {sbFilter === 'all' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 16, paddingVertical: 8 }}>
                      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <IconSymbol name="checkmark.circle.fill" size={11} color={c.sub} />
                        <Text style={{ fontSize: 11, color: c.sub, fontWeight: '600' }}>
                          ВИКОНАНІ ({doneItems.length})
                        </Text>
                      </View>
                      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />
                    </View>
                  )}
                  {doneItems.map((item, idx) => (
                    <ItemRow
                      key={item.local_id}
                      item={item}
                      isLast={idx === doneItems.length - 1}
                      type={sidebarSection!.type}
                      c={c}
                      onToggle={() => toggleItem(item)}
                      onDelete={() => deleteItem(item)}
                    />
                  ))}
                </>
              )}

              {/* Show / hide done toggle */}
              {sbFilter === 'active' && doneItems.length > 0 && (
                <TouchableOpacity onPress={() => setSbFilter('all')}
                  style={[st.showDoneBtn, { borderColor: c.border }]}>
                  <IconSymbol name="checkmark.circle" size={14} color={c.sub} />
                  <Text style={[st.showDoneTxt, { color: c.sub }]}>
                    Показати виконані ({doneItems.length})
                  </Text>
                </TouchableOpacity>
              )}
              {sbFilter === 'all' && doneItems.length > 0 && (
                <TouchableOpacity onPress={() => setSbFilter('active')}
                  style={[st.showDoneBtn, { borderColor: c.border }]}>
                  <IconSymbol name="eye.slash" size={14} color={c.sub} />
                  <Text style={[st.showDoneTxt, { color: c.sub }]}>Сховати виконані</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* ── Add form ── */}
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={[st.addForm, { borderTopColor: c.border }]}>

                {/* Tasks: priority selector */}
                {sidebarSection.type === 'tasks' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: c.sub, fontWeight: '500' }}>Пріоритет:</Text>
                    {(['high', 'medium', 'low'] as Priority[]).map(p => (
                      <TouchableOpacity key={p} onPress={() => setAddPriority(p)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
                          backgroundColor: addPriority === p ? PRIORITY_COLOR[p] + '20' : 'transparent',
                          borderColor: addPriority === p ? PRIORITY_COLOR[p] : c.border,
                        }}>
                        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: PRIORITY_COLOR[p] }} />
                        <Text style={{ fontSize: 12, fontWeight: '600',
                          color: addPriority === p ? PRIORITY_COLOR[p] : c.sub }}>
                          {PRIORITY_LABEL[p]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Main input row */}
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>

                  {/* Shopping: qty + unit dropdown */}
                  {sidebarSection.type === 'shopping' && (
                    <View style={{ gap: 4 }}>
                      <TextInput
                        placeholder="К-сть" placeholderTextColor={c.sub}
                        value={addQty} onChangeText={setAddQty}
                        keyboardType="decimal-pad"
                        style={[st.qtyInput, { backgroundColor: c.input, color: c.text }]}
                      />
                      <TouchableOpacity onPress={() => setShowUnitPicker(v => !v)}
                        style={[st.unitDropdownBtn, {
                          backgroundColor: showUnitPicker ? c.accent + '20' : c.input,
                          borderColor: showUnitPicker ? c.accent : 'transparent',
                        }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700',
                          color: showUnitPicker ? c.accent : c.text }}>{addUnit}</Text>
                        <IconSymbol name={showUnitPicker ? 'chevron.up' : 'chevron.down'}
                          size={10} color={showUnitPicker ? c.accent : c.sub} />
                      </TouchableOpacity>
                    </View>
                  )}

                  <TextInput
                    placeholder={sidebarSection.type === 'notes' ? 'Нотатка...' : 'Додати...'}
                    placeholderTextColor={c.sub}
                    value={addText}
                    onChangeText={setAddText}
                    onFocus={() => { setSbMenuOpen(false); setShowUnitPicker(false); }}
                    onSubmitEditing={sidebarSection.type !== 'notes' ? addItem : undefined}
                    returnKeyType={sidebarSection.type !== 'notes' ? 'done' : 'default'}
                    multiline={sidebarSection.type === 'notes'}
                    numberOfLines={sidebarSection.type === 'notes' ? 3 : 1}
                    style={[
                      st.addTextInput,
                      { backgroundColor: c.input, color: c.text },
                      sidebarSection.type === 'notes' && { minHeight: 68, textAlignVertical: 'top', paddingTop: 10 },
                    ]}
                  />
                  <TouchableOpacity onPress={addItem} disabled={!addText.trim()}
                    style={[st.sendBtn, { backgroundColor: addText.trim() ? c.accent : c.dim }]}>
                    <IconSymbol name="arrow.up" size={18} color={addText.trim() ? '#fff' : c.sub} />
                  </TouchableOpacity>
                </View>

                {/* Unit picker panel */}
                {sidebarSection.type === 'shopping' && showUnitPicker && (
                  <View style={[st.unitPickerPanel, { backgroundColor: c.sheet, borderColor: c.border }]}>
                    {UNITS.map(u => (
                      <TouchableOpacity key={u} onPress={() => { setAddUnit(u); setShowUnitPicker(false); }}
                        style={[st.unitPickerRow, {
                          backgroundColor: addUnit === u ? c.accent + '12' : 'transparent',
                          borderBottomColor: c.border,
                        }]}>
                        <Text style={{ fontSize: 14, flex: 1,
                          color: addUnit === u ? c.accent : c.text,
                          fontWeight: addUnit === u ? '700' : '400' }}>{u}</Text>
                        {addUnit === u && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </KeyboardAvoidingView>
            {/* Bottom safe area spacer */}
            {insets.bottom > 0 && <View style={{ height: insets.bottom }} />}
          </View>
        </Animated.View>
        )}
      </Modal>

      {/* ══════════════════════════════ MODALS ══════════════════════════════ */}

      {/* Group sheet */}
      <Modal visible={showGroupSheet} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowGroupSheet(false)}>
        <Pressable style={st.overlay} onPress={() => setShowGroupSheet(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
              style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <HandleRow c={c} onClose={() => setShowGroupSheet(false)} />
              <TouchableOpacity onPress={() => { setShowGroupSheet(false); setShowCreateModal(true); }}
                style={[st.sheetAction, { borderBottomColor: c.border }]}>
                <View style={[st.iconBox, { backgroundColor: c.accent + '18' }]}>
                  <IconSymbol name="person.2.badge.plus" size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>Створити групу</Text>
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>Нова група зі спільними списками</Text>
                </View>
                <IconSymbol name="chevron.right" size={15} color={c.sub} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowGroupSheet(false); setShowJoinModal(true); }} style={st.sheetAction}>
                <View style={[st.iconBox, { backgroundColor: c.accent + '18' }]}>
                  <IconSymbol name="key.fill" size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>Приєднатись</Text>
                  <Text style={{ fontSize: 13, color: c.sub, marginTop: 2 }}>Введіть код від учасника групи</Text>
                </View>
                <IconSymbol name="chevron.right" size={15} color={c.sub} />
              </TouchableOpacity>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Create group */}
      <Modal visible={showCreateModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowCreateModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowCreateModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>Нова спільна група</Text>
                <Text style={[st.sheetDesc, { color: c.sub }]}>Після створення отримаєте код (дійсний 24 год).</Text>
                <TextInput placeholder="Назва групи" placeholderTextColor={c.sub}
                  value={groupName} onChangeText={setGroupName} returnKeyType="done"
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]} />
                <TouchableOpacity onPress={createGroup} disabled={creating}
                  style={[st.btn, { backgroundColor: c.accent, marginTop: 4 }]}>
                  {creating ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[st.btnLabel, { color: '#fff' }]}>Створити групу</Text>}
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Join group */}
      <Modal visible={showJoinModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowJoinModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowJoinModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowJoinModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>Приєднатись до групи</Text>
                <Text style={[st.sheetDesc, { color: c.sub }]}>Введіть секретний код (ABCD-1234). Дійсний 24 год.</Text>
                <TextInput autoFocus autoCapitalize="characters" placeholder="XXXX-0000"
                  placeholderTextColor={c.sub} value={secretInput}
                  onChangeText={t => setSecretInput(t.toUpperCase())}
                  returnKeyType="done" onSubmitEditing={joinGroup}
                  style={[st.input, {
                    backgroundColor: c.input, color: c.text, borderColor: c.border,
                    fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 4,
                  }]} />
                <TouchableOpacity onPress={joinGroup} disabled={joining || !secretInput.trim()}
                  style={[st.btn, { backgroundColor: secretInput.trim() ? c.accent : c.dim, marginTop: 4 }]}>
                  {joining ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={[st.btnLabel, { color: secretInput.trim() ? '#fff' : c.sub }]}>Приєднатись</Text>}
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Secret */}
      <Modal visible={showSecretModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowSecretModal(false); setSecretCopied(false); }}>
        <Pressable style={st.overlay} onPress={() => { setShowSecretModal(false); setSecretCopied(false); }}>
          <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
              style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <HandleRow c={c} onClose={() => { setShowSecretModal(false); setSecretCopied(false); }} />
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <View style={[st.secretIconBox, { backgroundColor: c.accent + '20' }]}>
                  <IconSymbol name="key.fill" size={28} color={c.accent} />
                </View>
                <Text style={[st.sheetTitle, { color: c.text, marginTop: 14 }]}>Код для приєднання</Text>
                <Text style={[st.sheetDesc, { color: c.sub, textAlign: 'center' }]}>
                  Поділіться кодом — «{activeGroup?.name}»
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}>
                  <View style={[st.secretBox, { backgroundColor: c.accent + '15', borderColor: c.accent + '40', marginTop: 0 }]}>
                    <Text style={[st.secretText, { color: c.accent }]}>{activeGroup?.secret}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!activeGroup?.secret) return;
                      await Clipboard.setStringAsync(activeGroup.secret);
                      setSecretCopied(true);
                      setTimeout(() => setSecretCopied(false), 2000);
                    }}
                    style={[st.iconBtn, { backgroundColor: secretCopied ? c.green + '25' : c.accent + '18', width: 44, height: 44, borderRadius: 13 }]}>
                    <IconSymbol name={secretCopied ? 'checkmark' : 'doc.on.doc'} size={18} color={secretCopied ? c.green : c.accent} />
                  </TouchableOpacity>
                </View>
                {activeGroup?.secret_rotated_at && (
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 8 }}>
                    {secretExpiresIn(activeGroup.secret_rotated_at)}
                  </Text>
                )}
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>
                  {activeGroup?.member_count ?? 0} {pluralMember(activeGroup?.member_count ?? 1)} у групі
                </Text>
              </View>
              <TouchableOpacity onPress={rotateSecret}
                style={[st.btn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, marginTop: 12 }]}>
                <IconSymbol name="arrow.clockwise" size={15} color={c.accent} />
                <Text style={[st.btnLabel, { color: c.accent }]}>Оновити код зараз</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setShowSecretModal(false); setSecretCopied(false); }}
                style={[st.btn, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, marginTop: 8 }]}>
                <Text style={[st.btnLabel, { color: c.sub }]}>Закрити</Text>
              </TouchableOpacity>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add section */}
      <Modal visible={showAddSectionModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowAddSectionModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowAddSectionModal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <HandleRow c={c} onClose={() => setShowAddSectionModal(false)} />
                <Text style={[st.sheetTitle, { color: c.text }]}>Новий список</Text>
                <Text style={[st.sheetDesc, { color: c.sub }]}>Тип: {SECTION_META[activeTab].label}</Text>
                <TextInput autoFocus placeholder={SECTION_META[activeTab].placeholder}
                  placeholderTextColor={c.sub} value={newSectionName}
                  onChangeText={setNewSectionName} returnKeyType="done" onSubmitEditing={createSection}
                  style={[st.input, { backgroundColor: c.input, color: c.text, borderColor: c.border }]} />
                <TouchableOpacity onPress={createSection}
                  style={[st.btn, { backgroundColor: c.accent, marginTop: 4 }]}>
                  <Text style={[st.btnLabel, { color: '#fff' }]}>Створити список</Text>
                </TouchableOpacity>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── ItemRow component ────────────────────────────────────────────────────────

function ItemRow({ item, isLast, type, c, onToggle, onDelete }: {
  item: LocalItem; isLast: boolean; type: SectionType;
  c: any; onToggle: () => void; onDelete: () => void;
}) {
  const checkColor = type === 'shopping' ? c.green : c.accent;
  return (
    <View style={[
      st.itemRow,
      !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
      type === 'tasks' && item.priority && !item.checked && {
        borderLeftWidth: 3,
        borderLeftColor: PRIORITY_COLOR[item.priority] + '70',
      },
    ]}>
      {/* Checkbox */}
      <TouchableOpacity onPress={onToggle} style={st.checkbox}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}>
        <View style={[st.checkCircle, {
          borderColor:     item.checked ? checkColor : c.border,
          backgroundColor: item.checked ? checkColor + '20' : 'transparent',
        }]}>
          {item.checked && (
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: checkColor,
              alignItems: 'center', justifyContent: 'center' }}>
              <IconSymbol name="checkmark" size={9} color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <Text style={[st.itemText, {
          color: item.checked ? c.sub : c.text,
          textDecorationLine: item.checked ? 'line-through' : 'none',
        }]}>{item.text}</Text>
        {item.note && !item.checked && (
          <Text style={{ fontSize: 12, color: c.sub, marginTop: 2, lineHeight: 16 }}
            numberOfLines={2}>{item.note}</Text>
        )}
      </View>

      {/* Right meta */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {type === 'shopping' && item.qty && !item.checked && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
            backgroundColor: c.dim, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border }}>
            <Text style={{ fontSize: 11, color: c.sub, fontWeight: '600' }}>
              {item.qty} {item.unit}
            </Text>
          </View>
        )}
        {type === 'tasks' && item.priority && !item.checked && (
          <View style={{ paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7,
            backgroundColor: PRIORITY_COLOR[item.priority] + '15' }}>
            <Text style={{ fontSize: 10, fontWeight: '700',
              color: PRIORITY_COLOR[item.priority] }}>{PRIORITY_LABEL[item.priority][0]}</Text>
          </View>
        )}
        <TouchableOpacity onPress={onDelete} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}>
          <IconSymbol name="xmark" size={13} color={c.sub + '80'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── HandleRow ────────────────────────────────────────────────────────────────

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

function pluralMember(n: number) {
  if (n === 1) return 'учасник';
  if (n >= 2 && n <= 4) return 'учасники';
  return 'учасників';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:           { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:       { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconBtn:         { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dot:             { width: 7, height: 7, borderRadius: 4 },
  searchInput:     { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  groupCard:       { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  groupName:       { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  groupHeaderName: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  pill:            { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tab:             { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabLabel:        { fontSize: 13, fontWeight: '600' },
  badge:           { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText:       { color: '#fff', fontSize: 10, fontWeight: '800' },
  sectionCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionCardName: { fontSize: 16, fontWeight: '600' },
  sectionIconBox:  { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  emptyIconBox:    { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle:      { fontSize: 17, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  emptyDesc:       { fontSize: 14 },
  fab:             { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  // Sidebar
  sidebarPanel:     { position: 'absolute', top: 0, bottom: 0, right: 0, width: SIDEBAR_W, borderLeftWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOffset: { width: -8, height: 0 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 12 },
  sidebarHeader:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  sidebarTitle:     { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  wsDot:            { width: 6, height: 6, borderRadius: 3, marginHorizontal: 4 },
  // Filter/sort dropdown
  sbDropdown:       { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  sbDropdownLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 16, paddingVertical: 4 },
  sbDropdownItem:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginHorizontal: 8 },
  // Items
  itemRow:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 16, gap: 10 },
  checkbox:         { alignSelf: 'flex-start', paddingTop: 1 },
  checkCircle:      { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  itemText:         { fontSize: 15, fontWeight: '500', lineHeight: 20 },
  progressTrack:    { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill:     { height: 5, borderRadius: 3 },
  showDoneBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 16, paddingVertical: 11, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginTop: 8 },
  showDoneTxt:      { fontSize: 13, fontWeight: '500' },
  // Add form
  addForm:          { paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  addTextInput:     { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  sendBtn:          { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  qtyInput:         { width: 54, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, fontSize: 13, textAlign: 'center' },
  unitDropdownBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1 },
  unitPickerPanel:  { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginTop: 8, overflow: 'hidden' },
  unitPickerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  // Modals
  overlay:         { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper:    { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:           { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:          { width: 36, height: 4, borderRadius: 2 },
  sheetTitle:      { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  sheetDesc:       { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  sheetAction:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1 },
  input:           { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12 },
  btn:             { paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  btnLabel:        { fontSize: 15, fontWeight: '700' },
  iconBox:         { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secretIconBox:   { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  secretBox:       { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 28, paddingVertical: 16, marginTop: 16 },
  secretText:      { fontSize: 28, fontWeight: '800', letterSpacing: 6 },
});
