/**
 * app/clients.tsx — «Клієнти»: список CRM-карток (окремий розділ поруч із
 * Проєктами, не вкладка в них).
 *
 * Клієнти — особиста колекція 'clients' (utils/clients.ts); бачить їх лише
 * власник. Пошук — по назві, тегах, контактах і реквізитах; фільтр статусу —
 * Усі (без архіву) / Активні / Потенційні / Архів. Тап — картка клієнта
 * (app/client/[id].tsx), «+» — нова картка.
 */
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ClientFormSheet } from '@/components/clients/ClientFormSheet';
import { BentoCard, EmptyState, GlassScreen } from '@/components/ds';
import { AppHeader } from '@/components/shared/AppHeader';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, touchTarget } from '@/constants/theme';
import { useClients } from '@/hooks/use-clients';
import { useContentWidth } from '@/hooks/use-content-width';
import { useDS } from '@/hooks/use-ds';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import {
  draftToClient,
  filterClients,
  sortClients,
  type Client,
  type ClientDraft,
  type ClientStatusFilter,
} from '@/utils/clients';
import { haptic } from '@/utils/haptics';

interface ProjectRow { id: string; name: string; clientId?: string | null; archivedAt?: string }

const FILTERS: readonly ClientStatusFilter[] = ['all', 'active', 'potential', 'archived'];

