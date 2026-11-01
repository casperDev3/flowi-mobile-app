import { useRouter } from 'expo-router';
import React, { useState } from 'react';
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
import { ApiError, OfflineError, apiFetch } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { throttleMessage } from '@/store/auth-throttle';
import { haptic } from '@/utils/haptics';
import { fontFamily } from '@/constants/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  // Код із шести цифр і два поля пароля не потребують ширини планшета.
  const contentWidth = useContentWidth();

  // Step 1: email; Step 2: code + new password
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const k = dsTokens(isDark);
  const c = {
    ...getScreenColors('auth', isDark),
    // Картка форми — суцільна поверхня DS v2.
    card: k.surface.card,
    red: k.status.danger,
  };

  const handleSendCode = async () => {
    setError('');
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail || !EMAIL_RE.test(trimEmail)) {
      haptic.error();
      setError(tr.authInvalidEmail);
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/auth/password/forgot/', {
        method: 'POST',
        body: { email: trimEmail },
        auth: false,
        allowOffline: true,
      });
      haptic.success();
      setStep(2);
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setError(tr.authOfflineError);
      } else if (e instanceof ApiError && e.status === 429) {
        // ERR-03: `/auth/forgot/` сидить на тому самому відрі `auth`, що й
        // вхід, — саме сюди людина йде після «Невірний email або пароль».
        setError(throttleMessage(tr, e));
      } else if (e instanceof ApiError && (e.code === 'timeout' || e.code === 'network')) {
        setError(tr.authNetworkError);
      } else if (e instanceof ApiError && e.status >= 500) {
        setError(tr.authServerError);
      } else {
        // Server always returns 200 for forgot — if we get here it's a network issue
        setError(tr.authNetworkError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    const trimCode = code.trim();
    if (trimCode.length !== 6) {
      haptic.error();
      setError(tr.authCodeInvalid);
      return;
    }
    if (!newPassword) {
      haptic.error();
      setError(tr.authWeakPassword);
      return;
    }
    if (newPassword !== repeatPassword) {
      haptic.error();
      setError(tr.authPasswordsMismatch);
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/auth/password/reset/', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), code: trimCode, new_password: newPassword },
        auth: false,
        allowOffline: true,
      });
      haptic.success();
      Alert.alert(
        tr.accountPasswordChanged,
        '',
        [{ text: tr.authLogin, onPress: () => router.replace('/login') }],
      );
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setError(tr.authOfflineError);
      } else if (e instanceof ApiError) {
        if (e.code === 'invalid_code') {
          setError(tr.authCodeInvalid);
        } else if (e.code === 'code_expired') {
          setError(tr.authCodeExpired);
        } else if (e.code === 'too_many_attempts' || e.status === 429) {
          setError(throttleMessage(tr, e));
        } else if (e.code === 'weak_password') {
          setError(tr.authWeakPassword);
        } else if (e.code === 'timeout' || e.code === 'network') {
          setError(tr.authNetworkError);
        } else if (e.status >= 500) {
          setError(tr.authServerError);
        } else {
          setError(tr.authCodeInvalid);
        }
      } else {
        setError(tr.authNetworkError);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg1 }]} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={st.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={tr.back}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
            <Text style={[st.title, { color: c.text }]}>{tr.authForgotPasswordTitle}</Text>

            {step === 1 ? (
              <>
                <View
              style={[st.card, { backgroundColor: c.card }]}
            >
                  <View style={st.fieldWrap}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEmail}</Text>
                    <TextInput
                      style={[st.input, { color: c.text }]}
                      placeholderTextColor={k.text.muted}
                      placeholder="you@example.com"
                      value={email}
                      onChangeText={v => { setEmail(v); setError(''); }}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                      returnKeyType="done"
                      onSubmitEditing={handleSendCode}
                    />
                  </View>
                </View>

                {error ? <Text style={[st.error, { color: c.red }]}>{error}</Text> : null}

                <TouchableOpacity
                  style={[st.primaryBtn, { backgroundColor: loading ? k.action.primaryPressed : k.action.primary }]}
                  activeOpacity={0.82}
                  onPress={handleSendCode}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={tr.authSendCode}
                  accessibilityState={{ disabled: loading, busy: loading }}
                >
                  {loading ? (
                    <ActivityIndicator color={k.text.onAction} />
                  ) : (
                    <Text style={[st.primaryBtnText, { color: k.text.onAction }]}>{tr.authSendCode}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[st.hint, { color: c.sub }]}>{tr.authCodeSentHint}</Text>

                <View
              style={[st.card, { backgroundColor: c.card }]}
            >
                  {/* Code */}
                  <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEnterCode}</Text>
                    <TextInput
                      style={[st.input, { color: c.text, fontSize: 28, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: 6 }]}
                      placeholderTextColor={k.text.muted}
                      placeholder="000000"
                      value={code}
                      onChangeText={v => { setCode(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      returnKeyType="next"
                      maxLength={6}
                    />
                  </View>

                  {/* New password */}
                  <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authNewPassword}</Text>
                    <View style={st.passwordRow}>
                      <TextInput
                        style={[st.input, { color: c.text, flex: 1 }]}
                        placeholderTextColor={k.text.muted}
                        placeholder="••••••••"
                        value={newPassword}
                        onChangeText={v => { setNewPassword(v); setError(''); }}
                        secureTextEntry={!showNewPwd}
                        textContentType="newPassword"
                        returnKeyType="next"
                      />
                      <TouchableOpacity
                        onPress={() => setShowNewPwd(v => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={showNewPwd ? tr.authHidePassword : tr.authShowPassword}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <IconSymbol name={showNewPwd ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Repeat password */}
                  <View style={st.fieldWrap}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPasswordRepeat}</Text>
                    <View style={st.passwordRow}>
                      <TextInput
                        style={[st.input, { color: c.text, flex: 1 }]}
                        placeholderTextColor={k.text.muted}
                        placeholder="••••••••"
                        value={repeatPassword}
                        onChangeText={v => { setRepeatPassword(v); setError(''); }}
                        secureTextEntry={!showRepeat}
                        textContentType="newPassword"
                        returnKeyType="done"
                        onSubmitEditing={handleResetPassword}
                      />
                      <TouchableOpacity
                        onPress={() => setShowRepeat(v => !v)}
                        accessibilityRole="button"
                        accessibilityLabel={showRepeat ? tr.authHidePassword : tr.authShowPassword}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <IconSymbol name={showRepeat ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {error ? <Text style={[st.error, { color: c.red }]}>{error}</Text> : null}

                <TouchableOpacity
                  style={[st.primaryBtn, { backgroundColor: loading ? k.action.primaryPressed : k.action.primary }]}
                  activeOpacity={0.82}
                  onPress={handleResetPassword}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={tr.authChangePasswordBtn}
                  accessibilityState={{ disabled: loading, busy: loading }}
                >
                  {loading ? (
                    <ActivityIndicator color={k.text.onAction} />
                  ) : (
                    <Text style={[st.primaryBtnText, { color: k.text.onAction }]}>{tr.authChangePasswordBtn}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.linkBtn}
                  onPress={() => { setStep(1); setCode(''); setNewPassword(''); setRepeatPassword(''); setError(''); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.authSendCode} (${tr.authEmail})`}
                >
                  <Text style={[st.linkText, { color: c.sub }]}>{tr.authSendCode} ({tr.authEmail})</Text>
                </TouchableOpacity>
              </>
            )}
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
    paddingBottom: 60,
  },
  title: {
    fontSize: 32,
    fontFamily: fontFamily.medium,
    letterSpacing: -0.32,
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
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
