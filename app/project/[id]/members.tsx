/**
 * app/project/[id]/members.tsx — Учасники проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.2–4.3).
 *
 * Не окремий розділ проєкту (`constants/projectNav.ts`) — досяжний лише з
 * «Налаштування → Учасники» (`app/project/[id]/settings.tsx`), тому й
 * зареєстрований у `_layout.tsx` прихованим табом (`href: null`), а тут
 * власна кнопка «назад»: Tabs, на відміну від Stack, її сама не малює.
 *
 * Список і команда керування — завжди з МЕРЕЖІ (не з кешу `project_members_v1`
 * — той лише для пікера виконавця, де точність «хто зараз у команді» не
 * критична): склад команди й роль тут — це те, заради чого екран узагалі
 * відкривають, і кеш хвилинної давнини тут ввів би в оману («видалив
 * учасника — а він і досі в списку»).
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectRole } from '@/hooks/use-project-role';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { hasPendingProjectOutbox, syncAllMyProjects } from '@/store/project-sync';
import { OfflineError, ApiError } from '@/store/api';
import {
  changeMemberRole,
  createInviteLink,
  fetchProjectMembers,
  getCachedMembers,
  inviteByEmail,
  listProjectInvites,
  removeProjectMember,
  revokeProjectInvite,
  setMembersCacheFor,
  transferProjectOwnership,
  type InviteOut,
  type MemberOut,
} from '@/store/project-team';
import { haptic } from '@/utils/haptics';

const EXPIRY_OPTIONS: { hours: number; labelKey: 'projectMembersExpiry24h' | 'projectMembersExpiry7d' | 'projectMembersExpiry30d' }[] = [
  { hours: 24, labelKey: 'projectMembersExpiry24h' },
  { hours: 24 * 7, labelKey: 'projectMembersExpiry7d' },
  { hours: 24 * 30, labelKey: 'projectMembersExpiry30d' },
];

/**
 * Ліміт використань посилання (контракт §4.3: `max_uses: number|null`) —
 * review finding: форма раніше завжди слала `null`, тож одноразове
 * запрошення (найчастіший випадок — один конкретний новий учасник) не
 * відрізнялось від постійного лінка «на всіх».
 */
const MAX_USES_OPTIONS: readonly (number | null)[] = [1, 5, 20, null];

