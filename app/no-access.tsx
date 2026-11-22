/**
 * app/no-access.tsx — «Немає доступу» (rc1, S3-03, docs/release-rc1/deeplinks.md).
 *
 * Сюди `app/open-link.tsx` веде посилання на проєкт, учасником якого людина
 * НЕ є (або вже не є: відкликали доступ). Екран навмисно не показує
 * НІЧОГО з самого посилання — ні назви проєкту, ні id, ні тексту задачі: усе
 * це чужі дані, і саме лише «такий проєкт існує, ось його назва» вже витік.
 */
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MeshBackground } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily } from '@/constants/theme';
import { getScreenColors } from '@/constants/tokens';
import { dsTokens } from '@/hooks/use-ds';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { DEEP_LINK_FALLBACK_ROUTE } from '@/utils/deepLinks';

export default function NoAccessScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const c = getScreenColors('auth', isDark);
  const k = dsTokens(isDark);
  const contentWidth = useContentWidth();
  const { tr } = useI18n();

  return (
    <View style={[st.root, { backgroundColor: c.bg1 }]}>
      {!isDark && <MeshBackground />}
      <View style={[st.center, contentWidth]}>
        <View style={[st.card, { backgroundColor: k.surface.card, borderColor: c.border }]}>
          <IconSymbol name="hand.raised" size={28} color={c.sub} />
          <Text accessibilityRole="header" style={[st.title, { color: c.text, fontFamily: fontFamily.semibold }]}>
            {tr.noAccessTitle}
          </Text>
          <Text style={[st.body, { color: c.sub }]}>{tr.noAccessBody}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.replace(DEEP_LINK_FALLBACK_ROUTE as Href)}
            style={[st.primary, { backgroundColor: k.action.primary }]}
          >
            <Text style={[st.primaryText, { color: k.text.onAction, fontFamily: fontFamily.semibold }]}>{tr.noAccessHome}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, width: '100%', alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 8 },
  title: { fontSize: 18, marginTop: 4 },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  primary: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16 },
});
