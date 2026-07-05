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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppMode } from '@/store/app-mode';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';

/**
 * Реюзабельна обгортка для онлайн-екранів. Два режими через `reason`:
 *
 * - `'offline'` (дефолт): показує оверлей коли `!online`.
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
}: {
  children: React.ReactNode;
  reason?: 'offline' | 'guest';
}) {
  const { online, ready, setOnline } = useAppMode();
  const { status } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const router = useRouter();

  const accent = '#0EA5E9';

  // ── Завантаження AppMode (тільки для reason='offline') ────────────────────
  if (reason === 'offline' && !ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDark ? '#0C0C14' : '#F4F2FF',
        }}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  // ── Пропускаємо дітей без оверлея ─────────────────────────────────────────
  if (reason === 'offline' && online) return <>{children}</>;
  if (reason === 'guest' && (status === 'authed' || status === 'loading')) return <>{children}</>;

  // ── Колір ─────────────────────────────────────────────────────────────────
  const text = isDark ? '#F0EEFF' : '#1A1433';
  const sub  = isDark ? 'rgba(240,238,255,0.55)' : 'rgba(26,20,51,0.55)';

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
                backgroundColor: isDark ? 'rgba(18,15,30,0.92)' : 'rgba(255,255,255,0.92)',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
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
                  style={[s.btn, { backgroundColor: accent }]}>
                  <IconSymbol name="person.fill" size={15} color="#fff" />
                  <Text style={s.btnLabel}>{tr.authLogin}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/register')}
                  accessibilityRole="button"
                  style={[s.btn, s.btnOutline, { borderColor: accent, marginTop: 8 }]}>
                  <Text style={[s.btnLabel, { color: accent }]}>{tr.authRegister}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={handleEnableOnline}
                accessibilityRole="button"
                accessibilityLabel={tr.enableOnline}
                style={[s.btn, { backgroundColor: accent }]}>
                <IconSymbol name="wifi" size={15} color="#fff" />
                <Text style={s.btnLabel}>{tr.enableOnline}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </BlurView>
    </View>
  );
}

const s = StyleSheet.create({
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:      { width: '100%', maxWidth: 340, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center' },
  iconBox:   { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title:     { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  desc:      { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  btn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  btnOutline:{ backgroundColor: 'transparent', borderWidth: 1 },
  btnLabel:  { color: '#fff', fontWeight: '800', fontSize: 14, marginLeft: 6 },
});
