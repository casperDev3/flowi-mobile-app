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
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import {
  getSidebarOverrides,
  setSidebarOverride,
  setSidebarOverrides,
  useNavSidebarMode,
  type SidebarOverrides,
} from '@/components/shared/sidebar-mode';
import type { NavItem } from '@/constants/nav';
import { ActiveTimersSidebarCard } from '@/components/time/ActiveTimersSidebarCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Layout } from '@/constants/tokens';
import { GlassBackdrop } from '@/components/ds/Glass';
import { fontFamily, moduleAccent, radius, type GlassAccent, type ModuleKey } from '@/constants/theme';
import { dsTokens, glassTokens } from '@/hooks/use-ds';
import { useReduceTransparency } from '@/hooks/use-reduce-transparency';
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

/**
 * Акцент пункту меню (DS v2.1): модуль → glass.moduleAccent. Пункти без
 * модуля — «Сьогодні», «Налаштування», адмінка — лавандові (бренд).
 */
const MODULE_TO_ACCENT_KEY: Partial<Record<string, ModuleKey>> = {
  tasks: 'tasks', projects: 'projects', meetings: 'calendar', time: 'time', notes: 'notes',
  integrations: 'integrations', finance: 'finance', budget: 'finance', subscriptions: 'finance',
  banks: 'finance', health: 'health', workouts: 'workouts', training: 'training', menu: 'menu',
  containers: 'containers', archive: 'archive', ideas: 'ideas', bugs: 'ideas',
};
export function navItemAccent(item: Pick<NavItem, 'module'>): GlassAccent {
  const key = item.module ? MODULE_TO_ACCENT_KEY[item.module] : undefined;
  return key ? moduleAccent[key] : 'lavender';
}
/** Вибір «рейка/повний» за класом вікна — локально, як і згорнуті групи. */
const MODE_KEY = 'nav_sidebar_mode';

/**
 * Omni (DS v2.2): `variant="drawer"` — той самий сайдбар у шухляді телефона
 * (components/shared/SidebarDrawer.tsx): завжди повний, без перемикача
 * «рейка/повний», зі своєю шириною й кнопкою «Закрити»; після переходу
 * шухляда закривається (`onNavigate`).
 */
export type NavSidebarProps = {
  pathname: string;
  isDark: boolean;
  variant?: 'docked' | 'drawer';
  /** Ширина шухляди (лише variant="drawer"). */
  width?: number;
  /** Після переходу на пункт (шухляда закривається). */
  onNavigate?: () => void;
  /** Кнопка «Закрити» у шапці шухляди. */
  onClose?: () => void;
};

