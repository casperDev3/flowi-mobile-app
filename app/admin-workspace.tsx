import { Atlas } from '@/constants/atlas';
/**
 * app/admin-workspace.tsx — «Адміністрування workspace» (контракт §2.7).
 *
 * Видимий лише адмінам (`user.isAdmin`) — посилання в
 * `app/(tabs)/settings.tsx` ховається для решти, а сам екран додатково
 * підстраховується `useEffect` нижче: прямий deep-link на цей маршрут не
 * авторизованим адміном не має сенсу показувати, бо кожен виклик усе одно
 * впаде на сервері `403 not_admin`.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { ApiError, apiFetch as apiFetchAdmin } from '@/store/api';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { fontFamily } from '@/constants/theme';

interface WorkspaceAdminOut {
  name: string;
  color: string;
  registration_mode: 'open' | 'approval';
  user_count: number;
  pending_requests: number;
}

interface RegistrationRequestOut {
  id: string;
  email: string;
  name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  invite: { project_name: string; role: string } | null;
}

interface AdminUserOut {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  date_joined: string;
}

export default function AdminWorkspaceScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { user } = useAuth();
  const contentWidth = useContentWidth();

  // Той самий токен-набір, що й account.tsx/workspace.tsx/login.tsx — раніше
  // тут була окрема хардкоджена палітра, злегка розбіжна з рештою auth-екранів.
  const k = dsTokens(isDark);
  const c = useMemo(() => ({
    ...getScreenColors('auth', isDark),
    red: k.status.danger,
    dim: k.surface.subtle,
    card:   k.surface.card,
  }), [isDark, k]);

  const [workspace, setWorkspace] = useState<WorkspaceAdminOut | null>(null);
  const [requests, setRequests] = useState<RegistrationRequestOut[]>([]);
  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [ws, reqs, us] = await Promise.all([
        apiFetchAdmin<WorkspaceAdminOut>('/admin/workspace/'),
        apiFetchAdmin<{ results: RegistrationRequestOut[] }>('/admin/registration-requests/?status=pending'),
        apiFetchAdmin<{ results: AdminUserOut[] }>('/admin/users/'),
      ]);
      setWorkspace(ws);
      setRequests(reqs.results);
      setUsers(us.results);
      setLoadError(false);
    } catch (e) {
      // Не ковтаємо мовчки (CLAUDE.md): показуємо картку помилки з повтором
      // замість порожніх списків, які виглядають як «заявок і користувачів
      // нема», хоча насправді запит просто впав.
      if (__DEV__) console.warn('[admin-workspace] завантаження не вдалося:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  // Прямий deep-link не-адміном — на сервері впаде 403; тут просто йдемо назад.
  useEffect(() => {
    if (user && !user.isAdmin) router.back();
  }, [user, router]);

  const handleApprove = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await apiFetchAdmin(`/admin/registration-requests/${id}/approve/`, { method: 'POST', body: {} });
      setRequests(prev => prev.filter(r => r.id !== id));
      // Погоджена заявка стає користувачем — без цього він не з'являвся б у
      // списку нижче до ручного pull-to-refresh.
      void load();
    } catch (e) {
      Alert.alert(tr.adminActionFailedTitle, describeAdminError(e, tr));
    } finally {
      setBusyId(null);
    }
  }, [tr, load]);

  // Причину відмови питаємо інлайн-полем під заявкою (контракт §2.7 — `reason`
  // опційний): `Alert.prompt` існує лише на iOS, а окрема модалка заради
  // необов'язкового поля була б зайвою — просте поле в самому рядку працює
  // однаково на обох платформах.
  const handleReject = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      const reason = rejectReasons[id]?.trim();
      await apiFetchAdmin(`/admin/registration-requests/${id}/reject/`, {
        method: 'POST',
        body: reason ? { reason } : {},
      });
      setRequests(prev => prev.filter(r => r.id !== id));
      setRejectReasons(prev => { const { [id]: _omit, ...rest } = prev; return rest; });
    } catch (e) {
      Alert.alert(tr.adminActionFailedTitle, describeAdminError(e, tr));
    } finally {
      setBusyId(null);
    }
  }, [tr, rejectReasons]);

  const handleToggleRegistrationMode = useCallback(async (value: boolean) => {
    if (!workspace) return;
    const mode = value ? 'approval' : 'open';
    const prev = workspace;
    setWorkspace({ ...workspace, registration_mode: mode });
    try {
      const updated = await apiFetchAdmin<WorkspaceAdminOut>('/admin/workspace/', {
        method: 'PATCH',
        body: { registration_mode: mode },
      });
      setWorkspace(updated);
    } catch (e) {
      setWorkspace(prev);
      Alert.alert(tr.adminRegistrationModeLabel, describeAdminError(e, tr));
    }
  }, [workspace, tr]);

  const runToggleAdmin = useCallback(async (row: AdminUserOut) => {
    setBusyId(row.id);
    try {
      const updated = await apiFetchAdmin<AdminUserOut>(`/admin/users/${row.id}/`, {
        method: 'PATCH',
        body: { is_admin: !row.is_admin },
      });
      setUsers(prev => prev.map(u => (u.id === row.id ? updated : u)));
    } catch (e) {
      Alert.alert(row.is_admin ? tr.adminRevokeAdmin : tr.adminMakeAdmin, describeAdminError(e, tr));
    } finally {
      setBusyId(null);
    }
  }, [tr]);

  /**
   * Мінор із ревʼю: підтвердження лише на руйнівний напрямок (забрати права) —
   * призначення адміном зворотне одним тапом іншого адміна, тож зайве питання
   * там було б шумом.
   */
  const handleToggleAdmin = useCallback((row: AdminUserOut) => {
    if (!row.is_admin) { void runToggleAdmin(row); return; }
    Alert.alert(
      tr.adminRevokeAdmin,
      tr.adminConfirmRevokeAdminMsg.replace('{name}', row.name || row.email),
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.adminRevokeAdmin, style: 'destructive', onPress: () => void runToggleAdmin(row) },
      ],
    );
  }, [tr, runToggleAdmin]);

  const runToggleActive = useCallback(async (row: AdminUserOut) => {
    setBusyId(row.id);
    try {
      const updated = await apiFetchAdmin<AdminUserOut>(`/admin/users/${row.id}/`, {
        method: 'PATCH',
        body: { is_active: !row.is_active },
      });
      setUsers(prev => prev.map(u => (u.id === row.id ? updated : u)));
    } catch (e) {
      Alert.alert(row.is_active ? tr.adminDeactivateUser : tr.adminActivateUser, describeAdminError(e, tr));
    } finally {
      setBusyId(null);
    }
  }, [tr]);

  /** Той самий мінор — підтвердження лише на деактивацію, не на повернення доступу. */
  const handleToggleActive = useCallback((row: AdminUserOut) => {
    if (!row.is_active) { void runToggleActive(row); return; }
    Alert.alert(
      tr.adminDeactivateUser,
      tr.adminConfirmDeactivateMsg.replace('{name}', row.name || row.email),
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.adminDeactivateUser, style: 'destructive', onPress: () => void runToggleActive(row) },
      ],
    );
  }, [tr, runToggleActive]);

  return (
    <View style={{ flex: 1 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg1 }]} />
      {/* CLAUDE.md: фіксований хедер — лише через ScreenHeader/HeaderButton
          (мінор із ревʼю, раніше тут стояв бесп­осередній View з ручним
          topInset — той самий back-button-у-actions патерн, що й
          app/project/[id]/members.tsx). */}
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={tr.adminWorkspaceTitle}
          color={c.text}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.text,
            style: { backgroundColor: c.card, borderColor: 'transparent' },
          }}
        />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.sub} />
          </View>
        ) : loadError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
            <IconSymbol name="exclamationmark.triangle" size={28} color={c.red} />
            <Text style={{ color: c.sub, fontSize: 14, textAlign: 'center' }}>{tr.adminLoadError}</Text>
            <TouchableOpacity
              onPress={onRefresh}
              style={[st.actionBtn, { backgroundColor: c.accent + '20', paddingHorizontal: 16 }]}
            >
              <Text style={[st.actionBtnText, { color: c.accent }]}>{tr.adminRetry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[contentWidth, { padding: 20, paddingBottom: 48 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
          >
            {/* Налаштування workspace */}
            <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.adminSettingsSection.toUpperCase()}</Text>
            <View style={[st.card, { backgroundColor: c.card }]}>
              <View style={st.row}>
                <Text style={[st.rowLabel, { color: c.text, flex: 1 }]}>{tr.adminRegistrationModeLabel}</Text>
                <Text style={[st.rowSub, { color: c.sub, marginRight: 8 }]}>
                  {workspace?.registration_mode === 'approval' ? tr.adminRegistrationModeApproval : tr.adminRegistrationModeOpen}
                </Text>
                <Switch
                  value={workspace?.registration_mode === 'approval'}
                  onValueChange={handleToggleRegistrationMode}
                  trackColor={{ true: k.action.primary }}
                />
              </View>
            </View>

            {/* Заявки на реєстрацію */}
            <Text style={[st.sectionLabel, { color: c.sub, marginTop: 20 }]}>
              {tr.adminRequestsSection.toUpperCase()} {requests.length > 0 ? `(${requests.length})` : ''}
            </Text>
            <View style={[st.card, { backgroundColor: c.card }]}>
              {requests.length === 0 ? (
                <Text style={[st.emptyText, { color: c.sub }]}>{tr.adminNoRequests}</Text>
              ) : requests.map((req, i) => (
                <View key={req.id} style={[st.requestBlock, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={st.requestRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[st.rowLabel, { color: c.text }]} numberOfLines={1}>{req.name || req.email}</Text>
                      <Text style={[st.rowSub, { color: c.sub }]} numberOfLines={1}>{req.email}</Text>
                      {req.invite && (
                        <Text style={[st.rowSub, { color: c.accent }]} numberOfLines={1}>
                          {tr.adminInvitedByLabel}: {req.invite.project_name}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleApprove(req.id)}
                      disabled={busyId === req.id}
                      style={[st.actionBtn, { backgroundColor: k.status.success + '20' }]}
                    >
                      <Text style={[st.actionBtnText, { color: k.status.success }]}>{tr.adminApprove}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleReject(req.id)}
                      disabled={busyId === req.id}
                      style={[st.actionBtn, { backgroundColor: c.red + '20' }]}
                    >
                      <Text style={[st.actionBtnText, { color: c.red }]}>{tr.adminReject}</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    value={rejectReasons[req.id] ?? ''}
                    onChangeText={v => setRejectReasons(prev => ({ ...prev, [req.id]: v }))}
                    placeholder={tr.adminRejectReasonPrompt}
                    placeholderTextColor={k.text.muted}
                    style={[st.reasonInput, { color: c.text, backgroundColor: c.dim }]}
                  />
                </View>
              ))}
            </View>

            {/* Користувачі */}
            <Text style={[st.sectionLabel, { color: c.sub, marginTop: 20 }]}>{tr.adminUsersSection.toUpperCase()}</Text>
            <View style={[st.card, { backgroundColor: c.card }]}>
              {users.map((row, i) => (
                <View key={row.id} style={[st.userRow, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.rowLabel, { color: row.is_active ? c.text : c.sub }]} numberOfLines={1}>
                      {row.name || row.email} {row.id === Number(user?.id) ? tr.adminYouLabel : ''}
                    </Text>
                    <Text style={[st.rowSub, { color: c.sub }]} numberOfLines={1}>
                      {row.email}{row.is_admin ? tr.adminAdminBadge : ''}{!row.is_active ? tr.adminOffBadge : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleToggleAdmin(row)}
                    disabled={busyId === row.id || row.id === Number(user?.id)}
                    style={[st.actionBtn, { backgroundColor: c.dim, opacity: row.id === Number(user?.id) ? 0.4 : 1 }]}
                  >
                    <Text style={[st.actionBtnText, { color: c.text }]}>
                      {row.is_admin ? tr.adminRevokeAdmin : tr.adminMakeAdmin}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleToggleActive(row)}
                    disabled={busyId === row.id || row.id === Number(user?.id)}
                    style={[st.actionBtn, { backgroundColor: row.is_active ? c.red + '20' : k.status.success + '20', opacity: row.id === Number(user?.id) ? 0.4 : 1 }]}
                  >
                    <Text style={[st.actionBtnText, { color: row.is_active ? c.red : k.status.success }]}>
                      {row.is_active ? tr.adminDeactivateUser : tr.adminActivateUser}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

/** Гострі помилки з мапи `code` контракту §2.7 — решта показуються як є (i18n). */
function describeAdminError(e: unknown, tr: Translations): string {
  if (e instanceof ApiError) {
    if (e.code === 'last_admin') return tr.adminLastAdminError;
    if (e.code === 'cannot_deactivate_self') return tr.adminCannotDeactivateSelfError;
    if (e.code === 'already_decided') return tr.adminAlreadyDecidedError;
    // §2.7: approve може впасти 409 email_taken, якщо хтось із тим email
    // встиг зареєструватись іншим шляхом, поки заявка чекала рішення.
    if (e.code === 'email_taken') return tr.adminEmailTakenError;
    return e.message;
  }
  return String(e);
}

const st = StyleSheet.create({
  sectionLabel: { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.3, marginLeft: 2, marginBottom: 8 },
  card: { borderRadius: Atlas.radius.xlarge, overflow: 'hidden', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 14, fontFamily: fontFamily.semibold },
  rowSub: { fontSize: 12, marginTop: 2 },
  emptyText: { fontSize: 13, padding: 16, textAlign: 'center' },
  requestBlock: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Мінор із ревʼю: рядки списку користувачів рендеряться БЕЗ обгортки
  // `requestBlock` (та вже дає горизонтальний відступ заявкам вище) —
  // без власного `paddingHorizontal` вміст торкався б країв картки.
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  reasonInput: { borderRadius: 12, minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, fontFamily: fontFamily.regular },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 7, minHeight: 36, justifyContent: 'center', borderRadius: 999 },
  actionBtnText: { fontSize: 13, fontFamily: fontFamily.semibold },
});
