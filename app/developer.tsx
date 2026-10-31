import { Atlas } from '@/constants/atlas';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens, glassTokens, useDS } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { fontFamily } from '@/constants/theme';
import { glassStyles } from '@/components/finance/finPalette';
import { MeshBackground } from '@/components/ds';

const SOCIALS: {
  key: string;
  label: string;
  handle: string;
  url: string;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: (isDark: boolean) => string;
  bg:    (isDark: boolean) => string;
}[] = [
  {
    key: 'instagram',
    label: 'Instagram',
    handle: '@lialiuk_ua',
    url: 'https://www.instagram.com/lialiuk_ua/',
    icon: 'instagram',
    color: () => '#E1306C',
    bg:    () => '#E1306C12',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    handle: '@lialuik_dev',
    url: 'https://www.youtube.com/@lialuik_dev',
    icon: 'youtube',
    color: () => '#FF0000',
    bg:    () => '#FF000012',
  },
  {
    key: 'twitch',
    label: 'Twitch',
    handle: 'lialiuk_dev',
    url: 'https://www.twitch.tv/lialiuk_dev',
    icon: 'twitch',
    color: () => '#9146FF',
    bg:    () => '#9146FF12',
  },
  {
    key: 'telegram',
    label: 'Telegram',
    handle: 'lialiuk_logs',
    url: 'https://t.me/lialiuk_logs',
    icon: 'send-circle',
    color: () => '#26A5E4',
    bg:    () => '#26A5E412',
  },
];

export default function DeveloperScreen() {
  const { tr } = useI18n();
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const k = dsTokens(isDark);
  const g = glassTokens(isDark);
  const { reduceTransparency } = useDS();

  // DS v2.1: mesh-основа, скляні картки (gl), акцент екрана — lavender.
  const c = useMemo(() => ({
    bg1:    g.mesh.base,
    bg2:    g.mesh.base,
    border: k.border.hairline,
    text:   k.text.primary,
    sub:    k.text.secondary,
    dim:    g.surfaceSubtle,
    card:   reduceTransparency ? g.solid.card : g.surface,
    accent: g.accent.lavender.ink,
    accentTint: g.accent.lavender.tint,
    gl:     glassStyles(isDark, reduceTransparency),
  }), [k, g, isDark, reduceTransparency]);

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* Заголовок був вшитий рядком — тепер зі словника. Розділу немає
            в сайдбарі, тож на планшеті стрілку заступає шлях згори. */}
        <ScreenHeader
          title={tr.developer}
          color={c.text}
          titleStyle={st.pageTitle}
          paddingBottom={14}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { ...c.gl.card, borderColor: 'transparent' },
          }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.developer },
          ]}
          crumbColor={c.sub}
        />

        <ScrollView
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }]}
          showsVerticalScrollIndicator={false}>

          {/* Developer card */}
          <View style={[st.devCard, { ...c.gl.card }]}>
            {/* Avatar */}
            {/* Аватар — коло action.primary (градієнти DS лишає лише promo/AI). */}
            <View style={[st.avatar, { backgroundColor: k.action.primary }]}>
              <Text style={[st.avatarText, { color: k.text.onAction }]}>IL</Text>
            </View>

            <Text style={[st.devName, { color: c.text }]}>Igor Lialiuk</Text>
            <Text style={[st.devRole, { color: c.sub }]}>Software Engineer</Text>

            <Pressable
              onPress={() => Linking.openURL('https://github.com/casperDev3')}
              style={({ pressed }) => [st.githubBtn, {
                ...c.gl.subtle,
                opacity: pressed ? 0.7 : 1,
              }]}>
              <MaterialCommunityIcons name="github" size={16} color={k.action.secondaryText} />
              <Text style={[st.githubBtnText, { color: k.action.secondaryText }]}>casperDev3</Text>
            </Pressable>
          </View>

          {/* Socials */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>СОЦІАЛЬНІ МЕРЕЖІ</Text>

          <View style={[st.socialsCard, { ...c.gl.card }]}>
            {SOCIALS.map((s, i) => {
              const iconColor = s.color(isDark);
              const bgColor   = s.bg(isDark);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => Linking.openURL(s.url)}
                  style={({ pressed }) => [
                    st.socialRow,
                    i < SOCIALS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={[st.socialIconWrap, { backgroundColor: bgColor }]}>
                    <MaterialCommunityIcons name={s.icon} size={20} color={iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.socialLabel, { color: c.text }]}>{s.label}</Text>
                    <Text style={[st.socialHandle, { color: c.sub }]}>{s.handle}</Text>
                  </View>
                  <IconSymbol name="chevron.right" size={14} color={c.sub} />
                </Pressable>
              );
            })}
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  sectionLabel:   { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.3, marginBottom: 8, marginTop: 4, marginLeft: 4 },
  devCard: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText:     { fontSize: 26, fontFamily: fontFamily.medium, letterSpacing: -0.5 },
  devName:        { fontSize: 22, fontFamily: fontFamily.semibold, letterSpacing: -0.4, marginBottom: 4 },
  devRole:        { fontSize: 14, fontFamily: fontFamily.medium, marginBottom: 16 },
  githubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 40,
    borderRadius: 999,
  },
  githubBtnText:  { fontSize: 13, fontFamily: fontFamily.semibold },
  socialsCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  socialRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 13 },
  socialIconWrap: { width: 42, height: 42, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
  socialLabel:    { fontSize: 15, fontFamily: fontFamily.semibold },
  socialHandle:   { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 1 },
});
