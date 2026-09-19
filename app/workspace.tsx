/**
 * app/workspace.tsx — «Адреса workspace» (§2 плану, контракт §2.1–2.2).
 *
 * Обов'язковий перший екран застосунку: без обраного й перевіреного workspace
 * далі йти нікуди (`AuthGate` у `app/_layout.tsx` тримає тут гостя без
 * `workspace_config`). Той самий екран показується повторно, коли:
 *  - фонова перевірка на холодному старті виявила несумісність версій
 *    (`getWorkspaceIncompatibility()` — контракт §2.2.4);
 *  - користувач сам хоче змінити workspace (кнопка в Налаштуваннях/акаунті,
 *    `router.push('/workspace?change=1')` — тоді видно «Скасувати»).
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useTopInset } from '@/hooks/use-top-inset';
import { setWorkspaceIncompatibility } from '@/store/api-config';
import { UnsyncedOutboxError, useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import {
  buildWorkspaceConfig,
  cachedWorkspaceConfig,
  checkWorkspace,
  DEFAULT_WORKSPACE_ORIGIN,
  getWorkspaceIncompatibility,
  loadWorkspaceConfig,
  setWorkspaceConfig,
  type WorkspaceCheckError,
  type WorkspaceCheckSuccess,
} from '@/store/workspace';
import { haptic } from '@/utils/haptics';
import type { Translations } from '@/store/translations';

type ScreenState = 'idle' | 'checking' | 'error' | 'success';

function errorMessage(tr: Translations, err: WorkspaceCheckError): string {
  switch (err.code) {
    case 'invalid_url': return tr.workspaceErrorInvalidUrl;
    case 'insecure_url': return tr.workspaceErrorInsecureUrl;
    case 'network': return tr.workspaceErrorNetwork;
    case 'not_workspace': return tr.workspaceErrorNotWorkspace;
    case 'update_app': return tr.workspaceErrorUpdateApp;
    case 'update_server': return tr.workspaceErrorUpdateServer;
    case 'update_app_to': return tr.workspaceErrorUpdateAppTo.replace('{v}', err.minVersion ?? '');
    case 'workspace_changed': return tr.workspaceErrorChanged;
    default: return tr.workspaceErrorNetwork;
  }
}

/** Несумісність версій блокує — «Перевірити» показувати немає сенсу. */
function isBlocking(err: WorkspaceCheckError): boolean {
  return err.code === 'update_app' || err.code === 'update_server' || err.code === 'update_app_to'
    || err.code === 'workspace_changed';
}