export default function ClientsScreen() {
  const router = useRouter();
  const { t, isDark } = useDS();
  const { tr, lang } = useI18n();
  const cu = tr.clientsUi;
  const contentWidth = useContentWidth();
  const { clients, loaded, failed, reload, upsertClient } = useClients();

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const loadProjects = useCallback(async () => {
    const list = await loadData<ProjectRow[]>('projects', []);
    setProjects(Array.isArray(list) ? list : []);
  }, []);
  useFocusEffect(useCallback(() => { void loadProjects(); void reload(); }, [loadProjects, reload]));
  useStorageRefresh(['projects'], loadProjects);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClientStatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const result: Record<ClientStatusFilter, number> = { all: 0, active: 0, potential: 0, archived: 0 };
    for (const c of clients) {
      result[c.status] += 1;
      if (c.status !== 'archived') result.all += 1;
    }
    return result;
  }, [clients]);

  const projectCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      if (!p.clientId || p.archivedAt) continue;
      map.set(p.clientId, (map.get(p.clientId) ?? 0) + 1);
    }
    return map;
  }, [projects]);

  const visible = useMemo(
    () => sortClients(filterClients(clients, query, filter), lang),
    [clients, query, filter, lang],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([reload(), loadProjects()]).finally(() => setRefreshing(false));
  }, [reload, loadProjects]);

  const create = useCallback(async (draft: ClientDraft) => {
    setBusy(true);
    setError(null);
    try {
      const client = draftToClient(draft, null);
      await upsertClient(client);
      haptic.success();
      setFormOpen(false);
      router.push(`/client/${encodeURIComponent(client.id)}` as never);
    } catch (e) {
      if (__DEV__) console.warn('[clients] створення не вдалося:', e);
      setError(cu.saveFailed);
    } finally {
      setBusy(false);
    }
  }, [upsertClient, router, cu]);

  const filterLabel: Record<ClientStatusFilter, string> = {
    all: cu.filterAll, active: cu.filterActive, potential: cu.filterPotential, archived: cu.filterArchived,
  };
  const statusLabel = (c: Client) => (c.status === 'potential' ? cu.statusPotential : c.status === 'archived' ? cu.statusArchived : null);

  const renderRow = (client: Client) => {
    const n = projectCount.get(client.id) ?? 0;
    const firstContact = client.contacts[0];
    const meta = [
      n ? `${cu.projects}: ${n}` : null,
      firstContact ? [firstContact.name, firstContact.role].filter(Boolean).join(' · ') : null,
      client.tags.length ? client.tags.map(tag => `#${tag}`).join(' ') : null,
    ].filter(Boolean).join('  ·  ');
    const badge = statusLabel(client);
    return (
      <TouchableOpacity
        key={client.id}
        onPress={() => router.push(`/client/${encodeURIComponent(client.id)}` as never)}
        accessibilityRole="button"
        accessibilityLabel={[client.name, badge].filter(Boolean).join(', ')}
        testID={`client-row-${client.id}`}
        style={[st.row, { backgroundColor: t.surface.card }]}>
        <View style={[st.avatar, { backgroundColor: client.color + '26' }]}>
          <Text style={[st.avatarText, { color: client.color }]}>{(client.name.trim()[0] ?? '?').toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={[st.name, { color: t.text.primary, flexShrink: 1 }]}>{client.name}</Text>
            {badge ? (
              <View style={[st.badge, { backgroundColor: t.surface.subtle }]}>
                <Text style={[st.badgeText, { color: t.text.secondary }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {meta ? <Text numberOfLines={1} style={[st.meta, { color: t.text.secondary }]}>{meta}</Text> : null}
        </View>
        <IconSymbol name="chevron.right" size={14} color={t.text.muted} />
      </TouchableOpacity>
    );
  };

  let body: React.ReactNode;
  if (failed) {
    body = <EmptyState icon="exclamationmark.triangle" title={cu.loadFailed} actionLabel={tr.loadErrorRetry} onAction={() => { void reload(); }} />;
  } else if (loaded && clients.length === 0) {
    body = (
      <EmptyState
        icon="person.crop.rectangle.stack"
        title={cu.empty}
        caption={cu.emptyCaption}
        actionLabel={cu.newClient}
        onAction={() => setFormOpen(true)}
        actionTestID="clients-empty-create"
      />
    );
  } else if (loaded && visible.length === 0) {
    body = <EmptyState icon="magnifyingglass" title={cu.noMatch} />;
  } else {
    body = <View style={{ gap: 8 }}>{visible.map(renderRow)}</View>;
  }

  return (
    <GlassScreen module="projects">
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={cu.title}
        back={{ onPress: () => router.back(), label: tr.back, color: t.text.primary }}
        actions={(
          <HeaderButton onPress={() => setFormOpen(true)} accessibilityLabel={cu.newClient}>
            <IconSymbol name="plus" size={22} color={t.text.primary} />
          </HeaderButton>
        )}
      />
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.text.secondary} />}>
        <BentoCard compact style={{ marginBottom: 12, gap: 10 }}>
          <View style={[st.search, { backgroundColor: t.surface.subtle }]}>
            <IconSymbol name="magnifyingglass" size={16} color={t.text.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={cu.searchPlaceholder}
              placeholderTextColor={t.text.muted}
              accessibilityLabel={cu.searchPlaceholder}
              autoCorrect={false}
              clearButtonMode="while-editing"
              testID="clients-search"
              style={[st.searchInput, { color: t.text.primary }]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {FILTERS.map(f => {
                const on = filter === f;
                return (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setFilter(f)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[st.chip, { backgroundColor: on ? t.action.primary : t.surface.subtle }]}>
                    <Text style={{ color: on ? t.text.onAction : t.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>
                      {filterLabel[f]}
                    </Text>
                    <Text style={{ color: on ? t.text.onAction : t.text.secondary, fontSize: 12, fontVariant: ['tabular-nums'], opacity: 0.8 }}>
                      {counts[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </BentoCard>
        {body}
      </ScrollView>

      <ClientFormSheet
        visible={formOpen}
        client={null}
        isDark={isDark}
        onClose={() => { setFormOpen(false); setError(null); }}
        onSave={draft => { void create(draft); }}
        busy={busy}
        error={error}
      />
    </GlassScreen>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.cardCompact, paddingHorizontal: 14, paddingVertical: 12, minHeight: 64 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontFamily: fontFamily.semibold },
  name: { fontSize: 15, fontFamily: fontFamily.semibold },
  meta: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 2 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontFamily: fontFamily.medium },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.control, paddingHorizontal: 12, minHeight: touchTarget },
  searchInput: { flex: 1, fontSize: 15, fontFamily: fontFamily.regular, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, minHeight: 36, paddingHorizontal: 14 },
});
