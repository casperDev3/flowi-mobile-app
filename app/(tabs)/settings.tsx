import { Atlas } from '@/constants/atlas';
import { brandMark } from '@/constants/brand';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { OverlayScrim } from '@/components/ds/OverlaySurface';
import { AdvertisingSettings } from '@/components/advertising/Advertising';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { NotificationBadge } from '@/components/notifications/NotificationBadge';
import { MODULE_SETTINGS_ROUTE, disabledModuleCount, type ModuleId } from '@/constants/nav';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useAppMode } from '@/store/app-mode';
import { UnsyncedOutboxError, useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { pullAllFromServer, pushAllToServer, useSync } from '@/store/sync-engine';
import { getAllScheduledNotifications } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { ThemeOption, useTheme } from '@/store/theme-context';
import { isModuleEnabled, useUiModules } from '@/store/ui-preferences';
import { usePinnedSections } from '@/components/shared/pinned-sections';
import { useSidebarStrings } from '@/components/shared/sidebar-strings';
import { Lang, type Translations } from '@/store/translations';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { wideModalStyles } from '@/components/finance/wideModal';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { ProfileCard } from '@/components/settings/ProfileCard';
import { ToolTiles } from '@/components/settings/ToolTiles';
import { settingsColumnCount, settingsSectionLayout, type SettingsSectionId } from '@/components/settings/model';
import { fontFamily, type GlassAccent } from '@/constants/theme';
import { BentoCard, BentoCardHeader, KpiCounter, MeshBackground } from '@/components/ds';
// Верхній інсет рахує ScreenHeader усередині AppHeader (useTopInset у JS).
import { AppHeader } from '@/components/shared/AppHeader';
import { useHeaderScroll } from '@/hooks/use-header-scroll';
import { useUnreadNotificationsCount } from '@/components/notifications/use-notification-center';
import { glassOf, glassRimFor } from '@/components/shared/dsTheme';

/**
 * Натискання рядка йде через один спільний колбек, а маршрут приходить
 * аргументом. Інакше кожен рядок отримував би свіжу інлайн-стрілку на кожному
 * рендері, і React.memo нижче не рятувала б від перерендеру всього списку.
 */
type RowPress = (route?: Href) => void;

/**
 * «Інструменти» — входи в Stack-екрани модулів. Кожен рядок знає свій модуль:
 * вимкнений модуль ховає вхід (сам екран за прямим посиланням показує
 * заглушку — ModuleGate у app/_layout.tsx).
 */
const TOOL_ROWS: readonly {
  route: Href;
  icon: IconSymbolName;
  iconColor: string;
  labelKey: keyof Translations;
  module: ModuleId;
}[] = [
  // `as never`: типи маршрутів згенеруються з новим /calendar лише на `expo start`.
  { route: '/calendar' as never, icon: 'calendar',         iconColor: '#6D4CF5', labelKey: 'calendar',         module: 'meetings' },
  { route: '/menu',          icon: 'fork.knife',       iconColor: '#F6B93B', labelKey: 'menuNavLabel',     module: 'menu' },
  { route: '/(tabs)/time',   icon: 'timer',            iconColor: '#6D4CF5', labelKey: 'navTimeTracker',   module: 'time' },
  { route: '/budget',        icon: 'chart.pie.fill',   iconColor: '#4F7CF7', labelKey: 'navBudget',        module: 'budget' },
  { route: '/subscriptions', icon: 'repeat',           iconColor: '#6D4CF5', labelKey: 'navSubscriptions', module: 'subscriptions' },
  { route: '/containers',    icon: 'shippingbox.fill', iconColor: '#F6B93B', labelKey: 'containers',       module: 'containers' },
];

export default function SettingsScreen() {
  const contentWidth = useContentWidth();
  // NAT-01: стеля аркуша — ЧИСЛО від висоти вікна; відсоток від батька з
  // height:auto у Yoga не резолвиться і обмеження просто зникає.
  const sheetSurface = useSheetSurface();
  const tabBarInset = useTabBarInset();
  const headerScroll = useHeaderScroll();
  const { isWide, isExpanded } = useResponsive();
  // Тема й мова — діалогом посеред екрана на планшеті (як SheetModal), а не
  // смугою на всю ширину, притиснутою до низу.
  const wm = wideModalStyles(isWide);
  // DS v2: `tk` (а не `t`) — `t` уже зайнятий у колбеках вибору теми.
  const { t: tk, isDark } = useDSTheme();
  useScreenView('settings');
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { lang, setLang, tr } = useI18n();
  const { online } = useAppMode();
  const { user, status, logout } = useAuth();
  const { syncNow, state: syncState, lastSyncAt, pendingCount } = useSync();
  // Лічильник біля рядка «Модулі інтерфейсу»: скільки розділів зараз
  // приховано. Без нього вимкнений місяць тому модуль просто «зник».
  // Рахується з moduleSections() (disabledModuleCount): у збереженому списку
  // бувають модулі без перемикача на цій платформі, і лічильник «2» при
  // жодному вимкненому перемикачі читався б як збій.
  const { disabledModules } = useUiModules();
  const sidebarStr = useSidebarStrings();
  const { pinned: pinnedSections } = usePinnedSections();
  const unreadCount = useUnreadNotificationsCount();
  const disabledCount = useMemo(() => disabledModuleCount(disabledModules), [disabledModules]);
  const visibleTools = useMemo(
    () => TOOL_ROWS.filter(tool => isModuleEnabled(disabledModules, tool.module)),
    [disabledModules],
  );

  const [taskReminders, setTaskReminders] = useState(true);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  // «Завантажити все на сервер / з сервера» — рідкісні важкі дії; сховані під
  // одним розкривним рядком біля «Управління даними», щоб не захаращувати «Дані».
  const [showTransfer, setShowTransfer] = useState(false);
  const toggleTransfer = useCallback(() => setShowTransfer(v => !v), []);

  useFocusEffect(useCallback(() => {
    getAllScheduledNotifications().then(list => {
      setScheduledCount(list.length);
    });
    loadData<boolean>('pref_task_reminders', true).then(v => setTaskReminders(v));
  }, []));

  const handleTaskRemindersToggle = useCallback((val: boolean) => {
    setTaskReminders(val);
    saveData('pref_task_reminders', val);
  }, []);

  // Контракт §9.3: logout() сама пробує досинхронізувати непорожній outbox,
  // а якщо після спроби (чи взагалі без мережі) щось лишилось непровштовхнуте
  // — кидає UnsyncedOutboxError замість мовчки стерти. Той самий патерн
  // «попередити → на «Продовжити» повторити з force», що й у зміні workspace
  // (app/account.tsx, app/workspace.tsx).
  const runLogout = useCallback((force: boolean, allDevices = false) => {
    logout(force, allDevices).catch(e => {
      if (e instanceof UnsyncedOutboxError) {
        Alert.alert(tr.workspaceSwitchSyncFailedTitle, tr.workspaceSwitchSyncFailedMsg, [
          { text: tr.cancel, style: 'cancel' },
          // Замикання того самого `runLogout`: до моменту натискання кнопки
          // ця const уже присвоєна (виклик асинхронний, синхронне
          // оголошення завершилось раніше).
          { text: tr.workspaceSwitchProceedAnyway, style: 'destructive', onPress: () => runLogout(true, allDevices) },
        ]);
        return;
      }
      Alert.alert(tr.authLogout, lang === 'en' ? 'Could not end sessions. Check your connection and retry.' : 'Не вдалося завершити сесії. Перевірте з’єднання та повторіть.');
    });
  }, [logout, tr, lang]);

  const handleLogout = useCallback((allDevices = false) => {
    // pendingCount — той самий лічильник, що й рядок «Синхронізація» нижче:
    // попереджаємо про непровштовхнуті зміни ДО підтвердження, а не лише
    // постфактум у діалозі помилки синку.
    const message = pendingCount > 0
      ? `${tr.workspaceSwitchOutboxWarning}\n\n${tr.logoutConfirm}`
      : tr.logoutConfirm;
    Alert.alert(
      allDevices ? (lang === 'en' ? 'Sign out all devices' : 'Вийти з усіх пристроїв') : tr.authLogout,
      message,
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.authLogout, style: 'destructive', onPress: () => runLogout(false, allDevices) },
      ],
    );
  }, [tr, runLogout, pendingCount, lang]);

  // Гейт для ручних синк-дій: потрібні онлайн-режим і акаунт.
  const guardSync = useCallback((fn: () => void | Promise<void>) => {
    if (!online || status !== 'authed') {
      Alert.alert(tr.syncNeedsOnlineAuth);
      return;
    }
    void fn();
  }, [online, status, tr]);

  // ── Стабільні дії рядків ───────────────────────────────────────────────────
  const go = useCallback<RowPress>(route => {
    if (route) router.push(route);
  }, [router]);

  const openThemeModal = useCallback(() => setShowThemeModal(true), []);
  const openLangModal = useCallback(() => setShowLangModal(true), []);
  const closeThemeModal = useCallback(() => setShowThemeModal(false), []);
  const closeLangModal = useCallback(() => setShowLangModal(false), []);

  const handleSyncNow = useCallback(() => guardSync(() => syncNow()), [guardSync, syncNow]);

  const handlePushAll = useCallback(() => guardSync(() => {
    Alert.alert(tr.syncPushAll, tr.syncPushAllMsg, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.yes, onPress: () => void pushAllToServer() },
    ]);
  }), [guardSync, tr]);

  const handlePullAll = useCallback(() => guardSync(() => {
    Alert.alert(tr.syncPullAll, tr.syncPullAllMsg, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.yes, onPress: () => void pullAllFromServer() },
    ]);
  }), [guardSync, tr]);

  const handleInDevelopment = useCallback(() => {
    Alert.alert(tr.inDevelopment, tr.inDevelopmentMsg);
  }, [tr]);

  // Палітра — у useMemo: інакше кожен рендер створює новий об'єкт, і всі
  // рядки-нащадки під React.memo однаково перемальовуються.
  // DS v2: нейтральна палітра (canvas / surface.card / text.*); вибраний пункт — text.primary + галочка.
  const c = useMemo(() => ({
    bg1:    tk.bg.canvas,
    bg2:    tk.bg.canvas,
    border: tk.border.hairline,
    text:   tk.text.primary,
    sub:    tk.text.secondary,
    // DS v2.1: вибраний пункт — lavender ink (акцент «Налаштувань»).
    accent: glassOf(tk).accent.lavender.ink,
    sheet:  glassOf(tk).sheet,
  }), [tk]);

  const THEME_LABELS: Record<ThemeOption, string> = useMemo(
    () => ({ system: tr.themeSystem, light: tr.themeLight, dark: tr.themeDark }),
    [tr],
  );
  const LANG_LABELS: Record<Lang, string> = useMemo(
    () => ({ uk: tr.langUk, en: tr.langEn }),
    [tr],
  );

  // ── Динамічне значення рядку Синхронізації ──────────────────────────────────
  const syncValue = useMemo(() => {
    if (!online) return tr.offlineBadge;
    // I18N-09: slice(0,18) різав посеред слова в обох мовах і не знав ні
    // про ширину екрана, ні про розмір шрифту. Ріже RN по ширині — нижче.
    if (status !== 'authed') return tr.syncGuestHint;
    if (syncState === 'error') return tr.syncError;
    if (pendingCount > 0) return `${pendingCount} ${tr.syncPending}`;
    if (lastSyncAt) {
      const diff = Date.now() - lastSyncAt;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return lang === 'uk' ? 'щойно' : 'just now';
      if (mins < 60) return lang === 'uk' ? `${mins}хв тому` : `${mins}min ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return lang === 'uk' ? `${hrs}год тому` : `${hrs}hr ago`;
      return new Date(lastSyncAt).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: '2-digit', month: '2-digit' });
    }
    return undefined;
  }, [online, status, syncState, pendingCount, lastSyncAt, lang, tr]);

  const authed = status === 'authed' && !!user;
  const openTool = useCallback((key: string) => {
    const tool = TOOL_ROWS.find(t => t.module === key);
    if (tool) router.push(tool.route);
  }, [router]);
  const tiles = useMemo(
    () => visibleTools.map(tool => ({
      key: tool.module, icon: tool.icon, iconColor: tool.iconColor, label: String(tr[tool.labelKey]),
    })),
    [visibleTools, tr],
  );
  const goAccount = useCallback(() => router.push('/account'), [router]);
  const goLogin = useCallback(() => router.push('/login'), [router]);
  const goRegister = useCallback(() => router.push('/register'), [router]);


  // ── Секції (порядок — components/settings/model.ts) ────────────────────────
  const renderSection = (id: SettingsSectionId): React.ReactNode => {
    switch (id) {
      case 'look':
        return (
          <View>
            <SettingsCard title={tr.settingsHub.sectionLookNotify} icon="paintbrush" accent="lavender">
              <SettingRow
                icon="paintbrush"
                iconColor="#6D4CF5"
                label={tr.theme}
                value={THEME_LABELS[theme]}
                onPress={openThemeModal}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="globe"
                iconColor="#4F7CF7"
                label={tr.language}
                value={LANG_LABELS[lang]}
                onPress={openLangModal}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              {/* Модулі стоять у «Вигляді», а не в «Даних», свідомо:
                  вимкнення нічого не видаляє — воно змінює те, що видно. */}
              <SettingRow
                icon="square.grid.2x2"
                iconColor="#22A55B"
                label={tr.modulesSettingsRow}
                value={disabledCount ? String(disabledCount) : undefined}
                route={MODULE_SETTINGS_ROUTE as Href}
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              {/* Закріплені розділи — лише планшет: на телефоні сайдбара немає
                  (шухляда ☰ лишається як є). */}
              {isWide ? (
                <SettingRow
                  icon="pin.fill"
                  iconColor="#8B5CF6"
                  label={sidebarStr.pinnedSettingsRow}
                  value={pinnedSections.length ? String(pinnedSections.length) : undefined}
                  route={'/settings-sidebar' as Href}
                  onPress={go}
                  text={c.text}
                  sub={c.sub}
                  border={c.border}
                  last={false}
                />
              ) : null}
              <NotifRow
                label={tr.notifications}
                scheduledCount={scheduledCount}
                route="/notifications"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                accent={c.accent}
                last={false}
              />
              <SettingRow
                icon="slider.horizontal.3"
                iconColor="#F6B93B"
                label={tr.ncSettingsTitle}
                route={'/settings-notifications' as Href}
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <ToggleRow
                icon="checklist"
                iconColor="#6D4CF5"
                label={tr.taskReminders}
                value={taskReminders}
                onChange={handleTaskRemindersToggle}
                text={c.text}
                border={c.border}
                last
              />
            </SettingsCard>
          </View>
        );
      case 'data':
        return (
          <View>
            <SettingsCard title={tr.sectionData} icon="externaldrive" accent="info">
              <SettingRow
                icon="arrow.triangle.2.circlepath"
                iconColor="#6D4CF5"
                label={tr.sync}
                value={syncValue}
                route="/sync"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="arrow.triangle.2.circlepath"
                iconColor="#22A55B"
                label={tr.syncNow}
                value={syncState === 'syncing' ? '…' : undefined}
                onPress={handleSyncNow}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              {/* Режим роботи — §2 плану: «офлайн» тепер лише тимчасова
                  відсутність мережі, не ручний вибір, тож перемикача немає —
                  лише поточний стан. */}
              <StatusRow
                icon={online ? 'wifi' : 'icloud.slash'}
                iconColor="#4F7CF7"
                label={`${tr.workMode}: ${online ? tr.modeOnline : tr.modeOffline}`}
                text={c.text}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="externaldrive"
                iconColor="#6D4CF5"
                label={tr.dataManagement}
                route="/data"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <DisclosureRow
                icon="arrow.up.arrow.down"
                iconColor="#4F7CF7"
                label={tr.settingsHub.serverTransfer}
                open={showTransfer}
                onToggle={toggleTransfer}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={!showTransfer}
              />
              {showTransfer && (
                <>
                  <SettingRow
                    icon="arrow.up.circle"
                    iconColor="#4F7CF7"
                    label={tr.syncPushAll}
                    onPress={handlePushAll}
                    text={c.text}
                    sub={c.sub}
                    border={c.border}
                    indent
                    last={false}
                  />
                  <SettingRow
                    icon="arrow.down.circle"
                    iconColor="#F6B93B"
                    label={tr.syncPullAll}
                    onPress={handlePullAll}
                    text={c.text}
                    sub={c.sub}
                    border={c.border}
                    indent
                    last
                  />
                </>
              )}
            </SettingsCard>
            {/* NAT-15: підпис мусить відповідати стану — інакше під «Онлайн»
                стояло б «дані лише на пристрої». */}
            <Text style={[st.hint, { color: c.sub }]}>
              {online ? tr.onlineDesc : tr.offlineDesc}
            </Text>
          </View>
        );
      case 'support':
        return (
          <View>
            <SettingsCard title={tr.sectionSupport} icon="lightbulb.fill" accent="amber">
              {/* Ідеї й баги — один екран (feedback-inbox.md §10.1). */}
              <SettingRow
                icon="lightbulb.fill"
                iconColor="#6D4CF5"
                label={tr.fbTitle}
                route={'/feedback' as Href}
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="paperplane.fill"
                iconColor="#4F7CF7"
                label={tr.sendFeedback}
                onPress={handleInDevelopment}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="star.fill"
                iconColor="#F6B93B"
                label={tr.rateApp}
                onPress={handleInDevelopment}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="heart.fill"
                iconColor="#E8543F"
                label={tr.donate}
                value="PayPal · Donatello"
                route="/donate"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last
              />
            </SettingsCard>
            <AdvertisingSettings />
            <BentoCard padded={false} style={st.sectionCard}>
              <SettingRow
                icon="person.fill"
                iconColor="#6D4CF5"
                label={tr.developer}
                value="Igor Lialiuk"
                route="/developer"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last
              />
            </BentoCard>
            {/* Правові посилання — рядком-футером під карткою розділу. */}
            <View style={st.links}>{[['privacy', lang === 'en' ? 'Privacy' : 'Приватність'], ['terms', lang === 'en' ? 'Terms' : 'Умови'], ['contact', lang === 'en' ? 'Contact' : 'Контакти']].map(([path, label]) => <TouchableOpacity key={path} accessibilityRole="link" onPress={() => void Linking.openURL(`https://flowi-web-app.vercel.app/${path}`)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: c.text }}>{label}</Text></TouchableOpacity>)}</View>
          </View>
        );
      case 'account':
        if (!user) return null;
        return (
          <View>
            <SettingsCard title={tr.sectionAccount} icon="person.crop.circle" accent="lavender">
              <SettingRow
                icon="person.crop.circle"
                iconColor="#6D4CF5"
                label={tr.accountManage}
                route="/account"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              {user.isAdmin && (
                <SettingRow
                  icon="person.badge.key.fill"
                  iconColor="#4F7CF7"
                  label={tr.settingsAdminWorkspace}
                  route="/admin-workspace"
                  onPress={go}
                  text={c.text}
                  sub={c.sub}
                  border={c.border}
                  last={false}
                />
              )}
              <TouchableOpacity accessibilityRole="button" onPress={() => handleLogout(true)} style={st.row}>
                <Text style={[st.rowLabel, { color: c.text }]}>{lang === 'en' ? 'Sign out all devices' : 'Вийти з усіх пристроїв'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleLogout()}
                accessibilityRole="button"
                accessibilityLabel={tr.authLogout}
                style={st.row}>
                <View style={[st.iconBox, { backgroundColor: tk.status.danger + '20' }]}>
                  <IconSymbol name="rectangle.portrait.and.arrow.right" size={18} color={tk.status.danger} />
                </View>
                <Text style={[st.rowLabel, { color: tk.status.danger, flex: 1 }]}>{tr.authLogout}</Text>
              </TouchableOpacity>
            </SettingsCard>
          </View>
        );
    }
  };

  // ─── KPI (Omni: великі тонкі числа в шапці) ────────────────────────────────
  // Лише те, що екран і так знає: непрочитані сповіщення (серверний інбокс),
  // заплановані нагадування ОС і кількість увімкнених інструментів. Тап —
  // туди, де ці числа живуть.
  const headerKpis = (
    <>
      {authed ? (
        <KpiCounter value={unreadCount} label={tr.ncTabInbox} onPress={() => go('/notifications')} />
      ) : null}
      <KpiCounter value={scheduledCount} label={tr.ncTabReminders} onPress={() => go({ pathname: '/notifications', params: { tab: 'reminders' } } as Href)} />
      <KpiCounter value={tiles.length} label={tr.navGroupTools} />
    </>
  );

  const sectionLayout = settingsSectionLayout(authed);
  const sectionEntries: MasonryEntry[] = sectionLayout.columns.map(id => ({
    key: id,
    // Відступ між картками в колонці — справа самих карток (MasonryColumns).
    node: <View style={st.sectionCell}>{renderSection(id)}</View>,
  }));

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />

      {/* Omni: глобальна шапка (☰ · дзвіник · акаунт; рядок інструментів на
          планшеті) з KPI. Верхній інсет дає ScreenHeader усередині AppHeader —
          а вміст ScrollView під нею фізично не заходить під статус-бар.
          Телефон (11.2026): нерухома лише смуга кнопок, заголовок і KPI —
          першим елементом прокрутки. */}
      <AppHeader title={tr.settings} kpis={headerKpis} paddingBottom={12} part="toolbar" scrolled={headerScroll.scrolled} />
      <View style={{ flex: 1 }}>
        <ScrollView
          // Ландшафт: дві колонки секцій у 720pt — це ~330pt на рядок, і
          // підписи обрізались. На expanded колонці даємо 960.
          contentContainerStyle={[contentWidth, isExpanded && st.wideColumn, { paddingHorizontal: 20, paddingTop: 4, paddingBottom: tabBarInset + 16 }]}
          showsVerticalScrollIndicator={false}
          onScroll={headerScroll.onScroll}
          scrollEventThrottle={16}>
          <AppHeader title={tr.settings} kpis={headerKpis} paddingBottom={12} part="body" insetX={20} />

          {/* 1. Профіль */}
          <ProfileCard
            user={authed ? user : null}
            online={online}
            isDark={isDark}
            colors={c}
            onManage={goAccount}
            onLogin={goLogin}
            onRegister={goRegister}
          />

          {/* 2. Інструменти — лише входи в УВІМКНЕНІ модулі; усе вимкнено — секції немає. */}
          {tiles.length ? (
            <View>
              <Text style={[st.sectionLabel, { color: c.text }]} accessibilityRole="header">{tr.navGroupTools}</Text>
              <ToolTiles tools={tiles} onPress={openTool} isDark={isDark} text={c.text} border={c.border} />
            </View>
          ) : null}

          {/* 3–6. Секції: телефон — одна колонка; планшет — масонрі у дві,
              без «дірок» сітки flexWrap 48%. */}
          <MasonryColumns items={sectionEntries} columnCount={settingsColumnCount(isWide)} columnGap={16} />

          {/* 6. Акаунт — завжди останній, на всю ширину (не в колонці масонрі). */}
          {sectionLayout.tail.map(id => (
            <View key={id} style={st.sectionCell}>{renderSection(id)}</View>
          ))}

          {/* App footer */}
          <View style={[st.footerCard, { opacity: 0.45 }]}>
            <Image
              source={brandMark(isDark)}
              style={st.footerLogo}
              resizeMode="contain"
            />
            <Text style={[st.footerName, { color: c.text }]}>Flowi</Text>
            <View style={[st.footerBadge, { backgroundColor: glassOf(tk).surfaceSubtle }]}>
              <Text style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>v0.0.1</Text>
            </View>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 8 }}>© 2026</Text>
          </View>
        </ScrollView>
      </View>

      {/* ─── Theme Modal ─── */}
      <Modal visible={showThemeModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeThemeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, wm.overlay]} onPress={closeThemeModal}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              style={[st.sheetWrapper, wm.column]}>
              <View style={[st.sheet, sheetSurface, { backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
                <OverlayMaterial isDark={isDark} />
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={closeThemeModal}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}>
                      <IconSymbol name="xmark" size={18} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.theme}</Text>
                {(['system', 'light', 'dark'] as ThemeOption[]).map((t, i, arr) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { setTheme(t); setShowThemeModal(false); }}
                    style={[st.optionRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                    <IconSymbol
                      name={t === 'system' ? 'circle.lefthalf.filled' : t === 'light' ? 'sun.max' : 'moon'}
                      size={20}
                      color={theme === t ? c.accent : c.sub}
                    />
                    <Text style={[st.optionLabel, { color: theme === t ? c.accent : c.text }]}>{THEME_LABELS[t]}</Text>
                    {theme === t && <IconSymbol name="checkmark" size={18} color={c.accent} />}
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Language Modal ─── */}
      <Modal visible={showLangModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeLangModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, wm.overlay]} onPress={closeLangModal}>
            {/* Layout System v2.4: затемнення + легкий блюр під «брудним склом» аркуша. */}
            <OverlayScrim />
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              style={[st.sheetWrapper, wm.column]}>
              <View style={[st.sheet, sheetSurface, { backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }]}>
                <OverlayMaterial isDark={isDark} />
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={closeLangModal}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}>
                      <IconSymbol name="xmark" size={18} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.language}</Text>
                {(['uk', 'en'] as Lang[]).map((l, i, arr) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => { setLang(l); setShowLangModal(false); }}
                    style={[st.optionRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
                    <Text style={{ fontSize: 20 }}>{l === 'uk' ? '🇺🇦' : '🇬🇧'}</Text>
                    <Text style={[st.optionLabel, { color: lang === l ? c.accent : c.text }]}>{LANG_LABELS[l]}</Text>
                    {lang === l && <IconSymbol name="checkmark" size={18} color={c.accent} />}
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

/**
 * Секція налаштувань — Omni bento-картка: шапка «icon-chip + назва» (акцент —
 * лише на icon-chip), під нею рядки з hairline-роздільниками. Суцільна
 * surface.card, без скла.
 */
function SettingsCard({ title, icon, accent, children }: {
  title: string;
  icon: IconSymbolName;
  accent: GlassAccent;
  children?: React.ReactNode;
}) {
  return (
    <BentoCard padded={false} style={st.sectionCard}>
      <View style={st.cardHead}>
        <BentoCardHeader title={title} icon={icon} accent={accent} />
      </View>
      {children}
    </BentoCard>
  );
}

interface SettingRowProps {
  icon: IconSymbolName;
  iconColor: string;
  label: string;
  value?: string;
  /** Маршрут переходу; порожній для рядків-дій. */
  route?: Href;
  onPress: RowPress;
  text: string;
  sub: string;
  border: string;
  last?: boolean;
  /** Вкладений рядок (під розкривним) — зсунутий праворуч. */
  indent?: boolean;
}

const SettingRow = React.memo(function SettingRow(
  { icon, iconColor, label, value, route, onPress, text, sub, border, last, indent }: SettingRowProps,
) {
  const handlePress = useCallback(() => onPress(route), [onPress, route]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.row, indent && st.rowIndent, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      {/* iPad portrait 2 колонки: довге значення («Синхронізовано 5 хв тому…»)
          раніше стискало підпис з flex:1 (basis 0) і «Синхронізація» ламалась
          посеред слова. Підпис тепер не стискається, обрізається значення. */}
      <Text style={[st.rowLabel, st.rowLabelFixed, { color: text }]}>{label}</Text>
      <View style={st.rowValueBox}>
        {value && (
          <Text style={[st.rowValue, { color: sub, flexShrink: 1 }]} numberOfLines={1} ellipsizeMode="tail">
            {value}
          </Text>
        )}
        <IconSymbol name="chevron.right" size={16} color={sub} />
      </View>
    </TouchableOpacity>
  );
});

interface ToggleRowProps {
  icon: IconSymbolName;
  iconColor: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  text: string;
  border: string;
  last?: boolean;
}

const ToggleRow = React.memo(function ToggleRow(
  { icon, iconColor, label, value, onChange, text, border, last }: ToggleRowProps,
) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      {/* A11Y-03: підпис і Switch — сусідні вузли, тож без імені друга зупинка
          VoiceOver звучала як «увімкнено, перемикач» без вказівки, ЩО саме.
          Ім'я вішаємо на сам Switch, а не на обгортку з accessible: обгортка
          склеїла б рядок в один елемент і сховала керований контрол (NAT-03). */}
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
        trackColor={{ false: 'rgba(128,128,128,0.3)', true: '#22A55B' }}
        thumbColor="#fff"
        ios_backgroundColor="rgba(128,128,128,0.3)"
      />
    </View>
  );
});

interface StatusRowProps {
  icon: IconSymbolName;
  iconColor: string;
  label: string;
  text: string;
  border: string;
  last?: boolean;
}

/**
 * Рядок стану без перемикача — §2 плану: «онлайн/офлайн» більше не ручний
 * вибір користувача (той сам вибирав собі персистентний офлайн-режим), а
 * лише поточний факт мережі, тож тут нема чого перемикати.
 */
const StatusRow = React.memo(function StatusRow(
  { icon, iconColor, label, text, border, last }: StatusRowProps,
) {
  return (
    <View style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
    </View>
  );
});

interface NotifRowProps {
  label: string;
  scheduledCount: number;
  route?: Href;
  onPress: RowPress;
  text: string;
  sub: string;
  border: string;
  accent: string;
  last?: boolean;
}

const NotifRow = React.memo(function NotifRow(
  { label, scheduledCount, route, onPress, text, sub, border, accent, last }: NotifRowProps,
) {
  const handlePress = useCallback(() => onPress(route), [onPress, route]);
  const onAccent = useDSTheme().t.text.onAction;
  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: '#F6B93B26' }]}>
        <IconSymbol name="bell.badge" size={18} color="#F6B93B" />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Непрочитані з серверного інбоксу (§11) — окремо від лічильника
            локально запланованих нагадувань праворуч. */}
        <NotificationBadge />
        {scheduledCount > 0 && (
          <View style={{ backgroundColor: accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: onAccent, fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{scheduledCount}</Text>
          </View>
        )}
        <IconSymbol name="chevron.right" size={16} color={sub} />
      </View>
    </TouchableOpacity>
  );
});

