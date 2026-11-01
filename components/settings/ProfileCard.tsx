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
import { fontFamily, shadow } from '@/constants/theme';
import { dsTheme, glassOf } from '@/components/shared/dsTheme';

export interface ProfileCardColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export function ProfileCard({
  user, online, isDark, onManage, onLogin, onRegister,
}: {
  /** null — гість (не увійшов). */
  user: AuthUser | null;
  online: boolean;
  isDark: boolean;
  /** Палітра екрана; з Omni (темна картка) не використовується — лишилась для сумісності викликів. */
  colors: ProfileCardColors;
  onManage: () => void;
  onLogin: () => void;
  onRegister: () => void;
}) {
  const { tr } = useI18n();
  // Omni (DS v2.2): профіль — ЄДИНА «темна» виділена картка Налаштувань
  // (t.featured: #11141B / #2C2C2E), текст білий (≥ 15:1 / ≥ 7:1), головна
  // дія — біла pill, другорядна — напівпрозора біла.
  const t = dsTheme(isDark);
  const f = t.featured;
  const card = [st.card, { backgroundColor: f.bg }, shadow[isDark ? 'dark' : 'light'].popover];
  const statusColor = online ? t.status.success : t.text.muted;
  const statusLabel = online ? tr.modeOnline : tr.modeOffline;

  if (!user) {
    return (
      <View style={card}>
        <View style={st.head}>
          <View style={[st.avatar, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <IconSymbol name="person.fill" size={24} color={f.text} />
          </View>
          <View style={st.info}>
            <Text style={[st.title, { color: f.text }]} numberOfLines={1}>{tr.settingsHub.profileGuest}</Text>
            <Text style={[st.sub, { color: f.textSecondary }]} numberOfLines={2}>{tr.syncGuestHint}</Text>
          </View>
        </View>
        <View style={st.actions}>
          <TouchableOpacity
            onPress={onLogin}
            accessibilityRole="button"
            accessibilityLabel={tr.authLogin}
            style={[st.btn, { backgroundColor: f.action }]}>
            <Text style={[st.btnText, { color: f.actionText }]} numberOfLines={1}>{tr.authLogin}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRegister}
            accessibilityRole="button"
            accessibilityLabel={tr.authRegister}
            style={[st.btn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Text style={[st.btnText, { color: f.text }]} numberOfLines={1}>{tr.authRegister}</Text>
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
      <View style={card}>
        <View style={st.head}>
          <View>
            <View style={[st.avatar, { backgroundColor: glassOf(t).accent.lavender.solid }]}>
              <Text style={[st.initials, { color: glassOf(t).accent.lavender.onSolid }]}>{profileInitials(user.name, user.email)}</Text>
            </View>
            <View
              style={[st.dot, { backgroundColor: statusColor, borderColor: f.bg }]}
              accessible={false}
            />
          </View>
          <View style={st.info}>
            <Text style={[st.title, { color: f.text }]} numberOfLines={1}>{title}</Text>
            {showEmail && <Text style={[st.sub, { color: f.textSecondary }]} numberOfLines={1}>{user.email}</Text>}
            <View style={st.statusRow}>
              <View style={[st.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[st.statusText, { color: f.textSecondary }]} numberOfLines={1}>{statusLabel}</Text>
            </View>
          </View>
          {/* Omni: кругла ↗-кнопка «картка веде далі» (декор — уся картка кнопка). */}
          <View style={[st.arrow, { backgroundColor: 'rgba(255,255,255,0.12)' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <IconSymbol name="arrow.up.right" size={16} color={f.text} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card:      { borderRadius: Atlas.radius.xxlarge, padding: 20 },
  arrow:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  head:      { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:    { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  initials:  { fontSize: 20, fontFamily: fontFamily.medium },
  dot:       { position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  info:      { flex: 1, minWidth: 0, gap: 2 },
  title:     { fontSize: 17, fontFamily: fontFamily.semibold },
  sub:       { fontSize: 13, fontFamily: fontFamily.medium },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText:{ fontSize: 12, fontFamily: fontFamily.regular },
  actions:   { flexDirection: 'row', gap: 10, marginTop: 16 },
  // 44 — мінімальний тач-таргет.
  btn:       { flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  btnText:   { fontSize: 15, fontFamily: fontFamily.semibold },
});
