import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { loadWorkspaceConfig } from '@/store/workspace';

export default function WelcomeScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  // Перший екран додатку: на планшеті картка з кнопками не має розповзатися
  // на всю ширину — три кнопки завширшки з вікно виглядають як панель, а не
  // як вибір із трьох варіантів.
  const contentWidth = useContentWidth();

  const c = getScreenColors('auth', isDark);

  // Назва workspace — контекст «куди саме заходжу», а не голий вибір
  // «Увійти/Зареєструватись»; порожньо, доки конфіг не прочитано з AsyncStorage.
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    void loadWorkspaceConfig().then(config => { if (mounted) setWorkspaceName(config?.name ?? null); });
    return () => { mounted = false; };
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={st.safe}>
        <View style={[st.column, contentWidth]}>
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
              accessibilityRole="button"
              accessibilityLabel={tr.authLogin}
            >
              <Text style={st.primaryBtnText}>{tr.authLogin}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.secondaryBtn, { borderColor: c.accent }]}
              activeOpacity={0.82}
              onPress={() => router.push('/register')}
              accessibilityRole="button"
              accessibilityLabel={tr.authRegister}
            >
              <Text style={[st.secondaryBtnText, { color: c.accent }]}>{tr.authRegister}</Text>
            </TouchableOpacity>
          </View>

          {workspaceName ? (
            <TouchableOpacity
              style={st.workspaceRow}
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/workspace', params: { change: '1' } })}
              accessibilityRole="button"
              accessibilityLabel={`${tr.workspaceCurrentLabel}: ${workspaceName}. ${tr.workspaceChangeLink}`}
            >
              <Text style={[st.workspaceText, { color: c.sub }]}>
                {tr.workspaceCurrentLabel}: {workspaceName}
              </Text>
              <Text style={[st.workspaceLink, { color: c.accent }]}>{tr.workspaceChangeLink}</Text>
            </TouchableOpacity>
          ) : null}
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
  column: {
    width: '100%',
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
    borderRadius: Radius.xxl,
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
  workspaceRow: {
    marginTop: 20,
    alignItems: 'center',
    gap: 4,
  },
  workspaceText: {
    fontSize: 12,
  },
  workspaceLink: {
    fontSize: 13,
    fontWeight: '600',
  },
});