interface DisclosureRowProps {
  icon: IconSymbolName;
  iconColor: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  text: string;
  sub: string;
  border: string;
  last?: boolean;
}

/** Рядок-розкривач: показує/ховає вкладені рядки під собою. */
const DisclosureRow = React.memo(function DisclosureRow(
  { icon, iconColor, label, open, onToggle, text, sub, border, last }: DisclosureRowProps,
) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      style={[st.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={16} color={sub} />
    </TouchableOpacity>
  );
});

const st = StyleSheet.create({
  // DS v2: H1 32/500; підписи секцій — 12 secondary без капсу.
  // Omni: заголовок групи плиток — 16/600 (як назва bento-картки).
  sectionLabel:{ fontSize: 16, lineHeight: 22, fontFamily: fontFamily.semibold, marginBottom: 10, marginTop: 24, marginLeft: 4 },
  sectionCard: { marginTop: 16 },
  cardHead:    { paddingHorizontal: 16, paddingTop: 14, marginBottom: -4 },
  links:       { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, paddingHorizontal: 8, marginTop: 4 },
  // Нижній відступ секції — справа самої картки: MasonryColumns вертикальних
  // проміжків не додає.
  sectionCell: { paddingBottom: 4 },
  hint:        { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, paddingHorizontal: 4, marginTop: 6 },
  wideColumn:  { maxWidth: 960 },
  row:         { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  rowIndent:   { paddingLeft: 36 },
  iconBox:     { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { fontSize: 15, fontFamily: fontFamily.medium },
  rowValue:    { fontSize: 13, fontFamily: fontFamily.regular },
  // Підпис рядка займає вільне місце, але не стискається нижче власної
  // ширини — стискається (й обрізається «…») лише значення праворуч.
  rowLabelFixed: { flexGrow: 1, flexShrink: 0 },
  rowValueBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexShrink: 1, minWidth: 0 },
  footerCard:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, marginBottom: 8 },
  footerLogo:  { width: 26, height: 26 },
  footerName:  { fontSize: 15, fontFamily: fontFamily.semibold },
  footerBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  overlay:     { flex: 1, backgroundColor: 'transparent', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти приходить із useSheetSurface() на місці використання.
  sheet:       { borderRadius: Atlas.radius.xxlarge, padding: 24, overflow: 'hidden' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 18, fontFamily: fontFamily.semibold, marginBottom: 12 },
  optionRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: fontFamily.semibold },
});
