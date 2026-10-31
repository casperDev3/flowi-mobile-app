import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useAppMode } from '@/store/app-mode';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { fontFamily, radius, space } from '@/constants/theme';
import { glassOf, glassRim } from '@/components/shared/dsTheme';

/**
 * Реюзабельна обгортка для онлайн-екранів. Два режими через `reason`:
 *
 * - `'offline'` (дефолт): показує оверлей/банер коли `!online`.
 *   mode='block' (дефолт): повний blur-оверлей, контент не доступний.
 *   mode='banner': контент видимий і інтерактивний, зверху компактний банер.
 *   Кнопка «Увімкнути онлайн»:
 *     • гість  → Alert з кнопками Увійти / Зареєструватись / Скасувати
 *     • authed → setOnline(true)
 *
 * - `'guest'`: показує оверлей коли `online && status !== 'authed'`.
 *   Кнопки → router.push('/login') і router.push('/register').
 */
export function OfflineOverlay({
  children,
  reason = 'offline',
  mode = 'block',
}: {
  children: React.ReactNode;
  reason?: 'offline' | 'guest';
  mode?: 'block' | 'banner';
}) {
  const { online, ready, setOnline } = useAppMode();
  const { status } = useAuth();
  const { t, isDark } = useDSTheme();
  const { tr } = useI18n();
  const router = useRouter();

  // DS v2: стан мережі — status.info; головні дії — pill action.primary.
  const accent = t.status.info;

  // ── Завантаження AppMode (тільки для reason='offline') ────────────────────
  if (reason === 'offline' && !ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.bg.canvas,
        }}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  // ── Пропускаємо дітей без оверлея ─────────────────────────────────────────
  if (reason === 'offline' && online) return <>{children}</>;
  if (reason === 'guest' && (status === 'authed' || status === 'loading')) return <>{children}</>;

  // ── Колір ─────────────────────────────────────────────────────────────────
  const text = t.text.primary;
  const sub  = t.text.secondary;

  const isGuestCard = reason === 'guest';

  // ── Обробник кнопки «Увімкнути онлайн» (тільки reason='offline') ──────────
  const handleEnableOnline = () => {
    if (status !== 'authed') {
      Alert.alert(
        tr.onlineNeedsAccount,
        tr.onlineNeedsAccountMsg,
        [
          { text: tr.authLogin,    onPress: () => router.push('/login')    },
          { text: tr.authRegister, onPress: () => router.push('/register') },
          { text: tr.cancel, style: 'cancel' },
        ],
      );
    } else {
      setOnline(true);
    }
  };

  // ── Банер-режим: контент повністю видимий, лише компактна смуга зверху ────
  if (mode === 'banner' && !isGuestCard) {
    const bannerBg   = glassOf(t).surface;
    const bannerBord = t.border.hairline;
    return (
      <View style={{ flex: 1 }}>
        {/* Компактний банер «Офлайн: лише перегляд» */}
        <TouchableOpacity
          onPress={handleEnableOnline}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={tr.offlineReadOnly}
          style={[s.banner, { backgroundColor: bannerBg, borderBottomColor: bannerBord }]}>
          <IconSymbol name="icloud.slash" size={13} color={accent} />
          <Text style={[s.bannerText, { color: accent }]}>{tr.offlineReadOnly}</Text>
          <IconSymbol name="wifi" size={13} color={sub} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
        {children}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Контент екрана — заблюровано, не інтерактивно */}
      <View style={{ flex: 1 }} pointerEvents="none">{children}</View>

      <BlurView
        intensity={isDark ? 28 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}>
        <View style={s.center}>
          <View
            style={[
              s.card,
              {
                backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong'),
              },
            ]}>
            {/* Іконка */}
            <View style={[s.iconBox, { backgroundColor: accent + '20' }]}>
              <IconSymbol
                name={isGuestCard ? 'person.slash' : 'icloud.slash'}
                size={26}
                color={accent}
              />
            </View>

            {/* Заголовок */}
            <Text style={[s.title, { color: text }]}>
              {isGuestCard ? tr.onlineNeedsAccount : tr.unavailableOffline}
            </Text>

            {/* Підпис */}
            <Text style={[s.desc, { color: sub }]}>
              {isGuestCard ? tr.onlineNeedsAccountMsg : tr.offlineDesc}
            </Text>

            {/* Кнопки */}
            {isGuestCard ? (
              <>
                <TouchableOpacity
                  onPress={() => router.push('/login')}
                  accessibilityRole="button"
                  style={[s.btn, { backgroundColor: t.action.primary }]}>
                  <IconSymbol name="person.fill" size={15} color={t.text.onAction} />
                  <Text style={[s.btnLabel, { color: t.text.onAction }]}>{tr.authLogin}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/register')}
                  accessibilityRole="button"
                  style={[s.btn, { backgroundColor: glassOf(t).surfaceSubtle, marginTop: 8 }]}>
                  <Text style={[s.btnLabel, { color: t.action.secondaryText }]}>{tr.authRegister}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={handleEnableOnline}
                accessibilityRole="button"
                accessibilityLabel={tr.enableOnline}
                style={[s.btn, { backgroundColor: t.action.primary }]}>
                <IconSymbol name="wifi" size={15} color={t.text.onAction} />
                <Text style={[s.btnLabel, { color: t.text.onAction }]}>{tr.enableOnline}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </BlurView>
    </View>
  );
}

const s = StyleSheet.create({
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:       { width: '100%', maxWidth: 340, borderRadius: radius.card, padding: space.cardPadding, alignItems: 'center' },
  iconBox:    { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title:      { fontSize: 17, fontFamily: fontFamily.semibold, textAlign: 'center', marginBottom: 8 },
  desc:       { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  btn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 48, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill },
  btnLabel:   { fontFamily: fontFamily.semibold, fontSize: 14, marginLeft: 6 },
  banner:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  bannerText: { fontSize: 12, fontFamily: fontFamily.bold },
});
