/**
 * components/settings/ProfileCard.tsx — картка профілю вгорі «Налаштувань».
 *
 * Увійшли: аватар з ініціалами, ім'я, пошта, крапка стану мережі; тап —
 * «Керування акаунтом». Не увійшли: підказка + «Увійти» / «Зареєструватися».
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import type { AuthUser } from '@/store/auth';
import { useI18n } from '@/store/i18n';

import { profileInitials, profileTitle } from './model';
import { fontFamily } from '@/constants/theme';
import { dsTheme, glassOf, glassRim } from '@/components/shared/dsTheme';
import { AccentIcon, AccentWash } from '@/components/shared/GlassBits';

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
  // DS v2: картка — surface.card; дії — pill action.primary / secondary; аватар — action.primary.
  const t = dsTheme(isDark);
  const statusColor = online ? t.status.success : t.text.muted;
  const statusLabel = online ? tr.modeOnline : tr.modeOffline;

  if (!user) {
    return (
      <View style={[st.card, { backgroundColor: glassOf(t).surface, ...glassRim(t, 'card') }]}>
        {/* DS v2.1: картка профілю — KPI «Налаштувань»: легка змивка lavender. */}
        <AccentWash isDark={isDark} accent="lavender" strength={0.7} />
        <View style={st.head}>
          <AccentIcon isDark={isDark} icon="person.fill" accent="lavender" size="lg" style={st.avatar} />
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
            style={[st.btn, { backgroundColor: t.action.primary }]}>
            <Text style={[st.btnText, { color: t.text.onAction }]} numberOfLines={1}>{tr.authLogin}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRegister}
            accessibilityRole="button"
            accessibilityLabel={tr.authRegister}
            style={[st.btn, { backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
            <Text style={[st.btnText, { color: t.action.secondaryText }]} numberOfLines={1}>{tr.authRegister}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
      <View style={[st.card, { backgroundColor: glassOf(t).surface, ...glassRim(t, 'card') }]}>
        <AccentWash isDark={isDark} accent="lavender" strength={0.7} />
        <View style={st.head}>
          <View>
            <View style={[st.avatar, { backgroundColor: glassOf(t).accent.lavender.solid }]}>
              <Text style={[st.initials, { color: glassOf(t).accent.lavender.onSolid }]}>{profileInitials(user.name, user.email)}</Text>
            </View>
            <View
              style={[st.dot, { backgroundColor: statusColor, borderColor: glassOf(t).sheet }]}
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
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card:      { borderRadius: Atlas.radius.xxlarge, overflow: 'hidden', padding: 20 },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:    { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  initials:  { fontSize: 20, fontFamily: fontFamily.medium },
  dot:       { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  info:      { flex: 1, minWidth: 0, gap: 2 },
  title:     { fontSize: 17, fontFamily: fontFamily.semibold },
  sub:       { fontSize: 13, fontFamily: fontFamily.medium },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText:{ fontSize: 12, fontFamily: fontFamily.regular },
  actions:   { flexDirection: 'row', gap: 10, marginTop: 14 },
  // 44 — мінімальний тач-таргет.
  btn:       { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  btnText:   { fontSize: 15, fontFamily: fontFamily.semibold },
});
