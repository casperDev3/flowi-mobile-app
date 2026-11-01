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
import { BentoCard, BentoGrid, MeshBackground } from '@/components/ds';

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

          {/* Omni: профіль розробника — єдина темна (featured) картка сторінки
              з білою pill-дією; соцмережі — звичайна bento-картка поруч. */}
          <BentoGrid columns={{ compact: 1, medium: 2, expanded: 2 }}>
          <BentoCard variant="dark">
            <View style={st.devCard}>
              {/* Аватар — біле коло на темній картці (градієнти DS лишає лише promo/AI). */}
              <View style={[st.avatar, { backgroundColor: k.featured.action }]}>
                <Text style={[st.avatarText, { color: k.featured.actionText }]}>IL</Text>
              </View>

              <Text style={[st.devName, { color: k.featured.text }]}>Igor Lialiuk</Text>
              <Text style={[st.devRole, { color: k.featured.textSecondary }]}>Software Engineer</Text>

              <Pressable
                onPress={() => Linking.openURL('https://github.com/casperDev3')}
                accessibilityRole="link"
                accessibilityLabel="GitHub: casperDev3"
                style={({ pressed }) => [st.githubBtn, {
                  backgroundColor: k.featured.action,
                  opacity: pressed ? 0.7 : 1,
                }]}>
                <MaterialCommunityIcons name="github" size={16} color={k.featured.actionText} />
                <Text style={[st.githubBtnText, { color: k.featured.actionText }]}>casperDev3</Text>
              </Pressable>
            </View>
          </BentoCard>

          {/* Socials */}
          <BentoCard title="Соціальні мережі" icon="person.2.fill" accent="lavender">
          <View style={[st.socialsCard, { backgroundColor: k.surface.subtle }]}>
            {SOCIALS.map((s, i) => {
              const iconColor = s.color(isDark);
              const bgColor   = s.bg(isDark);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => Linking.openURL(s.url)}
                  accessibilityRole="link"
                  accessibilityLabel={`${s.label}: ${s.handle}`}
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
          </BentoCard>
          </BentoGrid>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  devCard: {
    alignItems: 'center',
    paddingVertical: 8,
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
  // Вкладена група рядків усередині bento-картки (surface.subtle).
  socialsCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  socialRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 13 },
  socialIconWrap: { width: 42, height: 42, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
  socialLabel:    { fontSize: 15, fontFamily: fontFamily.semibold },
  socialHandle:   { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 1 },
});