export default function WorkspaceScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const params = useLocalSearchParams<{ change?: string }>();
  const isChange = params.change === '1';
  const contentWidth = useContentWidth();
  // CLAUDE.md: фіксований верхній інсет — useTopInset() у JS, а не нативний
  // SafeAreaView (мінор із ревʼю) — той малює padding окремим нативним
  // комітом ПІСЛЯ першого лейаут-проходу, і на першому кадрі/після повороту
  // хедер устигає намалюватись іще без нього (докладно — hooks/use-top-inset.ts).
  const topInset = useTopInset();
  const { status: authStatus, switchWorkspace } = useAuth();

  const c = getScreenColors('auth', isDark);

  const [address, setAddress] = useState('');
  const [state, setState] = useState<ScreenState>('idle');
  const [error, setError] = useState<WorkspaceCheckError | null>(null);
  const [success, setSuccess] = useState<WorkspaceCheckSuccess | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Префіл: наявний workspace (зміна/повторна перевірка сумісності) або хмара
  // Flowi за замовчуванням — перший запуск.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await loadWorkspaceConfig();
      if (cancelled) return;
      const origin = current?.origin ?? DEFAULT_WORKSPACE_ORIGIN;
      // Ховаємо лише https:// (типовий випадок) — http:// лишаємо видимим:
      // інакше збережена локальна адреса (192.168.x, self-host без TLS)
      // перевірялась би вдруге вже як https і провалювалась.
      setAddress(origin.replace(/^https:\/\//, ''));
      setPrefilled(true);
      // Несумісність, виявлена фоновою перевіркою (контракт §2.2.4) —
      // одразу показуємо помилку, не чекаючи натискання «Перевірити».
      const incompat = getWorkspaceIncompatibility();
      if (incompat) {
        setError({ ok: false, code: incompat.code, minVersion: incompat.minVersion });
        setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleCheck = async () => {
    haptic.light();
    setState('checking');
    setError(null);
    setSuccess(null);
    const result = await checkWorkspace(address);
    if (result.ok) {
      setSuccess(result);
      setState('success');
    } else {
      haptic.error();
      setError(result);
      setState('error');
    }
  };

  /** Спільний хвіст — після успішного (можливого) виходу зі старого workspace. */
  const applyAndNavigate = async (isRealChange: boolean) => {
    if (!success) return;
    await setWorkspaceConfig(buildWorkspaceConfig(success.origin, success.info));
    // Несумісність версій (426/фонова перевірка), через яку `AuthGate` силою
    // тримав нас тут, стосувалась СТАРОГО workspace — інакше після успішного
    // продовження в інший, сумісний workspace `AuthGate` мовчки повертав би
    // сюди знову, бо прапорець нічого не скидало (лише холодний старт).
    setWorkspaceIncompatibility(null);

    if (!isRealChange && authStatus === 'authed') {
      // Той самий workspace, що й був, і сесія лишається чинною — повторний
      // вхід не потрібен (інакше «Використати дані акаунта» на злитті
      // непотрібно стирало б ще не відправлений outbox).
      router.replace('/(tabs)');
    } else {
      router.replace('/welcome');
    }
  };

  /** `force=true` — користувач підтвердив «продовжити й втратити зміни». */
  const runSwitch = async (force: boolean) => {
    if (!success) return;
    setSwitching(true);
    try {
      // Контракт §2.3: зміна workspace = вихід — незалежно від того,
      // автентифіковані ми просто зараз чи вже гість (локальні дані могли
      // лишитись від попереднього workspace через `data_owner`). Дані одного
      // сервера ніколи не потрапляють на інший.
      // `success.origin` — контракт §9.3: switchWorkspace() прибирає
      // `pending_invite` іншого workspace, а не лишає його висіти назавжди
      // (мінор із ревʼю).
      await switchWorkspace(force, success.origin);
    } catch (e) {
      if (e instanceof UnsyncedOutboxError) {
        // Синк не встиг — питаємо явно, а не мовчки стираємо непровштовхнуте
        // (той самий випадок, що й app/account.tsx).
        setSwitching(false);
        Alert.alert(tr.workspaceSwitchSyncFailedTitle, tr.workspaceSwitchSyncFailedMsg, [
          { text: tr.cancel, style: 'cancel' },
          { text: tr.workspaceSwitchProceedAnyway, style: 'destructive', onPress: () => { void runSwitch(true); } },
        ]);
        return;
      }
      // Будь-яка інша помилка (мережа під час /auth/logout/ тощо) вихід усе
      // одно завершує локально (switchWorkspace сама ковтає такі помилки) —
      // сюди потрапляє лише щось непередбачене; не блокуємо користувача.
      if (__DEV__) console.warn('[workspace] switchWorkspace failed:', e);
    }
    setSwitching(false);
    await applyAndNavigate(true);
  };

  const handleContinue = async () => {
    if (!success || switching) return;
    const current = cachedWorkspaceConfig();
    // Реальна зміна — інший сервер/workspace, а не повторне підтвердження
    // того самого (типовий випадок для користувача, що оновив застосунок:
    // AuthGate веде сюди, бо `workspace_config` іще нема, а адреса — та сама,
    // що й була захардкоджена раніше). Без збереженого конфігу (легасі
    // користувач до цього релізу — токени й дані вже є, просто адреса ще
    // ніде не записана) інша за DEFAULT_WORKSPACE_ORIGIN адреса теж рахується
    // реальною зміною (контракт §2.3): інакше його старі хмарні токени й дані
    // тихо поїхали б у щойно обраний self-host workspace.
    const isRealChange = current
      ? (current.origin !== success.origin || current.workspaceId !== success.info.workspace_id)
      : (authStatus === 'authed' && success.origin !== DEFAULT_WORKSPACE_ORIGIN);

    if (isRealChange) {
      await runSwitch(false);
    } else {
      await applyAndNavigate(false);
    }
  };

  const busy = state === 'checking' || switching;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, paddingTop: topInset }}>
        {isChange && router.canGoBack() ? (
          <View style={st.header}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <IconSymbol name="chevron.left" size={22} color={c.accent} />
            </TouchableOpacity>
          </View>
        ) : null}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={[st.scroll, contentWidth]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.title, { color: c.text }]}>{tr.workspaceScreenTitle}</Text>
            <Text style={[st.subtitle, { color: c.sub }]}>{tr.workspaceSubtitle}</Text>

            <BlurView
              intensity={isDark ? 20 : 40}
              tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: error && isBlocking(error) ? '#EF4444' : c.border }]}
            >
              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.workspaceAddressLabel}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
                  placeholder={tr.workspaceAddressPlaceholder}
                  value={address}
                  onChangeText={v => { setAddress(v); setState('idle'); setError(null); setSuccess(null); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  editable={prefilled && !busy}
                  returnKeyType="go"
                  onSubmitEditing={handleCheck}
                />
              </View>
            </BlurView>

            {state === 'error' && error && (
              <View style={[st.hintRow, { backgroundColor: '#EF444414', borderColor: '#EF444430' }]}>
                <IconSymbol name="exclamationmark.circle" size={16} color="#EF4444" />
                <Text style={[st.hintText, { color: '#EF4444' }]}>{errorMessage(tr, error)}</Text>
              </View>
            )}

            {state === 'success' && success && (
              <View style={[st.successCard, { borderColor: success.info.color ?? c.accent }]}>
                <View style={[st.colorDot, { backgroundColor: success.info.color || c.accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[st.workspaceName, { color: c.text }]} numberOfLines={1}>
                    {success.info.name}
                  </Text>
                  {!success.info.has_users && (
                    <Text style={[st.hintSmall, { color: c.sub }]}>{tr.workspaceFirstAccountHint}</Text>
                  )}
                </View>
              </View>
            )}

            {state !== 'success' && (
              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: c.accent, opacity: busy || !address.trim() ? 0.6 : 1 }]}
                activeOpacity={0.82}
                onPress={handleCheck}
                disabled={busy || !address.trim()}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={st.primaryBtnText}>{tr.workspaceCheckButton}</Text>
                )}
              </TouchableOpacity>
            )}

            {state === 'success' && (
              <TouchableOpacity
                style={[st.primaryBtn, { backgroundColor: c.accent, opacity: switching ? 0.6 : 1 }]}
                activeOpacity={0.82}
                onPress={handleContinue}
                disabled={switching}
              >
                {switching ? <ActivityIndicator color="#fff" /> : (
                  <Text style={st.primaryBtnText}>{tr.workspaceContinueButton}</Text>
                )}
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  scroll: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4, marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24 },
  card: {
    borderRadius: 18, borderWidth: 1, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fieldWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  input: { fontSize: 16, paddingVertical: 2 },
  hintRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginTop: 14,
  },
  hintText: { fontSize: 13, lineHeight: 18, flex: 1 },
  successCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1.5, padding: 14, marginTop: 14,
  },
  colorDot: { width: 14, height: 14, borderRadius: 7 },
  workspaceName: { fontSize: 16, fontWeight: '700' },
  hintSmall: { fontSize: 12, marginTop: 3, lineHeight: 16 },
  primaryBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
