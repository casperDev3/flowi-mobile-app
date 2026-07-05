import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { saveData } from '@/store/storage';

export default function LoginScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.50)' : 'rgba(26,20,51,0.50)',
    input:  isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    accent: '#7C3AED',
    red:    '#EF4444',
  };

  const handleLogin = async () => {
    setErrorMsg('');
    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail || !password) {
      setErrorMsg(tr.authInvalidCreds);
      return;
    }
    setLoading(true);
    try {
      await login(trimEmail, password);
      await saveData('welcome_done', true);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === '401' || code === 'no_active_account' || (e instanceof Error && e.message.includes('401'))) {
        setErrorMsg(tr.authInvalidCreds);
      } else {
        setErrorMsg(tr.authInvalidCreds);
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
              style={[st.card, { borderColor: c.border }]}
            >
              {/* Email */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authEmail.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="next"
                />
              </View>

              {/* Password */}
              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPassword.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
              </View>
            </BlurView>

            {errorMsg ? (
              <Text style={[st.error, { color: c.red }]}>{errorMsg}</Text>
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