export function NavSidebar({ pathname, isDark, variant = 'docked', width, onNavigate, onClose }: NavSidebarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr } = useI18n();
  const { user } = useAuth();
  const { sizeClass } = useResponsive();
  const mode = useNavSidebarMode(sizeClass);
  const drawer = variant === 'drawer';
  const rail = !drawer && mode === 'rail';
  const go = useCallback((route: string) => {
    router.push(route as never);
    onNavigate?.();
  }, [router, onNavigate]);
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

  // DS v2.1 (Liquid Glass): сайдбар — скло над mesh (GlassBackdrop + заливка
  // glass.surface + спекулярний обідок праворуч); у шухляді телефона —
  // суцільна surface.card. «Зменшити прозорість» → суцільна surface.card.
  // Активний пункт — Omni-pill (див. activeStyle нижче).
  const t = dsTokens(isDark);
  const g = glassTokens(isDark);
  const reduceTransparency = useReduceTransparency();
  const c = {
    bg:       reduceTransparency ? t.surface.card : g.surface,
    border:   t.border.hairline,
    text:     t.text.primary,
    sub:      t.text.secondary,
    accent:   t.text.primary,
  };
  // Omni (DS v2.2): активний пункт — суцільна чорна pill action.primary (у
  // темній — біла) з text.onAction, як активна вкладка розділу й таб-бару.
  // Акцент модуля лишається на іконці: тонований кружок (tint) з ink-іконкою
  // у неактивних пунктах; в активному кружок нейтральний поверх pill.
  const activeStyle = (_accent: GlassAccent) => ({
    backgroundColor: t.action.primary,
    ...(Platform.OS === 'ios' && !reduceTransparency
      ? { shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } }
      : null),
  });
  const activeIcon = (_accent: GlassAccent) => t.text.onAction;
  const activeText = (_accent: GlassAccent) => t.text.onAction;
  const iconChip = (accent: GlassAccent, active: boolean) => ({
    backgroundColor: active ? (isDark ? 'rgba(17,17,19,0.10)' : 'rgba(255,255,255,0.16)') : g.accent[accent].tint,
  });
  const idleIcon = (accent: GlassAccent) => g.accent[accent].ink;
  // Картка таймерів має власну підкладку — скло subtle, не pill активного пункту.
  const timerCardColors = {
    border: c.border, text: c.text, sub: c.sub, accent: g.accent[moduleAccent.time].ink,
    activeBg: reduceTransparency ? t.surface.subtle : g.surfaceSubtle,
  };
  const glassLayer = reduceTransparency ? null : (
    <>
      <GlassBackdrop />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />
      <View pointerEvents="none" style={[st.rimRight, { backgroundColor: isDark ? g.rim : g.rimShade }]} />
    </>
  );

  const toggleLabel = rail ? tr.navSidebarExpand : tr.navSidebarCollapse;
  const toggleButton = drawer ? (
    onClose ? (
      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={tr.close}
        hitSlop={4}
        style={st.iconBtn}>
        <IconSymbol name="xmark" size={16} color={c.sub} />
      </TouchableOpacity>
    ) : null
  ) : (
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
        style={[st.root, st.railRoot, { width: Layout.railWidth, backgroundColor: reduceTransparency ? c.bg : 'transparent', paddingTop: insets.top + 14 }]}
        accessibilityRole="menu">
        {glassLayer}
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
              <View key={group.id ?? `g${gi}`} style={[st.railGroup, gi > 0 && st.railGroupGap]}>
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
                  const accent = navItemAccent(item);
                  return (
                    <TouchableOpacity
                      key={item.route}
                      onPress={() => go(item.route)}
                      activeOpacity={0.7}
                      accessibilityRole="menuitem"
                      accessibilityLabel={String(tr[item.labelKey] ?? '')}
                      accessibilityState={{ selected: active }}
                      style={[st.railItem, active && activeStyle(accent)]}>
                      <View style={[st.railChip, active ? null : iconChip(accent, false)]}>
                        <IconSymbol name={item.icon} size={19} color={active ? activeIcon(accent) : idleIcon(accent)} />
                      </View>
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
              onPress={() => go('/(tabs)/time')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${tr.navTime}: ${activeTimers.length}`}
              style={[st.railItem, { backgroundColor: timerCardColors.activeBg }]}>
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
      style={[st.root, { width: drawer ? (width ?? SIDEBAR_WIDTH) : SIDEBAR_WIDTH, backgroundColor: reduceTransparency || drawer ? t.surface.card : 'transparent', paddingTop: insets.top + 14 }, drawer && { flex: 1 }]}
      accessibilityRole="menu">
      {drawer ? null : glassLayer}
      <View style={{flexDirection:'row',alignItems:'center',gap:10,marginBottom:12}}><Image source={require('@/assets/logo_app.png')} style={{width:34,height:34,borderRadius:Atlas.radius.medium}} accessible={false}/><Text style={[st.brand, { color: c.text, marginBottom:0, flex: 1 }]}>Flowi</Text>{toggleButton}</View>

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
                const accent = navItemAccent(item);
                return (
                  <TouchableOpacity
                    key={item.route}
                    onPress={() => go(item.route)}
                    activeOpacity={0.7}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    style={[st.row, active && activeStyle(accent)]}>
                    <View style={[st.rowChip, iconChip(accent, active)]}>
                      <IconSymbol name={item.icon} size={16} color={active ? activeIcon(accent) : idleIcon(accent)} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[st.label, { color: active ? activeText(accent) : c.text, fontFamily: active ? fontFamily.semibold : fontFamily.medium }]}>
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
        <ActiveTimersSidebarCard colors={timerCardColors} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root:       { paddingHorizontal: 12 },
  // Спекулярний обідок скла на правому краї сайдбара (межа зі вмістом).
  rimRight:   { position: 'absolute', top: 0, bottom: 0, right: 0, width: StyleSheet.hairlineWidth },
  brand:      { fontSize: 20, fontFamily: fontFamily.semibold, paddingHorizontal: 10, marginBottom: 18 },
  // 32 — свідомо менше за 44: це заголовок, а не пункт призначення. Промах по
  // ньому нічого не ламає (розгорнулась зайва група), тож повний тач-таргет
  // тут коштував би рядків, заради яких усе й затівалося.
  groupHead:  { flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingHorizontal: 10, borderRadius: Atlas.radius.small },
  groupTitle: { fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.6, marginBottom: 6 },
  groupCount: { fontSize: 11, fontFamily: fontFamily.semibold, marginBottom: 6, fontVariant: ['tabular-nums'] },
  // 44 — мінімальний тач-таргет за HIG; на планшеті промахуються частіше,
  // бо палець тягнеться через увесь екран.
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingLeft: 8, paddingRight: 14, borderRadius: radius.pill },
  // Omni: тонований кружок акценту модуля навколо іконки пункту.
  rowChip:    { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  railChip:   { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  label:      { fontSize: 14, flex: 1 },
  // ── Рейка ──
  railRoot:   { paddingHorizontal: 0, alignItems: 'center' },
  railLogo:   { width: 34, height: 34, borderRadius: Atlas.radius.medium, marginBottom: 6 },
  railGroup:  { alignItems: 'center', paddingVertical: 6, gap: 2, alignSelf: 'stretch' },
  railGroupGap: { marginTop: 6 },
  // 44×44 — мінімальний тач-таргет; у рейці підпису немає, тож площа кнопки —
  // єдине, у що цілиться палець.
  iconBtn:    { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  railItem:   { width: 52, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  railBadge:  { position: 'absolute', top: 10, right: 12 },
  railCount:  { position: 'absolute', bottom: 4, fontSize: 9, fontFamily: fontFamily.bold, fontVariant: ['tabular-nums'] },
  // Крапка «поточний розділ усередині» на згорнутому заголовку групи.
  activeDot:  { width: 6, height: 6, borderRadius: 3, marginBottom: 6 },
  railActiveDot: { position: 'absolute', top: 9, right: 9, marginBottom: 0 },
  railTimerCount: { position: 'absolute', bottom: 3, right: 8, fontSize: 10, fontFamily: fontFamily.bold, fontVariant: ['tabular-nums'] },
});
