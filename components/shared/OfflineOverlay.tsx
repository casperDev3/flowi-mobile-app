import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppMode } from '@/store/app-mode';
import { useI18n } from '@/store/i18n';

/**
 * Обгортка для онлайн-екранів. В офлайн-режимі — контент заблюрено,
 * поверх — картка «Недоступно в офлайн-режимі» + кнопка «Увімкнути онлайн».
 */
export function OfflineOverlay({ children }: { children: React.ReactNode }) {
  const { online, setOnline } = useAppMode();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();

  if (online) return <>{children}</>;

  const text = isDark ? '#F0EEFF' : '#1A1433';
  const sub = isDark ? 'rgba(240,238,255,0.55)' : 'rgba(26,20,51,0.55)';
  const accent = '#0EA5E9';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }} pointerEvents="none">{children}</View>

      <BlurView intensity={isDark ? 28 : 40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill}>
        <View style={s.center}>
          <View style={[s.card, { backgroundColor: isDark ? 'rgba(18,15,30,0.92)' : 'rgba(255,255,255,0.92)', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
            <View style={[s.iconBox, { backgroundColor: accent + '20' }]}>
              <IconSymbol name="icloud.slash" size={26} color={accent} />
            </View>
            <Text style={[s.title, { color: text }]}>{tr.unavailableOffline}</Text>
            <Text style={[s.desc, { color: sub }]}>{tr.offlineDesc}</Text>
            <TouchableOpacity onPress={() => setOnline(true)} accessibilityRole="button" accessibilityLabel={tr.enableOnline}
              style={[s.btn, { backgroundColor: accent }]}>
              <IconSymbol name="wifi" size={15} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, marginLeft: 6 }}>{tr.enableOnline}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

const s = StyleSheet.create({
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card:    { width: '100%', maxWidth: 340, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center' },
  iconBox: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title:   { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  desc:    { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
});
