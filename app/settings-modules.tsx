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
 * Системних пунктів («Налаштування», профіль/акаунт, «Сьогодні», а також
 * «Ідеї та баги» — модуль ALWAYS_ON, який moduleSections() відфільтровує, і
 * разом з ним зникає група «Розробка») у списку немає взагалі, а не стоять
 * заблокованими перемикачами: рядок, який
 * неможливо змінити, лише пояснює, чого ви не можете. Натомість під списком
 * один рядок тексту каже те саме словами.
 *
 * Вимкнення НІЧОГО НЕ ВИДАЛЯЄ — це головне, що має зрозуміти користувач перед
 * першим дотиком, тож про це написано вгорі, а не в підтвердженні після.
 */
import { Stack, router } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { moduleSections } from '@/constants/nav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { useI18n } from '@/store/i18n';
import { isModuleEnabled, useUiModules } from '@/store/ui-preferences';
import { fontFamily } from '@/constants/theme';
import { MeshBackground } from '@/components/ds';
import { glassOf, glassRimFor } from '@/components/shared/dsTheme';


export default function SettingsModulesScreen() {
  const readingWidth = useContentWidth();
  /**
   * Ландшафт планшета (рішення 6): секції модулів — двома незалежними
   * колонками (MasonryColumns: секції різної висоти не тягнуть сусідку) у
   * колонці 960pt, як і головний екран налаштувань. Телефон і портрет —
   * одна колонка для читання.
   */
  const { isExpanded } = useResponsive();
  const contentWidth = useMemo(
    () => (isExpanded ? { ...readingWidth, maxWidth: 960 } : readingWidth),
    [isExpanded, readingWidth],
  );
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { disabledModules, setModuleEnabled } = useUiModules();

  // Секції рахуються з маніфесту один раз: він статичний, а перемальовує
  // екран кожен дотик по перемикачу.
  const sections = useMemo(() => moduleSections(), []);

  const k = dsTokens(isDark);

  const c = useMemo(() => ({
    bg1:    k.bg.canvas,
    bg2:    k.bg.canvas,
    border: k.border.hairline,
    text:   k.text.primary,
    sub:    k.text.secondary,
    dim:    glassOf(k).surfaceSubtle,
    card:   glassOf(k).surface,
  }), [k]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MeshBackground />

      <View style={contentWidth}>
        <ScreenHeader
          title={tr.modulesTitle}
          color={c.text}
          // «Назад» і крихти — через спільне правило ScreenHeader (ScreenHeaderNav.ts):
          // на планшеті стрілка поруч із сайдбаром — рудимент, а шлях нагору дають крихти.
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { backgroundColor: c.card, borderColor: 'transparent' },
          }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.modulesTitle },
          ]}
          crumbColor={c.sub}
        />
      </View>

      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}>

        <Text style={[st.intro, { color: c.sub }]}>{tr.modulesSubtitle}</Text>

        <MasonryColumns
          columnCount={isExpanded ? 2 : 1}
          columnGap={16}
          items={sections.map((section): MasonryEntry => ({
          key: String(section.titleKey),
          node: (
          <View>
            <Text style={[st.sectionLabel, { color: c.sub }]}>
              {String(tr[section.titleKey]).toUpperCase()}
            </Text>
            <View style={[st.card, { backgroundColor: c.card, ...glassRimFor(c.card, 'card') }]}>
              {section.items.map((item, index) => {
                const enabled = isModuleEnabled(disabledModules, item.module);
                const label = String(tr[item.labelKey]);
                const last = index === section.items.length - 1;
                return (
                  <View
                    key={item.module}
                    style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                    <View style={[st.iconBox, { backgroundColor: c.dim }]}>
                      <IconSymbol name={item.icon} size={17} color={c.text} />
                    </View>
                    <View style={{ flex: 1 }}><Text style={[st.rowLabel, { color: c.text }]}>{label}</Text>{item.module === 'integrations' && <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>{tr.integrationsModuleHint}</Text>}</View>
                    {/* Ім'я — на самому Switch, а не на обгортці: обгортка з
                        accessible склеїла б рядок в один елемент і сховала
                        керований контрол від скрінрідера. */}
                    <Switch
                      value={enabled}
                      onValueChange={next => setModuleEnabled(item.module, next)}
                      accessibilityLabel={label}
                      accessibilityState={{ checked: enabled }}
                      trackColor={{ false: k.border.hairline, true: k.action.primary }}
                      thumbColor="#fff"
                      ios_backgroundColor={k.border.hairline}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ),
          }))}
        />

        <Text style={[st.note, { color: c.sub }]}>{tr.modulesSystemNote}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  intro:        { fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 4 },
  sectionLabel: { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.3, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  card:         { borderRadius: 24, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  iconBox:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowLabel:     { fontSize: 14, fontFamily: fontFamily.medium },
  note:         { fontSize: 12, lineHeight: 17, marginTop: 16, paddingHorizontal: 4 },
});
