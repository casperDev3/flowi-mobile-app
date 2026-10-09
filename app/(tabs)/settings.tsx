import { Atlas } from '@/constants/atlas';
import { AdvertisingSettings } from '@/components/advertising/Advertising';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useAppMode } from '@/store/app-mode';
import { UnsyncedOutboxError, useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { pullAllFromServer, pushAllToServer, useSync } from '@/store/sync-engine';
import { getAllScheduledNotifications } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { ThemeOption, useTheme } from '@/store/theme-context';
import { isModuleEnabled, useUiModules } from '@/store/ui-preferences';
import { Lang, type Translations } from '@/store/translations';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { useTopInset } from '@/hooks/use-top-inset';
import { useResponsive } from '@/hooks/use-responsive';
import { wideModalStyles } from '@/components/finance/wideModal';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { ProfileCard } from '@/components/settings/ProfileCard';
import { ToolTiles } from '@/components/settings/ToolTiles';
import { settingsColumnCount, settingsSectionLayout, type SettingsSectionId } from '@/components/settings/model';

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
  { route: '/calendar' as never, icon: 'calendar',         iconColor: '#6366F1', labelKey: 'calendar',         module: 'meetings' },
  { route: '/menu',          icon: 'fork.knife',       iconColor: '#F59E0B', labelKey: 'menuNavLabel',     module: 'menu' },
  { route: '/(tabs)/time',   icon: 'timer',            iconColor: '#6366F1', labelKey: 'navTimeTracker',   module: 'time' },
  { route: '/budget',        icon: 'chart.pie.fill',   iconColor: '#0EA5E9', labelKey: 'navBudget',        module: 'budget' },
  { route: '/subscriptions', icon: 'repeat',           iconColor: '#8B5CF6', labelKey: 'navSubscriptions', module: 'subscriptions' },
  { route: '/containers',    icon: 'shippingbox.fill', iconColor: '#F97316', labelKey: 'containers',       module: 'containers' },
];

