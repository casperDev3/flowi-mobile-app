/**
 * components/shared/NavSidebar.tsx
 *
 * Постійна бічна навігація для широкого екрана.
 *
 * Замінює нижні таби, а не доповнює їх: два конкурентні набори навігації
 * на одному екрані змушують щоразу вирішувати, яким користуватися.
 * На вузькому екрані сайдбар не рендериться взагалі — там таби.
 *
 * Групи згортаються, бо повний перелік не влазить: 17 пунктів по 44pt (мінімум
 * тач-таргета за HIG, нижче не можна) плюс заголовки й бренд — це ~950pt проти
 * 834pt висоти альбомного 11″ iPad. Тобто до цього сайдбар скролився ЗАВЖДИ, і
 * останні пункти доводилося шукати прокруткою в панелі, сенс якої — бачити
 * розділи без пошуку.
 *
 * Згорнутість запам'ятовується локально (saveData, не saveSynced): це
 * налаштування ЦЬОГО екрана, а не дані користувача. На телефоні сайдбара немає
 * зовсім, а на 13″ iPad усе влазить і без згортання — синхронізувати такий
 * вибір між пристроями означало б нав'язувати вибір, зроблений для іншої
 * діагоналі.
 *
 * Вимкнені модулі — протилежний випадок і тому інше сховище: це вибір про
 * склад продукту, а не про розмір екрана, тож він лежить у синхронізованому
 * 'ui_preferences' (store/ui-preferences.ts) і діє на всіх пристроях. Пункт
 * вимкненого модуля зникає зі списку (visibleNavGroups); дані модуля при
 * цьому не видаляються — ховається лише вхід.
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { ActiveTimersSidebarCard } from '@/components/time/ActiveTimersSidebarCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  DEFAULT_COLLAPSED_GROUP_IDS,
  SIDEBAR_WIDTH,
  isGroupCollapsed,
  isNavItemActive,
  menuNavGroups,
  navGroupsFor,
  visibleNavGroups,
} from '@/constants/nav';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { useUiModules } from '@/store/ui-preferences';

// Ширина живе в constants/nav.ts: її читають і хуки компонування, а імпорт
// звідси тягнув би в них i18n і AsyncStorage.
export { SIDEBAR_WIDTH } from '@/constants/nav';

const COLLAPSED_KEY = 'nav_collapsed_groups';

export function NavSidebar({ pathname, isDark }: { pathname: string; isDark: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr } = useI18n();
  const { user } = useAuth();

  // Вимкнені модулі — з акаунта (синхронізований 'ui_preferences'), а не з
  // цього пристрою: користувач вимкнув розділ на телефоні, і на планшеті його
  // теж немає. Дані модуля лишаються — ховається тільки вхід.
  const { disabledModules } = useUiModules();

  // «Адміністрування workspace» — лише адміну, у групі «Особисте» (та сама
  // умова й те саме місце, що на вебі — див. constants/nav.ts).
  const navGroups = useMemo(
    // menuNavGroups — без пунктів-вкладок «Фінансів» (бюджет, підписки,
    // рахунки): вони живуть на екрані Фінансів як вкладки (§2.3).
    () => menuNavGroups(visibleNavGroups(navGroupsFor(!!user?.isAdmin), disabledModules)),
    [user?.isAdmin, disabledModules],
  );

  const [collapsed, setCollapsed] = useState<readonly string[]>(DEFAULT_COLLAPSED_GROUP_IDS);

  // До першого читання показуємо ДЕФОЛТ, а не «все розгорнуто»: інакше сайдбар
  // на мить розгортався б на повну висоту й осідав — смикання при кожному
  // старті помітніше, ніж група, що з'явилась на кадр пізніше.
  useEffect(() => {
    loadData<string[]>(COLLAPSED_KEY, [...DEFAULT_COLLAPSED_GROUP_IDS])
      .then(setCollapsed)
      .catch(e => { if (__DEV__) console.warn('[nav] згорнуті групи не прочитались:', e); });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      void saveData(COLLAPSED_KEY, next).catch(e => {
        if (__DEV__) console.warn('[nav] згорнуті групи не збереглись:', e);
      });
      return next;
    });
  }, []);

  const c = {
    bg:       isDark ? '#0E0C1A' : '#F4F0FF',
    border:   isDark ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.14)',
    text:     isDark ? '#F0EEFF' : '#1A1433',
    sub:      isDark ? 'rgba(240,238,255,0.55)' : 'rgba(26,20,51,0.52)',
    accent:   isDark ? '#A78BFA' : '#7C3AED',
    activeBg: isDark ? 'rgba(167,139,250,0.14)' : 'rgba(124,58,237,0.10)',
  };

  return (
    <View
      style={[st.root, { width: SIDEBAR_WIDTH, backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + 14 }]}
      accessibilityRole="menu">
      <Text style={[st.brand, { color: c.accent }]}>Flowi</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {navGroups.map((group, gi) => {
          const hidden = isGroupCollapsed(group, collapsed, pathname);
          // Заголовок групи, яку можна згорнути, — кнопка; решта лишається
          // звичайним підписом, щоб не обіцяти дію, якої немає.
          const collapsible = Boolean(group.id);

          return (
            <View key={group.id ?? `g${gi}`} style={{ marginBottom: hidden ? 6 : 14 }}>
              {group.titleKey && (
                collapsible ? (
                  <TouchableOpacity
                    onPress={() => toggleGroup(group.id!)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !hidden }}
                    style={st.groupHead}>
                    <IconSymbol
                      name={hidden ? 'chevron.right' : 'chevron.down'}
                      size={13}
                      color={c.sub}
                    />
                    <Text style={[st.groupTitle, { color: c.sub, flex: 1, marginLeft: 4 }]}>
                      {String(tr[group.titleKey]).toUpperCase()}
                    </Text>
                    {/* Лічильник лише в згорнутому стані: коли пункти видно,
                        він переказував би те, що й так на екрані. */}
                    {hidden && (
                      <Text style={[st.groupCount, { color: c.sub }]}>{group.items.length}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={[st.groupTitle, { color: c.sub, paddingHorizontal: 10 }]}>
                    {String(tr[group.titleKey]).toUpperCase()}
                  </Text>
                )
              )}

              {!hidden && group.items.map(item => {
                const active = isNavItemActive(item, pathname);
                return (
                  <TouchableOpacity
                    key={item.route}
                    onPress={() => router.push(item.route as never)}
                    activeOpacity={0.7}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    style={[st.row, active && { backgroundColor: c.activeBg }]}>
                    <IconSymbol name={item.icon} size={19} color={active ? c.accent : c.sub} />
                    <Text
                      numberOfLines={1}
                      style={[st.label, { color: active ? c.accent : c.text, fontWeight: active ? '700' : '500' }]}>
                      {String(tr[item.labelKey])}
                    </Text>
                    {/* Непрочитані сповіщення — на пункті «Налаштування», звідки
                        ведуть і центр сповіщень, і їхні налаштування (§11). */}
                    {item.route === '/(tabs)/settings' && <NotificationBadge />}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>

      {/* Активні таймери — ПОЗА скролом, притиснуті до низу: зупинити таймер
          мусить бути можна з будь-якого розділу без прокрутки сайдбара.
          Картка сама ховається, коли таймерів немає. */}
      <View style={{ paddingBottom: insets.bottom + 10 }}>
        <ActiveTimersSidebarCard colors={c} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root:       { borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10 },
  brand:      { fontSize: 20, fontWeight: '800', paddingHorizontal: 10, marginBottom: 18 },
  // 32 — свідомо менше за 44: це заголовок, а не пункт призначення. Промах по
  // ньому нічого не ламає (розгорнулась зайва група), тож повний тач-таргет
  // тут коштував би рядків, заради яких усе й затівалося.
  groupHead:  { flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingHorizontal: 10, borderRadius: 8 },
  groupTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  groupCount: { fontSize: 10, fontWeight: '700', marginBottom: 6, opacity: 0.8 },
  // 44 — мінімальний тач-таргет за HIG; на планшеті промахуються частіше,
  // бо палець тягнеться через увесь екран.
  row:        { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  label:      { fontSize: 14, flex: 1 },
});
