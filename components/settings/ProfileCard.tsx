/**
 * components/settings/ProfileCard.tsx — картка профілю вгорі «Налаштувань».
 *
 * Увійшли: аватар з ініціалами, ім'я, пошта, крапка стану мережі; тап —
 * «Керування акаунтом». Не увійшли: підказка + «Увійти» / «Зареєструватися».
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import type { AuthUser } from '@/store/auth';
import { useI18n } from '@/store/i18n';

import { profileInitials, profileTitle } from './model';

export interface ProfileCardColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export function ProfileCard({
  user, online, isDark, colors, onManage, onLogin, onRegister,
}: {
  /** null — гість (не увійшов). */
  user: AuthUser | null;
  online: boolean;
  isDark: boolean;
  colors: ProfileCardColors;
  onManage: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const { tr } = useI18n();
  const c = colors;
  const statusColor = online ? '#10B981' : '#9CA3AF';
  const statusLabel = online ? tr.modeOnline : tr.modeOffline;

  if (!user) {
    return (
      <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
        <View style={st.head}>
          <View style={[st.avatar, { backgroundColor: c.accent + '20' }]}>
            <IconSymbol name="person.fill" size={24} color={c.accent} />
          </View>
          <View style={st.info}>
            <Text style={[st.title, { color: c.text }]} numberOfLines={1}>{tr.settingsHub.profileGuest}</Text>
            <Text style={[st.sub, { color: c.sub }]} numberOfLines={2}>{tr.syncGuestHint}</Text>
          </View>
        </View>
        <View style={st.actions}>
          <TouchableOpacity
            onPress={onLogin}
            accessibilityRole="button"
            accessibilityLabel={tr.authLogin}
            style={[st.btn, { backgroundColor: c.accent }]}>
            <Text style={[st.btnText, { color: '#fff' }]} numberOfLines={1}>{tr.authLogin}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRegister}
            accessibilityRole="button"
            accessibilityLabel={tr.authRegister}
            style={[st.btn, { borderWidth: 1, borderColor: c.accent }]}>
            <Text style={[st.btnText, { color: c.accent }]} numberOfLines={1}>{tr.authRegister}</Text>
          </TouchableOpacity>
        </View>
      </BlurView>
    );
  }

  const title = profileTitle(user.name, user.email);
  const showEmail = title !== user.email;
  return (
    <TouchableOpacity
      onPress={onManage}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${statusLabel}`}
      accessibilityHint={tr.accountManage}>
      <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
        <View style={st.head}>
          <View>
            <View style={[st.avatar, { backgroundColor: c.accent }]}>
              <Text style={st.initials}>{profileInitials(user.name, user.email)}</Text>
            </View>
            <View
              style={[st.dot, { backgroundColor: statusColor, borderColor: isDark ? '#14121E' : '#FFFFFF' }]}
              accessible={false}
            />
          </View>
          <View style={st.info}>
            <Text style={[st.title, { color: c.text }]} numberOfLines={1}>{title}</Text>
            {showEmail && <Text style={[st.sub, { color: c.sub }]} numberOfLines={1}>{user.email}</Text>}
            <View style={st.statusRow}>
              <View style={[st.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[st.statusText, { color: c.sub }]} numberOfLines={1}>{statusLabel}</Text>
            </View>
          </View>
          <IconSymbol name="chevron.right" size={16} color={c.sub} />
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card:      { borderRadius: Atlas.radius.xlarge, borderWidth: 1, overflow: 'hidden', padding: 16 },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:    { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  initials:  { color: '#fff', fontSize: 20, fontWeight: Atlas.type.headingWeight },
  dot:       { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  info:      { flex: 1, minWidth: 0, gap: 2 },
  title:     { fontSize: 17, fontWeight: Atlas.type.headingWeight },
  sub:       { fontSize: 13, fontWeight: '500' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText:{ fontSize: 12, fontWeight: '600' },
  actions:   { flexDirection: 'row', gap: 10, marginTop: 14 },
  // 44 — мінімальний тач-таргет.
  btn:       { flex: 1, minHeight: 44, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  btnText:   { fontSize: 15, fontWeight: '700' },
});
