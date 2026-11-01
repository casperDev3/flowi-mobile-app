import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Radius, getScreenColors } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { loadWorkspaceConfig } from '@/store/workspace';
import { fontFamily, shadow } from '@/constants/theme';
import { MeshBackground } from '@/components/ds';

export default function WelcomeScreen() {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  // Перший екран додатку: на планшеті картка з кнопками не має розповзатися
  // на всю ширину — три кнопки завширшки з вікно виглядають як панель, а не
  // як вибір із трьох варіантів.
  const contentWidth = useContentWidth();

  const k = dsTokens(isDark);

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
      <MeshBackground />

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
          <View style={[st.card, { backgroundColor: k.surface.card, ...shadow[isDark ? 'dark' : 'light'].card }]}>
            <TouchableOpacity
              style={[st.primaryBtn, { backgroundColor: k.action.primary }]}
              activeOpacity={0.82}
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel={tr.authLogin}
            >
              <Text style={[st.primaryBtnText, { color: k.text.onAction }]}>{tr.authLogin}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[st.secondaryBtn, { backgroundColor: k.surface.subtle }]}
              activeOpacity={0.82}
              onPress={() => router.push('/register')}
              accessibilityRole="button"
              accessibilityLabel={tr.authRegister}
            >
              <Text style={[st.secondaryBtnText, { color: k.action.secondaryText }]}>{tr.authRegister}</Text>
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
              <Text style={[st.workspaceLink, { color: c.text, textDecorationLine: 'underline' }]}>{tr.workspaceChangeLink}</Text>
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
    fontSize: 48,
    fontFamily: fontFamily.light,
    letterSpacing: -0.96,
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
    padding: 24,
    gap: 12,
  },
  primaryBtn: {
    borderRadius: 999,
    minHeight: 52,
    justifyContent: 'center',
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: fontFamily.semibold,
  },
  secondaryBtn: {
    borderRadius: 999,
    minHeight: 52,
    justifyContent: 'center',
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontFamily: fontFamily.semibold,
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
    fontFamily: fontFamily.semibold,
  },
});
