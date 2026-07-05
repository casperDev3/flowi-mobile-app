import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ApiError, OfflineError, apiFetch } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { haptic } from '@/utils/haptics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();

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

  const c = {
    ...getScreenColors('auth', isDark),
    input:       isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    errorBorder: '#EF4444',
    red:         '#EF4444',
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
        } else if (e.code === 'too_many_attempts') {
          setError(tr.authTooManyAttempts);
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
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={22} color={c.accent} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={st.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[st.title, { color: c.text }]}>{tr.authForgotPasswordTitle}</Text>

            {step === 1 ? (
              <>
                <BlurView
                  intensity={isDark ? 20 : 40}
                  tint={isDark ? 'dark' : 'light'}
                  style={[st.card, { borderColor: c.border }]}
                >
                  <View style={st.fieldWrap}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEmail.toUpperCase()}</Text>
                    <TextInput
                      style={[st.input, { color: c.text }]}
                      placeholderTextColor={c.sub}
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
                </BlurView>

                {error ? <Text style={[st.error, { color: c.red }]}>{error}</Text> : null}

                <TouchableOpacity
                  style={[st.primaryBtn, { backgroundColor: c.accent, opacity: loading ? 0.7 : 1 }]}
                  activeOpacity={0.82}
                  onPress={handleSendCode}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={st.primaryBtnText}>{tr.authSendCode}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[st.hint, { color: c.sub }]}>{tr.authCodeSentHint}</Text>

                <BlurView
                  intensity={isDark ? 20 : 40}
                  tint={isDark ? 'dark' : 'light'}
                  style={[st.card, { borderColor: c.border }]}
                >
                  {/* Code */}
                  <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEnterCode.toUpperCase()}</Text>
                    <TextInput
                      style={[st.input, { color: c.text, fontSize: 22, fontWeight: '700', letterSpacing: 4 }]}
                      placeholderTextColor={c.sub}
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
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authNewPassword.toUpperCase()}</Text>
                    <View style={st.passwordRow}>
                      <TextInput
                        style={[st.input, { color: c.text, flex: 1 }]}
                        placeholderTextColor={c.sub}
                        placeholder="••••••••"
                        value={newPassword}
                        onChangeText={v => { setNewPassword(v); setError(''); }}
                        secureTextEntry={!showNewPwd}
                        textContentType="newPassword"
                        returnKeyType="next"
                      />
                      <TouchableOpacity
                        onPress={() => setShowNewPwd(v => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <IconSymbol name={showNewPwd ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Repeat password */}
                  <View style={st.fieldWrap}>
                    <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPasswordRepeat.toUpperCase()}</Text>
                    <View style={st.passwordRow}>
                      <TextInput
                        style={[st.input, { color: c.text, flex: 1 }]}
                        placeholderTextColor={c.sub}
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
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <IconSymbol name={showRepeat ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </BlurView>

                {error ? <Text style={[st.error, { color: c.red }]}>{error}</Text> : null}

                <TouchableOpacity
                  style={[st.primaryBtn, { backgroundColor: c.accent, opacity: loading ? 0.7 : 1 }]}
                  activeOpacity={0.82}
                  onPress={handleResetPassword}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={st.primaryBtnText}>{tr.authChangePasswordBtn}</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={st.linkBtn}
                  onPress={() => { setStep(1); setCode(''); setNewPassword(''); setRepeatPassword(''); setError(''); }}
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
    paddingTop: 14,
    paddingBottom: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fieldWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    fontSize: 16,
    paddingVertical: 2,
  },
  error: {
    fontSize: 13,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  linkBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
