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
import { ApiError, OfflineError } from '@/store/api';
import { useAppMode } from '@/store/app-mode';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { saveData } from '@/store/storage';
import { syncNow } from '@/store/sync-engine';
import { haptic } from '@/utils/haptics';

// ─── Простий валідатор формату email ─────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { login } = useAuth();
  const { online, setOnline } = useAppMode();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const c = {
    ...getScreenColors('auth', isDark),
    input:       isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    errorBorder: '#EF4444',
    red:         '#EF4444',
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
      setPasswordError(tr.authInvalidCreds);
      return;
    }
    if (!EMAIL_RE.test(trimEmail)) {
      haptic.error();
      setEmailError(tr.authInvalidEmail);
      return;
    }
    setLoading(true);
    try {
      await login(trimEmail, password);
      await saveData('welcome_done', true);
      router.replace('/(tabs)');
      // З офлайну увійшли заради онлайн-функцій — пропонуємо увімкнути
      if (!online) {
        Alert.alert(tr.enableOnline, tr.enableOnlineAfterLoginMsg, [
          { text: tr.yes, onPress: () => { setOnline(true); void syncNow(); } },
          { text: tr.later, style: 'cancel' },
        ]);
      }
    } catch (e: unknown) {
      haptic.error();
      if (e instanceof OfflineError) {
        setGeneralError(tr.authOfflineError);
      } else if (e instanceof ApiError) {
        if (e.status === 401 || e.code === 'no_active_account') {
          setPasswordError(tr.authInvalidCreds);
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
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
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
            <Text style={[st.title, { color: c.text }]}>{tr.authLogin}</Text>

            <BlurView
              intensity={isDark ? 20 : 40}
              tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: emailError ? c.errorBorder : c.border }]}
            >
              {/* Email */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEmail.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
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
                <Text style={[st.fieldError, { color: c.red }]}>{emailError}</Text>
              ) : null}

              {/* Password */}
              <View style={[st.fieldWrap, { borderTopColor: emailError ? c.border : 'transparent' }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPassword.toUpperCase()}</Text>
                <View style={st.passwordRow}>
                  <TextInput
                    style={[st.input, { color: c.text, flex: 1 }]}
                    placeholderTextColor={c.sub}
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
                    accessibilityLabel={showPassword ? 'Сховати пароль' : 'Показати пароль'}
                  >
                    <IconSymbol
                      name={showPassword ? 'eye.slash' : 'eye'}
                      size={18}
                      color={c.sub}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>

            {passwordError ? (
              <Text style={[st.error, { color: c.red }]}>{passwordError}</Text>
            ) : null}
            {generalError ? (
              <Text style={[st.error, { color: c.red }]}>{generalError}</Text>
            ) : null}

            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: c.accent, opacity: loading ? 0.7 : 1 }]}
              activeOpacity={0.82}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.primaryBtnText}>{tr.authLogin}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => router.push('/forgot-password')}
            >
              <Text style={[st.linkText, { color: c.accent }]}>{tr.authForgotPassword}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => router.replace('/register')}
            >
              <Text style={[st.linkText, { color: c.sub }]}>{tr.authNoAccount}</Text>
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
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.4,
    marginBottom: 24,
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
