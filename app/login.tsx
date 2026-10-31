import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { getPendingRegistration } from '@/store/registration';
import { haptic } from '@/utils/haptics';
import { fontFamily } from '@/constants/theme';
import { MeshBackground } from '@/components/ds';
import { glassOf, glassRimFor } from '@/components/shared/dsTheme';

// ─── Простий валідатор формату email ─────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { login } = useAuth();
  // Форма входу лишається колонкою сталої ширини: на планшеті поле на всю
  // ширину вікна змушує око бігати від мітки до курсора через пів екрана.
  const contentWidth = useContentWidth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const k = dsTokens(isDark);
  const c = {
    ...getScreenColors('auth', isDark),
    // Картка форми — суцільна поверхня DS v2.
    card: glassOf(k).surface,
    errorBorder: k.status.danger,
    red:         k.status.danger,
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

  const handleLogin = async () => {
    clearErrors();
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail || !password) {
      haptic.error();
      if (!trimEmail) setEmailError(tr.authInvalidEmail);
      if (!password) setPasswordError(tr.authInvalidCreds);
      return;
    }
    if (!EMAIL_RE.test(trimEmail)) {
      haptic.error();
      setEmailError(tr.authInvalidEmail);
      return;
    }
    setLoading(true);
    try {
      // §2 плану: вхід завжди примусово вмикає онлайн-режим (store/auth.tsx
      // completeSession) — «увімкнути онлайн?» після входу більше нема сенсу
      // питати, застосунок уже онлайн.
      await login(trimEmail, password);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setGeneralError(tr.authOfflineError);
      } else if (e instanceof ApiError) {
        if (e.status === 403 && e.code === 'registration_pending') {
          // Контракт §2.6: `/auth/login/` для email із pending-заявкою не
          // повертає requestId — ведемо на екран очікування лише якщо ЦЕЙ
          // пристрій сам подавав заявку (той самий request_token лежить у
          // SecureStore) і email збігається; інакше `register-pending.tsx`
          // опитував би сервер токеном, якого просто нема.
          const pending = await getPendingRegistration();
          if (pending && pending.email === trimEmail) {
            router.replace({ pathname: '/register-pending', params: { requestId: pending.requestId } });
            return;
          }
          setGeneralError(tr.authRegistrationPending);
        } else if (e.status === 403 && e.code === 'registration_rejected') {
          // Контракт §2.6: `{"code":"registration_rejected","reject_reason":"…"}`.
          const reason = typeof e.details?.reject_reason === 'string' ? e.details.reject_reason.trim() : '';
          setGeneralError(reason ? `${tr.authRegistrationRejected}: ${reason}` : tr.authRegistrationRejected);
        } else if (e.status === 401 || e.code === 'no_active_account') {
          setPasswordError(tr.authInvalidCreds);
        } else if (e.status === 429) {
          // ERR-03: відро throttle `auth` — 20/год на IP. Досі 429 падав у
          // else нижче й казав «Невірний email або пароль» навіть на
          // ПРАВИЛЬНИЙ пароль, а скидання пароля сидить на тому ж відрі.
          setGeneralError(throttleMessage(tr, e));
        } else if (e.code === 'timeout' || e.code === 'network') {
          setGeneralError(tr.authNetworkError);
        } else if (e.status >= 500) {
          setGeneralError(tr.authServerError);
        } else {
          setPasswordError(tr.authInvalidCreds);
        }
      } else {
        setGeneralError(tr.authNetworkError);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={st.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tr.back}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={c.text} />
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
            <Text style={[st.title, { color: c.text }]}>{tr.authLogin}</Text>

            <View
              style={[st.card, { backgroundColor: c.card, ...glassRimFor(c.card, 'card') }, emailError ? { borderWidth: 1, borderColor: c.errorBorder } : null]}
            >
              {/* Email */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>
                  {tr.authEmail.toUpperCase()}{" "}
                  <Text style={{ color: c.red }}>*</Text>
                </Text>
                <TextInput
                  style={[
                    st.input,
                    { color: c.text },
                    emailError
                      ? { borderWidth: 1, borderColor: c.red, borderRadius: 8 }
                      : null,
                  ]}
                  placeholderTextColor={k.text.muted}
                  placeholder="you@example.com"
                  value={email}
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
                <Text style={[st.fieldError, { color: c.red }]}>
                  {emailError}
                </Text>
              ) : null}

              {/* Password */}
              <View style={[st.fieldWrap, { borderTopColor: emailError ? c.border : 'transparent' }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>
                  {tr.authPassword.toUpperCase()}{" "}
                  <Text style={{ color: c.red }}>*</Text>
                </Text>
                <View style={st.passwordRow}>
                  <TextInput
                    style={[
                      st.input,
                      { color: c.text, flex: 1 },
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
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
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
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={k.text.onAction} />
              ) : (
                <Text style={[st.primaryBtnText, { color: k.text.onAction }]}>{tr.authLogin}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => router.push('/forgot-password')}
            >
              <Text style={[st.linkText, { color: c.text, fontFamily: fontFamily.semibold }]}>
                {tr.authForgotPassword}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => router.replace('/register')}
            >
              <Text style={[st.linkText, { color: c.sub }]}>
                {tr.authNoAccount}
              </Text>
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
    paddingTop: 14,
    paddingBottom: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 60,
  },
  title: {
    fontSize: 32,
    fontFamily: fontFamily.medium,
    letterSpacing: -0.32,
    marginBottom: 24,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  fieldWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.3,
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
