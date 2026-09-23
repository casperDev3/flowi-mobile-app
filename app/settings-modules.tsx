/**
 * app/settings-modules.tsx — які модулі інтерфейсу показувати.
 *
 * Перелік і групування НЕ записані тут окремим списком: їх віддає
 * `moduleSections()` з constants/nav.ts, тобто той самий маніфест, з якого
 * будується сайдбар. Два списки розійшлися б на першому ж новому розділі —
 * сайдбар знав би про нього, а вимкнути його було б нічим. Побічний наслідок
 * того самого рішення: групи тут стоять у тому ж порядку і під тими ж
 * назвами, що й у сайдбарі, без окремої домовленості про це.
 *
 * Системних пунктів («Налаштування», профіль/акаунт, «Сьогодні») у списку
 * немає взагалі, а не стоять заблокованими перемикачами: рядок, який
 * неможливо змінити, лише пояснює, чого ви не можете. Натомість під списком
 * один рядок тексту каже те саме словами.
 *
 * Вимкнення НІЧОГО НЕ ВИДАЛЯЄ — це головне, що має зрозуміти користувач перед
 * першим дотиком, тож про це написано вгорі, а не в підтвердженні після.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { moduleSections } from '@/constants/nav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useI18n } from '@/store/i18n';
import { isModuleEnabled, useUiModules } from '@/store/ui-preferences';

const ACCENT = '#7C3AED';

export default function SettingsModulesScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { disabledModules, setModuleEnabled } = useUiModules();

  // Секції рахуються з маніфесту один раз: він статичний, а перемальовує
  // екран кожен дотик по перемикачу.
  const sections = useMemo(() => moduleSections(), []);

  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  }), [isDark]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <View style={contentWidth}>
        <ScreenHeader
          title={tr.modulesTitle}
          color={c.text}
          actions={
            <HeaderButton
              onPress={() => router.back()}
              accessibilityLabel={tr.back}
              style={{ backgroundColor: c.dim, borderColor: c.border }}>
              <IconSymbol name="chevron.left" size={17} color={c.sub} />
            </HeaderButton>
          }
        />
      </View>

      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}>

        <Text style={[st.intro, { color: c.sub }]}>{tr.modulesSubtitle}</Text>

        {sections.map(section => (
          <View key={String(section.titleKey)}>
            <Text style={[st.sectionLabel, { color: c.sub }]}>
              {String(tr[section.titleKey]).toUpperCase()}
            </Text>
            <BlurView
              intensity={isDark ? 20 : 40}
              tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}>
              {section.items.map((item, index) => {
                const enabled = isModuleEnabled(disabledModules, item.module);
                const label = String(tr[item.labelKey]);
                const last = index === section.items.length - 1;
                return (
                  <View
                    key={item.module}
                    style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    <View style={[st.iconBox, { backgroundColor: ACCENT + '20' }]}>
                      <IconSymbol name={item.icon} size={17} color={ACCENT} />
                    </View>
                    <Text style={[st.rowLabel, { color: c.text, flex: 1 }]}>{label}</Text>
                    {/* Ім'я — на самому Switch, а не на обгортці: обгортка з
                        accessible склеїла б рядок в один елемент і сховала
                        керований контрол від скрінрідера. */}
                    <Switch
                      value={enabled}
                      onValueChange={next => setModuleEnabled(item.module, next)}
                      accessibilityLabel={label}
                      accessibilityState={{ checked: enabled }}
                      trackColor={{ false: 'rgba(128,128,128,0.3)', true: ACCENT }}
                      thumbColor="#fff"
                      ios_backgroundColor="rgba(128,128,128,0.3)"
                    />
                  </View>
                );
              })}
            </BlurView>
          </View>
        ))}

        <Text style={[st.note, { color: c.sub }]}>{tr.modulesSystemNote}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  intro:        { fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card:         { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  iconBox:      { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel:     { fontSize: 14, fontWeight: '500' },
  note:         { fontSize: 12, lineHeight: 17, marginTop: 16, paddingHorizontal: 4 },
});
