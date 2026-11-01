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
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { getScreenColors } from '@/constants/tokens';
import { dsTokens } from '@/hooks/use-ds';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { ApiError, OfflineError } from '@/store/api';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { throttleMessage } from '@/store/auth-throttle';
import { previewInvite, type InvitePreview } from '@/store/project-team';
import { haptic } from '@/utils/haptics';
import { fontFamily, shadow } from '@/constants/theme';
import { MeshBackground } from '@/components/ds';

// ─── Простий валідатор формату email ─────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { register } = useAuth();
  const { inviteToken } = useLocalSearchParams<{ inviteToken?: string }>();
  // Та сама колонка сталої ширини, що й на вході: форма з чотирьох полів,
  // розтягнута на планшет, читається як таблиця, а не як послідовність кроків.
  const contentWidth = useContentWidth();

  // Банер «запрошені в проєкт X» (контракт §4.3(d)) — превʼю публічне, тому
  // читається без входу, лише щоб показати НАЗВУ проєкту й хто запросив;
  // саме приєднання все одно робить сервер під час /auth/register/ (§2.4).
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  useEffect(() => {
    if (!inviteToken?.trim()) return;
    let cancelled = false;
    void previewInvite(inviteToken.trim()).then(p => { if (!cancelled) setInvitePreview(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [inviteToken]);

  /**
   * Контракт §2.4: `400 invite_invalid` / `410 invite_expired` на
   * `POST /auth/register/` — сервер НЕ створив акаунт узагалі (не лише
   * «інвайт не додався»), бо валідність токена перевіряється ДО створення
   * користувача. Клієнт пропонує продовжити без інвайту (мінор із ревʼю,
   * раніше обидві помилки провалювались у загальне `tr.authInvalidCreds`,
   * і форма з правильними email/паролем виглядала так, ніби дані невірні).
   * Стан, а не локальна змінна: щойно підтверджено «зламано» — БУДЬ-який
   * наступний тап «Зареєструватися» (не лише той, що з діалогу) має мовчки
   * пропускати той самий мертвий токен, а не повторювати ту саму помилку.
   */
  const [skipInvite, setSkipInvite] = useState(false);
  const effectiveInviteToken = skipInvite ? undefined : (inviteToken?.trim() || undefined);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordRepeat, setShowPasswordRepeat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const k = dsTokens(isDark);
  const c = {
    ...getScreenColors('auth', isDark),
    // Картка форми — суцільна поверхня DS v2.
    red: k.status.danger,
  };

  const validateEmailFormat = (val: string): boolean => {
    const trimmed = val.trim();
    if (trimmed && !EMAIL_RE.test(trimmed)) {
      setEmailError(tr.authInvalidEmail);
      return false;
    }
    setEmailError('');
    return true;
  };

  const clearErrors = () => {
    setGeneralError('');
    setEmailError('');
    setPasswordError('');
  };

  /**
   * `useInviteToken` — явний параметр, а не читання `effectiveInviteToken`
   * зсередини: гілка `invite_invalid`/`invite_expired` нижче мусить
   * повторити запит БЕЗ токена одразу з callback'а `Alert`, де замикання ще
   * бачило б старий `skipInvite === false` (стан оновлюється асинхронно) —
   * без явного аргументу другий виклик надіслав би той самий мертвий токен.
   */
  const submitRegister = async (useInviteToken: string | undefined) => {
    setLoading(true);
    try {
      const trimEmail = email.trim().toLowerCase();
      const result = await register(trimEmail, password, name.trim() || undefined, useInviteToken);
      if (result.status === 'pending') {
        router.replace({ pathname: '/register-pending', params: { requestId: result.requestId } });
        return;
      }
      // §2 плану: успішна реєстрація (акаунт активний одразу) так само
      // примусово вмикає онлайн-режим (store/auth.tsx completeSession) —
      // питати «увімкнути онлайн?» після цього вже нема сенсу.
      router.replace('/(tabs)');
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setGeneralError(tr.authOfflineError);
      } else if (e instanceof ApiError) {
        if (useInviteToken && (e.code === 'invite_invalid' || e.code === 'invite_expired')) {
          // Контракт §2.4: акаунт НЕ створено (перевірка інвайту йде ДО
          // створення користувача) — без цієї гілки помилка провалювалась
          // у generalError('authInvalidCreds') нижче, і форма з коректними
          // email/паролем виглядала так, ніби дані невірні, хоча причина —
          // мертве запрошення. Позначаємо `skipInvite` одразу: наступний
          // тап «Зареєструватися» (якщо людина закриє діалог) уже не
          // повторить ту саму помилку тим самим токеном.
          setSkipInvite(true);
          Alert.alert(
            tr.registerInviteBrokenTitle,
            e.code === 'invite_expired' ? tr.registerInviteExpiredMsg : tr.registerInviteInvalidMsg,
            [
              { text: tr.cancel, style: 'cancel' },
              { text: tr.registerContinueWithoutInvite, onPress: () => void submitRegister(undefined) },
            ],
          );
        } else if (e.status === 409 && e.code === 'request_pending') {
          setEmailError(tr.authRegistrationPending);
        } else if (e.status === 409 || e.code === 'email_taken') {
          setEmailError(tr.authEmailTaken);
        } else if (e.code === 'password_too_common' || e.code === 'password_too_short') {
          setPasswordError(tr.authWeakPassword);
        } else if (e.status === 429) {
          // ERR-03: те саме відро `auth`, що й у входу, — без цієї гілки
          // «забагато спроб» показувалось як «Невірний email або пароль».
          setGeneralError(throttleMessage(tr, e));
        } else if (e.code === 'timeout' || e.code === 'network') {
          setGeneralError(tr.authNetworkError);
        } else if (e.status >= 500) {
          setGeneralError(tr.authServerError);
        } else {
          setGeneralError(tr.authInvalidCreds);
        }
      } else {
        setGeneralError(tr.authNetworkError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    clearErrors();

    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail) {
      haptic.error();
      setEmailError(tr.authInvalidEmail);
      return;
    }
    if (!EMAIL_RE.test(trimEmail)) {
      haptic.error();
      setEmailError(tr.authInvalidEmail);
      return;
    }

    if (password.length < 8) {
      haptic.error();
      setPasswordError(tr.authWeakPassword);
      return;
    }
    if (password !== passwordRepeat) {
      haptic.error();
      setPasswordError(tr.authPasswordsMismatch);
      return;
    }

    await submitRegister(effectiveInviteToken);
  };

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={24} color={c.text} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[st.scroll, contentWidth]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.title, { color: c.text }]}>{tr.authRegister}</Text>

            {invitePreview && !skipInvite && (
              <View style={[st.inviteBanner, { backgroundColor: k.accent.lavenderSoft }]}>
                <IconSymbol name="person.2.fill" size={16} color={c.accent} />
                <Text style={{ color: c.text, fontSize: 13, flex: 1, marginLeft: 8 }}>
                  {tr.registerInvitedMsg
                    .replace('{project}', invitePreview.project.name)
                    .replace('{role}', invitePreview.role === 'member' ? tr.roleMember : tr.roleViewer)}
                </Text>
              </View>
            )}

            <View
              style={[st.card, { backgroundColor: k.surface.card, ...shadow[isDark ? 'dark' : 'light'].card }]}
            >
              {/* Name */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authName}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={k.text.muted}
                  placeholder={tr.authName}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  textContentType="name"
                  returnKeyType="next"
                />
              </View>

              {/* Email */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEmail}{" "}
                  <Text style={{ color: c.red }}>*</Text>
                </Text>
                <TextInput
                  style={[st.input, { color: c.text },
                    emailError
                      ? { borderWidth: 1, borderColor: c.red, borderRadius: 8 }
                      : null,
                  ]}
                  placeholderTextColor={k.text.muted}
                  placeholder="you@example.com"
                  value={email}
                  accessibilityLabel={tr.authEmail}
                  accessibilityHint={emailError || undefined}
                  onChangeText={v => { setEmail(v); if (emailError) setEmailError(''); }}
                  onBlur={() => validateEmailFormat(email)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  returnKeyType="next"
                />
              </View>
              {emailError ? (
                <Text style={[st.fieldError, { color: c.red }]}>{emailError}</Text>
              ) : null}

              {/* Password */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPassword}{" "}
                  <Text style={{ color: c.red }}>*</Text>
                </Text>
                <View style={st.passwordRow}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 },
                      passwordError
                        ? {
                            borderWidth: 1,
                            borderColor: c.red,
                            borderRadius: 8,
                          }
                        : null,
                    ]}
                    placeholderTextColor={k.text.muted}
                    placeholder="••••••••"
                    value={password}
                    onChangeText={v => { setPassword(v); if (passwordError) setPasswordError(''); }}
                    secureTextEntry={!showPassword}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(v => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? tr.authHidePassword : tr.authShowPassword}
                  >
                    <IconSymbol
                      name={showPassword ? 'eye.slash' : 'eye'}
                      size={18}
                      color={c.sub}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Repeat password */}
              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPasswordRepeat}{" "}
                  <Text style={{ color: c.red }}>*</Text>
                </Text>
                <View style={st.passwordRow}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 },
                      passwordError
                        ? {
                            borderWidth: 1,
                            borderColor: c.red,
                            borderRadius: 8,
                          }
                        : null,
                    ]}
                    placeholderTextColor={k.text.muted}
                    placeholder="••••••••"
                    value={passwordRepeat}
                    onChangeText={v => { setPasswordRepeat(v); if (passwordError) setPasswordError(''); }}
                    secureTextEntry={!showPasswordRepeat}
                    textContentType="newPassword"
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={handleRegister}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPasswordRepeat(v => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={showPasswordRepeat ? tr.authHidePassword : tr.authShowPassword}
                  >
                    <IconSymbol
                      name={showPasswordRepeat ? 'eye.slash' : 'eye'}
                      size={18}
                      color={c.sub}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {passwordError ? (
              <Text style={[st.error, { color: c.red }]}>{passwordError}</Text>
            ) : null}
            {generalError ? (
              <Text style={[st.error, { color: c.red }]}>{generalError}</Text>
            ) : null}

            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: loading ? k.action.primaryPressed : k.action.primary }]}
              activeOpacity={0.82}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={k.text.onAction} />
              ) : (
                <Text style={[st.primaryBtnText, { color: k.text.onAction }]}>{tr.authRegister}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => router.replace('/login')}
            >
              <Text style={[st.linkText, { color: c.sub }]}>{tr.authHaveAccount}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 80,
  },
  title: {
    fontSize: 32,
    fontFamily: fontFamily.medium,
    letterSpacing: -0.32,
    marginBottom: 24,
  },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  fieldWrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    marginBottom: 4,
  },
  fieldError: {
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginTop: -4,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 16,
    fontFamily: fontFamily.regular,
    paddingVertical: 4,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    borderRadius: 999,
    minHeight: 52,
    justifyContent: 'center',
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
  linkBtn: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    fontFamily: fontFamily.medium,
  },
});
