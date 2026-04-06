import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';

interface ContainerItem {
  id: string;
  name: string;
  tags: string[];
  note?: string;
}

interface Container {
  id: string;
  name: string;
  location: string;
  color: string;
  items: ContainerItem[];
  createdAt: string;
}

const ACCENT = '#F97316';
const STORAGE_KEY = 'containers';
const PALETTE = [
  '#F97316', '#EF4444', '#EC4899', '#8B5CF6',
  '#6366F1', '#0EA5E9', '#10B981', '#F59E0B',
];
const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 48) / 2; // 2 columns, 16 padding + 16 gap

export default function ContainersScreen() {
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();

  const [containers, setContainers] = useState<Container[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  // Container form modal
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cName, setCName] = useState('');
  const [cLocation, setCLocation] = useState('');
  const [cColor, setCColor] = useState(PALETTE[0]);

  // Detail modal
  const [detailId, setDetailId] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemTags, setNewItemTags] = useState('');
  const addInputRef = useRef<TextInput>(null);

  const loadContainers = useCallback(async () => {
    const data = await loadData<Container[]>(STORAGE_KEY, []);
    setContainers(data);
  }, []);

  useEffect(() => { loadContainers().then(() => setInitialized(true)); }, []);
  useEffect(() => { if (initialized) saveData(STORAGE_KEY, containers); }, [containers, initialized]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadContainers();
    setRefreshing(false);
  }, [loadContainers]);

  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    dim:    isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
    sheet:  isDark ? 'rgba(18,15,30,0.97)' : 'rgba(252,250,255,0.97)',
  }), [isDark]);

  // Search
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    const res: { item: ContainerItem; container: Container }[] = [];
    containers.forEach(con => con.items.forEach(item => {
      if (item.name.toLowerCase().includes(q) || item.tags.some(t => t.toLowerCase().includes(q)))
        res.push({ item, container: con });
    }));
    return res;
  }, [containers, search]);

  // Detail container (live reference from containers array)
  const detail = useMemo(
    () => containers.find(con => con.id === detailId) ?? null,
    [containers, detailId]
  );

  // ── CRUD containers ────────────────────────────────────────────────────────
  const openNew = () => {
    setEditingId(null); setCName(''); setCLocation(''); setCColor(PALETTE[0]);
    setShowForm(true);
  };

  const openEdit = (con: Container) => {
    setEditingId(con.id); setCName(con.name); setCLocation(con.location); setCColor(con.color);
    setShowForm(true);
  };

  const saveContainer = () => {
    const name = cName.trim();
    if (!name) return;
    if (editingId) {
      setContainers(p => p.map(con => con.id === editingId
        ? { ...con, name, location: cLocation.trim(), color: cColor }
        : con));
    } else {
      setContainers(p => [{
        id: Date.now().toString(), name, location: cLocation.trim(),
        color: cColor, items: [], createdAt: new Date().toISOString(),
      }, ...p]);
    }
    setShowForm(false);
  };

  const deleteContainer = (id: string) => {
    Alert.alert(tr.deleteContainer, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => {
        setContainers(p => p.filter(con => con.id !== id));
        setDetailId(null);
      }},
    ]);
  };

  // ── CRUD items ─────────────────────────────────────────────────────────────
  const addItem = (containerId: string) => {
    const name = newItemName.trim();
    if (!name) return;
    const item: ContainerItem = {
      id: Date.now().toString(), name,
      tags: newItemTags.split(',').map(t => t.trim()).filter(Boolean),
    };
    setContainers(p => p.map(con =>
      con.id === containerId ? { ...con, items: [...con.items, item] } : con
    ));
    setNewItemName('');
    setNewItemTags('');
  };

  const deleteItem = (containerId: string, itemId: string) => {
    setContainers(p => p.map(con =>
      con.id === containerId
        ? { ...con, items: con.items.filter(i => i.id !== itemId) }
        : con
    ));
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 32, fontWeight: '800', letterSpacing: -0.8, color: c.text, flex: 1 }}>{tr.containers}</Text>
          <TouchableOpacity onPress={openNew}
            style={{ width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.dim, borderColor: c.border }}>
            <IconSymbol name="plus" size={17} color={c.sub} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1,
          paddingHorizontal: 12, paddingVertical: 9, gap: 8, marginHorizontal: 20, marginBottom: 16,
          backgroundColor: c.dim, borderColor: c.border }}>
          <IconSymbol name="magnifyingglass" size={15} color={c.sub} />
          <TextInput placeholder={tr.searchItems} placeholderTextColor={c.sub}
            value={search} onChangeText={setSearch}
            style={{ flex: 1, fontSize: 14, fontWeight: '500', color: c.text }} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Search results */}
          {search.trim().length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                {searchResults.length > 0 ? `Знайдено: ${searchResults.length}` : 'Нічого не знайдено'}
              </Text>
              {searchResults.map(({ item, container }) => (
                <TouchableOpacity key={item.id} activeOpacity={0.75}
                  onPress={() => { setSearch(''); setDetailId(container.id); }}
                  style={{ marginBottom: 8 }}>
                  <BlurView intensity={isDark ? 20 : 38} tint={isDark ? 'dark' : 'light'}
                    style={{ borderRadius: 14, borderWidth: 1, borderColor: container.color + '40',
                      padding: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: container.color, borderRadius: 2, marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                      {item.tags.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {item.tags.map(tag => (
                            <View key={tag} style={{ backgroundColor: container.color + '20', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                              <Text style={{ color: container.color, fontSize: 10, fontWeight: '600' }}>#{tag}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: container.color + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: container.color }} />
                      <Text style={{ color: container.color, fontSize: 11, fontWeight: '700' }}>{container.name}</Text>
                    </View>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Grid */}
          {search.trim().length === 0 && (
            containers.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: ACCENT + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <IconSymbol name="shippingbox.fill" size={32} color={ACCENT} />
                </View>
                <Text style={{ color: c.text, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>{tr.noContainers}</Text>
                <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center', marginBottom: 24 }}>Додай коробку, шафу або місце зберігання</Text>
                <TouchableOpacity onPress={openNew}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12,
                    borderRadius: 13, borderWidth: 1, borderColor: ACCENT + '50', backgroundColor: ACCENT + '12' }}>
                  <IconSymbol name="plus" size={15} color={ACCENT} />
                  <Text style={{ color: ACCENT, fontWeight: '700' }}>{tr.newContainer}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {containers.map(con => (
                  <TouchableOpacity key={con.id} activeOpacity={0.75} onPress={() => setDetailId(con.id)}>
                    <View style={{
                      width: CARD_W, borderRadius: 18, overflow: 'hidden',
                      borderWidth: 1, borderColor: con.color + '35',
                    }}>
                      {/* Colored top band */}
                      <LinearGradient
                        colors={[con.color + '30', con.color + '10']}
                        style={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 12 }}>
                        <View style={{ width: 40, height: 40, borderRadius: 13,
                          backgroundColor: con.color + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                          <IconSymbol name="shippingbox.fill" size={20} color={con.color} />
                        </View>
                        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 }} numberOfLines={2}>
                          {con.name}
                        </Text>
                        {con.location ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}>
                            <IconSymbol name="location.fill" size={10} color={c.sub} />
                            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '500' }} numberOfLines={1}>{con.location}</Text>
                          </View>
                        ) : null}
                      </LinearGradient>

                      {/* Item count row */}
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        paddingHorizontal: 14, paddingVertical: 10,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.6)',
                      }}>
                        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500' }}>
                          {con.items.length > 0
                            ? `${con.items.length} ${con.items.length === 1 ? 'річ' : con.items.length < 5 ? 'речі' : 'речей'}`
                            : 'Порожньо'}
                        </Text>
                        <View style={{ width: 22, height: 22, borderRadius: 7,
                          backgroundColor: con.color + '25', alignItems: 'center', justifyContent: 'center' }}>
                          <IconSymbol name="chevron.right" size={11} color={con.color} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ── Container Form Modal ─────────────────────────────────────────────── */}
      <Modal visible={showForm} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowForm(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetOuter}>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
                style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginRight: 'auto', marginLeft: 'auto' }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', flex: 1 }}>
                    {editingId ? tr.editContainer : tr.newContainer}
                  </Text>
                  <TouchableOpacity onPress={() => setShowForm(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>

                <Text style={[s.label, { color: c.sub }]}>{tr.containerName.toUpperCase()}</Text>
                <TextInput placeholder={tr.containerNamePlaceholder} placeholderTextColor={c.sub}
                  value={cName} onChangeText={setCName} autoFocus
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]} />

                <Text style={[s.label, { color: c.sub }]}>{tr.containerLocation.toUpperCase()}</Text>
                <TextInput placeholder={tr.containerLocationPlaceholder} placeholderTextColor={c.sub}
                  value={cLocation} onChangeText={setCLocation}
                  style={[s.input, { backgroundColor: c.dim, color: c.text }]} />

                <Text style={[s.label, { color: c.sub, marginBottom: 10 }]}>КОЛІР</Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
                  {PALETTE.map(color => (
                    <TouchableOpacity key={color} onPress={() => setCColor(color)}
                      style={{
                        width: 36, height: 36, borderRadius: 18, backgroundColor: color,
                        borderWidth: cColor === color ? 3 : 0, borderColor: '#fff',
                        shadowColor: cColor === color ? color : 'transparent',
                        shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 4,
                      }} />
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setShowForm(false)}
                    style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveContainer} disabled={!cName.trim()}
                    style={[s.btn, { flex: 2, backgroundColor: !cName.trim() ? c.dim : cColor }]}>
                    <Text style={{ color: !cName.trim() ? c.sub : '#fff', fontWeight: '700' }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Container Detail Modal ─────────────────────────────────────────────── */}
      <Modal visible={!!detail} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailId(null)}>
        {detail && (
          <LinearGradient colors={[c.bg1, c.bg2]} style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
              <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

                {/* Detail header */}
                <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{detail.name}</Text>
                    {detail.location ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <IconSymbol name="location.fill" size={12} color={c.sub} />
                        <Text style={{ color: c.sub, fontSize: 13 }}>{detail.location}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginLeft: 12 }}>
                    <TouchableOpacity onPress={() => openEdit(detail)}
                      style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: c.border, backgroundColor: c.dim }}>
                      <IconSymbol name="pencil" size={14} color={c.sub} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteContainer(detail.id)}
                      style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' }}>
                      <IconSymbol name="trash" size={14} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setDetailId(null)}
                      style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: c.border, backgroundColor: c.dim }}>
                      <IconSymbol name="xmark" size={14} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Inline add item */}
                <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: c.dim, borderRadius: 12, borderWidth: 1, borderColor: c.border,
                      paddingHorizontal: 12, paddingVertical: 10 }}>
                      <IconSymbol name="plus" size={14} color={c.sub} />
                      <TextInput
                        ref={addInputRef}
                        placeholder="Нова річ..."
                        placeholderTextColor={c.sub}
                        value={newItemName}
                        onChangeText={setNewItemName}
                        onSubmitEditing={() => addItem(detail.id)}
                        returnKeyType="done"
                        style={{ flex: 1, fontSize: 14, color: c.text }}
                      />
                      {newItemName.length > 0 && (
                        <TouchableOpacity onPress={() => setNewItemName('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <IconSymbol name="xmark.circle.fill" size={15} color={c.sub} />
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => addItem(detail.id)}
                      disabled={!newItemName.trim()}
                      style={{
                        width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: newItemName.trim() ? detail.color : c.dim,
                      }}>
                      <IconSymbol name="arrow.up" size={18} color={newItemName.trim() ? '#fff' : c.sub} />
                    </TouchableOpacity>
                  </View>
                  {/* Optional tags input */}
                  {newItemName.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
                      backgroundColor: c.dim, borderRadius: 10, borderWidth: 1, borderColor: c.border,
                      paddingHorizontal: 12, paddingVertical: 8 }}>
                      <IconSymbol name="tag" size={12} color={c.sub} />
                      <TextInput
                        placeholder="Теги через кому: зима, одяг"
                        placeholderTextColor={c.sub}
                        value={newItemTags}
                        onChangeText={setNewItemTags}
                        onSubmitEditing={() => addItem(detail.id)}
                        returnKeyType="done"
                        style={{ flex: 1, fontSize: 13, color: c.text }}
                      />
                    </View>
                  )}
                </View>

                {/* Items */}
                <ScrollView
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled">

                  {detail.items.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: detail.color + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                        <IconSymbol name="archivebox" size={26} color={detail.color} />
                      </View>
                      <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 4 }}>{tr.noItems}</Text>
                      <Text style={{ color: c.sub, fontSize: 13 }}>Введи назву вище і натисни ↑</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                        {detail.items.length} {detail.items.length === 1 ? 'річ' : detail.items.length < 5 ? 'речі' : 'речей'}
                      </Text>
                      {detail.items.map(item => (
                        <View key={item.id} style={{
                          flexDirection: 'row', alignItems: 'flex-start',
                          paddingHorizontal: 14, paddingVertical: 13,
                          marginBottom: 8, borderRadius: 14,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)',
                          borderWidth: 1, borderColor: c.border,
                        }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: detail.color, marginTop: 5, marginRight: 12 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{item.name}</Text>
                            {item.tags.length > 0 && (
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                                {item.tags.map(tag => (
                                  <View key={tag} style={{ backgroundColor: detail.color + '20', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                    <Text style={{ color: detail.color, fontSize: 11, fontWeight: '600' }}>#{tag}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => deleteItem(detail.id, item.id)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="xmark" size={13} color={c.sub} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </>
                  )}
                </ScrollView>
              </KeyboardAvoidingView>
            </SafeAreaView>
          </LinearGradient>
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetOuter: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:      { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  label:      { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:      { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500', marginBottom: 2 },
  btn:        { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
