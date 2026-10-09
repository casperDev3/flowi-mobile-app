import { Atlas } from '@/constants/atlas';
import { Image } from 'expo-image';
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
 *
 * РЕЙКА (рішення 6). На medium (600–839, iPad у портреті) повний сайдбар
 * забирав 232pt із ~744 — третину екрана, і сітки карток падали в одну
 * колонку. Там за замовчуванням «рейка» 76pt: лише іконки (підпис — у
 * accessibilityLabel), заголовки груп — кнопки-шеврони. Кнопка вгорі
 * розгортає/згортає сайдбар; вибір запам'ятовується окремо для кожного класу
 * вікна (components/shared/sidebar-mode.ts — його ж читає useScreenWidth()).
 */
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import {
  getSidebarOverrides,
  setSidebarOverride,
  setSidebarOverrides,
  useNavSidebarMode,
  type SidebarOverrides,
} from '@/components/shared/sidebar-mode';
import { ActiveTimersSidebarCard } from '@/components/time/ActiveTimersSidebarCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Layout } from '@/constants/tokens';
import { useResponsive } from '@/hooks/use-responsive';
import { useTimerContext } from '@/store/timer-context';
import {
  DEFAULT_COLLAPSED_GROUP_IDS,
  SIDEBAR_WIDTH,
  groupHasActiveItem,
  isGroupCollapsed,
  isNavItemActive,
  menuNavGroups,
  navGroupsFor,
  sanitizeCollapsedGroupIds,
  toggleCollapsedGroupId,
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
/** Вибір «рейка/повний» за класом вікна — локально, як і згорнуті групи. */
const MODE_KEY = 'nav_sidebar_mode';

export function NavSidebar({ pathname, isDark }: { pathname: string; isDark: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr } = useI18n();
  const { user } = useAuth();
  const { sizeClass } = useResponsive();
  const mode = useNavSidebarMode(sizeClass);
  const rail = mode === 'rail';
  const { activeTimers } = useTimerContext();

  useEffect(() => {
    loadData<SidebarOverrides>(MODE_KEY, {})
      .then(saved => {
        // Те, що людина вже перемкнула до завершення читання, — свіжіше.
        setSidebarOverrides({ ...(saved ?? {}), ...getSidebarOverrides() });
      })
      .catch(e => { if (__DEV__) console.warn('[nav] режим сайдбара не прочитався:', e); });
  }, []);

  const toggleRail = useCallback(() => {
    const next = setSidebarOverride(sizeClass, rail ? 'full' : 'rail');
    void saveData(MODE_KEY, next).catch(e => {
      if (__DEV__) console.warn('[nav] режим сайдбара не зберігся:', e);
    });
  }, [sizeClass, rail]);

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
  // Писати лише після дії людини: інакше перше ж читання записувало б себе ж.
  const collapsedDirty = useRef(false);

  // До першого читання показуємо ДЕФОЛТ, а не «все розгорнуто»: інакше сайдбар
  // на мить розгортався б на повну висоту й осідав — смикання при кожному
  // старті помітніше, ніж група, що з'явилась на кадр пізніше.
  useEffect(() => {
    // Санітизація обов'язкова: у ключі бувало null / об'єкт / рядок, і
    // `.includes` на такому стані кидав TypeError у рендері й на тапі
    // «згорнути» (баг «Ще» на планшеті).
    loadData<unknown>(COLLAPSED_KEY, [...DEFAULT_COLLAPSED_GROUP_IDS])
      .then(raw => {
        // Людина встигла натиснути до кінця читання — її вибір свіжіший.
        if (!collapsedDirty.current) setCollapsed(sanitizeCollapsedGroupIds(raw));
      })
      .catch(e => { if (__DEV__) console.warn('[nav] згорнуті групи не прочитались:', e); });
  }, []);

  // Запис — ефектом, а не з апдейтера setState: апдейтер має бути чистим
  // (StrictMode викликає його двічі).
  useEffect(() => {
    if (!collapsedDirty.current) return;
    void saveData(COLLAPSED_KEY, collapsed).catch(e => {
      if (__DEV__) console.warn('[nav] згорнуті групи не збереглись:', e);
    });
  }, [collapsed]);

  const toggleGroup = useCallback((id: string | undefined) => {
    if (!id) return;
    collapsedDirty.current = true;
    setCollapsed(prev => toggleCollapsedGroupId(prev, id));
  }, []);

  const c = {
    bg:       isDark ? '#0E0C1A' : '#F4F0FF',
    border:   isDark ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.14)',
    text:     isDark ? '#F0EEFF' : '#1A1433',
    sub:      isDark ? 'rgba(240,238,255,0.55)' : 'rgba(26,20,51,0.52)',
    accent:   isDark ? '#A78BFA' : '#7C3AED',
    activeBg: isDark ? 'rgba(167,139,250,0.14)' : 'rgba(124,58,237,0.10)',
  };

  const toggleLabel = rail ? tr.navSidebarExpand : tr.navSidebarCollapse;
  const toggleButton = (
    <TouchableOpacity
      onPress={toggleRail}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={toggleLabel}
      accessibilityState={{ expanded: !rail }}
      hitSlop={4}
      style={st.iconBtn}>
      <IconSymbol name={rail ? 'chevron.right' : 'chevron.left'} size={16} color={c.sub} />
    </TouchableOpacity>
  );

  if (rail) {
    return (
      <View
        style={[st.root, st.railRoot, { width: Layout.railWidth, backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + 14 }]}
        accessibilityRole="menu">
        <Image source={require('@/assets/logo_app.png')} style={st.railLogo} accessible={false} />
        {toggleButton}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16, alignItems: 'center' }}>
          {navGroups.map((group, gi) => {
            const hidden = isGroupCollapsed(group, collapsed);
            const collapsible = Boolean(group.id);
            // Згорнута група з поточним розділом — крапка на шевроні, щоб було
            // видно, де ви, навіть коли пункт сховано.
            const activeInside = hidden && groupHasActiveItem(group, pathname);
            const groupTitle = group.titleKey ? String(tr[group.titleKey] ?? '') : '';
            return (
              <View key={group.id ?? `g${gi}`} style={[st.railGroup, gi > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                {collapsible && (
                  <TouchableOpacity
                    onPress={() => toggleGroup(group.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={groupTitle}
                    accessibilityState={{ expanded: !hidden, selected: activeInside }}
                    style={st.iconBtn}>
                    <IconSymbol name={hidden ? 'chevron.right' : 'chevron.down'} size={13} color={activeInside ? c.accent : c.sub} />
                    {hidden && <Text style={[st.railCount, { color: activeInside ? c.accent : c.sub }]}>{group.items.length}</Text>}
                    {activeInside && <View style={[st.activeDot, st.railActiveDot, { backgroundColor: c.accent }]} />}
                  </TouchableOpacity>
                )}
                {!hidden && group.items.map(item => {
                  const active = isNavItemActive(item, pathname);
                  return (
                    <TouchableOpacity
                      key={item.route}
                      onPress={() => router.push(item.route as never)}
                      activeOpacity={0.7}
                      accessibilityRole="menuitem"
                      accessibilityLabel={String(tr[item.labelKey] ?? '')}
                      accessibilityState={{ selected: active }}
                      style={[st.railItem, active && { backgroundColor: c.activeBg }]}>
                      <IconSymbol name={item.icon} size={21} color={active ? c.accent : c.sub} />
                      {item.route === '/(tabs)/settings' && (
                        <NotificationBadge variant="dot" style={st.railBadge} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
        {/* Повна картка таймерів у 76pt не влазить — лишаємо вхід у Трекер
            часу з лічильником, щоб зупинити таймер можна було звідусіль. */}
        {activeTimers.length > 0 && (
          <View style={{ paddingBottom: insets.bottom + 10, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/time' as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${tr.navTime}: ${activeTimers.length}`}
              style={[st.railItem, { backgroundColor: c.activeBg }]}>
              <IconSymbol name="timer" size={21} color={c.accent} />
              <Text style={[st.railTimerCount, { color: c.accent }]}>{activeTimers.length}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      style={[st.root, { width: SIDEBAR_WIDTH, backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + 14 }]}
      accessibilityRole="menu">
      <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:12}}><Image source={require('@/assets/logo_app.png')} style={{width:34,height:34,borderRadius:Atlas.radius.medium}} accessible={false}/><Text style={[st.brand, { color: c.accent, marginBottom:0, flex: 1 }]}>Flowi</Text>{toggleButton}</View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
        {navGroups.map((group, gi) => {
          const hidden = isGroupCollapsed(group, collapsed);
          // Заголовок групи, яку можна згорнути, — кнопка; решта лишається
          // звичайним підписом, щоб не обіцяти дію, якої немає.
          const collapsible = Boolean(group.id);
          const activeInside = hidden && groupHasActiveItem(group, pathname);
          const title = group.titleKey ? String(tr[group.titleKey] ?? '').toUpperCase() : '';

          return (
            <View key={group.id ?? `g${gi}`} style={{ marginBottom: hidden ? 6 : 14 }}>
              {group.titleKey && (
                collapsible ? (
                  <TouchableOpacity
                    onPress={() => toggleGroup(group.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !hidden, selected: activeInside }}
                    style={st.groupHead}>
                    <IconSymbol
                      name={hidden ? 'chevron.right' : 'chevron.down'}
                      size={13}
                      color={activeInside ? c.accent : c.sub}
                    />
                    <Text style={[st.groupTitle, { color: activeInside ? c.accent : c.sub, flex: 1, marginLeft: 4 }]}>
                      {title}
                    </Text>
                    {activeInside && <View style={[st.activeDot, { backgroundColor: c.accent, marginRight: 6 }]} />}
                    {/* Лічильник лише в згорнутому стані: коли пункти видно,
                        він переказував би те, що й так на екрані. */}
                    {hidden && (
                      <Text style={[st.groupCount, { color: c.sub }]}>{group.items.length}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Text style={[st.groupTitle, { color: c.sub, paddingHorizontal: 10 }]}>
                    {title}
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
                      {String(tr[item.labelKey] ?? '')}
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
  brand:      { fontSize: 20, fontWeight: Atlas.type.headingWeight, paddingHorizontal: 10, marginBottom: 18 },
  // 32 — свідомо менше за 44: це заголовок, а не пункт призначення. Промах по
  // ньому нічого не ламає (розгорнулась зайва група), тож повний тач-таргет
  // тут коштував би рядків, заради яких усе й затівалося.
  groupHead:  { flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingHorizontal: 10, borderRadius: Atlas.radius.small },
  groupTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  groupCount: { fontSize: 10, fontWeight: '700', marginBottom: 6, opacity: 0.8 },
  // 44 — мінімальний тач-таргет за HIG; на планшеті промахуються частіше,
  // бо палець тягнеться через увесь екран.
  row:        { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44, paddingHorizontal: 10, borderRadius: Atlas.radius.medium },
  label:      { fontSize: 14, flex: 1 },
  // ── Рейка ──
  railRoot:   { paddingHorizontal: 0, alignItems: 'center' },
  railLogo:   { width: 34, height: 34, borderRadius: Atlas.radius.medium, marginBottom: 6 },
  railGroup:  { alignItems: 'center', paddingVertical: 6, gap: 2, alignSelf: 'stretch' },
  // 44×44 — мінімальний тач-таргет; у рейці підпису немає, тож площа кнопки —
  // єдине, у що цілиться палець.
  iconBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Atlas.radius.medium },
  railItem:   { width: 52, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: Atlas.radius.medium },
  railBadge:  { position: 'absolute', top: 10, right: 12 },
  railCount:  { position: 'absolute', bottom: 4, fontSize: 9, fontWeight: '700' },
  // Крапка «поточний розділ усередині» на згорнутому заголовку групи.
  activeDot:  { width: 6, height: 6, borderRadius: 3, marginBottom: 6 },
  railActiveDot: { position: 'absolute', top: 9, right: 9, marginBottom: 0 },
  railTimerCount: { position: 'absolute', bottom: 3, right: 8, fontSize: 10, fontWeight: '800' },
});
