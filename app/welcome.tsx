import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppMode } from '@/store/app-mode';
import { useI18n } from '@/store/i18n';
import { saveData } from '@/store/storage';

export default function WelcomeScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const { setOnline } = useAppMode();

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
    border: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.50)' : 'rgba(26,20,51,0.50)',
    accent: '#7C3AED',
  };

  const handleStartOffline = async () => {
    await saveData('welcome_done', true);
    setOnline(false);
    router.replace('/(tabs)');
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={st.safe}>
        {/* Logo block */}
        <View style={st.logoBlock}>
          <Image
            source={require('@/assets/logo_app.png')}
            style={st.logo}
            resizeMode="contain"
          />
          <Text style={[st.appName, { color: c.text }]}>Flowi</Text>
          <Text style={[st.subtitle, { color: c.sub }]}>{tr.welcomeSubtitle}</Text>
        </View>

        {/* Buttons block */}
        <View style={[st.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <TouchableOpacity
            style={[st.primaryBtn, { backgroundColor: c.accent }]}
            activeOpacity={0.82}
            onPress={() => router.push('/login')}
          >
            <Text style={st.primaryBtnText}>{tr.authLogin}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[st.secondaryBtn, { borderColor: c.accent }]}
            activeOpacity={0.82}
            onPress={() => router.push('/register')}
          >
            <Text style={[st.secondaryBtnText, { color: c.accent }]}>{tr.authRegister}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={st.ghostBtn}
            activeOpacity={0.7}
            onPress={handleStartOffline}
          >
            <Text style={[st.ghostBtnText, { color: c.sub }]}>{tr.startOffline}</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom spacer */}
        <View style={{ height: Platform.OS === 'ios' ? 20 : 12 }} />
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  safe: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logoBlock: {
    alignItems: 'center',
    marginBottom: 44,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  ghostBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  ghostBtnText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
