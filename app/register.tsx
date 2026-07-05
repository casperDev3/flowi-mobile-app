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

export default function RegisterScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { register } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.50)' : 'rgba(26,20,51,0.50)',
    accent: '#7C3AED',
    red:    '#EF4444',
  };

  const handleRegister = async () => {
    setErrorMsg('');

    if (password.length < 8) {
      setErrorMsg(tr.authWeakPassword);
      return;
    }
    if (password !== passwordRepeat) {
      setErrorMsg(tr.authPasswordsMismatch);
      return;
    }

    const trimEmail = email.trim().toLowerCase();
    if (!trimEmail) {
      setErrorMsg(tr.authInvalidCreds);
      return;
    }

    setLoading(true);
    try {
      await register(trimEmail, password, name.trim() || undefined);
      await saveData('welcome_done', true);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'email_taken' || code === '409') {
        setErrorMsg(tr.authEmailTaken);
      } else if (code === 'password_too_common' || code === 'password_too_short') {
        setErrorMsg(tr.authWeakPassword);
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
            <Text style={[st.title, { color: c.text }]}>{tr.authRegister}</Text>

            <BlurView
              intensity={isDark ? 20 : 40}
              tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}
            >
              {/* Name */}
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authName.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
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
              <View style={[st.fieldWrap, { borderBottomColor: c.border, borderBottomWidth: 1 }]}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPassword.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  textContentType="newPassword"
                  returnKeyType="next"
                />
              </View>

              {/* Repeat password */}
              <View style={st.fieldWrap}>
                <Text style={[st.fieldLabel, { color: c.sub }]}>{tr.authPasswordRepeat.toUpperCase()}</Text>
                <TextInput
                  style={[st.input, { color: c.text }]}
                  placeholderTextColor={c.sub}
                  placeholder="••••••••"
                  value={passwordRepeat}
                  onChangeText={setPasswordRepeat}
                  secureTextEntry
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleRegister}
                />
              </View>
            </BlurView>

            {errorMsg ? (
              <Text style={[st.error, { color: c.red }]}>{errorMsg}</Text>
            ) : null}

            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: c.accent, opacity: loading ? 0.7 : 1 }]}
              activeOpacity={0.82}
              onPress={handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={st.primaryBtnText}>{tr.authRegister}</Text>
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
    paddingTop: 14,
    paddingBottom: 4,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 80,
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
