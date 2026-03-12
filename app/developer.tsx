import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    card:   isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)',
    accent: '#7C3AED',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[st.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={18} color={c.sub} />
          </TouchableOpacity>
          <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Розробник</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }}
          showsVerticalScrollIndicator={false}>

          {/* Developer card */}
          <View style={[st.devCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {/* Avatar */}
            <LinearGradient
              colors={['#7C3AED', '#6366F1']}
              style={st.avatar}>
              <Text style={st.avatarText}>IL</Text>
            </LinearGradient>

            <Text style={[st.devName, { color: c.text }]}>Igor Lialiuk</Text>
            <Text style={[st.devRole, { color: c.sub }]}>Software Engineer</Text>

            <Pressable
              onPress={() => Linking.openURL('https://github.com/casperDev3')}
              style={({ pressed }) => [st.githubBtn, {
                backgroundColor: isDark ? '#FFFFFF10' : '#24292E10',
                borderColor: isDark ? '#FFFFFF20' : '#24292E20',
                opacity: pressed ? 0.7 : 1,
              }]}>
              <MaterialCommunityIcons name="github" size={16} color={isDark ? '#E0E0E0' : '#24292E'} />
              <Text style={[st.githubBtnText, { color: isDark ? '#E0E0E0' : '#24292E' }]}>casperDev3</Text>
            </Pressable>
          </View>

          {/* Socials */}
          <Text style={[st.sectionLabel, { color: c.sub }]}>СОЦІАЛЬНІ МЕРЕЖІ</Text>

          <View style={[st.socialsCard, { backgroundColor: c.card, borderColor: c.border }]}>
            {SOCIALS.map((s, i) => {
              const iconColor = s.color(isDark);
              const bgColor   = s.bg(isDark);
              return (
                <Pressable
                  key={s.key}
                  onPress={() => Linking.openURL(s.url)}
                  style={({ pressed }) => [
                    st.socialRow,
                    i < SOCIALS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
                    { opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={[st.socialIconWrap, { backgroundColor: bgColor, borderColor: iconColor + '30', borderWidth: 1 }]}>
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
  pageTitle:      { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  backBtn:        { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel:   { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 4, marginLeft: 4 },
  devCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarText:     { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  devName:        { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 4 },
  devRole:        { fontSize: 14, fontWeight: '500', marginBottom: 16 },
  githubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  githubBtnText:  { fontSize: 13, fontWeight: '600' },
  socialsCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  socialRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 13 },
  socialIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  socialLabel:    { fontSize: 15, fontWeight: '600' },
  socialHandle:   { fontSize: 12, fontWeight: '400', marginTop: 1 },
});