export default function ProjectMembersScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  // I18N-03: `toLocaleDateString()` без аргументу бере мову ПРИСТРОЮ, а не
  // застосунку — українець з англійським телефоном бачив третій варіант
  // дати. Той самий прийом, що в app/invite.tsx.
  const dateLocale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  const { user } = useAuth();
  const role = useProjectRole(projectId);
  const isOwner = role === 'owner';
  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const [members, setMembers] = useState<MemberOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  /**
   * ERR-09: 500/таймаут/429 раніше лишали екран у стані «у проєкті нікого
   * немає» — а це завжди неправда, бо сам користувач у ньому є. Збій мусить
   * бути відмінним від порожнього списку й мати кнопку «Повторити»:
   * `useFocusEffect` ретраїть лише на повторний вхід на екран.
   */
  const [loadError, setLoadError] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  // §4.2/§9.4 (review finding): власник раніше не мав ЖОДНОГО способу вийти
  // з власного проєкту — блок нижче з'являється поверх звичайного списку й
  // пропонує обрати нового власника серед наявних учасників/глядачів.
  const [transferring, setTransferring] = useState(false);

  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [inviteHours, setInviteHours] = useState(24 * 7);
  const [inviteMaxUses, setInviteMaxUses] = useState<number | null>(null);
  const [creatingLink, setCreatingLink] = useState(false);
  const [createdInvite, setCreatedInvite] = useState<InviteOut | null>(null);
  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');

  const [invites, setInvites] = useState<InviteOut[]>([]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const list = await fetchProjectMembers(projectId);
      setMembers(list);
      setOffline(false);
      setLoadError(false);
    } catch (e) {
      if (e instanceof OfflineError) {
        setMembers(await getCachedMembers(projectId));
        setOffline(true);
        setLoadError(false);
      } else {
        // Список НЕ замінюється порожнім: якщо попередня спроба щось
        // принесла, краще показати старе поруч зі смужкою збою, ніж
        // стверджувати, що в проєкті нікого немає.
        setLoadError(true);
        if (__DEV__) console.warn('[project/members] завантаження не вдалося:', e);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadInvites = useCallback(async () => {
    if (!projectId || !isOwner) return;
    try {
      setInvites(await listProjectInvites(projectId));
    } catch (e) {
      if (!(e instanceof OfflineError) && __DEV__) console.warn('[project/members] список запрошень не вдався:', e);
    }
  }, [projectId, isOwner]);

  useFocusEffect(useCallback(() => { void load(); void loadInvites(); }, [load, loadInvites]));

  const myId = user?.id;

  const handleChangeRole = useCallback((member: MemberOut) => {
    if (!projectId) return;
    const nextRole = member.role === 'member' ? 'viewer' : 'member';
    Alert.alert(
      tr.projectMembersChangeRole,
      `${member.user.name || member.user.email} → ${nextRole === 'member' ? tr.roleMember : tr.roleViewer}`,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.projectMembersChangeRole,
          onPress: () => {
            void (async () => {
              setBusyUserId(member.user.id);
              try {
                const updated = await changeMemberRole(projectId, member.user.id, nextRole);
                const next = members.map(m => (m.user.id === updated.user.id ? updated : m));
                setMembers(next);
                // review finding: кеш `project_members_v1` (пікер виконавця)
                // інакше лишався зі старою роллю до наступного відкриття
                // цього ж екрана.
                void setMembersCacheFor(projectId, next);
                haptic.success();
              } catch (e) {
                haptic.error();
                Alert.alert(tr.error, e instanceof ApiError ? e.message : tr.projectMembersError);
              } finally {
                setBusyUserId(null);
              }
            })();
          },
        },
      ],
    );
  }, [projectId, tr, members]);

  const handleRemove = useCallback((member: MemberOut) => {
    if (!projectId) return;
    Alert.alert(tr.projectMembersRemove, tr.projectMembersRemoveConfirm, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.projectMembersRemove,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyUserId(member.user.id);
            try {
              await removeProjectMember(projectId, member.user.id);
              const next = members.filter(m => m.user.id !== member.user.id);
              setMembers(next);
              // review finding: див. коментар у handleChangeRole — той самий
              // кеш мусить одразу забути видаленого учасника.
              void setMembersCacheFor(projectId, next);
              haptic.success();
            } catch (e) {
              haptic.error();
              Alert.alert(tr.error, e instanceof ApiError ? e.message : tr.projectMembersError);
            } finally {
              setBusyUserId(null);
            }
          })();
        },
      },
    ]);
  }, [projectId, tr, members]);

  const doLeave = useCallback(() => {
    if (!projectId || !myId) return;
    void (async () => {
      try {
        await removeProjectMember(projectId, Number(myId));
        haptic.success();
        // §9.4: доступу більше немає — прибрати локальні дані проєкту
        // одразу, а не чекати наступного 5-хвилинного циклу фонового
        // синку (той сам зробить це на 403 not_a_member, але зі
        // затримкою — людина вже пішла в Особисте раніше за нього).
        void syncAllMyProjects();
        router.replace('/(tabs)/today');
      } catch (e) {
        haptic.error();
        Alert.alert(tr.error, e instanceof ApiError ? e.message : tr.projectMembersError);
      }
    })();
  }, [projectId, myId, tr, router]);

  const handleLeave = useCallback(() => {
    if (!projectId || !myId) return;
    if (isOwner) {
      // §4.2: власника призначає лише transfer — Alert тут ЗАВЖДИ показував
      // би «спершу передайте власність» і не давав ЖОДНОГО способу це
      // зробити (review finding: «owner cannot leave at all»). Якщо в
      // проєкті є кому передати — пропонуємо це одразу.
      if (members.some(m => m.role !== 'owner')) {
        Alert.alert(tr.projectMembersLeave, tr.projectMembersOwnerCannotLeave, [
          { text: tr.cancel, style: 'cancel' },
          { text: tr.projectMembersTransferOwnership, onPress: () => setTransferring(true) },
        ]);
      } else {
        Alert.alert(tr.projectMembersLeave, tr.projectMembersOwnerCannotLeave);
      }
      return;
    }
    void (async () => {
      // Контракт §9.4: непорожній outbox цього проєкту — окреме, СИЛЬНІШЕ
      // попередження ПЕРЕД звичайним підтвердженням виходу (review finding:
      // раніше виходили без жодної перевірки, і незбережена офлайн-правка
      // губилась разом із `wipeLocalProject`, що йде за виходом).
      const pending = await hasPendingProjectOutbox(projectId);
      if (pending) {
        Alert.alert(tr.projectMembersLeave, tr.projectMembersLeaveUnsyncedWarning, [
          { text: tr.cancel, style: 'cancel' },
          { text: tr.projectMembersLeave, style: 'destructive', onPress: doLeave },
        ]);
        return;
      }
      Alert.alert(tr.projectMembersLeave, tr.projectMembersLeaveConfirm, [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.projectMembersLeave, style: 'destructive', onPress: doLeave },
      ]);
    })();
  }, [projectId, myId, isOwner, tr, members, doLeave]);

  const handleTransferOwnership = useCallback((member: MemberOut) => {
    Alert.alert(
      tr.projectMembersTransferOwnership,
      tr.projectMembersTransferOwnershipConfirm.replace('{name}', member.user.name || member.user.email),
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.projectMembersTransferOwnership,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              if (!projectId) return;
              setBusyUserId(member.user.id);
              try {
                await transferProjectOwnership(projectId, member.user.id);
                setTransferring(false);
                haptic.success();
                // Роль щойно змінилась для обох сторін — той самий шлях, що
                // й після зміни ролі власником: перечитати з мережі, а не
                // вигадувати локальний патч на двох записах (owner→member,
                // member→owner) одразу.
                void load();
              } catch (e) {
                haptic.error();
                Alert.alert(tr.error, e instanceof ApiError ? e.message : tr.projectMembersError);
              } finally {
                setBusyUserId(null);
              }
            })();
          },
        },
      ],
    );
  }, [projectId, tr, load]);

  const handleCreateLink = useCallback(async () => {
    if (!projectId) return;
    setCreatingLink(true);
    setCreatedInvite(null);
    try {
      const invite = await createInviteLink(projectId, inviteRole, inviteHours, inviteMaxUses);
      setCreatedInvite(invite);
      setCopied(false);
      void loadInvites();
      haptic.success();
    } catch (e) {
      haptic.error();
      Alert.alert(tr.error, e instanceof OfflineError ? tr.projectMembersOfflineHint : (e instanceof ApiError ? e.message : tr.projectMembersError));
    } finally {
      setCreatingLink(false);
    }
  }, [projectId, inviteRole, inviteHours, inviteMaxUses, loadInvites, tr]);

  const handleShareLink = useCallback(async () => {
    if (!createdInvite?.url) return;
    try { await Share.share({ message: createdInvite.url }); } catch { /* користувач закрив аркуш — не помилка */ }
  }, [createdInvite]);

  const handleCopyLink = useCallback(async () => {
    if (!createdInvite?.url) return;
    await Clipboard.setStringAsync(createdInvite.url);
    setCopied(true);
    haptic.light();
  }, [createdInvite]);

  const handleInviteEmail = useCallback(async () => {
    if (!projectId || !email.trim()) return;
    setSendingEmail(true);
    setEmailError('');
    try {
      await inviteByEmail(projectId, inviteRole, email.trim());
      setEmail('');
      haptic.success();
      Alert.alert(tr.projectMembersInviteByEmail, tr.projectMembersEmailInviteSent);
      void load();
    } catch (e) {
      haptic.error();
      if (e instanceof ApiError && e.status === 404) setEmailError(tr.projectMembersEmailUserNotFound);
      else if (e instanceof ApiError && e.status === 409) setEmailError(tr.projectMembersEmailAlreadyMember);
      else if (e instanceof OfflineError) setEmailError(tr.projectMembersOfflineHint);
      else setEmailError(e instanceof ApiError ? e.message : tr.projectMembersError);
    } finally {
      setSendingEmail(false);
    }
  }, [projectId, email, inviteRole, tr, load]);

  const handleRevoke = useCallback((invite: InviteOut) => {
    if (!projectId) return;
    Alert.alert(tr.projectMembersRevokeLink, tr.projectMembersRevokeConfirm, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.projectMembersRevokeLink,
        style: 'destructive',
        onPress: () => {
          void revokeProjectInvite(projectId, invite.id)
            .then(() => setInvites(prev => prev.filter(i => i.id !== invite.id)))
            .catch(e => { if (!(e instanceof OfflineError) && __DEV__) console.warn('[project/members] відкликання не вдалося:', e); });
        },
      },
    ]);
  }, [projectId, tr]);

  const roleLabel = (r: MemberOut['role']) => (r === 'owner' ? tr.roleOwner : r === 'member' ? tr.roleMember : tr.roleViewer);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => (a.role === b.role ? a.user.name.localeCompare(b.user.name, 'uk') : a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0)),
    [members],
  );

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.projectMembersTitle}
      // «Назад» — у проп back: ScreenHeader сам сховає стрілку на планшеті, де
      // оболонка вже малює крихти «Проєкт → …» (ScreenHeaderNav.ts).
      back={{
        onPress: () => router.back(),
        label: tr.back,
        color: c.text,
        style: { backgroundColor: c.dim, borderColor: c.border },
      }}>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: без цього перший тап по «Надіслати запрошення» лише ховав
        // клавіатуру, і кнопка виглядала мертвою.
        keyboardShouldPersistTaps="handled">

        {loadError && (
          <View style={[st.hint, { borderColor: '#EF4444', backgroundColor: c.dim, marginBottom: 12 }]}>
            <IconSymbol name="exclamationmark.circle" size={14} color="#EF4444" />
            <Text style={{ color: c.text, fontSize: 12, marginLeft: 6, flex: 1 }}>{tr.projectMembersError}</Text>
            <TouchableOpacity
              onPress={() => { void load(); void loadInvites(); }}
              accessibilityRole="button"
              accessibilityLabel={tr.adminRetry}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{tr.adminRetry}</Text>
            </TouchableOpacity>
          </View>
        )}

        {offline && (
          <View style={[st.hint, { borderColor: c.border, backgroundColor: c.dim, marginBottom: 12 }]}>
            <IconSymbol name="exclamationmark.circle" size={14} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 6, flex: 1 }}>{tr.projectMembersOfflineHint}</Text>
          </View>
        )}

        {transferring && (
          <View style={[st.linkCard, { borderColor: c.accent, backgroundColor: c.dim, marginBottom: 14 }]}>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 10 }}>{tr.projectMembersTransferOwnershipHint}</Text>
            {members.filter(m => m.role !== 'owner').length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 12, marginBottom: 10 }}>{tr.projectMembersTransferOwnershipNoMembers}</Text>
            ) : members.filter(m => m.role !== 'owner').map(member => (
              <TouchableOpacity
                key={member.user.id}
                onPress={() => handleTransferOwnership(member)}
                disabled={busyUserId != null}
                style={[st.memberRow, { borderColor: c.border, backgroundColor: c.bg2, marginBottom: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{member.user.name || member.user.email}</Text>
                  <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{member.user.email}</Text>
                </View>
                {busyUserId === member.user.id ? <ActivityIndicator size="small" color={c.accent} /> : (
                  <IconSymbol name="chevron.right" size={18} color={c.accent} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setTransferring(false)} style={{ alignItems: 'center', paddingVertical: 6 }}>
              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>{tr.cancel}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && members.length === 0 ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 30 }} />
        ) : loadError && members.length === 0 ? (
          // Порожній список малюється ЛИШЕ після успішної відповіді:
          // «нікого немає» і «не вдалося дізнатись» — різні стани.
          null
        ) : (
          <View style={{ marginBottom: 24 }}>
            {sortedMembers.map(member => {
              const isMe = String(member.user.id) === myId;
              const busy = busyUserId === member.user.id;
              return (
                <View
                  key={member.user.id}
                  style={[st.memberRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>
                      {member.user.name || member.user.email}{isMe ? ` (${tr.projectMembersYou})` : ''}
                    </Text>
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{member.user.email}</Text>
                  </View>
                  <View style={[st.roleBadge, { borderColor: c.border, backgroundColor: c.accent + '14' }]}>
                    <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{roleLabel(member.role)}</Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={c.accent} style={{ marginLeft: 10 }} />
                  ) : isOwner && !isMe && member.role !== 'owner' ? (
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert(member.user.name || member.user.email, undefined, [
                          { text: tr.projectMembersChangeRole, onPress: () => handleChangeRole(member) },
                          { text: tr.projectMembersRemove, style: 'destructive', onPress: () => handleRemove(member) },
                          { text: tr.cancel, style: 'cancel' },
                        ]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={member.user.name || member.user.email}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={{ marginLeft: 8 }}>
                      <IconSymbol name="ellipsis" size={18} color={c.sub} />
                    </TouchableOpacity>
                  ) : isMe && !isOwner ? (
                    <TouchableOpacity onPress={handleLeave} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: 8 }}>
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>{tr.projectMembersLeave}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {isOwner && (
          <>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{tr.projectMembersInviteSection}</Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              {(['member', 'viewer'] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setInviteRole(r)}
                  style={[st.segment, { backgroundColor: inviteRole === r ? c.accent : c.dim, borderColor: inviteRole === r ? c.accent : c.border }]}>
                  <Text style={{ color: inviteRole === r ? '#fff' : c.text, fontSize: 12, fontWeight: '700' }}>
                    {r === 'member' ? tr.roleMember : tr.roleViewer}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{tr.projectMembersLinkExpiry}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {EXPIRY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.hours}
                  onPress={() => setInviteHours(opt.hours)}
                  style={[st.segment, { backgroundColor: inviteHours === opt.hours ? c.accent : c.dim, borderColor: inviteHours === opt.hours ? c.accent : c.border }]}>
                  <Text style={{ color: inviteHours === opt.hours ? '#fff' : c.text, fontSize: 12, fontWeight: '700' }}>{String(tr[opt.labelKey])}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{tr.projectMembersInviteMaxUses}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {MAX_USES_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt ?? 'unlimited'}
                  onPress={() => setInviteMaxUses(opt)}
                  style={[st.segment, { backgroundColor: inviteMaxUses === opt ? c.accent : c.dim, borderColor: inviteMaxUses === opt ? c.accent : c.border }]}>
                  <Text style={{ color: inviteMaxUses === opt ? '#fff' : c.text, fontSize: 12, fontWeight: '700' }}>
                    {opt === null ? tr.projectMembersInviteMaxUsesUnlimited : opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              onPress={handleCreateLink}
              disabled={creatingLink}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: c.accent, borderRadius: 12, paddingVertical: 12, marginBottom: 14, opacity: creatingLink ? 0.7 : 1 }}>
              {creatingLink ? <ActivityIndicator color="#fff" /> : (
                <>
                  <IconSymbol name="link" size={15} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{tr.projectMembersCreateLink}</Text>
                </>
              )}
            </TouchableOpacity>

            {createdInvite?.url && (
              <View style={[st.linkCard, { borderColor: c.accent, backgroundColor: c.dim }]}>
                <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>{tr.projectMembersLinkCreated}</Text>
                <Text numberOfLines={2} style={{ color: c.sub, fontSize: 12, marginBottom: 10 }}>{createdInvite.url}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={handleShareLink} style={[st.smallBtn, { backgroundColor: c.accent }]}>
                    <IconSymbol name="square.and.arrow.up" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginLeft: 6 }}>{tr.projectMembersShareLink}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCopyLink} style={[st.smallBtn, { backgroundColor: c.border }]}>
                    <IconSymbol name={copied ? 'checkmark' : 'doc.on.doc'} size={14} color={c.text} />
                    <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', marginLeft: 6 }}>
                      {copied ? tr.projectMembersLinkCopied : tr.projectMembersCopyLink}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {invites.length > 0 && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{tr.projectMembersActiveLinks}</Text>
                {invites.map(invite => (
                  <View key={invite.id} style={[st.memberRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{roleLabel(invite.role)}</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                        {tr.inviteExpiresLabel} {new Date(invite.expires_at).toLocaleDateString(dateLocale)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRevoke(invite)}
                      accessibilityRole="button"
                      accessibilityLabel={tr.projectMembersRevokeLink}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="trash" size={16} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', marginBottom: 8 }}>{tr.projectMembersInviteByEmail}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: emailError ? 4 : 20 }}>
              <TextInput
                value={email}
                onChangeText={v => { setEmail(v); if (emailError) setEmailError(''); }}
                placeholder={tr.projectMembersEmailPlaceholder}
                accessibilityLabel={tr.projectMembersEmailPlaceholder}
                placeholderTextColor={c.sub}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                style={{ flex: 1, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontSize: 14 }}
              />
              <TouchableOpacity
                onPress={handleInviteEmail}
                disabled={!email.trim() || sendingEmail}
                style={{ borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: email.trim() ? c.accent : c.border }}>
                {sendingEmail ? <ActivityIndicator color="#fff" size="small" /> : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{tr.projectMembersSendInvite}</Text>
                )}
              </TouchableOpacity>
            </View>
            {emailError ? <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 20 }}>{emailError}</Text> : null}
          </>
        )}
      </ScrollView>
    </ProjectScreenShell>
  );
}

const st = StyleSheet.create({
  hint: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  roleBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  segment: { flex: 1, alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingVertical: 9 },
  linkCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  smallBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 9 },
});
