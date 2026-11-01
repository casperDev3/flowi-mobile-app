/**
 * components/shared/AppHeader.tsx — глобальна шапка Omni (DS v2.2).
 *
 * Будується НА ScreenHeader (верхній інсет у JS, стеля Dynamic Type для
 * заголовка, «Назад»/крихти) — лише додає Omni-набір кнопок:
 *
 *   Телефон (compact): рядок [☰ шухляда] ……… [пошук] [дії] [🔔] [аватар], під
 *     ним — великий заголовок (з «Назад», якщо є) і, навпроти нього праворуч,
 *     бургер меню розділу (`titleMenu`, 11.2026). Перемикачів режиму/вигляду
 *     в шапці телефона немає — вони пункти меню розділу.
 *     ☰ відкриває сайдбар-шухляду (SidebarDrawer) з усіма модулями;
 *     аватар — меню акаунта (AccountSheet).
 *   Планшет (не compact): рядок інструментів над заголовком —
 *     [пошук (якщо екран дав onSearch)] ……… [таймер] [дії] [🔔] [аватар + ім'я]
 *     сайдбар уже на екрані, тож ☰ немає; під рядком — заголовок сторінки
 *     (H1) і підзаголовок; KPI — праворуч від H1 (expanded) або рядком під ним.
 *
 * Скло: кнопки — нейтральні скляні кружки ScreenHeader (функціональний шар).
 * Ціль дотику кожної кнопки ≥ 44 (36 + HEADER_BUTTON_HIT_SLOP).
 */
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ds/AvatarStack';
import { PageHeader } from '@/components/ds/PageHeader';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { AccountSheet } from '@/components/shared/AccountSheet';
import { HEADER_BUTTON_HIT_SLOP, HeaderButton, ScreenHeader, type ScreenBack } from '@/components/shared/ScreenHeader';
import { SidebarDrawer } from '@/components/shared/SidebarDrawer';
import { TitleMenuButton, type TitleMenuConfig } from '@/components/shared/TitleMenu';
import { ViewModeSwitch } from '@/components/layout-zones/ViewModeSwitch';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';
import type { ZoneView } from '@/hooks/use-zone-state';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { useTimerContext } from '@/store/timer-context';

export type AppHeaderProps = {
  title: string;
  /** Рядок над заголовком (привітання на «Сьогодні»). */
  eyebrow?: React.ReactNode;
  /** Однорядковий підзаголовок під заголовком (Omni: «Welcome back…»). */
  subtitle?: string;
  /**
   * Додаткові кнопки в рядку інструментів (перед дзвіником), напр. SyncBadge.
   * Дії РОЗДІЛУ (колишнє «⋯», історія, налаштування розділу) — у `titleMenu`;
   * перемикачі режиму/вигляду сюди не ставимо (рішення власника 01.11.2026).
   */
  actions?: React.ReactNode;
  /**
   * Бургер (☰, 44×44) праворуч у рядку великого заголовка — меню дій розділу.
   * `items` — меню малює шапка (поповер на OverlaySurface); `onPress` —
   * відкрити наявне меню екрана. Див. components/shared/TitleMenu.tsx.
   */
  titleMenu?: TitleMenuConfig;
  /** Кнопка ☰ (шухляда сайдбара) на телефоні. За замовч. — так. */
  showMenu?: boolean;
  /** Поле пошуку в рядку інструментів планшета (лише якщо екран має пошук). */
  onSearch?: () => void;
  searchLabel?: string;
  back?: ScreenBack;
  titleStyle?: StyleProp<TextStyle>;
  /**
   * KPI-лічильники (<KpiCounter/> × 2–3). Телефон — горизонтальна стрічка під
   * заголовком; планшет у ландшафті (expanded) — праворуч від H1 у рядку
   * заголовка, як в Omni; medium — рядком під заголовком.
   */
  kpis?: React.ReactNode;
  /** Під заголовком: SectionTabs тощо. */
  children?: React.ReactNode;
  paddingBottom?: number;
  /**
   * Layout System v2.4: перемикач «Список / Колонки» розділу. Планшет —
   * у тонкій смузі інструментів поруч із пошуком (рішення 03); телефон —
   * не тут, а внизу шухляди ☰ (SidebarDrawer, через useZoneState).
   */
  viewSwitch?: { value: ZoneView; onChange: (v: ZoneView) => void };
};

