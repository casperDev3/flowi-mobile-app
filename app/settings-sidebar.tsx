/**
 * app/settings-sidebar.tsx — «Закріплені розділи сайдбару» (планшет).
 *
 * Будь-який розділ-модуль можна закріпити: у сайдбарі планшета він стоїть
 * одразу під «Сьогодні» (Огляд) зі шпилькою; тап по шпильці там відкріплює
 * його, і розділ повертається на своє місце в групі. Перелік і групи — з
 * того самого маніфесту, що й сайдбар планшета (tabletNavGroups), а не
 * окремий список. Закріплення — синхронізоване поле ui_preferences
 * (components/shared/pinned-sections.ts).
 *
 * Вимкнені модулі тут видно (з позначкою), бо закріплення переживає
 * вимкнення: у меню такий розділ не показується, увімкнули — він знову вгорі.
 *
 * Рядок, що веде сюди, є лише на планшеті (телефон не змінюється); прямий
 * перехід на телефоні просто покаже той самий список.
 */
import { Stack, router } from 'expo-router';
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { BentoCard, BentoCardHeader, KpiCounter, MeshBackground, PageHeader } from '@/components/ds';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { usePinnedSections } from '@/components/shared/pinned-sections';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useSidebarStrings } from '@/components/shared/sidebar-strings';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { NAV_GROUPS, isPinnableNavItem, menuNavGroups, tabletNavGroups, type NavItem, type ModuleId } from '@/constants/nav';
import { fontFamily } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { dsTokens } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { isModuleEnabled, useUiModules } from '@/store/ui-preferences';

type PinnableItem = NavItem & { module: ModuleId };

export default function SettingsSidebarScreen() {
  const readingWidth = useContentWidth();
  const { isExpanded } = useResponsive();
  const contentWidth = useMemo(
    () => (isExpanded ? { ...readingWidth, maxWidth: 960 } : readingWidth),
    [isExpanded, readingWidth],
  );
  const isDark = useColorScheme() === 'dark';
  const k = dsTokens(isDark);
  const { tr } = useI18n();
  const s = useSidebarStrings();
  const { disabledModules } = useUiModules();
  const { pinned, isPinned, setPinned } = usePinnedSections();

  // Групи — як у сайдбарі планшета (Інтеграції вже в «Ще»), без вкладок
  // «Фінансів» і без системних пунктів.
  const sections = useMemo(() => menuNavGroups(tabletNavGroups(NAV_GROUPS))
    .filter(group => group.titleKey)
    .map(group => ({
      titleKey: group.titleKey as NonNullable<typeof group.titleKey>,
      items: group.items.filter((item): item is PinnableItem => isPinnableNavItem(item)),
    }))
    .filter(group => group.items.length > 0), []);

  const pinnedVisible = useMemo(
    () => pinned.filter(id => sections.some(sec => sec.items.some(item => item.module === id))).length,
    [pinned, sections],
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MeshBackground />

      <View style={contentWidth}>
        <ScreenHeader
          title={s.pinnedSettingsTitle}
          color={k.text.primary}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: k.text.secondary,
            style: { backgroundColor: k.surface.card, borderColor: 'transparent' },
          }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: s.pinnedSettingsTitle },
          ]}
          crumbColor={k.text.secondary}>
          <PageHeader bleed={20} kpis={<KpiCounter value={String(pinnedVisible)} label={s.pinnedGroup} />} />
        </ScreenHeader>
      </View>

      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}>
        <Text style={[st.intro, { color: k.text.secondary }]}>{s.pinnedSettingsIntro}</Text>

        <MasonryColumns
          columnCount={isExpanded ? 2 : 1}
          columnGap={16}
          items={sections.map((section): MasonryEntry => ({
            key: String(section.titleKey),
            node: (
              <BentoCard padded={false} style={st.card}>
                <View style={st.cardHead}>
                  <BentoCardHeader title={String(tr[section.titleKey])} />
                </View>
                <View>
                  {section.items.map((item, index) => {
                    const on = isPinned(item.module);
                    const enabled = isModuleEnabled(disabledModules, item.module);
                    const label = String(tr[item.labelKey]);
                    const last = index === section.items.length - 1;
                    return (
                      <View
                        key={item.module}
                        style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: k.border.hairline }]}>
                        <View style={[st.iconBox, { backgroundColor: k.surface.subtle }]}>
                          <IconSymbol name={item.icon} size={16} color={k.text.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[st.rowLabel, { color: k.text.primary }]}>{label}</Text>
                          {!enabled ? (
                            <Text style={[st.rowSub, { color: k.text.secondary }]}>{s.moduleOff}</Text>
                          ) : null}
                        </View>
                        {on ? <IconSymbol name="pin.fill" size={14} color={k.text.secondary} /> : null}
                        <Switch
                          value={on}
                          onValueChange={next => setPinned(item.module, next)}
                          accessibilityLabel={on ? s.unpinSection(label) : s.pinSection(label)}
                          accessibilityState={{ checked: on }}
                          testID={`pin-switch-${item.module}`}
                          trackColor={{ false: k.border.hairline, true: k.action.primary }}
                          thumbColor="#fff"
                          ios_backgroundColor={k.border.hairline}
                        />
                      </View>
                    );
                  })}
                </View>
              </BentoCard>
            ),
          }))}
        />

        <Text style={[st.note, { color: k.text.secondary }]}>{s.pinnedSettingsHiddenNote}</Text>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  intro:    { fontSize: 13, lineHeight: 19, marginTop: 4, marginBottom: 4 },
  card:     { marginTop: 16 },
  cardHead: { paddingHorizontal: 16, paddingTop: 16, marginBottom: -4 },
  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12, minHeight: 56 },
  iconBox:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontFamily: fontFamily.medium },
  rowSub:   { fontSize: 12, marginTop: 4 },
  note:     { fontSize: 12, lineHeight: 17, marginTop: 16, paddingHorizontal: 4 },
});
