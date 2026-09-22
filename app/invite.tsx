/**
 * app/invite.tsx — обробка запрошення в проєкт (WORKSPACE_PROJECTS_PLAN.md §4,
 * контракт §4.3).
 *
 * Відкривається `hooks/use-incoming-invite-links.ts` на deep link
 * `ftrackingapp://invite?ws=...&p=...&t=...` — і холодним стартом, і поки
 * застосунок уже відкритий. Параметри дублюються в `pending_invite`
 * (§9.1): якщо застосунок перезапустили ПОСЕРЕД цього екрана (наприклад,
 * пішли реєструватись і повернулись), параметри навігації втрачаються, а
 * сховище — ні.
 *
 * Порядок дій дослівно повторює контракт §4.3(a)/(b)/(c)/(d):
 *  (a) інший workspace, гість — перевірити й підставити;
 *  (b) інший workspace, автентифікований — діалог «це вихід»;
 *  (c) той самий workspace, автентифікований — preview → «Приєднатися» → accept;
 *  (d) без акаунта — превʼю з посилання на реєстрацію з `invite_token`.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { ApiError, OfflineError } from '@/store/api';
import { UnsyncedOutboxError, useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { addRecentProject, syncProject } from '@/store/project-sync';
import { acceptInvite, previewInvite, type InvitePreview } from '@/store/project-team';
import {
  clearPendingInvite, getPendingInvite, type ParsedInviteLink,
} from '@/store/invite-link';
import {
  buildWorkspaceConfig, cachedWorkspaceConfig, checkWorkspace, normalizeWorkspaceOrigin, setWorkspaceConfig,
  type WorkspaceCheckSuccess,
} from '@/store/workspace';
import { haptic } from '@/utils/haptics';

type Stage = 'loading' | 'switch-confirm' | 'confirm-workspace' | 'preview' | 'joining' | 'joined' | 'error';

export default function InviteScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  // review finding: `toLocaleDateString()` без аргументу ігнорує вибір мови
  // застосунку й читає локаль пристрою — тут же ідемо тим самим
  // uk-UA/en-US вибором, що й решта екранів (напр. `app/project/[id]/tasks.tsx`).
  const dateLocale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { status: authStatus, switchWorkspace } = useAuth();
  const contentWidth = useContentWidth();
  const c = getScreenColors('auth', isDark);
  // `projectId`/`token` — назви, якими штовхає наш власний слухач
  // (hooks/use-incoming-invite-links.ts). `p`/`t` — запасний варіант: якщо
  // ОС/expo-router колись перехопить `ftrackingapp://invite?ws=&p=&t=`
  // (контракт §4.3) як звичайний маршрут ще ДО того, як наш слухач встиг
  // розібрати посилання сам, параметри прийдуть під контрактними іменами.
  const rawParams = useLocalSearchParams<{ ws?: string; projectId?: string; token?: string; p?: string; t?: string }>();
  const params = {
    ws: rawParams.ws,
    projectId: rawParams.projectId ?? rawParams.p,
    token: rawParams.token ?? rawParams.t,
  };

  const [stage, setStage] = useState<Stage>('loading');
  const [errorText, setErrorText] = useState('');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [link, setLink] = useState<ParsedInviteLink | null>(null);
  const [joinedProjectId, setJoinedProjectId] = useState<string | null>(null);
  // Case (a)/(d): результат перевірки НЕ конфігурованого/чужого workspace,
  // ще НЕ підставлений — чекає явного підтвердження (contract §4.3: «(a) …
  // перевірка /workspace/, підтвердження, встановити workspace»). Раніше
  // адреса підставлялась мовчки одразу після успішної перевірки — гостьовий
  // акаунт міг непомітно опинитись на сервері з довільного посилання (review
  // finding: атакер керує наступним логіном/реєстрацією через підмінений origin).
  const [pendingWorkspace, setPendingWorkspace] = useState<WorkspaceCheckSuccess | null>(null);

  const fail = useCallback((text: string) => { setErrorText(text); setStage('error'); }, []);

  const loadPreview = useCallback(async (token: string) => {
    try {
      const p = await previewInvite(token);
      setPreview(p);
      setStage('preview');
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) fail(tr.inviteExpired);
      else if (e instanceof ApiError && e.status === 404) fail(tr.inviteInvalid);
      else if (e instanceof OfflineError) fail(tr.inviteNetworkError);
      else fail(tr.inviteNetworkError);
    }
  }, [fail, tr]);

  // ── Крок 1: розібрати посилання (параметри навігації АБО те, що лишилось
  // у сховищі, якщо застосунок перезапустили посеред цього екрана) ─────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let resolved: ParsedInviteLink | null = null;
      if (params.ws && params.projectId && params.token) {
        resolved = { ws: params.ws, projectId: params.projectId, token: params.token };
      } else {
        const pending = await getPendingInvite();
        if (pending) resolved = { ws: pending.ws, projectId: pending.projectId, token: pending.token };
      }
      if (cancelled) return;
      if (!resolved) { fail(tr.inviteInvalid); return; }
      setLink(resolved);

      const current = cachedWorkspaceConfig();
      // Порівняння з НОРМАЛІЗОВАНИМ `ws`, а не сирим рядком з посилання
      // (review finding): `current.origin` завжди нормалізований
      // (`buildWorkspaceConfig`), а кінцевий слеш/регістр у `ws` посилання
      // раніше відправляли автентифікованого користувача в гілку «вихід»
      // навіть для його ж власного workspace.
      const normalizedWs = normalizeWorkspaceOrigin(resolved.ws);
      const sameWorkspace = !!current && normalizedWs.ok && current.origin === normalizedWs.origin;

      // (c) той самий workspace — одразу превʼю.
      if (sameWorkspace) {
        void loadPreview(resolved.token);
        return;
      }
      // (b) інший workspace, уже автентифіковані — явне підтвердження: це вихід.
      if (current && authStatus === 'authed') {
        setStage('switch-confirm');
        return;
      }
      // (a)/(d) інший workspace (або взагалі жодного ще не обрано) і гість —
      // перевірити, але ПІДСТАВИТИ лише після явного підтвердження людини
      // (contract §4.3(a)): посилання несе довільний `ws`, і мовчазна
      // підстава дала б чужому посиланню непомітно перепідключити застосунок
      // до чужого сервера — наступний вхід/реєстрація пішли б туди (review
      // finding: attacker-controlled origin).
      const result = await checkWorkspace(resolved.ws);
      if (cancelled) return;
      if (!result.ok) { fail(tr.inviteWorkspaceUnreachable); return; }
      setPendingWorkspace(result);
      setStage('confirm-workspace');
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Case (a)/(d): людина побачила назву/колір чужого workspace і явно
  // погодилась — лише тепер підставляємо адресу (contract §4.3(a)).
  const confirmSetWorkspace = useCallback(async () => {
    if (!link || !pendingWorkspace) return;
    setStage('loading');
    await setWorkspaceConfig(buildWorkspaceConfig(pendingWorkspace.origin, pendingWorkspace.info));
    void loadPreview(link.token);
  }, [link, pendingWorkspace, loadPreview]);

  const confirmSwitch = useCallback(async () => {
    if (!link) return;
    setStage('loading');
    try {
      // `link.ws` — контракт §9.3: switchWorkspace() прибирає pending_invite
      // ІНШОГО workspace, а не лишає його висіти назавжди (мінор із ревʼю).
      // Це посилання САМЕ і є цільовий workspace, тож нормалізація/звірка
      // всередині switchWorkspace або збереже цей-таки pending_invite (коли
      // він і є тим самим посиланням), або прибере чужий застарілий запис.
      await switchWorkspace(false, link.ws);
    } catch (e) {
      if (e instanceof UnsyncedOutboxError) {
        setStage('switch-confirm');
        Alert.alert(tr.workspaceSwitchSyncFailedTitle, tr.workspaceSwitchSyncFailedMsg, [
          { text: tr.cancel, style: 'cancel' },
          {
            text: tr.workspaceSwitchProceedAnyway,
            style: 'destructive',
            onPress: () => {
              void switchWorkspace(true, link.ws)
                .then(() => proceedAfterSwitch())
                .catch(() => fail(tr.inviteNetworkError));
            },
          },
        ]);
        return;
      }
      // Будь-яка ІНША помилка (наприклад, обрив мережі посеред multiRemove) —
      // review finding: раніше код мовчки провалювався сюди й усе одно
      // виконував `proceedAfterSwitch()`, тобто підставляв НОВИЙ workspace,
      // хоча старий міг лишитись недочищеним — дані одного сервера впереміш
      // із іншим. Тепер зупиняємось і показуємо помилку.
      fail(tr.inviteNetworkError);
      return;
    }
    await proceedAfterSwitch();

    async function proceedAfterSwitch() {
      if (!link) return;
      const result = await checkWorkspace(link.ws);
      if (!result.ok) { fail(tr.inviteWorkspaceUnreachable); return; }
      await setWorkspaceConfig(buildWorkspaceConfig(result.origin, result.info));
      void loadPreview(link.token);
    }
  }, [link, switchWorkspace, fail, tr, loadPreview]);

  const handleJoin = useCallback(async () => {
    if (!link) return;
    setStage('joining');
    try {
      const result = await acceptInvite(link.token);
      const projectId = (result.project as { id?: string } | null)?.id ?? link.projectId;
      await clearPendingInvite();
      await addRecentProject(projectId);
      void syncProject(projectId);
      setJoinedProjectId(projectId);
      setStage('joined');
      haptic.success();
    } catch (e) {
      haptic.error();
      if (e instanceof ApiError && e.status === 410) fail(tr.inviteExpired);
      else if (e instanceof ApiError && e.status === 404) fail(tr.inviteInvalid);
      else if (e instanceof OfflineError) fail(tr.inviteNetworkError);
      else { setStage('preview'); Alert.alert(tr.error, e instanceof ApiError ? e.message : tr.inviteNetworkError); }
    }
  }, [link, fail, tr]);

  const openProject = useCallback(() => {
    if (!joinedProjectId) { router.replace('/(tabs)/today'); return; }
    router.replace({ pathname: '/project/[id]/overview', params: { id: joinedProjectId } } as never);
  }, [joinedProjectId, router]);

  const goLogin = useCallback(() => router.push('/login'), [router]);
  const goRegister = useCallback(() => {
    router.push({ pathname: '/register', params: { inviteToken: link?.token ?? '' } } as never);
  }, [router, link]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[st.scroll, contentWidth]} showsVerticalScrollIndicator={false}>
          <Text style={[st.title, { color: c.text }]}>{tr.inviteScreenTitle}</Text>

          {(stage === 'loading' || stage === 'joining') && (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <ActivityIndicator color={c.accent} />
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 12 }}>
                {stage === 'joining' ? tr.inviteJoining : tr.inviteLoading}
              </Text>
            </View>
          )}

          {stage === 'switch-confirm' && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{tr.inviteSwitchWorkspaceTitle}</Text>
              <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>{tr.inviteSwitchWorkspaceMsg}</Text>
              <TouchableOpacity onPress={confirmSwitch} style={[st.primaryBtn, { backgroundColor: c.accent }]}>
                <Text style={st.primaryBtnText}>{tr.inviteSwitchWorkspaceConfirm}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.replace('/(tabs)/today')} style={st.linkBtn}>
                <Text style={{ color: c.sub, fontSize: 14, fontWeight: '500' }}>{tr.cancel}</Text>
              </TouchableOpacity>
            </BlurView>
          )}

          {stage === 'confirm-workspace' && pendingWorkspace && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{tr.inviteConfirmWorkspaceTitle}</Text>
              <Text style={{ color: c.sub, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
                {tr.inviteConfirmWorkspaceMsg.replace('{name}', pendingWorkspace.info.name || pendingWorkspace.origin)}
              </Text>
              <TouchableOpacity onPress={confirmSetWorkspace} style={[st.primaryBtn, { backgroundColor: c.accent }]}>
                <Text style={st.primaryBtnText}>{tr.inviteConfirmWorkspaceButton}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.replace(authStatus === 'authed' ? '/(tabs)/today' : '/welcome')} style={st.linkBtn}>
                <Text style={{ color: c.sub, fontSize: 14, fontWeight: '500' }}>{tr.cancel}</Text>
              </TouchableOpacity>
            </BlurView>
          )}

          {stage === 'preview' && preview && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <View style={[st.colorDot, { backgroundColor: preview.project.color || c.accent }]} />
                <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 18, fontWeight: '800' }}>{preview.project.name}</Text>
              </View>
              <Text style={{ color: c.sub, fontSize: 13, marginBottom: 4 }}>
                {tr.inviteInvitedByLabel}: {preview.invited_by.name}
              </Text>
              <Text style={{ color: c.sub, fontSize: 13, marginBottom: 4 }}>
                {preview.role === 'member' ? tr.roleMember : tr.roleViewer}
              </Text>
              <Text style={{ color: c.sub, fontSize: 12, marginBottom: 16 }}>
                {tr.inviteExpiresLabel}: {new Date(preview.expires_at).toLocaleDateString(dateLocale)}
              </Text>

              {authStatus === 'authed' ? (
                <TouchableOpacity onPress={handleJoin} style={[st.primaryBtn, { backgroundColor: c.accent }]}>
                  <Text style={st.primaryBtnText}>{tr.inviteJoinButton}</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <Text style={{ color: c.sub, fontSize: 13, marginBottom: 12 }}>{tr.inviteGuestHint}</Text>
                  <TouchableOpacity onPress={goRegister} style={[st.primaryBtn, { backgroundColor: c.accent }]}>
                    <Text style={st.primaryBtnText}>{tr.inviteRegisterButton}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={goLogin} style={st.linkBtn}>
                    <Text style={{ color: c.accent, fontSize: 14, fontWeight: '600' }}>{tr.inviteLoginButton}</Text>
                  </TouchableOpacity>
                </>
              )}
            </BlurView>
          )}

          {stage === 'joined' && (
            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border, alignItems: 'center' }]}>
              <IconSymbol name="checkmark.circle.fill" size={40} color={c.accent} />
              <Text style={{ color: c.text, fontSize: 17, fontWeight: '800', marginTop: 12, marginBottom: 16 }}>{tr.inviteJoinedTitle}</Text>
              <TouchableOpacity onPress={openProject} style={[st.primaryBtn, { backgroundColor: c.accent, alignSelf: 'stretch' }]}>
                <Text style={st.primaryBtnText}>{tr.inviteJoinedOpenProject}</Text>
              </TouchableOpacity>
            </BlurView>
          )}

          {stage === 'error' && (
            <View style={[st.hintRow, { backgroundColor: '#EF444414', borderColor: '#EF444430' }]}>
              <IconSymbol name="exclamationmark.circle" size={16} color="#EF4444" />
              <Text style={{ color: '#EF4444', fontSize: 13, lineHeight: 18, flex: 1, marginLeft: 8 }}>{errorText}</Text>
            </View>
          )}

          {(stage === 'error') && (
            <TouchableOpacity onPress={() => router.replace(authStatus === 'authed' ? '/(tabs)/today' : '/welcome')} style={[st.primaryBtn, { backgroundColor: c.accent, marginTop: 16 }]}>
              <Text style={st.primaryBtnText}>{tr.back}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60 },
  title: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4, marginBottom: 20 },
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', padding: 18 },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  primaryBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  linkBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 6 },
  hintRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
});