function BellButton() {
  const { t } = useDS();
  const { tr } = useI18n();
  const router = useRouter();
  return (
    <HeaderButton onPress={() => router.push('/notifications' as Href)} accessibilityLabel={tr.notifications}>
      <IconSymbol name="bell" size={18} color={t.text.primary} />
      <NotificationBadge variant="dot" style={st.bellDot} />
    </HeaderButton>
  );
}

/** Активні таймери (планшет): pill з лічильником → «Час». Без таймерів — нічого. */
function TimerPill() {
  const { t, g } = useDS();
  const { tr } = useI18n();
  const router = useRouter();
  const { activeTimers } = useTimerContext();
  if (activeTimers.length === 0) return null;
  const a = g.accent.amber;
  return (
    <Pressable
      onPress={() => router.push('/(tabs)/time' as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${tr.activeTimers}: ${activeTimers.length}`}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      style={({ pressed }) => [st.timer, { backgroundColor: a.tint, opacity: pressed ? 0.7 : 1 }]}>
      <IconSymbol name="timer" size={16} color={a.ink} />
      <Text style={[st.timerText, { color: t.text.primary }]}>{activeTimers.length}</Text>
    </Pressable>
  );
}

export function AppHeader({
  title, eyebrow, subtitle, kpis, actions, showMenu = true, onSearch, searchLabel,
  back, titleStyle, children, paddingBottom, viewSwitch, titleMenu,
}: AppHeaderProps) {
  const { t, g, reduceTransparency } = useDS();
  const { tr } = useI18n();
  const { user } = useAuth();
  const { isCompact, isExpanded } = useResponsive();
  const insets = useSafeAreaInsets();
  // Поля ScreenHeader (20 + бічний інсет) — стрічка KPI на телефоні їде від краю до краю.
  const sidePad = 20 + Math.max(insets.left, insets.right);
  // KPI праворуч від H1 — лише коли САМА шапка досить широка. Вікно тут
  // не мірило: на iPad-портреті й у колонці поруч із панеллю деталей
  // (Фінанси, Завдання) три великі числа стискали H1 до «Неділя, 1 листопа…»
  // або витісняли його зовсім. Вужча шапка — KPI рядком під H1.
  const [headerW, setHeaderW] = useState(0);
  const kpisInRow = !isCompact && isExpanded && headerW >= KPI_ROW_MIN_WIDTH;
  const [drawer, setDrawer] = useState(false);
  const [account, setAccount] = useState(false);
  const displayName = user ? (user.name || user.email) : tr.settingsHub.profileGuest;

  const avatarButton = (withName: boolean) => (
    <Pressable
      onPress={() => setAccount(true)}
      accessibilityRole="button"
      accessibilityLabel={`${tr.accountManage}: ${displayName}`}
      hitSlop={HEADER_BUTTON_HIT_SLOP}
      style={({ pressed }) => [
        withName ? st.accountPill : null,
        withName ? { backgroundColor: reduceTransparency ? t.surface.card : g.surfaceStrong, borderColor: g.rim } : null,
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      {user ? (
        <Avatar person={{ id: user.id, name: displayName }} size={36} ringColor="transparent" />
      ) : (
        <View style={[st.guest, { backgroundColor: t.surface.subtle }]}>
          <IconSymbol name="person.fill" size={16} color={t.text.secondary} />
        </View>
      )}
      {withName ? (
        <>
          <Text numberOfLines={1} style={[st.accountName, { color: t.text.primary }]}>{displayName}</Text>
          <IconSymbol name="chevron.down" size={12} color={t.text.secondary} />
        </>
      ) : null}
    </Pressable>
  );

  const sheets = (
    <>
      <AccountSheet visible={account} onClose={() => setAccount(false)} />
      {isCompact ? <SidebarDrawer visible={drawer} onClose={() => setDrawer(false)} /> : null}
    </>
  );

  const kpiBlock = kpis && !kpisInRow ? <PageHeader kpis={kpis} bleed={isCompact ? sidePad : 0} /> : null;
  const titleMenuButton = titleMenu ? <TitleMenuButton menu={titleMenu} title={title} /> : null;

  const below = (subtitle || children || kpiBlock) ? (
    <View style={{ gap: 16 }}>
      {subtitle ? <Text numberOfLines={2} style={[st.subtitle, { color: t.text.secondary }]}>{subtitle}</Text> : null}
      {kpiBlock}
      {children}
    </View>
  ) : null;

  if (isCompact) {
    /*
     * Телефон — два рядки, як рядок інструментів Omni на планшеті:
     *   [☰] ……………… [дії] [🔔] [аватар]
     *   [‹] Великий заголовок (на всю ширину)
     * В одному рядку з 4–5 кнопками заголовок лишався з ~90pt і різався
     * до «Кале…»/«Здоро…» навіть на 390pt.
     */
    const compactToolbar = (
      <View style={st.toolbar}>
        {showMenu && !back ? (
          <HeaderButton onPress={() => setDrawer(true)} accessibilityLabel={tr.navSidebarExpand}>
            <IconSymbol name="sidebar.left" size={18} color={t.text.primary} />
          </HeaderButton>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={st.toolbarRight}>
          {/* Layout System v2.4: телефон — [☰] заголовок [пошук]. */}
          {onSearch ? (
            <HeaderButton onPress={onSearch} accessibilityLabel={searchLabel ?? tr.searchPlaceholder}>
              <IconSymbol name="magnifyingglass" size={18} color={t.text.primary} />
            </HeaderButton>
          ) : null}
          {actions}
          <BellButton />
          {avatarButton(false)}
        </View>
      </View>
    );
    return (
      <>
        <ScreenHeader
          title={title}
          color={t.text.primary}
          eyebrow={eyebrow}
          back={back}
          titleStyle={titleStyle}
          paddingBottom={paddingBottom}
          toolbar={compactToolbar}
          actions={titleMenuButton ?? undefined}>
          {below}
        </ScreenHeader>
        {sheets}
      </>
    );
  }

  // Вузька головна зона (iPad у портреті з відкритою панеллю деталей): рядок
  // інструментів не переноситься, тож спершу ховаємо ім'я в акаунт-пілюлі,
  // далі — підписи перемикача Список/Колонки (лишаються іконки з a11y-підписами).
  // Інакше пілюля вилазила під панель деталей.
  const roomyToolbar = headerW === 0 || headerW >= 640;
  const tightToolbar = headerW > 0 && headerW < 480;
  const toolbar = (
    <View style={st.toolbar}>
      {onSearch ? (
        <Pressable
          onPress={onSearch}
          accessibilityRole="search"
          accessibilityLabel={searchLabel ?? tr.searchPlaceholder}
          style={({ pressed }) => [
            st.search,
            { backgroundColor: reduceTransparency ? t.surface.card : g.surfaceStrong, borderColor: g.rim, opacity: pressed ? 0.8 : 1 },
          ]}>
          <IconSymbol name="magnifyingglass" size={16} color={t.text.secondary} />
          <Text numberOfLines={1} style={[st.searchText, { color: t.text.secondary }]}>{searchLabel ?? tr.searchPlaceholder}</Text>
        </Pressable>
      ) : <View style={{ flex: 1 }} />}
      {viewSwitch ? (
        <ViewModeSwitch value={viewSwitch.value} onChange={viewSwitch.onChange} compact={tightToolbar} testID="header-view-switch" />
      ) : null}
      <View style={st.toolbarRight}>
        <TimerPill />
        {actions}
        <BellButton />
        {avatarButton(roomyToolbar)}
      </View>
    </View>
  );

  return (
    <>
      <View onLayout={e => setHeaderW(Math.round(e.nativeEvent.layout.width))}>
      <ScreenHeader
        title={title}
        color={t.text.primary}
        eyebrow={eyebrow}
        back={back}
        titleStyle={titleStyle}
        paddingBottom={paddingBottom}
        toolbar={toolbar}
        actions={(kpisInRow && kpis) || titleMenuButton ? (
          <View style={st.titleRight}>
            {kpisInRow && kpis ? <View style={st.kpiRow}>{kpis}</View> : null}
            {titleMenuButton}
          </View>
        ) : undefined}>
        {below}
      </ScreenHeader>
      </View>
      {sheets}
    </>
  );
}

/** Ширина шапки, з якої KPI стають праворуч від H1 (H1 ~260 + 3 KPI ~560). */
const KPI_ROW_MIN_WIDTH = 860;

const st = StyleSheet.create({
  // Лічильники — підпис під числом (KpiCounter), тож вирівнювання по верху.
  kpiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 28 },
  titleRight: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bellDot: { position: 'absolute', top: 8, right: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  search: {
    flex: 1, maxWidth: 360, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  searchText: { flex: 1, fontSize: 14, fontFamily: fontFamily.regular },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.pill },
  timerText: { fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  accountPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 4, paddingRight: 12,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, maxWidth: 220,
  },
  accountName: { fontSize: 13, fontFamily: fontFamily.semibold, flexShrink: 1 },
  guest: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, fontFamily: fontFamily.regular },
});