export default function SettingsScreen() {
  const contentWidth = useContentWidth();
  // NAT-01: стеля аркуша — ЧИСЛО від висоти вікна; відсоток від батька з
  // height:auto у Yoga не резолвиться і обмеження просто зникає.
  const sheetSurface = useSheetSurface();
  const topInset = useTopInset();
  const tabBarInset = useTabBarInset();
  const { isWide, isExpanded } = useResponsive();
  // Тема й мова — діалогом посеред екрана на планшеті (як SheetModal), а не
  // смугою на всю ширину, притиснутою до низу.
  const wm = wideModalStyles(isWide);
  const cs = useColorScheme();
  useScreenView('settings');
  const isDark = cs === 'dark';
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
  const runLogout = useCallback((force: boolean) => {
    logout(force).catch(e => {
      if (e instanceof UnsyncedOutboxError) {
        Alert.alert(tr.workspaceSwitchSyncFailedTitle, tr.workspaceSwitchSyncFailedMsg, [
          { text: tr.cancel, style: 'cancel' },
          // Замикання того самого `runLogout`: до моменту натискання кнопки
          // ця const уже присвоєна (виклик асинхронний, синхронне
          // оголошення завершилось раніше).
          { text: tr.workspaceSwitchProceedAnyway, style: 'destructive', onPress: () => runLogout(true) },
        ]);
        return;
      }
      if (__DEV__) console.warn('[settings] logout failed:', e);
    });
  }, [logout, tr]);

  const handleLogout = useCallback(() => {
    // pendingCount — той самий лічильник, що й рядок «Синхронізація» нижче:
    // попереджаємо про непровштовхнуті зміни ДО підтвердження, а не лише
    // постфактум у діалозі помилки синку.
    const message = pendingCount > 0
      ? `${tr.workspaceSwitchOutboxWarning}\n\n${tr.logoutConfirm}`
      : tr.logoutConfirm;
    Alert.alert(
      tr.authLogout,
      message,
      [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.authLogout, style: 'destructive', onPress: () => runLogout(false) },
      ],
    );
  }, [tr, runLogout, pendingCount]);

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
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  }), [isDark]);

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

  const blur = { intensity: isDark ? 20 : 40, tint: (isDark ? 'dark' : 'light') as 'dark' | 'light' };

  // ── Секції (порядок — components/settings/model.ts) ────────────────────────
  const renderSection = (id: SettingsSectionId): React.ReactNode => {
    switch (id) {
      case 'look':
        return (
          <View>
            <SectionLabel label={tr.settingsHub.sectionLookNotify} color={c.sub} />
            <BlurView {...blur} style={[st.card, { borderColor: c.border }]}>
              <SettingRow
                icon="paintbrush"
                iconColor="#8B5CF6"
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
                iconColor="#0EA5E9"
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
                iconColor="#10B981"
                label={tr.modulesSettingsRow}
                value={disabledCount ? String(disabledCount) : undefined}
                route={MODULE_SETTINGS_ROUTE as Href}
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
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
                iconColor="#F59E0B"
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
                iconColor="#7C3AED"
                label={tr.taskReminders}
                value={taskReminders}
                onChange={handleTaskRemindersToggle}
                text={c.text}
                border={c.border}
                last
              />
            </BlurView>
          </View>
        );
      case 'data':
        return (
          <View>
            <SectionLabel label={tr.sectionData} color={c.sub} />
            <BlurView {...blur} style={[st.card, { borderColor: c.border }]}>
              <SettingRow
                icon="arrow.triangle.2.circlepath"
                iconColor="#7C3AED"
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
                iconColor="#10B981"
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
                iconColor="#0EA5E9"
                label={`${tr.workMode}: ${online ? tr.modeOnline : tr.modeOffline}`}
                text={c.text}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="externaldrive"
                iconColor="#6366F1"
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
                iconColor="#0EA5E9"
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
                    iconColor="#0EA5E9"
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
                    iconColor="#F59E0B"
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
            </BlurView>
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
            <SectionLabel label={tr.sectionSupport} color={c.sub} />
            <BlurView {...blur} style={[st.card, { borderColor: c.border }]}>
              {/* Ідеї й баги — один екран (feedback-inbox.md §10.1). */}
              <SettingRow
                icon="lightbulb.fill"
                iconColor="#8B5CF6"
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
                iconColor="#0EA5E9"
                label={tr.sendFeedback}
                onPress={handleInDevelopment}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="star.fill"
                iconColor="#F59E0B"
                label={tr.rateApp}
                onPress={handleInDevelopment}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last={false}
              />
              <SettingRow
                icon="heart.fill"
                iconColor="#EF4444"
                label={tr.donate}
                value="PayPal · Donatello"
                route="/donate"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last
              />
            </BlurView>
            <AdvertisingSettings />
            <BlurView {...blur} style={[st.card, { borderColor: c.border }]}>
              <SettingRow
                icon="person.fill"
                iconColor="#7C3AED"
                label={tr.developer}
                value="Igor Lialiuk"
                route="/developer"
                onPress={go}
                text={c.text}
                sub={c.sub}
                border={c.border}
                last
              />
            </BlurView>
          </View>
        );
      case 'account':
        if (!user) return null;
        return (
          <View>
            <SectionLabel label={tr.sectionAccount} color={c.sub} />
            <BlurView {...blur} style={[st.card, { borderColor: c.border }]}>
              <SettingRow
                icon="person.crop.circle"
                iconColor="#7C3AED"
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
                  iconColor="#0EA5E9"
                  label={tr.settingsAdminWorkspace}
                  route="/admin-workspace"
                  onPress={go}
                  text={c.text}
                  sub={c.sub}
                  border={c.border}
                  last={false}
                />
              )}
              <TouchableOpacity
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel={tr.authLogout}
                style={st.row}>
                <View style={[st.iconBox, { backgroundColor: '#EF444420' }]}>
                  <IconSymbol name="rectangle.portrait.and.arrow.right" size={17} color="#EF4444" />
                </View>
                <Text style={[st.rowLabel, { color: '#EF4444', flex: 1 }]}>{tr.authLogout}</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        );
    }
  };

  const sectionLayout = settingsSectionLayout(authed);
  const sectionEntries: MasonryEntry[] = sectionLayout.columns.map(id => ({
    key: id,
    // Відступ між картками в колонці — справа самих карток (MasonryColumns).
    node: <View style={st.sectionCell}>{renderSection(id)}</View>,
  }));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      {/*
       * Інсет лягає на КОНТЕЙНЕР, а не в contentContainerStyle списку. Різниця
       * помітна при першому ж прокручуванні: padding усередині ScrollView
       * скролиться разом із вмістом, тож рядки налаштувань поїхали б під
       * статус-бар, де немає ні blur, ні підкладки — лише наскрізний градієнт.
       * Тут верхня межа самого ScrollView стоїть під статус-баром, і вміст
       * фізично не може під нього зайти.
       */}
      <View style={{ flex: 1, paddingTop: topInset }}>
        <ScrollView
          // Ландшафт: дві колонки секцій у 720pt — це ~330pt на рядок, і
          // підписи обрізались. На expanded колонці даємо 960.
          contentContainerStyle={[contentWidth, isExpanded && st.wideColumn, { paddingHorizontal: 20, paddingBottom: tabBarInset + 16 }]}
          showsVerticalScrollIndicator={false}>

          <View style={{ marginTop: 10, marginBottom: 20 }}>
            <Text style={[st.pageTitle, { color: c.text }]}>{tr.settings}</Text>
          </View>

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
              <SectionLabel label={tr.navGroupTools} color={c.sub} />
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
              source={require('@/assets/logo_app.png')}
              style={st.footerLogo}
              resizeMode="contain"
            />
            <Text style={[st.footerName, { color: c.text }]}>Flowi</Text>
            <View style={[st.footerBadge, { backgroundColor: c.accent + '18' }]}>
              <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>v0.0.1</Text>
            </View>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 8 }}>© 2026</Text>
          </View>
        </ScrollView>
      </View>

      {/* ─── Theme Modal ─── */}
      <Modal visible={showThemeModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeThemeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, wm.overlay]} onPress={closeThemeModal}>
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              style={[st.sheetWrapper, wm.column]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={closeThemeModal}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.theme}</Text>
                {(['system', 'light', 'dark'] as ThemeOption[]).map((t, i, arr) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => { setTheme(t); setShowThemeModal(false); }}
                    style={[st.optionRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    <IconSymbol
                      name={t === 'system' ? 'circle.lefthalf.filled' : t === 'light' ? 'sun.max' : 'moon'}
                      size={20}
                      color={theme === t ? c.accent : c.sub}
                    />
                    <Text style={[st.optionLabel, { color: theme === t ? c.accent : c.text }]}>{THEME_LABELS[t]}</Text>
                    {theme === t && <IconSymbol name="checkmark" size={18} color={c.accent} />}
                  </TouchableOpacity>
                ))}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Language Modal ─── */}
      <Modal visible={showLangModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeLangModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[st.overlay, wm.overlay]} onPress={closeLangModal}>
            <Pressable
              onPress={e => e.stopPropagation()}
              accessible={false}
              accessibilityViewIsModal
              style={[st.sheetWrapper, wm.column]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity
                      onPress={closeLangModal}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={tr.close}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={[st.sheetTitle, { color: c.text }]}>{tr.language}</Text>
                {(['uk', 'en'] as Lang[]).map((l, i, arr) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => { setLang(l); setShowLangModal(false); }}
                    style={[st.optionRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                    <Text style={{ fontSize: 20 }}>{l === 'uk' ? '🇺🇦' : '🇬🇧'}</Text>
                    <Text style={[st.optionLabel, { color: lang === l ? c.accent : c.text }]}>{LANG_LABELS[l]}</Text>
                    {lang === l && <IconSymbol name="checkmark" size={18} color={c.accent} />}
                  </TouchableOpacity>
                ))}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return <Text style={[st.sectionLabel, { color }]}>{label.toUpperCase()}</Text>;
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
      style={[st.row, indent && st.rowIndent, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={17} color={iconColor} />
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
    <View style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={17} color={iconColor} />
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
        trackColor={{ false: 'rgba(128,128,128,0.3)', true: '#7C3AED' }}
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
    <View style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={17} color={iconColor} />
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
  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: '#F59E0B20' }]}>
        <IconSymbol name="bell.badge" size={17} color="#F59E0B" />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {/* Непрочитані з серверного інбоксу (§11) — окремо від лічильника
            локально запланованих нагадувань праворуч. */}
        <NotificationBadge />
        {scheduledCount > 0 && (
          <View style={{ backgroundColor: accent, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: Atlas.type.headingWeight }}>{scheduledCount}</Text>
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
      style={[st.row, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <View style={[st.iconBox, { backgroundColor: iconColor + '20' }]}>
        <IconSymbol name={icon} size={17} color={iconColor} />
      </View>
      <Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
      <IconSymbol name={open ? 'chevron.up' : 'chevron.down'} size={16} color={sub} />
    </TouchableOpacity>
  );
});

const st = StyleSheet.create({
  pageTitle:   { fontSize: 34, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.8 },
  sectionLabel:{ fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8, marginTop: 20, marginLeft: 4 },
  // Нижній відступ секції — справа самої картки: MasonryColumns вертикальних
  // проміжків не додає.
  sectionCell: { paddingBottom: 4 },
  hint:        { fontSize: 11, lineHeight: 16, paddingHorizontal: 4, marginTop: 6 },
  wideColumn:  { maxWidth: 960 },
  card:        { borderRadius: Atlas.radius.xlarge, borderWidth: 1, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, gap: 12 },
  rowIndent:   { paddingLeft: 30 },
  iconBox:     { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowLabel:    { fontSize: 14, fontWeight: '500' },
  rowValue:    { fontSize: 13, fontWeight: '500' },
  // Підпис рядка займає вільне місце, але не стискається нижче власної
  // ширини — стискається (й обрізається «…») лише значення праворуч.
  rowLabelFixed: { flexGrow: 1, flexShrink: 0 },
  rowValueBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexShrink: 1, minWidth: 0 },
  footerCard:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28, marginBottom: 8 },
  footerLogo:  { width: 26, height: 26, borderRadius: 7 },
  footerName:  { fontSize: 15, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.3 },
  footerBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти приходить із useSheetSurface() на місці використання.
  sheet:       { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 18, fontWeight: Atlas.type.headingWeight, marginBottom: 12 },
  optionRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
});
